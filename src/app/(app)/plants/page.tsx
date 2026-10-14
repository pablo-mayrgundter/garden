import Link from "next/link";
import { Photo } from "@/components/ui";
import { requireGardener } from "@/lib/auth";
import { coverPhotos, listPlantings, listSpecies } from "@/lib/garden";

export const metadata = { title: "Seed library" };
export const dynamic = "force-dynamic";

const EMOJI: Record<string, string> = { herb: "🌿", vegetable: "🥬", succulent: "🪴", flower: "🌸" };

export default async function PlantsPage() {
  const { garden } = await requireGardener();
  const species = listSpecies(garden.gardenId);
  const { bySpecies } = coverPhotos(garden.gardenId);
  const plantings = listPlantings(garden.gardenId);
  const groups = [...new Set(species.map((s) => s.category))];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Seed library</h1>
          <p className="sub">Every packet we&rsquo;ve got, with its growing instructions.</p>
        </div>
        <Link href="/plants/new" className="btn btn-primary">+ Add a plant</Link>
      </div>
      {groups.map((g) => (
        <section key={g} style={{ marginBottom: 28 }}>
          <h2 style={{ textTransform: "capitalize" }}>{g}s</h2>
          <div className="grid cols-3">
            {species.filter((s) => s.category === g).map((s) => {
              const count = plantings.filter((p) => p.speciesId === s.id).length;
              const cover = bySpecies.get(s.id);
              return (
                <Link key={s.id} href={`/plants/${s.id}`} className="card plant-card">
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
