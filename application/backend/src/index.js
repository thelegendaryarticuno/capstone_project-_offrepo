import crypto from "node:crypto";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { parse } from "csv-parse/sync";
import { one, all, run, tx, DB_FILE } from "./db.js";
import { requireAuth, audit, adminProjectId } from "./auth.js";
import { getHistory, getQuote, normalizeSymbol, UNIVERSE, BENCH } from "./market.js";
import { analyze, holdingsFrom } from "./analytics.js";
import { ml, MlError } from "./ml.js";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"] }));
app.use(express.json({ limit: "100kb" }));
app.use(express.text({ type: "text/csv", limit: "2mb" })); // SDD: CSV max 2 MB
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

const err = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  if (e instanceof MlError) return err(res, e.status, e.code, e.message);
  console.error(e); err(res, 500, "INTERNAL", "Something went wrong");
});
const r = express.Router();
const uuid = () => crypto.randomUUID();

r.get("/health", (_q, res) => res.json({ status: "ok" }));
r.get("/ready", wrap(async (_q, res) => {
  one("SELECT 1");
  const m = await ml("/health").catch(() => null);
  res.json({ status: "ready", db: "ok", ml: m ? "ok" : "unavailable" });
}));

r.use(requireAuth);
r.get("/me", (req, res) => res.json(req.user));

// Settings page: live connection checks for every dependency.
r.get("/system", wrap(async (req, res) => {
  const t0 = Date.now();
  const health = await ml("/health").catch(() => null);
  const mlMs = Date.now() - t0;
  let dbOk = true;
  try { one("SELECT 1"); } catch { dbOk = false; }
  const webProject = process.env.VITE_FIREBASE_PROJECT_ID || null;
  const fbOk = !!webProject && webProject === adminProjectId; // token was just verified by firebase-admin, so the link itself is live
  const runs = Object.fromEntries(all("SELECT model, count(*) AS n, max(created_at) AS last FROM model_runs WHERE uid=? GROUP BY model", req.uid).map((x) => [x.model, x]));
  const runKey = { volatility: "HistGradientBoosting", anomaly: "IsolationForest", sentiment: "DistilBERT" };
  res.json({
    services: {
      backend: { connected: true, reason: `Node ${process.version} · up ${Math.round(process.uptime() / 60)} min`, port: Number(process.env.PORT || 4000) },
      ml: { connected: !!health, url: process.env.ML_URL || "http://localhost:8000", latencyMs: health ? mlMs : null,
        reason: health ? `Responded in ${mlMs} ms` : "No response from ML service" },
      database: { connected: dbOk, engine: "SQLite", file: path.basename(DB_FILE), reason: dbOk ? "Query OK" : "Query failed" },
      firebase: { connected: fbOk, reason: fbOk ? "Token verified by firebase-admin" : `Web project (${webProject}) and service account (${adminProjectId}) differ` },
    },
    models: (health?.models || []).map((m) => ({ ...m, runs: runs[runKey[m.id]]?.n || 0, lastRun: runs[runKey[m.id]]?.last || null })),
    auth: { provider: "Firebase Authentication", projectId: webProject, adminProjectId, methods: ["Email / password", "Google"],
      signedInWith: req.user.provider, email: req.user.email, uid: req.uid, tokenVerification: "firebase-admin verifyIdToken (revocation checked)" },
    data: {
      market: process.env.MARKET_MODE === "synthetic" ? "Synthetic demo prices" : "Yahoo Finance daily (delayed), synthetic fallback",
      portfolios: one("SELECT count(*) AS n FROM portfolios WHERE uid=?", req.uid).n,
      transactions: one("SELECT count(*) AS n FROM transactions t JOIN portfolios p ON p.id=t.portfolio_id WHERE p.uid=?", req.uid).n,
      headlines: one("SELECT count(*) AS n FROM news").n,
      modelRuns: one("SELECT count(*) AS n FROM model_runs WHERE uid=?", req.uid).n,
    },
  });
}));

// ---- market
r.get("/market/search", (req, res) => {
  const q = String(req.query.q || "").toLowerCase();
  res.json(UNIVERSE.filter((u) => u[0].toLowerCase().includes(q) || u[1].toLowerCase().includes(q)).slice(0, 8)
    .map(([symbol, name, sector]) => ({ symbol, name, sector })));
});
r.get("/market/quotes", wrap(async (req, res) => {
  const syms = String(req.query.symbols || "").split(",").map(normalizeSymbol).filter(Boolean).slice(0, 20);
  res.json(await Promise.all(syms.map(getQuote)));
}));

