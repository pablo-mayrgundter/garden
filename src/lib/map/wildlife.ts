// Who visits the garden, and what draws them. Pure data and functions: the
// animation (src/components/Critters.tsx) asks this module where visitors can
// land, and how strongly each thing on the map attracts each kind of visitor.
//
// Today: songbirds perch in trees, shrubs, hedges and on fence tops;
// butterflies and hummingbirds come to beds with flowering plants (matched by
// name in the seed library); cats find open ground; squirrels forage under
// trees and run up them. The household's own dog lives in pets.ts. To make a plant attract
// someone, add it to the lists below, or give its seed library entry a
// category of "flower".

import { kindDef, treeTrunk } from "./kinds.ts";
import { footprintBounds, turn, type Vec3 } from "./geometry.ts";
import type { MapEntity } from "./model.ts";
import type { Sky } from "../weather/forecast.ts";
import type { GardenData } from "../types.ts";

export type VisitorKind = "songbird" | "hummingbird" | "butterfly" | "cat" | "squirrel";

export type VisitorDef = {
  label: string;
  /** Most at once. */
  max: number;
  /** Chance per second of a new one arriving, when there's room and something draws them. */
  rate: number;
  /** Lowest sun altitude they're about at (degrees); cats keep their own hours. */
  minSun: number;
  /** Weather they come out in. */
  skies: Sky[];
};

export const VISITORS: Record<VisitorKind, VisitorDef> = {
  songbird: { label: "Songbird", max: 6, rate: 0.25, minSun: -4, skies: ["sun", "cloud", "rain", "snow"] },
  hummingbird: { label: "Hummingbird", max: 1, rate: 0.04, minSun: 5, skies: ["sun", "cloud"] },
  butterfly: { label: "Butterfly", max: 3, rate: 0.08, minSun: 12, skies: ["sun", "cloud"] },
  cat: { label: "Cat", max: 2, rate: 0.012, minSun: -90, skies: ["sun", "cloud"] },
  squirrel: { label: "Squirrel", max: 2, rate: 0.02, minSun: 0, skies: ["sun", "cloud"] },
};

/** Fewer songbirds out in rain and snow. */
export const WEATHER_FACTOR: Record<Sky, number> = { sun: 1, cloud: 0.8, rain: 0.25, snow: 0.4 };

/** Plants whose flowers draw butterflies (by common name). */
export const BUTTERFLY_PLANTS =
  /lavender|salvia|sage|zinnia|cosmos|sunflower|marigold|calendula|nasturtium|borage|bee ?balm|monarda|milkweed|coneflower|echinacea|lantana|verbena|phlox|aster|black.?eyed|rudbeckia|penstemon|butterfly bush|buddleia|yarrow|dill|fennel|parsley|chive|thyme|oregano|mint|catmint|nepeta|basil/i;

/** Plants with the tubular, nectar-rich flowers hummingbirds favor. */
export const HUMMINGBIRD_PLANTS = /salvia|sage|bee ?balm|monarda|penstemon|columbine|fuchsia|honeysuckle|trumpet|lantana|zinnia|petunia|cardinal flower|agastache|hyssop|lavender|nasturtium|cuphea|lupine|foxglove/i;

/** A point in the world (feet) an entity's own frame point turns to. */
function worldPoint(e: Pick<MapEntity, "x" | "y" | "w" | "d" | "rot">, lx: number, ly: number): [number, number] {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.d / 2;
  const [dx, dy] = turn(lx - cx, ly - cy, e.rot ?? 0);
  return [cx + dx, cy + dy];
}

export type Attractor = {
  entityId: string;
  visitor: Exclude<VisitorKind, "cat">;
  weight: number;
  /** A spot to land, hover or flutter at, from a random number source. */
  spot: (rand: () => number) => Vec3;
};

