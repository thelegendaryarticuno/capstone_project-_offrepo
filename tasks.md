# SPRPA — Jira backlog

Stock Portfolio Risk & Performance Analytics (SPRPA). Hierarchy follows Jira: **Epic → Story → Task → Sub-task**.
Each item has an ID, an owner and a status: ✅ Done · 🔄 In progress · ⬜ To do.
Source documents: `documents/SP-RPA_SRS_v1.0.docx` (FR = functional requirement), `documents/SPRPA_Software_Design_Document.docx` (SDD).

## Team and ownership

| Member | Owns |
|---|---|
| **Naman Mani** | Backend (`application/backend`), ML service shell, deployment (shared), orchestration and final debugging |
| **Manav Kumar** | Model 1 — volatility forecast; frontend (`application/frontend`) |
| **Anupam Raj** | Model 2 — anomaly detection; deployment (shared) |
| **Rishabh Yadav** | Model 3 — news sentiment |

## Epic overview

| Epic | Title | Owner |
|---|---|---|
| SPRPA-E1 | Backend API (Express + SQLite + Firebase) | Naman Mani |
| SPRPA-E2 | Frontend (React + Tailwind + 21st.dev) | Manav Kumar |
| SPRPA-E3 | Model 1 — 10-day volatility forecast | Manav Kumar |
| SPRPA-E4 | Model 2 — anomaly detection | Anupam Raj |
| SPRPA-E5 | Model 3 — news sentiment | Rishabh Yadav |
| SPRPA-E6 | Deployment — Docker, nginx, Jenkins | Anupam Raj, Naman Mani |
| SPRPA-E7 | Orchestration, integration and final debugging | Naman Mani |

---

## SPRPA-E1 · Backend API (Express + SQLite + Firebase)
**Owner:** Naman Mani · **Covers:** FR-001–FR-026, FR-050, NFR-S-03, NFR-S-07 · **Folder:** `application/backend`

### SPRPA-S1.1 · Authentication and access control (FR-001–FR-004)
- ✅ **T1.1.1** Verify Firebase ID tokens with firebase-admin
  - ✅ Load the service account from `secrets/` via `FIREBASE_SA_FILE`
  - ✅ `requireAuth` middleware: bearer token, revocation check, 401 error format
  - ✅ Upsert the user row on every authenticated request
- ✅ **T1.1.2** Audit log for security-relevant actions (FR-004, FR-050)
  - ✅ `audit_log` table and `audit()` helper
  - ✅ Log portfolio create/delete, transaction create/delete, imports, demo creation
- ✅ **T1.1.3** Ownership checks (FR-002, BR-01)
  - ✅ `owned()` returns 404 for other users' portfolios (no IDOR leak)
  - ✅ Integration test: second user gets 404
- ⬜ **T1.1.4** Roles (INVESTOR / ANALYST / ADMIN) and admin-only routes (FR-049, FR-052)
  - ⬜ Add `role` checks to admin endpoints
  - ⬜ Admin view of health, queue and model status

### SPRPA-S1.2 · Database (SQLite in `application/database`)
- ✅ **T1.2.1** Schema with `node:sqlite`
  - ✅ Tables: users, portfolios, transactions, news, model_runs, audit_log
  - ✅ WAL mode, foreign keys, index on `transactions(portfolio_id)`
  - ✅ `DB_FILE` env var so Docker keeps the DB on a volume
- ⬜ **T1.2.2** Numbered migrations instead of one idempotent script
- ⬜ **T1.2.3** Backup / restore procedure for `sprpa.db`

### SPRPA-S1.3 · Portfolio and transaction management (FR-008, FR-009, FR-010, FR-016)
- ✅ **T1.3.1** Portfolio CRUD
  - ✅ `GET/POST /portfolios`, `DELETE /portfolios/:id`
  - ✅ Name validation (1–60 characters)
- ✅ **T1.3.2** Transactions
  - ✅ `GET/POST /portfolios/:id/transactions`, `DELETE …/:tid`
  - ✅ Validation: symbol, BUY/SELL, positive quantity, non-negative price/fees, past date
  - ✅ Reject SELL larger than the holding (422)
