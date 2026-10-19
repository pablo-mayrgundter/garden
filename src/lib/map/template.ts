// A starting layout for a typical suburban lot, so the map isn't blank: house in
// the middle, back yard with patio, fence and raised beds, a side yard with the
// house's water and power hookups, and a front yard. Everything is editable.

import { kindDef } from "./kinds.ts";
import { DEFAULT_SITE, type MapEntity, type Site } from "./model.ts";

type Seed = Partial<MapEntity> & { kind: string; x: number; y: number };

const T: Seed[] = [
  // Areas
  { kind: "area", name: "Back yard", x: 0, y: 0, w: 60, d: 48 },
  { kind: "area", name: "Side yard (water & power)", x: 48, y: 48, w: 12, d: 32 },
  { kind: "area", name: "Front yard", x: 0, y: 80, w: 60, d: 50 },
  // Ground
  { kind: "lawn", name: "Back lawn", x: 0, y: 0, w: 60, d: 48 },
  { kind: "lawn", name: "Front lawn", x: 0, y: 80, w: 46, d: 50 },
  { kind: "patio", name: "Patio", x: 14, y: 37, w: 22, d: 11 },
  { kind: "path", name: "Stepping stones", x: 50, y: 12, w: 3, d: 30, props: { surface: "stepping" } },
  { kind: "path", name: "Front walk", x: 24, y: 80, w: 4, d: 50, props: { surface: "pavers" } },
  { kind: "driveway", name: "Driveway", x: 46, y: 80, w: 14, d: 50 },
  { kind: "mulch", name: "Front bed", x: 8, y: 80, w: 16, d: 3 },
  // Structures
  { kind: "house", name: "House", x: 8, y: 48, w: 40, d: 32 },
  { kind: "fence", name: "Back fence", x: 0, y: 0, w: 60, d: 0.3 },
  { kind: "fence", name: "West fence", x: 0, y: 0, w: 0.3, d: 80 },
  { kind: "fence", name: "East fence", x: 59.7, y: 0, w: 0.3, d: 76 },
  { kind: "gate", name: "Side gate", x: 48, y: 76, w: 12, d: 0.3, h: 6 },
  // Growing
  { kind: "raised-bed", name: "Bed 1", x: 8, y: 10, w: 8, d: 4 },
  { kind: "raised-bed", name: "Bed 2", x: 18, y: 10, w: 8, d: 4 },
  { kind: "raised-bed", name: "Bed 3", x: 31, y: 9, w: 8, d: 4 },
  { kind: "tree", name: "Tree", x: 0.5, y: 13, w: 12, d: 12, h: 18 },
  { kind: "shrub", name: "Big shrub", x: 38, y: 5, w: 10, d: 10, h: 12 },
  { kind: "seed-station", name: "Seed station", x: 31, y: 41, w: 4, d: 2 },
  // Water & power on the house's east wall
  { kind: "spigot", name: "Spigot", x: 47.7, y: 58 },
  { kind: "outlet", name: "Outlet", x: 47.7, y: 64 },
  { kind: "meter", name: "Meter", x: 47.4, y: 72 },
  { kind: "ac-unit", name: "AC unit", x: 49, y: 51 },
];

export function siteTemplate(now: string, newId: () => string): { site: Site; entities: MapEntity[] } {
  const entities = T.map((t): MapEntity => {
    const def = kindDef(t.kind).defaults;
    return {
      id: newId(),
      kind: t.kind,
      name: t.name ?? def.name,
      x: t.x,
      y: t.y,
      w: t.w ?? def.w,
      d: t.d ?? def.d,
      h: t.h ?? def.h,
      z: t.z ?? def.z ?? 0,
      props: { ...(def.props ?? {}), ...(t.props ?? {}) },
      links: {},
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
  });
  return { site: { ...DEFAULT_SITE }, entities };
}
