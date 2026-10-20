// Frost dates for the garden, worked out from ~30 years of daily low
// temperatures (Open-Meteo's historical weather, from the ERA5 reanalysis).
// For each year: the last freezing night of spring and the first of autumn,
// at 32°F (frost) and 28°F (hard freeze); the dates shown are the averages.
// Reanalysis is a ~10 km grid, so a frost pocket in a low yard can be colder.

import { roundForWeather } from "./forecast.ts";

export type FrostDates = {
  /** Average dates as MM-DD, or null where it happens in fewer than half the years. */
  lastFrost: string | null;
  firstFrost: string | null;
  lastHardFreeze: string | null;
  firstHardFreeze: string | null;
  /** How many years of data, and in how many there was any frost at all. */
  years: number;
  frostYears: number;
};

export const FROST_C = 0; // 32°F
export const HARD_FREEZE_C = -2.2; // 28°F

const DAYS_BEFORE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Day of a (non-leap) year, 0–364, for a YYYY-MM-DD date; Feb 29 counts as Feb 28. */
export function dayOfYear(date: string): number {
  const m = Number(date.slice(5, 7));
  const d = Math.min(Number(date.slice(8, 10)), m === 2 ? 28 : 31);
  return DAYS_BEFORE[m - 1] + d - 1;
}

export function monthDay(day: number): string {
  const d = ((Math.round(day) % 365) + 365) % 365;
  let m = 11;
  while (DAYS_BEFORE[m] > d) m--;
  return `${String(m + 1).padStart(2, "0")}-${String(d - DAYS_BEFORE[m] + 1).padStart(2, "0")}`;
}

/**
 * From daily lows (°C), by year. In the north, a year's last frost is the last
 * freezing day before August and its first frost the first from August on; in
 * the south (winter mid-year) the halves are swapped.
 */
export function frostDates(dates: string[], minsC: (number | null)[], lat: number): FrostDates {
  const years = new Map<number, { day: number; min: number }[]>();
  dates.forEach((date, i) => {
    const min = minsC[i];
    if (min == null) return;
    const y = Number(date.slice(0, 4));
    if (!years.has(y)) years.set(y, []);
    years.get(y)!.push({ day: dayOfYear(date), min });
  });
  const full = [...years.values()].filter((list) => list.length >= 360);
  const split = dayOfYear("2001-08-01");
  const south = lat < 0;
  const average = (threshold: number, which: "last" | "first") => {
    const found: number[] = [];
    for (const list of full) {
      const freezing = list.filter((d) => d.min <= threshold).map((d) => d.day);
      // "Spring" is the half after midwinter: Jan–Jul in the north, Aug–Dec in the south.
      const springHalf = freezing.filter((d) => (south ? d >= split : d < split));
      const autumnHalf = freezing.filter((d) => (south ? d < split : d >= split));
      if (which === "last" && springHalf.length) found.push(Math.max(...springHalf));
      if (which === "first" && autumnHalf.length) found.push(Math.min(...autumnHalf));
    }
    if (!found.length || found.length < full.length / 2) return null;
    return monthDay(found.reduce((a, b) => a + b, 0) / found.length);
  };
  return {
    lastFrost: average(FROST_C, "last"),
    firstFrost: average(FROST_C, "first"),
    lastHardFreeze: average(HARD_FREEZE_C, "last"),
    firstHardFreeze: average(HARD_FREEZE_C, "first"),
    years: full.length,
    frostYears: full.filter((list) => list.some((d) => d.min <= FROST_C)).length,
  };
}

type Fetch = (url: string) => Promise<Response>;

/** Thirty full years of daily lows, up to last year. */
export async function fetchFrostDates(latIn: number, lonIn: number, fetchFn: Fetch = fetch, now = new Date()): Promise<FrostDates> {
  const lat = roundForWeather(latIn);
  const lon = roundForWeather(lonIn);
  const end = now.getFullYear() - 1;
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${end - 29}-01-01`,
    end_date: `${end}-12-31`,
    daily: "temperature_2m_min",
    timezone: "auto",
  });
  const res = await fetchFn(`https://archive-api.open-meteo.com/v1/archive?${q}`);
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const json = await res.json();
  const result = frostDates(json.daily?.time ?? [], json.daily?.temperature_2m_min ?? [], lat);
  // Too little history to average (a hiccup, or a spot the archive doesn't cover): report it, don't cache it.
  if (result.years < 10) throw new Error(`only ${result.years} years of weather history for this spot`);
  return result;
}