- ✅ **T1.3.3** CSV import (FR-008, FR-010, NFR-S-07)
  - ✅ 2 MB limit, `text/csv` only, max 5,000 rows
  - ✅ Per-row error report; valid rows imported in one transaction
  - ✅ Skip exact duplicates and report the count
- ✅ **T1.3.4** Labelled demo portfolio (FR-009, BR-03)
  - ✅ 8 NSE holdings, marked `is_demo`
  - ✅ Seed clearly labelled demo headlines for sentiment
- ⬜ **T1.3.5** Upstox broker connection (FR-005–FR-007) — blocked on approved Upstox onboarding (TBD-01)

### SPRPA-S1.4 · Market data (FR-011–FR-015)
- ✅ **T1.4.1** Yahoo Finance daily history with labelled synthetic fallback (DC-04, NFR-SA-03)
  - ✅ 3 years of OHLCV + adjusted close
  - ✅ 15-minute in-memory cache
  - ✅ `dataSource` label returned with every analytics response
- ✅ **T1.4.2** Symbol search and quotes (`/market/search`, `/market/quotes`)
- ⬜ **T1.4.3** Persist daily bars in a `price_daily` table (FR-012)
- ⬜ **T1.4.4** Data-quality checks: missing bars, zero volume, out-of-order dates (FR-014)

### SPRPA-S1.5 · Portfolio analytics (FR-016–FR-026, SDD 4.4)
- ✅ **T1.5.1** Performance
  - ✅ Value, cost basis, unrealized P&L
  - ✅ Total and annualised return vs NIFTY 50
  - ✅ Contribution to return per holding
- ✅ **T1.5.2** Risk metrics
  - ✅ Volatility, Sharpe, Sortino, beta, alpha, max drawdown
  - ✅ Historical, parametric and CVaR at 90 / 95 / 99%
  - ✅ Rolling 30-day volatility, correlation matrix
- ✅ **T1.5.3** Simulation and allocation
  - ✅ Monte Carlo with Cholesky and a fixed seed (FR-037)
  - ✅ Stress test: Σ weight × (1 + shock × beta) (FR-036)
  - ✅ Efficient frontier: max-Sharpe and min-volatility weights (FR-032–FR-035)
- ✅ **T1.5.4** Unit tests for formulas and reproducibility
- ⬜ **T1.5.5** Time-weighted and money-weighted returns (FR-018)
- ⬜ **T1.5.6** Backtesting with costs and turnover (FR-039, FR-040)

### SPRPA-S1.6 · AI endpoints and provenance (FR-027, FR-028)
- ✅ **T1.6.1** REST client to the ML service with internal key and 15 s timeout
- ✅ **T1.6.2** Proxy routes: `/ai/volatility`, `/ai/anomalies`, `/ai/sentiment`
- ✅ **T1.6.3** Record every model run in `model_runs` (model, version, parameters)
- ✅ **T1.6.4** News import endpoint (`/news/import`: Ticker, Headline, Date)
- ✅ **T1.6.5** `/system` endpoint for the Settings page (live connection checks)

### SPRPA-S1.7 · API hardening
- ✅ **T1.7.1** Helmet, CORS allow-list, rate limit (120/min), JSON size limit
- ✅ **T1.7.2** One error format `{ error: { code, message } }`
- ⬜ **T1.7.3** OpenAPI (Swagger) file for `/api/v1`
- ⬜ **T1.7.4** Report export with data and model provenance (FR-043)
- ⬜ **T1.7.5** Risk-threshold alerts (FR-044)

---

## SPRPA-E2 · Frontend (React + Tailwind + 21st.dev)
**Owner:** Manav Kumar · **Covers:** FR-041, FR-042, NFR-Q-07, NFR-SA-02 · **Folder:** `application/frontend`

### SPRPA-S2.1 · App shell and design system
- ✅ **T2.1.1** Vite + React 18 + Tailwind v4 with light/dark tokens
- ✅ **T2.1.2** 21st.dev components
  - ✅ Collapsible sidebar (wensity/sidebar)
  - ✅ Login form card (card-06) with shadcn button, card, input, field
