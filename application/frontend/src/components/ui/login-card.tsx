// 21st.dev: felipemenezes098/card-06 "Login Form Card", wired to props for sign-in / register / reset.
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type Mode = "signin" | "register" | "reset";

export interface LoginCardProps {
  mode: Mode;
  busy?: boolean;
  error?: string | null;
  notice?: string | null;
  onModeChange: (m: Mode) => void;
  onSubmit: (v: { email: string; password: string; name: string }) => void;
  onGoogle: () => void;
}

const COPY: Record<Mode, [string, string, string]> = {
  signin: ["Sign in", "Enter your credentials to access your portfolios.", "Sign in"],
  register: ["Create account", "Register with email, or continue with Google.", "Create account"],
  reset: ["Reset password", "We'll email you a reset link.", "Send reset link"],
};

export function LoginCard({ mode, busy, error, notice, onModeChange, onSubmit, onGoogle }: LoginCardProps) {
  const [v, setV] = React.useState({ email: "", password: "", name: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const [title, desc, cta] = COPY[mode];

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
        <CardContent>
          <FieldGroup>
            {mode === "register" && (
              <Field>
                <FieldLabel htmlFor="lc-name">Name</FieldLabel>
                <Input id="lc-name" autoComplete="name" required value={v.name} onChange={set("name")} />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="lc-email">Email</FieldLabel>
              <Input id="lc-email" type="email" autoComplete="email" required placeholder="you@example.com" value={v.email} onChange={set("email")} />
            </Field>
            {mode !== "reset" && (
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="lc-password">Password</FieldLabel>
                  {mode === "signin" && (
                    <Button type="button" variant="link" className="ml-auto h-auto p-0 text-sm font-normal" onClick={() => onModeChange("reset")}>Forgot?</Button>
                  )}
                </div>
                <Input id="lc-password" type="password" required minLength={8} autoComplete={mode === "register" ? "new-password" : "current-password"} value={v.password} onChange={set("password")} />
                <FieldDescription>Must be at least 8 characters.</FieldDescription>
              </Field>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="text-sm text-up">{notice}</p>}
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : cta}</Button>
          {mode !== "reset" && (
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={onGoogle}>
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
              Continue with Google
            </Button>
          )}
          <p className="pt-2 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "No account? " : "Already registered? "}
            <Button type="button" variant="link" className="h-auto p-0" onClick={() => onModeChange(mode === "signin" ? "register" : "signin")}>
              {mode === "signin" ? "Create one" : "Sign in"}
            </Button>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default LoginCard;
