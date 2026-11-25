"""Compare anomaly detectors with a SYNTHETIC test: artificial shocks are inserted and counted.

There are no real anomaly labels, so these numbers describe how well each detector finds the
inserted shocks, not real market events. Detectors are chosen on the validation period.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import folders, load_prices, load_symbols, pick_workers, save_matrix, set_low_priority  # first

import json
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import average_precision_score
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import RobustScaler
from sklearn.svm import OneClassSVM

CONTAMINATION, EVAL_DAYS, WINDOW, SEED = 0.02, 250, 20, 42
BASIC = ["daily_return", "volume_zscore"]
RICH = ["return_z", "log_volume_z", "range_ratio", "gap_z"]
DETECTORS = {
    "isolation_forest_spec": ("iforest", BASIC),
    "isolation_forest_richer_features": ("iforest", RICH),
    "local_outlier_factor": ("lof", RICH),
    "one_class_svm": ("svm", RICH),
}
NAMES = ["normal", "anomaly"]


def add_context(g):
    """Statistics of the prior sessions, taken from the real (unmodified) data."""
    g = g.copy()
    g["volume"] = g["volume"].astype(float)   # inserted shocks are fractional
    g["intraday_range"] = (g["high"] - g["low"]) / g["prev_close"]
    g["opening_gap"] = (g["open"] - g["prev_close"]) / g["prev_close"]
    g["log_volume"] = np.log(g["volume"])
    for column in ("daily_return", "volume", "log_volume", "intraday_range", "opening_gap"):
        past = g[column].shift(1).rolling(WINDOW, min_periods=15)
        g[f"{column}_mean"], g[f"{column}_std"] = past.mean(), past.std()
    return g


def features(g):
    g["volume_zscore"] = (g["volume"] - g["volume_mean"]) / g["volume_std"]
    g["return_z"] = g["daily_return"] / g["daily_return_std"]
    g["log_volume_z"] = (g["log_volume"] - g["log_volume_mean"]) / g["log_volume_std"]
    g["range_ratio"] = g["intraday_range"] / g["intraday_range_mean"]
    g["gap_z"] = g["opening_gap"] / g["opening_gap_std"]
    return g


def inject(rows, rng):
    """Turn 2% of the rows into price shocks, volume shocks or both."""
    rows = rows.copy()
    rows["injected"] = False
    picked = rng.choice(rows.index.to_numpy(), size=max(1, int(round(CONTAMINATION * len(rows)))), replace=False)
    for i in picked:
        kind = rng.choice(["price", "volume", "both"])
        if kind != "volume":
            move = rng.choice([-1, 1]) * rng.uniform(3, 7) * rows.at[i, "daily_return_std"]
            rows.at[i, "daily_return"] = move
            rows.at[i, "intraday_range"] = max(rows.at[i, "intraday_range"], abs(move) * rng.uniform(0.8, 1.3))
            rows.at[i, "opening_gap"] = move * rng.uniform(0, 0.8)
        if kind != "price":
            rows.at[i, "volume"] = rows.at[i, "volume_mean"] * rng.uniform(3, 10)
            rows.at[i, "log_volume"] = np.log(rows.at[i, "volume"])
        rows.at[i, "injected"] = True
    return features(rows)


def fit_score(kind, train, test):
    """Return (anomaly score, flag) for test rows; higher score means more unusual."""
    if kind == "iforest":
        model = IsolationForest(n_estimators=300, random_state=SEED, n_jobs=1).fit(train)
    else:
        scaler = RobustScaler().fit(train)
        train, test = scaler.transform(train), scaler.transform(test)
        if kind == "lof":
            model = LocalOutlierFactor(n_neighbors=35, novelty=True).fit(train)
        else:
            model = OneClassSVM(nu=CONTAMINATION, gamma="scale").fit(train)
    threshold = np.quantile(-model.score_samples(train), 1 - CONTAMINATION)
    score = -model.score_samples(test)
    return score, score > threshold


def job(item):
    number, (symbol, group) = item
    g = features(add_context(group)).dropna(subset=BASIC + RICH).reset_index(drop=True)
    if len(g) < 3 * EVAL_DAYS:
        return []
    out = []
    n = len(g)
    for split, start, stop in (("validation", n - 2 * EVAL_DAYS, n - EVAL_DAYS), ("test", n - EVAL_DAYS, n)):
        rng = np.random.default_rng([SEED, number, stop])
        train, part = g.iloc[:start], inject(g.iloc[start:stop], rng)
        part = part.dropna(subset=BASIC + RICH)
        for name, (kind, columns) in DETECTORS.items():
            score, flag = fit_score(kind, train[columns].to_numpy(), part[columns].to_numpy())
            out.append(pd.DataFrame({"symbol": symbol, "split": split, "model": name, "truth": part["injected"],
                                     "flag": flag, "average_precision": average_precision_score(part["injected"], score)}))
    return out


def measure(rows):
    tp = int((rows["truth"] & rows["flag"]).sum())
    fp = int((~rows["truth"] & rows["flag"]).sum())
    fn = int((rows["truth"] & ~rows["flag"]).sum())
    tn = int((~rows["truth"] & ~rows["flag"]).sum())
    precision, recall = tp / max(tp + fp, 1), tp / max(tp + fn, 1)
    return {"accuracy": round((tp + tn) / len(rows), 4), "precision": round(precision, 3), "recall": round(recall, 3),
            "f1": round(2 * precision * recall / max(precision + recall, 1e-9), 3),
            "mean_average_precision": round(float(rows.groupby("symbol")["average_precision"].first().mean()), 3),
            "accuracy_if_nothing_is_flagged": round((tn + fp) / len(rows), 4)}, [[tn, fp], [fn, tp]]


def main():
    set_low_priority()
    out, matrices = folders(__file__)
    prices, _ = load_prices(load_symbols())
    prices = prices.dropna(subset=["daily_return"])
    with ProcessPoolExecutor(max_workers=min(2, pick_workers()[0]), initializer=set_low_priority) as pool:
        parts = [p for result in pool.map(job, enumerate(prices.groupby("symbol"))) for p in result]
    scored = pd.concat(parts, ignore_index=True)
    rows, tables = [], {}
    for name in DETECTORS:
        entry = {"model": name}
        for split in ("validation", "test"):
            values, table = measure(scored[(scored["model"] == name) & (scored["split"] == split)])
            entry.update({f"{split}_{k}": v for k, v in values.items()})
            if split == "test":
                tables[name] = table
        rows.append(entry)
    results = pd.DataFrame(rows)
    results.to_csv(matrices / "synthetic_model_comparison.csv", index=False)
    best = results.loc[results["validation_f1"].idxmax(), "model"]
    for name, table in tables.items():
        save_matrix(pd.DataFrame(table, index=NAMES, columns=NAMES), matrices / f"synthetic_confusion_matrix_{name}",
                    f"{name} (synthetic test)", "predicted", "inserted")

    # Real dates flagged by the selected detector, fitted on the full history (as in train.py).
    flagged = []
    kind, columns = DETECTORS[best]
    for symbol, group in prices.groupby("symbol"):
        g = features(add_context(group)).dropna(subset=BASIC + RICH).copy()
        if len(g) < 250:
            continue
        score, flag = fit_score(kind, g[columns].to_numpy(), g[columns].to_numpy())
        g["anomaly_score"], g["is_anomaly"] = score, flag
        flagged.append(g[g["is_anomaly"]])
    real = pd.concat(flagged)
    real["daily_return_pct"] = real["daily_return"] * 100
    real["intraday_range_pct"] = real["intraday_range"] * 100
    real["opening_gap_pct"] = real["opening_gap"] * 100
    real.rename(columns={"date": "anomaly_date"})[
        ["symbol", "anomaly_date", "is_anomaly", "anomaly_score", "daily_return_pct", "volume_zscore",
         "intraday_range_pct", "opening_gap_pct", "turnover", "trades", "corporate_action"]
    ].sort_values(["symbol", "anomaly_score"], ascending=[True, False]).to_csv(
        out / "anomalies_best_model.csv", index=False)
    (out / "model_comparison.json").write_text(json.dumps(
        {"run_time": datetime.now().isoformat(timespec="seconds"), "test_type": "synthetic injected shocks",
         "selected_on_validation_f1": best, "score_definition": "higher means more unusual; not a probability",
         "results": rows}, indent=2))
    print(results.T.to_string())
    print("selected on validation:", best, "| real rows flagged:", len(real))


if __name__ == "__main__":
    main()
