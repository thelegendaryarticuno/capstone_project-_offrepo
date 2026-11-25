// Market data: Yahoo Finance chart API with a labelled, seeded synthetic fallback
// (SRS DC-04: unsupported/unavailable feeds must be labelled demo data, never passed off as live).

export const UNIVERSE = [
  ["RELIANCE.NS", "Reliance Industries", "Energy", 2900],
  ["TCS.NS", "Tata Consultancy Services", "IT", 4100],
  ["HDFCBANK.NS", "HDFC Bank", "Financials", 1650],
  ["INFY.NS", "Infosys", "IT", 1750],
  ["ICICIBANK.NS", "ICICI Bank", "Financials", 1250],
  ["HINDUNILVR.NS", "Hindustan Unilever", "FMCG", 2450],
  ["ITC.NS", "ITC", "FMCG", 470],
  ["SBIN.NS", "State Bank of India", "Financials", 820],
  ["BHARTIARTL.NS", "Bharti Airtel", "Telecom", 1600],
  ["KOTAKBANK.NS", "Kotak Mahindra Bank", "Financials", 1850],
  ["LT.NS", "Larsen & Toubro", "Industrials", 3600],
  ["AXISBANK.NS", "Axis Bank", "Financials", 1150],
  ["ASIANPAINT.NS", "Asian Paints", "Materials", 2400],
  ["MARUTI.NS", "Maruti Suzuki", "Auto", 12500],
  ["SUNPHARMA.NS", "Sun Pharma", "Pharma", 1750],
  ["TITAN.NS", "Titan Company", "Consumer", 3300],
  ["WIPRO.NS", "Wipro", "IT", 560],
  ["ULTRACEMCO.NS", "UltraTech Cement", "Materials", 11500],
  ["TATAMOTORS.NS", "Tata Motors", "Auto", 780],
  ["TATASTEEL.NS", "Tata Steel", "Materials", 160],
  ["NTPC.NS", "NTPC", "Utilities", 380],
  ["POWERGRID.NS", "Power Grid", "Utilities", 320],
  ["BAJFINANCE.NS", "Bajaj Finance", "Financials", 7000],
  ["HCLTECH.NS", "HCL Technologies", "IT", 1800],
  ["ADANIENT.NS", "Adani Enterprises", "Industrials", 2500],
  ["ZOMATO.NS", "Zomato", "Consumer", 260],
];
const BASE = Object.fromEntries(UNIVERSE.map((u) => [u[0], u[3]]));
export const BENCH = "^NSEI";
const TTL = 15 * 60 * 1000;
const cache = new Map();

export function normalizeSymbol(s) {
  s = String(s || "").trim().toUpperCase();
  if (!/^[A-Z0-9&.\-^]{1,20}$/.test(s)) return null;
  return s.startsWith("^") || s.includes(".") ? s : `${s}.NS`;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

function tradingDays(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

// Single-factor model so synthetic stocks correlate with the synthetic index.
function synthetic(symbol, n = 760) {
  const dates = tradingDays(n);
  const mk = rng(hash("MARKET"));
  const own = rng(hash(symbol));
  const isIdx = symbol === BENCH;
  const beta = isIdx ? 1 : 0.6 + (hash(symbol) % 80) / 100;
  const idio = isIdx ? 0 : 0.011 + (hash(symbol + "v") % 8) / 1000;
  const mu = isIdx ? 0.00045 : 0.0003 + (hash(symbol + "m") % 6) / 10000;
  let p = isIdx ? 24000 : BASE[symbol] || 200 + (hash(symbol) % 3000);
  const closes = [], bars = [];
  const baseVol = 2e5 + (hash(symbol + "q") % 40) * 1e5;
  for (let i = 0; i < n; i++) {
    const m = 0.009 * gauss(mk);
    const shock = !isIdx && own() < 0.01 ? 0.05 * Math.sign(gauss(own)) : 0; // rare jumps so anomalies exist
    const r = isIdx ? 0.00045 + m : mu + beta * m + idio * gauss(own) + shock;
    const prev = p;
    p *= 1 + r;
    closes.push(p);
    const open = prev * (1 + 0.003 * gauss(own));
    const span = Math.abs(r) + 0.006 * Math.abs(gauss(own));
    bars.push({ prev, open, high: Math.max(open, p) * (1 + span / 2), low: Math.min(open, p) * (1 - span / 2), close: p,
      volume: Math.round(baseVol * Math.exp(0.35 * gauss(own)) * (shock ? 3 : 1)) });
  }
  // anchor last close near BASE so the numbers look plausible
  const anchor = isIdx ? 24000 : BASE[symbol] || closes.at(-1);
  const k = anchor / closes.at(-1);
  const f = (x) => +(x * k).toFixed(2);
  const ohlcv = bars.map((b, i) => ({ date: dates[i], open: f(b.open), high: f(b.high), low: f(b.low), close: f(b.close), prev_close: f(b.prev), volume: b.volume }));
  return { dates, closes: closes.map(f), ohlcv, source: "synthetic" };
}

async function yahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3y&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const j = await res.json();
  const r = j.chart?.result?.[0];
  if (!r?.timestamp) throw new Error("no data");
  const q = r.indicators.quote[0];
  const px = r.indicators.adjclose?.[0]?.adjclose || q.close;
  const dates = [], closes = [], ohlcv = [];
  r.timestamp.forEach((t, i) => {
    if (px[i] == null) return;
    const date = new Date((t + 19800) * 1000).toISOString().slice(0, 10);
    dates.push(date); closes.push(+px[i].toFixed(2));
    // raw (unadjusted) bars for anomaly features; prev_close from the previous raw close
    if (q.close[i] != null && q.volume[i] != null) ohlcv.push({ date, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], prev_close: q.close[i - 1] ?? null, volume: q.volume[i] });
  });
  if (closes.length < 60) throw new Error("too little data");
  return { dates, closes, ohlcv, source: "yahoo" };
}

export async function getHistory(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.t < TTL) return hit.v;
  let v;
  if (process.env.MARKET_MODE === "synthetic") v = synthetic(symbol);
  else {
    try { v = await yahoo(symbol); } catch { v = synthetic(symbol); }
  }
  cache.set(symbol, { t: Date.now(), v });
  return v;
}

export async function getQuote(symbol) {
  const h = await getHistory(symbol);
  const n = h.closes.length;
  const last = h.closes[n - 1], prev = h.closes[n - 2];
  return { symbol, price: last, change: last - prev, changePct: (last / prev - 1) * 100, asOf: h.dates[n - 1], source: h.source };
}
