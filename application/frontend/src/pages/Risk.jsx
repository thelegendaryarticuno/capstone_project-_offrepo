import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { api } from "../api";
import { useAsync, usePortfolios } from "../state";
import { Badge, ChartTip, Gate, Kpi, PageHead, Panel, Segmented, SourceBadge } from "@/components/kit";
import { inr, num, pct, short } from "@/lib/format";
import { RANGES } from "./Dashboard";

const CONFS = [["0.9", "90%"], ["0.95", "95%"], ["0.99", "99%"]];
const HORIZ = [["1", "1D"], ["5", "5D"], ["10", "10D"], ["20", "20D"]];
const SIMS = [["1000", "1k"], ["5000", "5k"], ["10000", "10k"]];

export default function Risk() {
  const { selected } = usePortfolios();
  const [q, setQ] = useState({ range: "1y", conf: "0.95", horizon: "1", sims: "5000" });
  const set = (k) => (v) => setQ({ ...q, [k]: v });
  const state = useAsync(() => api.analytics(selected, q), [selected, q.range, q.conf, q.horizon, q.sims]);
  return (
    <>
      <PageHead title="Risk Lab" sub="Tail risk, simulations, stress scenarios and allocation exploration"
        right={<>{state.data?.dataSource && <SourceBadge s={state.data.dataSource} />}
          <Segmented label="Window" options={RANGES} value={q.range} onChange={set("range")} />
          <Segmented label="Confidence" options={CONFS} value={q.conf} onChange={set("conf")} />
          <Segmented label="Horizon" options={HORIZ} value={q.horizon} onChange={set("horizon")} />
          <Segmented label="Simulations" options={SIMS} value={q.sims} onChange={set("sims")} /></>} />
      <Gate state={state}>{(d) => <Body d={d} />}</Gate>
    </>
  );
}

function heat(c) {
  const a = Math.min(1, Math.abs(c));
  return c >= 0 ? `color-mix(in srgb, var(--chart-1) ${a * 85}%, transparent)` : `color-mix(in srgb, var(--down) ${a * 85}%, transparent)`;
}

