"""SPRPA ML service (FastAPI). Called only by the Express backend over REST.

Serves the three trained models in ./models (see models/MODEL_CARDS.md):
  POST /ml/volatility -> 10-day volatility forecast   (HistGradientBoostingRegressor)
  POST /ml/anomalies  -> anomaly dates, score, indicators (Isolation Forest, one per stock)
  POST /ml/sentiment  -> news sentiment in [-1, +1]   (fine-tuned DistilBERT)
  GET  /health        -> per-model status + model-card details

Models are loaded once at startup. A model that fails to load is reported as not connected
and its endpoint returns 503; no endpoint ever returns invented numbers.
"""
import importlib.util
import io
import math
import os
import re
import time
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import joblib
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

INTERNAL_KEY = os.getenv("ML_INTERNAL_KEY", "dev-internal-key")
MODEL_DIR = os.getenv("MODEL_DIR", os.path.join(os.path.dirname(__file__), "models"))
TD = 252

MODELS = [
    {"id": "volatility", "name": "Gradient boosting volatility", "endpoint": "/ml/volatility", "artifact": "volatility_model.joblib",
     "libraries": ["scikit-learn", "joblib"], "card": 1},
    {"id": "anomaly", "name": "Isolation Forest", "endpoint": "/ml/anomalies", "artifact": "anomaly_model.joblib",
     "libraries": ["scikit-learn", "joblib"], "card": 2},
    {"id": "sentiment", "name": "DistilBERT sentiment", "endpoint": "/ml/sentiment", "artifact": "sentiment_model.joblib",
     "libraries": ["torch", "transformers"], "card": 3},
]
PY_MODULE = {"scikit-learn": "sklearn", "joblib": "joblib", "torch": "torch", "transformers": "transformers"}
LOADED: dict[str, dict] = {}   # id -> joblib bundle
ERRORS: dict[str, str] = {}    # id -> load error
LOAD_MS: dict[str, int] = {}


def _load_sentiment(path):
    import torch
    # Saved on a CUDA machine; tensors inside are torch-serialised bytes, so map them to CPU while unpickling.
    orig = torch.storage._load_from_bytes
    torch.storage._load_from_bytes = lambda b: torch.load(io.BytesIO(b), map_location="cpu", weights_only=False)
    try:
        bundle = joblib.load(path)
    finally:
        torch.storage._load_from_bytes = orig
    bundle["model"].eval()
    return bundle


def load_models():
    for m in MODELS:
        path = os.path.join(MODEL_DIR, m["artifact"])
        t = time.time()
        try:
            with warnings.catch_warnings():  # joblib on numpy>=2.5 warns once per array while loading
                warnings.simplefilter("ignore", DeprecationWarning)
                LOADED[m["id"]] = _load_sentiment(path) if m["id"] == "sentiment" else joblib.load(path)
            ERRORS.pop(m["id"], None)
        except Exception as e:  # report, don't crash: other models can still serve
            ERRORS[m["id"]] = f"{type(e).__name__}: {str(e)[:200]}"
        LOAD_MS[m["id"]] = round((time.time() - t) * 1000)


def parse_cards(path):
    """MODEL_CARDS.md -> [{title, fields{item: detail}}] in file order."""
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return []
    cards = []
    for block in re.split(r"^## ", text, flags=re.M)[1:]:
        title = block.splitlines()[0].split(":", 1)[-1].strip()
        fields = {}
        for row in re.findall(r"^\|(.+)\|\s*$", block, flags=re.M):
            cells = [c.strip() for c in row.split("|")]
            if len(cells) == 2 and cells[0] not in ("Item",) and not set(cells[0]) <= set("-: "):
                fields[re.sub(r"\*", "", cells[0]).strip()] = re.sub(r"\*\*|`", "", cells[1]).strip()
        cards.append({"title": title, "fields": fields})
    return cards


@asynccontextmanager
async def lifespan(_app):
    load_models()
    yield