// ---- portfolios (404 rather than 403 on foreign ids: don't leak existence)
function owned(req, res) {
  const p = one("SELECT * FROM portfolios WHERE id=? AND uid=?", String(req.params.id), req.uid);
  if (!p) err(res, 404, "NOT_FOUND", "Portfolio not found");
  return p;
}

r.get("/portfolios", (req, res) => {
  res.json(all(`SELECT p.id,p.name,p.is_demo,p.created_at,
      (SELECT count(*) FROM transactions t WHERE t.portfolio_id=p.id) AS tx_count
    FROM portfolios p WHERE uid=? ORDER BY created_at`, req.uid).map((p) => ({ ...p, is_demo: !!p.is_demo })));
});

r.post("/portfolios", (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (name.length < 1 || name.length > 60) return err(res, 400, "VALIDATION_ERROR", "name must be 1-60 characters");
  const id = uuid();
  run("INSERT INTO portfolios(id,uid,name) VALUES(?,?,?)", id, req.uid, name);
  audit(req, "portfolio.create", id);
  res.status(201).json({ id, name, is_demo: false });
});

const DEMO = [["RELIANCE.NS", 40], ["TCS.NS", 20], ["HDFCBANK.NS", 60], ["INFY.NS", 50], ["ITC.NS", 200], ["SBIN.NS", 80], ["SUNPHARMA.NS", 35], ["TITAN.NS", 18]];
// Templated, clearly-labelled demo headlines so the sentiment pipeline has input before Dataset B is imported.
const DEMO_NEWS = ["{n} quarterly results beat street estimates", "{n} shares slip as margins come under pressure", "Brokerage upgrades {n} on strong order book",
  "{n} announces board meeting to consider dividend", "{n} faces regulatory probe over disclosures", "{n} expands capacity with new plant investment"];

r.post("/portfolios/demo", wrap(async (req, res) => {
  const id = uuid();
  const date = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const prices = await Promise.all(DEMO.map(([s]) => getHistory(s)));
  tx(() => {
    run("INSERT INTO portfolios(id,uid,name,is_demo) VALUES(?,?,'Demo Portfolio (sample holdings)',1)", id, req.uid);
    DEMO.forEach(([symbol, qty], i) => {
      const h = prices[i];
      run("INSERT INTO transactions(id,portfolio_id,symbol,type,quantity,price,trade_date,source) VALUES(?,?,?,'BUY',?,?,?,'DEMO')",
        uuid(), id, symbol, qty, h.closes[Math.max(0, h.closes.length - 300)], date);
      const name = UNIVERSE.find((u) => u[0] === symbol)[1];
      DEMO_NEWS.forEach((t, k) => run("INSERT OR IGNORE INTO news(ticker,headline,date,source) VALUES(?,?,?,'demo')",
        symbol.replace(".NS", ""), t.replace("{n}", name), new Date(Date.now() - (k * 3 + 1) * 864e5).toISOString().slice(0, 10)));
    });
  });
  audit(req, "portfolio.demo", id);
  res.status(201).json({ id, name: "Demo Portfolio (sample holdings)", is_demo: true });
}));

r.delete("/portfolios/:id", (req, res) => {
  const p = owned(req, res); if (!p) return;
  run("DELETE FROM portfolios WHERE id=?", p.id);
  audit(req, "portfolio.delete", p.id);
  res.status(204).end();
});

// ---- transactions
function validTx(b) {
  const symbol = normalizeSymbol(b.symbol);
  const type = String(b.type || "").toUpperCase();
  const quantity = Number(b.quantity), price = Number(b.price), fees = Number(b.fees || 0);
  const date = String(b.trade_date || "");
  if (!symbol) return "invalid symbol";
  if (!["BUY", "SELL"].includes(type)) return "type must be BUY or SELL";
  if (!(quantity > 0)) return "quantity must be positive";
  if (!(price >= 0) || !(fees >= 0)) return "price and fees must be non-negative";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || Date.parse(date) > Date.now()) return "trade_date must be a past YYYY-MM-DD date";
  return { symbol, type, quantity, price, fees, date };
}
const holdingQty = (pid, symbol) => holdingsFrom(all("SELECT symbol,type,quantity,price,fees FROM transactions WHERE portfolio_id=? AND symbol=?", pid, symbol))[0]?.qty || 0;

r.get("/portfolios/:id/transactions", (req, res) => {
  const p = owned(req, res); if (!p) return;
  res.json(all("SELECT id,symbol,type,quantity,price,fees,trade_date,source FROM transactions WHERE portfolio_id=? ORDER BY trade_date DESC, created_at DESC", p.id));
});

