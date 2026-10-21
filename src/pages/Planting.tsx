import { Link, useNavigate, useParams } from "react-router";
import { NoteForm, PhotoUpload, PlantingEditForm, QuickLog, TaskForm } from "@/components/forms";
import { ActionButton, CareRow, EventLog, NoteList, Photo, StatusChip, TaskRow } from "@/components/ui";
import { PacketPhotos } from "@/components/PacketPhotos";
import { PlantingPlants } from "@/components/RowBed";
import { WikipediaCard } from "@/components/WikipediaCard";
import { deletePhoto, deletePlanting } from "@/lib/actions";
import { daysBetween, formatDate } from "@/lib/dates";
import { cellRange, eventsFor, notesFor, photosFor, plantingViews, tasksFor } from "@/lib/garden";
import { useGarden } from "@/lib/GardenContext";
import { irrigationFor, irrigationZones } from "@/lib/irrigation";
import { rainReaches, rainyDays } from "@/lib/weather/rain";
import { sproutedOn } from "@/lib/schedule";

export function PlantingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, today, act } = useGarden();
  const p = plantingViews(data, today).find((x) => x.id === id);
  if (!p) return <p className="empty">That planting isn&rsquo;t here anymore. <Link to="/trays">Back to the planters</Link></p>;
  const s = p.species;
  const events = eventsFor(data, p.id);
  const notes = notesFor(data, p.id);
  const photos = photosFor(data, { plantingId: p.id });
  const packet = photosFor(data, { speciesId: s.id });
  const tasks = tasksFor(data, { plantingId: p.id, includeDone: true });
  const hero = photos[0] ?? packet.find((ph) => ph.kind === "packet_front");
  const sprouted = sproutedOn(events);
  const age = p.sownAt ? daysBetween(p.sownAt, today) : null;
  // Rain that reached this planting since it was sown (outdoors only) counts as watering.
  const rainHere = p.sownAt && rainReaches(p, data) ? rainyDays(data.rain ?? [], today).filter((r) => r.date >= p.sownAt!) : [];
  const irrigatedHere = p.sownAt ? irrigationFor(irrigationZones(data), data.irrigation ?? [], p.trayId, today).filter((r) => r.date >= p.sownAt!) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub">
            {p.trayId ? <Link to={`/trays/${p.trayId}`}>{p.trayName}</Link> : "Planting"} / cell {cellRange(p.cells) || "—"}
          </p>
          <h1>
            {p.name}
            {s.variety && <span className="muted" style={{ fontWeight: 400 }}> · {s.variety}</span>}
          </h1>
          <div className="row">
            <StatusChip status={p.status} />
            {p.sownAt && <span className="chip">Sown {formatDate(p.sownAt)}{age != null && age >= 0 ? ` · day ${age}` : ""}</span>}
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
              <Photo id={hero.id} alt={p.name} className="hero-photo" link />
              <figcaption className="small muted" style={{ marginTop: 4 }}>{hero.caption ?? formatDate(hero.takenAt)}</figcaption>
            </figure>
          )}

          <PlantingPlants planting={p} />

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
            <EventLog events={events} rain={rainHere} irrigation={irrigatedHere} />
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
                    <Photo id={ph.id} alt={ph.caption ?? ""} link />
                    <figcaption className="row between">
                      <span>{formatDate(ph.takenAt)}{ph.by ? ` · ${ph.by}` : ""}</span>
                      <ActionButton className="ghost tiny" title="Delete photo" confirmText="Delete this photo?" onClick={() => act((ctx) => deletePhoto(ctx, ph.id))}>
                        ✕
                      </ActionButton>
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
              <Link to={`/plants/${s.id}`} className="small">Seed packet →</Link>
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

          <section className="card">
            <h3>Seed packet</h3>
            <PacketPhotos species={s} />
          </section>

          <section className="card">
            <details>
              <summary>Edit planting</summary>
              <PlantingEditForm planting={p} />
              <div style={{ marginTop: 16 }}>
                <ActionButton
                  className="small danger"
                  confirmText={`Remove ${p.name} and its care log, notes and photos?`}
                  onClick={async () => {
                    await act((ctx) => deletePlanting(ctx, p.id));
                    navigate(p.trayId ? `/trays/${p.trayId}` : "/");
                  }}
                >
                  Remove planting &amp; free the cells
                </ActionButton>
              </div>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
