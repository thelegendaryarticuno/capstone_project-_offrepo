import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { useAsync, usePortfolios } from "../state";
import { ChartTip, Gate, Kpi, PageHead, Panel, Segmented, SourceBadge } from "@/components/kit";
import { compact, inr, num, pct, PALETTE, short, tone } from "@/lib/format";

export const RANGES = [["6m", "6M"], ["1y", "1Y"], ["2y", "2Y"]];

export default function Dashboard() {
  const { selected, current } = usePortfolios();
  const [range, setRange] = useState("1y");
  const state = useAsync(() => api.analytics(selected, { range, horizon: 1, sims: 500 }), [selected, range]);
  return (
    <>
      <PageHead title={current?.name || "Dashboard"} sub={`Performance and risk at a glance${state.data?.asOf ? ` · as of ${state.data.asOf}` : ""}`}
        right={<>{state.data?.dataSource && <SourceBadge s={state.data.dataSource} />}<Segmented label="Window" options={RANGES} value={range} onChange={setRange} /></>} />
      <Gate state={state}>{(d) => <Body d={d} />}</Gate>
    </>
  );
}

function Body({ d }) {
  const m = d.metrics;
  const excess = m.totalReturn - m.benchTotal;
  const alloc = d.assets.map((a) => ({ name: short(a.symbol), value: a.value }));
  const contrib = [...d.assets].sort((a, b) => b.contribution - a.contribution).map((a) => ({ name: short(a.symbol), v: +(a.contribution * 100).toFixed(2) }));
  const step = Math.ceil(d.performance.length / 6);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Portfolio value" value={inr(d.value)} tip="Current market value of all holdings vs total cost (incl. fees). Weighted-average cost convention."
          sub={<span className={tone(d.pnl)}>{d.pnl >= 0 ? "▲" : "▼"} {inr(Math.abs(d.pnl))} unrealized vs cost {inr(d.invested)}</span>} />
        <Kpi label={`Return · ${d.days} trading days`} value={<span className={tone(m.totalReturn)}>{pct(m.totalReturn, 2, true)}</span>}
          tip="Price-only cumulative return over the window assuming today's holdings were held throughout, vs NIFTY 50 on the same dates."
          sub={<span className={tone(excess)}>{pct(excess, 2, true)} vs NIFTY 50 ({pct(m.benchTotal, 2, true)}) · ann. {pct(m.annReturn, 1)}</span>} />
        <Kpi label="Volatility · annualized" value={pct(m.vol, 1)} tip="Std of daily returns × √252."
          sub={<span className="text-muted-foreground">Beta {num(m.beta)} · Sharpe {num(m.sharpe)} · Sortino {num(m.sortino)}</span>} />
        <Kpi label={`VaR ${Math.round(m.conf * 100)}% · 1 day`} value={<span className="text-down">{inr(m.var.historical)}</span>}
          tip="Historical VaR: a one-day loss this large was exceeded on only 5 of 100 past days in the window."
          sub={<span className="text-muted-foreground">CVaR {inr(m.var.cvar)} · Max DD {pct(m.maxDrawdown)}</span>} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Performance vs NIFTY 50" desc="Both series rebased to 100 at window start">
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={d.performance} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" ticks={d.performance.filter((_, i) => i % step === 0).map((p) => p.date)} tickLine={false} axisLine={false} tickFormatter={(s) => s.slice(2, 7)} />
                <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTip fmt={(v) => v.toFixed(2)} />} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line name="Portfolio" dataKey="portfolio" stroke="var(--chart-1)" strokeWidth={2.2} dot={false} />
                <Line name="NIFTY 50" dataKey="benchmark" stroke="var(--muted-foreground)" strokeWidth={1.4} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Allocation" desc="Share of current market value">
          <div className="relative h-52">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={alloc} dataKey="value" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">{alloc.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie>
                <Tooltip content={<ChartTip fmt={(v) => inr(v)} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="num text-xl font-semibold">{d.assets.length}</div><div className="text-[11px] text-muted-foreground">holdings · {compact(d.value)}</div></div></div>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {alloc.map((a, i) => <li key={a.name} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate">{a.name}</span><span className="num ml-auto text-muted-foreground">{pct(d.assets[i].weight, 1)}</span></li>)}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Holdings">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr>{["Symbol", "Price", "Value", "Weight", "Return", "Vol", "Beta"].map((h, i) => <th key={h} className={`px-5 py-2 font-medium ${i && i !== 3 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>
                {[...d.assets].sort((a, b) => b.weight - a.weight).map((a) => (
                  <tr key={a.symbol} className="border-t hover:bg-muted/50">
                    <td className="px-5 py-2.5 font-medium">{short(a.symbol)}</td>
                    <td className="num px-5 text-right">{inr(a.price, 2)}</td>
                    <td className="num px-5 text-right">{inr(a.value)}</td>
                    <td className="px-5"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${a.weight * 100}%` }} /></div><span className="num text-xs text-muted-foreground">{pct(a.weight, 1)}</span></div></td>
                    <td className={`num px-5 text-right ${tone(a.return)}`}>{pct(a.return, 1, true)}</td>
                    <td className="num px-5 text-right text-muted-foreground">{pct(a.vol, 1)}</td>
                    <td className="num px-5 text-right text-muted-foreground">{num(a.beta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Contribution to return" tip="Weight × the stock's own return: percentage points each holding added.">
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={contrib} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={80} />
                <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTip fmt={(v) => `${v}%`} />} />
                <Bar name="Contribution" dataKey="v" radius={3}>{contrib.map((c, i) => <Cell key={i} fill={c.v >= 0 ? "var(--up)" : "var(--down)"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </>
  );
}
