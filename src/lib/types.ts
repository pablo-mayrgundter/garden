import type { Condition, EventType, Milestone, PlantingStatus } from "./model.ts";
import type { MapEntity, Site } from "./map/model.ts";

// Everything the app stores. Ids are short random strings so records from
// different devices can later be merged by a sync backend without collisions.

export type Garden = {
  id: "garden";
  name: string;
  timezone: string;
  /** People who tend this garden; used to sign entries ("logged by Pablo"). */
  gardeners: string[];
  /** The property the garden map draws (lot size, house, compass). Absent until the map is set up. */
  site?: Site;
  /** The household's pets, who show up on the garden map. */
  pets?: Pet[];
  /** Irrigation zones' names and timers, by zone (the zones themselves come from the sprinklers, drip lines and valves on the map). */
  zones?: ZoneSettings[];
  createdAt: string;
};

/** An irrigation zone's settings. See src/lib/irrigation.ts. */
export type ZoneSettings = {
  /** The zone, as set on its sprinklers, drip lines and valves ("1", "Back beds"). */
  zone: string;
  /** What to call it, when not "Zone 1". */
  name: string | null;
  /** The controller's schedule, when it runs on a timer; null when it's run by hand. */
  timer: ZoneTimer | null;
};

export type ZoneTimer = {
  /** Days of the week it runs, 0 = Sunday … 6 = Saturday. */
  days: number[];
  /** Start time, HH:MM on a 24-hour clock, in the garden's time zone. */
  at: string;
  /** How long it runs, in minutes (20 when not set). */
  minutes?: number;
  /** The day the timer was set; runs are recorded from then on. */
  since: string;
  /** Turned off for now (winter, a wet spell) without losing the schedule. */
  paused: boolean;
};

/** One run of an irrigation zone (or just one of its lines) on one day. */
export type IrrigationRun = {
  /** `${zone}:${date}` for the whole zone, `${zone}:${date}:${head}` for one line: one record each per day. */
  id: string;
  zone: string;
  date: string;
  /** The one drip line or sprinkler (map item ID) that ran, when it wasn't the whole zone. */
  head?: string | null;
  /** "timer": recorded from the zone's timer; "manual": someone said it ran; "skipped": the timer's run that day didn't happen. */
  source: "timer" | "manual" | "skipped";
  by?: string | null;
  updatedAt: string;
};

/** A pet that lives here (for now, dogs): it comes out the back door on the map. */
export type Pet = {
  id: string;
  name: string;
  kind: "dog";
  /** Key into DOG_COATS (src/lib/map/pets.ts). */
  coat: string;
};

export type Species = {
  id: string;
  slug: string;
  commonName: string;
  variety: string | null;
  scientificName: string | null;
  wikipediaTitle: string | null;
  category: string;
  lifecycle: string | null;
  source: string | null;
  seedsPerPacket: string | null;
  sowDepth: string | null;
  light: string | null;
  germDaysMin: number | null;
  germDaysMax: number | null;
  height: string | null;
  spread: string | null;
  spacing: string | null;
  soil: string | null;
  watering: string | null;
  waterEveryDays: number;
  harvestDaysMin: number | null;
  harvestDaysMax: number | null;
  uses: string | null;
  packetText: string | null;
  tips: string[];
  milestones: Milestone[];
  createdAt: string;
};

export type Tray = {
  id: string;
  name: string;
  kind: string | null;
  rows: string[];
  cols: number;
  notes: string | null;
  /** "rows" for outdoor beds planted in rows with plant counts; "cells" (default) for trays. */
  layout?: "cells" | "rows";
  /** A bed's size in feet (length along its rows, width across them), when it isn't placed on the map. */
  size?: { length: number; width: number } | null;
  position: number;
  createdAt: string;
};

export type Planting = {
  id: string;
  speciesId: string;
  trayId: string | null;
  cells: string[];
  location: string | null;
  status: PlantingStatus;
  sownAt: string | null;
  sowDateEstimated: boolean;
  /** How many plants (e.g. 18 beets in a bed row); plants are numbered 1…count for per-plant observations. */
  count?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type CareEvent = {
  id: string;
  plantingId: string;
  type: EventType;
  date: string;
  note: string | null;
  /** For "observed" events: what was seen. */
  condition?: Condition | null;
  /** Which plants (1-based, within the planting's count) the event is about; absent means the whole planting. */
  plants?: number[] | null;
  by: string | null;
  byAssistant: boolean;
  createdAt: string;
};

export type Note = {
  id: string;
  plantingId: string | null;
  body: string;
  by: string | null;
  byAssistant: boolean;
  createdAt: string;
};

export type Photo = {
  id: string;
  plantingId: string | null;
  speciesId: string | null;
  trayId: string | null;
  kind: "progress" | "packet_front" | "packet_back" | "tray";
  caption: string | null;
  takenAt: string;
  mime: string;
  /** Bundled seed photos are served as static files; uploaded ones live in the photoBlobs store. */
  src: string | null;
  by: string | null;
  createdAt: string;
};

export type Task = {
  id: string;
  plantingId: string | null;
  title: string;
  dueDate: string;
  doneAt: string | null;
  by: string | null;
  byAssistant: boolean;
  createdAt: string;
};

export type GardenData = {
  garden: Garden;
  species: Species[];
  trays: Tray[];
  plantings: Planting[];
  events: CareEvent[];
  notes: Note[];
  photos: Photo[];
  tasks: Task[];
  /** Everything placed on the garden map. */
  mapEntities: MapEntity[];
  /** Rain that fell in the garden, one record per day (see weather/rain.ts). */
  rain: RainDay[];
  /** When each irrigation zone ran (see irrigation.ts). */
  irrigation: IrrigationRun[];
};

export type ChatRecord = {
  seq?: number;
  threadId: string;
  /** Which assistant the conversation belongs to; older records are Claude's. */
  provider?: "claude" | "ollama";
  role: "user" | "assistant" | "tool";
  /** Exactly what was sent/received, except garden photos stored as {type: "garden_photo", photo_id}. */
  content: unknown[];
  display: { text?: string; tools?: string[] } | null;
  createdAt: string;
};

/** How much rain fell in the garden on a day. */
export type RainDay = {
  /** The date, YYYY-MM-DD (one record per day). */
  id: string;
  date: string;
  inches: number;
  /**
   * "recorded": the day's precipitation for the garden's location from Open-Meteo (model analysis of observations);
   * "expected": today, from a forecast with a high chance of rain, until the day is over;
   * "gauge": read off the garden's own rain gauge, which always wins.
   */
  source: "recorded" | "expected" | "gauge";
  /** The forecast's chance of rain, for expected days. */
  chance?: number | null;
  by?: string | null;
  updatedAt: string;
};
