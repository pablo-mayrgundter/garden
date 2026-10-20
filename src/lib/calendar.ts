// Calendar entries: what was done (care log, sowings) and what's planned
// (schedule steps, reminders), as one short line per entry per day.

import { addDays, daysBetween, formatDate } from "./dates.ts";
import { plantingViews } from "./garden.ts";
import type { EventType } from "./model.ts";
import type { GardenData } from "./types.ts";
import { RAIN_WATERS_IN } from "./weather/rain.ts";

export type EntryKind = "logged" | "sown" | "scheduled" | "overdue" | "task" | "task-done" | "rain";

export type CalendarEntry = {
  date: string;
  kind: EntryKind;
  icon: string;
  text: string;
  /** Longer description for hover/tap. */
  detail: string;
  href: string | null;
};

const VERB: Record<EventType, [string, string]> = {
  watered: ["💧", "Watered"],
  sprouted: ["🌱", "Sprouted"],
  thinned: ["✂️", "Thinned"],
  pinched: ["🤏", "Pinched"],
  fertilized: ["🧪", "Fed"],
  potted_up: ["🪴", "Potted up"],
  transplanted: ["🏡", "Transplanted"],
  harvested: ["🧺", "Harvested"],
  observed: ["🔎", "Checked"],
  other: ["📝", "Noted"],
};

/** "Basil, Thyme" for a few names; "12 plants" for many. */
function names(list: string[]): string {
  const unique = [...new Set(list)];
  return unique.length <= 2 ? unique.join(", ") : `${list.length} plants`;
}

/** Shortens schedule titles like "Thin to the strongest seedling(s)" to fit a calendar cell. */
function short(title: string): string {
  return title.replace(/\s*\(.*?\)\s*/g, " ").replace(/ to the strongest seedling\s*/i, "").replace(/\s+/g, " ").trim();
}

export function calendarEntries(data: GardenData, today: string, from: string, to: string): CalendarEntry[] {
  const inRange = (d: string) => daysBetween(from, d) >= 0 && daysBetween(d, to) >= 0;
  const plantings = plantingViews(data, today);
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const out: CalendarEntry[] = [];

  // Care log, grouped per day and kind so "watered the tray" is one line.
  const logged = new Map<string, { date: string; type: EventType; ids: string[] }>();
  for (const e of data.events) {
    if (!inRange(e.date) || !byId.has(e.plantingId)) continue;
    const key = `${e.date}|${e.type}`;
    const g = logged.get(key) ?? { date: e.date, type: e.type, ids: [] };
    g.ids.push(e.plantingId);
    logged.set(key, g);
  }
  for (const g of logged.values()) {
    const [icon, verb] = VERB[g.type];
    const list = g.ids.map((id) => byId.get(id)!.name);
    out.push({
      date: g.date,
      kind: "logged",
      icon,
      text: `${verb} ${names(list)}`,
      detail: `${verb}: ${[...new Set(list)].join(", ")}`,
      href: g.ids.length === 1 ? `/plantings/${g.ids[0]}` : null,
    });
  }

  // Rain (the garden's own gauge, the weather record, or today's likely rain)
  for (const r of data.rain ?? []) {
    if (!inRange(r.date) || r.inches < 0.01) continue;
    const amount = `${r.inches.toFixed(2)} in`;
    const counts = r.inches >= RAIN_WATERS_IN ? "; counts as watering for the beds outdoors" : "";
    const from = r.source === "gauge" ? "from the rain gauge" : r.source === "expected" ? `expected (${r.chance ?? "?"}% chance)` : "for the garden's location, from Open-Meteo";
    out.push({
      date: r.date,
      kind: "rain",
      icon: r.source === "expected" ? "🌦️" : "🌧️",
      text: `${r.source === "expected" ? "Rain likely" : "Rain"} ${amount}`,
      detail: `Rain ${amount}, ${from}${counts}`,
      href: null,
    });
  }

  // Sowings
  const sown = new Map<string, string[]>();
  for (const p of plantings) if (p.sownAt && inRange(p.sownAt)) sown.set(p.sownAt, [...(sown.get(p.sownAt) ?? []), p.id]);
  for (const [date, ids] of sown) {
    const list = ids.map((id) => byId.get(id)!.name);
    out.push({ date, kind: "sown", icon: "🌰", text: `Sowed ${names(list)}`, detail: `Sowed: ${list.join(", ")}`, href: ids.length === 1 ? `/plantings/${ids[0]}` : null });
  }

  // Schedule steps not yet done, on the first day of their window; the same step for several plants is one line.
  const steps = new Map<string, { date: string; late: boolean; icon: string; step: string; items: { id: string; name: string; title: string; end: string }[] }>();
  for (const p of plantings) {
    for (const c of p.care) {
      if (c.key === "water" || c.key === "sow" || c.status === "done") continue;
      if (!inRange(c.start)) continue;
      const late = c.status === "overdue" || c.status === "late";
      const step = short(c.title);
      const key = `${c.start}|${late}|${step}`;
      const g = steps.get(key) ?? { date: c.start, late, icon: c.key === "sprout" ? "🌱" : c.event ? VERB[c.event][0] : "📅", step, items: [] };
      g.items.push({ id: p.id, name: p.name, title: c.title, end: c.end });
      steps.set(key, g);
    }
  }
  for (const g of steps.values()) {
    const one = g.items.length === 1 ? g.items[0] : null;
    const list = g.items.map((i) => i.name);
    out.push({
      date: g.date,
      kind: g.late ? "overdue" : "scheduled",
      icon: g.icon,
      text: one ? `${one.name}: ${g.step}` : `${g.step}: ${list.length > 3 ? `${list.slice(0, 2).join(", ")} +${list.length - 2}` : list.join(", ")}`,
      detail: one
        ? `${one.name} — ${one.title}${one.end !== g.date ? ` (until ${formatDate(one.end)})` : ""}`
        : `${g.items[0].title} — ${list.join(", ")}${g.items[0].end !== g.date ? ` (until ${formatDate(g.items[0].end)})` : ""}`,
      href: one ? `/plantings/${one.id}` : null,
    });
  }

  // Reminders
  for (const t of data.tasks) {
    if (!inRange(t.dueDate)) continue;
    out.push({
      date: t.dueDate,
      kind: t.doneAt ? "task-done" : "task",
      icon: t.doneAt ? "☑️" : "☐",
      text: t.title,
      detail: t.title,
      href: t.plantingId ? `/plantings/${t.plantingId}` : null,
    });
  }

  const order: Record<EntryKind, number> = { overdue: 0, task: 1, scheduled: 2, sown: 3, rain: 4, logged: 5, "task-done": 6 };
  return out.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind] || a.text.localeCompare(b.text));
}

/** The 6×7 grid of dates shown for a month (weeks start on Sunday). */
export function monthGrid(year: number, month: number): string[] {
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = addDays(first, -weekday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
