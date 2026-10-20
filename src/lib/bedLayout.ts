// Where each plant in a bed of rows actually sits, worked out from the bed's
// real size. Rows run along the bed's length and are spread evenly across its
// width; a row's plants are spaced evenly along its length, so 24 radishes in a
// 6 ft row land 3 in apart. The planter page and the garden map both draw from
// this, so they always agree.

import type { GardenData, Planting, Tray } from "./types.ts";

export type BedSize = { length: number; width: number };
export type BedSizeSource = "map" | "planter" | "assumed";

/** A typical raised bed, used until the bed's real size is set. */
export const DEFAULT_BED: BedSize = { length: 8, width: 4 };

/** The bed's size in feet: from its place on the map, else from the planter, else a typical bed. */
export function bedSize(data: Pick<GardenData, "mapEntities">, tray: Tray): BedSize & { source: BedSizeSource } {
  const e = data.mapEntities.find((m) => m.links.trayId === tray.id);
  if (e) return { length: Math.max(e.w, e.d), width: Math.min(e.w, e.d), source: "map" };
  if (tray.size) return { ...tray.size, source: "planter" };
  return { ...DEFAULT_BED, source: "assumed" };
}

export type BedSpot = {
  plantingId: string;
  speciesId: string;
  /** Plant number within its planting, 1-based (matches per-plant checks). */
  n: number;
  row: string;
  /** Feet from the start of the bed, along its length. */
  along: number;
  /** Feet from the edge of the bed, across its width. */
  across: number;
};

export type BedRowPlanting = {
  planting: Planting;
  /** Where along the row this planting starts and ends, in feet. */
  start: number;
  end: number;
  count: number;
  /** Distance between plants, in inches. */
  spacingIn: number;
};

export type BedRow = { row: string; across: number; plantings: BedRowPlanting[] };

export type BedLayout = {
  size: BedSize;
  rows: BedRow[];
  spots: BedSpot[];
  /** Distance between rows, in inches. */
  rowSpacingIn: number;
};

const rowOf = (cell: string) => cell.replace(/^\d+/, "");
const colOf = (cell: string) => parseInt(cell, 10);

export function layoutBed(tray: Pick<Tray, "rows" | "cols">, plantings: Planting[], size: BedSize): BedLayout {
  const R = Math.max(1, tray.rows.length);
  const C = Math.max(1, tray.cols);
  const rowGap = size.width / R;
  const rows: BedRow[] = tray.rows.map((row, r) => ({ row, across: (r + 0.5) * rowGap, plantings: [] }));
  const spots: BedSpot[] = [];
  for (const p of plantings) {
    if (!p.cells.length) continue;
    const r = tray.rows.indexOf(rowOf(p.cells[0]));
    if (r < 0) continue;
    const cols = p.cells.map(colOf).filter((n) => n > 0);
    if (!cols.length) continue;
    // A row written across several columns splits the length between them.
    const start = ((Math.min(...cols) - 1) / C) * size.length;
    const end = (Math.max(...cols) / C) * size.length;
    const count = Math.max(1, p.count ?? p.cells.length);
    const step = (end - start) / count;
    rows[r].plantings.push({ planting: p, start, end, count, spacingIn: step * 12 });
    for (let i = 0; i < count; i++) {
      spots.push({ plantingId: p.id, speciesId: p.speciesId, n: i + 1, row: rows[r].row, along: start + (i + 0.5) * step, across: rows[r].across });
    }
  }
  for (const r of rows) r.plantings.sort((a, b) => a.start - b.start);
  return { size, rows, spots, rowSpacingIn: rowGap * 12 };
}

/** "3 in", "1 ft 2 in", rounded to the nearest half inch. */
export function formatInches(inches: number): string {
  const v = Math.round(inches * 2) / 2;
  if (v < 12) return `${v} in`;
  const ft = Math.floor(v / 12);
  const rest = v - ft * 12;
  return rest ? `${ft} ft ${rest} in` : `${ft} ft`;
}