- ✅ **T2.1.3** Shared kit: KPI tile with info tip, panel, segmented control, modal, badges, skeletons
- ✅ **T2.1.4** Custom portfolio dropdown matching the sidebar
- ✅ **T2.1.5** Thin, light custom scrollbars
- ⬜ **T2.1.6** Code-split the 1 MB bundle (lazy-load pages and charts)

### SPRPA-S2.2 · Sign-in (FR-001, FR-003)
- ✅ **T2.2.1** Email/password sign-in, registration and password reset
- ✅ **T2.2.2** Google sign-in (popup)
- ✅ **T2.2.3** Friendly Firebase error messages, sign-out, protected routes

### SPRPA-S2.3 · Dashboard (FR-017, FR-019, FR-041)
- ✅ **T2.3.1** KPIs: value and P&L, return vs NIFTY 50, volatility, VaR
- ✅ **T2.3.2** Charts: performance vs NIFTY 50, allocation donut, contribution bars
- ✅ **T2.3.3** Holdings table and 6M / 1Y / 2Y window filter

### SPRPA-S2.4 · Portfolio management (FR-008)
- ✅ **T2.4.1** Transaction table with delete
- ✅ **T2.4.2** Add-transaction modal with symbol suggestions
- ✅ **T2.4.3** CSV import modal with sample file and per-row errors
- ✅ **T2.4.4** Onboarding: load demo or start empty

### SPRPA-S2.5 · Risk Lab (FR-021–FR-026, FR-036–FR-038)
- ✅ **T2.5.1** VaR / CVaR / Monte Carlo KPIs with confidence, horizon and path controls
- ✅ **T2.5.2** Monte Carlo fan and outcome histogram
- ✅ **T2.5.3** Drawdown, rolling volatility, correlation heatmap
- ✅ **T2.5.4** Stress test bars, efficient frontier, suggested weights (labelled simulation)

### SPRPA-S2.6 · AI Insights (FR-028, FR-030)
- ✅ **T2.6.1** Volatility panel: forecast, baseline, past forecasts vs realized, 8 input features
- ✅ **T2.6.2** Anomaly panel: price chart with flagged days, severity table
- ✅ **T2.6.3** Sentiment panel: score gauge and per-headline labels
- ✅ **T2.6.4** Headline CSV import

### SPRPA-S2.7 · Settings
- ✅ **T2.7.1** Connected / Not connected status for 4 services and 3 models
- ✅ **T2.7.2** Model cards: headline accuracy, metrics, use for / do not use / main limit
- ✅ **T2.7.3** Firebase sign-in details and data counts

### SPRPA-S2.8 · Quality
- ⬜ **T2.8.1** Component tests with React Testing Library
- ⬜ **T2.8.2** End-to-end test: sign in → demo portfolio → every page (Playwright)
- ⬜ **T2.8.3** Accessibility pass: keyboard navigation, focus order, contrast

---

## SPRPA-E3 · Model 1 — 10-day volatility forecast
**Owner:** Manav Kumar · **Covers:** FR-027–FR-031 · **Artifact:** `application/ml-service/models/volatility_model.joblib`

### SPRPA-S3.1 · Data preparation
- ✅ **T3.1.1** Load NSE OHLCV for 100 stocks (Jan 2023 – 23 Nov 2026)
- ✅ **T3.1.2** Feature engineering (8 features)
  - ✅ High-low (Parkinson) volatility: 1, 5, 22 days
  - ✅ Close-to-close volatility: 22, 66 days
  - ✅ Market volatility (5 days), volume ratio, last return
- ⬜ **T3.1.3** Write the exact feature definitions into `MODELS.md` (needed so serving matches training)

### SPRPA-S3.2 · Baselines and training
- ✅ **T3.2.1** GARCH(1,1) baseline (SDD 4.5) — RMSE 10.91
- ✅ **T3.2.2** Trailing-volatility and calibrated regime baselines with confusion matrices
- ✅ **T3.2.3** Histogram gradient boosting model — RMSE 10.56, MAE 7.68
- ✅ **T3.2.4** Walk-forward evaluation on 2,500 forecasts (FR-029)

