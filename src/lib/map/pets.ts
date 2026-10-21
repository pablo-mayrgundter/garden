// The household's own pets on the garden map. A dog lives inside and comes out
// the back door now and then: to see off a cat or a squirrel, to make the
// rounds of the yard, and, when it's nice out, to lie in the sun on the patio.
// Pure data and functions; the motion is in src/components/Critters.tsx.

import type { Sky } from "../weather/forecast.ts";
import type { Pet } from "../types.ts";
import { turn, type Vec2, type Vec3 } from "./geometry.ts";
import type { MapEntity } from "./model.ts";
import { buildingOpenings, wallLine } from "./openings.ts";
import { catSpot } from "./wildlife.ts";

export type DogCoat = {
  label: string;
  base: string;
  /** Ears and mask. */
  dark: string;
  /** Muzzle, chest and belly. */
  light: string;
  /** Flecks over the body (a heeler's speckle). */
  speckle?: string;
  /** A white mark on the forehead. */
  blaze?: boolean;
};

export const DOG_COATS: Record<string, DogCoat> = {
  "red-heeler": { label: "Red heeler", base: "#c06a42", dark: "#8f3f20", light: "#f3e6d8", speckle: "#e7c2aa", blaze: true },
  "blue-heeler": { label: "Blue heeler", base: "#6f7c8a", dark: "#2f343b", light: "#d8b48a", speckle: "#c9d2dc", blaze: true },
  "black-lab": { label: "Black", base: "#2a2a2e", dark: "#1c1c1f", light: "#3c3c42" },
  "yellow-lab": { label: "Yellow", base: "#e2c391", dark: "#c9a46c", light: "#f2e1c0" },
  golden: { label: "Golden", base: "#d39a4c", dark: "#b37a32", light: "#ecc58a" },
  chocolate: { label: "Chocolate", base: "#6b4128", dark: "#4d2c19", light: "#87573a" },
  "black-and-white": { label: "Black and white", base: "#222226", dark: "#18181b", light: "#f4f1ea", blaze: true },
  brown: { label: "Brown", base: "#8b6b4a", dark: "#5f4630", light: "#c9ab88" },
  white: { label: "White", base: "#f3f0ea", dark: "#d9d3c8", light: "#ffffff" },
};

export const coatOf = (pet: Pick<Pet, "coat">): DogCoat => DOG_COATS[pet.coat] ?? DOG_COATS["red-heeler"];

/** A point in an entity's own (unturned) frame, on the lot. */
function onLot(e: Pick<MapEntity, "x" | "y" | "w" | "d" | "rot">, x: number, y: number): Vec2 {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.d / 2;
  const [dx, dy] = turn(x - cx, y - cy, e.rot ?? 0);
  return [cx + dx, cy + dy];
}

/**
 * The house's back door, where the dog comes and goes: the door nearest the
 * patio if there is one, else one on the house's back (plan-top) wall, else
 * any door. `door` is in the doorway; `out` is a few steps outside it.
 */
export function backDoor(entities: MapEntity[]): { door: Vec2; out: Vec2 } | null {
  const house = entities.find((e) => e.kind === "house");
  if (!house) return null;
  const doors = buildingOpenings(house).filter((o) => o.type === "door");
  const spot = (wall: (typeof doors)[number]["wall"], along: number) => {
    const l = wallLine(house, wall);
    const at = (out: number) => onLot(house, l.x + l.dx * along + l.nx * out, l.y + l.dy * along + l.ny * out);
    return { door: at(0), out: at(3) };
  };
  if (!doors.length) return spot("n", house.w / 2);
  const patio = entities.find((e) => e.kind === "patio");
  const options = doors.map((o) => spot(o.wall, o.offset + o.width / 2));
  if (patio) {
    const [px, py] = [patio.x + patio.w / 2, patio.y + patio.d / 2];
    return options.reduce((a, b) => (Math.hypot(b.out[0] - px, b.out[1] - py) < Math.hypot(a.out[0] - px, a.out[1] - py) ? b : a));
  }
  return options[doors.findIndex((o) => o.wall === "n")] ?? options[0];
}

/** Sunny and daytime: weather for lying out on the patio. */
export const niceOut = (sky: Sky, sunAltitude: number) => sky === "sun" && sunAltitude > 8;

/** A spot to lie down on the patio nearest `near`, on top of it; none without a patio. */
export function loungeSpot(entities: MapEntity[], near: Vec2, rand: () => number): Vec3 | null {
  const patios = entities.filter((e) => e.kind === "patio");
  if (!patios.length) return null;
  const dist = (e: MapEntity) => Math.hypot(e.x + e.w / 2 - near[0], e.y + e.d / 2 - near[1]);
  const p = patios.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  const inset = Math.min(1.5, p.w / 4, p.d / 4);
  const [x, y] = onLot(p, p.x + inset + rand() * (p.w - 2 * inset), p.y + inset + rand() * (p.d - 2 * inset));
  return [x, y, p.z + p.h];
}

/** Somewhere in the yard to go and sniff: open ground, not too far from the door. */
export function patrolSpot(entities: MapEntity[], site: { width: number; depth: number }, home: Vec2, rand: () => number, range = 45): Vec2 {
  let best: Vec2 | null = null;
  for (let i = 0; i < 20; i++) {
    const p = catSpot(entities, site, rand);
    if (Math.hypot(p[0] - home[0], p[1] - home[1]) <= range) return p;
    if (!best || Math.hypot(p[0] - home[0], p[1] - home[1]) < Math.hypot(best[0] - home[0], best[1] - home[1])) best = p;
  }
  return best!;
}

/** Keeps a point inside the lot, `margin` feet from its edges (the dog stops at the fence). */
export const insideLot = (site: { width: number; depth: number }, [x, y]: Vec2, margin = 1.5): Vec2 => [
  Math.max(margin, Math.min(site.width - margin, x)),
  Math.max(margin, Math.min(site.depth - margin, y)),
];
