import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { openDB } from "idb";
import { addMapEntity, applyTrayLayout, logCare, recordRain, setGaugeRain, updateMapEntity, type ActionCtx } from "../src/lib/actions.ts";
import { calendarEntries } from "../src/lib/calendar.ts";
import { plantingViews } from "../src/lib/garden.ts";
import { careSchedule } from "../src/lib/schedule.ts";
import { createGarden, exportBackup, importBackup, loadAll, openGardenDb, type GardenDB } from "../src/lib/store.ts";
import type { GardenData, RainDay } from "../src/lib/types.ts";
import { fetchRain, rainNeededFrom, rainReaches, rainRecords, rainyDays } from "../src/lib/weather/rain.ts";

const TODAY = "2026-10-20";
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const day = (date: string, inches: number, source: RainDay["source"] = "recorded", chance: number | null = null): RainDay => ({ id: date, date, inches, source, chance, updatedAt: "" });

test("rain comes from the forecast service's past days, and the archive for older days", async () => {
  const urls: string[] = [];
  const fake = async (url: string) => {
    urls.push(url);
    if (url.includes("archive-api")) return json({ daily: { time: ["2026-09-01", "2026-09-02"], precipitation_sum: [0.512, 0] } });
    return json({ daily: { time: ["2026-10-06", "2026-10-19", "2026-10-20"], precipitation_sum: [0.2, 0.42, 0.3], precipitation_probability_max: [null, 90, 80] } });
  };
  // Recent only: one call, no archive.
  const recent = await fetchRain(30.1836998, -97.7891487, "2026-10-15", TODAY, fake);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /api\.open-meteo\.com\/v1\/forecast\?latitude=30\.18&longitude=-97\.79/);
  assert.match(urls[0], /precipitation_unit=inch/);
  assert.match(urls[0], /past_days=6/);
  assert.deepEqual(recent.map((r) => r.date), ["2026-10-19", "2026-10-20"], "only the asked-for days");
  // Going back further adds the archive, up to two weeks ago.
  urls.length = 0;
  const all = await fetchRain(30.18, -97.79, "2026-09-01", TODAY, fake);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /archive-api\.open-meteo\.com\/v1\/archive\?.*start_date=2026-09-01&end_date=2026-10-06/);
  assert.match(urls[1], /past_days=14/);
  assert.deepEqual(all.map((r) => [r.date, r.inches]), [["2026-09-01", 0.51], ["2026-09-02", 0], ["2026-10-06", 0.2], ["2026-10-19", 0.42], ["2026-10-20", 0.3]]);
});

test("readings become records: past days recorded, today only when rain is likely, the gauge never overwritten", () => {
  const readings = [
    { date: "2026-10-17", inches: 0, chance: null },
    { date: "2026-10-18", inches: 0.42, chance: null },
    { date: "2026-10-19", inches: 0.05, chance: null },
    { date: TODAY, inches: 0.3, chance: 80 },
  ];
  const recs = rainRecords([day("2026-10-19", 0.6, "gauge")], readings, TODAY);
  assert.deepEqual(recs.map((r) => [r.date, r.inches, r.source]), [["2026-10-17", 0, "recorded"], ["2026-10-18", 0.42, "recorded"], [TODAY, 0.3, "expected"]]);
  assert.equal(rainRecords([], [{ date: TODAY, inches: 0.3, chance: 30 }], TODAY).length, 0, "an unlikely shower isn't counted");
  assert.equal(rainRecords([], [{ date: TODAY, inches: 0, chance: 90 }], TODAY).length, 0);
});

test("backfill starts at the first missing day (but not before the garden)", () => {
  const garden = { createdAt: "2026-10-14T10:00:00Z" } as GardenData["garden"];
  assert.equal(rainNeededFrom({ garden, rain: [] }, TODAY), "2026-10-14");
  const have = ["2026-10-14", "2026-10-15", "2026-10-16"].map((d) => day(d, 0));
  assert.equal(rainNeededFrom({ garden, rain: have }, TODAY), "2026-10-17");
  const full = Array.from({ length: 6 }, (_, i) => day(`2026-10-${14 + i}`, 0));
  assert.equal(rainNeededFrom({ garden, rain: [...full, day(TODAY, 0.3, "expected")] }, TODAY), TODAY, "only today left to refresh");
  assert.equal(rainNeededFrom({ garden: { createdAt: "2020-01-01" } as GardenData["garden"], rain: [] }, TODAY), "2026-06-22", "at most 120 days back");
});

test("a rainy day counts as watering, newer than the last time by hand", () => {
  const base = { status: "growing" as const, sownAt: "2026-09-01", germDaysMin: null, germDaysMax: null, waterEveryDays: 3, milestones: [], events: [{ type: "watered", date: "2026-10-15" }] };
  const dry = careSchedule(base, TODAY).find((c) => c.key === "water")!;
  assert.deepEqual([dry.start, dry.status], ["2026-10-18", "overdue"]);
  const wet = careSchedule({ ...base, rain: rainyDays([day("2026-10-12", 1), day("2026-10-19", 0.42), day("2026-10-20", 0.05)], TODAY) }, TODAY).find((c) => c.key === "water")!;
  assert.deepEqual([wet.start, wet.status, wet.rainedOn], ["2026-10-22", "upcoming", "2026-10-19"]);
  assert.match(wet.detail!, /rained on .*0\.42 in.*counts/);
  // Rain expected today (likely) counts too.
  const today = careSchedule({ ...base, rain: rainyDays([day(TODAY, 0.3, "expected", 80)], TODAY) }, TODAY).find((c) => c.key === "water")!;
  assert.equal(today.status, "upcoming");
  assert.match(today.detail!, /rain expected today/);
  // Watering by hand after the rain is what counts.
  const later = careSchedule({ ...base, events: [{ type: "watered", date: TODAY }], rain: rainyDays([day("2026-10-19", 0.42)], TODAY) }, TODAY).find((c) => c.key === "water")!;
  assert.equal(later.rainedOn, undefined);
});

