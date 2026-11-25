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
| `ml-service/` | FastAPI: `/ml/garch`, `/ml/anomalies`, `/ml/sentiment` (**dummy numbers, final schemas**) |
| `database/` | all `.db` files (created on first start) |
| `../models/` | future `.joblib` artifacts (see `models/README.md`) |

## Run (3 terminals)

```powershell
cd ml-service; pip install -r requirements.txt; python -m uvicorn main:app --port 8000
cd backend;    npm i; npm run dev
cd frontend;   npm i; npm run dev        # http://localhost:5173
```

Tests: `cd backend; npm test` (the AI test needs the ML service running) and `cd ml-service; python -m pytest`.

Firebase console → Authentication → Sign-in method: enable **Email/Password** and **Google**; Authorized domains must include `localhost`.

## API (all under `/api/v1`, Bearer Firebase ID token)

`GET /portfolios` · `POST /portfolios` · `POST /portfolios/demo` · `DELETE /portfolios/:id` · `GET|POST /portfolios/:id/transactions` · `DELETE /portfolios/:id/transactions/:tid` · `POST /portfolios/:id/import` (text/csv) · `GET /portfolios/:id/analytics?range&conf&horizon&sims` · `GET /market/search?q` · `GET /market/quotes?symbols` · `GET /ai/volatility/:symbol` · `GET /ai/anomalies/:symbol` · `GET /ai/sentiment/:symbol` · `POST /news/import` (text/csv: Ticker,Headline,Date) · `GET /ai/runs` · `GET /health` · `GET /ready`

Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }`.
