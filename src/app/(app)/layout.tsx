import Link from "next/link";
import { logout } from "@/app/actions";
import { AssistantPanel } from "@/components/AssistantPanel";
import { Nav } from "@/components/Nav";
import { requireGardener } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, garden } = await requireGardener();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">🌿 {garden.gardenName}</Link>
          <Nav />
          <span className="spacer" />
          <span className="who">
            {user.name}
            <form action={logout}>
              <button className="ghost small">Sign out</button>
            </form>
          </span>
        </div>
      </header>
      <main className="shell">{children}</main>
      <AssistantPanel />
    </>
  );
}
