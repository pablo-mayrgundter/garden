import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { openDB } from "idb";
import { applyTrayLayout, logCare, trayMarkdown, type ActionCtx } from "../src/lib/actions.ts";
import { plantStates } from "../src/lib/garden.ts";
import { createGarden, loadAll, openGardenDb, type GardenDB } from "../src/lib/store.ts";
import type { GardenData } from "../src/lib/types.ts";

const TODAY = "2026-10-17";
let n = 0;
const fresh = () => openGardenDb(`beds-${n++}`);
const load = async (db: GardenDB): Promise<GardenData> => (await loadAll(db))!;
const ctxFor = async (db: GardenDB): Promise<ActionCtx> => ({ db, data: await load(db), by: "Pablo", today: TODAY });

const BED = `# Bed 1

Raised bed

|   | 1 |
|---|---|
| A | Beet (Detroit Golden) x 18 |
| B | Beet (Chioggia) x 12 |
| C | Carrot x 24 |
`;

async function gardenWithBed() {
  const db = await fresh();
  await createGarden(db, { name: "Test garden", timezone: "UTC", gardener: "Pablo" });
  const r = await applyTrayLayout(await ctxFor(db), null, BED);
  return { db, trayId: r.trayId, result: r };
}

test("a bed of rows makes counted plantings, one plant per variety", async () => {
  const { db, result } = await gardenWithBed();
  const data = await load(db);
  assert.equal(data.trays[0].layout, "rows");
  assert.equal(result.added, 3);
  assert.deepEqual(result.newPlants.sort(), ["Beet (Chioggia)", "Beet (Detroit Golden)", "Carrot"]);
  const beets = data.species.filter((s) => s.commonName === "Beet").map((s) => s.variety).sort();
  assert.deepEqual(beets, ["Chioggia", "Detroit Golden"]);
  const golden = data.plantings.find((p) => data.species.find((s) => s.id === p.speciesId)?.variety === "Detroit Golden")!;
  assert.equal(golden.count, 18);
  assert.deepEqual(golden.cells, ["1A"]);
});

test("the bed writes back in the shorthand, and recounts in place", async () => {
  const { db, trayId } = await gardenWithBed();
  const md = trayMarkdown(await load(db), trayId);
  assert.match(md, /Beet \(Detroit Golden\) x 18/);
  assert.match(md, /Carrot x 24/);
  const before = (await load(db)).plantings.map((p) => p.id).sort();
  const r = await applyTrayLayout(await ctxFor(db), trayId, md.replace("Carrot x 24", "Carrot x 20"));
  const data = await load(db);
  assert.equal(r.recounted, 1);
  assert.equal(r.added, 0);
  assert.deepEqual(data.plantings.map((p) => p.id).sort(), before);
  assert.equal(data.plantings.find((p) => p.count === 20) != null, true);
});

test("plant checks: latest observation per plant, whole-row checks cover every plant", async () => {
  const { db } = await gardenWithBed();
  const carrot = (await load(db)).plantings.find((p) => p.count === 24)!;
  await logCare(await ctxFor(db), { plantingIds: [carrot.id], type: "observed", date: "2026-10-01", condition: "healthy" });
  await logCare(await ctxFor(db), { plantingIds: [carrot.id], type: "observed", date: "2026-10-05", condition: "pests", plants: [3, 4, 99], note: "aphids" });
  const data = await load(db);
  const ev = data.events.find((e) => e.condition === "pests")!;
  assert.deepEqual(ev.plants, [3, 4], "out-of-range plant numbers are dropped");
  const states = plantStates(data, carrot.id, 24);
  assert.equal(states[0]?.condition, "healthy");
  assert.equal(states[2]?.condition, "pests");
  assert.equal(states[3]?.note, "aphids");
  assert.equal(states.filter((s) => s?.condition === "pests").length, 2);
});

test("a version 1 database upgrades with its data intact", async () => {
  const name = `v1-${n++}`;
  const old = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore("meta");
      for (const s of ["species", "trays", "plantings", "events", "notes", "photos", "tasks"]) db.createObjectStore(s, { keyPath: "id" });
      db.createObjectStore("photoBlobs");
      db.createObjectStore("chat", { keyPath: "seq", autoIncrement: true }).createIndex("threadId", "threadId");
    },
  });
  await old.put("meta", { id: "garden", name: "Old garden", timezone: "UTC", gardeners: ["Sam"], createdAt: "2026-01-01" }, "garden");
  await old.put("trays", { id: "t1", name: "Seed tray", kind: null, notes: null, rows: ["A"], cols: 2, position: 0, createdAt: "2026-01-01" });
  old.close();
  const db = await openGardenDb(name);
  const data = await load(db);
  assert.equal(data.garden.name, "Old garden");
  assert.equal(data.trays[0].name, "Seed tray");
  assert.deepEqual(data.mapEntities, []);
});

test("an upgrade waits for, and reports, a tab still holding the old version", async () => {
  const name = `blocked-${n++}`;
  const old = await openDB(name, 1, { upgrade: (db) => void db.createObjectStore("meta") });
  let blocked = false;
  const opening = openGardenDb(name, { blocked: () => (blocked = true) });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(blocked, "told that another tab is in the way");
  old.close();
  const db = await opening;
  assert.ok(db.objectStoreNames.contains("mapEntities"));
  db.close();
});

test("an open garden steps aside when a newer version needs to upgrade", async () => {
  const name = `blocking-${n++}`;
  let steppedAside = false;
  const db = await openGardenDb(name, { blocking: () => (steppedAside = true) });
  const newer = await openDB(name, 99);
  assert.ok(steppedAside);
  assert.equal(newer.version, 99);
  newer.close();
  void db;
});
