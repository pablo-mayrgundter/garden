import Link from "next/link";
import { notFound } from "next/navigation";
import { logCare } from "@/app/actions";
import { NoteForm, PhotoUpload, PlantCellsForm } from "@/components/forms";
import { CareChip, Photo, TrayGrid } from "@/components/ui";
import { requireGardener } from "@/lib/auth";
import { formatDate, todayIn } from "@/lib/dates";
import { cellRange, coverPhotos, getTray, listPhotos, listSpecies, plantingsWithCare } from "@/lib/garden";
import type { CareStatus } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function TrayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cell?: string }> }) {
  const { garden } = await requireGardener();
  const tray = getTray(garden.gardenId, Number((await params).id));
  if (!tray) notFound();
  const { cell } = await searchParams;
  const today = todayIn(garden.timezone);
  const plantings = plantingsWithCare(garden.gardenId, today, { trayId: tray.id });
  const { byPlanting } = coverPhotos(garden.gardenId);
  const photos = listPhotos(garden.gardenId, { trayId: tray.id });
  const allCells = tray.rows.flatMap((r) => Array.from({ length: tray.cols }, (_, i) => `${i + 1}${r}`));
  const taken = new Set(plantings.flatMap((p) => p.cells));
  const emptyCells = allCells.filter((c) => !taken.has(c));
  const active = plantings.filter((p) => !["planned", "done", "failed"].includes(p.status));
  const urgent = new Map<number, CareStatus>();
  for (const p of plantings) {
    const worst = p.care.find((c) => c.key !== "water" && ["overdue", "late", "due"].includes(c.status));
    if (worst) urgent.set(p.id, worst.status);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link href="/trays">Planters</Link> /</p>
          <h1>{tray.name}</h1>
          <p className="sub">{tray.kind} · {tray.notes}</p>
        </div>
        {active.length > 0 && (
          <form action={logCare}>
            <input type="hidden" name="plantingIds" value={active.map((p) => p.id).join(",")} />
            <input type="hidden" name="type" value="watered" />
            <button className="primary">💧 Watered the whole {tray.name.toLowerCase()}</button>
          </form>
        )}
      </div>

      <div className="grid main-side">
        <div className="stack">
          <TrayGrid tray={tray} plantings={plantings} covers={byPlanting} urgent={urgent} />

          {cell && emptyCells.includes(cell) && (
            <section className="card" id="plant">
              <h2>Plant cell {cell}</h2>
              <PlantCellsForm
                trayId={tray.id}
                emptyCells={emptyCells}
                initialCell={cell}
                species={listSpecies(garden.gardenId).map(({ id, commonName, variety }) => ({ id, commonName, variety }))}
                today={today}
              />
              <p className="small muted" style={{ marginTop: 8 }}>
                Plant missing? <Link href="/plants/new">Add it to the seed library</Link> first.
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
                    {byPlanting.get(p.id) ? <Photo id={byPlanting.get(p.id)!} alt="" className="thumb" /> : <div className="thumb" />}
                    <div className="what">
                      <div className="title"><Link href={`/plantings/${p.id}`}>{cellRange(p.cells)} · {p.name}</Link></div>
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
            <h3>Note for the whole planter</h3>
            <NoteForm />
          </section>
        </div>
      </div>
    </>
  );
}
