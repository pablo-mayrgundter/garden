// Read-side helpers over the in-memory GardenData.

import { careSchedule, sortCare, type CareItem } from "./schedule.ts";
import type { CareEvent, GardenData, Note, Photo, Planting, Species, Task } from "./types.ts";

export type PlantingView = Planting & {
  name: string;
  variety: string | null;
  trayName: string | null;
  species: Species;
  care: CareItem[];
};

export function cellRange(cells: string[]): string {
  if (cells.length <= 1) return cells[0] ?? "";
  const row = cells[0].replace(/^\d+/, "");
  if (cells.every((c) => c.endsWith(row))) {
    const nums = cells.map((c) => parseInt(c, 10)).sort((a, b) => a - b);
    return `${nums[0]}–${nums.at(-1)}${row}`;
  }
  return cells.join(", ");
}

export function plantingLabel(p: Pick<PlantingView, "name" | "trayName" | "cells" | "location">): string {
  const where = p.trayName ? `${p.trayName} ${cellRange(p.cells)}` : p.location;
  return where ? `${p.name} · ${where}` : p.name;
}

export const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

export function sortedSpecies(data: GardenData): Species[] {
  return [...data.species].sort((a, b) => a.category.localeCompare(b.category) || a.commonName.localeCompare(b.commonName));
}

export function sortedTrays(data: GardenData) {
  return [...data.trays].sort((a, b) => a.position - b.position);
}

export function eventsFor(data: GardenData, plantingId: string): CareEvent[] {
  return data.events.filter((e) => e.plantingId === plantingId).sort((a, b) => b.date.localeCompare(a.date) || byNewest(a, b));
}

export function notesFor(data: GardenData, plantingId?: string | null): Note[] {
  return data.notes.filter((n) => plantingId === undefined || n.plantingId === plantingId).sort(byNewest);
}

export function tasksFor(data: GardenData, opts: { plantingId?: string; includeDone?: boolean } = {}): Task[] {
  return data.tasks
    .filter((t) => (opts.plantingId === undefined || t.plantingId === opts.plantingId) && (opts.includeDone || !t.doneAt))
    .sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || a.dueDate.localeCompare(b.dueDate));
}

export function photosFor(data: GardenData, f: Partial<Pick<Photo, "plantingId" | "speciesId" | "trayId" | "kind">>): Photo[] {
  return data.photos
    .filter((p) => (Object.keys(f) as (keyof typeof f)[]).every((k) => p[k] === f[k]))
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt) || byNewest(a, b));
}

/** Latest progress photo per planting, and packet front per species. */
export function coverPhotos(data: GardenData) {
  const byPlanting = new Map<string, string>();
  const bySpecies = new Map<string, string>();
  for (const ph of [...data.photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt) || byNewest(a, b))) {
    if (ph.plantingId && ph.kind === "progress" && !byPlanting.has(ph.plantingId)) byPlanting.set(ph.plantingId, ph.id);
    if (ph.speciesId && ph.kind === "packet_front" && !bySpecies.has(ph.speciesId)) bySpecies.set(ph.speciesId, ph.id);
  }
  return { byPlanting, bySpecies };
}

export function plantingViews(data: GardenData, today: string): PlantingView[] {
  const species = new Map(data.species.map((s) => [s.id, s]));
  const trays = new Map(data.trays.map((t) => [t.id, t]));
  return data.plantings
    .filter((p) => species.has(p.speciesId))
    .map((p) => {
      const s = species.get(p.speciesId)!;
      const tray = p.trayId ? trays.get(p.trayId) : undefined;
      const care = careSchedule(
        {
          status: p.status,
          sownAt: p.sownAt,
          germDaysMin: s.germDaysMin,
          germDaysMax: s.germDaysMax,
          waterEveryDays: s.waterEveryDays,
          milestones: s.milestones,
          events: data.events.filter((e) => e.plantingId === p.id),
        },
        today,
      );
      return { ...p, name: s.commonName, variety: s.variety, trayName: tray?.name ?? null, species: s, care: sortCare(care) };
    })
    .sort((a, b) => {
      const ta = a.trayId ? (trays.get(a.trayId)?.position ?? 99) : 99;
      const tb = b.trayId ? (trays.get(b.trayId)?.position ?? 99) : 99;
      return ta - tb || cellOrder(a.cells[0]) - cellOrder(b.cells[0]) || a.createdAt.localeCompare(b.createdAt);
    });
}

/** Row-major order for labels like "3B": row letter first, then column number. */
function cellOrder(cell: string | undefined): number {
  if (!cell) return 9999;
  const col = parseInt(cell, 10) || 0;
  const row = cell.replace(/^\d+/, "").charCodeAt(0) || 0;
  return row * 100 + col;
}
