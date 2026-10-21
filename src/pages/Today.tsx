import { Link } from "react-router";
import { TaskForm } from "@/components/forms";
import { ActionButton, CareRow, NoteList, Photo, TaskRow, TrayGrid } from "@/components/ui";
import { logCare, setZoneRun } from "@/lib/actions";
import { addDays, formatDate, timeIn } from "@/lib/dates";
import { cellRange, coverPhotos, notesFor, photosFor, plantingViews, sortedTrays, tasksFor, type PlantingView } from "@/lib/garden";
import { useGarden } from "@/lib/GardenContext";
import { describeTimer, formatTime, irrigationZones, lastRun, nextRun, ranWhen, runId, zoneLabel, type Zone } from "@/lib/irrigation";
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

  // Watering is grouped so one tap covers it all: by irrigation zone when sprinklers or drip water the bed (one run waters every bed in the zone), else per planter.
  const waterGroups = new Map<string, { label: string; ids: string[]; overdue: boolean; mist: boolean; zone: Zone | null }>();
  const time = timeIn(data.garden.timezone);
  const zones = irrigationZones(data);
  const now: { p: PlantingView; item: CareItem }[] = [];
  const soon: typeof now = [];
  for (const p of plantings) {
    for (const item of p.care) {
      if (item.key === "water") {
        if (item.status === "upcoming") continue;
        const key = p.zone ? `zone:${p.zone.zone}` : (p.trayId ?? p.id);
        const g = waterGroups.get(key) ?? { label: p.zone ? zoneLabel(p.zone) : (p.trayName ?? p.name), ids: [], overdue: false, mist: item.title.includes("mist"), zone: p.zone };
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

      {data.trays.length === 0 && data.plantings.length === 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Welcome to {data.garden.name} 🌱</h2>
          <ol className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
            <li><Link to="/plants/new">Add your seed packets</Link> to the seed library (or let a planter add them by name).</li>
            <li><Link to="/trays/new">Add a planter</Link> by writing its cells as a little table — rows are letters, columns are numbers.</li>
            <li>Mark what&rsquo;s sown, and the app builds a care schedule from each packet.</li>
          </ol>
        </section>
      )}

      {estimated && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--terracotta)" }}>
          <strong>📅 Some sow dates are estimates.</strong>{" "}
          <span className="muted">
            Fix them on the planting pages (or tell the assistant, e.g. “we sowed the seed tray on Oct 3”) and the schedules update.
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
              {[...waterGroups.values()].map((g) => {
                // Each crop once: three rows of beets read as "Beet".
                const names = [...new Set(g.ids.map((id) => byId.get(id)!.name))].join(", ");
                if (g.zone) {
                  const z = g.zone;
                  // The timer will get to it later today.
                  const later = nextRun(z.settings.timer, today, time) === today;
                  const beds = z.beds.filter((b) => g.ids.some((id) => byId.get(id)!.trayId === b.links.trayId)).map((b) => b.name);
                  return (
                    <li key={g.label} className="care-item">
                      <div className="thumb" style={{ display: "grid", placeItems: "center", fontSize: "1.4rem" }}>💦</div>
                      <div className="what">
                        <div className="title">{later ? `${g.label} run at ${formatTime(z.settings.timer!.at)}` : `Run the ${g.label}`}</div>
                        <div className="small muted">{beds.join(", ")}: {names}</div>
                      </div>
                      <span className={`chip ${later ? "upcoming" : g.overdue ? "overdue" : "due"}`}>{later ? "later today" : g.overdue ? "overdue" : "today"}</span>
                      <ActionButton title={`Every planting in ${z.name}'s beds counts as watered`} onClick={() => act((ctx) => setZoneRun(ctx, z.zone, today, "manual"))}>💦 Ran</ActionButton>
                    </li>
                  );
                }
                return (
                  <li key={g.label} className="care-item">
                    <div className="thumb" style={{ display: "grid", placeItems: "center", fontSize: "1.4rem" }}>💧</div>
                    <div className="what">
                      <div className="title">{g.mist ? "Mist" : "Water"} the {g.label}</div>
                      <div className="small muted">{names}</div>
                    </div>
                    <span className={`chip ${g.overdue ? "overdue" : "due"}`}>{g.overdue ? "overdue" : "today"}</span>
                    <ActionButton onClick={() => act((ctx) => logCare(ctx, { plantingIds: g.ids, type: "watered" }))}>💧 Done</ActionButton>
                  </li>
                );
              })}
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

          {zones.some((z) => z.trayIds.length) && <IrrigationCard zones={zones.filter((z) => z.trayIds.length)} time={time} />}

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

/** Each zone that waters beds: its timer, when it last ran, and a way to say it ran (or didn't) today. */
function IrrigationCard({ zones, time }: { zones: Zone[]; time: string }) {
  const { data, today, act } = useGarden();
  const runs = data.irrigation ?? [];
  return (
    <section className="card">
      <h3>Irrigation</h3>
      <ul className="zone-list">
        {zones.map((z) => {
          const todays = runs.find((r) => r.id === runId(z.zone, today));
          const last = lastRun(runs, z.zone, today);
          const next = nextRun(z.settings.timer, today, time);
          return (
            <li key={z.zone}>
              <div>
                <strong>💦 {zoneLabel(z)}</strong>
                <div className="small muted">
                  {z.beds.map((b) => b.name).join(", ")} · {describeTimer(z.settings.timer)}
                  {last ? ` · ran ${ranWhen(last.date, today)}` : ""}
                  {next === today ? ` · runs at ${formatTime(z.settings.timer!.at)}` : ""}
                  {todays?.source === "skipped" ? " · skipped today" : ""}
                </div>
              </div>
              {todays && todays.source !== "skipped" ? (
                <ActionButton className="ghost small" title="It didn't run today after all" onClick={() => act((ctx) => setZoneRun(ctx, z.zone, today, todays.source === "timer" ? "skipped" : null))}>
                  Didn't run
                </ActionButton>
              ) : todays?.source === "skipped" ? (
                <ActionButton className="ghost small" onClick={() => act((ctx) => setZoneRun(ctx, z.zone, today, null))}>Undo</ActionButton>
              ) : (
                <ActionButton className="small" onClick={() => act((ctx) => setZoneRun(ctx, z.zone, today, "manual"))}>Ran today</ActionButton>
              )}
            </li>
          );
        })}
      </ul>
      <p className="small muted">A run waters every planting in the zone&rsquo;s beds. Set timers on the map: select a sprinkler, drip line or valve.</p>
    </section>
  );
}
