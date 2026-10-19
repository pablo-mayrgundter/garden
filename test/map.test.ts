import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { addMapEntity, applySiteTemplate, applyTrayLayout, createPlanterForEntity, deleteMapEntity, updateMapEntity, type ActionCtx } from "../src/lib/actions.ts";
import { boxFaces, contains, freeSpot, makeProjector, orderFaces, snap, unprojectDelta, type Rot } from "../src/lib/map/geometry.ts";
import { KINDS, kindDef } from "../src/lib/map/kinds.ts";
import { DEFAULT_SITE, LAYERS } from "../src/lib/map/model.ts";
import { createGarden, exportBackup, importBackup, loadAll, openGardenDb, type GardenDB } from "../src/lib/store.ts";
import type { GardenData } from "../src/lib/types.ts";

let n = 0;
const fresh = async () => {
  const db = await openGardenDb(`map-${n++}`);
  await createGarden(db, { name: "Map garden", timezone: "UTC", gardener: "Pablo" });
  return db;
};
const load = async (db: GardenDB): Promise<GardenData> => (await loadAll(db))!;
const ctxFor = async (db: GardenDB): Promise<ActionCtx> => ({ db, data: await load(db), by: "Pablo", today: "2026-10-17" });
const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

test("projection round-trips ground points in every view and rotation", () => {
  for (const mode of ["iso", "plan"] as const)
    for (const rot of [0, 1, 2, 3] as Rot[]) {
      const pj = makeProjector(mode, rot, DEFAULT_SITE);
      for (const [x, y] of [[0, 0], [12.5, 40], [60, 130], [31, 9]]) {
        const [sx, sy] = pj.p(x, y);
        assert.ok(close(pj.unproject(sx, sy), [x, y]), `${mode} rot ${rot} (${x}, ${y})`);
        assert.ok(close(pj.fromR(...pj.toR(x, y)), [x, y]));
      }
    }
});

test("iso view: height lifts things up the screen, nearer things sort later", () => {
  const pj = makeProjector("iso", 0, DEFAULT_SITE);
  const [, low] = pj.p(10, 10, 0);
  const [, high] = pj.p(10, 10, 5);
  assert.ok(high < low);
  // With no rotation the south-east is nearest the viewer.
  assert.ok(pj.depth(50, 120) > pj.depth(5, 5));
  // A quarter turn puts a different corner in front.
  const turned = makeProjector("iso", 2, DEFAULT_SITE);
  assert.ok(turned.depth(5, 5) > turned.depth(50, 120));
  // Moving the mouse down-right in the iso view moves things east in the world (x grows, y unchanged).
  const [dx, dy] = unprojectDelta(pj, Math.cos(Math.PI / 6), 0.5);
  assert.ok(close([dx, dy], [1, 0]));
});

test("plan view shows only tops; iso draws a box's top after the sides behind it", () => {
  const faces = boxFaces(0, 0, 4, 2, 0, 1, { top: "t", sideX: "x", sideY: "y" });
  assert.deepEqual(orderFaces(makeProjector("plan", 0, DEFAULT_SITE), faces).map((f) => f.fill), ["t"]);
  const iso = orderFaces(makeProjector("iso", 0, DEFAULT_SITE), faces).map((f) => f.fill);
  assert.equal(iso.length, 5);
  assert.ok(iso.indexOf("t") > iso.indexOf("y"), "top after the far side");
  assert.equal(snap(3.26, 0.5), 3.5);
  assert.equal(snap(3.26, 0), 3.26);
  assert.ok(contains({ x: 8, y: 10, w: 8, d: 4 }, 12, 12));
  assert.ok(!contains({ x: 8, y: 10, w: 8, d: 4 }, 17, 12));
});

test("every kind is well formed and on a known layer", () => {
  const ids = new Set<string>();
  for (const k of KINDS) {
    assert.ok(!ids.has(k.kind), `duplicate kind ${k.kind}`);
    ids.add(k.kind);
    assert.ok(k.layer in LAYERS, k.kind);
    assert.ok(k.defaults.w > 0 && k.defaults.d > 0 && k.defaults.h >= 0, k.kind);
    for (const f of k.fields ?? []) if (f.type === "select") assert.ok(f.options?.some((o) => o.value === k.defaults.props?.[f.key]), `${k.kind}.${f.key} default`);
  }
  assert.equal(kindDef("hovercraft").label, "hovercraft", "unknown kinds from newer versions still draw");
});

