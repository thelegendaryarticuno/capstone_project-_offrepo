"""Model 1: GARCH(1,1) next-10-day volatility forecast."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import (MIN_HISTORY, folders, load_prices, load_symbols, pick_workers, save_matrix,
                    set_low_priority, write_metrics)  # first: sets thread limits

import json
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime

import arch
import numpy as np
import pandas as pd
from arch import arch_model
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

HORIZON = 10
TRAIN_WINDOW = 750
EVAL_DAYS = 250
DISTS = ["normal", "t"]
ANNUAL = 252
STALE_DAYS = 7


def fit_garch(returns_pct, dist):
    model = arch_model(returns_pct, mean="Constant", vol="GARCH", p=1, q=1, dist=dist, rescale=False)
    return model.fit(disp="off", show_warning=False)


def annualised(daily_variance):
    """Daily variance in percent squared -> annualised volatility in percent."""
    return float(np.sqrt(np.mean(daily_variance) * ANNUAL))


def walk_forward(returns_pct, start, stop, dist):
    """Non-overlapping 10-day forecasts; every fit sees only data before the origin."""
    rows = []
    for origin in range(max(start, MIN_HISTORY), stop - HORIZON + 1, HORIZON):
        history = returns_pct[max(0, origin - TRAIN_WINDOW):origin]
        result = fit_garch(history, dist)
        variance = result.forecast(horizon=HORIZON, reindex=False).variance.values[-1]
        next30 = returns_pct[origin:origin + 30]
        rows.append({
            "dist": dist,
            "forecast": annualised(variance),
            "realised_10d": annualised(returns_pct[origin:origin + HORIZON] ** 2),
            "realised_30d": annualised(next30 ** 2) if len(next30) == 30 else np.nan,
            "baseline_trailing_30d": annualised(history[-30:] ** 2),
            "converged": result.convergence_flag == 0,
        })
    return rows


def volatility_job(item):
    symbol, dates, returns_pct = item
    n = len(returns_pct)
    if n < MIN_HISTORY:
        return {"symbol": symbol, "status": f"insufficient history ({n} < {MIN_HISTORY})", "eval": [], "final": {}}
    rows = []
    for dist in DISTS:
        for split, start, stop in (("validation", n - 2 * EVAL_DAYS, n - EVAL_DAYS), ("test", n - EVAL_DAYS, n)):
            for row in walk_forward(returns_pct, start, stop, dist):
                rows.append({**row, "symbol": symbol, "split": split})
    final = {}
    window = returns_pct[-TRAIN_WINDOW:]
    for dist in DISTS:
        result = fit_garch(window, dist)
        variance = result.forecast(horizon=HORIZON, reindex=False).variance.values[-1]
        final[dist] = {
            "forecast_annualised_vol_pct": annualised(variance),
            "forecast_10d_cumulative_vol_pct": float(np.sqrt(variance.sum())),
            "daily_vol_path_pct": [round(float(v), 4) for v in np.sqrt(variance)],
            "params": {k: float(v) for k, v in zip(result.model.parameter_names() + result.model.volatility.parameter_names()
                                                   + result.model.distribution.parameter_names(), result.params)},
            "converged": result.convergence_flag == 0,
        }
    meta = {
        "data_start": str(dates[-len(window)])[:10],
        "data_cutoff": str(dates[-1])[:10],
        "observations": len(window),
    }
    return {"symbol": symbol, "status": "ok", "eval": rows, "final": final, "meta": meta}


def errors(frame, prediction, target):
    pair = frame[[prediction, target]].dropna()
    difference = pair[prediction] - pair[target]
    return {
        "n": len(pair),
        "rmse_vol_points": round(float(np.sqrt((difference ** 2).mean())), 3),
        "mae_vol_points": round(float(difference.abs().mean()), 3),
        "median_abs_pct_error": round(float((difference.abs() / pair[target]).median() * 100), 2),
    }


def regime_matrices(evaluation, best, MATRICES):
    """Low / Medium / High volatility confusion matrix; cut points come from the validation period only."""
    rows = evaluation[evaluation["dist"] == best]
    low, high = rows.loc[rows["split"] == "validation", "realised_10d"].quantile([1 / 3, 2 / 3])
    test = rows[rows["split"] == "test"]
    order = ["Low", "Medium", "High"]

    def regime(values):
        return np.array(order)[np.searchsorted([low, high], values)]

    truth = regime(test["realised_10d"])
    result = {"cut_points_annualised_vol_pct": [round(float(low), 2), round(float(high), 2)]}
    for name, column in (("garch", "forecast"), ("baseline", "baseline_trailing_30d")):
        predicted = regime(test[column])
        table = pd.DataFrame(confusion_matrix(truth, predicted, labels=order), index=order, columns=order)
        save_matrix(table, MATRICES / f"confusion_matrix_{name}", f"{name}: next-10-day volatility regime",
                    "forecast", "realised")
        result[name] = {"accuracy": round(float(accuracy_score(truth, predicted)), 3),
                        "macro_f1": round(float(f1_score(truth, predicted, labels=order, average="macro")), 3)}
    return result


def run_volatility(prices, pool, run_time, OUT, MODELS, MATRICES):
    items = []
    for symbol, group in prices.dropna(subset=["daily_return"]).groupby("symbol"):
        items.append((symbol, group["date"].to_numpy(), np.log1p(group["daily_return"].to_numpy()) * 100))
    results = list(pool.map(volatility_job, items))

    evaluation = pd.DataFrame([row for r in results for row in r["eval"]])
    # The error distribution is chosen on the validation period only.
    validation = {d: errors(evaluation.query("split == 'validation' and dist == @d"), "forecast", "realised_10d") for d in DISTS}
    best = min(DISTS, key=lambda d: validation[d]["rmse_vol_points"])
    test = evaluation.query("split == 'test' and dist == @best")
    metrics = {
        "units": "annualised volatility, percentage points",
        "selected_distribution": best,
        "validation_by_distribution": validation,
        "test_garch_vs_next_10d": errors(test, "forecast", "realised_10d"),
        "test_baseline_trailing30d_vs_next_10d": errors(test, "baseline_trailing_30d", "realised_10d"),
        "test_garch_vs_next_30d": errors(test, "forecast", "realised_30d"),
        "test_baseline_trailing30d_vs_next_30d": errors(test, "baseline_trailing_30d", "realised_30d"),
        "test_fit_convergence_rate": round(float(test["converged"].mean()), 4),
        "symbols_skipped": {r["symbol"]: r["status"] for r in results if r["status"] != "ok"},
    }

    forecasts, saved = [], {}
    for r in results:
        if r["status"] != "ok":
            continue
        final = r["final"][best]
        forecasts.append({
            "symbol": r["symbol"], "horizon": "next 10 trading days", **r["meta"],
            **{k: v for k, v in final.items() if k not in ("params", "daily_vol_path_pct")},
            "daily_vol_path_pct": json.dumps(final["daily_vol_path_pct"]),
            "model": f"GARCH(1,1) constant mean, {best} errors, log returns", "run_time": run_time,
        })
        saved[r["symbol"]] = {**r["meta"], **final}
    table = pd.DataFrame(forecasts)
    cutoffs = pd.to_datetime(table["data_cutoff"])
    table.insert(1, "is_stale", (cutoffs.max() - cutoffs).dt.days > STALE_DAYS)
    table.to_csv(OUT / "volatility_forecast.csv", index=False)
    evaluation.to_csv(OUT / "volatility_walk_forward.csv", index=False)
    (MODELS / "garch_params.json").write_text(json.dumps(saved, indent=1))
    metrics["regime_matrix"] = regime_matrices(evaluation, best, MATRICES)
    by_symbol = [{"symbol": s, **errors(g, "forecast", "realised_10d")} for s, g in test.groupby("symbol")]
    pd.DataFrame(by_symbol).to_csv(MATRICES / "error_by_symbol.csv", index=False)
    pd.DataFrame({
        "GARCH vs next 10 days": metrics["test_garch_vs_next_10d"],
        "Baseline vs next 10 days": metrics["test_baseline_trailing30d_vs_next_10d"],
        "GARCH vs next 30 days": metrics["test_garch_vs_next_30d"],
        "Baseline vs next 30 days": metrics["test_baseline_trailing30d_vs_next_30d"],
    }).T.to_csv(MATRICES / "error_metrics.csv", index_label="comparison")
    return metrics


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
        metrics = run_volatility(prices, pool, run_time, out, models, matrices)
    write_metrics(out / "metrics.json", {**metrics, "data_quality": quality}, run_time,
                  {"source": "huggingface.co/datasets/tejhq/indian-markets (prices_adjusted, actions; NSE EQ)", "arch": arch.__version__})


if __name__ == "__main__":
    main()
