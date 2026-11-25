import { useEffect, useRef, useState } from "react";
import { CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { IconFileUpload } from "@tabler/icons-react";
import { api } from "../api";
import { useAsync, usePortfolios } from "../state";
import { Button } from "@/components/ui/button";
import { Badge, ChartTip, ErrorCard, Kpi, ModelBadge, PageHead, Panel, Skeleton, SourceBadge } from "@/components/kit";
import { num, short } from "@/lib/format";

const sevTone = { High: "down", Medium: "warn", Low: "default" };
const sentTone = (l) => (l === "Positive" ? "up" : l === "Negative" ? "down" : "default");

function Section({ state, children }) {
  if (state.error) return <ErrorCard error={state.error} onRetry={state.reload} />;
  if (!state.data) return <Skeleton className="h-72" />;
  return <div className={state.loading ? "opacity-60" : ""}>{children(state.data)}</div>;
}

const FEATURE_LABEL = {
  range_vol_1: "High-low vol · 1 day", range_vol_5: "High-low vol · 5 days", range_vol_22: "High-low vol · 22 days",
  close_vol_22: "Close vol · 22 days", close_vol_66: "Close vol · 66 days", market_vol_5: "NIFTY vol · 5 days",
  volume_ratio: "Volume / 20-day avg", last_return: "Last daily return",
};
const featFmt = (k, v) => (k === "volume_ratio" ? `${num(v)}×` : `${num(v)}%`);

function Volatility({ symbol }) {
  const s = useAsync(() => api.volatility(symbol), [symbol]);
  return (
    <Section state={s}>{(d) => {
      const step = Math.ceil(d.history.length / 6);
      const diff = d.forecast_pct - d.baseline.value_pct;
      return (
        <Panel title="10-day volatility forecast" desc={`Forecast made ${d.forecast_date} for the next ${d.horizon_days} trading days · ${d.history_window.observations} daily bars used`}
          right={<div className="flex flex-wrap gap-1.5"><ModelBadge d={d} /><SourceBadge s={d.dataSource} /></div>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Forecast · next 10 days" value={`${num(d.forecast_pct)}%`} tip="Annualised volatility the model expects over the next 10 trading days."
              sub={<span className={diff > 0 ? "text-down" : "text-up"}>{diff > 0 ? "▲" : "▼"} {num(Math.abs(diff))} pts vs last 22 days</span>} />
            <Kpi label="Baseline · 22-day realized" value={`${num(d.baseline.value_pct)}%`} tip="Simple statistical baseline: annualised std of the last 22 daily log returns." />
            <Kpi label="Fit on this stock" value={d.evaluation.value == null ? "—" : `${num(d.evaluation.value)} pts`} tip="RMSE of the model's past forecasts in the chart below against the volatility that actually followed."
              sub={<span className="text-muted-foreground">RMSE over {d.evaluation.n} past forecasts</span>} />
          </div>
          <div className="mt-4 h-60">
            <ResponsiveContainer>
              <LineChart data={d.history} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" ticks={d.history.filter((_, i) => i % step === 0).map((x) => x.date)} tickLine={false} axisLine={false} tickFormatter={(x) => x.slice(2, 10)} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} domain={[0, "auto"]} />
                <Tooltip content={<ChartTip fmt={(v) => `${(+v).toFixed(2)}%`} />} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line name="Model forecast" dataKey="predicted" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line name="What actually happened" dataKey="realized" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(d.features).map(([k, v]) => (
              <div key={k} className="rounded-md bg-muted px-2.5 py-1.5"><div className="truncate text-[10.5px] text-muted-foreground" title={k}>{FEATURE_LABEL[k] || k}</div><div className="num text-sm">{featFmt(k, v)}</div></div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Units: {d.units}. Inputs above are the model's 8 features on {d.forecast_date}. Run {d.run_timestamp} · model data to {d.data_cutoff}.</p>
        </Panel>
      );
    }}</Section>
  );
}

function Anomalies({ symbol }) {
  const s = useAsync(() => api.anomalies(symbol), [symbol]);
  return (
    <Section state={s}>{(d) => {
      const flagged = new Map(d.anomalies.map((a) => [a.anomaly_date, a]));
      const series = d.prices.map((p) => ({ ...p, flag: flagged.has(p.date) ? p.close : null }));
      const step = Math.ceil(series.length / 6);
      return (
        <Panel title="Unusual movement detection" desc={`${d.anomalies.length} of ${d.observations} trading days flagged · contamination ${d.contamination * 100}% · features: ${d.features.join(", ")}`}
          right={<div className="flex flex-wrap gap-1.5"><ModelBadge d={d} /><SourceBadge s={d.dataSource} /></div>}>
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ left: -6, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" ticks={series.filter((_, i) => i % step === 0).map((x) => x.date)} tickLine={false} axisLine={false} tickFormatter={(x) => x.slice(2, 7)} />
                <YAxis tickLine={false} axisLine={false} width={56} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTip fmt={(v) => `₹${(+v).toFixed(2)}`} />} />
                <Line name="Close" dataKey="close" stroke="var(--chart-1)" strokeWidth={1.6} dot={false} />
                <Scatter name="Anomaly" dataKey="flag" fill="var(--down)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="-mx-5 mt-4 max-h-72 overflow-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr>{["Date", "Severity", "Score", "Return", "Volume z", "Range", "Open gap"].map((h, i) => <th key={h} className={`px-5 py-2 font-medium ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>{d.anomalies.map((a) => (
                <tr key={a.anomaly_date} className="border-t">
                  <td className="num px-5 py-2">{a.anomaly_date}</td>
                  <td className="px-5"><Badge tone={sevTone[a.severity]}>{a.severity}</Badge></td>
                  <td className="num px-5 text-right">{num(a.anomaly_score, 3)}</td>
                  <td className={`num px-5 text-right ${a.daily_return_pct >= 0 ? "text-up" : "text-down"}`}>{a.daily_return_pct > 0 ? "+" : ""}{num(a.daily_return_pct)}%</td>
                  <td className="num px-5 text-right">{num(a.volume_zscore)}</td>
                  <td className="num px-5 text-right">{a.intraday_range_pct == null ? "—" : `${num(a.intraday_range_pct)}%`}</td>
                  <td className="num px-5 text-right">{a.opening_gap_pct == null ? "—" : `${num(a.opening_gap_pct)}%`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Score: {d.score_definition}. Severity = tercile rank within flagged days. An anomaly is not a buy/sell signal or evidence of manipulation.</p>
        </Panel>
      );
    }}</Section>
  );
}

function Sentiment({ symbol }) {
  const s = useAsync(() => api.sentiment(symbol), [symbol]);
  return (
    <Section state={s}>{(d) => !d.available ? (
      <Panel title="News sentiment"><p className="py-6 text-center text-sm text-muted-foreground">{d.message}. Import headlines (Ticker, Headline, Date) to enable it.</p></Panel>
    ) : (
      <Panel title="News sentiment" desc={`DistilBERT: mean of P(positive) − P(negative) over the latest ${d.headline_count} unique headlines · latest ${d.latest_headline_date}`}
        right={<div className="flex flex-wrap gap-1.5"><ModelBadge d={d} />{d.newsSource.includes("demo") && <Badge tone="warn">Demo headlines</Badge>}</div>}>
        <div className="flex flex-wrap items-center gap-6">
          <div><div className={`num text-4xl font-semibold ${d.score > 0 ? "text-up" : d.score < 0 ? "text-down" : ""}`}>{d.score > 0 ? "+" : ""}{num(d.score)}</div><Badge tone={sentTone(d.label)} className="mt-1">{d.label}</Badge></div>
          <div className="min-w-60 flex-1">
            <div className="relative h-2 rounded-full bg-gradient-to-r from-down via-muted to-up"><span className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground" style={{ left: `${(d.score + 1) * 50}%` }} /></div>
            <div className="num mt-1 flex justify-between text-[11px] text-muted-foreground"><span>−1 Negative</span><span>0</span><span>+1 Positive</span></div>
          </div>
        </div>
        <ul className="mt-4 divide-y text-sm">
          {d.headlines.map((h) => (
            <li key={h.headline} className="flex items-center gap-3 py-2"><span className="num w-24 shrink-0 text-xs text-muted-foreground">{h.date}</span><span className="flex-1">{h.headline}</span><Badge tone={sentTone(h.label)}>{h.compound > 0 ? "+" : ""}{num(h.compound)}</Badge></li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Thresholds: ≥ 0.05 positive, ≤ −0.05 negative. Text-only input; future returns are never used.</p>
      </Panel>
    )}</Section>
  );
}

function NewsImport() {
  const ref = useRef();
  const [msg, setMsg] = useState(null);
  const up = async (f) => {
    if (!f) return;
    try { const r = await api.importNews(await f.text()); setMsg(`${r.imported} headlines imported, ${r.skipped} skipped`); } catch (e) { setMsg(e.message); }
    ref.current.value = "";
  };
  return (<>
    <Button variant="outline" onClick={() => ref.current.click()}><IconFileUpload size={16} /> Import headlines CSV</Button>
    <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => up(e.target.files[0])} />
    {msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}
  </>);
}

export default function Insights() {
  const { selected } = usePortfolios();
  const tx = useAsync(() => api.transactions(selected), [selected]);
  const symbols = [...new Set((tx.data || []).map((t) => t.symbol))].sort();
  const [sym, setSym] = useState(null);
  useEffect(() => { if (symbols.length && !symbols.includes(sym)) setSym(symbols[0]); }, [symbols.join(), sym]);

  return (
    <>
      <PageHead title="AI Insights" sub="Gradient-boosting volatility · Isolation Forest anomalies · DistilBERT news sentiment — per holding"
        right={<>
          <label htmlFor="ai-sym" className="sr-only">Stock</label>
          <select id="ai-sym" value={sym || ""} onChange={(e) => setSym(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm" disabled={!symbols.length}>
            {symbols.map((s) => <option key={s} value={s}>{short(s)}</option>)}
          </select>
          <NewsImport />
        </>} />
      <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-2.5 text-xs text-warn">Model outputs are research estimates, not advice. Accuracy and limits for each model are on the Settings page.</div>
      {tx.error ? <ErrorCard error={tx.error} onRetry={tx.reload} /> : !tx.data ? <Skeleton className="h-72" /> : !symbols.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Add holdings to this portfolio to run the models.</p>
      ) : sym && (
        <div className="space-y-4">
          <Volatility symbol={sym} />
          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-3"><Anomalies symbol={sym} /></div>
            <div className="xl:col-span-2"><Sentiment symbol={sym} /></div>
          </div>
        </div>
      )}
    </>
  );
}
