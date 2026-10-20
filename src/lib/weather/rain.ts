// Rain that fell in the garden, so a rainy day counts as watering for the beds
// outdoors (and a seed tray on the windowsill doesn't).
//
// Until there are sensors, the amounts come from Open-Meteo's daily
// precipitation for the garden's location (a model analysis of observations,
// which is as close to "what fell here" as a free, worldwide source gets):
// the forecast API's past days for the last two weeks, and its history
// archive for anything older. Today counts as "expected" when the forecast
// gives a high chance of rain, and is replaced by the recorded amount once the
// day is over. A reading from the garden's own gauge always wins.

import { addDays, daysBetween } from "../dates.ts";
import type { GardenData, Planting, RainDay } from "../types.ts";
import { roundForWeather } from "./forecast.ts";

/** A day with at least this much rain counts as watering. */
export const RAIN_WATERS_IN = 0.1;
/** Today's forecast counts as rain when it's at least this likely. */
export const EXPECTED_CHANCE = 60;
/** How far back to fill in missing days. */
export const BACKFILL_DAYS = 120;

export type RainReading = { date: string; inches: number; chance: number | null };

type Fetch = (url: string) => Promise<Response>;

const r2 = (v: number) => Math.round(v * 100) / 100;

async function daily(fetchFn: Fetch, url: string): Promise<RainReading[]> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const d = (await res.json()).daily ?? {};
  const time: string[] = d.time ?? [];
  return time
    .map((date, i) => ({ date, inches: d.precipitation_sum?.[i], chance: d.precipitation_probability_max?.[i] ?? null }))
    .filter((x): x is RainReading => typeof x.inches === "number")
    .map((x) => ({ ...x, inches: r2(x.inches) }));
}

/**
 * Daily rain at the garden from `from` through today: the history archive for
 * days more than a week back (it trails by a few days), the forecast service's
 * past days for the rest. The forecast service wins where they overlap.
 */
export async function fetchRain(latIn: number, lonIn: number, from: string, today: string, fetchFn: Fetch = fetch): Promise<RainReading[]> {
  const lat = String(roundForWeather(latIn));
  const lon = String(roundForWeather(lonIn));
  const common = { latitude: lat, longitude: lon, precipitation_unit: "inch", timezone: "auto" };
  const recentFrom = addDays(today, -13);
  const out = new Map<string, RainReading>();
  if (daysBetween(from, recentFrom) > 0) {
    const q = new URLSearchParams({ ...common, start_date: from, end_date: addDays(recentFrom, -1), daily: "precipitation_sum" });
    for (const r of await daily(fetchFn, `https://archive-api.open-meteo.com/v1/archive?${q}`)) out.set(r.date, r);
  }
  const past = Math.min(14, Math.max(1, daysBetween(from, today) + 1));
  const q = new URLSearchParams({ ...common, past_days: String(past), forecast_days: "1", daily: "precipitation_sum,precipitation_probability_max" });
  for (const r of await daily(fetchFn, `https://api.open-meteo.com/v1/forecast?${q}`)) out.set(r.date, r);
  return [...out.values()].filter((r) => r.date >= from && r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}

/** The first day that still needs a recorded amount: the oldest missing day in the backfill window (today always refreshes). */
export function rainNeededFrom(data: Pick<GardenData, "rain" | "garden">, today: string): string {
  const have = new Set(data.rain.filter((r) => r.source !== "expected").map((r) => r.date));
  const start = [addDays(today, -BACKFILL_DAYS), data.garden.createdAt.slice(0, 10)].sort().at(-1)!;
  for (let d = start; d < today; d = addDays(d, 1)) if (!have.has(d)) return d;
  return today;
}

/**
 * The records to write for some readings: past days become "recorded"; today
 * becomes "expected" when rain is likely (and is dropped otherwise, so a dry
 * forecast doesn't overwrite anything). A gauge reading is never replaced.
 */
export function rainRecords(existing: RainDay[], readings: RainReading[], today: string, now = new Date().toISOString()): RainDay[] {
  const gauge = new Set(existing.filter((r) => r.source === "gauge").map((r) => r.date));
  const out: RainDay[] = [];
  for (const r of readings) {
    if (gauge.has(r.date) || r.date > today) continue;
    if (r.date < today) out.push({ id: r.date, date: r.date, inches: r.inches, source: "recorded", updatedAt: now });
    else if ((r.chance ?? 0) >= EXPECTED_CHANCE && r.inches > 0) out.push({ id: r.date, date: r.date, inches: r.inches, source: "expected", chance: r.chance, updatedAt: now });
  }
  return out;
}

/** Days with enough rain to count as watering, newest last. */
export function rainyDays(rain: RainDay[], today: string): RainDay[] {
  return rain.filter((r) => r.inches >= RAIN_WATERS_IN && r.date <= today).sort((a, b) => a.date.localeCompare(b.date));
}

/** Map kinds that stand out in the weather (a seed station or anything indoors doesn't). */
const OUTDOOR_KINDS = new Set(["raised-bed", "in-ground-bed", "herb-garden", "container"]);

/** Whether rain reaches a planting: it's in a bed planted in rows, or in a planter that's placed outdoors on the map. */
export function rainReaches(p: Pick<Planting, "trayId">, data: Pick<GardenData, "trays" | "mapEntities">): boolean {
  if (!p.trayId) return false;
  const tray = data.trays.find((t) => t.id === p.trayId);
  if (tray?.layout === "rows") return true;
  return data.mapEntities.some((e) => e.links.trayId === p.trayId && OUTDOOR_KINDS.has(e.kind));
}

export const formatInches = (inches: number) => `${inches.toFixed(2)} in`;
