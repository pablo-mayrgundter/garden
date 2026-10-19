// The garden map's data model. See docs/MAP.md for the full spec.
//
// World coordinates are feet on the ground plane: the origin is the lot's
// north-west corner, x grows east and y grows south, z grows up. Every map
// entity is an axis-aligned box (x, y, w, d on the ground, h tall, standing on
// z), which is enough for beds, buildings, paths, fences, trees and pipes, and
// keeps hit-testing, snapping and drawing simple. What a box *is* comes from its
// kind (src/lib/map/kinds.tsx); kind-specific settings live in `props`, and
// links to the rest of the garden (planters, plants) in `links`.

export type Site = {
  /** Lot size in feet (east–west, north–south). */
  width: number;
  depth: number;
  /** Degrees clockwise from map-up to true north; 0 means north is up. */
  northDeg: number;
  /** Snapping grid in feet. */
  gridFt: number;
};

export const DEFAULT_SITE: Site = { width: 60, depth: 130, northDeg: 0, gridFt: 0.5 };

/** Layers group kinds for drawing order and for showing/hiding parts of the map. */
export const LAYERS = {
  ground: { label: "Ground & paths", order: 0 },
  structure: { label: "House & structures", order: 1 },
  growing: { label: "Beds & plants", order: 2 },
  utility: { label: "Water & power", order: 3 },
  irrigation: { label: "Irrigation", order: 4 },
  automation: { label: "Automation", order: 5 },
  annotation: { label: "Areas & labels", order: 6 },
} as const;
export type Layer = keyof typeof LAYERS;
export const LAYER_KEYS = Object.keys(LAYERS) as Layer[];

export type MapLinks = {
  /** A planter (tray or bed) whose layout and plantings the entity shows. */
  trayId?: string | null;
  /** A plant from the seed library (e.g. the variety of a fruit tree). */
  speciesId?: string | null;
  /** Another map entity this one belongs to (netting over a bed, a valve feeding a zone). */
  entityId?: string | null;
};

export type MapEntity = {
  id: string;
  /** Key into the kinds registry; unknown kinds still draw as plain boxes. */
  kind: string;
  name: string;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  /** Height of the box's base above the ground (netting over a bed, an outlet on a wall). */
  z: number;
  props: Record<string, string | number | boolean | null>;
  links: MapLinks;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
