// Every change to the garden goes through here, from the UI and the assistant alike.

import { defaultMilestones, type Condition, type EventType, type PlantingStatus } from "./model.ts";
import { deleteRecord, newId, putRecords, saveGarden, savePhoto, type GardenDB } from "./store.ts";
import { cellRange } from "./garden.ts";
import { formatCell, groupCells, parseCell, parseTrayMarkdown, trayToMarkdown, type CellSpec } from "./trayMarkdown.ts";
import { kindDef } from "./map/kinds.ts";
import type { MapEntity, Site } from "./map/model.ts";
import { siteTemplate } from "./map/template.ts";
import type { CareEvent, Garden, GardenData, Photo, Planting, RainDay, Species, Tray } from "./types.ts";

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
  input: {
    plantingIds: string[];
    type: EventType;
    date?: string;
    note?: string | null;
    condition?: Condition | null;
    /** Specific plants (1-based) within a planting that has a count; only meaningful with one planting. */
    plants?: number[] | null;
    byAssistant?: boolean;
  },
): Promise<number> {
  const plantings = ctx.data.plantings.filter((p) => input.plantingIds.includes(p.id));
  const date = input.date || ctx.today;
  const events: CareEvent[] = plantings.map((p) => ({
    id: newId(),
    plantingId: p.id,
    type: input.type,
    date,
    note: input.note || null,
    condition: input.type === "observed" ? (input.condition ?? "other") : null,
    plants: input.plants?.length ? input.plants.filter((n) => n >= 1 && (!p.count || n <= p.count)) : null,
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

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** How a species is written in a layout table: its name, plus the variety when two share a name. */
export function layoutName(s: Species, all: Species[]): string {
  const clash = all.some((o) => o.id !== s.id && norm(o.commonName) === norm(s.commonName));
  return clash && s.variety ? `${s.commonName} (${s.variety})` : s.commonName;
}

/** Finds the seed-library entry a layout cell means: by name and variety when given, else by name. */
function findSpecies(spec: CellSpec, all: Species[]): Species | undefined {
  if (spec.variety) {
    const exact = all.find((s) => norm(s.commonName) === norm(spec.name) && norm(s.variety) === norm(spec.variety));
    if (exact) return exact;
    // Older layouts wrote "Name (Variety)" only to tell apart plants sharing a name.
    return all.find((s) => norm(layoutName(s, all)) === norm(`${spec.name} (${spec.variety})`));
  }
  const n = norm(spec.name);
  return (
    all.find((s) => norm(layoutName(s, all)) === n) ??
    all.find((s) => norm(s.commonName) === n) ??
    all.find((s) => s.variety && [`${s.commonName} ${s.variety}`, `${s.commonName} — ${s.variety}`].some((v) => norm(v) === n))
  );
}

export function trayMarkdown(data: GardenData, trayId: string): string {
  const tray = data.trays.find((t) => t.id === trayId);
  if (!tray) throw new Error("Unknown planter");
  const species = new Map(data.species.map((s) => [s.id, s]));
  const rows = tray.layout === "rows";
  const names = new Map<string, string>();
  for (const p of data.plantings.filter((x) => x.trayId === trayId)) {
    const s = species.get(p.speciesId);
    if (!s) continue;
    const clash = layoutName(s, data.species) !== s.commonName;
    // Beds name the variety (it's how seed packets are bought for them); trays only when needed to tell plants apart.
    const label = { name: s.commonName, variety: rows || clash ? s.variety : null };
    p.cells.forEach((c, i) => names.set(c, formatCell({ ...label, count: i === 0 ? (p.count ?? null) : null })));
  }
  return trayToMarkdown(tray, names);
}

export type LayoutResult = {
  trayId: string;
  kept: number;
  moved: number;
  added: number;
  removed: number;
  detached: number;
  /** Plantings whose plant count changed. */
  recounted: number;
  newPlants: string[];
};

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
    layout: parsed.layout,
    size: existingTray?.size ?? null,
    position: existingTray?.position ?? data.trays.length,
    createdAt: existingTray?.createdAt ?? now(),
  };

  // Resolve plant names, adding unknown ones (or new varieties) to the seed library.
  const species = [...data.species];
  const newSpecies: Species[] = [];
  const groups = groupCells(parsed).map((g) => {
    let s = findSpecies(g, species);
    if (!s) {
      s = blankSpecies(g.name, g.variety);
      species.push(s);
      newSpecies.push(s);
    }
    return { speciesId: s.id, cells: g.cells, count: g.count };
  });

  const existing = data.plantings.filter((p) => p.trayId === tray.id);
  const sameCells = (a: string[], b: string[]) => a.length === b.length && a.every((c) => b.includes(c));
  const result: LayoutResult = {
    trayId: tray.id,
    kept: 0,
    moved: 0,
    added: 0,
    removed: 0,
    detached: 0,
    recounted: 0,
    newPlants: newSpecies.map((s) => (s.variety ? `${s.commonName} (${s.variety})` : s.commonName)),
  };
  const keep = new Set<string>();
  const updates: Planting[] = [];
  const recount = (p: Planting, count: number | null): Planting => {
    if ((p.count ?? null) === count) return p;
    result.recounted++;
    return { ...p, count, updatedAt: now() };
  };
  const pending = groups.filter((g) => {
    const match = existing.find((p) => !keep.has(p.id) && p.speciesId === g.speciesId && sameCells(p.cells, g.cells));
    if (match) {
      keep.add(match.id);
      result.kept++;
      const counted = recount(match, g.count);
      if (counted !== match) updates.push(counted);
    }
    return !match;
  });
  const creates: Planting[] = [];
  for (const g of pending) {
    const moved = existing.find((p) => !keep.has(p.id) && p.speciesId === g.speciesId && p.cells.some((c) => g.cells.includes(c)));
    if (moved) {
      keep.add(moved.id);
      updates.push({ ...recount(moved, g.count), cells: g.cells, updatedAt: now() });
      result.moved++;
    } else {
      creates.push({
        id: newId(),
        speciesId: g.speciesId,
        trayId: tray.id,
        cells: g.cells,
        location: null,
        status: "planned",
        sownAt: null,
        sowDateEstimated: false,
        count: g.count,
        createdAt: now(),
        updatedAt: now(),
      });
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

function blankSpecies(name: string, variety: string | null = null): Species {
  const id = newId();
  return {
    id,
    slug: id,
    commonName: name,
    variety,
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

// ---------- Garden map ----------

export async function setSite(ctx: ActionCtx, site: Site) {
  await saveGarden(ctx.db, { ...ctx.data.garden, site });
}

/** Starts the map from the template lot, if it's still empty. */
export async function applySiteTemplate(ctx: ActionCtx) {
  if (ctx.data.mapEntities.length) return;
  const t = siteTemplate(now(), newId);
  await saveGarden(ctx.db, { ...ctx.data.garden, site: ctx.data.garden.site ?? t.site });
  await putRecords(ctx.db, "mapEntities", t.entities);
}

/** Applies geometry that follows from a kind's settings (a house's height from its stories). */
function withDerived(e: MapEntity): MapEntity {
  const derive = kindDef(e.kind).derive;
  return derive ? { ...e, ...derive(e) } : e;
}

export async function addMapEntity(ctx: ActionCtx, kind: string, at: { x: number; y: number }, overrides: Partial<MapEntity> = {}): Promise<string> {
  const def = kindDef(kind).defaults;
  const e: MapEntity = {
    id: newId(),
    kind,
    name: def.name,
    w: def.w,
    d: def.d,
    h: def.h,
    z: def.z ?? 0,
    props: { ...(def.props ?? {}) },
    links: {},
    notes: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
    // Center the new thing on the requested point.
    x: overrides.x ?? Math.round((at.x - def.w / 2) * 2) / 2,
    y: overrides.y ?? Math.round((at.y - def.d / 2) * 2) / 2,
  };
  await putRecords(ctx.db, "mapEntities", [withDerived(e)]);
  return e.id;
}

export async function updateMapEntity(ctx: ActionCtx, id: string, patch: Partial<Omit<MapEntity, "id" | "createdAt">>) {
  const e = ctx.data.mapEntities.find((m) => m.id === id);
  if (!e) throw new Error("Unknown map item");
  // Linking a planter whose bed size is already known resizes the bed on the map to match (keeping its orientation).
  const linked = patch.links?.trayId && patch.links.trayId !== e.links.trayId ? ctx.data.trays.find((t) => t.id === patch.links!.trayId) : undefined;
  if (linked?.size && patch.w == null && patch.d == null) {
    const alongX = e.w >= e.d;
    patch = { ...patch, w: alongX ? linked.size.length : linked.size.width, d: alongX ? linked.size.width : linked.size.length };
  }
  await putRecords(ctx.db, "mapEntities", [
    withDerived({ ...e, ...patch, props: { ...e.props, ...(patch.props ?? {}) }, links: { ...e.links, ...(patch.links ?? {}) }, updatedAt: now() }),
  ]);
}

export async function deleteMapEntity(ctx: ActionCtx, id: string) {
  await deleteRecord(ctx.db, "mapEntities", id);
  // Things linked to it (netting over a bed, a gantry) stay but lose the link.
  const linked = ctx.data.mapEntities.filter((m) => m.links.entityId === id);
  await putRecords(ctx.db, "mapEntities", linked.map((m) => ({ ...m, links: { ...m.links, entityId: null }, updatedAt: now() })));
}

/** Gives a bed on the map its own planter (rows along its long side) and links them. */
export async function createPlanterForEntity(ctx: ActionCtx, entityId: string, rows = 4): Promise<string> {
  const e = ctx.data.mapEntities.find((m) => m.id === entityId);
  if (!e) throw new Error("Unknown map item");
  const letters = Array.from({ length: rows }, (_, i) => String.fromCharCode(65 + i));
  const long = Math.max(e.w, e.d);
  const md = [
    `# ${e.name}`,
    "",
    `${kindDef(e.kind).label}, ${Math.max(e.w, e.d)} × ${Math.min(e.w, e.d)} ft, rows along the ${long} ft side`,
    "",
    "|   | 1 |",
    "|---|---|",
    ...letters.map((r) => `| ${r} |   |`),
    "",
  ].join("\n");
  const r = await applyTrayLayout(ctx, null, md);
  // applyTrayLayout makes a 1-column table a row bed.
  await putRecords(ctx.db, "mapEntities", [{ ...e, links: { ...e.links, trayId: r.trayId }, updatedAt: now() }]);
  return r.trayId;
}

/** Sets a bed's size. A bed on the map keeps its size there (so the map stays right); otherwise it's kept on the planter. */
export async function setBedSize(ctx: ActionCtx, trayId: string, size: { length: number; width: number }) {
  const tray = ctx.data.trays.find((t) => t.id === trayId);
  if (!tray) throw new Error("Unknown planter");
  const length = Math.max(size.length, size.width);
  const width = Math.min(size.length, size.width);
  const e = ctx.data.mapEntities.find((m) => m.links.trayId === trayId);
  if (e) {
    const alongX = e.w >= e.d;
    await putRecords(ctx.db, "mapEntities", [{ ...e, w: alongX ? length : width, d: alongX ? width : length, updatedAt: now() }]);
  } else {
    await putRecords(ctx.db, "trays", [{ ...tray, size: { length, width } }]);
  }
}

/**
 * Beds laid out before the app knew the "Radish x 24" shorthand saved the whole
 * cell as a plant's name. Split those back into the plant and its count, merge
 * with an existing plant of that name, and mark their planters as beds of rows.
 * Safe to run on every load: it only touches names that still end in "x N".
 */
export async function migrateCountedNames(ctx: ActionCtx): Promise<number> {
  const { data, db } = ctx;
  const species = [...data.species];
  const plantings = new Map(data.plantings.map((p) => [p.id, p]));
  const photos = new Map(data.photos.map((p) => [p.id, p]));
  const changedPlantings = new Set<string>();
  const changedPhotos = new Set<string>();
  const changedSpecies: Species[] = [];
  const removed: string[] = [];
  for (const s of data.species) {
    const spec = parseCell(s.commonName);
    if (spec.count == null || !spec.name) continue;
    const variety = spec.variety ?? s.variety;
    const target = species.find((o) => o.id !== s.id && !removed.includes(o.id) && norm(o.commonName) === norm(spec.name) && norm(o.variety) === norm(variety));
    for (const p of plantings.values()) {
      if (p.speciesId !== s.id) continue;
      plantings.set(p.id, { ...p, speciesId: target?.id ?? s.id, count: p.count ?? spec.count, updatedAt: now() });
      changedPlantings.add(p.id);
    }
    if (target) {
      for (const ph of photos.values()) {
        if (ph.speciesId !== s.id) continue;
        photos.set(ph.id, { ...ph, speciesId: target.id });
        changedPhotos.add(ph.id);
      }
      removed.push(s.id);
    } else {
      const renamed: Species = {
        ...s,
        commonName: spec.name,
        variety,
        wikipediaTitle: !s.wikipediaTitle || s.wikipediaTitle === s.commonName.replace(/ /g, "_") ? spec.name.replace(/ /g, "_") : s.wikipediaTitle,
      };
      species[species.findIndex((o) => o.id === s.id)] = renamed;
      changedSpecies.push(renamed);
    }
  }
  if (!changedPlantings.size && !changedSpecies.length && !removed.length) return 0;
  const counted = new Set([...plantings.values()].filter((p) => p.count && p.trayId).map((p) => p.trayId!));
  const trays = data.trays.filter((t) => counted.has(t.id) && t.layout !== "rows").map((t) => ({ ...t, layout: "rows" as const }));
  await putRecords(db, "species", changedSpecies);
  await putRecords(db, "plantings", [...changedPlantings].map((id) => plantings.get(id)!));
  await putRecords(db, "photos", [...changedPhotos].map((id) => photos.get(id)!));
  await putRecords(db, "trays", trays);
  for (const id of removed) await deleteRecord(db, "species", id);
  return changedPlantings.size + changedSpecies.length + removed.length;
}

// ---------- Rain ----------

/** Saves rain records (from the weather service, or the garden's gauge). */
export async function recordRain(ctx: ActionCtx, days: RainDay[]) {
  if (days.length) await putRecords(ctx.db, "rain", days);
}

/** A reading from the garden's own rain gauge, which always wins; null clears it so the weather service fills the day in again. */
export async function setGaugeRain(ctx: ActionCtx, date: string, inches: number | null) {
  if (inches == null) return deleteRecord(ctx.db, "rain", date);
  await putRecords(ctx.db, "rain", [{ id: date, date, inches: Math.max(0, Math.round(inches * 100) / 100), source: "gauge", by: ctx.by, updatedAt: now() }]);
}
