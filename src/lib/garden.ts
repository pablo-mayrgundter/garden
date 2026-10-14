import { db } from "./db";
import { careSchedule, sortCare, type CareItem } from "./schedule";
import type { EventType, Milestone, PlantingStatus } from "./seed-data";

export type Species = {
  id: number;
  slug: string;
  commonName: string;
  variety: string | null;
  scientificName: string | null;
  wikipediaTitle: string | null;
  category: string;
  lifecycle: string | null;
  source: string | null;
  seedsPerPacket: string | null;
  sowDepth: string | null;
  light: string | null;
  germDaysMin: number | null;
  germDaysMax: number | null;
  height: string | null;
  spread: string | null;
  spacing: string | null;
  soil: string | null;
  watering: string | null;
  waterEveryDays: number;
  harvestDaysMin: number | null;
  harvestDaysMax: number | null;
  uses: string | null;
  packetText: string | null;
  tips: string[];
  milestones: Milestone[];
};

export type Tray = { id: number; name: string; kind: string | null; rows: string[]; cols: number; notes: string | null };

export type Planting = {
  id: number;
  speciesId: number;
  trayId: number | null;
  trayName: string | null;
  cells: string[];
  location: string | null;
  status: PlantingStatus;
  sownAt: string | null;
  sowDateEstimated: boolean;
  name: string;
  variety: string | null;
};

export type CareEvent = {
  id: number;
  plantingId: number;
  type: EventType;
  date: string;
  note: string | null;
  userName: string | null;
  byAssistant: boolean;
};

export type Note = {
  id: number;
  plantingId: number | null;
  body: string;
  userName: string | null;
  byAssistant: boolean;
  createdAt: string;
};

export type Photo = {
  id: number;
  plantingId: number | null;
  speciesId: number | null;
  trayId: number | null;
  kind: string;
  caption: string | null;
  takenAt: string;
  userName: string | null;
};

export type Task = {
  id: number;
  plantingId: number | null;
  title: string;
  dueDate: string;
  doneAt: string | null;
  byAssistant: boolean;
};

const SPECIES_COLS = `id, slug, common_name AS commonName, variety, scientific_name AS scientificName,
  wikipedia_title AS wikipediaTitle, category, lifecycle, source, seeds_per_packet AS seedsPerPacket,
  sow_depth AS sowDepth, light, germ_days_min AS germDaysMin, germ_days_max AS germDaysMax, height, spread,
  spacing, soil, watering, water_every_days AS waterEveryDays, harvest_days_min AS harvestDaysMin,
  harvest_days_max AS harvestDaysMax, uses, packet_text AS packetText, tips, milestones`;

type SpeciesRow = Omit<Species, "tips" | "milestones"> & { tips: string; milestones: string };
const parseSpecies = (r: SpeciesRow): Species => ({ ...r, tips: JSON.parse(r.tips), milestones: JSON.parse(r.milestones) });

export function listSpecies(gardenId: number): Species[] {
  const rows = db()
    .prepare(`SELECT ${SPECIES_COLS} FROM species WHERE garden_id = ? ORDER BY category, common_name`)
    .all(gardenId) as SpeciesRow[];
  return rows.map(parseSpecies);
}

export function getSpecies(gardenId: number, id: number): Species | null {
  const row = db().prepare(`SELECT ${SPECIES_COLS} FROM species WHERE garden_id = ? AND id = ?`).get(gardenId, id) as
    | SpeciesRow
    | undefined;
  return row ? parseSpecies(row) : null;
}

type TrayRow = Omit<Tray, "rows"> & { rows: string };
const parseTray = (r: TrayRow): Tray => ({ ...r, rows: JSON.parse(r.rows) });

export function listTrays(gardenId: number): Tray[] {
  const rows = db()
    .prepare("SELECT id, name, kind, rows, cols, notes FROM trays WHERE garden_id = ? ORDER BY position, id")
    .all(gardenId) as TrayRow[];
  return rows.map(parseTray);
}

export function getTray(gardenId: number, id: number): Tray | null {
  const row = db().prepare("SELECT id, name, kind, rows, cols, notes FROM trays WHERE garden_id = ? AND id = ?").get(gardenId, id) as
    | TrayRow
    | undefined;
  return row ? parseTray(row) : null;
}

