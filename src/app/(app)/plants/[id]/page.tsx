import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoUpload, SpeciesForm } from "@/components/forms";
import { Photo, StatusChip } from "@/components/ui";
import { WikipediaCard } from "@/components/WikipediaCard";
import { requireGardener } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { cellRange, getSpecies, listPhotos, listPlantings } from "@/lib/garden";

export const dynamic = "force-dynamic";

export default async function PlantPage({ params }: { params: Promise<{ id: string }> }) {
  const { garden } = await requireGardener();
  const s = getSpecies(garden.gardenId, Number((await params).id));
  if (!s) notFound();
  const today = todayIn(garden.timezone);
  const packet = listPhotos(garden.gardenId, { speciesId: s.id });
  const plantings = listPlantings(garden.gardenId, { speciesId: s.id });
  const facts: [string, string | null][] = [
    ["Seed company", s.source],
    ["Seeds", s.seedsPerPacket],
    ["Sow depth", s.sowDepth],
    ["Sprouts in", s.germDaysMin != null ? `${s.germDaysMin}–${s.germDaysMax} days` : null],
    ["Light", s.light],
    ["Soil", s.soil],
    ["Watering", s.watering],
    ["Height", s.height],
    ["Spread", s.spread],
    ["Spacing", s.spacing],
    ["Harvest", s.harvestDaysMin != null ? `${s.harvestDaysMin}–${s.harvestDaysMax} days from sowing` : null],
    ["Lifecycle", s.lifecycle],
    ["Uses", s.uses],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link href="/plants">Seed library</Link> /</p>
          <h1>{s.commonName}{s.variety && <span className="muted" style={{ fontWeight: 400 }}> · {s.variety}</span>}</h1>
          {s.scientificName && <p className="sub"><em>{s.scientificName}</em></p>}
        </div>
      </div>

      <div className="grid main-side">
        <div className="stack">
          <section className="card">
            <h2>From the packet</h2>
            <dl className="facts">
              {facts.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {s.packetText && <p style={{ marginTop: 14 }}>{s.packetText}</p>}
            {s.tips.length > 0 && (
              <>
                <h3>Tips</h3>
                <ul style={{ paddingLeft: 18 }}>{s.tips.map((t) => <li key={t}>{t}</li>)}</ul>
              </>
            )}
            {s.milestones.length > 0 && (
              <>
                <h3>Schedule milestones</h3>
                <ul className="timeline">
                  {s.milestones.map((m) => (
                    <li key={m.key}>
                      <span className="date">day {m.dayMin}–{m.dayMax}</span>
                      <span>{m.title} <span className="muted small">(from {m.from === "sown" ? "sowing" : "sprouting"})</span></span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <h2>Planted</h2>
            {plantings.length === 0 && <p className="empty">Not planted yet — tap an empty cell on a <Link href="/trays">planter</Link>.</p>}
            <ul className="care-list">
              {plantings.map((p) => (
                <li key={p.id} className="care-item">
                  <div className="what">
                    <Link href={`/plantings/${p.id}`} className="title">{p.trayName} {cellRange(p.cells)}</Link>
                  </div>
                  <StatusChip status={p.status} />
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <details>
              <summary>Edit packet details</summary>
              <SpeciesForm species={s} />
            </details>
          </section>
        </div>

        <div className="stack">
          {packet.length > 0 && (
            <section className="card">
              <h3>Packet photos</h3>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {packet.map((ph) => (
                  <a key={ph.id} href={`/api/photos/${ph.id}`} target="_blank" rel="noreferrer">
                    <Photo id={ph.id} alt={ph.caption ?? ""} className="packet" />
                  </a>
                ))}
              </div>
            </section>
          )}
          {s.wikipediaTitle && (
            <section className="card">
              <h3>From Wikipedia</h3>
              <WikipediaCard title={s.wikipediaTitle} />
            </section>
          )}
          <section className="card">
            <h3>Add a packet photo</h3>
            <PhotoUpload speciesId={s.id} kind={packet.some((p) => p.kind === "packet_front") ? "packet_back" : "packet_front"} today={today} />
          </section>
        </div>
      </div>
    </>
  );
}
