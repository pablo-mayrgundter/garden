// Where the plants of a bed's planter stand on the map, worked out from the
// same row layout as the planter page. Shared by the map drawing and the IFC
// export, so both show the same plants in the same spots.

import { layoutBed } from "../bedLayout.ts";
import { plantStates } from "../garden.ts";
import { speciesColor } from "../plantColors.ts";
import type { GardenData, Planting } from "../types.ts";
import type { MapEntity } from "./model.ts";

export type BedPlant = {
  key: string;
  plantingId: string;
  /** Where the plant stands, in world feet. */
  x: number;
  y: number;
  /** Its spread when grown (feet), and how far along it is (0–1). */
  r: number;
  stage: number;
  color: string;
};

/** Plants of a planter laid out in a bed, from the same layout as the planter page: rows along the long side. */
export function bedPlants(e: MapEntity, data: GardenData, inset = 0.18): BedPlant[] {
  const tray = e.links.trayId ? data.trays.find((t) => t.id === e.links.trayId) : undefined;
  if (!tray) return [];
  const alongX = e.w >= e.d;
  const size = { length: (alongX ? e.w : e.d) - inset * 2, width: (alongX ? e.d : e.w) - inset * 2 };
  const plantings = data.plantings.filter((x) => x.trayId === tray.id);
  const bed = layoutBed(tray, plantings, size);
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const species = new Map(data.species.map((x) => [x.id, x]));
  const states = new Map(plantings.map((p) => [p.id, p.count ? plantStates(data, p.id, p.count) : []]));
  const stageOf = (p: Planting) => ({ planned: 0.15, sown: 0.3, sprouted: 0.6, growing: 0.85, transplanted: 0.85, harvesting: 1, done: 0.4, failed: 0.2 })[p.status] ?? 0.5;
  const rowGap = size.width / Math.max(1, tray.rows.length);
  const spacing = new Map(bed.rows.flatMap((r) => r.plantings.map((rp) => [rp.planting.id, rp.spacingIn / 12] as const)));
  return bed.spots.map((s) => {
    const p = byId.get(s.plantingId)!;
    const st = states.get(p.id)?.[s.n - 1];
    return {
      key: `${p.id}-${s.n}`,
      plantingId: p.id,
      x: alongX ? e.x + inset + s.along : e.x + inset + s.across,
      y: alongX ? e.y + inset + s.across : e.y + inset + s.along,
      r: Math.min(spacing.get(p.id) ?? rowGap, rowGap) * 0.42,
      color: st && st.condition !== "healthy" ? CONDITION_TINT[st.condition] : speciesColor(species.get(p.speciesId)),
      stage: stageOf(p),
    };
  });
}

const CONDITION_TINT: Record<string, string> = {
  pests: "#d4572a",
  disease: "#8a5a2b",
  nutrients: "#e0b52d",
  water: "#4d86c4",
  weeds: "#8a9a3a",
  damage: "#9a5bb5",
  missing: "#333333",
  other: "#8a8a8a",
};