r.post("/portfolios/:id/transactions", (req, res) => {
  const p = owned(req, res); if (!p) return;
  const t = validTx(req.body || {});
  if (typeof t === "string") return err(res, 400, "VALIDATION_ERROR", t);
  if (t.type === "SELL" && holdingQty(p.id, t.symbol) < t.quantity) return err(res, 422, "INSUFFICIENT_HOLDING", `Cannot sell more ${t.symbol} than you hold`);
  const id = uuid();
  run("INSERT INTO transactions(id,portfolio_id,symbol,type,quantity,price,fees,trade_date) VALUES(?,?,?,?,?,?,?,?)", id, p.id, t.symbol, t.type, t.quantity, t.price, t.fees, t.date);
  audit(req, "transaction.create", id);
  res.status(201).json({ id });
});

r.delete("/portfolios/:id/transactions/:tid", (req, res) => {
  const p = owned(req, res); if (!p) return;
  run("DELETE FROM transactions WHERE id=? AND portfolio_id=?", String(req.params.tid), p.id);
  audit(req, "transaction.delete", req.params.tid);
  res.status(204).end();
});

// CSV: symbol,type,quantity,price,trade_date[,fees]. Valid rows import in one transaction; bad rows reported. Exact duplicates skipped (FR-010).
r.post("/portfolios/:id/import", (req, res) => {
  const p = owned(req, res); if (!p) return;
  if (typeof req.body !== "string") return err(res, 415, "UNSUPPORTED", "Send the file as text/csv");
  let records;
  try { records = parse(req.body, { columns: (h) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true }); }
  catch { return err(res, 422, "BAD_CSV", "Could not parse CSV"); }
  if (records.length > 5000) return err(res, 413, "TOO_LARGE", "Max 5000 rows");
  const errors = [], good = [];
  let duplicates = 0;
  records.forEach((row, i) => { const t = validTx(row); typeof t === "string" ? errors.push({ row: i + 2, message: t }) : good.push(t); });
  tx(() => {
    for (const t of good) {
      if (one("SELECT 1 FROM transactions WHERE portfolio_id=? AND symbol=? AND type=? AND quantity=? AND price=? AND trade_date=?", p.id, t.symbol, t.type, t.quantity, t.price, t.date)) { duplicates++; continue; }
      run("INSERT INTO transactions(id,portfolio_id,symbol,type,quantity,price,fees,trade_date,source) VALUES(?,?,?,?,?,?,?,?,'CSV')", uuid(), p.id, t.symbol, t.type, t.quantity, t.price, t.fees, t.date);
    }
  });
  audit(req, "portfolio.import", p.id);
  res.json({ imported: good.length - duplicates, duplicates, errors });
});

// ---- portfolio analytics (Node, SDD 4.4 formulas)
r.get("/portfolios/:id/analytics", wrap(async (req, res) => {
  const p = owned(req, res); if (!p) return;
  const days = { "6m": 126, "1y": 252, "2y": 504 }[req.query.range] || 252;
  const conf = [0.9, 0.95, 0.99].includes(Number(req.query.conf)) ? Number(req.query.conf) : 0.95;
  const horizon = Math.min(30, Math.max(1, parseInt(req.query.horizon) || 1));
  const sims = Math.min(20000, Math.max(500, parseInt(req.query.sims) || 5000));
  const hold = holdingsFrom(all("SELECT symbol,type,quantity,price,fees FROM transactions WHERE portfolio_id=?", p.id));
  if (!hold.length) return res.json({ empty: true });
  const symbols = hold.map((h) => h.symbol);
  const [bench, ...hs] = await Promise.all([getHistory(BENCH), ...symbols.map(getHistory)]);
  const histories = Object.fromEntries(symbols.map((s, i) => [s, hs[i]]));
  const short = symbols.filter((s) => histories[s].closes.length < 60);
  if (short.length) return err(res, 422, "INSUFFICIENT_HISTORY", `Not enough price history for ${short.join(", ")}`);
  const result = analyze({ holdings: hold, histories, bench, days, conf, horizon, sims, seed: parseInt(req.query.seed) || 42 });
  const sources = new Set([bench.source, ...hs.map((h) => h.source)]);
  const cost = hold.reduce((s, h) => s + h.qty * h.avgCost, 0);
  res.json({ ...result, invested: cost, pnl: result.value - cost, dataSource: sources.size === 1 ? [...sources][0] : "mixed", holdingsRaw: hold });
}));

