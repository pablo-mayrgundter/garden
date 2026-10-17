// Every change to the garden goes through here, from the UI and the assistant alike.

import { defaultMilestones, type EventType, type PlantingStatus } from "./model.ts";
import { deleteRecord, newId, putRecords, saveGarden, savePhoto, type GardenDB } from "./store.ts";
import { cellRange } from "./garden.ts";
import { groupCells, parseTrayMarkdown, trayToMarkdown } from "./trayMarkdown.ts";
import type { CareEvent, Garden, GardenData, Photo, Planting, Species, Tray } from "./types.ts";

export type ActionCtx = { db: GardenDB; data: GardenData; by: string | null; today: string };

const now = () => new Date().toISOString();

/** Logging certain events implies the planting moved on to a new stage. */
const ADVANCE: Partial<Record<EventType, { to: PlantingStatus; from: PlantingStatus[] }>> = {
  sprouted: { to: "sprouted", from: ["planned", "sown"] },
  transplanted: { to: "transplanted", from: ["sown", "sprouted", "growing"] },
  potted_up: { to: "growing", from: ["sown", "sprouted"] },
  harvested: { to: "harvesting", from: ["sprouted", "growing", "transplanted"] },
};

export async function logCare(
  ctx: ActionCtx,
  input: { plantingIds: string[]; type: EventType; date?: string; note?: string | null; byAssistant?: boolean },
): Promise<number> {
  const plantings = ctx.data.plantings.filter((p) => input.plantingIds.includes(p.id));
  const date = input.date || ctx.today;
  const events: CareEvent[] = plantings.map((p) => ({
    id: newId(),
    plantingId: p.id,
    type: input.type,
    date,
    note: input.note || null,
    by: ctx.by,
    byAssistant: !!input.byAssistant,
    createdAt: now(),
  }));
  await putRecords(ctx.db, "events", events);
  const rule = ADVANCE[input.type];
  if (rule) {
    const moved = plantings.filter((p) => rule.from.includes(p.status)).map((p) => ({ ...p, status: rule.to, updatedAt: now() }));
    await putRecords(ctx.db, "plantings", moved);
  }
  return events.length;
}

export const deleteEvent = (ctx: ActionCtx, id: string) => deleteRecord(ctx.db, "events", id);

export async function addNote(ctx: ActionCtx, input: { plantingId: string | null; body: string; byAssistant?: boolean }) {
  await putRecords(ctx.db, "notes", [
    { id: newId(), plantingId: input.plantingId, body: input.body, by: ctx.by, byAssistant: !!input.byAssistant, createdAt: now() },
  ]);
}

export const deleteNote = (ctx: ActionCtx, id: string) => deleteRecord(ctx.db, "notes", id);

export async function addTask(ctx: ActionCtx, input: { plantingId: string | null; title: string; dueDate: string; byAssistant?: boolean }) {
  await putRecords(ctx.db, "tasks", [
    {
      id: newId(),
      plantingId: input.plantingId,
      title: input.title,
      dueDate: input.dueDate,
      doneAt: null,
      by: ctx.by,
      byAssistant: !!input.byAssistant,
      createdAt: now(),
    },
  ]);
}

export async function setTaskDone(ctx: ActionCtx, id: string, done: boolean) {
  const t = ctx.data.tasks.find((x) => x.id === id);
  if (t) await putRecords(ctx.db, "tasks", [{ ...t, doneAt: done ? now() : null }]);
}

export async function updatePlanting(
  ctx: ActionCtx,
  id: string,
  patch: Partial<Pick<Planting, "status" | "sownAt" | "sowDateEstimated" | "location">>,
) {
  const p = ctx.data.plantings.find((x) => x.id === id);
  if (!p) throw new Error("Unknown planting");
  await putRecords(ctx.db, "plantings", [{ ...p, ...patch, updatedAt: now() }]);
}

export const markSown = (ctx: ActionCtx, id: string) =>
  updatePlanting(ctx, id, { status: "sown", sownAt: ctx.today, sowDateEstimated: false });

