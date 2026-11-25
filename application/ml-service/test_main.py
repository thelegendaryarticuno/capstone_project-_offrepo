import math
import random

import pytest
from fastapi.testclient import TestClient

from main import app

H = {"X-Internal-Key": "dev-internal-key"}


@pytest.fixture(scope="module")
def c():
    with TestClient(app) as client:  # runs startup: loads the three models once
        yield client


def bars(n=300, shock_at=250, seed=1):
    rnd, p, out = random.Random(seed), 1000.0, []
    for i in range(n):
        prev = p
        p *= 1 + rnd.gauss(0, 0.012) + (0.09 if i == shock_at else 0)
        out.append({"date": f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}", "open": prev, "high": max(prev, p) * 1.006, "low": min(prev, p) * 0.994,
                    "close": p, "prev_close": prev, "volume": 1e6 * (6 if i == shock_at else math.exp(rnd.gauss(0, 0.3)))})
    return out


def test_rejects_without_key(c):
    assert c.post("/ml/sentiment", json={"symbol": "X", "headlines": []}).status_code == 401


def test_health_reports_all_three_connected_with_cards(c):
    m = c.get("/health").json()["models"]
    assert [x["id"] for x in m] == ["volatility", "anomaly", "sentiment"]
    assert all(x["connected"] for x in m), [x["reason"] for x in m]
    assert all(x["card"] and x["card"]["fields"] for x in m)


def test_volatility_forecast(c):
    b = bars()
    j = c.post("/ml/volatility", headers=H, json={"symbol": "X", "bars": b, "market": [{"date": x["date"], "close": x["close"]} for x in b]}).json()
    assert 1 < j["forecast_pct"] < 200 and len(j["features"]) == 8 and j["evaluation"]["n"] > 0
    assert c.post("/ml/volatility", headers=H, json={"symbol": "X", "bars": b[:40], "market": []}).status_code == 422


def test_anomalies_flag_the_shock(c):
    j = c.post("/ml/anomalies", headers=H, json={"symbol": "RELIANCE.NS", "bars": bars()}).json()
    assert j["anomalies"] and j["anomalies"][0]["anomaly_date"] == bars()[250]["date"]
    assert c.post("/ml/anomalies", headers=H, json={"symbol": "ZOMATO.NS", "bars": bars()}).status_code == 422


def test_sentiment_range_and_dedupe(c):
    hl = [{"headline": "Shares slump after regulator opens fraud probe", "date": "2026-01-03"},
          {"headline": "Board meeting scheduled for Friday", "date": "2026-01-02"},
          {"headline": "board meeting scheduled for friday", "date": "2026-01-01"}]
    j = c.post("/ml/sentiment", headers=H, json={"symbol": "X", "headlines": hl}).json()
    assert j["headline_count"] == 2 and -1 <= j["score"] <= 1
    assert j["headlines"][0]["label"] == "Negative"
