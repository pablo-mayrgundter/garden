// Turns a planting's species data + care log into a concrete schedule:
// watering cadence, germination window, and the species' milestones.

import { addDays, daysBetween } from "./dates.ts";
import type { EventType, Milestone, PlantingStatus } from "./model.ts";

export type CareStatus = "done" | "overdue" | "due" | "upcoming" | "late";

export type CareItem = {
  key: string;
  title: string;
  detail?: string;
  /** Logging this event type completes the item; null for "mark as sown". */
  event: EventType | null;
  start: string;
  end: string;
  status: CareStatus;
  doneOn?: string;
};

export type ScheduleInput = {
  status: PlantingStatus;
  sownAt: string | null;
  germDaysMin: number | null;
  germDaysMax: number | null;
  waterEveryDays: number;
  milestones: Milestone[];
  events: { type: string; date: string }[];
};

const ACTIVE: PlantingStatus[] = ["sown", "sprouted", "growing", "transplanted", "harvesting"];
const SEEDLING: PlantingStatus[] = ["sown", "sprouted"];

function windowStatus(start: string, end: string, today: string): CareStatus {
  if (daysBetween(today, start) > 0) return "upcoming";
  if (daysBetween(today, end) >= 0) return "due";
  return "overdue";
}

export function sproutedOn(events: ScheduleInput["events"]): string | null {
  const dates = events.filter((e) => e.type === "sprouted").map((e) => e.date).sort();
  return dates[0] ?? null;
}

export function lastEvent(events: ScheduleInput["events"], type: string): string | null {
  const dates = events.filter((e) => e.type === type).map((e) => e.date).sort();
  return dates.at(-1) ?? null;
}

/** Seedlings in the tray want moisture every day; afterwards use the species' cadence. */
export function wateringInterval(p: Pick<ScheduleInput, "status" | "waterEveryDays">): number {
  return SEEDLING.includes(p.status) ? 1 : Math.max(1, p.waterEveryDays);
}

export function careSchedule(p: ScheduleInput, today: string): CareItem[] {
  if (p.status === "planned") {
    return [{ key: "sow", title: "Sow seeds", event: null, start: today, end: today, status: "due" }];
  }
  if (!ACTIVE.includes(p.status) || !p.sownAt) return [];

  const items: CareItem[] = [];
  const sprouted = sproutedOn(p.events);

  // Watering
  const interval = wateringInterval(p);
  const lastWater = lastEvent(p.events, "watered");
  const next = lastWater ? addDays(lastWater, interval) : today;
  items.push({
    key: "water",
    title: SEEDLING.includes(p.status) ? "Keep moist (mist)" : "Water",
    detail: interval === 1 ? "Daily" : `Every ${interval} days`,
    event: "watered",
    start: next,
    end: next,
    status: daysBetween(today, next) > 0 ? "upcoming" : daysBetween(today, next) === 0 ? "due" : "overdue",
  });

  // Germination
  if (p.germDaysMin != null && p.germDaysMax != null) {
    const start = addDays(p.sownAt, p.germDaysMin);
    const end = addDays(p.sownAt, p.germDaysMax);
    if (sprouted) {
      items.push({ key: "sprout", title: "Sprouts emerge", event: "sprouted", start, end, status: "done", doneOn: sprouted });
    } else {
      const late = daysBetween(end, today) > 7;
      items.push({
        key: "sprout",
        title: late ? "No sprouts yet — consider re-sowing" : "Watch for sprouts",
        detail: late ? "Past the packet's germination window by more than a week." : undefined,
        event: "sprouted",
        start,
        end,
        status: late ? "late" : windowStatus(start, end, today),
      });
    }
  }

  // Milestones from the packet
  for (const m of p.milestones) {
    const base = m.from === "sown" ? p.sownAt : sprouted;
    if (!base) continue; // sprout-relative milestones wait for sprouts
    const start = addDays(base, m.dayMin);
    const end = addDays(base, m.dayMax);
    const done = p.events
      .filter((e) => e.type === m.event && daysBetween(base, e.date) >= 0)
      .map((e) => e.date)
      .sort()[0];
    items.push({
      key: m.key,
      title: m.title,
      detail: m.detail,
      event: m.event,
      start,
      end,
      status: done ? "done" : windowStatus(start, end, today),
      doneOn: done,
    });
  }

  return items;
}

const ORDER: Record<CareStatus, number> = { overdue: 0, late: 1, due: 2, upcoming: 3, done: 4 };

export function sortCare(items: CareItem[]): CareItem[] {
  return [...items].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.start.localeCompare(b.start));
}
