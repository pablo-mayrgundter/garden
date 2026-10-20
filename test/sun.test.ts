import assert from "node:assert/strict";
import { test } from "node:test";
import { convexHull, entityShadow, gardenLocation, shadowReach, sunGroundDirection, sunPosition } from "../src/lib/map/sun.ts";
import type { MapEntity } from "../src/lib/map/model.ts";

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("the sun is where it should be", () => {
  // Midsummer noon at 40°N on the prime meridian: due south, 90 − 40 + 23.44 up.
  const summer = sunPosition(new Date("2026-06-21T12:00:00Z"), 40, 0);
  near(summer.altitude, 73.44, 0.5, "solstice altitude");
  near(summer.azimuth, 180, 2, "solstice azimuth");
  // Equinox noon on the equator: overhead.
  assert.ok(sunPosition(new Date("2026-03-20T12:07:00Z"), 0, 0).altitude > 88);
  // Equinox sunrise at 40°N: on the horizon, due east.
  const rise = sunPosition(new Date("2026-03-20T06:07:00Z"), 40, 0);
  near(rise.altitude, 0, 1.5, "sunrise altitude");
  near(rise.azimuth, 90, 3, "sunrise azimuth");
  // Afternoon is in the west; midnight is dark.
  assert.ok(sunPosition(new Date("2026-06-21T17:00:00Z"), 40, 0).azimuth > 240);
  assert.ok(sunPosition(new Date("2026-06-21T00:00:00Z"), 40, 0).altitude < 0);
  // Longitude shifts the clock: noon in Chicago (87.6°W) is about 17:50 UTC.
  near(sunPosition(new Date("2026-06-21T17:50:00Z"), 41.9, -87.6).azimuth, 180, 3, "Chicago noon");
});

test("an unset location is guessed from the time zone", () => {
  assert.deepEqual(gardenLocation({ lat: 41.9, lon: -87.6 }), { lat: 41.9, lon: -87.6, approximate: false });
  assert.equal(gardenLocation({}).approximate, true);
});

const box = (over: Partial<MapEntity>): MapEntity => ({
  id: "b", kind: "raised-bed", name: "Bed", x: 10, y: 10, w: 4, d: 4, h: 2, z: 0, props: {}, links: {}, notes: null, createdAt: "", updatedAt: "", ...over,
});

test("shadows fall away from the sun, as long as the sun is low", () => {
  // Sun due south at 45°, north up: a 2 ft box's shadow reaches 2 ft north of it.
  const sun = { altitude: 45, azimuth: 180 };
  assert.deepEqual(sunGroundDirection(sun, 0).map((v) => Math.round(v * 1e9) / 1e9), [0, 1]);
  near(shadowReach(sun), 1, 1e-9, "reach at 45°");
  const shadow = entityShadow(box({}), "box", sun, 0)!;
  near(Math.min(...shadow.map((p) => p[1])), 8, 1e-9, "shadow's north edge");
  near(Math.max(...shadow.map((p) => p[1])), 14, 1e-9, "shadow's south edge is the bed's");
  // True north turned 90° clockwise on the plan: the same sun now shines from the plan's west.
  const turned = entityShadow(box({}), "box", sun, 90)!;
  near(Math.max(...turned.map((p) => p[0])), 16, 1e-9, "shadow pushed east");
  // No sun, no shadow; ground covers and tiny things cast none.
  assert.equal(entityShadow(box({}), "box", { altitude: -5, azimuth: 0 }, 0), null);
  assert.equal(entityShadow(box({}), "none", sun, 0), null);
  assert.equal(entityShadow(box({ h: 0.1 }), "box", sun, 0), null);
  // A tree's shadow is its canopy's, out past the trunk.
  const tree = entityShadow(box({ kind: "tree", w: 10, d: 10, h: 20 }), "canopy", sun, 0)!;
  assert.ok(Math.min(...tree.map((p) => p[1])) < -5);
  // A house's ridge throws the shadow further than its walls.
  // A narrow house: walls 10 ft, ridge 7 ft above them along y = 13.
  const house = entityShadow(box({ kind: "house", w: 40, d: 6, h: 10, props: { roofRise: 7 } }), "roof", sun, 0)!;
  near(Math.min(...house.map((p) => p[1])), 13 - 17, 1e-9, "ridge shadow");
});

test("convex hull", () => {
  const hull = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1], [1, 0]]);
  assert.equal(hull.length, 4);
});