function Body({ d }) {
  const m = d.metrics, mc = d.monteCarlo;
  const c = Math.round(m.conf * 100), h = m.horizon;
  const step = (arr) => Math.ceil(arr.length / 6);
  return (
    <>
      <p className="text-xs text-muted-foreground">Window: {d.days} daily returns to {d.asOf}. VaR/CVaR are reported as positive ₹ losses at {c}% confidence over {h} trading day{h > 1 ? "s" : ""} (√t scaling for historical/parametric).</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={`Historical VaR ${c}% · ${h}D`} value={<span className="text-down">{inr(m.var.historical)}</span>} tip="Empirical quantile of past daily returns × portfolio value × √horizon." sub={<span className="text-muted-foreground">{pct(m.var.historical / d.value)} of value</span>} />
        <Kpi label={`Parametric VaR ${c}% · ${h}D`} value={<span className="text-down">{inr(m.var.parametric)}</span>} tip="(z·σ − μ) × value × √horizon, assuming normally distributed returns." sub={<span className="text-muted-foreground">Normal assumption</span>} />
        <Kpi label={`CVaR / ES ${c}% · ${h}D`} value={<span className="text-down">{inr(m.var.cvar)}</span>} tip="Expected Shortfall: average loss on days worse than the VaR point." sub={<span className="text-muted-foreground">Average tail loss</span>} />
        <Kpi label={`Monte Carlo VaR ${c}% · ${h}D`} value={<span className="text-down">{inr(mc.var)}</span>} tip="Correlated simulation (Cholesky of covariance), fixed seed so results are reproducible." sub={<span className="text-muted-foreground">{mc.sims.toLocaleString()} paths · seed {mc.seed} · P(loss) {num(mc.probLossPct, 1)}%</span>} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Monte Carlo fan" desc={`Simulated cumulative return over ${mc.horizon} day(s): 5–95% and 25–75% bands, median line`}>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={mc.fan.map((f) => ({ ...f, outer: [f.p5, f.p95], inner: [f.p25, f.p75] }))} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTip fmt={(v) => Array.isArray(v) ? `${v[0]}% – ${v[1]}%` : `${v}%`} />} />
                <Area name="5–95%" dataKey="outer" stroke="none" fill="var(--chart-1)" fillOpacity={0.15} />
                <Area name="25–75%" dataKey="inner" stroke="none" fill="var(--chart-1)" fillOpacity={0.3} />
                <Line name="Median" dataKey="p50" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Distribution of simulated outcomes" desc={`Terminal return after ${mc.horizon} day(s) · expected ${num(mc.expectedReturnPct)}%`}>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={mc.hist} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="x" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis tickLine={false} axisLine={false} width={44} />
                <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTip />} />
                <Bar name="Paths" dataKey="n" radius={2}>{mc.hist.map((b, i) => <Cell key={i} fill={b.x < 0 ? "var(--down)" : "var(--up)"} fillOpacity={0.75} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Drawdown" desc={`Fall from running peak · worst ${pct(m.maxDrawdown)}`}>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={d.drawdown} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" ticks={d.drawdown.filter((_, i) => i % step(d.drawdown) === 0).map((x) => x.date)} tickLine={false} axisLine={false} tickFormatter={(s) => s.slice(2, 7)} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} />
                <Area name="Drawdown" dataKey="dd" stroke="var(--down)" fill="var(--down)" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Rolling 30-day volatility" desc="Annualized, from daily returns">
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={d.rolling} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" ticks={d.rolling.filter((_, i) => i % step(d.rolling) === 0).map((x) => x.date)} tickLine={false} axisLine={false} tickFormatter={(s) => s.slice(2, 7)} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTip fmt={(v) => `${v}%`} />} />
                <Area name="Volatility" dataKey="vol" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Correlation matrix" desc="Pearson correlation of aligned daily returns">
          <div className="overflow-x-auto">
            <table className="num mx-auto text-[11px]">
              <thead><tr><th />{d.corr.symbols.map((s) => <th key={s} className="px-1 pb-1 font-medium text-muted-foreground">{short(s).slice(0, 6)}</th>)}</tr></thead>
              <tbody>{d.corr.matrix.map((row, i) => (
                <tr key={i}><th className="pr-2 text-right font-medium text-muted-foreground">{short(d.corr.symbols[i]).slice(0, 8)}</th>
                  {row.map((v, j) => <td key={j} title={`${short(d.corr.symbols[i])} × ${short(d.corr.symbols[j])}: ${v}`} className="size-11 text-center" style={{ background: heat(v) }}>{v.toFixed(2)}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Stress test: market shock" desc="New value = Σ weight × (1 + shock × beta). Canonical scenarios.">
          <div className="space-y-3">
            {d.stress.map((s) => (
              <div key={s.shock} className="flex items-center gap-3 text-sm">
                <span className="num w-24 shrink-0">NIFTY {pct(s.shock, 0)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-down" style={{ width: `${Math.min(100, Math.abs(s.impactPct) * 2)}%` }} /></div>
                <span className="num w-20 text-right text-down">{num(s.impactPct, 1)}%</span>
                <span className="num w-28 text-right text-down">{inr(s.loss)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Efficient frontier" desc="2,000 random long-only portfolios; weights sum to 1, no shorting">
          <div className="h-80">
            <ResponsiveContainer>
              <ScatterChart margin={{ left: -6, right: 12, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="vol" name="Volatility" unit="%" tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                <YAxis type="number" dataKey="ret" name="Return" unit="%" tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
                <ZAxis range={[14, 14]} />
                <Tooltip content={<ChartTip fmt={(v) => `${(+v).toFixed(2)}%`} />} />
                <Scatter name="Portfolios" data={d.frontier.points} fill="var(--muted-foreground)" fillOpacity={0.35} />
                <Scatter name="Current" data={[d.frontier.current]} fill="var(--chart-3)" shape="star" legendType="star" />
                <Scatter name="Max Sharpe" data={[d.frontier.maxSharpe]} fill="var(--up)" shape="diamond" />
                <Scatter name="Min volatility" data={[d.frontier.minVol]} fill="var(--chart-1)" shape="triangle" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Suggested weights" desc="Exploration only — a simulation, not an order" right={<Badge tone="warn">Simulation</Badge>}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="py-1 text-left font-medium">Symbol</th><th className="text-right font-medium">Now</th><th className="text-right font-medium">Max Sharpe</th><th className="text-right font-medium">Min vol</th></tr></thead>
            <tbody>{d.assets.map((a, i) => (
              <tr key={a.symbol} className="border-t"><td className="py-1.5">{short(a.symbol)}</td><td className="num text-right">{pct(a.weight, 1)}</td>
                <td className="num text-right text-up">{pct(d.frontier.maxSharpe.weights[i].weight, 1)}</td><td className="num text-right">{pct(d.frontier.minVol.weights[i].weight, 1)}</td></tr>
            ))}</tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">Max-Sharpe: vol {num(d.frontier.maxSharpe.vol, 1)}%, return {num(d.frontier.maxSharpe.ret, 1)}%, Sharpe {num(d.frontier.maxSharpe.sharpe)}. Based on historical mean/covariance; past returns don't predict future returns.</p>
        </Panel>
      </div>
    </>
  );
}
