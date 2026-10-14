import Link from "next/link";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/AuthForms";
import { currentUser } from "@/lib/auth";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (await currentUser()) redirect("/");
  const { invite } = await searchParams;
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-hero">
          <div className="emoji">🌱</div>
          <h1>Join the garden</h1>
          <p className="muted">{invite ? "You've been invited to help tend the garden." : "Gardeners on the owner list can sign up directly; everyone else needs an invite link."}</p>
        </div>
        <SignupForm invite={invite} />
        <p className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
