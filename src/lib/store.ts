// Local-first storage: everything lives in the browser's IndexedDB. A remote
// backup/sync backend can be added later behind the same functions; until then,
// exportBackup/importBackup move a garden between devices as a file.

import { openDB, type IDBPDatabase } from "idb";
import { ESTIMATED_SOW_DATE, PHOTO_DATE, PLANTINGS, SPECIES, TRAYS } from "./seed-data.ts";
import type { CareEvent, ChatRecord, Garden, GardenData, Note, Photo, Planting, Species, Task, Tray } from "./types.ts";

export type GardenDB = IDBPDatabase;

const DB_VERSION = 1;
export const RECORD_STORES = ["species", "trays", "plantings", "events", "notes", "photos", "tasks"] as const;
export type RecordStore = (typeof RECORD_STORES)[number];
type StoreRecord = { species: Species; trays: Tray; plantings: Planting; events: CareEvent; notes: Note; photos: Photo; tasks: Task };

export function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join("");
}

const now = () => new Date().toISOString();

export async function openGardenDb(name = "garden"): Promise<GardenDB> {
  const db = await openDB(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore("meta");
      for (const s of RECORD_STORES) db.createObjectStore(s, { keyPath: "id" });
      db.createObjectStore("photoBlobs");
      const chat = db.createObjectStore("chat", { keyPath: "seq", autoIncrement: true });
      chat.createIndex("threadId", "threadId");
    },
  });
  if (!(await db.get("meta", "garden"))) await seedGarden(db);
  return db;
}

export async function loadAll(db: GardenDB): Promise<GardenData> {
  const tx = db.transaction(["meta", ...RECORD_STORES], "readonly");
  const [garden, species, trays, plantings, events, notes, photos, tasks] = await Promise.all([
    tx.objectStore("meta").get("garden"),
    ...RECORD_STORES.map((s) => tx.objectStore(s).getAll()),
  ]);
  return { garden, species, trays, plantings, events, notes, photos, tasks } as GardenData;
}

export async function putRecords<S extends RecordStore>(db: GardenDB, store: S, records: StoreRecord[S][]): Promise<void> {
  const tx = db.transaction(store, "readwrite");
  await Promise.all([...records.map((r) => tx.store.put(r)), tx.done]);
}

export async function deleteRecord(db: GardenDB, store: RecordStore, id: string): Promise<void> {
  await db.delete(store, id);
  if (store === "photos") await db.delete("photoBlobs", id);
}

export async function saveGarden(db: GardenDB, garden: Garden): Promise<void> {
  await db.put("meta", garden, "garden");
}

export async function savePhoto(db: GardenDB, photo: Photo, blob: Blob): Promise<void> {
  const tx = db.transaction(["photos", "photoBlobs"], "readwrite");
  await Promise.all([tx.objectStore("photos").put(photo), tx.objectStore("photoBlobs").put(blob, photo.id), tx.done]);
}

export async function getPhotoBlob(db: GardenDB, id: string): Promise<Blob | undefined> {
  return db.get("photoBlobs", id);
}

// ---------- Seed: the garden from our handwritten plan and seed packets ----------

