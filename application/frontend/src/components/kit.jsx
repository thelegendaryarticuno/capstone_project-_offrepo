import { useEffect } from "react";
import { Link } from "react-router-dom";
import { IconAlertTriangle, IconInfoCircle, IconRefresh, IconX } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const InfoTip = ({ text }) => (
  <span className="group relative inline-flex align-middle">
    <IconInfoCircle size={14} className="text-muted-foreground" aria-label={text} tabIndex={0} />
    <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-40 mt-1.5 w-60 -translate-x-1/2 rounded-md border bg-card p-2 text-xs font-normal normal-case tracking-normal text-card-foreground opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">{text}</span>
  </span>
);

export const Badge = ({ tone = "default", className, children }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
    tone === "warn" ? "border-warn/40 bg-warn/10 text-warn" : tone === "up" ? "border-up/40 bg-up/10 text-up" : tone === "down" ? "border-down/40 bg-down/10 text-down" : "bg-muted text-muted-foreground", className)}>{children}</span>
);

export const Skeleton = ({ className }) => <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;

// KPI tile: value + unit + interval + source (SRS 3.2.9.4 presentation transparency)
export function Kpi({ label, value, sub, tip, className }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}{tip && <InfoTip text={tip} />}</div>
      <div className="num mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </Card>
  );
}

export function Panel({ title, desc, tip, right, className, children }) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-5 pb-3">
        <div>
          <CardTitle className="flex items-center gap-1.5 text-base">{title}{tip && <InfoTip text={tip} />}</CardTitle>
          {desc && <CardDescription className="mt-1 text-xs">{desc}</CardDescription>}
        </div>
        {right}
      </CardHeader>
      <CardContent className="p-5 pt-0">{children}</CardContent>
    </Card>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border bg-card p-0.5">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition", value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{l}</button>
      ))}
    </div>
  );
}

export function ChartTip({ active, payload, label, fmt = (v) => v }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-lg">
      {label != null && <div className="mb-1 text-muted-foreground">{label}</div>}
      {payload.map((p) => <div key={p.dataKey} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />{p.name}: <b className="num">{fmt(p.value, p)}</b></div>)}
    </div>
  );
}

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onMouseDown={onClose}>
      <Card role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg" onMouseDown={(e) => e.stopPropagation()}>
        <CardHeader className="flex-row items-center justify-between space-y-0 p-5">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><IconX size={18} /></Button>
        </CardHeader>
        <CardContent className="p-5 pt-0">{children}</CardContent>
      </Card>
    </div>
  );
}

export function ErrorCard({ error, onRetry }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <IconAlertTriangle className="mx-auto mb-3 text-warn" />
      <p className="font-medium">Couldn't load this view</p>
      <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      {onRetry && <Button className="mt-5" variant="outline" onClick={onRetry}><IconRefresh size={15} /> Retry</Button>}
    </Card>
  );
}

// loading / error / empty wrapper for analytics-backed pages
export function Gate({ state, children }) {
  const { data, error, loading, reload } = state;
  if (loading && !data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className={i < 4 ? "h-28" : "h-72 sm:col-span-2"} />)}</div>;
  if (error) return <ErrorCard error={error} onRetry={reload} />;
  if (data?.empty) return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <p className="font-medium">This portfolio has no holdings yet</p>
      <p className="mt-1 text-sm text-muted-foreground">Add a transaction or import a CSV to see analytics.</p>
      <Button asChild className="mt-5"><Link to="/app/portfolio">Add holdings</Link></Button>
    </Card>
  );
  return <div className={cn("space-y-4 transition", loading && "opacity-60")}>{children(data)}</div>;
}

export const SourceBadge = ({ s }) => s === "yahoo" ? <Badge>Delayed provider data · daily close</Badge> : <Badge tone="warn">Synthetic demo data</Badge>;

export const ModelBadge = ({ d }) => d?.dummy
  ? <Badge tone="warn">{d.model} · {d.model_version} · dummy output</Badge>
  : <Badge>{d?.model} · {d?.model_version}</Badge>;

export const PageHead = ({ title, sub, right }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}</div>
    {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
  </div>
);
