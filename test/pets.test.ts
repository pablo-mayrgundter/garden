import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { updateGarden } from "../src/lib/actions.ts";
import type { MapEntity } from "../src/lib/map/model.ts";
import { backDoor, coatOf, DOG_COATS, insideLot, loungeSpot, niceOut, patrolSpot } from "../src/lib/map/pets.ts";
import { siteTemplate } from "../src/lib/map/template.ts";
import { climbTrees, nearestTree, VISITORS } from "../src/lib/map/wildlife.ts";
import { createGarden, exportBackup, importBackup, loadAll, openGardenDb } from "../src/lib/store.ts";

let seed = 11;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
let n = 0;
const { site, entities } = siteTemplate("2026-10-21", () => `e${n++}`);
const house = entities.find((e) => e.kind === "house")!;
const patio = entities.find((e) => e.kind === "patio")!;

test("the dog comes out the door nearest the patio, and steps out away from the house", () => {
  const d = backDoor(entities)!;
  // The typical lot's patio is behind the house (plan-top), by the back door.
  assert.ok(Math.abs(d.door[1] - house.y) < 1e-9, "on the back wall");
  assert.ok(d.door[0] > house.x && d.door[0] < house.x + house.w);
  assert.ok(d.out[1] < house.y - 2, "a few steps out into the back yard");
  // With the patio moved to the front, the front door it is.
  const front = entities.map((e) => (e.kind === "patio" ? { ...e, y: house.y + house.d + 2 } : e));
  assert.ok(Math.abs(backDoor(front)!.door[1] - (house.y + house.d)) < 1e-9);
  // No patio: the back (plan-top) wall's door.
  assert.ok(Math.abs(backDoor(entities.filter((e) => e.kind !== "patio"))!.door[1] - house.y) < 1e-9);
});

test("a turned house's back door turns with it; no house, no door", () => {
  const turned = entities.map((e) => (e.kind === "house" ? { ...e, rot: 90 } : e)).filter((e) => e.kind !== "patio");
  const d = backDoor(turned)!;
  // Turned a quarter clockwise, the back (plan-top) wall faces east.
  const cx = house.x + house.w / 2;
  assert.ok(d.door[0] > cx + house.d / 2 - 1e-6, "on the east side");
  assert.ok(d.out[0] > d.door[0] + 2, "stepping out east");
  assert.equal(backDoor(entities.filter((e) => e.kind !== "house")), null);
  // A house with no doors at all still has a way out, mid back wall.
  const doorless = entities.map((e) => (e.kind === "house" ? { ...e, openings: [] } : e));
  assert.ok(Math.abs(backDoor(doorless)!.door[0] - cx) < 1e-9);
});

test("lying out: on top of the patio, only when it's sunny and day", () => {
  for (let i = 0; i < 30; i++) {
    const [x, y, z] = loungeSpot(entities, [30, 40], rand)!;
    assert.ok(x > patio.x && x < patio.x + patio.w && y > patio.y && y < patio.y + patio.d, "on the patio");
    assert.equal(z, patio.z + patio.h);
  }
  assert.equal(loungeSpot(entities.filter((e) => e.kind !== "patio"), [30, 40], rand), null);
  assert.ok(niceOut("sun", 30));
  assert.ok(!niceOut("sun", 2), "not at dusk");
  assert.ok(!niceOut("cloud", 30) && !niceOut("rain", 30) && !niceOut("snow", 30));
});

test("the rounds: open ground near the door, inside the lot", () => {
  const home = backDoor(entities)!.out;
  for (let i = 0; i < 30; i++) {
    const [x, y] = patrolSpot(entities, site, home, rand);
    assert.ok(Math.hypot(x - home[0], y - home[1]) <= 45);
    assert.ok(x > 0 && y > 0 && x < site.width && y < site.depth);
  }
  assert.deepEqual(insideLot(site, [-5, 500]), [1.5, site.depth - 1.5]);
});

test("squirrels climb trees with a trunk, not shrubs, and come out by day", () => {
  const trees = climbTrees(entities);
  const kinds = trees.map((t) => entities.find((e) => e.id === t.entityId)!.kind);
  assert.deepEqual(kinds, ["tree"]);
  const t = trees[0];
  const tree = entities.find((e) => e.id === t.entityId) as MapEntity;
  assert.ok(t.crown > t.trunk && t.crown < tree.h, "up into the canopy");
  assert.equal(nearestTree(trees, t.x + 3, t.y, 30), t);
  assert.equal(nearestTree(trees, t.x + 300, t.y, 30), null);
  assert.ok(VISITORS.squirrel.minSun >= 0 && !VISITORS.squirrel.skies.includes("rain"));
});

test("coats: every one has its colors, and an unknown one falls back to a red heeler", () => {
  for (const c of Object.values(DOG_COATS)) for (const k of ["base", "dark", "light"] as const) assert.match(c[k], /^#[0-9a-f]{6}$/i);
  assert.equal(coatOf({ coat: "unicorn" }), DOG_COATS["red-heeler"]);
});

test("pets are kept with the garden and travel in the garden file", async () => {
  const db = await openGardenDb("pets-test");
  await createGarden(db, { name: "G", timezone: "UTC", gardener: null });
  const data = (await loadAll(db))!;
  await updateGarden({ db, data } as Parameters<typeof updateGarden>[0], { pets: [{ id: "p1", name: "Pavlov", kind: "dog", coat: "red-heeler" }] });
  const backup = await exportBackup(db);
  const other = await openGardenDb("pets-test-2");
  await importBackup(other, backup);
  assert.deepEqual((await loadAll(other))!.garden.pets, [{ id: "p1", name: "Pavlov", kind: "dog", coat: "red-heeler" }]);
});
