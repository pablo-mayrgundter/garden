// Irrigation zones: the sprinklers, drip lines and valves on the map, grouped
// by the zone set on each, and the beds each zone waters. When a zone runs,
// whether on its timer or because someone says so, every planting in those
// beds counts as watered, the same way rain does. So one sprinkler run covers
// the beets in one bed and the radishes and spinach in the next, and the
// Today page asks for one sprinkler run instead of a watering per bed.
//
// What a zone waters, worked out from the map:
// - a sprinkler: the beds most of which lie inside its spray radius;
// - a drip line: the bed it's linked to, else the beds it runs through;
// - a valve: the bed it's linked to (it's mostly there to name the zone and show where the controls are).
// Timer runs are recorded as they come due (IrrigationSync), one record per
// zone per day, so changing or pausing a timer never rewrites the past, and a
// day's run can be marked skipped.

import { addDays, formatDate } from "./dates.ts";
import { turn, type Vec2 } from "./map/geometry.ts";
import type { MapEntity } from "./map/model.ts";
import type { GardenData, IrrigationRun, ZoneSettings, ZoneTimer } from "./types.ts";

export const IRRIGATION_KINDS = new Set(["sprinkler", "drip-line", "valve"]);
/** Map kinds a zone can water: what holds plantings outdoors. */
const BED_KINDS = new Set(["raised-bed", "in-ground-bed", "herb-garden", "container"]);
/** How far back timer runs are filled in. */
const BACKFILL_DAYS = 30;

export const zoneOf = (e: Pick<MapEntity, "props">) => String(e.props.zone ?? "1").trim() || "1";
export const runId = (zone: string, date: string) => `${zone}:${date}`;

export type Zone = {
  zone: string;
  /** "Zone 1", or the name it's been given. */
  name: string;
  /** "sprinklers", "drip lines", "sprinklers and drip lines", or "irrigation". */
  what: string;
  settings: ZoneSettings;
  /** Its sprinklers, drip lines and valves on the map. */
  heads: MapEntity[];
  /** The beds it waters, and their planters. */
  beds: MapEntity[];
  trayIds: string[];
};

/** A point in an entity's own (unturned) frame, on the lot; and back. */
const toLot = (e: MapEntity, x: number, y: number): Vec2 => {
  const [dx, dy] = turn(x - (e.x + e.w / 2), y - (e.y + e.d / 2), e.rot ?? 0);
  return [e.x + e.w / 2 + dx, e.y + e.d / 2 + dy];
};
const inside = (e: MapEntity, [x, y]: Vec2): boolean => {
  const [dx, dy] = turn(x - (e.x + e.w / 2), y - (e.y + e.d / 2), -(e.rot ?? 0));
  return Math.abs(dx) <= e.w / 2 + 1e-9 && Math.abs(dy) <= e.d / 2 + 1e-9;
};
/** A 3 × 3 grid of points over an entity's footprint (corners, edge middles, center). */
const samples = (e: MapEntity): Vec2[] => [0, 0.5, 1].flatMap((fx) => [0, 0.5, 1].map((fy) => toLot(e, e.x + fx * e.w, e.y + fy * e.d)));

/** The beds a sprinkler, drip line or valve waters. */
export function bedsWatered(head: MapEntity, entities: MapEntity[]): MapEntity[] {
  const beds = entities.filter((e) => BED_KINDS.has(e.kind));
  const linked = head.links.entityId ? beds.filter((b) => b.id === head.links.entityId) : [];
  if (head.kind === "valve") return linked;
  if (head.kind === "drip-line") {
    if (linked.length) return linked;
    // Points along the line's length.
    const alongX = head.w >= head.d;
    const line = Array.from({ length: 9 }, (_, i) => (alongX ? toLot(head, head.x + (head.w * i) / 8, head.y + head.d / 2) : toLot(head, head.x + head.w / 2, head.y + (head.d * i) / 8)));
    return beds.filter((b) => line.some((p) => inside(b, p)));
  }
  if (head.kind === "sprinkler") {
    const r = Number(head.props.radius ?? 8);
    const [cx, cy] = [head.x + head.w / 2, head.y + head.d / 2];
    return beds.filter((b) => samples(b).filter(([x, y]) => Math.hypot(x - cx, y - cy) <= r).length >= 5);
  }
  return [];
}

