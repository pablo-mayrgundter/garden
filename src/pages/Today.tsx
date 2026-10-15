import { Link } from "react-router";
import { TaskForm } from "@/components/forms";
import { ActionButton, CareRow, NoteList, Photo, TaskRow, TrayGrid } from "@/components/ui";
import { logCare } from "@/lib/actions";
import { addDays, formatDate } from "@/lib/dates";
import { cellRange, coverPhotos, notesFor, photosFor, plantingViews, sortedTrays, tasksFor, type PlantingView } from "@/lib/garden";
import { useGarden } from "@/lib/GardenContext";
import type { CareItem, CareStatus } from "@/lib/schedule";

export function Today() {
  const { data, today, act } = useGarden();
  const plantings = plantingViews(data, today);
  const trays = sortedTrays(data);
  const { byPlanting, bySpecies } = coverPhotos(data);
  const tasks = tasksFor(data);
  const notes = notesFor(data).slice(0, 6);
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const cover = (p: PlantingView) => byPlanting.get(p.id) ?? bySpecies.get(p.speciesId) ?? null;

  // Watering is grouped per planter so one tap covers the whole tray.
  const waterGroups = new Map<string, { label: string; ids: string[]; overdue: boolean; mist: boolean }>();
  const now: { p: PlantingView; item: CareItem }[] = [];
  const soon: typeof now = [];
  for (const p of plantings) {
    for (const item of p.care) {
      if (item.key === "water") {
        if (item.status === "upcoming") continue;
        const key = p.trayId ?? p.id;
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
  const urgent = new Map<string, CareStatus>();
  for (const { p, item } of now) if (item.status !== "due" || !urgent.has(p.id)) urgent.set(p.id, item.status);
  const estimated = plantings.find((p) => p.sowDateEstimated && p.sownAt);
  const recentPhotos = photosFor(data, { kind: "progress" }).slice(0, 8);
  const attention = waterGroups.size + now.length + tasksNow.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <p className="sub">{formatDate(today, { weekday: true, year: true })} · {plantings.filter((p) => p.status !== "planned").length} plantings growing</p>
        </div>
      </div>

      {estimated && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--terracotta)" }}>
          <strong>📅 Sow date is an estimate.</strong>{" "}
          <span className="muted">
            We guessed {formatDate(estimated.sownAt!)} from how far along the seedlings were in the Oct 14 photo. Fix it on any planting page (or tell the
            assistant, e.g. “we sowed the seed tray on Oct 3”) and every schedule updates.
          </span>
        </div>
      )}

      <div className="grid main-side">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Needs attention</h2>
              <span className="muted small">{attention} things</span>
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
                  <ActionButton onClick={() => act((ctx) => logCare(ctx, { plantingIds: g.ids, type: "watered" }))}>💧 Done</ActionButton>
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
                  thumb={cover(p)}
                  href={`/plantings/${p.id}`}
                />
              ))}
              {tasksNow.map((t) => (
                <TaskRow key={t.id} task={t} today={today} plantingName={t.plantingId ? byId.get(t.plantingId)?.name : undefined} />
              ))}
            </ul>
            {attention === 0 && <p className="empty">All caught up. 🌞</p>}
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
                  thumb={cover(p)}
                  href={`/plantings/${p.id}`}
                />
              ))}
              {tasksSoon.map((t) => (
                <TaskRow key={t.id} task={t} today={today} plantingName={t.plantingId ? byId.get(t.plantingId)?.name : undefined} />
              ))}
            </ul>
            {soon.length + tasksSoon.length === 0 && <p className="empty">Nothing scheduled.</p>}
            <div style={{ marginTop: 12 }}>
              <TaskForm today={today} />
            </div>
          </section>
        </div>

        <div className="stack">
          {trays.map((t) => {
            const inTray = plantings.filter((p) => p.trayId === t.id);
            return (
              <section key={t.id} className="card">
                <div className="card-head">
                  <h3><Link to={`/trays/${t.id}`}>{t.name}</Link></h3>
                  <span className="muted small">{inTray.length} plantings</span>
                </div>
                <TrayGrid tray={t} plantings={inTray} covers={byPlanting} urgent={urgent} mini />
              </section>
            );
          })}

          {recentPhotos.length > 0 && (
            <section className="card">
              <h3>Latest photos</h3>
              <div className="gallery">
                {recentPhotos.map((ph) => (
                  <Link key={ph.id} to={ph.plantingId ? `/plantings/${ph.plantingId}` : "/"}>
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
