# SPRPA application

```
React + Tailwind (Vite :5173) --/api/v1--> Express (:4000) --REST--> FastAPI ML service (:8000)
        |                                     |
   Firebase Auth (email/password, Google)     +-- SQLite: application/database/sprpa.db
                                              +-- verifies Firebase ID tokens (service account in secrets/)
```

| Folder | What |
|---|---|
| `frontend/` | Login, Dashboard, Portfolio, Risk Lab, AI Insights. UI built on 21st.dev components (`src/components/ui/sidebar.tsx`, `login-card.tsx`, shadcn button/card/input) |
| `backend/` | Express REST API: portfolios, transactions, CSV import, demo portfolio, market data, risk analytics (SDD 4.4), proxies the 3 ML outputs and logs each run in `model_runs` |
| `ml-service/` | FastAPI: `/ml/volatility` (gradient boosting), `/ml/anomalies` (Isolation Forest per stock), `/ml/sentiment` (DistilBERT), `/health` with model cards |
| `database/` | all `.db` files (created on first start) |
| `ml-service/models/` | `manifest.json` + `MODEL_CARDS.md` in git; the `.joblib` files come from the `models-v1.0.0` release via `scripts/fetch-models.ps1` |

## Setup and run

One command (Windows) creates the Python venv, installs all packages, downloads the models and checks `.env`:

```powershell
.\scripts\setup.ps1          # or double-click scripts\setup.bat
.\scripts\setup.ps1 -Start   # same, then opens the 3 servers in their own windows
```

Before the first run, put `application/.env` (see `.env.example`) and the Firebase service-account JSON in `application/secrets/`. Neither is committed.

Manual start (3 terminals):

```powershell
cd application/ml-service; .\.venv\Scripts\python -m uvicorn main:app --port 8000
cd application/backend;    npm run dev
cd application/frontend;   npm run dev        # http://localhost:5173
```

Tests: `cd backend; npm test` (the AI test needs the ML service running) and `cd ml-service; .\.venv\Scripts\python -m pytest`.

Firebase console → Authentication → Sign-in method: enable **Email/Password** and **Google**; Authorized domains must include `localhost`.

## API (all under `/api/v1`, Bearer Firebase ID token)

`GET /portfolios` · `POST /portfolios` · `POST /portfolios/demo` · `DELETE /portfolios/:id` · `GET|POST /portfolios/:id/transactions` · `DELETE /portfolios/:id/transactions/:tid` · `POST /portfolios/:id/import` (text/csv) · `GET /portfolios/:id/analytics?range&conf&horizon&sims` · `GET /market/search?q` · `GET /market/quotes?symbols` · `GET /ai/volatility/:symbol` · `GET /ai/anomalies/:symbol` · `GET /ai/sentiment/:symbol` · `POST /news/import` (text/csv: Ticker,Headline,Date) · `GET /ai/runs` · `GET /health` · `GET /ready`

Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`.