const PLANTING_SELECT = `SELECT p.id, p.species_id AS speciesId, p.tray_id AS trayId, t.name AS trayName, p.cells,
  p.location, p.status, p.sown_at AS sownAt, p.sow_date_estimated AS sowDateEstimated,
  s.common_name AS name, s.variety
  FROM plantings p JOIN species s ON s.id = p.species_id LEFT JOIN trays t ON t.id = p.tray_id`;

type PlantingRow = Omit<Planting, "cells" | "sowDateEstimated"> & { cells: string; sowDateEstimated: number };
const parsePlanting = (r: PlantingRow): Planting => ({ ...r, cells: JSON.parse(r.cells), sowDateEstimated: !!r.sowDateEstimated });

export function listPlantings(gardenId: number, opts: { trayId?: number; speciesId?: number } = {}): Planting[] {
  const where = ["p.garden_id = @gardenId"];
  if (opts.trayId) where.push("p.tray_id = @trayId");
  if (opts.speciesId) where.push("p.species_id = @speciesId");
  const rows = db()
    .prepare(`${PLANTING_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.position, p.tray_id, p.id`)
    .all({ gardenId, trayId: opts.trayId ?? null, speciesId: opts.speciesId ?? null }) as PlantingRow[];
  return rows.map(parsePlanting);
}

export function getPlanting(gardenId: number, id: number): Planting | null {
  const row = db().prepare(`${PLANTING_SELECT} WHERE p.garden_id = ? AND p.id = ?`).get(gardenId, id) as PlantingRow | undefined;
  return row ? parsePlanting(row) : null;
}

export function plantingLabel(p: Pick<Planting, "name" | "trayName" | "cells" | "location">): string {
  const where = p.trayName ? `${p.trayName} ${cellRange(p.cells)}` : p.location;
  return where ? `${p.name} · ${where}` : p.name;
}

export function cellRange(cells: string[]): string {
  if (cells.length <= 1) return cells[0] ?? "";
  const row = cells[0].replace(/^\d+/, "");
  if (cells.every((c) => c.endsWith(row))) {
    const nums = cells.map((c) => parseInt(c, 10)).sort((a, b) => a - b);
    return `${nums[0]}–${nums.at(-1)}${row}`;
  }
  return cells.join(", ");
}

export function listEvents(gardenId: number, plantingIds?: number[]): CareEvent[] {
  const filter = plantingIds ? `AND e.planting_id IN (${plantingIds.map(() => "?").join(",") || "NULL"})` : "";
  const rows = db()
    .prepare(
      `SELECT e.id, e.planting_id AS plantingId, e.type, e.date, e.note, u.name AS userName, e.by_assistant AS byAssistant
       FROM events e JOIN plantings p ON p.id = e.planting_id LEFT JOIN users u ON u.id = e.user_id
       WHERE p.garden_id = ? ${filter} ORDER BY e.date DESC, e.id DESC`,
    )
    .all(gardenId, ...(plantingIds ?? [])) as (Omit<CareEvent, "byAssistant"> & { byAssistant: number })[];
  return rows.map((r) => ({ ...r, byAssistant: !!r.byAssistant }));
}

export function listNotes(gardenId: number, opts: { plantingId?: number; limit?: number } = {}): Note[] {
  const rows = db()
    .prepare(
      `SELECT n.id, n.planting_id AS plantingId, n.body, u.name AS userName, n.by_assistant AS byAssistant, n.created_at AS createdAt
       FROM notes n LEFT JOIN users u ON u.id = n.user_id
       WHERE n.garden_id = @gardenId AND (@plantingId IS NULL OR n.planting_id = @plantingId)
       ORDER BY n.created_at DESC, n.id DESC LIMIT @limit`,
    )
    .all({ gardenId, plantingId: opts.plantingId ?? null, limit: opts.limit ?? 200 }) as (Omit<Note, "byAssistant"> & {
    byAssistant: number;
  })[];
  return rows.map((r) => ({ ...r, byAssistant: !!r.byAssistant }));
}

