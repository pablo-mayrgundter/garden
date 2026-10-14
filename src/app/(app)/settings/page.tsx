import { headers } from "next/headers";
import { rotateInvite } from "@/app/actions";
import { CopyButton, GardenSettingsForm } from "@/components/forms";
import { requireGardener } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { db } from "@/lib/db";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { garden } = await requireGardener();
  const d = db();
  const { invite_code } = d.prepare("SELECT invite_code FROM gardens WHERE id = ?").get(garden.gardenId) as { invite_code: string };
  const members = d
    .prepare(
      `SELECT u.name, u.email, m.role, m.created_at AS joined FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.garden_id = ? ORDER BY m.created_at`,
    )
    .all(garden.gardenId) as { name: string; email: string; role: string; joined: string }[];
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const inviteUrl = `${origin}/signup?invite=${invite_code}`;

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <div className="grid cols-2">
        <section className="card">
          <h2>Garden</h2>
          <GardenSettingsForm name={garden.gardenName} timezone={garden.timezone} />
        </section>
        <section className="card">
          <h2>Gardeners</h2>
          <ul className="care-list">
            {members.map((m) => (
              <li key={m.email} className="care-item">
                <div className="what">
                  <div className="title">{m.name}</div>
                  <div className="small muted">{m.email} · joined {formatDate(m.joined.slice(0, 10))}</div>
                </div>
                <span className="chip">{m.role}</span>
              </li>
            ))}
          </ul>
          <h3 style={{ marginTop: 16 }}>Invite someone</h3>
          <p className="small muted">Anyone with this link can create an account and join the garden.</p>
          <div className="row">
            <input readOnly value={inviteUrl} style={{ flex: 1, minWidth: 200 }} />
            <CopyButton text={inviteUrl} />
          </div>
          <form action={rotateInvite} style={{ marginTop: 8 }}>
            <button className="ghost small">Make a new link (old one stops working)</button>
          </form>
        </section>
      </div>
    </>
  );
}
