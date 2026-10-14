import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-hero">
          <div className="emoji">🌿</div>
          <h1>Herb Garden</h1>
          <p className="muted">Sign in to tend the garden.</p>
        </div>
        <LoginForm />
        <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