// ---- AI / ML outputs (proxied to FastAPI; every run is recorded for provenance, FR-028)
function record(req, symbol, model, params, result) {
  run("INSERT INTO model_runs(id,uid,symbol,model,model_version,params_json,result_json) VALUES(?,?,?,?,?,?,?)",
    uuid(), req.uid, symbol, model, result.model_version || null, JSON.stringify(params), JSON.stringify(result));
}
const symOr400 = (req, res) => { const s = normalizeSymbol(req.params.symbol); if (!s) err(res, 400, "VALIDATION_ERROR", "invalid symbol"); return s; };

// Output 1: 10-day volatility (gradient boosting). Input: OHLCV bars + NIFTY 50 closes for market volatility.
r.get("/ai/volatility/:symbol", wrap(async (req, res) => {
  const symbol = symOr400(req, res); if (!symbol) return;
  const [h, bench] = await Promise.all([getHistory(symbol), getHistory(BENCH)]);
  const bars = h.ohlcv.slice(-400);
  const market = bench.dates.map((date, i) => ({ date, close: bench.closes[i] }));
  const out = await ml("/ml/volatility", { symbol, bars, market, history_days: 120 });
  record(req, symbol, "HistGradientBoosting", { n: bars.length, horizon: out.horizon_days }, { ...out, history: undefined });
  res.json({ ...out, dataSource: h.source });
}));

// Output 2: Isolation Forest anomalies. Input: raw OHLCV bars.
r.get("/ai/anomalies/:symbol", wrap(async (req, res) => {
  const symbol = symOr400(req, res); if (!symbol) return;
  const h = await getHistory(symbol);
  const bars = h.ohlcv.slice(-504);
  const out = await ml("/ml/anomalies", { symbol, bars, contamination: 0.02, volume_window: 20 });
  record(req, symbol, "IsolationForest", { n: bars.length, contamination: 0.02 }, { ...out, rows: undefined });
  res.json({ ...out, dataSource: h.source, prices: bars.map((b) => ({ date: b.date, close: b.close })) });
}));

// Output 3: DistilBERT sentiment over the latest 10 headlines.
r.get("/ai/sentiment/:symbol", wrap(async (req, res) => {
  const symbol = symOr400(req, res); if (!symbol) return;
  const ticker = symbol.replace(/\.(NS|BO)$/, "");
  const rows = all("SELECT headline, date, source FROM news WHERE ticker=? GROUP BY headline ORDER BY date DESC LIMIT 10", ticker);
  if (!rows.length) return res.json({ symbol, available: false, message: "Sentiment unavailable: no headlines for this ticker" });
  const out = await ml("/ml/sentiment", { symbol, headlines: rows.map((x) => ({ headline: x.headline, date: x.date })) });
  record(req, symbol, "DistilBERT", { n: rows.length }, out);
  res.json({ ...out, available: true, newsSource: [...new Set(rows.map((x) => x.source))].join(", ") });
}));

// Dataset B import: CSV with Ticker,Headline,Date (other columns ignored — never used as model input).
r.post("/news/import", (req, res) => {
  if (typeof req.body !== "string") return err(res, 415, "UNSUPPORTED", "Send the file as text/csv");
  let records;
  try { records = parse(req.body, { columns: (h) => h.map((x) => x.trim().toLowerCase()), skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }); }
  catch { return err(res, 422, "BAD_CSV", "Could not parse CSV"); }
  let imported = 0, skipped = 0;
  tx(() => records.forEach((x) => {
    const t = String(x.ticker || "").toUpperCase().replace(/\.(NS|BO)$/, ""), hl = String(x.headline || "").slice(0, 500), d = String(x.date || "").slice(0, 10);
    if (!/^[A-Z0-9&-]{1,20}$/.test(t) || !hl || isNaN(Date.parse(d))) return skipped++;
    imported += Number(run("INSERT OR IGNORE INTO news(ticker,headline,date,source) VALUES(?,?,?,'dataset')", t, hl, d).changes);
  }));
  audit(req, "news.import", String(imported));
  res.json({ imported, skipped });
});

r.get("/ai/runs", (req, res) => res.json(all("SELECT id,symbol,model,model_version,created_at FROM model_runs WHERE uid=? ORDER BY created_at DESC LIMIT 20", req.uid)));

app.use("/api/v1", r);
app.use((_q, res) => err(res, 404, "NOT_FOUND", "Route not found"));

const port = process.env.PORT || 4000;
export const server = app.listen(port, () => console.log(`SPRPA backend listening on :${port}`));