/** What flowers in a bed: the seed library entries planted in its planter. */
function bedFlowers(e: MapEntity, data: GardenData): { butterfly: number; hummingbird: number } {
  const trayId = e.links.trayId;
  const species = trayId ? data.plantings.filter((p) => p.trayId === trayId && !["planned", "failed", "done"].includes(p.status)).map((p) => data.species.find((s) => s.id === p.speciesId)) : [];
  let butterfly = 0;
  let hummingbird = 0;
  for (const s of species) {
    if (!s) continue;
    const name = `${s.commonName} ${s.variety ?? ""}`;
    if (s.category === "flower" || BUTTERFLY_PLANTS.test(name)) butterfly++;
    if (HUMMINGBIRD_PLANTS.test(name)) hummingbird++;
  }
  // An herb garden flowers even before its planter is set up.
  if (e.kind === "herb-garden") butterfly = Math.max(butterfly, 1);
  return { butterfly, hummingbird };
}

export function attractors(entities: MapEntity[], data: GardenData): Attractor[] {
  const out: Attractor[] = [];
  for (const e of entities) {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.d / 2;
    if (e.kind === "tree" || e.kind === "fruit-tree" || e.kind === "shrub") {
      const r = Math.min(e.w, e.d) / 2;
      const base = treeTrunk(e);
      out.push({
        entityId: e.id,
        visitor: "songbird",
        weight: (1 + r / 5) * (e.kind === "fruit-tree" ? 1.5 : 1),
        spot: (rand) => {
          const a = rand() * Math.PI * 2;
          const d = Math.sqrt(rand()) * r * 0.7;
          return [cx + Math.cos(a) * d, cy + Math.sin(a) * d, base + (e.h - base) * (0.55 + rand() * 0.4)];
        },
      });
    } else if (e.kind === "hedge") {
      out.push({
        entityId: e.id,
        visitor: "songbird",
        weight: 0.6,
        spot: (rand) => [...worldPoint(e, e.x + rand() * e.w, e.y + rand() * e.d), e.z + e.h + 0.05],
      });
    } else if (e.kind === "fence" || e.kind === "gate") {
      const alongX = e.w >= e.d;
      out.push({
        entityId: e.id,
        visitor: "songbird",
        weight: 0.25,
        spot: (rand) => [...worldPoint(e, alongX ? e.x + rand() * e.w : cx, alongX ? cy : e.y + rand() * e.d), e.z + e.h + 0.05],
      });
    } else if (["raised-bed", "in-ground-bed", "herb-garden", "container"].includes(e.kind)) {
      const f = bedFlowers(e, data);
      const top = e.z + e.h;
      const spot = (lift: [number, number]) => (rand: () => number): Vec3 => [...worldPoint(e, e.x + (0.1 + rand() * 0.8) * e.w, e.y + (0.1 + rand() * 0.8) * e.d), top + lift[0] + rand() * lift[1]];
      if (f.butterfly) out.push({ entityId: e.id, visitor: "butterfly", weight: f.butterfly, spot: spot([0.4, 1.4]) });
      if (f.hummingbird) out.push({ entityId: e.id, visitor: "hummingbird", weight: f.hummingbird, spot: spot([0.8, 1]) });
    }
  }
  return out;
}

/** A tree a squirrel can run up: where its trunk stands, and how high its canopy is. */
export type ClimbTree = { entityId: string; x: number; y: number; trunk: number; crown: number; spread: number };

/** Trees with a clear trunk to climb (shrubs and hedges are too low and thick). */
export function climbTrees(entities: MapEntity[]): ClimbTree[] {
  return entities
    .filter((e) => (e.kind === "tree" || e.kind === "fruit-tree") && treeTrunk(e) >= 2)
    .map((e) => {
      const trunk = treeTrunk(e);
      return { entityId: e.id, x: e.x + e.w / 2, y: e.y + e.d / 2, trunk, crown: e.z + trunk + (e.h - trunk) * 0.35, spread: Math.min(e.w, e.d) / 2 };
    });
}

/** The nearest tree to (x, y) within `max` feet. */
export function nearestTree(trees: ClimbTree[], x: number, y: number, max = Infinity): ClimbTree | null {
  let best: ClimbTree | null = null;
  let bestD = max;
  for (const t of trees) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= bestD) [best, bestD] = [t, d];
  }
  return best;
}

/** Picks an attractor for a visitor, weighted. */
export function pickAttractor(list: Attractor[], visitor: Attractor["visitor"], rand: () => number, exclude?: string): Attractor | null {
  const options = list.filter((a) => a.visitor === visitor && a.entityId !== exclude);
  const total = options.reduce((t, a) => t + a.weight, 0);
  let r = rand() * total;
  for (const a of options) if ((r -= a.weight) <= 0) return a;
  return options.at(-1) ?? null;
}