app = FastAPI(title="SPRPA ML service", version="1.0.0", lifespan=lifespan)


def internal_only(x_internal_key: str = Header(default="")):
    if x_internal_key != INTERNAL_KEY:
        raise HTTPException(401, {"code": "UNAUTHENTICATED", "message": "internal key required"})


def need(model_id):
    if model_id not in LOADED:
        raise HTTPException(503, {"code": "MODEL_UNAVAILABLE", "message": ERRORS.get(model_id, "model not loaded")})
    return LOADED[model_id]


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def version_of(bundle):
    return f"{bundle.get('created', '')[:10]}" or "unknown"


@app.get("/health")
def health():
    cards = parse_cards(os.path.join(MODEL_DIR, "MODEL_CARDS.md"))
    out = []
    for m in MODELS:
        libs = {lib: importlib.util.find_spec(PY_MODULE[lib]) is not None for lib in m["libraries"]}
        found = os.path.exists(os.path.join(MODEL_DIR, m["artifact"]))
        loaded = m["id"] in LOADED
        b = LOADED.get(m["id"], {})
        reason = ("Loaded and serving predictions" if loaded
                  else f"Library {', '.join(k for k, v in libs.items() if not v)} not installed" if not all(libs.values())
                  else f"Artifact models/{m['artifact']} not found" if not found
                  else ERRORS.get(m["id"], "Not loaded"))
        out.append({
            "id": m["id"], "name": m["name"], "endpoint": m["endpoint"], "artifact": m["artifact"],
            "connected": loaded, "reason": reason,
            "checks": {"libraries_installed": all(libs.values()), "artifact_found": found, "loaded": loaded},
            "libraries": libs,
            "size_mb": round(os.path.getsize(os.path.join(MODEL_DIR, m["artifact"])) / 2**20, 1) if found else None,
            "load_ms": LOAD_MS.get(m["id"]),
            "version": version_of(b) if loaded else None,
            "trained_with": b.get("versions"),
            "data_cutoff": b.get("data_cutoff"),
            "card": cards[m["card"] - 1] if len(cards) >= m["card"] else None,
        })
    return {"status": "ok", "models": out}


# ---------------- Output 1: 10-day volatility (gradient boosting) ----------------
class Bar(BaseModel):
    date: str
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float
    prev_close: float | None = None
    volume: float
    turnover: float | None = None
    trades: float | None = None


class Close(BaseModel):
    date: str
    close: float


class VolIn(BaseModel):
    symbol: str
    bars: list[Bar]
    market: list[Close]          # benchmark closes (NIFTY 50) for market_vol_5
    history_days: int = Field(120, ge=0, le=400)


def vol_features(bars, market):
    """Feature matrix for every bar with enough history. Vols are annualised %, return in %.
    range_vol_k: Parkinson (high-low) estimator; close_vol_k: std of daily log returns;
    market_vol_5: 5-day close vol of the benchmark; volume_ratio: volume / prior 20-day mean."""
    c = np.array([b.close for b in bars], float)
    h = np.array([b.high if b.high else b.close for b in bars], float)
    lo = np.array([b.low if b.low else b.close for b in bars], float)
    v = np.array([b.volume for b in bars], float)
    lr = np.r_[np.nan, np.diff(np.log(c))]
    pk = np.log(h / lo) ** 2 / (4 * math.log(2))
    mk = {m.date: m.close for m in market}
    mc = np.array([mk.get(b.date, np.nan) for b in bars], float)
    mlr = np.r_[np.nan, np.diff(np.log(mc))]
    ann = math.sqrt(TD) * 100
    rows, idx = [], []
    for t in range(66, len(bars)):
        mr = mlr[t - 4:t + 1]
        past_v = v[t - 20:t]
        if np.isnan(mr).any() or past_v.mean() <= 0:
            continue
        rows.append([
            math.sqrt(pk[t]) * ann,
            math.sqrt(pk[t - 4:t + 1].mean()) * ann,
            math.sqrt(pk[t - 21:t + 1].mean()) * ann,
            np.std(lr[t - 21:t + 1], ddof=1) * ann,
            np.std(lr[t - 65:t + 1], ddof=1) * ann,
            np.std(mr, ddof=1) * ann,
            v[t] / past_v.mean(),
            (c[t] / c[t - 1] - 1) * 100,
        ])
        idx.append(t)
    return np.array(rows), idx, lr


