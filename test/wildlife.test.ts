import assert from "node:assert/strict";
import { test } from "node:test";
import type { MapEntity } from "../src/lib/map/model.ts";
import { DEFAULT_SITE } from "../src/lib/map/model.ts";
import { attractors, catSpot, edgePoint, pickAttractor, VISITORS } from "../src/lib/map/wildlife.ts";
import { siteTemplate } from "../src/lib/map/template.ts";
import type { GardenData } from "../src/lib/types.ts";

let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
let n = 0;
const { entities } = siteTemplate("2026-10-20", () => `e${n++}`);

const data = (plants: [string, string][]): GardenData =>
  ({
    garden: { id: "garden", name: "G", timezone: "UTC", gardeners: [], createdAt: "" },
    species: plants.map(([id, commonName]) => ({ id, commonName, variety: null, category: "herb" })),
    trays: [{ id: "t1" }],
    plantings: plants.map(([id], i) => ({ id: `p${i}`, speciesId: id, trayId: "t1", cells: [`1${"ABCDEFG"[i]}`], status: "growing" })),
    events: [],
    notes: [],
    photos: [],
    tasks: [],
    mapEntities: [],
  }) as unknown as GardenData;

test("songbirds perch in the canopy of trees and shrubs, and on fences", () => {
  const draws = attractors(entities, data([]));
  const birds = draws.filter((d) => d.visitor === "songbird");
  const kinds = new Set(birds.map((d) => entities.find((e) => e.id === d.entityId)!.kind));
  assert.deepEqual([...kinds].sort(), ["fence", "gate", "shrub", "tree"]);
  const tree = entities.find((e) => e.kind === "tree")!;
  const spot = birds.find((d) => d.entityId === tree.id)!;
  for (let i = 0; i < 50; i++) {
    const [x, y, z] = spot.spot(rand);
    assert.ok(Math.hypot(x - (tree.x + tree.w / 2), y - (tree.y + tree.d / 2)) <= tree.w / 2, "within the canopy");
    assert.ok(z > tree.h * 0.4 && z <= tree.h, "up in the branches, above the trunk");
  }
  // No flowers yet: no butterflies or hummingbirds.
  assert.ok(!draws.some((d) => d.visitor !== "songbird"));
});

test("flowering plants in a bed draw butterflies, and the right ones hummingbirds", () => {
  const bed = { ...entities.find((e) => e.kind === "raised-bed")!, links: { trayId: "t1" } } as MapEntity;
  const draws = attractors([bed], data([["s1", "Lavender"], ["s2", "Salvia"], ["s3", "Radish"]]));
  assert.equal(draws.find((d) => d.visitor === "butterfly")!.weight, 2);
  assert.equal(draws.find((d) => d.visitor === "hummingbird")!.weight, 2);
  assert.equal(attractors([bed], data([["s3", "Radish"], ["s4", "Spinach"]])).length, 0, "vegetables don't");
  const [x, y, z] = draws[0].spot(rand);
  assert.ok(x >= bed.x && x <= bed.x + bed.w && y >= bed.y && y <= bed.y + bed.d && z > bed.h);
  // Weighted picking only picks the right kind.
  assert.equal(pickAttractor(draws, "butterfly", rand)!.visitor, "butterfly");
  assert.equal(pickAttractor(draws, "songbird", rand), null);
});

test("cats sit on open ground and come and go at the lot's edge", () => {
  const solids = entities.filter((e) => !["lawn", "patio", "path", "mulch", "driveway", "area"].includes(e.kind));
  for (let i = 0; i < 30; i++) {
    const [x, y] = catSpot(entities, DEFAULT_SITE, rand);
    assert.ok(!solids.some((e) => x > e.x && x < e.x + e.w && y > e.y && y < e.y + e.d), `(${x.toFixed(1)}, ${y.toFixed(1)}) clear of everything standing`);
  }
  const [ex, ey] = edgePoint(DEFAULT_SITE, 2, 60, rand);
  assert.ok(ex < 0 && Math.abs(ey - 60) <= 10, "out the nearest side");
  assert.ok(VISITORS.cat.skies.every((s) => s !== "rain" && s !== "snow"), "cats stay in when it's wet");
});
