"""Model 3: VADER news sentiment score from -1 to +1 (lexicon based, nothing is trained)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import (RAW, folders, load_prices, load_symbols, save_matrix, set_low_priority, write_metrics)  # first: sets thread limits

from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

STALE_NEWS_DAYS = 30

# Finance terms added to VADER's lexicon (scale -4..+4), not adjusted after scoring the labels.
FINANCE_LEXICON = {
    "surge": 2.5, "surges": 2.5, "surged": 2.5, "soar": 2.5, "soars": 2.5, "soared": 2.5, "rally": 2.0,
    "rallies": 2.0, "jump": 1.8, "jumps": 1.8, "rise": 1.5, "rises": 1.5, "gain": 1.8, "gains": 1.8,
    "upgrade": 2.0, "upgrades": 2.0, "outperform": 2.0, "bullish": 2.5, "dividend": 1.0, "beats": 2.0,
    "profit": 1.2, "record": 1.0, "buy": 1.0, "expansion": 1.2, "approval": 1.5, "wins": 2.0,
    "slump": -2.5, "slumps": -2.5, "plunge": -3.0, "plunges": -3.0, "tumble": -2.5, "tumbles": -2.5,
    "fall": -1.5, "falls": -1.5, "drop": -1.5, "drops": -1.5, "decline": -1.8, "declines": -1.8,
    "downgrade": -2.0, "downgrades": -2.0, "underperform": -2.0, "bearish": -2.5, "loss": -2.0,
    "losses": -2.0, "probe": -1.8, "scrutiny": -1.5, "penalty": -2.0, "fine": 0.0, "shares": 0.0,
    "share": 0.0, "sell": -1.0, "default": -2.5, "fraud": -3.0, "layoffs": -2.0,
}


def label_of(score):
    return "positive" if score >= 0.05 else "negative" if score <= -0.05 else "neutral"


def strip_publisher(headline):
    """Google News headlines end in ' - Publisher'; that part is not the news."""
    head, separator, tail = str(headline).rpartition(" - ")
    return head if separator and len(tail) <= 45 else str(headline)


def evaluate_labels(truth, predicted):
    order = ["negative", "neutral", "positive"]
    n, accuracy = len(truth), accuracy_score(truth, predicted)
    z = 1.96  # Wilson 95% interval
    centre = (accuracy + z * z / (2 * n)) / (1 + z * z / n)
    half = z * np.sqrt(accuracy * (1 - accuracy) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return {
        "accuracy": round(float(accuracy), 3),
        "accuracy_95pct_interval": [round(float(centre - half), 3), round(float(centre + half), 3)],
        "macro_f1": round(float(f1_score(truth, predicted, labels=order, average="macro", zero_division=0)), 3),
        "confusion_matrix_rows_true_cols_pred": {"order": order,
                                                 "matrix": confusion_matrix(truth, predicted, labels=order).tolist()},
    }


def run_sentiment(cutoff, run_time, OUT, MATRICES):
    base = SentimentIntensityAnalyzer()
    finance = SentimentIntensityAnalyzer()
    finance.lexicon.update(FINANCE_LEXICON)
    variants = {
        "vader_standard": lambda h: base.polarity_scores(str(h))["compound"],
        "vader_finance_lexicon": lambda h: finance.polarity_scores(strip_publisher(h))["compound"],
    }

    news = pd.read_csv(RAW / "nifty_100_headlines.csv")
    news["Date"] = pd.to_datetime(news["Date"], errors="coerce")
    total = len(news)
    news = news.dropna(subset=["Ticker", "Headline", "Date"])
    news = news[news["Date"] <= cutoff].copy()
    news["key"] = news["Headline"].map(lambda h: " ".join(strip_publisher(h).lower().split()))
    news = news[news["key"].str.len() >= 10]
    news = news.sort_values("Date", ascending=False).drop_duplicates(["Ticker", "key"])
    for name, score in variants.items():
        news[name] = news["Headline"].map(score)

    latest = news.groupby("Ticker").head(10)
    summary = latest.groupby("Ticker").agg(
        sentiment_score=("vader_standard", "mean"),
        finance_lexicon_score=("vader_finance_lexicon", "mean"),
        headlines_used=("Headline", "size"),
        oldest_headline=("Date", "min"),
        latest_headline=("Date", "max"),
    ).reset_index()
    summary["label"] = summary["sentiment_score"].map(label_of)
    summary["finance_lexicon_label"] = summary["finance_lexicon_score"].map(label_of)
    summary["days_old_vs_price_cutoff"] = (cutoff - summary["latest_headline"]).dt.days
    summary["is_stale"] = summary["days_old_vs_price_cutoff"] > STALE_NEWS_DAYS
    summary["run_time"] = run_time
    summary.round(4).to_csv(OUT / "sentiment.csv", index=False)
    latest.drop(columns="key").to_csv(OUT / "sentiment_headlines.csv", index=False)

    labelled = pd.read_csv(RAW / "correct_labels_example.csv")
    truth = labelled["Correct_labels"].str.strip().str.lower()
    majority = truth.value_counts(normalize=True).iloc[0]
    evaluation = {name: evaluate_labels(truth, [label_of(score(h)) for h in labelled["Headline"]])
                  for name, score in variants.items()}
    order = ["negative", "neutral", "positive"]
    for name, score in variants.items():
        predicted = [label_of(score(h)) for h in labelled["Headline"]]
        table = pd.DataFrame(confusion_matrix(truth, predicted, labels=order), index=order, columns=order)
        save_matrix(table, MATRICES / f"confusion_matrix_{name}", name, "predicted", "true")
        report = classification_report(truth, predicted, labels=order, output_dict=True, zero_division=0)
        pd.DataFrame(report).T.round(3).to_csv(MATRICES / f"classification_report_{name}.csv", index_label="class")
    return {
        "headline_rows": total,
        "headline_rows_after_cleaning": len(news),
        "tickers_scored": len(summary),
        "latest_headline_date": str(news["Date"].max().date()),
        "labelled_rows": len(labelled),
        "majority_class_baseline_accuracy": round(float(majority), 3),
        "label_caveat": "Only 50 reviewed labels are published, all rows the source model had called neutral; "
                        "not a representative sample.",
        **evaluation,
    }


def main():
    set_low_priority()
    out, matrices = folders(__file__)
    run_time = datetime.now().isoformat(timespec="seconds")
    cutoff = load_prices(load_symbols())[0]["date"].max()
    metrics = run_sentiment(cutoff, run_time, out, matrices)
    write_metrics(out / "metrics.json", metrics, run_time,
                  {"source": "github.com/Sid-istic/financial-news-sentiment-dataset- (CC BY 4.0)"})


if __name__ == "__main__":
    main()
