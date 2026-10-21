// Calendar dates are stored as YYYY-MM-DD strings and compared as UTC midnights,
// so day arithmetic never drifts with the server's own timezone.

const DAY = 86_400_000;

export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The time of day in a time zone, HH:MM on a 24-hour clock. */
export function timeIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  } catch {
    return now.toISOString().slice(11, 16);
  }
}

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function addDays(date: string, days: number): string {
  return new Date(toMs(date) + days * DAY).toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY);
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toMs(value));
}

export function formatDate(date: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  return new Date(toMs(date)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    weekday: opts.weekday ? "short" : undefined,
    year: opts.year ? "numeric" : undefined,
  });
}

export function relativeDay(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}
