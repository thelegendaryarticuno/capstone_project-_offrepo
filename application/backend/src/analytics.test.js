import test from "node:test";
import assert from "node:assert/strict";
import { analyze, holdingsFrom } from "./analytics.js";
import { getHistory } from "./market.js";

process.env.MARKET_MODE = "synthetic";

test("holdingsFrom nets buys and sells", () => {
  const h = holdingsFrom([
    { symbol: "A.NS", type: "BUY", quantity: 10, price: 100, fees: 0 },
    { symbol: "A.NS", type: "SELL", quantity: 4, price: 120, fees: 0 },
  ]);
  assert.equal(h[0].qty, 6);
});

test("analyze yields sane, reproducible risk numbers", async () => {
  const syms = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS"];
  const histories = Object.fromEntries(await Promise.all(syms.map(async (s) => [s, await getHistory(s)])));
  const bench = await getHistory("^NSEI");
  const holdings = syms.map((symbol) => ({ symbol, qty: 10 }));
  const a = analyze({ holdings, histories, bench, sims: 500, horizon: 5 });
  const b = analyze({ holdings, histories, bench, sims: 500, horizon: 5 });
  assert.ok(a.metrics.vol > 0 && a.metrics.vol < 1);
  assert.ok(a.metrics.maxDrawdown <= 0);
  assert.ok(a.metrics.var.historical > 0 && a.metrics.var.cvar >= a.metrics.var.historical * 0.99);
  assert.equal(a.monteCarlo.var, b.monteCarlo.var); // fixed seed
  assert.ok(Math.abs(a.assets.reduce((s, x) => s + x.weight, 0) - 1) < 1e-9);
  assert.equal(a.corr.matrix[0][0], 1);
});

test("synthetic history has OHLCV bars with sane ranges", async () => {
  const h = await getHistory("ITC.NS");
  assert.equal(h.ohlcv.length, h.closes.length);
  assert.ok(h.closes.length >= 251); // GARCH minimum
  for (const b of h.ohlcv) assert.ok(b.high >= b.low && b.volume > 0);
});
