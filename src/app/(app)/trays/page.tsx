import Link from "next/link";
import { TrayGrid } from "@/components/ui";
import { requireGardener } from "@/lib/auth";
import { coverPhotos, listPlantings, listTrays } from "@/lib/garden";

export const metadata = { title: "Planters" };
export const dynamic = "force-dynamic";

export default async function TraysPage() {
  const { garden } = await requireGardener();
  const trays = listTrays(garden.gardenId);
  const plantings = listPlantings(garden.gardenId);
  const { byPlanting } = coverPhotos(garden.gardenId);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Planters</h1>
          <p className="sub">Tap a cell to see that plant, or an empty cell to plant it.</p>
        </div>
      </div>
      <div className="grid cols-2">
        {trays.map((t) => {
          const inTray = plantings.filter((p) => p.trayId === t.id);
          return (
            <section key={t.id} className="card">
              <div className="card-head">
                <h2><Link href={`/trays/${t.id}`}>{t.name}</Link></h2>
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
