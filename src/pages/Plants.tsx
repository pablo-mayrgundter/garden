import { Link, useParams } from "react-router";
import { PhotoUpload, SpeciesForm } from "@/components/forms";
import { Photo, StatusChip } from "@/components/ui";
import { WikipediaCard } from "@/components/WikipediaCard";
import { cellRange, coverPhotos, photosFor, plantingViews, sortedSpecies } from "@/lib/garden";
import { useGarden } from "@/lib/GardenContext";

const EMOJI: Record<string, string> = { herb: "🌿", vegetable: "🥬", succulent: "🪴", flower: "🌸" };

export function PlantsPage() {
  const { data } = useGarden();
  const species = sortedSpecies(data);
  const { bySpecies } = coverPhotos(data);
  const groups = [...new Set(species.map((s) => s.category))];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Seed library</h1>
          <p className="sub">Every packet we&rsquo;ve got, with its growing instructions.</p>
        </div>
        <Link to="/plants/new" className="btn btn-primary">+ Add a plant</Link>
      </div>
      {groups.map((g) => (
        <section key={g} style={{ marginBottom: 28 }}>
          <h2 style={{ textTransform: "capitalize" }}>{g}s</h2>
          <div className="grid cols-3">
            {species
              .filter((s) => s.category === g)
              .map((s) => {
                const count = data.plantings.filter((p) => p.speciesId === s.id).length;
                const cover = bySpecies.get(s.id);
                return (
                  <Link key={s.id} to={`/plants/${s.id}`} className="card plant-card">
                    {cover ? <Photo id={cover} alt={`${s.commonName} seed packet`} className="packet" /> : <div className="placeholder">{EMOJI[s.category] ?? "🌱"}</div>}
                    <div>
                      <strong>{s.commonName}</strong>
                      {s.variety && <span className="muted"> · {s.variety}</span>}
                      <div className="small muted">
                        {s.scientificName && <em>{s.scientificName}</em>}
                        {count > 0 ? ` · ${count} planted` : " · not planted"}
                      </div>
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </>
  );
}

export function NewPlantPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link to="/plants">Seed library</Link> /</p>
          <h1>Add a plant</h1>
          <p className="sub">Copy what&rsquo;s on the back of the packet — the schedule is built from it. Packet photos can be added on the next page.</p>
        </div>
      </div>
      <section className="card">
        <SpeciesForm />
      </section>
    </>
  );
}

export function PlantPage() {
  const { id } = useParams();
  const { data, today } = useGarden();
  const s = data.species.find((x) => x.id === id);
  if (!s) return <p className="empty">That plant isn&rsquo;t in the library. <Link to="/plants">Seed library</Link></p>;
  const packet = photosFor(data, { speciesId: s.id });
  const plantings = plantingViews(data, today).filter((p) => p.speciesId === s.id);
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
          <p className="sub"><Link to="/plants">Seed library</Link> /</p>
          <h1>
            {s.commonName}
            {s.variety && <span className="muted" style={{ fontWeight: 400 }}> · {s.variety}</span>}
          </h1>
          {s.scientificName && <p className="sub"><em>{s.scientificName}</em></p>}
        </div>
      </div>

      <div className="grid main-side">
        <div className="stack">
          <section className="card">
            <h2>From the packet</h2>
            <dl className="facts">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
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
            {plantings.length === 0 && <p className="empty">Not planted yet — tap an empty cell on a <Link to="/trays">planter</Link>.</p>}
            <ul className="care-list">
              {plantings.map((p) => (
                <li key={p.id} className="care-item">
                  <div className="what">
                    <Link to={`/plantings/${p.id}`} className="title">{p.trayName} {cellRange(p.cells)}</Link>
                  </div>
                  <StatusChip status={p.status} />
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <details>
              <summary>Edit packet details</summary>
              <SpeciesForm key={s.id} species={s} />
            </details>
          </section>
        </div>

        <div className="stack">
          {packet.length > 0 && (
            <section className="card">
              <h3>Packet photos</h3>
              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {packet.map((ph) => (
                  <Photo key={ph.id} id={ph.id} alt={ph.caption ?? ""} className="packet" link />
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
