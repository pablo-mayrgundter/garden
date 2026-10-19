import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { openDB } from "idb";
import { addMapEntity, applyTrayLayout, logCare, migrateCountedNames, setBedSize, trayMarkdown, updateMapEntity, type ActionCtx } from "../src/lib/actions.ts";
import { bedSize, formatInches, layoutBed } from "../src/lib/bedLayout.ts";
import { putRecords } from "../src/lib/store.ts";
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

const SOUTHWEST = `# Raised planter (Southwest, nearest house)

Rows of radish and spinach

|     | 1            |
|-----|--------------|
| A   | radish  x 24 |
| B   | spinach x 24 |
| C   | radish  x 24 |
| D   | spinach x 24 |
| E   | radish  x 24 |
| F   | spinach x 24 |
| G   | radish  x 24 |
`;

test("a 6 ft bed of 7 rows × 24 puts plants 3 in apart, rows evenly across", async () => {
  const db = await fresh();
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  const { trayId } = await applyTrayLayout(await ctxFor(db), null, SOUTHWEST);
  await setBedSize(await ctxFor(db), trayId, { length: 6, width: 3.5 });
  const data = await load(db);
  const tray = data.trays.find((t) => t.id === trayId)!;
  assert.equal(tray.layout, "rows");
  const size = bedSize(data, tray);
  assert.deepEqual(size, { length: 6, width: 3.5, source: "planter" });
  const bed = layoutBed(tray, data.plantings, size);
  assert.equal(bed.rows.length, 7);
  assert.equal(bed.spots.length, 7 * 24);
  for (const r of bed.rows) {
    assert.equal(r.plantings.length, 1);
    assert.equal(formatInches(r.plantings[0].spacingIn), "3 in");
  }
  assert.equal(formatInches(bed.rowSpacingIn), "6 in");
  const rowA = bed.spots.filter((s) => s.row === "A");
  assert.equal(rowA[0].along, 0.125, "first plant half a spacing from the end");
  assert.equal(rowA[23].along, 5.875);
  assert.equal(bed.rows[0].across, 0.25);
  // Two plants per species: radish and spinach, not seven.
  assert.deepEqual(data.species.map((s) => s.commonName).sort(), ["radish", "spinach"]);
});

test("a bed's size follows its place on the map, and changing it moves the map", async () => {
  const db = await fresh();
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  const { trayId } = await applyTrayLayout(await ctxFor(db), null, SOUTHWEST);
  let tray = (await load(db)).trays[0];
  assert.equal(bedSize(await load(db), tray).source, "assumed");
  const id = await addMapEntity(await ctxFor(db), "raised-bed", { x: 10, y: 10 }, { w: 3, d: 8 });
  await updateMapEntity(await ctxFor(db), id, { links: { trayId } });
  assert.deepEqual(bedSize(await load(db), tray), { length: 8, width: 3, source: "map" });
  await setBedSize(await ctxFor(db), trayId, { length: 6, width: 3.5 });
  const data = await load(db);
  const e = data.mapEntities[0];
  assert.deepEqual([e.w, e.d], [3.5, 6], "keeps the bed's orientation on the map");
  tray = data.trays[0];
  assert.equal(tray.size ?? null, null);
  // Re-saving the layout keeps a planter-held size.
  await setBedSize({ ...(await ctxFor(db)), data: { ...data, mapEntities: [] } }, trayId, { length: 5, width: 2 });
  await applyTrayLayout(await ctxFor(db), trayId, SOUTHWEST.replace("radish  x 24", "radish x 20"));
  assert.deepEqual((await load(db)).trays[0].size, { length: 5, width: 2 });
});

test("beds laid out by an older version get their plants and counts back", async () => {
  const db = await fresh();
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  const now = "2026-10-18T00:00:00.000Z";
  const sp = (id: string, commonName: string) => ({
    id, slug: id, commonName, variety: null, scientificName: null, wikipediaTitle: commonName.replace(/ /g, "_"), category: "herb", lifecycle: null, source: null,
    seedsPerPacket: null, sowDepth: null, light: null, germDaysMin: null, germDaysMax: null, height: null, spread: null, spacing: null, soil: null, watering: null,
    waterEveryDays: 2, harvestDaysMin: null, harvestDaysMax: null, uses: null, packetText: null, tips: [], milestones: [], createdAt: now,
  });
  await putRecords(db, "species", [sp("s1", "radish  x 24"), sp("s2", "Spinach x 24"), sp("s3", "Spinach"), sp("s4", "Beet (Detroit Golden) x 18")]);
  await putRecords(db, "trays", [{ id: "t1", name: "Bed", kind: null, notes: null, rows: ["A", "B", "C", "D"], cols: 1, position: 0, createdAt: now }]);
  const pl = (id: string, speciesId: string, cell: string) => ({ id, speciesId, trayId: "t1", cells: [cell], location: null, status: "sown" as const, sownAt: "2026-10-18", sowDateEstimated: false, createdAt: now, updatedAt: now });
  await putRecords(db, "plantings", [pl("p1", "s1", "1A"), pl("p2", "s2", "1B"), pl("p3", "s1", "1C"), pl("p4", "s4", "1D")]);
  const changed = await migrateCountedNames(await ctxFor(db));
  assert.ok(changed > 0);
  const data = await load(db);
  const name = (id: string) => data.species.find((s) => s.id === id);
  assert.equal(name("s1")!.commonName, "radish");
  assert.equal(name("s1")!.wikipediaTitle, "radish");
  assert.equal(name("s2"), undefined, "merged into the existing Spinach");
  assert.deepEqual([name("s4")!.commonName, name("s4")!.variety], ["Beet", "Detroit Golden"]);
  const p = (id: string) => data.plantings.find((x) => x.id === id)!;
  assert.deepEqual([p("p1").count, p("p2").speciesId, p("p2").count, p("p4").count], [24, "s3", 24, 18]);
  assert.equal(data.trays[0].layout, "rows");
  assert.equal(await migrateCountedNames(await ctxFor(db)), 0, "nothing left to fix the second time");
});

test("linking a sized planter to a bed on the map resizes the bed", async () => {
  const db = await fresh();
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  const { trayId } = await applyTrayLayout(await ctxFor(db), null, SOUTHWEST);
  await setBedSize(await ctxFor(db), trayId, { length: 6, width: 3.5 });
  const id = await addMapEntity(await ctxFor(db), "raised-bed", { x: 10, y: 10 });
  await updateMapEntity(await ctxFor(db), id, { links: { trayId } });
  const data = await load(db);
  const e = data.mapEntities[0];
  assert.deepEqual([e.w, e.d], [6, 3.5]);
  assert.deepEqual(bedSize(data, data.trays[0]), { length: 6, width: 3.5, source: "map" });
});
