import { IconActivityHeartbeat, IconAlertTriangle, IconBan, IconBrain, IconCircleCheck, IconBrandFirebase, IconBrandGoogle, IconChartLine, IconCheck, IconDatabase, IconMail, IconMessage2, IconMinus, IconPlugConnected, IconPlugConnectedX, IconRadar, IconRefresh, IconServer, IconX } from "@tabler/icons-react";
import { api } from "../api";
import { useAsync } from "../state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, ErrorCard, PageHead, Panel, Skeleton } from "@/components/kit";
import { cn } from "@/lib/utils";

// Static list so all three cards show (as Not connected) even when the ML service is down.
const MODELS = [
  { id: "volatility", name: "Volatility forecast", output: "Annualised volatility, next 10 trading days", icon: IconChartLine },
  { id: "anomaly", name: "Anomaly detection", output: "Unusual trading days with score and indicators", icon: IconRadar },
  { id: "sentiment", name: "News sentiment", output: "Headline tone from -1 to +1", icon: IconMessage2 },
];
const PROVIDER = { password: ["Email / password", IconMail], "google.com": ["Google", IconBrandGoogle] };

function Status({ ok, size = "md" }) {
  const I = ok ? IconPlugConnected : IconPlugConnectedX;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium", size === "lg" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs",
      ok ? "border-up/40 bg-up/10 text-up" : "border-down/40 bg-down/10 text-down")}>
      <I size={size === "lg" ? 16 : 14} /> {ok ? "Connected" : "Not connected"}
    </span>
  );
}

const Check = ({ v, label }) => (
  <li className="flex items-center gap-2">
    {v === null ? <IconMinus size={14} className="text-muted-foreground" /> : v ? <IconCheck size={14} className="text-up" /> : <IconX size={14} className="text-down" />}
    <span className={v === null ? "text-muted-foreground" : ""}>{label}</span>
  </li>
);

const Row = ({ k, v }) => <div className="flex justify-between gap-4 border-t py-2 text-sm first:border-t-0"><span className="text-muted-foreground">{k}</span><span className="num truncate text-right">{v ?? "—"}</span></div>;

// Model-card fields shown as metric tiles (anything numeric that isn't the headline accuracy).
const METRIC_KEYS = ["RMSE", "Mean absolute error", "Median absolute error", "Precision", "Recall", "F1", "Days flagged", "Precision / recall, benchmark (macro)", "VADER on the same tests"];
const short = (k) => k.replace(/, benchmark \(macro\)/, "").replace("Mean absolute error", "MAE").replace("Median absolute error", "Median abs. error").replace("VADER on the same tests", "VADER (same tests)");

function Accuracy({ fields }) {
  const acc = Object.entries(fields).filter(([k]) => k.startsWith("Accuracy"));
  if (!acc.length) return null;
  const [k0, v0] = acc[0];
  const big = v0.match(/[\d.]+%/)?.[0] || v0;
  return (
    <div className="rounded-lg border bg-secondary/40 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{k0.replace("Accuracy", "Accuracy ·").replace(/[()]/g, "")}</div>
      <div className="flex items-baseline gap-2"><span className="num text-3xl font-semibold text-primary">{big}</span><span className="text-xs text-muted-foreground">{v0.replace(big, "").trim()}</span></div>
      {acc.slice(1).map(([k, v]) => <div key={k} className="mt-1 text-xs"><span className="text-muted-foreground">{k.replace("Accuracy, ", "")}:</span> <b className="num">{v}</b></div>)}
    </div>
  );
}

