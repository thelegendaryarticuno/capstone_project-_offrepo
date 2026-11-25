import { useState } from "react";
import { Navigate } from "react-router-dom";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from "firebase/auth";
import { IconChartCandle, IconShieldCheck, IconSparkles, IconTimeline } from "@tabler/icons-react";
import { auth, googleProvider } from "../firebase";
import { useAuth } from "../state";
import { LoginCard } from "@/components/ui/login-card";

const MSG = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "Wrong email or password.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 8 characters.",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
  "auth/popup-closed-by-user": "Google sign-in was cancelled.",
  "auth/operation-not-allowed": "This sign-in method is not enabled in Firebase.",
  "auth/unauthorized-domain": "This domain is not authorised in Firebase Authentication settings.",
};

const FEATURES = [
  [IconTimeline, "Performance vs NIFTY 50", "Returns, P&L, allocation and contribution"],
  [IconShieldCheck, "Risk Lab", "VaR, CVaR, Monte Carlo, stress tests, efficient frontier"],
  [IconSparkles, "AI insights", "Volatility forecast, anomaly detection, DistilBERT news sentiment"],
];

export default function Auth() {
  const { user } = useAuth();
  const [mode, setMode] = useState("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  if (user) return <Navigate to="/app" replace />;

  const go = async (fn) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(MSG[e.code] || e.message); }
    setBusy(false);
  };
  const submit = ({ email, password, name }) => go(async () => {
    if (mode === "reset") { await sendPasswordResetEmail(auth, email); setNotice("If that account exists, a reset link is on its way."); return; }
    if (mode === "register") {
      const c = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(c.user, { displayName: name.trim() });
    } else await signInWithEmailAndPassword(auth, email, password);
  });

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold"><IconChartCandle /> SPRPA</div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Stock Portfolio Risk &amp; Performance Analytics</h1>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(([I, t, d]) => (
              <li key={t} className="flex gap-3"><I className="mt-0.5 shrink-0 opacity-80" /><div><div className="font-medium">{t}</div><div className="text-sm opacity-75">{d}</div></div></li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-70">Research and risk-education tool. Not investment advice. No orders are placed.</p>
      </section>
      <main className="flex flex-col items-center justify-center gap-6 p-6">
        <div className="flex items-center gap-2 text-lg font-semibold lg:hidden"><IconChartCandle className="text-primary" /> SPRPA</div>
        <LoginCard mode={mode} busy={busy} error={error} notice={notice}
          onModeChange={(m) => { setMode(m); setError(null); setNotice(null); }}
          onSubmit={submit} onGoogle={() => go(() => signInWithPopup(auth, googleProvider))} />
      </main>
    </div>
  );
}
