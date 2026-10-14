import Link from "next/link";
import { logCare } from "@/app/actions";
import { TaskForm } from "@/components/forms";
import { CareRow, NoteList, Photo, TaskRow, TrayGrid } from "@/components/ui";
import { requireGardener } from "@/lib/auth";
import { addDays, formatDate, todayIn } from "@/lib/dates";
import { cellRange, coverPhotos, listNotes, listPhotos, listTasks, listTrays, plantingsWithCare } from "@/lib/garden";
import type { CareStatus } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { garden } = await requireGardener();
  const today = todayIn(garden.timezone);
  const plantings = plantingsWithCare(garden.gardenId, today);
  const trays = listTrays(garden.gardenId);
  const { byPlanting, bySpecies } = coverPhotos(garden.gardenId);
  const tasks = listTasks(garden.gardenId);
  const notes = listNotes(garden.gardenId, { limit: 6 });
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const cover = (id: number) => byPlanting.get(id) ?? bySpecies.get(byId.get(id)!.speciesId) ?? null;

  // Watering is grouped per planter so one tap covers the whole tray.
  const waterGroups = new Map<string, { label: string; ids: number[]; overdue: boolean; mist: boolean }>();
  const now: { p: (typeof plantings)[number]; item: (typeof plantings)[number]["care"][number] }[] = [];
  const soon: typeof now = [];
  for (const p of plantings) {
    for (const item of p.care) {
      if (item.key === "water") {
        if (item.status === "upcoming") continue;
        const key = p.trayId ? `tray-${p.trayId}` : `p-${p.id}`;
        const g = waterGroups.get(key) ?? { label: p.trayName ?? p.name, ids: [], overdue: false, mist: item.title.includes("mist") };
        g.ids.push(p.id);
        g.overdue ||= item.status === "overdue";
        waterGroups.set(key, g);
      } else if (["overdue", "due", "late"].includes(item.status)) now.push({ p, item });
      else if (item.status === "upcoming" && item.start <= addDays(today, 14)) soon.push({ p, item });
    }
  }
  soon.sort((a, b) => a.item.start.localeCompare(b.item.start));
  const tasksNow = tasks.filter((t) => t.dueDate <= today);
  const tasksSoon = tasks.filter((t) => t.dueDate > today);
  const urgent = new Map<number, CareStatus>();
  for (const { p, item } of now) if (item.status !== "due" || !urgent.has(p.id)) urgent.set(p.id, item.status);
  const estimated = plantings.filter((p) => p.sowDateEstimated);
  const recentPhotos = listPhotos(garden.gardenId, { kind: "progress", limit: 8 });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <p className="sub">{formatDate(today, { weekday: true, year: true })} · {plantings.filter((p) => p.status !== "planned").length} plantings growing</p>
        </div>
      </div>

      {estimated.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--terracotta)" }}>
          <strong>📅 Sow date is an estimate.</strong>{" "}
          <span className="muted">
            We guessed {formatDate(estimated[0].sownAt!)} from how far along the seedlings were in the Oct 14 photo. Fix it on any planting page (or tell the
            assistant, e.g. “we sowed the seed tray on Oct 3”) and every schedule updates.
          </span>
        </div>
      )}

      <div className="grid main-side">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Needs attention</h2>
              <span className="muted small">{waterGroups.size + now.length + tasksNow.length} things</span>
            </div>
            <ul className="care-list">
              {[...waterGroups.values()].map((g) => (
                <li key={g.label} className="care-item">
                  <div className="thumb" style={{ display: "grid", placeItems: "center", fontSize: "1.4rem" }}>💧</div>
                  <div className="what">
                    <div className="title">{g.mist ? "Mist" : "Water"} the {g.label}</div>
                    <div className="small muted">{g.ids.map((id) => byId.get(id)!.name).join(", ")}</div>
                  </div>
                  <span className={`chip ${g.overdue ? "overdue" : "due"}`}>{g.overdue ? "overdue" : "today"}</span>
                  <form action={logCare}>
                    <input type="hidden" name="plantingIds" value={g.ids.join(",")} />
                    <input type="hidden" name="type" value="watered" />
                    <button className="small">💧 Done</button>
                  </form>
                </li>
              ))}
              {now.map(({ p, item }) => (
                <CareRow
                  key={`${p.id}-${item.key}`}
                  item={item}
                  plantingIds={[p.id]}
                  today={today}
                  title={`${p.name}: ${item.title}`}
                  subtitle={<>{p.trayName} {cellRange(p.cells)}{item.detail ? ` · ${item.detail}` : ""}</>}
                  thumb={cover(p.id)}
                  href={`/plantings/${p.id}`}
                />
              ))}
              {tasksNow.map((t) => (
                <TaskRow key={`t${t.id}`} task={t} today={today} plantingName={t.plantingId ? byId.get(t.plantingId)?.name : undefined} />
              ))}
            </ul>
            {waterGroups.size + now.length + tasksNow.length === 0 && <p className="empty">All caught up. 🌞</p>}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Coming up</h2>
              <span className="muted small">next 2 weeks</span>
            </div>
            <ul className="care-list">
              {soon.map(({ p, item }) => (
                <CareRow
                  key={`${p.id}-${item.key}`}
                  item={item}
                  plantingIds={[p.id]}
                  today={today}
                  title={`${p.name}: ${item.title}`}
                  subtitle={<>{p.trayName} {cellRange(p.cells)}</>}
                  thumb={cover(p.id)}
                  href={`/plantings/${p.id}`}
                />
              ))}
              {tasksSoon.map((t) => (
                <TaskRow key={`t${t.id}`} task={t} today={today} plantingName={t.plantingId ? byId.get(t.plantingId)?.name : undefined} />
              ))}
            </ul>
            {soon.length + tasksSoon.length === 0 && <p className="empty">Nothing scheduled.</p>}
            <div style={{ marginTop: 12 }}>
              <TaskForm today={today} />
            </div>
          </section>
        </div>

        <div className="stack">
          {trays.map((t) => (
            <section key={t.id} className="card">
              <div className="card-head">
                <h3><Link href={`/trays/${t.id}`}>{t.name}</Link></h3>
                <span className="muted small">{plantings.filter((p) => p.trayId === t.id).length} plantings</span>
              </div>
              <TrayGrid tray={t} plantings={plantings.filter((p) => p.trayId === t.id)} covers={byPlanting} urgent={urgent} mini />
            </section>
          ))}

          {recentPhotos.length > 0 && (
            <section className="card">
              <h3>Latest photos</h3>
              <div className="gallery">
                {recentPhotos.map((ph) => (
                  <Link key={ph.id} href={ph.plantingId ? `/plantings/${ph.plantingId}` : "#"}>
                    <figure>
                      <Photo id={ph.id} alt={ph.caption ?? ""} />
                      <figcaption>{ph.plantingId ? byId.get(ph.plantingId)?.name : ph.caption}</figcaption>
                    </figure>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <h3>Recent notes</h3>
            <NoteList notes={notes} plantingNames={byId} />
          </section>
        </div>
      </div>
    </>
  );
}
