"use client";

import { useActionState, useEffect, useState } from "react";
import { joinWithInvite, login, signup } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="form">
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="primary" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export function SignupForm({ invite }: { invite?: string }) {
  const [state, action, pending] = useActionState(signup, undefined);
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  return (
    <form action={action} className="form">
      <input type="hidden" name="invite" value={invite ?? ""} />
      <input type="hidden" name="tz" value={tz} />
      <label>Your name<input name="name" autoComplete="given-name" required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="primary" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
    </form>
  );
}

export function JoinForm() {
  const [state, action, pending] = useActionState(joinWithInvite, undefined);
  return (
    <form action={action} className="form">
      <label>Invite link or code<input name="invite" required /></label>
      {state?.error && <p className="error">{state.error}</p>}
      <button className="primary" disabled={pending}>Join garden</button>
    </form>
  );
}
