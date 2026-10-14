import Link from "next/link";
import { notFound } from "next/navigation";
import { removePhoto, removePlanting } from "@/app/actions";
import { ConfirmButton, NoteForm, PhotoUpload, PlantingEditForm, QuickLog, TaskForm } from "@/components/forms";
import { CareRow, EventLog, NoteList, Photo, StatusChip, TaskRow } from "@/components/ui";
import { WikipediaCard } from "@/components/WikipediaCard";
import { requireGardener } from "@/lib/auth";
import { daysBetween, formatDate, todayIn } from "@/lib/dates";
import { cellRange, listEvents, listNotes, listPhotos, listTasks, plantingsWithCare } from "@/lib/garden";
import { sproutedOn } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function PlantingPage({ params }: { params: Promise<{ id: string }> }) {
  const { garden } = await requireGardener();
  const id = Number((await params).id);
  const today = todayIn(garden.timezone);
  const p = plantingsWithCare(garden.gardenId, today).find((x) => x.id === id);
  if (!p) notFound();
  const s = p.species;
  const events = listEvents(garden.gardenId, [p.id]);
  const notes = listNotes(garden.gardenId, { plantingId: p.id });
  const photos = listPhotos(garden.gardenId, { plantingId: p.id });
  const packet = listPhotos(garden.gardenId, { speciesId: s.id });
  const tasks = listTasks(garden.gardenId, { plantingId: p.id, includeDone: true });
  const hero = photos[0] ?? packet.find((ph) => ph.kind === "packet_front");
  const sprouted = sproutedOn(events);
  const age = p.sownAt ? daysBetween(p.sownAt, today) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub">
            {p.trayId ? <Link href={`/trays/${p.trayId}`}>{p.trayName}</Link> : "Planting"} / cell {cellRange(p.cells) || "—"}
          </p>
          <h1>{p.name}{s.variety && <span className="muted" style={{ fontWeight: 400 }}> · {s.variety}</span>}</h1>
          <div className="row">
            <StatusChip status={p.status} />
            {p.sownAt && (
              <span className="chip">
                Sown {formatDate(p.sownAt)}{age != null && age >= 0 ? ` · day ${age}` : ""}
              </span>
            )}
            {p.sowDateEstimated && <span className="chip est">sow date estimated</span>}
            {sprouted && <span className="chip sprouted">🌱 up since {formatDate(sprouted)}</span>}
            {s.scientificName && <span className="small muted"><em>{s.scientificName}</em></span>}
          </div>
        </div>
      </div>

      <div className="grid main-side">
        <div className="stack">
          {hero && (
            <figure style={{ margin: 0 }}>
              <Photo id={hero.id} alt={p.name} className="hero-photo" />
              <figcaption className="small muted" style={{ marginTop: 4 }}>{hero.caption ?? formatDate(hero.takenAt)}</figcaption>
            </figure>
          )}

          <section className="card">
            <div className="card-head">
              <h2>Care schedule</h2>
              <span className="small muted">from the seed packet</span>
            </div>
            {p.care.length ? (
              <ul className="care-list">
                {p.care.map((item) => (
                  <CareRow key={item.key} item={item} plantingIds={[p.id]} today={today} />
                ))}
              </ul>
            ) : (
              <p className="empty">No schedule — this planting is {p.status}.</p>
            )}
            {tasks.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Reminders</h3>
                <ul className="care-list">
                  {tasks.map((t) => (
                    <TaskRow key={t.id} task={t} today={today} />
                  ))}
                </ul>
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <TaskForm plantingId={p.id} today={today} />
            </div>
          </section>

          <section className="card">
            <h2>Log care</h2>
            <QuickLog plantingIds={[p.id]} today={today} />
            <h3 style={{ marginTop: 18 }}>History</h3>
            <EventLog events={events} />
          </section>

          <section className="card">
            <h2>Notes</h2>
            <NoteForm plantingId={p.id} />
            <div style={{ marginTop: 12 }}>
              <NoteList notes={notes} />
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Photos</h2>
              <span className="small muted">{photos.length}</span>
            </div>
            {photos.length > 0 && (
              <div className="gallery" style={{ marginBottom: 14 }}>
                {photos.map((ph) => (
                  <figure key={ph.id}>
                    <a href={`/api/photos/${ph.id}`} target="_blank" rel="noreferrer">
                      <Photo id={ph.id} alt={ph.caption ?? ""} />
                    </a>
                    <figcaption className="row between">
                      <span>{formatDate(ph.takenAt)}{ph.userName ? ` · ${ph.userName}` : ""}</span>
                      <form action={removePhoto}>
                        <input type="hidden" name="photoId" value={ph.id} />
                        <button className="ghost tiny" title="Delete photo">✕</button>
                      </form>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
            <PhotoUpload plantingId={p.id} today={today} />
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h3>About {s.commonName.toLowerCase()}</h3>
              <Link href={`/plants/${s.id}`} className="small">Seed packet →</Link>
            </div>
            <dl className="facts">
              {s.sowDepth && (<><dt>Sow</dt><dd>{s.sowDepth}</dd></>)}
              {s.germDaysMin != null && (<><dt>Sprouts</dt><dd>{s.germDaysMin}–{s.germDaysMax} days</dd></>)}
              {s.light && (<><dt>Light</dt><dd>{s.light}</dd></>)}
              {s.watering && (<><dt>Water</dt><dd>{s.watering}</dd></>)}
              {s.spacing && (<><dt>Spacing</dt><dd>{s.spacing}</dd></>)}
              {s.height && (<><dt>Size</dt><dd>{s.height}{s.spread ? ` tall · ${s.spread} wide` : ""}</dd></>)}
              {s.harvestDaysMin != null && (<><dt>Harvest</dt><dd>{s.harvestDaysMin}–{s.harvestDaysMax} days</dd></>)}
              {s.lifecycle && (<><dt>Type</dt><dd>{s.lifecycle} {s.category}</dd></>)}
            </dl>
            {s.tips.length > 0 && (
              <ul className="small" style={{ paddingLeft: 18, marginBottom: 0 }}>
                {s.tips.map((t) => <li key={t}>{t}</li>)}
              </ul>
            )}
          </section>

          {s.wikipediaTitle && (
            <section className="card">
              <h3>From Wikipedia</h3>
              <WikipediaCard title={s.wikipediaTitle} />
            </section>
          )}

          {packet.length > 0 && (
            <section className="card">
              <h3>Seed packet</h3>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {packet.map((ph) => (
                  <a key={ph.id} href={`/api/photos/${ph.id}`} target="_blank" rel="noreferrer">
                    <Photo id={ph.id} alt={ph.caption ?? ""} className="packet" />
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <details>
              <summary>Edit planting</summary>
              <PlantingEditForm
                plantingId={p.id}
                status={p.status}
                sownAt={p.sownAt}
                sowDateEstimated={p.sowDateEstimated}
                location={p.location}
              />
              <form action={removePlanting} style={{ marginTop: 16 }}>
                <input type="hidden" name="plantingId" value={p.id} />
                <ConfirmButton message={`Remove ${p.name} and its care log, notes and photos?`}>Remove planting & free the cells</ConfirmButton>
              </form>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
