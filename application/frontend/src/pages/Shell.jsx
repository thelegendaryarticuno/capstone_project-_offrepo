import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { IconBriefcase, IconChartCandle, IconCheck, IconFlask, IconLayoutDashboard, IconLogout, IconMoon, IconPlus, IconSelector, IconSettings, IconSparkles, IconSun } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarFooter, SidebarHeader, SidebarItem, SidebarNav, SidebarSection, SidebarToggle, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, Skeleton } from "@/components/kit";
import { useAuth, usePortfolios } from "../state";
import { api } from "../api";

const NAV = [
  ["/app", "Dashboard", IconLayoutDashboard],
  ["/app/portfolio", "Portfolio", IconBriefcase],
  ["/app/risk", "Risk Lab", IconFlask],
  ["/app/insights", "AI Insights", IconSparkles],
];

function Brand() {
  const { collapsed } = useSidebar();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><IconChartCandle size={17} /></div>
      {!collapsed && <span className="truncate text-sm font-semibold">SPRPA</span>}
    </div>
  );
}

function PortfolioPicker() {
  const { collapsed } = useSidebar();
  const { list, selected, select, refresh } = usePortfolios();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const out = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (collapsed || !list?.length) return null;
  const cur = list.find((p) => p.id === selected);
  const add = async () => {
    setOpen(false);
    const name = window.prompt("Portfolio name");
    if (!name?.trim()) return;
    const p = await api.createPortfolio(name.trim()); await refresh(); select(p.id);
  };
  return (
    <div className="px-[18px] pb-2 pt-1">
      <div id="pf-label" className="mb-1 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Portfolio</div>
      <div ref={box} className="relative flex gap-1.5">
        <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-labelledby="pf-label" title={cur?.name} onClick={() => setOpen(!open)}
          className={cn("flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border bg-card pl-2.5 pr-2 text-left text-[13px] transition hover:bg-accent", open ? "border-ring ring-2 ring-ring/20" : "border-input")}>
          <IconBriefcase size={15} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{cur?.name || "Select portfolio"}</span>
          <IconSelector size={15} className="shrink-0 text-muted-foreground" />
        </button>
        <Button variant="outline" onClick={add} aria-label="New portfolio" className="h-9 w-9 shrink-0 p-0"><IconPlus size={16} /></Button>
        {open && (
          <ul role="listbox" aria-labelledby="pf-label" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border bg-card p-1 shadow-lg">
            {list.map((p) => (
              <li key={p.id} role="option" aria-selected={p.id === selected}>
                <button type="button" title={p.name} onClick={() => { select(p.id); setOpen(false); }}
                  className={cn("flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent", p.id === selected && "bg-secondary text-secondary-foreground")}>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.is_demo && <span className="shrink-0 text-[10px] text-warn">DEMO</span>}
                  {p.id === selected && <IconCheck size={14} className="shrink-0" />}
                </button>
              </li>
            ))}
            <li className="mt-1 border-t pt-1">
              <button type="button" onClick={add} className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"><IconPlus size={14} /> New portfolio</button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

function UserFooter() {
  const { collapsed } = useSidebar();
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const d = !dark; setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.theme = d ? "dark" : "light"; } catch {}
  };
  const initial = (user?.displayName || user?.email || "?")[0].toUpperCase();
  return (
    <>
      {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="size-7 shrink-0 rounded-full" />
        : <div className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{initial}</div>}
      {!collapsed && <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium">{user?.displayName || "Investor"}</div><div className="truncate text-[11px] text-muted-foreground">{user?.email}</div></div>}
      <button onClick={toggle} aria-label="Toggle theme" className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">{dark ? <IconSun size={16} /> : <IconMoon size={16} />}</button>
      <button onClick={logout} aria-label="Sign out" className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-down"><IconLogout size={16} /></button>
    </>
  );
}

function Onboarding() {
  const { refresh, select } = usePortfolios();
  const [busy, setBusy] = useState(null);
  const make = async (kind) => {
    setBusy(kind);
    try { const p = kind === "demo" ? await api.createDemo() : await api.createPortfolio("My Portfolio"); await refresh(); select(p.id); } finally { setBusy(null); }
  };
  return (
    <Card className="mx-auto mt-16 max-w-xl p-10 text-center">
      <IconSparkles className="mx-auto mb-4 text-primary" size={32} />
      <h2 className="text-2xl font-semibold">Set up your first portfolio</h2>
      <p className="mt-2 text-sm text-muted-foreground">Load a clearly-labelled demo portfolio to explore every analysis, or start empty and add transactions or import a CSV.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button size="lg" onClick={() => make("demo")} disabled={!!busy}>{busy === "demo" ? "Loading…" : "Load demo portfolio"}</Button>
        <Button size="lg" variant="outline" onClick={() => make("empty")} disabled={!!busy}>Start empty</Button>
      </div>
    </Card>
  );
}

export default function Shell() {
  const { user } = useAuth();
  const { list, current } = usePortfolios();
  const loc = useLocation();
  const nav = useNavigate();
  if (user === null) return <Navigate to="/auth" replace />;

  return (
    <div className="flex h-svh overflow-hidden">
      <Sidebar variant="collapsible" defaultCollapsed={window.innerWidth < 900} width={256} aria-label="Main navigation">
        <SidebarHeader>
          <Brand />
          <SidebarToggle className="ml-auto" />
        </SidebarHeader>
        <PortfolioPicker />
        <SidebarNav>
          <SidebarSection label="Analytics">
            {NAV.map(([to, label, I]) => (
              <SidebarItem key={to} icon={<I size={18} stroke={1.75} />} active={loc.pathname === to} onClick={() => nav(to)}
                badge={to === "/app/insights" ? <Badge className="px-1.5 py-0 text-[10px]">ML</Badge> : undefined}>{label}</SidebarItem>
            ))}
          </SidebarSection>
          <SidebarSection label="Workspace">
            <SidebarItem icon={<IconSettings size={18} stroke={1.75} />} active={loc.pathname === "/app/settings"} onClick={() => nav("/app/settings")}>Settings</SidebarItem>
          </SidebarSection>
        </SidebarNav>
        <SidebarFooter><UserFooter /></SidebarFooter>
      </Sidebar>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {current?.is_demo && <div className="border-b border-warn/30 bg-warn/10 px-6 py-2 text-xs text-warn">Demo portfolio: sample holdings, not a real account.</div>}
        <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
          {user === undefined || list === null
            ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
            : list.length === 0 ? <Onboarding /> : <Outlet />}
          <p className="pt-4 text-center text-[11px] text-muted-foreground">Model estimates for research and risk education only. Not investment advice. SPRPA never places orders.</p>
        </div>
      </main>
    </div>
  );
}
