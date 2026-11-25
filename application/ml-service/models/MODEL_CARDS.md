# SPRPA model cards (26 November 2026)

## Card 1: Volatility forecast

| Item | Detail |
|---|---|
| Model | Histogram gradient boosting (scikit-learn); replaces GARCH(1,1) |
| Files | `volatility_model.pkl`, `volatility_model.joblib` |
| Task | Forecast annualised volatility for the next 10 trading days |
| Input | 8 features from past prices and volume |
| Output | Volatility, percent |
| Data | 100 NSE stocks, January 2023 to 23 November 2026 |
| **Accuracy** (Low/Medium/High) | **46.8%** (macro F1 0.46) |
| RMSE | 10.56 volatility points (GARCH 10.91) |
| Mean absolute error | 7.68 points |
| Median absolute error | 25.4% |
| Tested on | 2,500 forecasts, using only earlier data for each |
| Use for | Showing a risk estimate |
| Do not use for | Predicting prices or buy/sell decisions |
| Main limit | Level accuracy equals a simple 30-day average (46.6%) |

## Card 2: Anomaly detection

| Item | Detail |
|---|---|
| Model | Isolation Forest (scikit-learn), one per stock; as in the design document |
| Files | `anomaly_model.pkl`, `anomaly_model.joblib` |
| Task | Flag unusual trading days |
| Input | Daily return, volume z-score |
| Output | Anomaly flag and score (lower is more unusual) |
| Data | 100 NSE stocks, 93,689 scored days |
| **Accuracy** (artificial shocks) | **97.3%**, but flagging nothing gets 98.0% |
| Precision | 0.40 |
| Recall | 0.75 |
| F1 | 0.524 |
| Days flagged | 1,885 (2% setting) |
| Tested on | Artificial shocks inserted into later data; no real labels exist |
| Use for | Drawing attention to unusual days |
| Do not use for | Detecting fraud or trading signals |
| Main limit | Real-world accuracy is unknown |

## Card 3: News sentiment

| Item | Detail |
|---|---|
| Model | DistilBERT, fine-tuned; replaces VADER |
| Files | `sentiment_model.pkl`, `sentiment_model.joblib` |
| Task | Classify finance headlines |
| Input | Headline text (English) |
| Output | Negative / neutral / positive, score from -1 to +1 |
| Training data | Financial PhraseBank, 2,413 sentences (non-commercial licence) |
| **Accuracy**, benchmark (518 sentences) | **91.5%** (macro F1 0.89) |
| **Accuracy**, Indian headlines (50) | **72.0%** (macro F1 0.68) |
| Precision / recall, benchmark (macro) | 0.90 / 0.88 |
| VADER on the same tests | 56.8% and 52.0% |
| Use for | Summarising the tone of recent news |
| Do not use for | Investment decisions |
| Main limit | Much weaker on Indian headlines; stored news ends 2 July 2025 |

Full details are in `MODELS.md`.