export async function createPlanting(
  ctx: ActionCtx,
  input: { speciesId: string; trayId: string | null; cells: string[]; sownAt: string | null; location?: string | null },
): Promise<string> {
  const id = newId();
  await putRecords(ctx.db, "plantings", [
    {
      id,
      speciesId: input.speciesId,
      trayId: input.trayId,
      cells: input.cells,
      location: input.location ?? null,
      status: input.sownAt ? "sown" : "planned",
      sownAt: input.sownAt,
      sowDateEstimated: false,
      createdAt: now(),
      updatedAt: now(),
    },
  ]);
  return id;
}

/** Removes a planting along with its care log, notes, tasks and photos. */
export async function deletePlanting(ctx: ActionCtx, id: string) {
  const { data, db } = ctx;
  await Promise.all([
    ...data.events.filter((e) => e.plantingId === id).map((e) => deleteRecord(db, "events", e.id)),
    ...data.notes.filter((n) => n.plantingId === id).map((n) => deleteRecord(db, "notes", n.id)),
    ...data.tasks.filter((t) => t.plantingId === id).map((t) => deleteRecord(db, "tasks", t.id)),
    ...data.photos.filter((p) => p.plantingId === id).map((p) => deleteRecord(db, "photos", p.id)),
  ]);
  await deleteRecord(db, "plantings", id);
}

export async function addPhoto(
  ctx: ActionCtx,
  input: Pick<Photo, "plantingId" | "speciesId" | "trayId" | "kind" | "caption" | "takenAt">,
  blob: Blob,
) {
  await savePhoto(ctx.db, { ...input, id: newId(), mime: blob.type || "image/jpeg", src: null, by: ctx.by, createdAt: now() }, blob);
}

export const deletePhoto = (ctx: ActionCtx, id: string) => deleteRecord(ctx.db, "photos", id);

export async function saveSpecies(ctx: ActionCtx, input: Omit<Species, "id" | "slug" | "createdAt" | "milestones"> & { id?: string }) {
  const existing = input.id ? ctx.data.species.find((s) => s.id === input.id) : undefined;
  const id = existing?.id ?? newId();
  const record: Species = {
    milestones: existing?.milestones ?? defaultMilestones(input),
    ...input,
    id,
    slug: existing?.slug ?? id,
    createdAt: existing?.createdAt ?? now(),
  };
  await putRecords(ctx.db, "species", [record]);
  return id;
}

export const updateGarden = (ctx: ActionCtx, patch: Partial<Omit<Garden, "id">>) => saveGarden(ctx.db, { ...ctx.data.garden, ...patch });

// ---------- Planter layouts (markdown) ----------

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** How a species is written in a layout table: its name, plus the variety when two share a name. */
export function layoutName(s: Species, all: Species[]): string {
  const clash = all.some((o) => o.id !== s.id && norm(o.commonName) === norm(s.commonName));
  return clash && s.variety ? `${s.commonName} (${s.variety})` : s.commonName;
}

function findSpecies(name: string, all: Species[]): Species | undefined {
  const n = norm(name);
  return (
    all.find((s) => norm(layoutName(s, all)) === n) ??
    all.find((s) => norm(s.commonName) === n) ??
    all.find((s) => s.variety && [`${s.commonName} ${s.variety}`, `${s.commonName} — ${s.variety}`, `${s.commonName} (${s.variety})`].some((v) => norm(v) === n))
  );
}

export function trayMarkdown(data: GardenData, trayId: string): string {
  const tray = data.trays.find((t) => t.id === trayId);
  if (!tray) throw new Error("Unknown planter");
  const species = new Map(data.species.map((s) => [s.id, s]));
  const names = new Map<string, string>();
  for (const p of data.plantings.filter((x) => x.trayId === trayId)) {
    const s = species.get(p.speciesId);
    if (s) for (const c of p.cells) names.set(c, layoutName(s, data.species));
  }
  return trayToMarkdown(tray, names);
}

export type LayoutResult = { trayId: string; kept: number; moved: number; added: number; removed: number; detached: number; newPlants: string[] };

/**
 * Applies a planter's markdown layout: creates or updates the planter, keeps
 * plantings that are still there, moves ones whose cells changed, plans new ones,
 * and takes away the rest — deleting those with no history, and keeping those with
 * care logs, notes or photos as plantings outside the planter.
 */