function Callout({ tone, icon: I, label, text }) {
  if (!text) return null;
  return (
    <div className={cn("flex gap-2 rounded-md border p-2.5 text-xs", tone === "up" ? "border-up/30 bg-up/5" : tone === "down" ? "border-down/30 bg-down/5" : "border-warn/30 bg-warn/5")}>
      <I size={15} className={cn("mt-px shrink-0", tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-warn")} />
      <div><span className="font-medium">{label}: </span><span className="text-muted-foreground">{text}</span></div>
    </div>
  );
}

function ModelCard({ base, m, mlUp, i }) {
  const I = base.icon;
  const ok = !!m?.connected;
  const reason = !mlUp ? "ML service is not reachable" : m?.reason;
  const f = m?.card?.fields || {};
  const metrics = METRIC_KEYS.filter((k) => f[k]);
  return (
    <Card className={cn("flex flex-col border-t-4 p-5", ok ? "border-t-up" : "border-t-down")}>
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground"><I size={22} stroke={1.75} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Model {i + 1}</div>
          <div className="text-base font-semibold leading-tight">{base.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{f.Model || base.output}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Status ok={ok} size="lg" />
        {m?.version && <Badge>trained {m.version}</Badge>}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{reason}{m?.load_ms != null && ok ? ` · loaded in ${(m.load_ms / 1000).toFixed(1)} s` : ""}</p>

      {m?.card && (<>
        <p className="mt-4 text-sm">{f.Task}</p>
        <div className="mt-3"><Accuracy fields={f} /></div>
        {metrics.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {metrics.map((k) => (
              <div key={k} className="rounded-md bg-muted px-2.5 py-2">
                <div className="truncate text-[10.5px] uppercase tracking-wide text-muted-foreground" title={k}>{short(k)}</div>
                <div className="num truncate text-sm font-medium" title={f[k]}>{f[k]}</div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Row k="Input" v={<span className="font-sans">{f.Input}</span>} />
          <Row k="Output" v={<span className="font-sans">{f.Output}</span>} />
          <Row k="Data" v={<span className="font-sans">{f.Data || f["Training data"]}</span>} />
          {f["Tested on"] && <Row k="Tested on" v={<span className="font-sans">{f["Tested on"]}</span>} />}
        </div>
        <div className="mt-3 space-y-2">
          <Callout tone="up" icon={IconCircleCheck} label="Use for" text={f["Use for"]} />
          <Callout tone="down" icon={IconBan} label="Do not use for" text={f["Do not use for"]} />
          <Callout tone="warn" icon={IconAlertTriangle} label="Main limit" text={f["Main limit"]} />
        </div>
      </>)}

      <div className="mt-auto pt-4">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-md bg-muted p-3 text-xs">
          <Check v={mlUp} label="ML service" />
          <Check v={m ? m.checks.libraries_installed : false} label={m ? Object.keys(m.libraries).join(" + ") : "Libraries"} />
          <Check v={m ? m.checks.artifact_found : false} label={m ? `${m.artifact}${m.size_mb ? ` · ${m.size_mb} MB` : ""}` : "Artifact"} />
          <Check v={m ? m.checks.loaded : false} label="Loaded & serving" />
        </ul>
        {m && <p className="mt-2 text-[11px] text-muted-foreground">{m.endpoint} · your runs: {m.runs}{m.lastRun ? ` · last ${m.lastRun} UTC` : ""}{m.data_cutoff ? ` · data to ${m.data_cutoff}` : ""}</p>}
      </div>
    </Card>
  );
}

function Service({ icon: I, name, s, detail }) {
  return (
    <Card className={cn("flex items-center gap-3 border-l-4 p-4", s.connected ? "border-l-up" : "border-l-down")}>
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted"><I size={20} stroke={1.75} /></div>
      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{name}</div><div className="truncate text-xs text-muted-foreground">{detail} · {s.reason}</div></div>
      <Status ok={s.connected} />
    </Card>
  );
}

export default function Settings() {
  const st = useAsync(() => api.system(), []);
  if (st.error) return <ErrorCard error={st.error} onRetry={st.reload} />;
  const d = st.data;
  const svc = d?.services;
  const byId = Object.fromEntries((d?.models || []).map((m) => [m.id, m]));
  const all = d ? [svc.backend, svc.ml, svc.database, svc.firebase, ...MODELS.map((b) => ({ connected: !!byId[b.id]?.connected }))] : [];
  const up = all.filter((x) => x.connected).length;
  const [provLabel, ProvIcon] = PROVIDER[d?.auth.signedInWith] || [d?.auth.signedInWith, IconBrandFirebase];

  return (
    <>
      <PageHead title="Settings" sub="Live connection status for models, sign-in, services and data"
        right={<Button variant="outline" onClick={st.reload} disabled={st.loading}><IconRefresh size={16} className={st.loading ? "animate-spin" : ""} /> Re-check</Button>} />
      {!d ? <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}</div> : (<>
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <div className={cn("num text-2xl font-semibold", up === all.length ? "text-up" : "text-warn")}>{up}/{all.length}</div>
          <div className="flex-1 text-sm"><div className="font-medium">{up === all.length ? "Everything is connected" : `${all.length - up} not connected`}</div><div className="text-xs text-muted-foreground">Checked just now · 4 services + 3 models</div></div>
        </Card>

        <section aria-labelledby="h-models" className="space-y-3">
          <h2 id="h-models" className="flex items-center gap-2 text-sm font-semibold"><IconBrain size={17} /> ML models</h2>
          <div className="grid items-stretch gap-4 lg:grid-cols-3">{MODELS.map((b, i) => <ModelCard key={b.id} base={b} m={byId[b.id]} mlUp={svc.ml.connected} i={i} />)}</div>
        </section>

        <section aria-labelledby="h-svc" className="space-y-3">
          <h2 id="h-svc" className="flex items-center gap-2 text-sm font-semibold"><IconActivityHeartbeat size={17} /> Services</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Service icon={IconServer} name="Express backend" s={svc.backend} detail={`:${svc.backend.port}`} />
            <Service icon={IconBrain} name="FastAPI ML service" s={svc.ml} detail={svc.ml.url} />
            <Service icon={IconDatabase} name="SQLite database" s={svc.database} detail={`database/${svc.database.file}`} />
            <Service icon={IconBrandFirebase} name="Firebase Authentication" s={svc.firebase} detail={d.auth.projectId || "no project"} />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={<span className="flex items-center gap-2"><IconBrandFirebase size={18} /> Firebase sign-in</span>} desc={d.auth.provider} right={<Status ok={svc.firebase.connected} />}>
            <div className="mb-3 flex items-center gap-3 rounded-md border p-3">
              <ProvIcon size={20} />
              <div className="min-w-0 flex-1 text-sm"><div className="font-medium">Signed in with {provLabel}</div><div className="truncate text-xs text-muted-foreground">{d.auth.email}</div></div>
            </div>
            <Row k="Web app project" v={d.auth.projectId} />
            <Row k="Service-account project" v={d.auth.adminProjectId} />
            <Row k="Enabled methods" v={<span className="font-sans">{d.auth.methods.join(" · ")}</span>} />
            <Row k="User ID" v={d.auth.uid} />
          </Panel>
          <Panel title={<span className="flex items-center gap-2"><IconDatabase size={18} /> Data</span>} desc="What this account has stored">
            <Row k="Market data" v={<span className="font-sans">{d.data.market}</span>} />
            <Row k="Portfolios" v={d.data.portfolios} />
            <Row k="Transactions" v={d.data.transactions} />
            <Row k="News headlines (all tickers)" v={d.data.headlines} />
            <Row k="Model runs logged" v={d.data.modelRuns} />
          </Panel>
        </div>
      </>)}
    </>
  );
}
