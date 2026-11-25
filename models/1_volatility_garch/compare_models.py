"""Try to beat GARCH(1,1) on the same forecast dates. Run after train.py.

Every model is chosen on the validation period and only then read off the test period.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import MIN_HISTORY, folders, load_prices, load_symbols, save_matrix, set_low_priority  # first

import json
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime

import numpy as np
import pandas as pd
from arch import arch_model
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

HORIZON, TRAIN_WINDOW, EVAL_DAYS, ANNUAL = 10, 750, 250, 252
FEATURES = ["range_vol_1", "range_vol_5", "range_vol_22", "close_vol_22", "close_vol_66",
            "market_vol_5", "volume_ratio", "last_return"]
HAR_FEATURES = ["range_vol_1", "range_vol_5", "range_vol_22", "market_vol_5"]
ORDER = ["Low", "Medium", "High"]


def build_features(prices, add_next_day=False):
    """One row per symbol and day t; features use data before t, the target uses t .. t+9.

    add_next_day appends an empty row after the last date, used for the live forecast.
    """
    frames = []
    for symbol, g in prices.dropna(subset=["daily_return"]).groupby("symbol"):
        g = g.reset_index(drop=True)
        if add_next_day:
            g = g.reindex(range(len(g) + 1))
            g.loc[len(g) - 1, "date"] = g["date"].iloc[-2] + pd.Timedelta(days=1)
        total = np.log1p(g["daily_return"]) * 100
        high_low = np.log(g["high"] / g["low"]) * 100
        close_open = np.log(g["close"] / g["open"]) * 100
        overnight = total - close_open
        # Garman-Klass intraday variance plus the squared overnight move.
        variance = (0.5 * high_low ** 2 - (2 * np.log(2) - 1) * close_open ** 2).clip(lower=0) + overnight ** 2

        def vol(series, days):
            return np.sqrt(series.shift(1).rolling(days).mean() * ANNUAL)

        f = pd.DataFrame({"symbol": symbol, "index": np.arange(len(g)), "date": g["date"]})
        for days in (1, 5, 22):
            f[f"range_vol_{days}"] = vol(variance, days)
        for days in (22, 66):
            f[f"close_vol_{days}"] = vol(total ** 2, days)
        f["volume_ratio"] = g["volume"].shift(1).rolling(5).mean() / g["volume"].shift(1).rolling(60).mean()
        f["last_return"] = total.shift(1)
        f["target"] = np.sqrt((total ** 2).rolling(HORIZON).mean().shift(-(HORIZON - 1)) * ANNUAL)
        f["target_end"] = g["date"].shift(-(HORIZON - 1))
        frames.append(f)
    table = pd.concat(frames, ignore_index=True)
    table["market_vol_5"] = table.groupby("date")["range_vol_5"].transform("median")
    return table


def origins(n):
    for split, start, stop in (("validation", n - 2 * EVAL_DAYS, n - EVAL_DAYS), ("test", n - EVAL_DAYS, n)):
        for origin in range(max(start, MIN_HISTORY), stop - HORIZON + 1, HORIZON):
            yield split, origin


def gjr_job(item):
    symbol, returns = item
    rows = []
    for split, origin in origins(len(returns)):
        history = returns[max(0, origin - TRAIN_WINDOW):origin]
        result = arch_model(history, mean="Constant", vol="GARCH", p=1, o=1, q=1, rescale=False).fit(
            disp="off", show_warning=False)
        variance = result.forecast(horizon=HORIZON, reindex=False).variance.values[-1]
        rows.append({"symbol": symbol, "index": origin, "split": split, "gjr_garch": np.sqrt(variance.mean() * ANNUAL)})
    return rows


def regression_forecasts(table, wanted):
    """Refit for every forecast date, using only targets that ended before that date."""
    known = table.dropna(subset=FEATURES + ["target", "target_end"])
    wanted = wanted.merge(table, on=["symbol", "index"], how="left")
    wanted[["har_range", "boosting"]] = np.nan
    for date, group in wanted.groupby("date"):
        train = known[known["target_end"] < date]
        har = LinearRegression().fit(train[HAR_FEATURES], train["target"])
        wanted.loc[group.index, "har_range"] = har.predict(group[HAR_FEATURES])
    # Boosting is slower, so it is refit once per calendar month.
    for month, group in wanted.groupby(wanted["date"].dt.to_period("M")):
        train = known[known["target_end"] < group["date"].min()]
        model = HistGradientBoostingRegressor(loss="absolute_error", max_depth=3, learning_rate=0.03,
                                              max_iter=300, min_samples_leaf=200, random_state=42)
        model.fit(train[FEATURES], train["target"])
        wanted.loc[group.index, "boosting"] = model.predict(group[FEATURES])
    return wanted


def score(frame, column):
    pair = frame[[column, "realised_10d"]].dropna()
    diff = pair[column] - pair["realised_10d"]
    return {"rmse": round(float(np.sqrt((diff ** 2).mean())), 3), "mae": round(float(diff.abs().mean()), 3),
            "median_abs_pct_error": round(float((diff.abs() / pair["realised_10d"]).median() * 100), 2)}


def main():
    set_low_priority()
    out, matrices = folders(__file__)
    prices, _ = load_prices(load_symbols())
    table = build_features(prices)
    metrics = json.loads((out / "metrics.json").read_text())
    old = pd.read_csv(out / "volatility_walk_forward.csv")
    old = old[old["dist"] == metrics["selected_distribution"]].copy()

    returns = {s: np.log1p(g["daily_return"].to_numpy()) * 100
               for s, g in prices.dropna(subset=["daily_return"]).groupby("symbol")}
    keys = [{"symbol": s, "split": split, "index": o} for s, r in returns.items() if len(r) >= MIN_HISTORY
            for split, o in origins(len(r))]
    wanted = pd.DataFrame(keys)
    old["index"] = old.groupby("symbol").cumcount()
    wanted["position"] = wanted.groupby("symbol").cumcount()
    old = old.rename(columns={"index": "position"})

    frame = regression_forecasts(table, wanted)
    frame = frame.merge(old[["symbol", "position", "split", "forecast", "realised_10d", "baseline_trailing_30d"]],
                        on=["symbol", "position", "split"], how="inner")
    assert len(frame) == len(old), "forecast dates do not line up with train.py"
    assert np.allclose(frame["target"], frame["realised_10d"]), "targets do not line up with train.py"
    frame = frame.rename(columns={"forecast": "garch", "baseline_trailing_30d": "trailing_30d"})

    with ProcessPoolExecutor(max_workers=2, initializer=set_low_priority) as pool:
        gjr = pd.DataFrame([row for rows in pool.map(gjr_job, returns.items()) for row in rows])
    frame = frame.merge(gjr, on=["symbol", "index", "split"], how="left")
    frame["ensemble_garch_har_boosting"] = frame[["garch", "har_range", "boosting"]].mean(axis=1)

    models = ["trailing_30d", "garch", "gjr_garch", "har_range", "boosting", "ensemble_garch_har_boosting"]
    valid, test = frame[frame["split"] == "validation"], frame[frame["split"] == "test"]
    truth_cuts = valid["realised_10d"].quantile([1 / 3, 2 / 3]).to_numpy()
    truth = np.searchsorted(truth_cuts, test["realised_10d"])
    rows, predictions = [], {}
    for name in models:
        # Class cut points for each model come from its own validation forecasts.
        cuts = valid[name].quantile([1 / 3, 2 / 3]).to_numpy()
        predictions[name] = np.searchsorted(cuts, test[name])
        rows.append({"model": name, **{f"validation_{k}": v for k, v in score(valid, name).items()},
                     **{f"test_{k}": v for k, v in score(test, name).items()},
                     "test_regime_accuracy": round(float(accuracy_score(truth, predictions[name])), 3),
                     "test_regime_macro_f1": round(float(f1_score(truth, predictions[name], average="macro")), 3)})
    results = pd.DataFrame(rows)
    results.to_csv(matrices / "model_comparison.csv", index=False)
    best = results.loc[results["validation_rmse"].idxmin(), "model"]
    matrix = pd.DataFrame(confusion_matrix(truth, predictions[best], labels=[0, 1, 2]), index=ORDER, columns=ORDER)
    save_matrix(matrix, matrices / "confusion_matrix_best_model", f"{best}: volatility regime", "forecast", "realised")
    frame.drop(columns=["position"]).to_csv(out / "model_comparison_forecasts.csv", index=False)

    # Next-10-day forecast from the selected model, fitted on every finished target.
    live = build_features(prices, add_next_day=True)
    latest = live.groupby("symbol").tail(1).copy()
    known = live.dropna(subset=FEATURES + ["target", "target_end"])
    parts = {"har_range": (LinearRegression(), HAR_FEATURES),
             "boosting": (HistGradientBoostingRegressor(loss="absolute_error", max_depth=3, learning_rate=0.03,
                                                        max_iter=300, min_samples_leaf=200, random_state=42), FEATURES)}
    if best in parts:
        model, columns = parts[best]
        latest["forecast_annualised_vol_pct"] = model.fit(known[columns], known["target"]).predict(latest[columns])
        latest["forecast_10d_cumulative_vol_pct"] = latest["forecast_annualised_vol_pct"] * np.sqrt(HORIZON / ANNUAL)
        latest["data_cutoff"] = latest["date"] - pd.Timedelta(days=1)
        latest["is_stale"] = (latest["data_cutoff"].max() - latest["data_cutoff"]).dt.days > 7
        latest["model"] = best
        latest[["symbol", "is_stale", "data_cutoff", "forecast_annualised_vol_pct",
                "forecast_10d_cumulative_vol_pct", "model"]].to_csv(out / "volatility_forecast_best_model.csv", index=False)
    (out / "model_comparison.json").write_text(json.dumps(
        {"run_time": datetime.now().isoformat(timespec="seconds"), "selected_on_validation_rmse": best,
         "results": rows}, indent=2))
    print(results.T.to_string())
    print("selected on validation:", best)


if __name__ == "__main__":
    main()
