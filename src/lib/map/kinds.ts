// The kinds of things that can be placed on the garden map. Pure data: what a
// kind is called, which layer it belongs to, its default size, the extra
// settings it has, and what it can link to. How each kind is drawn lives in
// render.tsx. To add a kind, add an entry here and (optionally) a drawer there;
// without a drawer it draws as a plain box. See docs/MAP.md.

import type { Layer, MapEntity } from "./model.ts";
import { houseStories } from "./openings.ts";

export type FieldDef = {
  key: string;
  label: string;
  type: "number" | "text" | "select" | "boolean";
  options?: { value: string; label: string }[];
  unit?: string;
  step?: number;
  min?: number;
  /** What to show when the setting isn't stored (a tree's trunk worked out from its height). */
  value?: (e: MapEntity) => number;
};

export type LinkKind = "tray" | "species" | "entity";

export type KindDef = {
  kind: string;
  label: string;
  icon: string;
  layer: Layer;
  description: string;
  defaults: { name: string; w: number; d: number; h: number; z?: number; props?: Record<string, string | number | boolean | null> };
  fields?: FieldDef[];
  links?: LinkKind[];
  /** Ground covers (lawn, paths, areas) draw beneath everything else. */
  flat?: boolean;
  /** Can be resized freely; points like an outlet keep their size. */
  resizable?: boolean;
  /** Round in plan (a tree's canopy): one "spread" instead of width and depth. */
  round?: boolean;
  /** Has doors and windows (see openings.ts). */
  openings?: boolean;
  /** A run (drip line, fence): edited by dragging its two ends rather than a corner and a turn handle. */
  line?: boolean;
  /** Geometry that follows from the kind's settings (a house's height from its stories); applied on every change. */
  derive?: (e: Pick<MapEntity, "props" | "h">) => Partial<Pick<MapEntity, "h">>;
};

const TRUNK_FIELD: FieldDef = { key: "trunkHeight", label: "Clear trunk", type: "number", unit: "ft", step: 0.5, min: 0, value: (e) => treeTrunk(e) };

/** How much of a tree's height is bare trunk below the canopy, when not set. */
const TRUNK_SHARE: Record<string, number> = { tree: 0.4, "fruit-tree": 0.35, shrub: 0 };

/** Height of a tree's clear trunk (the bottom of its canopy), in feet. */
export function treeTrunk(e: Pick<MapEntity, "kind" | "h" | "props">): number {
  const set = e.props.trunkHeight;
  const v = set != null && set !== "" ? Number(set) : e.h * (TRUNK_SHARE[e.kind] ?? 0.3);
  return Math.max(0, Math.min(e.h * 0.9, v));
}

const opts = (...values: string[]) => values.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