@app.post("/ml/volatility", dependencies=[Depends(internal_only)])
def volatility(body: VolIn):
    b = need("volatility")
    X, idx, lr = vol_features(body.bars, body.market)
    if not idx or idx[-1] != len(body.bars) - 1:
        raise HTTPException(422, {"code": "INSUFFICIENT_HISTORY", "message": "need at least 67 daily bars with aligned benchmark closes"})
    import pandas as pd
    pred = b["model"].predict(pd.DataFrame(X, columns=b["features"]))
    h = b["horizon_days"]
    hist, errs = [], []
    for k in range(max(0, len(idx) - body.history_days), len(idx)):
        t = idx[k]
        fwd = lr[t + 1:t + 1 + h]
        realized = float(np.std(fwd, ddof=1) * math.sqrt(TD) * 100) if len(fwd) == h else None
        if realized is not None:
            errs.append(pred[k] - realized)
        hist.append({"date": body.bars[t].date, "predicted": round(float(pred[k]), 2), "realized": None if realized is None else round(realized, 2)})
    last = dict(zip(b["features"], [round(float(x), 4) for x in X[-1]]))
    return {
        "symbol": body.symbol, "model": "HistGradientBoosting", "model_version": version_of(b), "dummy": False,
        "run_timestamp": now(), "horizon_days": h, "forecast_date": body.bars[-1].date, "data_cutoff": b.get("data_cutoff"),
        "history_window": {"start": body.bars[0].date, "end": body.bars[-1].date, "observations": len(body.bars)},
        "units": b.get("output", "annualised volatility, percent"),
        "forecast_pct": round(float(pred[-1]), 2),
        "baseline": {"name": "22-day realized volatility (annualised)", "value_pct": last["close_vol_22"]},
        "features": last,
        "history": hist,
        "evaluation": {"metric": "RMSE vs realized 10-day volatility (this stock, shown window)",
                       "value": round(float(np.sqrt(np.mean(np.square(errs)))), 2) if errs else None, "n": len(errs)},
    }


# ---------------- Output 2: Isolation Forest anomalies ----------------
class AnomalyIn(BaseModel):
    symbol: str
    bars: list[Bar]
    volume_window: int = Field(20, ge=5, le=120)


def std(a):
    if len(a) < 2:
        return 0.0
    m = sum(a) / len(a)
    return math.sqrt(sum((x - m) ** 2 for x in a) / (len(a) - 1))


def features(bars, window):
    """Daily_Return (fraction) and Volume_ZScore (past-only window) + display indicators."""
    rows = []
    for i, b in enumerate(bars):
        if i < window or not b.prev_close or b.volume <= 0:
            continue
        past = [x.volume for x in bars[i - window:i]]
        m, s = sum(past) / window, std(past)
        if s == 0:
            continue
        pc = b.prev_close
        rows.append({
            "date": b.date, "daily_return": b.close / pc - 1, "volume_zscore": (b.volume - m) / s,
            "intraday_range_pct": (b.high - b.low) / pc * 100 if b.high is not None and b.low is not None else None,
            "opening_gap_pct": (b.open - pc) / pc * 100 if b.open is not None else None,
            "turnover": b.turnover,
        })
    return rows


