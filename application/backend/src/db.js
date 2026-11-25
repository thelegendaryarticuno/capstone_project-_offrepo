import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

// All .db files live in application/database/
export const DB_FILE = process.env.DB_FILE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../database/sprpa.db");
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

// Money columns are REAL in SQLite; fine at INR-paise precision for an analytics app.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY, email TEXT, name TEXT, photo TEXT,
    role TEXT NOT NULL DEFAULT 'INVESTOR',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS portfolios (
    id TEXT PRIMARY KEY,
    uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
    name TEXT NOT NULL, benchmark TEXT NOT NULL DEFAULT '^NSEI',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('BUY','SELL')),
    quantity REAL NOT NULL CHECK (quantity > 0),
    price REAL NOT NULL CHECK (price >= 0),
    fees REAL NOT NULL DEFAULT 0,
    trade_date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'MANUAL',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS tx_portfolio_idx ON transactions(portfolio_id);
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL, headline TEXT NOT NULL, date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'sample',
    UNIQUE (ticker, headline)
  );
  CREATE TABLE IF NOT EXISTS model_runs (
    id TEXT PRIMARY KEY, uid TEXT, symbol TEXT NOT NULL,
    model TEXT NOT NULL, model_version TEXT, params_json TEXT, result_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, action TEXT, resource TEXT,
    ip TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
`);

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}
