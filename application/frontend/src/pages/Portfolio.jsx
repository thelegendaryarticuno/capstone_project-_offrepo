import { useRef, useState } from "react";
import { IconDownload, IconFileUpload, IconPlus, IconTrash } from "@tabler/icons-react";
import { api } from "../api";
import { useAsync, usePortfolios } from "../state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, ErrorCard, Modal, PageHead, Panel, Skeleton } from "@/components/kit";
import { inr, short } from "@/lib/format";

const SAMPLE = "symbol,type,quantity,price,trade_date,fees\nRELIANCE,BUY,10,2650.50,2025-03-12,20\nTCS,BUY,5,3900,2025-04-02,15\nINFY,BUY,25,1480,2025-05-20,18\nINFY,SELL,5,1720,2025-09-10,12\n";
const today = () => new Date().toISOString().slice(0, 10);
const lbl = "mb-1.5 block text-sm font-medium";

function AddTx({ open, onClose, pid, onDone }) {
  const [f, setF] = useState({ symbol: "", type: "BUY", quantity: "", price: "", fees: "0", trade_date: today() });
  const [sug, setSug] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.addTx(pid, f); onDone(); onClose(); setF({ ...f, symbol: "", quantity: "", price: "" }); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Add transaction">
      <form onSubmit={submit} className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={lbl} htmlFor="tx-sym">Symbol (NSE)</label>
          <Input id="tx-sym" required list="tx-syms" placeholder="e.g. RELIANCE" value={f.symbol} onChange={(e) => { set("symbol")(e); api.search(e.target.value).then(setSug).catch(() => {}); }} />
          <datalist id="tx-syms">{sug.map((s) => <option key={s.symbol} value={short(s.symbol)}>{s.name}</option>)}</datalist>
        </div>
        <div><label className={lbl} htmlFor="tx-type">Side</label><select id="tx-type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={f.type} onChange={set("type")}><option>BUY</option><option>SELL</option></select></div>
        <div><label className={lbl} htmlFor="tx-date">Trade date</label><Input id="tx-date" type="date" required max={today()} value={f.trade_date} onChange={set("trade_date")} /></div>
        <div><label className={lbl} htmlFor="tx-q">Quantity</label><Input id="tx-q" type="number" min="0.000001" step="any" required value={f.quantity} onChange={set("quantity")} /></div>
        <div><label className={lbl} htmlFor="tx-p">Price (₹)</label><Input id="tx-p" type="number" min="0" step="any" required value={f.price} onChange={set("price")} /></div>
        <div className="col-span-2"><label className={lbl} htmlFor="tx-f">Fees (₹)</label><Input id="tx-f" type="number" min="0" step="any" value={f.fees} onChange={set("fees")} /></div>
        {err && <p role="alert" className="col-span-2 text-sm text-destructive">{err}</p>}
        <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Add transaction"}</Button></div>
      </form>
    </Modal>
  );
}

function ImportCsv({ open, onClose, pid, onDone }) {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef();
  const upload = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setErr("File exceeds the 2 MB limit");
    setBusy(true); setErr(null); setRes(null);
    try { const r = await api.importCsv(pid, await file.text()); setRes(r); onDone(); } catch (x) { setErr(x.message); }
    setBusy(false); ref.current.value = "";
  };
  const sample = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([SAMPLE], { type: "text/csv" })); a.download = "sprpa-sample.csv"; a.click(); };
  return (
    <Modal open={open} onClose={() => { setRes(null); setErr(null); onClose(); }} title="Import transactions from CSV">
      <p className="text-sm text-muted-foreground">Columns: <code className="num text-xs">symbol,type,quantity,price,trade_date[,fees]</code>. Dates as YYYY-MM-DD, max 2 MB. Exact duplicate rows are skipped.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => ref.current.click()} disabled={busy}><IconFileUpload size={16} />{busy ? "Importing…" : "Choose CSV"}</Button>
        <Button variant="outline" onClick={sample}><IconDownload size={16} /> Sample file</Button>
        <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => upload(e.target.files[0])} />
      </div>
      {err && <p role="alert" className="mt-4 text-sm text-destructive">{err}</p>}
      {res && (
        <div className="mt-4 rounded-md border p-3 text-sm">
          <div><b className="text-up">{res.imported}</b> imported · {res.duplicates} duplicates skipped · <b className={res.errors.length ? "text-down" : ""}>{res.errors.length}</b> rejected</div>
          {res.errors.length > 0 && <ul className="mt-2 max-h-40 overflow-auto text-xs text-muted-foreground">{res.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}</ul>}
        </div>
      )}
    </Modal>
  );
}

export default function Portfolio() {
  const { selected, current, refresh } = usePortfolios();
  const state = useAsync(() => api.transactions(selected), [selected]);
  const [modal, setModal] = useState(null);
  const reload = () => { state.reload(); refresh(); };
  const del = async () => {
    if (!window.confirm(`Delete "${current.name}" and all its transactions? This cannot be undone.`)) return;
    await api.deletePortfolio(selected); refresh();
  };
  const delTx = async (t) => {
    if (!window.confirm(`Delete ${t.type} ${t.quantity} ${short(t.symbol)}?`)) return;
    await api.deleteTx(selected, t.id); reload();
  };

  return (
    <>
      <PageHead title={current?.name} sub={<>Transactions are the source of truth; holdings are derived from them. {current?.is_demo && <Badge tone="warn">Demo</Badge>}</>}
        right={<>
          <Button onClick={() => setModal("add")}><IconPlus size={16} /> Add transaction</Button>
          <Button variant="outline" onClick={() => setModal("csv")}><IconFileUpload size={16} /> Import CSV</Button>
          <Button variant="ghost" size="icon" onClick={del} aria-label="Delete portfolio" className="text-down"><IconTrash size={17} /></Button>
        </>} />
      <Panel title="Transactions" desc={state.data ? `${state.data.length} records` : null}>
        {state.error ? <ErrorCard error={state.error} onRetry={state.reload} /> : !state.data ? <Skeleton className="h-64" /> : state.data.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No transactions yet. Add one or import a CSV.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr>{["Date", "Symbol", "Side", "Quantity", "Price", "Fees", "Amount", "Source", ""].map((h, i) => <th key={i} className={`px-5 py-2 font-medium ${i >= 3 && i <= 6 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>
                {state.data.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-muted/50">
                    <td className="num px-5 py-2.5 text-muted-foreground">{t.trade_date}</td>
                    <td className="px-5 font-medium">{short(t.symbol)}</td>
                    <td className="px-5"><Badge tone={t.type === "BUY" ? "up" : "down"}>{t.type}</Badge></td>
                    <td className="num px-5 text-right">{t.quantity}</td>
                    <td className="num px-5 text-right">{inr(t.price, 2)}</td>
                    <td className="num px-5 text-right text-muted-foreground">{inr(t.fees, 2)}</td>
                    <td className="num px-5 text-right">{inr(t.quantity * t.price)}</td>
                    <td className="px-5 text-xs text-muted-foreground">{t.source}</td>
                    <td className="px-3 text-right"><Button variant="ghost" size="icon" className="size-8" onClick={() => delTx(t)} aria-label="Delete transaction"><IconTrash size={15} /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <AddTx open={modal === "add"} onClose={() => setModal(null)} pid={selected} onDone={reload} />
      <ImportCsv open={modal === "csv"} onClose={() => setModal(null)} pid={selected} onDone={reload} />
    </>
  );
}
