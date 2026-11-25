"""Model 2: Isolation Forest anomaly dates, scores and unusual movement indicators."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import (MIN_HISTORY, folders, load_prices, load_symbols, pick_workers, save_matrix,
                    set_low_priority, write_metrics)  # first: sets thread limits

from concurrent.futures import ProcessPoolExecutor
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import IsolationForest

CONTAMINATION = 0.02
FEATURES = ["daily_return", "volume_zscore"]


def anomaly_job(item):
    symbol, group = item
    rows = group.dropna(subset=FEATURES).copy()
    if len(rows) < MIN_HISTORY:
        return symbol, None, None, None
    x = rows[FEATURES].to_numpy()
    model = IsolationForest(n_estimators=300, contamination=CONTAMINATION, random_state=42, n_jobs=1).fit(x)
    rows["anomaly_score"] = model.score_samples(x)
    rows["decision_function"] = model.decision_function(x)
    rows["is_anomaly"] = model.predict(x) == -1
    # Stability check: how much do the flagged dates change with another random seed?
    other = IsolationForest(n_estimators=300, contamination=CONTAMINATION, random_state=7, n_jobs=1).fit(x).predict(x) == -1
    rows["flag_seed7"] = other
    union = (rows["is_anomaly"].to_numpy() | other).sum()
    overlap = float((rows["is_anomaly"].to_numpy() & other).sum() / union) if union else 1.0
    return symbol, rows, model, overlap


def run_anomalies(prices, pool, run_time, OUT, MODELS, MATRICES):
    results = list(pool.map(anomaly_job, [(s, g) for s, g in prices.groupby("symbol")]))
    scored = pd.concat([r[1] for r in results if r[1] is not None], ignore_index=True)
    scored["daily_return_pct"] = scored["daily_return"] * 100
    scored["intraday_range_pct"] = (scored["high"] - scored["low"]) / scored["prev_close"] * 100
    scored["opening_gap_pct"] = (scored["open"] - scored["prev_close"]) / scored["prev_close"] * 100
    columns = ["symbol", "date", "is_anomaly", "anomaly_score", "decision_function", "daily_return_pct",
               "volume_zscore", "intraday_range_pct", "opening_gap_pct", "turnover", "trades", "corporate_action"]
    flagged = scored.loc[scored["is_anomaly"], columns].rename(columns={"date": "anomaly_date"})
    flagged.sort_values(["symbol", "anomaly_score"]).to_csv(OUT / "anomalies.csv", index=False)
    for symbol, rows, model, _ in results:
        if model is not None:
            joblib.dump({"model": model, "features": FEATURES, "run_time": run_time,
                         "data_cutoff": str(rows["date"].max().date())}, MODELS / f"iforest_{symbol}.joblib", compress=3)

    normal = scored[~scored["is_anomaly"]]
    odd = scored[scored["is_anomaly"]]
    names = ["normal", "anomaly"]
    table = pd.crosstab(scored["is_anomaly"], scored["flag_seed7"]).reindex(index=[False, True], columns=[False, True],
                                                                         fill_value=0)
    table.index, table.columns = names, names
    save_matrix(table, MATRICES / "seed_agreement_matrix", "Agreement between two seeds (not accuracy)",
                "seed 7", "seed 42")
    measures = ["daily_return_pct", "volume_zscore", "intraday_range_pct", "opening_gap_pct"]
    sizes = scored[measures].abs().groupby(scored["is_anomaly"]).median().round(3)
    sizes.index = sizes.index.map({False: "normal", True: "anomaly"})
    sizes.to_csv(MATRICES / "median_absolute_movement_flagged_vs_normal.csv", index_label="group")
    per_symbol = scored.groupby("symbol")["is_anomaly"].agg(rows="size", flagged="sum", flag_rate="mean")
    per_symbol["seed_overlap"] = pd.Series({r[0]: r[3] for r in results})
    per_symbol.round(4).to_csv(MATRICES / "summary_by_symbol.csv")
    return {
        "note": "Unsupervised model with no labelled anomalies, so accuracy, precision and recall cannot be measured.",
        "score_definition": "scikit-learn score_samples: lower means more unusual; not a probability",
        "symbols_modelled": int(scored["symbol"].nunique()),
        "symbols_skipped": [r[0] for r in results if r[1] is None],
        "rows_scored": len(scored),
        "rows_flagged": len(odd),
        "flag_rate": round(float(scored["is_anomaly"].mean()), 4),
        "median_abs_return_pct_flagged_vs_normal": [round(float(f["daily_return_pct"].abs().median()), 2) for f in (odd, normal)],
        "median_volume_z_flagged_vs_normal": [round(float(f["volume_zscore"].median()), 2) for f in (odd, normal)],
        "mean_flag_overlap_between_seeds": round(float(np.mean([r[3] for r in results if r[3] is not None])), 4),
        "flagged_rows_on_corporate_action_dates": int((odd["corporate_action"] != "").sum()),
    }


def main():
    set_low_priority()
    out, matrices = folders(__file__)
    models = out.parent / "models"
    models.mkdir(exist_ok=True)
    run_time = datetime.now().isoformat(timespec="seconds")
    workers, free_gb = pick_workers()
    print(f"free RAM {free_gb:.1f} GB -> {workers} worker(s), below-normal priority, CPU only")
    prices, quality = load_prices(load_symbols())
    with ProcessPoolExecutor(max_workers=workers, initializer=set_low_priority) as pool:
        metrics = run_anomalies(prices, pool, run_time, out, models, matrices)
    write_metrics(out / "metrics.json", {**metrics, "data_quality": quality}, run_time,
                  {"source": "huggingface.co/datasets/tejhq/indian-markets (prices_adjusted, actions; NSE EQ)", "scikit-learn": sklearn.__version__})


if __name__ == "__main__":
    main()