/** Open ground for a cat to sit: on a lawn, patio, path or mulch, clear of anything standing. */
export function catSpot(entities: MapEntity[], site: { width: number; depth: number }, rand: () => number): [number, number] {
  const solids = entities.filter((e) => !kindDef(e.kind).flat || e.kind === "pool").map(footprintBounds);
  const ground = entities.filter((e) => ["lawn", "patio", "path", "mulch"].includes(e.kind));
  const clear = (x: number, y: number) => !solids.some((b) => x > b.x - 1 && x < b.x + b.w + 1 && y > b.y - 1 && y < b.y + b.d + 1);
  for (let i = 0; i < 60; i++) {
    const g = ground.length ? ground[Math.floor(rand() * ground.length)] : null;
    const [x, y] = g ? worldPoint(g, g.x + rand() * g.w, g.y + rand() * g.d) : [rand() * site.width, rand() * site.depth];
    if (x > 1 && y > 1 && x < site.width - 1 && y < site.depth - 1 && clear(x, y)) return [x, y];
  }
  return [site.width / 2, site.depth / 2];
}

/** A point just outside the lot's edge nearest to (x, y), where visitors come and go. */
export function edgePoint(site: { width: number; depth: number }, x: number, y: number, rand: () => number, out = 6): [number, number] {
  const d = [x, site.width - x, y, site.depth - y];
  const side = d.indexOf(Math.min(...d));
  const jitter = (rand() - 0.5) * 20;
  if (side === 0) return [-out, y + jitter];
  if (side === 1) return [site.width + out, y + jitter];
  if (side === 2) return [x + jitter, -out];
  return [x + jitter, site.depth + out];
}

export type CatCoat = { name: string; base: string; patch?: string; stripes?: string; belly?: string };

/** The neighborhood cats. Each visit is one of them. */
export const CATS: CatCoat[] = [
  { name: "Mochi", base: "#f4efe6", patch: "#e8a15c", belly: "#fffaf2" },
  { name: "Pepper", base: "#2b2b2e", belly: "#3a3a3f" },
  { name: "Marmalade", base: "#e59a4f", stripes: "#c4732b", belly: "#f6d2a8" },
  { name: "Tux", base: "#26262a", belly: "#f7f4ee" },
  { name: "Calico", base: "#f6f0e4", patch: "#e08a3a", stripes: "#2f2b2b" },
  { name: "Smokey", base: "#8e9298", stripes: "#6c7076", belly: "#b8bcc1" },
  { name: "Biscuit", base: "#d9b48a", stripes: "#b38b5f", belly: "#efdcc4" },
  { name: "Snowball", base: "#fbfaf7", belly: "#ffffff" },
];

/** Songbird plumage: body, wing, breast. */
export const BIRDS = [
  { name: "Cardinal", body: "#c0392b", wing: "#962d22", breast: "#d64535" },
  { name: "Blue jay", body: "#3b6fb6", wing: "#2a5490", breast: "#e8eef5" },
  { name: "Sparrow", body: "#8b6b4a", wing: "#6b4f35", breast: "#d9c7ad" },
  { name: "Goldfinch", body: "#e3b505", wing: "#2b2b2b", breast: "#f2d24a" },
  { name: "Robin", body: "#6b6a6a", wing: "#4e4d4d", breast: "#d9733a" },
  { name: "Chickadee", body: "#9aa0a6", wing: "#6f757b", breast: "#efe9df" },
];

/** Squirrel coats: body, belly, tail. */
export const SQUIRRELS = [
  { name: "Gray squirrel", body: "#8d8f93", belly: "#ebe6dd", tail: "#a7a9ad" },
  { name: "Fox squirrel", body: "#a8683a", belly: "#e7b98c", tail: "#c58a55" },
];

export const BUTTERFLIES = [
  { name: "Monarch", wing: "#e67e22", edge: "#2b2b2b" },
  { name: "Cabbage white", wing: "#f7f5ee", edge: "#9a9a9a" },
  { name: "Swallowtail", wing: "#f2d24a", edge: "#2b2b2b" },
  { name: "Blue", wing: "#7fa8e0", edge: "#3d5f91" },
];
