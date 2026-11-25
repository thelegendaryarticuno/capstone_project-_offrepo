"""How high can the Low / Medium / High accuracy go? Run after train.py.

1. Calibration: forecast cut points are taken from the validation forecasts (no test data used).
2. Ceiling: simulated accuracy of a forecaster that knows the true volatility exactly.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import folders, save_matrix, set_low_priority  # first: sets thread limits

import json

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score

ORDER = ["Low", "Medium", "High"]
HORIZON, DRAWS, SEED = 10, 2000, 42


def main():
    set_low_priority()
    out, matrices = folders(__file__)
    metrics = json.loads((out / "metrics.json").read_text())
    rows = pd.read_csv(out / "volatility_walk_forward.csv")
    rows = rows[rows["dist"] == metrics["selected_distribution"]]
    valid, test = rows[rows["split"] == "validation"], rows[rows["split"] == "test"]
    cuts = valid["realised_10d"].quantile([1 / 3, 2 / 3]).to_numpy()
    truth = np.searchsorted(cuts, test["realised_10d"])
    result = {}

    for name, column in (("garch", "forecast"), ("baseline", "baseline_trailing_30d")):
        own_cuts = valid[column].quantile([1 / 3, 2 / 3]).to_numpy()
        predicted = np.searchsorted(own_cuts, test[column])
        result[f"{name}_calibrated"] = {
            "accuracy": round(float(accuracy_score(truth, predicted)), 3),
            "macro_f1": round(float(f1_score(truth, predicted, average="macro")), 3),
        }
        table = pd.DataFrame(confusion_matrix(truth, predicted, labels=[0, 1, 2]), index=ORDER, columns=ORDER)
        save_matrix(table, matrices / f"confusion_matrix_{name}_calibrated", f"{name}, calibrated cut points",
                    "forecast", "realised")

    # Ceiling: take a spread of "true" volatilities, draw 10 normal daily returns for each,
    # and let a perfect forecaster pick the most likely class for each true volatility.
    rng = np.random.default_rng(SEED)
    for source in ("forecast", "realised_30d"):
        true_vol = test[source].dropna().to_numpy()
        noise = np.sqrt(rng.chisquare(HORIZON, size=(len(true_vol), DRAWS)) / HORIZON)
        classes = np.searchsorted(cuts, true_vol[:, None] * noise)
        share = np.stack([(classes == k).mean(axis=1) for k in range(3)], axis=1)
        result[f"perfect_forecaster_ceiling_using_{source}_spread"] = round(float(share.max(axis=1).mean()), 3)

    (out / "accuracy_check.json").write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