export async function applyTrayLayout(ctx: ActionCtx, trayId: string | null, md: string): Promise<LayoutResult> {
  const parsed = parseTrayMarkdown(md);
  const { data, db } = ctx;
  const existingTray = trayId ? data.trays.find((t) => t.id === trayId) : undefined;
  const tray: Tray = {
    id: existingTray?.id ?? newId(),
    name: parsed.name,
    kind: parsed.kind,
    notes: parsed.notes,
    rows: parsed.rows,
    cols: parsed.cols,
    position: existingTray?.position ?? data.trays.length,
    createdAt: existingTray?.createdAt ?? now(),
  };

  // Resolve plant names, adding unknown ones to the seed library.
  const species = [...data.species];
  const newSpecies: Species[] = [];
  const groups = groupCells(parsed).map((g) => {
    let s = findSpecies(g.name, species);
    if (!s) {
      s = blankSpecies(g.name);
      species.push(s);
      newSpecies.push(s);
    }
    return { speciesId: s.id, cells: g.cells };
  });

  const existing = data.plantings.filter((p) => p.trayId === tray.id);
  const sameCells = (a: string[], b: string[]) => a.length === b.length && a.every((c) => b.includes(c));
  const result: LayoutResult = { trayId: tray.id, kept: 0, moved: 0, added: 0, removed: 0, detached: 0, newPlants: newSpecies.map((s) => s.commonName) };
  const keep = new Set<string>();
  const updates: Planting[] = [];
  const pending = groups.filter((g) => {
    const match = existing.find((p) => !keep.has(p.id) && p.speciesId === g.speciesId && sameCells(p.cells, g.cells));
    if (match) {
      keep.add(match.id);
      result.kept++;
    }
    return !match;
  });
  const creates: Planting[] = [];
  for (const g of pending) {
    const moved = existing.find((p) => !keep.has(p.id) && p.speciesId === g.speciesId && p.cells.some((c) => g.cells.includes(c)));
    if (moved) {
      keep.add(moved.id);
      updates.push({ ...moved, cells: g.cells, updatedAt: now() });
      result.moved++;
    } else {
      creates.push({ id: newId(), speciesId: g.speciesId, trayId: tray.id, cells: g.cells, location: null, status: "planned", sownAt: null, sowDateEstimated: false, createdAt: now(), updatedAt: now() });
      result.added++;
    }
  }
  const leaving = existing.filter((p) => !keep.has(p.id));
  const hasHistory = (id: string) =>
    data.events.some((e) => e.plantingId === id) || data.notes.some((n) => n.plantingId === id) || data.photos.some((ph) => ph.plantingId === id) || data.tasks.some((t) => t.plantingId === id);
  for (const p of leaving) {
    if (hasHistory(p.id)) {
      updates.push({ ...p, trayId: null, cells: [], location: p.location ?? `Was in ${tray.name} ${cellRange(p.cells)}`, updatedAt: now() });
      result.detached++;
    } else {
      await deleteRecord(db, "plantings", p.id);
      result.removed++;
    }
  }

  await putRecords(db, "trays", [tray]);
  if (newSpecies.length) await putRecords(db, "species", newSpecies);
  await putRecords(db, "plantings", [...updates, ...creates]);
  return result;
}

export async function deleteTray(ctx: ActionCtx, trayId: string) {
  const tray = ctx.data.trays.find((t) => t.id === trayId);
  if (!tray) return;
  // An empty layout clears the planter the same careful way, then the planter goes.
  await applyTrayLayout(ctx, trayId, trayToMarkdown({ ...tray }, new Map()));
  await deleteRecord(ctx.db, "trays", trayId);
}

function blankSpecies(name: string): Species {
  const id = newId();
  return {
    id,
    slug: id,
    commonName: name,
    variety: null,
    scientificName: null,
    wikipediaTitle: name.replace(/ /g, "_"),
    category: "herb",
    lifecycle: null,
    source: null,
    seedsPerPacket: null,
    sowDepth: null,
    light: null,
    germDaysMin: null,
    germDaysMax: null,
    height: null,
    spread: null,
    spacing: null,
    soil: null,
    watering: null,
    waterEveryDays: 2,
    harvestDaysMin: null,
    harvestDaysMax: null,
    uses: null,
    packetText: null,
    tips: [],
    milestones: defaultMilestones({ harvestDaysMin: null, harvestDaysMax: null }),
    createdAt: now(),
  };
}
