import { Link, useParams, useSearchParams } from "react-router";
import { NoteForm, PhotoUpload, PlantCellsForm } from "@/components/forms";
import { ActionButton, CareChip, Photo, TrayGrid } from "@/components/ui";
import { logCare } from "@/lib/actions";
import { formatDate } from "@/lib/dates";
import { cellRange, coverPhotos, photosFor, plantingViews, sortedTrays } from "@/lib/garden";
import { useGarden } from "@/lib/GardenContext";
import type { CareStatus } from "@/lib/schedule";

export function TraysPage() {
  const { data, today } = useGarden();
  const plantings = plantingViews(data, today);
  const { byPlanting } = coverPhotos(data);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planters</h1>
          <p className="sub">Tap a cell to see that plant, or an empty cell to plant it.</p>
        </div>
      </div>
      <div className="grid cols-2">
        {sortedTrays(data).map((t) => {
          const inTray = plantings.filter((p) => p.trayId === t.id);
          return (
            <section key={t.id} className="card">
              <div className="card-head">
                <h2><Link to={`/trays/${t.id}`}>{t.name}</Link></h2>
                <span className="muted small">{inTray.length ? `${inTray.length} plantings` : "empty — ready to plant"}</span>
              </div>
              <p className="small muted">{t.kind}</p>
              <TrayGrid tray={t} plantings={inTray} covers={byPlanting} />
            </section>
          );
        })}
      </div>
    </>
  );
}

export function TrayPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, today, act } = useGarden();
  const tray = data.trays.find((t) => t.id === id);
  if (!tray) return <p className="empty">That planter doesn&rsquo;t exist. <Link to="/trays">All planters</Link></p>;
  const cell = params.get("cell");
  const plantings = plantingViews(data, today).filter((p) => p.trayId === tray.id);
  const { byPlanting } = coverPhotos(data);
  const photos = photosFor(data, { trayId: tray.id });
  const allCells = tray.rows.flatMap((r) => Array.from({ length: tray.cols }, (_, i) => `${i + 1}${r}`));
  const taken = new Set(plantings.flatMap((p) => p.cells));
  const emptyCells = allCells.filter((c) => !taken.has(c));
  const active = plantings.filter((p) => !["planned", "done", "failed"].includes(p.status));
  const urgent = new Map<string, CareStatus>();
  for (const p of plantings) {
    const worst = p.care.find((c) => c.key !== "water" && ["overdue", "late", "due"].includes(c.status));
    if (worst) urgent.set(p.id, worst.status);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link to="/trays">Planters</Link> /</p>
          <h1>{tray.name}</h1>
          <p className="sub">{tray.kind} · {tray.notes}</p>
        </div>
        {active.length > 0 && (
          <ActionButton className="primary" onClick={() => act((ctx) => logCare(ctx, { plantingIds: active.map((p) => p.id), type: "watered" }))}>
            💧 Watered the whole {tray.name.toLowerCase()}
          </ActionButton>
        )}
      </div>

      <div className="grid main-side">
        <div className="stack">
          <TrayGrid tray={tray} plantings={plantings} covers={byPlanting} urgent={urgent} />

          {cell && emptyCells.includes(cell) && (
            <section className="card" id="plant">
              <h2>Plant cell {cell}</h2>
              <PlantCellsForm key={cell} trayId={tray.id} emptyCells={emptyCells} initialCell={cell} today={today} />
              <p className="small muted" style={{ marginTop: 8 }}>
                Plant missing? <Link to="/plants/new">Add it to the seed library</Link> first.
              </p>
            </section>
          )}

          <section className="card">
            <h2>What&rsquo;s in here</h2>
            {plantings.length === 0 && <p className="empty">Nothing planted yet. Tap an empty cell above to start.</p>}
            <ul className="care-list">
              {plantings.map((p) => {
                const next = p.care.find((c) => c.key !== "water" && c.status !== "done");
                return (
                  <li key={p.id} className="care-item">
                    <Photo id={byPlanting.get(p.id)} alt="" className="thumb" />
                    <div className="what">
                      <div className="title"><Link to={`/plantings/${p.id}`}>{cellRange(p.cells)} · {p.name}</Link></div>
                      <div className="small muted">
                        {p.sownAt ? `Sown ${formatDate(p.sownAt)}${p.sowDateEstimated ? " (est.)" : ""}` : "Not sown yet"}
                        {next && <> · next: {next.title}</>}
                      </div>
                    </div>
                    {next && <CareChip item={next} today={today} />}
                    <span className={`chip ${p.status}`}>{p.status}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h3>Planter photos</h3>
            {photos.length > 0 && (
              <div className="stack" style={{ gap: 8, marginBottom: 12 }}>
                <Photo id={photos[0].id} alt={tray.name} className="hero-photo" />
                <span className="small muted">{photos[0].caption ?? formatDate(photos[0].takenAt)}</span>
                {photos.length > 1 && (
                  <div className="gallery">
                    {photos.slice(1).map((ph) => (
                      <figure key={ph.id}>
                        <Photo id={ph.id} alt="" />
                        <figcaption>{formatDate(ph.takenAt)}</figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            )}
            <PhotoUpload trayId={tray.id} kind="tray" today={today} />
          </section>
          <section className="card">
            <h3>Note for the whole garden</h3>
            <NoteForm />
          </section>
        </div>
      </div>
    </>
  );
}
