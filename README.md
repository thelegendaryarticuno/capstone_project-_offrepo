# SPRPA — Stock Portfolio Risk & Performance Analytics

Capstone project: portfolio analytics for NSE stocks with three ML models (10-day volatility, anomaly detection, news sentiment).

| Folder | What | Owner |
|---|---|---|
| `application/backend` | Express REST API, SQLite, Firebase auth | Naman Mani |
| `application/frontend` | React + Tailwind + 21st.dev UI | Manav Kumar |
| `application/ml-service` | FastAPI service serving the three models | Naman Mani |
| `models/1_volatility_garch` | Model 1 training and evaluation | Manav Kumar |
| `models/2_anomaly_isolation_forest` | Model 2 training and evaluation | Anupam Raj |
| `models/3_sentiment_vader` | Model 3 training and evaluation | Rishabh Yadav |
| `deployment/` | Dockerfiles, nginx gateway, Jenkinsfile | Anupam Raj, Naman Mani |
| `scripts/` | `setup.ps1` / `setup.bat` (local setup), `fetch-models.ps1` (model download) | Naman Mani |
| `documents/` | SRS and SDD | Team |

## Quick start (Windows)

1. Put `application/.env` (copy `application/.env.example`) and the Firebase service-account JSON in `application/secrets/`.
2. Run `scripts\setup.bat` (or `.\scripts\setup.ps1 -Start`).
3. Open <http://localhost:5173>.

Details: [application/README.md](application/README.md) · Deployment: [deployment/README.md](deployment/README.md) · Backlog: [tasks.md](tasks.md)

## Model files

The trained models (~315 MB) are not in git. They are attached to the [`models-v1.0.0`](https://github.com/thelegendaryarticuno/capstone_project-_offrepo/releases/tag/models-v1.0.0) release; `scripts/fetch-models.ps1` downloads them and checks each SHA-256 against `application/ml-service/models/manifest.json`.

## Branches

`naman`, `manav`, `rishabh`, `anupam` → PR into `development` → PR into `master`. Jenkins builds and deploys `master` only.

Research and risk-education tool. Not investment advice.