export function listPhotos(
  gardenId: number,
  opts: { plantingId?: number; speciesId?: number; trayId?: number; kind?: string; limit?: number } = {},
): Photo[] {
  return db()
    .prepare(
      `SELECT ph.id, ph.planting_id AS plantingId, ph.species_id AS speciesId, ph.tray_id AS trayId, ph.kind, ph.caption,
         ph.taken_at AS takenAt, u.name AS userName
       FROM photos ph LEFT JOIN users u ON u.id = ph.user_id
       WHERE ph.garden_id = @gardenId
         AND (@plantingId IS NULL OR ph.planting_id = @plantingId)
         AND (@speciesId IS NULL OR ph.species_id = @speciesId)
         AND (@trayId IS NULL OR ph.tray_id = @trayId)
         AND (@kind IS NULL OR ph.kind = @kind)
       ORDER BY ph.taken_at DESC, ph.id DESC LIMIT @limit`,
    )
    .all({
      gardenId,
      plantingId: opts.plantingId ?? null,
      speciesId: opts.speciesId ?? null,
      trayId: opts.trayId ?? null,
      kind: opts.kind ?? null,
      limit: opts.limit ?? 500,
    }) as Photo[];
}

/** Latest progress photo per planting, falling back to the species' packet front. */
export function coverPhotos(gardenId: number): { byPlanting: Map<number, number>; bySpecies: Map<number, number> } {
  const byPlanting = new Map<number, number>();
  const bySpecies = new Map<number, number>();
  for (const ph of listPhotos(gardenId)) {
    if (ph.plantingId && ph.kind === "progress" && !byPlanting.has(ph.plantingId)) byPlanting.set(ph.plantingId, ph.id);
    if (ph.speciesId && ph.kind === "packet_front" && !bySpecies.has(ph.speciesId)) bySpecies.set(ph.speciesId, ph.id);
  }
  return { byPlanting, bySpecies };
}

export function listTasks(gardenId: number, opts: { plantingId?: number; includeDone?: boolean } = {}): Task[] {
  const rows = db()
    .prepare(
      `SELECT id, planting_id AS plantingId, title, due_date AS dueDate, done_at AS doneAt, by_assistant AS byAssistant
       FROM tasks WHERE garden_id = @gardenId AND (@plantingId IS NULL OR planting_id = @plantingId)
         AND (@includeDone = 1 OR done_at IS NULL)
       ORDER BY done_at IS NOT NULL, due_date, id`,
    )
    .all({ gardenId, plantingId: opts.plantingId ?? null, includeDone: opts.includeDone ? 1 : 0 }) as (Omit<
    Task,
    "byAssistant"
  > & { byAssistant: number })[];
  return rows.map((r) => ({ ...r, byAssistant: !!r.byAssistant }));
}

export type PlantingWithCare = Planting & { care: CareItem[]; species: Species };

/** Every planting with its computed care schedule. */
export function plantingsWithCare(gardenId: number, today: string, opts: { trayId?: number } = {}): PlantingWithCare[] {
  const plantings = listPlantings(gardenId, opts);
  const species = new Map(listSpecies(gardenId).map((s) => [s.id, s]));
  const events = listEvents(gardenId, plantings.map((p) => p.id));
  return plantings.map((p) => {
    const s = species.get(p.speciesId)!;
    const care = careSchedule(
      {
        status: p.status,
        sownAt: p.sownAt,
        germDaysMin: s.germDaysMin,
        germDaysMax: s.germDaysMax,
        waterEveryDays: s.waterEveryDays,
        milestones: s.milestones,
        events: events.filter((e) => e.plantingId === p.id),
      },
      today,
    );
    return { ...p, species: s, care: sortCare(care) };
  });
}

// ---- Mutations (all scoped by garden) ----

export function addEvents(
  gardenId: number,
  input: { plantingIds: number[]; type: EventType; date: string; note?: string | null; userId: number | null; byAssistant?: boolean },
): number {
  const owned = new Set(listPlantings(gardenId).map((p) => p.id));
  const ids = input.plantingIds.filter((id) => owned.has(id));
  const stmt = db().prepare("INSERT INTO events (planting_id, user_id, type, date, note, by_assistant) VALUES (?, ?, ?, ?, ?, ?)");
  db().transaction(() => {
    for (const id of ids) {
      stmt.run(id, input.userId, input.type, input.date, input.note || null, input.byAssistant ? 1 : 0);
      advanceStatus(gardenId, id, input.type);
    }
  })();
  return ids.length;
}

