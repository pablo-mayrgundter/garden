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
  createdAt: string;
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