export async function seedGarden(db: GardenDB): Promise<void> {
  const created = now();
  const garden: Garden = {
    id: "garden",
    name: "Herb Garden",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    gardeners: [],
    createdAt: created,
  };
  const photos: Photo[] = [];
  const photo = (file: string, p: Partial<Photo> & Pick<Photo, "kind" | "caption">) =>
    photos.push({
      id: `photo-${file}`,
      plantingId: null,
      speciesId: null,
      trayId: null,
      takenAt: PHOTO_DATE,
      mime: "image/webp",
      src: `seed/${file}.webp`,
      by: null,
      createdAt: created,
      ...p,
    });

  const species = SPECIES.map(({ hasPacketImages, ...s }) => {
    if (hasPacketImages) {
      photo(`${s.slug}-front`, { speciesId: s.slug, kind: "packet_front", caption: "Seed packet (front)" });
      photo(`${s.slug}-back`, { speciesId: s.slug, kind: "packet_back", caption: "Seed packet (back)" });
    }
    return { ...s, id: s.slug, createdAt: created };
  });

  const trays = TRAYS.map((t, i) => {
    if (t.photo) photo(t.photo, { trayId: t.key, kind: "tray", caption: `${t.name}, ${PHOTO_DATE}` });
    return { id: t.key, name: t.name, kind: t.kind, rows: t.rows, cols: t.cols, notes: t.notes, position: i, createdAt: created };
  });

  const plantings = [];
  const events = [];
  const notes = [];
  for (const p of PLANTINGS) {
    const id = `${p.tray}-${p.cells.join("-")}`;
    const sown = p.status !== "planned";
    plantings.push({
      id,
      speciesId: p.species,
      trayId: p.tray,
      cells: p.cells,
      location: null,
      status: p.status,
      sownAt: sown ? ESTIMATED_SOW_DATE : null,
      sowDateEstimated: sown,
      createdAt: created,
      updatedAt: created,
    });
    if (p.sprouted)
      events.push({ id: `${id}-sprouted`, plantingId: id, type: "sprouted", date: PHOTO_DATE, note: "Seen in the tray photo", by: null, byAssistant: false, createdAt: created });
    if (p.note) notes.push({ id: `${id}-note`, plantingId: id, body: p.note, by: null, byAssistant: false, createdAt: `${PHOTO_DATE}T12:00:00.000Z` });
    if (p.photo) photo(p.photo, { plantingId: id, kind: "progress", caption: `Cell ${p.cells.join("–")}, ${PHOTO_DATE}` });
  }

  const tx = db.transaction(["meta", ...RECORD_STORES], "readwrite");
  const put = (store: string, records: object[]) => records.map((r) => tx.objectStore(store).put(r));
  await Promise.all([
    tx.objectStore("meta").put(garden, "garden"),
    ...put("species", species),
    ...put("trays", trays),
    ...put("plantings", plantings),
    ...put("events", events),
    ...put("notes", notes),
    ...put("photos", photos),
    tx.done,
  ]);
}

// ---------- Backup file ----------

export type Backup = {
  app: "herb-garden";
  version: 1;
  exportedAt: string;
  data: GardenData;
  /** Uploaded photo bytes, as data: URLs keyed by photo id. */
  photoBlobs: Record<string, string>;
};

function base64(buf: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("base64");
  let s = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return base64(await blob.arrayBuffer());
}

export async function exportBackup(db: GardenDB): Promise<Backup> {
  const data = await loadAll(db);
  const photoBlobs: Record<string, string> = {};
  for (const p of data.photos) {
    if (p.src) continue;
    const blob = await getPhotoBlob(db, p.id);
    if (blob) photoBlobs[p.id] = `data:${blob.type || p.mime};base64,${await blobToBase64(blob)}`;
  }
  return { app: "herb-garden", version: 1, exportedAt: now(), data, photoBlobs };
}

function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Replaces everything in this browser with the backup's contents (chats are kept). */
export async function importBackup(db: GardenDB, backup: Backup): Promise<void> {
  if (backup?.app !== "herb-garden" || backup.version !== 1 || !backup.data?.garden) throw new Error("That file isn't a Herb Garden backup.");
  const tx = db.transaction(["meta", "photoBlobs", ...RECORD_STORES], "readwrite");
  await Promise.all([...RECORD_STORES.map((s) => tx.objectStore(s).clear()), tx.objectStore("photoBlobs").clear()]);
  const { garden, ...records } = backup.data;
  await tx.objectStore("meta").put(garden, "garden");
  for (const s of RECORD_STORES) for (const r of records[s]) await tx.objectStore(s).put(r);
  for (const [id, url] of Object.entries(backup.photoBlobs)) await tx.objectStore("photoBlobs").put(dataUrlToBlob(url), id);
  await tx.done;
}

// ---------- Assistant conversations ----------

export async function currentThreadId(db: GardenDB): Promise<string> {
  const id = (await db.get("meta", "chatThread")) as string | undefined;
  if (id) return id;
  return newThread(db);
}

export async function newThread(db: GardenDB): Promise<string> {
  const id = newId();
  await db.put("meta", id, "chatThread");
  return id;
}

export async function loadChat(db: GardenDB, threadId: string): Promise<ChatRecord[]> {
  const rows = (await db.getAllFromIndex("chat", "threadId", threadId)) as ChatRecord[];
  return rows.sort((a, b) => a.seq! - b.seq!);
}

export async function appendChat(db: GardenDB, record: ChatRecord): Promise<void> {
  await db.add("chat", record);
}