test("the template lays out a lot once, inside its bounds", async () => {
  const db = await fresh();
  await applySiteTemplate(await ctxFor(db));
  await applySiteTemplate(await ctxFor(db));
  const data = await load(db);
  assert.deepEqual(data.garden.site, DEFAULT_SITE);
  const names = data.mapEntities.map((e) => e.name);
  assert.equal(new Set(data.mapEntities.map((e) => e.id)).size, data.mapEntities.length);
  for (const want of ["House", "Bed 1", "Bed 2", "Bed 3", "Spigot", "Outlet", "Seed station", "Front yard", "Back yard"]) assert.ok(names.includes(want), want);
  for (const e of data.mapEntities) {
    assert.ok(e.x >= 0 && e.y >= 0 && e.x + e.w <= 60.001 && e.y + e.d <= 130.001, `${e.name} inside the lot`);
  }
});

test("map items are added centered, edited, linked and removed", async () => {
  const db = await fresh();
  const id = await addMapEntity(await ctxFor(db), "raised-bed", { x: 20, y: 20 });
  let e = (await load(db)).mapEntities[0];
  assert.equal(e.id, id);
  assert.deepEqual([e.x, e.y, e.w, e.d], [16, 18, 8, 4]);
  await updateMapEntity(await ctxFor(db), id, { name: "Bed 4", x: 30, props: { color: "red" } });
  e = (await load(db)).mapEntities[0];
  assert.equal(e.name, "Bed 4");
  assert.equal(e.x, 30);
  assert.equal(e.y, 18);

  const trayId = await createPlanterForEntity(await ctxFor(db), id);
  let data = await load(db);
  const tray = data.trays.find((t) => t.id === trayId)!;
  assert.equal(tray.name, "Bed 4");
  assert.equal(tray.layout, "rows");
  assert.deepEqual(tray.rows, ["A", "B", "C", "D"]);
  assert.equal(data.mapEntities[0].links.trayId, trayId);

  const net = await addMapEntity(await ctxFor(db), "netting", { x: 34, y: 20 }, { links: { entityId: id } });
  await deleteMapEntity(await ctxFor(db), id);
  data = await load(db);
  assert.equal(data.mapEntities.length, 1);
  assert.equal(data.mapEntities[0].id, net);
  assert.equal(data.mapEntities[0].links.entityId, null, "netting loses its link to the removed bed");
});

test("the garden file carries the map and the lot", async () => {
  const db = await fresh();
  await applySiteTemplate(await ctxFor(db));
  await applyTrayLayout(await ctxFor(db), null, "# Bed 1\n| | 1 |\n|---|---|\n| A | Beet x 6 |");
  const backup = await exportBackup(db);
  const other = await openGardenDb(`map-${n++}`);
  await importBackup(other, JSON.parse(JSON.stringify(backup)));
  const a = await load(db);
  const b = await load(other);
  assert.equal(b.mapEntities.length, a.mapEntities.length);
  assert.deepEqual(b.garden.site, a.garden.site);
  assert.equal(b.plantings[0].count, 6);
});

test("new things land in a free spot near where you're looking", () => {
  const house = { x: 8, y: 48, w: 40, d: 32 };
  const spot = freeSpot([house], DEFAULT_SITE, 28, 64, 8, 4);
  const overlapsHouse = spot.x < house.x + house.w && house.x < spot.x + 8 && spot.y < house.y + house.d && house.y < spot.y + 4;
  assert.ok(!overlapsHouse, JSON.stringify(spot));
  assert.ok(Math.hypot(spot.x + 4 - 28, spot.y + 2 - 64) < 25, "still nearby");
  assert.deepEqual(freeSpot([], DEFAULT_SITE, 10, 10, 4, 2), { x: 8, y: 9 });
});
