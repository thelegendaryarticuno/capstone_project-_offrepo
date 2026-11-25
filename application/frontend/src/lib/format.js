export const inr = (n, d = 0) => (n == null ? "—" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: d }).format(n));
export const compact = (n) => new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 2 }).format(n);
export const pct = (n, d = 2, sign = false) => (n == null ? "—" : `${sign && n > 0 ? "+" : ""}${(n * 100).toFixed(d)}%`);
export const num = (n, d = 2) => (n == null ? "—" : Number(n).toFixed(d));
export const tone = (n) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted-foreground");
export const short = (s) => s.replace(/\.NS$|\.BO$/, "");
export const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#64748b", "#0d9488", "#a855f7", "#ea580c", "#0284c7"];