@app.post("/ml/anomalies", dependencies=[Depends(internal_only)])
def anomalies(body: AnomalyIn):
    b = need("anomaly")
    ticker = re.sub(r"\.(NS|BO)$", "", body.symbol.upper())
    model = b["models"].get(ticker)
    if model is None:
        raise HTTPException(422, {"code": "NO_MODEL_FOR_SYMBOL", "message": f"No trained anomaly model for {ticker} ({len(b['models'])} NSE stocks covered)"})
    rows = features(body.bars, body.volume_window)
    if len(rows) < 60:
        raise HTTPException(422, {"code": "INSUFFICIENT_HISTORY", "message": f"need at least 60 usable rows, got {len(rows)}"})
    import pandas as pd
    X = pd.DataFrame([[r["daily_return"], r["volume_zscore"]] for r in rows], columns=b["features"])
    scores, flags = model.score_samples(X.values), model.predict(X.values)
    flagged = []
    for r, s, f in zip(rows, scores, flags):
        if f == -1:
            flagged.append({
                "symbol": body.symbol, "anomaly_date": r["date"], "is_anomaly": True, "anomaly_score": round(float(s), 4),
                "daily_return_pct": round(r["daily_return"] * 100, 3), "volume_zscore": round(r["volume_zscore"], 3),
                "intraday_range_pct": None if r["intraday_range_pct"] is None else round(r["intraday_range_pct"], 3),
                "opening_gap_pct": None if r["opening_gap_pct"] is None else round(r["opening_gap_pct"], 3),
                "turnover": r["turnover"],
            })
    flagged.sort(key=lambda o: o["anomaly_score"])
    for i, o in enumerate(flagged):  # tercile rank within flagged days, not a probability
        o["severity"] = "High" if i < len(flagged) / 3 else "Medium" if i < 2 * len(flagged) / 3 else "Low"
    return {
        "symbol": body.symbol, "model": "IsolationForest", "model_version": version_of(b), "dummy": False, "run_timestamp": now(),
        "contamination": float(model.contamination), "features": ["Daily_Return", "Volume_ZScore"], "volume_window": body.volume_window,
        "score_definition": "score_samples: lower = more unusual; not a probability", "observations": len(rows), "anomalies": flagged,
    }


# ---------------- Output 3: DistilBERT sentiment ----------------
class Headline(BaseModel):
    headline: str = Field(min_length=1, max_length=500)
    date: str


class SentimentIn(BaseModel):
    symbol: str
    headlines: list[Headline] = Field(max_length=50)


def label(c):
    return "Positive" if c >= 0.05 else "Negative" if c <= -0.05 else "Neutral"


@app.post("/ml/sentiment", dependencies=[Depends(internal_only)])
def sentiment(body: SentimentIn):
    b = need("sentiment")
    seen, items = set(), []
    for h in sorted(body.headlines, key=lambda h: h.date, reverse=True):
        key = h.headline.strip().lower()
        if key not in seen:
            seen.add(key)
            items.append(h)
    items = items[:10]
    if not items:
        return {"symbol": body.symbol, "available": False, "message": "Sentiment unavailable"}
    import torch
    with torch.inference_mode():
        enc = b["tokenizer"]([h.headline for h in items], padding=True, truncation=True, max_length=b.get("max_tokens", 96), return_tensors="pt")
        probs = torch.softmax(b["model"](**enc).logits, -1).tolist()
    labels = b["labels"]
    scored = []
    for h, p in zip(items, probs):
        pr = dict(zip(labels, p))
        s = pr["positive"] - pr["negative"]
        scored.append({"headline": h.headline, "date": h.date, "compound": round(s, 4), "label": label(s),
                       "probabilities": {k: round(v, 3) for k, v in pr.items()}})
    score = sum(x["compound"] for x in scored) / len(scored)
    return {
        "symbol": body.symbol, "model": "DistilBERT", "model_version": version_of(b), "dummy": False, "run_timestamp": now(),
        "score": round(score, 4), "label": label(score), "headline_count": len(scored), "latest_headline_date": scored[0]["date"],
        "aggregation": "mean of P(positive) - P(negative), latest 10 unique headlines", "headlines": scored,
    }
