import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { api } from "./api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = resolving
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);
  return <AuthCtx.Provider value={{ user, logout: () => signOut(auth) }}>{children}</AuthCtx.Provider>;
}

const PfCtx = createContext(null);
export const usePortfolios = () => useContext(PfCtx);

const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} };

export function PortfolioProvider({ children }) {
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState(() => load("pf"));

  const refresh = useCallback(async () => {
    const l = await api.portfolios();
    setList(l);
    setSelected((s) => (l.some((p) => p.id === s) ? s : l[0]?.id || null));
  }, []);
  useEffect(() => { refresh().catch(() => setList([])); }, [refresh]);
  useEffect(() => save("pf", selected), [selected]);

  return <PfCtx.Provider value={{ list, selected, select: setSelected, refresh, current: list?.find((p) => p.id === selected) }}>{children}</PfCtx.Provider>;
}

export function useAsync(fn, deps) {
  const [s, set] = useState({ data: null, error: null, loading: true });
  const run = useCallback(() => {
    set((x) => ({ ...x, loading: true, error: null }));
    fn().then((data) => set({ data, error: null, loading: false })).catch((error) => set({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...s, reload: run };
}