/** Logging certain events implies the planting moved on to a new stage. */
function advanceStatus(gardenId: number, plantingId: number, type: EventType): void {
  const next: Partial<Record<EventType, { to: PlantingStatus; from: PlantingStatus[] }>> = {
    sprouted: { to: "sprouted", from: ["planned", "sown"] },
    transplanted: { to: "transplanted", from: ["sown", "sprouted", "growing"] },
    potted_up: { to: "growing", from: ["sown", "sprouted"] },
    harvested: { to: "harvesting", from: ["sprouted", "growing", "transplanted"] },
  };
  const rule = next[type];
  if (!rule) return;
  db()
    .prepare(
      `UPDATE plantings SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND garden_id = ? AND status IN (${rule.from.map(() => "?").join(",")})`,
    )
    .run(rule.to, plantingId, gardenId, ...rule.from);
}

export function deleteEvent(gardenId: number, eventId: number): void {
  db()
    .prepare("DELETE FROM events WHERE id = ? AND planting_id IN (SELECT id FROM plantings WHERE garden_id = ?)")
    .run(eventId, gardenId);
}

export function addNote(
  gardenId: number,
  input: { plantingId: number | null; body: string; userId: number | null; byAssistant?: boolean },
): number {
  if (input.plantingId && !getPlanting(gardenId, input.plantingId)) throw new Error("Unknown planting");
  return Number(
    db()
      .prepare("INSERT INTO notes (garden_id, planting_id, user_id, body, by_assistant) VALUES (?, ?, ?, ?, ?)")
      .run(gardenId, input.plantingId, input.userId, input.body, input.byAssistant ? 1 : 0).lastInsertRowid,
  );
}

export function deleteNote(gardenId: number, noteId: number): void {
  db().prepare("DELETE FROM notes WHERE id = ? AND garden_id = ?").run(noteId, gardenId);
}

export function addTask(
  gardenId: number,
  input: { plantingId: number | null; title: string; dueDate: string; userId: number | null; byAssistant?: boolean },
): number {
  if (input.plantingId && !getPlanting(gardenId, input.plantingId)) throw new Error("Unknown planting");
  return Number(
    db()
      .prepare("INSERT INTO tasks (garden_id, planting_id, title, due_date, created_by, by_assistant) VALUES (?, ?, ?, ?, ?, ?)")
      .run(gardenId, input.plantingId, input.title, input.dueDate, input.userId, input.byAssistant ? 1 : 0).lastInsertRowid,
  );
}

export function setTaskDone(gardenId: number, taskId: number, done: boolean): void {
  db()
    .prepare("UPDATE tasks SET done_at = ? WHERE id = ? AND garden_id = ?")
    .run(done ? new Date().toISOString() : null, taskId, gardenId);
}

export function updatePlanting(
  gardenId: number,
  id: number,
  patch: { status?: PlantingStatus; sownAt?: string | null; sowDateEstimated?: boolean; location?: string | null },
): void {
  const current = getPlanting(gardenId, id);
  if (!current) throw new Error("Unknown planting");
  db()
    .prepare(
      `UPDATE plantings SET status = ?, sown_at = ?, sow_date_estimated = ?, location = ?, updated_at = datetime('now')
       WHERE id = ? AND garden_id = ?`,
    )
    .run(
      patch.status ?? current.status,
      patch.sownAt !== undefined ? patch.sownAt : current.sownAt,
      (patch.sowDateEstimated ?? current.sowDateEstimated) ? 1 : 0,
      patch.location !== undefined ? patch.location : current.location,
      id,
      gardenId,
    );
}

export function createPlanting(
  gardenId: number,
  input: { speciesId: number; trayId: number | null; cells: string[]; sownAt: string | null; location?: string | null },
): number {
  if (!getSpecies(gardenId, input.speciesId)) throw new Error("Unknown plant");
  if (input.trayId && !getTray(gardenId, input.trayId)) throw new Error("Unknown tray");
  return Number(
    db()
      .prepare(
        "INSERT INTO plantings (garden_id, species_id, tray_id, cells, status, sown_at, location) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        gardenId,
        input.speciesId,
        input.trayId,
        JSON.stringify(input.cells),
        input.sownAt ? "sown" : "planned",
        input.sownAt,
        input.location ?? null,
      ).lastInsertRowid,
  );
}

export function deletePlanting(gardenId: number, id: number): void {
  db().prepare("DELETE FROM plantings WHERE id = ? AND garden_id = ?").run(id, gardenId);
}
