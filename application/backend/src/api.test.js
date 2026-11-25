// Integration test: real routes + real SQLite (temp file), Firebase verification stubbed.
// AI routes need the ML service on ML_URL; they are skipped if it is down.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import admin from "firebase-admin";

process.env.MARKET_MODE = "synthetic";
process.env.PORT = "4199";
process.env.DB_FILE = path.join(os.tmpdir(), `sprpa-test-${process.pid}.db`);
const { server } = await import("./index.js");
Object.defineProperty(admin, "auth", { value: () => ({ verifyIdToken: async (t) => ({ uid: t, email: `${t}@test.local` }) }) });
after(() => server.close());

const call = async (p, { user = "alice", method = "GET", body, csv } = {}) => {
  const res = await fetch(`http://localhost:4199/api/v1${p}`, {
    method, headers: { Authorization: `Bearer ${user}`, "Content-Type": csv ? "text/csv" : "application/json" },
    body: csv ?? (body && JSON.stringify(body)),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

test("portfolio flow, ownership and analytics", async () => {
  const demo = await call("/portfolios/demo", { method: "POST" });
  assert.equal(demo.status, 201);
  const id = demo.body.id;
  assert.equal((await call(`/portfolios/${id}/transactions`, { user: "mallory" })).status, 404); // IDOR
  const sell = await call(`/portfolios/${id}/transactions`, { method: "POST", body: { symbol: "ITC", type: "SELL", quantity: 9999, price: 1, trade_date: "2025-01-01" } });
  assert.equal(sell.status, 422);
  const imp = await call(`/portfolios/${id}/import`, { method: "POST", csv: "symbol,type,quantity,price,trade_date\nWIPRO,BUY,5,500,2025-02-03\nWIPRO,BUY,5,500,2025-02-03\nBAD!,BUY,1,1,2025-01-01\n" });
  assert.deepEqual([imp.body.imported, imp.body.duplicates, imp.body.errors.length], [1, 1, 1]);
  const a = await call(`/portfolios/${id}/analytics?range=1y`);
  assert.equal(a.status, 200);
  assert.equal(a.body.assets.length, 9);
});

test("AI outputs via ML service", async (t) => {
  const ready = await call("/ready");
  if (ready.body.ml !== "ok") return t.skip("ML service not running");
  const v = await call("/ai/volatility/RELIANCE");
  assert.equal(v.status, 200);
  assert.ok(v.body.forecast_pct > 0 && v.body.history.length > 0);
  const an = await call("/ai/anomalies/RELIANCE");
  assert.ok(an.body.anomalies.length > 0 && an.body.anomalies.every((x) => x.is_anomaly));
  const s = await call("/ai/sentiment/RELIANCE"); // demo headlines seeded by the demo portfolio
  assert.ok(s.body.available && s.body.score >= -1 && s.body.score <= 1);
  assert.equal((await call("/ai/sentiment/ZOMATO")).body.available, false);
});

test("system status for settings page", async () => {
  const s = await call("/system");
  assert.equal(s.status, 200);
  assert.equal(s.body.services.database.connected, true);
  assert.equal(s.body.auth.uid, "alice");
  if (s.body.services.ml.status === "ok") assert.deepEqual(s.body.models.map((m) => m.id), ["volatility", "anomaly", "sentiment"]);
});