### SPRPA-S3.3 · Packaging and serving
- ✅ **T3.3.1** Export joblib bundle (model, features, horizon, versions, data cutoff)
- ✅ **T3.3.2** Model card (accuracy 46.8%, limits)
- ✅ **T3.3.3** `/ml/volatility` endpoint and backend route
- ⬜ **T3.3.4** Reject requests below the minimum history window with a clear message (FR-031) — check wording with the team
- ⬜ **T3.3.5** Feature-attribution view (FR-030)

---

## SPRPA-E4 · Model 2 — anomaly detection
**Owner:** Anupam Raj · **Covers:** SDD 4.5 · **Artifact:** `application/ml-service/models/anomaly_model.joblib`

### SPRPA-S4.1 · Features
- ✅ **T4.1.1** Daily return from close / previous close
- ✅ **T4.1.2** Volume z-score with a past-only 20-day window
- ✅ **T4.1.3** Display indicators: intraday range, opening gap, turnover

### SPRPA-S4.2 · Training and evaluation
- ✅ **T4.2.1** One Isolation Forest per stock (100 stocks, contamination 0.02, 300 trees)
- ✅ **T4.2.2** Evaluate with artificial shocks: accuracy 97.3%, precision 0.40, recall 0.75, F1 0.524
- ⬜ **T4.2.3** Review flagged days against real events (earnings, splits) and document findings

### SPRPA-S4.3 · Packaging and serving
- ✅ **T4.3.1** Export joblib bundle and model card
- ✅ **T4.3.2** `/ml/anomalies` endpoint with severity terciles
- ⬜ **T4.3.3** Fallback for stocks without a trained model (currently returns "No trained anomaly model")
- ⬜ **T4.3.4** Exclude known split/bonus dates so corporate actions aren't flagged

---

## SPRPA-E5 · Model 3 — news sentiment
**Owner:** Rishabh Yadav · **Covers:** SDD 4.5 · **Artifact:** `application/ml-service/models/sentiment_model.joblib`

### SPRPA-S5.1 · Data
- ✅ **T5.1.1** Financial PhraseBank training set (2,413 sentences)
- ✅ **T5.1.2** Indian headline test set (50 headlines) and Indian news dataset (Ticker, Headline, Date)
- ⬜ **T5.1.3** Confirm licence terms (PhraseBank is non-commercial) in the report

### SPRPA-S5.2 · Training and evaluation
- ✅ **T5.2.1** VADER baseline (standard and finance lexicon) — 56.8% / 52.0%
- ✅ **T5.2.2** Fine-tune DistilBERT — 91.5% benchmark, 72.0% on Indian headlines
- ✅ **T5.2.3** Confusion matrices and classification reports
- ⬜ **T5.2.4** Improve accuracy on Indian headlines (more Indian training data)

### SPRPA-S5.3 · Packaging and serving
- ✅ **T5.3.1** Export joblib bundle (model, tokenizer, labels, max 96 tokens)
- ✅ **T5.3.2** `/ml/sentiment` endpoint: mean of P(positive) − P(negative) over the latest 10 headlines
- 🔄 **T5.3.3** Submit model code through a PR into `development`
  - ⬜ Commit on the `rishabh` branch, not `master`
  - ⬜ Track `*.joblib` with Git LFS (file is 236 MB, GitHub limit is 100 MB)
  - ⬜ Open the PR into `development` using the prepared title and description
- ⬜ **T5.3.4** Connect a current news feed (stored news ends 2 July 2025)

---

## SPRPA-E6 · Deployment — Docker, nginx, Jenkins
**Owners:** Anupam Raj, Naman Mani · **Covers:** DC-02, NFR-Q-05 · **Folder:** `deployment/`

### SPRPA-S6.1 · Container images — Anupam Raj
- ✅ **T6.1.1** `Dockerfile.frontend`: Vite build → nginx, Firebase config as a BuildKit secret
- ✅ **T6.1.2** `Dockerfile.backend`: test stage + non-root runtime with `/data` volume
- ✅ **T6.1.3** `Dockerfile.ml`: pytest stage + non-root runtime
- ✅ **T6.1.4** `Dockerfile.nginx` and health checks on every image
- ✅ **T6.1.5** `.dockerignore` keeps `.env`, `secrets/` and `*.db` out of images
- ⬜ **T6.1.6** Update `Dockerfile.ml` for the real models (torch + transformers; image size)