let n = 0;
const load = async (db: GardenDB): Promise<GardenData> => (await loadAll(db))!;
const ctxFor = async (db: GardenDB): Promise<ActionCtx> => ({ db, data: await load(db), by: "Pablo", today: TODAY });

test("rain reaches beds outdoors, not the seed tray on the windowsill", async () => {
  const db = await openGardenDb(`rain-${n++}`);
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  const bed = await applyTrayLayout(await ctxFor(db), null, "# Bed\n| | 1 |\n|---|---|\n| A | Radish x 24 |");
  const tray = await applyTrayLayout(await ctxFor(db), null, "# Seed tray\n| | 1 | 2 |\n|---|---|---|\n| A | Basil | Thyme |");
  const pot = await applyTrayLayout(await ctxFor(db), null, "# Pot\n| | 1 | 2 |\n|---|---|---|\n| A | Mint | Mint |");
  const potEntity = await addMapEntity(await ctxFor(db), "container", { x: 10, y: 10 });
  await updateMapEntity(await ctxFor(db), potEntity, { links: { trayId: pot.trayId } });
  const station = await addMapEntity(await ctxFor(db), "seed-station", { x: 20, y: 10 });
  await updateMapEntity(await ctxFor(db), station, { links: { trayId: tray.trayId } });
  let data = await load(db);
  const inTray = (id: string) => data.plantings.find((p) => p.trayId === id)!;
  assert.equal(rainReaches(inTray(bed.trayId), data), true, "a bed of rows");
  assert.equal(rainReaches(inTray(pot.trayId), data), true, "a pot on the map");
  assert.equal(rainReaches(inTray(tray.trayId), data), false, "a tray on the seed station");
  // Sow everything, water by hand a week ago, then a good rain yesterday.
  for (const p of data.plantings) await logCare(await ctxFor(db), { plantingIds: [p.id], type: "watered", date: "2026-10-13" });
  await recordRain(await ctxFor(db), [day("2026-10-19", 0.42)]);
  data = await load(db);
  const water = (trayId: string) =>
    plantingViews({ ...data, plantings: data.plantings.map((p) => ({ ...p, status: "growing", sownAt: "2026-09-01" })) }, TODAY)
      .find((p) => p.trayId === trayId)!
      .care.find((c) => c.key === "water")!;
  assert.equal(water(bed.trayId).rainedOn, "2026-10-19");
  assert.equal(water(pot.trayId).rainedOn, "2026-10-19");
  assert.equal(water(tray.trayId).rainedOn, undefined);
});

test("rain is on the calendar, and the gauge wins", async () => {
  const db = await openGardenDb(`rain-${n++}`);
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  await recordRain(await ctxFor(db), [day("2026-10-18", 0.42), day("2026-10-19", 0), day(TODAY, 0.3, "expected", 80)]);
  await setGaugeRain(await ctxFor(db), "2026-10-18", 0.55);
  let data = await load(db);
  const rain = calendarEntries(data, TODAY, "2026-10-01", "2026-10-31").filter((e) => e.kind === "rain");
  assert.deepEqual(rain.map((e) => [e.date, e.text]), [["2026-10-18", "Rain 0.55 in"], [TODAY, "Rain likely 0.30 in"]], "a dry day isn't listed");
  assert.match(rain[0].detail, /rain gauge.*counts as watering/);
  // The weather service doesn't overwrite the gauge…
  assert.equal(rainRecords(data.rain, [{ date: "2026-10-18", inches: 0.42, chance: null }], TODAY).length, 0);
  // …until the gauge reading is cleared.
  await setGaugeRain(await ctxFor(db), "2026-10-18", null);
  data = await load(db);
  assert.equal(data.rain.find((r) => r.date === "2026-10-18"), undefined);
});

test("rain travels in the garden file, and older databases get the new store", async () => {
  const db = await openGardenDb(`rain-${n++}`);
  await createGarden(db, { name: "G", timezone: "UTC", gardener: "Pablo" });
  await recordRain(await ctxFor(db), [day("2026-10-18", 0.42), day("2026-10-19", 0.6, "gauge")]);
  const file = JSON.parse(JSON.stringify(await exportBackup(db)));
  assert.equal(file.data.rain.length, 2);
  const other = await openGardenDb(`rain-${n++}`);
  await importBackup(other, file);
  assert.deepEqual((await load(other)).rain.map((r) => [r.date, r.source]).sort(), [["2026-10-18", "recorded"], ["2026-10-19", "gauge"]]);
  // A garden file from before rain was recorded still opens.
  delete file.data.rain;
  const older = await openGardenDb(`rain-${n++}`);
  await importBackup(older, file);
  assert.deepEqual((await load(older)).rain, []);
  // A version 2 database upgrades to 3 with an empty rain store.
  const name = `v2-${n++}`;
  const v2 = await openDB(name, 2, {
    upgrade(d) {
      d.createObjectStore("meta");
      for (const s of ["species", "trays", "plantings", "events", "notes", "photos", "tasks", "mapEntities"]) d.createObjectStore(s, { keyPath: "id" });
      d.createObjectStore("photoBlobs");
      d.createObjectStore("chat", { keyPath: "seq", autoIncrement: true }).createIndex("threadId", "threadId");
    },
  });
  await v2.put("meta", { id: "garden", name: "Old", timezone: "UTC", gardeners: [], createdAt: "2026-10-01" }, "garden");
  v2.close();
  const upgraded = await openGardenDb(name);
  assert.deepEqual((await load(upgraded)).rain, []);
});
