import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { addMapEntity, updateMapEntity, type ActionCtx } from "../src/lib/actions.ts";
import { treeTrunk } from "../src/lib/map/kinds.ts";
import type { MapEntity, Opening } from "../src/lib/map/model.ts";
import { buildingOpenings, clampOpening, defaultOpenings, newOpening, placeOpening, wallLine, WALLS } from "../src/lib/map/openings.ts";
import { roundedRect } from "../src/lib/map/geometry.ts";
import { entityShadow } from "../src/lib/map/sun.ts";
import { createGarden, loadAll, openGardenDb, type GardenDB } from "../src/lib/store.ts";
import type { GardenData } from "../src/lib/types.ts";

const house = (over: Partial<MapEntity> = {}): MapEntity => ({
  id: "h", kind: "house", name: "House", x: 8, y: 48, w: 40, d: 32, h: 10, z: 0, props: { roofRise: 7 }, links: {}, notes: null, createdAt: "", updatedAt: "", ...over,
});

const inside = (e: MapEntity, o: Opening) => o.offset >= 0 && o.offset + o.width <= wallLine(e, o.wall).length + 1e-9;
const overlap = (a: Opening, b: Opening) => a.wall === b.wall && a.offset < b.offset + b.width && b.offset < a.offset + a.width && a.bottom < b.bottom + b.height && b.bottom < a.bottom + a.height;

test("a house gets a front door, a back door and windows that fit", () => {
  const e = house();
  const all = defaultOpenings(e);
  const doors = all.filter((o) => o.type === "door");
  assert.deepEqual(doors.map((o) => o.wall).sort(), ["n", "s"]);
  assert.equal(doors.find((o) => o.wall === "s")!.offset, 18.5, "front door centered on the south wall");
  assert.ok(all.filter((o) => o.type === "window").length >= 10);
  for (const o of all) assert.ok(inside(e, o), `${o.id} inside its wall`);
  for (const a of all) for (const b of all) if (a !== b) assert.ok(!overlap(a, b), `${a.id} clear of ${b.id}`);
  assert.equal(new Set(all.map((o) => o.id)).size, all.length);
  // Two stories: windows upstairs too.
  const two = defaultOpenings(house({ h: 20, props: { stories: 2, storyHeight: 10, roofRise: 7 } }));
  assert.ok(two.some((o) => o.type === "window" && o.bottom === 13));
  // A shed just gets a door.
  assert.deepEqual(defaultOpenings(house({ kind: "shed", w: 8, d: 6, h: 7 })).map((o) => o.type), ["door"]);
  // Stored openings win over the defaults.
  assert.deepEqual(buildingOpenings(house({ openings: [] })), []);
});

test("dragging an opening slides it along the nearest wall, and round a corner", () => {
  const e = house();
  const win: Opening = { id: "w", type: "window", wall: "s", offset: 2, width: 3, height: 4, bottom: 3 };
  // A point just outside the south wall, 10 ft along: centered there, snapped to half a foot.
  const moved = placeOpening(e, win, 8 + 10.2, 48 + 32 + 1, (v) => Math.round(v * 2) / 2);
  assert.deepEqual([moved.wall, moved.offset], ["s", 8.5]);
  // Past the east corner and up the side: now on the east wall.
  const round = placeOpening(e, win, 8 + 40 + 1, 48 + 20, (v) => v);
  assert.deepEqual([round.wall, round.offset], ["e", 18.5]);
  // Never past the wall's end.
  assert.deepEqual(Object.values((({ wall, offset }) => ({ wall, offset }))(placeOpening(e, win, 8 + 39.9, 48 + 32 + 1))), ["s", 37]);
  assert.equal(clampOpening(e, { ...win, offset: -5 }).offset, 0);
});

test("a new opening goes in the widest free stretch of the wall", () => {
  const e = house({ openings: [{ id: "a", type: "door", wall: "s", offset: 0, width: 3, height: 7, bottom: 0 }, { id: "b", type: "door", wall: "s", offset: 10, width: 3, height: 7, bottom: 0 }] });
  const o = newOpening(e, "door", "s", "c");
  assert.equal(o.offset, 13 + (40 - 13 - 3) / 2);
  assert.ok(!e.openings!.some((x) => overlap(x, o)));
  for (const w of WALLS) assert.ok(inside(e, newOpening(e, "garage", w, "g")));
});

let n = 0;
const load = async (db: GardenDB): Promise<GardenData> => (await loadAll(db))!;
const ctxFor = async (db: GardenDB): Promise<ActionCtx> => ({ db, data: await load(db), by: "Pablo", today: "2026-10-20" });

test("a house's height follows its stories", async () => {
  const db = await openGardenDb(`houses-${n++}`);
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  const id = await addMapEntity(await ctxFor(db), "house", { x: 30, y: 60 });
  assert.equal((await load(db)).mapEntities[0].h, 10);
  await updateMapEntity(await ctxFor(db), id, { props: { stories: 2, storyHeight: 9 } });
  const e = (await load(db)).mapEntities[0];
  assert.equal(e.h, 18);
  assert.equal(e.props.roofRise, 7, "other settings kept");
  // An older house without stories keeps its height.
  const old = await addMapEntity(await ctxFor(db), "house", { x: 30, y: 20 }, { h: 12, props: { roofRise: 5 } });
  await updateMapEntity(await ctxFor(db), old, { name: "Old house" });
  assert.equal((await load(db)).mapEntities.find((m) => m.id === old)!.h, 12);
});

test("a tree's clear trunk sets where its canopy (and its shadow) starts", () => {
  const tree = house({ kind: "tree", w: 18, d: 18, h: 28, props: {} });
  assert.equal(treeTrunk(tree), 28 * 0.4);
  assert.equal(treeTrunk({ ...tree, props: { trunkHeight: 6 } }), 6);
  assert.equal(treeTrunk({ ...tree, props: { trunkHeight: 40 } }), 28 * 0.9, "never the whole tree");
  const sun = { altitude: 45, azimuth: 180 };
  const reach = (t: MapEntity) => Math.min(...entityShadow(t, "canopy", sun, 0)!.map((p) => p[1]));
  assert.ok(reach({ ...tree, h: 40 }) < reach(tree), "a taller tree casts a longer shadow");
});

test("pools are rounded rectangles inside their footprint", () => {
  const pool = house({ kind: "pool", x: 10, y: 10, w: 16, d: 32, h: 0, props: { corner: 3 } });
  const pts = roundedRect(pool, 3, 0);
  assert.equal(pts.length, 28);
  for (const [x, y] of pts) assert.ok(x >= 10 - 1e-9 && x <= 26 + 1e-9 && y >= 10 - 1e-9 && y <= 42 + 1e-9);
  assert.ok(!pts.some(([x, y]) => Math.abs(x - 10) < 1e-6 && Math.abs(y - 10) < 1e-6), "the corner is rounded off");
  // A radius larger than the box just makes it a stadium.
  assert.ok(roundedRect({ x: 0, y: 0, w: 4, d: 10 }, 99, 0).every(([x]) => x >= -1e-9 && x <= 4 + 1e-9));
});
