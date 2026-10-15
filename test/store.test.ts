import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { addPhoto, deletePlanting, logCare, type ActionCtx } from "../src/lib/actions.ts";
import { plantingViews } from "../src/lib/garden.ts";
import { exportBackup, getPhotoBlob, importBackup, loadAll, openGardenDb } from "../src/lib/store.ts";

let n = 0;
const fresh = () => openGardenDb(`test-${n++}`);
const ctxFor = async (db: Awaited<ReturnType<typeof fresh>>): Promise<ActionCtx> => ({ db, data: await loadAll(db), by: "Pablo", today: "2026-10-15" });

test("first open seeds the garden from the plan", async () => {
  const data = await loadAll(await fresh());
  assert.equal(data.garden.name, "Herb Garden");
  assert.equal(data.trays.length, 2);
  assert.equal(data.plantings.length, 14);
  assert.equal(data.species.length, 15);
  const lavender = data.plantings.find((p) => p.speciesId === "lavender")!;
  assert.deepEqual(lavender.cells, ["1C", "2C"]);
  assert.equal(data.plantings.find((p) => p.speciesId === "mint")!.status, "planned");
  assert.ok(data.photos.some((p) => p.plantingId === "seed-tray-4D" && p.src === "seed/cell-4D.webp"));
});

test("reopening doesn't re-seed", async () => {
  const name = `test-${n++}`;
  const db = await openGardenDb(name);
  await logCare(await ctxFor(db), { plantingIds: ["seed-tray-1A"], type: "watered" });
  db.close();
  const again = await loadAll(await openGardenDb(name));
  assert.equal(again.plantings.length, 14);
  assert.equal(again.events.filter((e) => e.type === "watered").length, 1);
});

test("logging sprouts advances status and the schedule", async () => {
  const db = await fresh();
  await logCare(await ctxFor(db), { plantingIds: ["seed-tray-3A"], type: "sprouted", date: "2026-10-15" });
  const data = await loadAll(db);
  const dill = plantingViews(data, "2026-10-15").find((p) => p.id === "seed-tray-3A")!;
  assert.equal(dill.status, "sprouted");
  assert.equal(dill.care.find((c) => c.key === "sprout")!.status, "done");
  assert.equal(data.events.find((e) => e.plantingId === "seed-tray-3A" && e.type === "sprouted")?.by, "Pablo");
});

test("deleting a planting removes its log, notes and photos", async () => {
  const db = await fresh();
  await deletePlanting(await ctxFor(db), "seed-tray-4D");
  const data = await loadAll(db);
  assert.ok(!data.plantings.some((p) => p.id === "seed-tray-4D"));
  assert.ok(!data.events.some((e) => e.plantingId === "seed-tray-4D"));
  assert.ok(!data.notes.some((x) => x.plantingId === "seed-tray-4D"));
  assert.ok(!data.photos.some((x) => x.plantingId === "seed-tray-4D"));
});

test("backup round-trips records and uploaded photos", async () => {
  const src = await fresh();
  const ctx = await ctxFor(src);
  await logCare(ctx, { plantingIds: ["seed-tray-2A"], type: "thinned", note: "kept 3" });
  await addPhoto(ctx, { plantingId: "seed-tray-2A", speciesId: null, trayId: null, kind: "progress", caption: "day 10", takenAt: "2026-10-15" }, new Blob([new Uint8Array([1, 2, 3, 250])], { type: "image/jpeg" }));
  const backup = JSON.parse(JSON.stringify(await exportBackup(src)));

  const dst = await fresh();
  await logCare(await ctxFor(dst), { plantingIds: ["seed-tray-1A"], type: "watered" });
  await importBackup(dst, backup);
  const data = await loadAll(dst);
  assert.ok(data.events.some((e) => e.type === "thinned" && e.note === "kept 3"));
  assert.ok(!data.events.some((e) => e.type === "watered"), "import replaces local data");
  const uploaded = data.photos.find((p) => p.caption === "day 10")!;
  const blob = await getPhotoBlob(dst, uploaded.id);
  assert.deepEqual([...new Uint8Array(await blob!.arrayBuffer())], [1, 2, 3, 250]);
  await assert.rejects(importBackup(dst, { nope: true } as never), /isn't a Herb Garden backup/);
});
