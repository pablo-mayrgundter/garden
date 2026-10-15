// Every change to the garden goes through here, from the UI and the assistant alike.

import type { EventType, PlantingStatus } from "./seed-data.ts";
import { deleteRecord, newId, putRecords, saveGarden, savePhoto, type GardenDB } from "./store.ts";
import type { CareEvent, Garden, GardenData, Photo, Planting, Species } from "./types.ts";

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

/** A generic seedling plan for plants added by hand; edit the packet info to tune it. */
function defaultMilestones(s: Pick<Species, "harvestDaysMin" | "harvestDaysMax">): Species["milestones"] {
  const m: Species["milestones"] = [
    { key: "thin", title: "Thin to the strongest seedling(s)", from: "sprouted", dayMin: 7, dayMax: 14, event: "thinned" },
    { key: "feed", title: "First light feeding (half-strength)", from: "sprouted", dayMin: 14, dayMax: 21, event: "fertilized" },
    { key: "transplant", title: "Pot up or transplant", from: "sown", dayMin: 35, dayMax: 56, event: "transplanted" },
  ];
  if (s.harvestDaysMin != null)
    m.push({ key: "harvest", title: "Start harvesting", from: "sown", dayMin: s.harvestDaysMin, dayMax: s.harvestDaysMax ?? s.harvestDaysMin + 21, event: "harvested" });
  return m;
}

export const updateGarden = (ctx: ActionCtx, patch: Partial<Omit<Garden, "id">>) => saveGarden(ctx.db, { ...ctx.data.garden, ...patch });