### SPRPA-S6.2 · nginx gateway — Anupam Raj
- ✅ **T6.2.1** Route `/` → frontend, `/api/` → backend, `/ml/health` → ML; block other `/ml/*`
- ✅ **T6.2.2** Docker DNS resolver so containers can be recreated in any order
- ✅ **T6.2.3** Security headers, 2 MB body limit, API rate limit
- ⬜ **T6.2.4** HTTPS (self-signed or Let's Encrypt)

### SPRPA-S6.3 · Jenkins pipeline — Naman Mani
- ✅ **T6.3.1** Job `sprpa-pipeline`: Pipeline from SCM, fetches `master` only, polls every 2 min
- ✅ **T6.3.2** Jenkinsfile stages: preflight → parallel tests → build 4 images → deploy → smoke test
- ✅ **T6.3.3** Automatic rollback to the previous build if the smoke test fails
- ✅ **T6.3.4** Keep the last 3 image builds, prune the rest
- ✅ **T6.3.5** LocalSystem service fixes: Docker Desktop path and buildx config
- ⬜ **T6.3.6** Restore `deployment/` on `master` so builds pass again

### SPRPA-S6.4 · Secrets — Naman Mani
- ✅ **T6.4.1** Jenkins credentials: `sprpa-env`, `sprpa-firebase`, `sprpa-ml-internal-key`
- ✅ **T6.4.2** Service account copied into the running container only, never into an image
- ⬜ **T6.4.3** Rotate the ML internal key and document the rotation steps

### SPRPA-S6.5 · Git workflow — Naman Mani, Anupam Raj
- ✅ **T6.5.1** Branches: `master`, `development`, `naman`, `manav`, `rishabh`, `anupam`
- ⬜ **T6.5.2** GitHub branch protection: no direct pushes to `master`; PR + 1 review required
- ⬜ **T6.5.3** Git LFS for model files across the repo

---

## SPRPA-E7 · Orchestration, integration and final debugging
**Owner:** Naman Mani · **Covers:** NFR-SA-04, FR-048, FR-051

### SPRPA-S7.1 · ML service shell
- ✅ **T7.1.1** FastAPI app with internal-key check and lifespan model loading
- ✅ **T7.1.2** Load the three joblib bundles once at startup, CPU mapping for the CUDA-saved model
- ✅ **T7.1.3** `/health` with per-model checks and parsed `MODEL_CARDS.md`
- ✅ **T7.1.4** Return 503 instead of invented numbers when a model is unavailable

### SPRPA-S7.2 · End-to-end integration
- ✅ **T7.2.1** Frontend → backend → ML → SQLite flow on local servers
- ✅ **T7.2.2** Backend integration test with stubbed Firebase (portfolio flow, ownership, all 3 models)
- ✅ **T7.2.3** Live Yahoo data check for all three models
- ✅ **T7.2.4** Jenkins build #3 deployed all 4 containers and passed the smoke test
- ⬜ **T7.2.5** Re-run the full Jenkins deploy with the real models

### SPRPA-S7.3 · Repository hygiene
- ✅ **T7.3.1** Removed a direct commit to `master` (`5a19728`, 10 files under `models/3_sentiment_vader/`)
- ⬜ **T7.3.2** Merge model work from `development` into `master` via reviewed PRs

### SPRPA-S7.4 · Final debugging and demo readiness
- ⬜ **T7.4.1** Bug bash on every page with the demo portfolio
  - ⬜ Dashboard, Portfolio, Risk Lab, AI Insights, Settings
  - ⬜ Light and dark theme, narrow screens
- ⬜ **T7.4.2** Fix all S1 (wrong number / system down) and S2 (major feature broken) defects
- ⬜ **T7.4.3** Final demo run: Jenkins build → :8080 → sign in → full walkthrough
- ⬜ **T7.4.4** Project report: model accuracy numbers, limits, disclaimers (NFR-SA-02)
