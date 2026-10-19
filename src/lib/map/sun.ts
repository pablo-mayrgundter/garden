// The sun over the garden, and the shadows it casts. Pure functions, no DOM.
//
// Sun position uses the standard low-precision solar formulas (good to a
// fraction of a degree, plenty for shadows). Shadows are cast straight onto the
// ground: each solid's footprint and top are pushed away from the sun by
// height / tan(altitude), and the shadow is the outline around both.

import { footprintCorners, turn, type Vec2 } from "./geometry.ts";
import type { MapEntity, Site } from "./model.ts";

export type SunPosition = {
  /** Degrees above the horizon (negative at night). */
  altitude: number;
  /** Compass bearing to the sun, degrees clockwise from true north. */
  azimuth: number;
};

const RAD = Math.PI / 180;

export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
  const d = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const H = (gmst * 15 + lon) * RAD - ra; // hour angle
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // Measured from south toward west, then turned to a bearing from north.
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD + 180;
  return { altitude: alt / RAD, azimuth: ((az % 360) + 360) % 360 };
}

/**
 * Where the garden is. Until it's set, a rough guess from the time zone offset
 * (15° of longitude per hour) at a mid-northern latitude: the sun rises, peaks
 * and sets about right, and the shadows lean the right way.
 */
export function gardenLocation(site: Pick<Site, "lat" | "lon">, date = new Date()): { lat: number; lon: number; approximate: boolean } {
  if (site.lat != null && site.lon != null) return { lat: site.lat, lon: site.lon, approximate: false };
  // The standard (not daylight saving) offset: the larger of January's and July's.
  const y = date.getFullYear();
  const standard = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
  return { lat: 40, lon: -standard / 4, approximate: true };
}

/** The ground direction toward the sun, as a unit vector in world (plan) coordinates: x east-ish, y south-ish. */
export function sunGroundDirection(sun: SunPosition, northDeg: number): Vec2 {
  const bearing = (sun.azimuth + northDeg) * RAD; // where the sun is, as a bearing on the plan
  return [Math.sin(bearing), -Math.cos(bearing)];
}

/** How far (ft) a shadow reaches per foot of height, capped for a sun at the horizon. */
export function shadowReach(sun: SunPosition, cap = 12): number {
  if (sun.altitude <= 0) return 0;
  return Math.min(cap, 1 / Math.tan(sun.altitude * RAD));
}

export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** How a kind casts its shadow: most are boxes; trees are a canopy on a trunk; buildings add their roof. */
export type ShadowShape = "box" | "canopy" | "roof" | "none";

export function shadowShape(kind: string, flat: boolean | undefined): ShadowShape {
  if (flat || kind === "area") return "none";
  if (kind === "tree" || kind === "fruit-tree" || kind === "shrub") return "canopy";
  if (kind === "house" || kind === "shed") return "roof";
  return "box";
}

const TRUNK: Record<string, number> = { tree: 0.4, "fruit-tree": 0.35, shrub: 0 };

/** The shadow an entity casts on the ground, as a polygon in world feet, or null if it casts none. */
export function entityShadow(e: MapEntity, shape: ShadowShape, sun: SunPosition, northDeg: number): Vec2[] | null {
  if (shape === "none" || sun.altitude <= 0) return null;
  const top = e.z + e.h + (shape === "roof" ? Number(e.props.roofRise ?? 0) : 0);
  if (top < 0.25) return null;
  const [ux, uy] = sunGroundDirection(sun, northDeg);
  const reach = shadowReach(sun);
  const push = (x: number, y: number, z: number): Vec2 => [x - ux * z * reach, y - uy * z * reach];
  if (shape === "canopy") {
    // The canopy as a cylinder from the top of the trunk to the top of the tree, plus the trunk's line.
    const cx = e.x + e.w / 2;
    const cy = e.y + e.d / 2;
    const r = Math.min(e.w, e.d) / 2;
    const base = e.h * (TRUNK[e.kind] ?? 0.3);
    const ring = (z: number) => Array.from({ length: 20 }, (_, i): Vec2 => push(cx + Math.cos((i / 20) * 2 * Math.PI) * r, cy + Math.sin((i / 20) * 2 * Math.PI) * r, z));
    return convexHull([...ring(base + (e.h - base) * 0.15), ...ring(e.h * 0.92), push(cx, cy, 0)]);
  }
  const corners = footprintCorners(e);
  if (shape === "roof") {
    // Walls, then the ridge along the long side (the roof's overhang is small enough to leave out).
    const cx = e.x + e.w / 2;
    const cy = e.y + e.d / 2;
    const ends: Vec2[] = e.w >= e.d ? [[-e.w / 2, 0], [e.w / 2, 0]] : [[0, -e.d / 2], [0, e.d / 2]];
    const ridge = ends.map(([dx, dy]): Vec2 => {
      const [tx, ty] = turn(dx, dy, e.rot ?? 0);
      return [cx + tx, cy + ty];
    });
    return convexHull([...corners, ...corners.map(([x, y]) => push(x, y, e.z + e.h)), ...ridge.map(([x, y]) => push(x, y, top))]);
  }
  return convexHull([...corners.map(([x, y]) => push(x, y, e.z)), ...corners.map(([x, y]) => push(x, y, top))]);
}

/** "from the SW", for a bearing to the sun. */
export function sunFrom(azimuth: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round((((azimuth % 360) + 360) % 360) / 45) % 8];
}