/** The irrigation zones on the map, each with what it waters and its settings. */
export function irrigationZones(data: Pick<GardenData, "mapEntities" | "garden">): Zone[] {
  const byZone = new Map<string, MapEntity[]>();
  for (const e of data.mapEntities) if (IRRIGATION_KINDS.has(e.kind)) byZone.set(zoneOf(e), [...(byZone.get(zoneOf(e)) ?? []), e]);
  return [...byZone.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([zone, heads]) => {
      const settings = data.garden.zones?.find((z) => z.zone === zone) ?? { zone, name: null, timer: null };
      const beds = [...new Map(heads.flatMap((h) => bedsWatered(h, data.mapEntities)).map((b) => [b.id, b])).values()];
      const kinds = new Set(heads.map((h) => h.kind));
      const what = kinds.has("sprinkler") && kinds.has("drip-line") ? "sprinklers and drip lines" : kinds.has("sprinkler") ? "sprinklers" : kinds.has("drip-line") ? "drip lines" : "irrigation";
      return {
        zone,
        name: settings.name?.trim() || `Zone ${zone}`,
        what,
        settings,
        heads,
        beds,
        trayIds: [...new Set(beds.map((b) => b.links.trayId).filter((t): t is string => !!t))],
      };
    });
}

/** The first zone that waters a planter, if any. */
export const zoneFor = (zones: Zone[], trayId: string | null | undefined): Zone | null => (trayId ? (zones.find((z) => z.trayIds.includes(trayId)) ?? null) : null);

export const zoneLabel = (z: Pick<Zone, "name" | "what">) => `${z.name} ${z.what}`;

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Whether a timer is set to run on a date. */
export const runsOn = (t: ZoneTimer, date: string) => !t.paused && t.days.includes(weekday(date));

/**
 * Timer runs that should be on record by now, and aren't: every run day from
 * when the timer was set (up to a month back) through today, today once its
 * start time has passed. `time` is the time of day in the garden, HH:MM.
 */
export function timerRunsDue(zones: Zone[], runs: IrrigationRun[], today: string, time: string, now = new Date().toISOString()): IrrigationRun[] {
  const have = new Set(runs.map((r) => r.id));
  const out: IrrigationRun[] = [];
  for (const z of zones) {
    const t = z.settings.timer;
    if (!t || t.paused || !t.days.length) continue;
    const from = [t.since, addDays(today, -BACKFILL_DAYS)].sort().at(-1)!;
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (!runsOn(t, d) || (d === today && time < t.at) || have.has(runId(z.zone, d))) continue;
      out.push({ id: runId(z.zone, d), zone: z.zone, date: d, source: "timer", updatedAt: now });
    }
  }
  return out;
}

/** The next day a zone's timer runs, from now on: today if its start time hasn't come yet. */
export function nextRun(t: ZoneTimer | null, today: string, time: string): string | null {
  if (!t || t.paused || !t.days.length) return null;
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    if (runsOn(t, d) && (i > 0 || time < t.at)) return d;
  }
  return null;
}

/** The days irrigation watered a planter, oldest first (skipped runs don't count). */
export function irrigationFor(zones: Zone[], runs: IrrigationRun[], trayId: string | null | undefined, today: string): { date: string; zone: string; label: string; source: IrrigationRun["source"] }[] {
  if (!trayId) return [];
  const mine = new Map(zones.filter((z) => z.trayIds.includes(trayId)).map((z) => [z.zone, z]));
  return runs
    .filter((r) => r.source !== "skipped" && r.date <= today && mine.has(r.zone))
    .map((r) => ({ date: r.date, zone: r.zone, label: zoneLabel(mine.get(r.zone)!), source: r.source }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "6:00 AM" from "06:00". */
export function formatTime(at: string): string {
  const [h, m] = at.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Daily at 6:00 AM", "Mon, Wed, Fri at 6:00 AM", "Paused", or "No timer". */
export function describeTimer(t: ZoneTimer | null): string {
  if (!t || !t.days.length) return "No timer";
  if (t.paused) return "Timer paused";
  const days = [...t.days].sort();
  const when = days.length === 7 ? "Daily" : days.join() === "1,2,3,4,5" ? "Weekdays" : days.join() === "0,6" ? "Weekends" : days.map((d) => DAY_NAMES[d]).join(", ");
  return `${when} at ${formatTime(t.at)}`;
}

/** "ran today", "ran yesterday", "ran Oct 18": when a zone last ran, for labels. */
export function lastRun(runs: IrrigationRun[], zone: string, today: string): IrrigationRun | null {
  return runs.filter((r) => r.zone === zone && r.source !== "skipped" && r.date <= today).sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
}

export const ranWhen = (date: string, today: string) => (date === today ? "today" : date === addDays(today, -1) ? "yesterday" : `on ${formatDate(date)}`);
