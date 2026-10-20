// Shared vocabulary for gardens. No garden data lives in the app itself:
// every garden starts empty (or from an imported file) in the browser.

export const EVENT_TYPES = [
  "watered",
  "sprouted",
  "thinned",
  "pinched",
  "fertilized",
  "potted_up",
  "transplanted",
  "harvested",
  "observed",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** What an "observed" event records about plants: their health, pests, or care they need. */
export const CONDITIONS = {
  healthy: { label: "Healthy", icon: "💚" },
  pests: { label: "Pests", icon: "🐛" },
  disease: { label: "Disease", icon: "🍂" },
  nutrients: { label: "Nutrient deficiency", icon: "🟡" },
  water: { label: "Water stress", icon: "🥀" },
  weeds: { label: "Needs weeding", icon: "🌾" },
  damage: { label: "Damage", icon: "🩹" },
  missing: { label: "Missing / died", icon: "⚫" },
  other: { label: "Other", icon: "🔎" },
} as const;
export type Condition = keyof typeof CONDITIONS;
export const CONDITION_KEYS = Object.keys(CONDITIONS) as Condition[];

export const PLANTING_STATUSES = [
  "planned",
  "sown",
  "sprouted",
  "growing",
  "transplanted",
  "harvesting",
  "done",
  "failed",
] as const;
export type PlantingStatus = (typeof PLANTING_STATUSES)[number];

export type Milestone = {
  key: string;
  title: string;
  /** Days counted from the sow date or from the first "sprouted" event. */
  from: "sown" | "sprouted";
  dayMin: number;
  dayMax: number;
  /** Logging an event of this type marks the milestone done. */
  event: EventType;
  detail?: string;
};

/** A generic seedling plan for plants added by hand; edit the packet info to tune it. */
export function defaultMilestones(s: { harvestDaysMin: number | null; harvestDaysMax: number | null }): Milestone[] {
  const m: Milestone[] = [
    { key: "thin", title: "Thin to the strongest seedling(s)", from: "sprouted", dayMin: 7, dayMax: 14, event: "thinned" },
    { key: "feed", title: "First light feeding (half-strength)", from: "sprouted", dayMin: 14, dayMax: 21, event: "fertilized" },
    { key: "transplant", title: "Pot up or transplant", from: "sown", dayMin: 35, dayMax: 56, event: "transplanted" },
  ];
  if (s.harvestDaysMin != null)
    m.push({ key: "harvest", title: "Start harvesting", from: "sown", dayMin: s.harvestDaysMin, dayMax: s.harvestDaysMax ?? s.harvestDaysMin + 21, event: "harvested" });
  return m;
}
