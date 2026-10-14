import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { JoinForm } from "@/components/AuthForms";
import { currentUser, membershipsFor } from "@/lib/auth";

export const metadata = { title: "Join a garden" };

export default async function JoinPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (membershipsFor(user.id).length) redirect("/");
  return (
    <main className="auth-wrap">
      <div className="card auth-card">
        <div className="auth-hero">
          <div className="emoji">🪴</div>
          <h1>Almost there</h1>
          <p className="muted">Paste the invite link a gardener shared with you.</p>
        </div>
        <JoinForm />
        <form action={logout} style={{ marginTop: 16, textAlign: "center" }}>
          <button className="ghost small">Sign out</button>
        </form>
      </div>
    </main>
  );
}