export const KINDS: KindDef[] = [
  // Ground
  { kind: "lawn", label: "Lawn", icon: "🟩", layer: "ground", flat: true, resizable: true, description: "Grass area.", defaults: { name: "Lawn", w: 20, d: 20, h: 0 } },
  {
    kind: "path",
    label: "Path",
    icon: "🪨",
    layer: "ground",
    flat: true,
    resizable: true,
    description: "Walkway: pavers, stepping stones, gravel or mulch.",
    defaults: { name: "Path", w: 3, d: 16, h: 0, props: { surface: "stepping" } },
    fields: [{ key: "surface", label: "Surface", type: "select", options: opts("pavers", "stepping", "gravel", "mulch", "concrete") }],
  },
  { kind: "patio", label: "Patio", icon: "⬜", layer: "ground", flat: true, resizable: true, description: "Concrete or paved slab.", defaults: { name: "Patio", w: 16, d: 12, h: 0.3 } },
  { kind: "driveway", label: "Driveway", icon: "🚗", layer: "ground", flat: true, resizable: true, description: "Driveway or parking pad.", defaults: { name: "Driveway", w: 12, d: 25, h: 0.2 } },
  { kind: "mulch", label: "Mulch bed", icon: "🟫", layer: "ground", flat: true, resizable: true, description: "Mulched landscape bed.", defaults: { name: "Mulch bed", w: 10, d: 4, h: 0.1 } },

  // Structures
  {
    kind: "house",
    label: "House",
    icon: "🏠",
    layer: "structure",
    resizable: true,
    description: "The house: stories of walls, doors and windows, and a gable roof along its long side.",
    defaults: { name: "House", w: 40, d: 32, h: 10, props: { stories: 1, storyHeight: 10, roofRise: 7 } },
    fields: [
      { key: "stories", label: "Stories", type: "number", step: 1, min: 1, value: (e) => houseStories(e).stories },
      { key: "storyHeight", label: "Story height", type: "number", unit: "ft", step: 0.5, min: 6, value: (e) => houseStories(e).storyHeight },
      { key: "roofRise", label: "Roof rise", type: "number", unit: "ft", step: 0.5, min: 0 },
    ],
    openings: true,
    derive: (e) => {
      const { stories, storyHeight } = houseStories(e);
      return { h: stories * storyHeight };
    },
  },
  {
    kind: "shed",
    label: "Shed",
    icon: "🛖",
    layer: "structure",
    resizable: true,
    description: "Shed or outbuilding.",
    defaults: { name: "Shed", w: 8, d: 6, h: 7, props: { roofRise: 2 } },
    fields: [{ key: "roofRise", label: "Roof rise", type: "number", unit: "ft", step: 0.5, min: 0 }],
    openings: true,
  },
  {
    kind: "fence",
    label: "Fence",
    icon: "🪵",
    layer: "structure",
    resizable: true,
    description: "A fence run; posts every 8 ft along its long side. Drag either end to place it.",
    line: true,
    defaults: { name: "Fence", w: 20, d: 0.3, h: 6, props: { style: "privacy" } },
    fields: [{ key: "style", label: "Style", type: "select", options: opts("privacy", "picket", "wire") }],
  },
  { kind: "gate", label: "Gate", icon: "🚪", layer: "structure", resizable: true, description: "Gate in a fence.", defaults: { name: "Gate", w: 4, d: 0.3, h: 6 } },
  { kind: "trellis", label: "Trellis", icon: "🪜", layer: "structure", resizable: true, line: true, description: "Trellis or espalier wires.", defaults: { name: "Trellis", w: 8, d: 0.3, h: 6 }, links: ["entity"] },
  {
    kind: "netting",
    label: "Netting",
    icon: "🕸️",
    layer: "structure",
    resizable: true,
    description: "Bird or insect netting over a bed (link it to the bed it covers).",
    defaults: { name: "Netting", w: 8, d: 4, h: 3, z: 1 },
    links: ["entity"],
  },

  // Growing
  {
    kind: "raised-bed",
    label: "Raised bed",
    icon: "🟤",
    layer: "growing",
    resizable: true,
    description: "Raised bed; link a planter to show its rows and plants.",
    defaults: { name: "Raised bed", w: 8, d: 4, h: 1 },
    links: ["tray"],
  },
  { kind: "in-ground-bed", label: "In-ground bed", icon: "🌱", layer: "growing", resizable: true, description: "Bed dug into the ground; link a planter to show its rows.", defaults: { name: "Bed", w: 10, d: 4, h: 0.15 }, links: ["tray"] },
  { kind: "herb-garden", label: "Herb garden", icon: "🌿", layer: "growing", resizable: true, description: "Herb planting; link a planter or tray.", defaults: { name: "Herb garden", w: 6, d: 3, h: 1 }, links: ["tray"] },
  {
    kind: "seed-station",
    label: "Seed station",
    icon: "🧪",
    layer: "growing",
    resizable: true,
    description: "Where seed trays live: a table, shelf or windowsill. Link a tray.",
    defaults: { name: "Seed station", w: 4, d: 2, h: 3 },
    links: ["tray"],
  },
  {
    kind: "fruit-tree",
    label: "Fruit tree",
    icon: "🍎",
    layer: "growing",
    resizable: true,
    description: "Fruit tree: its height, the clear trunk below the canopy, and the canopy's spread.",
    defaults: { name: "Fruit tree", w: 10, d: 10, h: 14, props: { fruit: "#c0392b" } },
    fields: [TRUNK_FIELD, { key: "fruit", label: "Fruit color", type: "text" }],
    links: ["species"],
    round: true,
  },
  {
    kind: "tree",
    label: "Tree",
    icon: "🌳",
    layer: "growing",
    resizable: true,
    description: "Shade or ornamental tree: its height, the clear trunk below the canopy, and the canopy's spread.",
    defaults: { name: "Tree", w: 18, d: 18, h: 28 },
    fields: [TRUNK_FIELD],
    links: ["species"],
    round: true,
  },
  { kind: "shrub", label: "Shrub", icon: "🌳", layer: "growing", resizable: true, description: "Shrub or bush.", defaults: { name: "Shrub", w: 6, d: 6, h: 6 }, fields: [TRUNK_FIELD], links: ["species"], round: true },
  { kind: "hedge", label: "Hedge", icon: "🟢", layer: "growing", resizable: true, description: "Hedge run; keep it low enough not to shade beds.", defaults: { name: "Hedge", w: 16, d: 2.5, h: 4 }, links: ["species"] },
  { kind: "container", label: "Container", icon: "🪴", layer: "growing", resizable: true, description: "Pot or tub.", defaults: { name: "Pot", w: 2, d: 2, h: 1.5 }, links: ["species", "tray"] },
  { kind: "compost", label: "Compost", icon: "♻️", layer: "growing", resizable: true, description: "Compost bin or pile.", defaults: { name: "Compost", w: 4, d: 4, h: 3 } },

  // Pools & spas (rounded rectangles)
  {
    kind: "pool",
    label: "In-ground pool",
    icon: "🏊",
    layer: "structure",
    flat: true,
    resizable: true,
    description: "In-ground pool with a coping around the water.",
    defaults: { name: "Pool", w: 16, d: 32, h: 0, props: { depth: 5, corner: 3 } },
    fields: [
      { key: "depth", label: "Water depth", type: "number", unit: "ft", step: 0.5, min: 0 },
      { key: "corner", label: "Corner radius", type: "number", unit: "ft", step: 0.5, min: 0 },
    ],
  },
  {
    kind: "above-ground-pool",
    label: "Above-ground pool",
    icon: "🛟",
    layer: "structure",
    resizable: true,
    description: "Pool standing on the ground, with walls.",
    defaults: { name: "Pool", w: 12, d: 24, h: 4, props: { corner: 3 } },
    fields: [{ key: "corner", label: "Corner radius", type: "number", unit: "ft", step: 0.5, min: 0 }],
  },
  {
    kind: "hot-tub",
    label: "Hot tub",
    icon: "♨️",
    layer: "structure",
    resizable: true,
    description: "Raised hot tub or spa.",
    defaults: { name: "Hot tub", w: 7, d: 7, h: 3, props: { corner: 1.5 } },
    fields: [{ key: "corner", label: "Corner radius", type: "number", unit: "ft", step: 0.25, min: 0 }],
  },

  // Water & power
  { kind: "spigot", label: "Water spigot", icon: "🚰", layer: "utility", description: "Hose bib on the house.", defaults: { name: "Spigot", w: 0.6, d: 0.6, h: 0.6, z: 1.5 } },
  { kind: "outlet", label: "Power outlet", icon: "🔌", layer: "utility", description: "Outdoor electrical outlet.", defaults: { name: "Outlet", w: 0.6, d: 0.4, h: 0.6, z: 1.5 } },
  { kind: "meter", label: "Meter", icon: "⚡", layer: "utility", description: "Water or power meter.", defaults: { name: "Meter", w: 1, d: 0.6, h: 1.5, z: 3 } },
  { kind: "ac-unit", label: "AC unit", icon: "❄️", layer: "utility", resizable: true, description: "Condenser or other equipment pad.", defaults: { name: "AC unit", w: 3, d: 3, h: 3 } },
  { kind: "rain-barrel", label: "Rain barrel", icon: "🛢️", layer: "utility", resizable: true, description: "Rain barrel under a downspout.", defaults: { name: "Rain barrel", w: 2, d: 2, h: 3 } },

  // Irrigation
  {
    kind: "valve",
    label: "Irrigation valve",
    icon: "🔧",
    layer: "irrigation",
    description: "Valve or manifold feeding a zone.",
    defaults: { name: "Valve", w: 1.5, d: 1, h: 0.8, props: { zone: "1" } },
    fields: [{ key: "zone", label: "Zone", type: "text" }],
    links: ["entity"],
  },
  {
    kind: "sprinkler",
    label: "Sprinkler",
    icon: "💦",
    layer: "irrigation",
    description: "Sprinkler head; shows its spray radius.",
    defaults: { name: "Sprinkler", w: 0.5, d: 0.5, h: 0.5, props: { radius: 8, zone: "1" } },
    fields: [
      { key: "radius", label: "Spray radius", type: "number", unit: "ft", step: 0.5, min: 0 },
      { key: "zone", label: "Zone", type: "text" },
    ],
  },
  {
    kind: "drip-line",
    label: "Drip line",
    icon: "〰️",
    layer: "irrigation",
    flat: true,
    resizable: true,
    description: "Drip tubing: drag its ends across a bed (or pick the bed under Belongs to) and it waters that bed's rows.",
    line: true,
    defaults: { name: "Drip line", w: 8, d: 0.2, h: 0.05, props: { zone: "1" } },
    fields: [{ key: "zone", label: "Zone", type: "text" }],
    links: ["entity"],
  },

  // Automation
  {
    kind: "gantry",
    label: "Robot gantry",
    icon: "🤖",
    layer: "automation",
    resizable: true,
    description: "Rail-mounted cultivation robot over a bed (link the bed).",
    defaults: { name: "Gantry", w: 8, d: 4.5, h: 3, props: { status: "planned" } },
    fields: [{ key: "status", label: "Status", type: "select", options: opts("planned", "installed") }],
    links: ["entity"],
  },
  { kind: "robot-dock", label: "Robot dock", icon: "🔋", layer: "automation", description: "Charging dock for a mower or garden robot.", defaults: { name: "Dock", w: 2, d: 2, h: 1 } },
  { kind: "sensor", label: "Sensor", icon: "📡", layer: "automation", description: "Soil moisture, temperature or camera.", defaults: { name: "Sensor", w: 0.4, d: 0.4, h: 1.5, props: { measures: "soil moisture" } }, fields: [{ key: "measures", label: "Measures", type: "text" }], links: ["entity"] },

  // Areas & labels
  {
    kind: "area",
    label: "Area",
    icon: "🏷️",
    layer: "annotation",
    flat: true,
    resizable: true,
    description: "A named area: front yard, back yard, side yard, a future bed.",
    defaults: { name: "Area", w: 20, d: 15, h: 0 },
  },
];

export const KIND_BY_ID = new Map(KINDS.map((k) => [k.kind, k]));

/** The definition for a kind, or a plain box for kinds this version doesn't know. */
export function kindDef(kind: string): KindDef {
  return (
    KIND_BY_ID.get(kind) ?? {
      kind,
      label: kind,
      icon: "📦",
      layer: "annotation",
      description: "Unknown kind (from a newer version of the app?).",
      defaults: { name: kind, w: 2, d: 2, h: 2 },
      resizable: true,
    }
  );
}
