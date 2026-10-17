import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarEntries, monthGrid } from "../src/lib/calendar.ts";
import type { GardenData, Planting, Species } from "../src/lib/types.ts";

const species = (id: string, name: string): Species => ({
  id, slug: id, commonName: name, variety: null, scientificName: null, wikipediaTitle: null, category: "herb", lifecycle: null, source: null,
  seedsPerPacket: null, sowDepth: null, light: null, germDaysMin: 7, germDaysMax: 14, height: null, spread: null, spacing: null, soil: null,
  watering: null, waterEveryDays: 2, harvestDaysMin: null, harvestDaysMax: null, uses: null, packetText: null, tips: [],
  milestones: [{ key: "thin", title: "Thin to the strongest seedling(s)", from: "sown", dayMin: 10, dayMax: 14, event: "thinned" }], createdAt: "",
});
const planting = (id: string, speciesId: string): Planting => ({
  id, speciesId, trayId: null, cells: [], location: null, status: "sown", sownAt: "2026-10-05", sowDateEstimated: false, createdAt: "", updatedAt: "",
});
const ev = (id: string, plantingId: string, type: "watered" | "thinned", date: string) => ({ id, plantingId, type, date, note: null, by: null, byAssistant: false, createdAt: "" });

const data: GardenData = {
  garden: { id: "garden", name: "g", timezone: "UTC", gardeners: [], createdAt: "" },
  species: [species("basil", "Basil"), species("thyme", "Thyme"), species("dill", "Dill")],
  trays: [],
  plantings: [planting("p1", "basil"), planting("p2", "thyme"), planting("p3", "dill")],
  events: [ev("e1", "p1", "watered", "2026-10-16"), ev("e2", "p2", "watered", "2026-10-16"), ev("e3", "p3", "watered", "2026-10-16"), ev("e4", "p1", "thinned", "2026-10-15")],
  notes: [],
  photos: [],
  tasks: [{ id: "t1", plantingId: null, title: "Rotate the tray", dueDate: "2026-10-20", doneAt: null, by: null, byAssistant: false, createdAt: "" }],
};

test("groups a day's care into one line and lists sowings, steps and reminders", () => {
  const entries = calendarEntries(data, "2026-10-17", "2026-10-01", "2026-10-31");
  const on = (d: string) => entries.filter((e) => e.date === d).map((e) => e.text);
  assert.deepEqual(on("2026-10-16"), ["Watered 3 plants"]);
  assert.deepEqual(on("2026-10-15"), ["Thin: Thyme, Dill", "Thinned Basil"], "basil's thinning is logged, so it isn't also planned");
  assert.deepEqual(on("2026-10-05"), ["Sowed 3 plants"]);
  assert.deepEqual(on("2026-10-20"), ["Rotate the tray"]);
  assert.deepEqual(on("2026-10-12"), ["Watch for sprouts: Basil, Thyme, Dill"]);
  assert.ok(entries.some((e) => e.text === "Thin: Thyme, Dill" && e.kind === "scheduled" && e.href === null));
});

test("month grid starts on Sunday and covers six weeks", () => {
  const g = monthGrid(2026, 9);
  assert.equal(g.length, 42);
  assert.equal(g[0], "2026-09-27");
  assert.equal(g[4], "2026-10-01");
});
