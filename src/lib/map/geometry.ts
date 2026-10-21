// Projection and hit-math for the garden map. Pure functions, no DOM.
//
// World space: feet, x east, y south, z up (see model.ts). The view can turn the
// scene in quarter turns about the lot's center and draw it either isometric
// (2:1 dimetric, like an illustrated garden plan) or as a flat top-down plan.
// "Scene" coordinates are world feet after rotation and projection, before the
// zoom and pan that the SVG applies as one transform, so panning never redraws.

import type { MapEntity, Site } from "./model.ts";

export type ViewMode = "iso" | "plan";
export type Rot = 0 | 1 | 2 | 3;
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;
/** Vertical scale in the isometric view (true isometric foreshortening). */
const Z_SCALE = 0.82;

export type Projector = {
  mode: ViewMode;
  rot: Rot;
  site: Site;
  /** World point → rotated, center-relative ground coordinates. */
  toR: (x: number, y: number) => Vec2;
  /** Rotated coordinates → world point. */
  fromR: (rx: number, ry: number) => Vec2;
  /** Rotated coordinates (+ height) → scene. */
  pr: (rx: number, ry: number, z?: number) => Vec2;
  /** World point (+ height) → scene. */
  p: (x: number, y: number, z?: number) => Vec2;
  /** Scene point → the world point on the ground (z = 0) under it. */
  unproject: (sx: number, sy: number) => Vec2;
  /** Painter's-order key for a world point: larger is nearer the viewer. */
  depth: (x: number, y: number, z?: number) => number;
};

export function makeProjector(mode: ViewMode, rot: Rot, site: Site): Projector {
  const ox = site.width / 2;
  const oy = site.depth / 2;
  const toR = (x: number, y: number): Vec2 => {
    let dx = x - ox;
    let dy = y - oy;
    for (let i = 0; i < rot; i++) [dx, dy] = [-dy, dx];
    return [dx, dy];
  };
  const fromR = (rx: number, ry: number): Vec2 => {
    let dx = rx;
    let dy = ry;
    for (let i = 0; i < rot; i++) [dx, dy] = [dy, -dx];
    return [dx + ox, dy + oy];
  };
  const pr = (rx: number, ry: number, z = 0): Vec2 => (mode === "iso" ? [(rx - ry) * COS30, (rx + ry) * SIN30 - z * Z_SCALE] : [rx, ry]);
  const p = (x: number, y: number, z = 0) => {
    const [rx, ry] = toR(x, y);
    return pr(rx, ry, z);
  };
  const unproject = (sx: number, sy: number): Vec2 => {
    if (mode === "plan") return fromR(sx, sy);
    const a = sx / COS30; // rx - ry
    const b = sy / SIN30; // rx + ry
    return fromR((a + b) / 2, (b - a) / 2);
  };
  const depth = (x: number, y: number, z = 0) => {
    const [rx, ry] = toR(x, y);
    return mode === "iso" ? rx + ry + z * 0.001 : z;
  };
  return { mode, rot, site, toR, fromR, pr, p, unproject, depth };
}

/** Where on the ground a screen movement of (dsx, dsy) scene units goes. */
export function unprojectDelta(pj: Projector, dsx: number, dsy: number): Vec2 {
  const [ax, ay] = pj.unproject(dsx, dsy);
  const [bx, by] = pj.unproject(0, 0);
  return [ax - bx, ay - by];
}

export const snap = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);

/** Drawing order for a whole entity: ground covers first, then by nearness. */
export function entityDepth(pj: Projector, e: Pick<MapEntity, "x" | "y" | "w" | "d" | "z">): number {
  return pj.depth(e.x + e.w / 2, e.y + e.d / 2, e.z);
}

/** Scene-space bounding box of the lot, for fitting it to the screen. */
export function siteBounds(pj: Projector): { minX: number; minY: number; maxX: number; maxY: number } {
  const { width: W, depth: D } = pj.site;
  const pts = [pj.p(0, 0), pj.p(W, 0), pj.p(W, D), pj.p(0, D), pj.p(0, 0, 25), pj.p(W, 0, 25), pj.p(W, D, 25), pj.p(0, D, 25)];
  return {
    minX: Math.min(...pts.map((q) => q[0])),
    minY: Math.min(...pts.map((q) => q[1])),
    maxX: Math.max(...pts.map((q) => q[0])),
    maxY: Math.max(...pts.map((q) => q[1])),
  };
}

/** A face of a solid in world space, drawn as a projected polygon. */
export type Face = { pts: Vec3[]; fill: string; stroke?: string; opacity?: number; top?: boolean };

/** The visible faces of a box (no bottom), shaded by which way each side faces. */
export function boxFaces(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  fill: { top: string; sideX: string; sideY: string },
): Face[] {
  return [
    { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], fill: fill.top, top: true },
    { pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], fill: fill.sideY },
    { pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], fill: fill.sideY },
    { pts: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], fill: fill.sideX },
    { pts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], fill: fill.sideX },
  ];
}

/** Faces to draw, back to front; the plan view shows only upward faces. */
export function orderFaces(pj: Projector, faces: Face[]): Face[] {
  const visible = pj.mode === "plan" ? faces.filter((f) => f.top) : faces;
  const key = (f: Face) => {
    const n = f.pts.length;
    const c = f.pts.reduce((a, q) => [a[0] + q[0] / n, a[1] + q[1] / n, a[2] + q[2] / n], [0, 0, 0]);
    // In plan, higher faces draw last; in iso, nearer faces draw last, tops after the sides behind them.
    return pj.mode === "plan" ? c[2] : pj.depth(c[0], c[1]) + (f.top ? 0.01 : 0);
  };
  return [...visible].sort((a, b) => key(a) - key(b));
}

export function pathOf(pj: Projector, pts: Vec3[]): string {
  return pts.map((q, i) => `${i ? "L" : "M"}${pj.p(q[0], q[1], q[2]).map((v) => v.toFixed(3)).join(" ")}`).join(" ") + " Z";
}

/** Whether a world ground point is inside an entity's footprint. */
export function contains(e: Pick<MapEntity, "x" | "y" | "w" | "d">, x: number, y: number): boolean {
  return x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.d;
}

type Footprint = Pick<MapEntity, "x" | "y" | "w" | "d">;

const overlaps = (a: Footprint, b: Footprint) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d;

/**
 * The top-left corner for a w × d footprint as near as possible to (cx, cy)
 * without overlapping anything in `taken`, searching outward ring by ring.
 */
export function freeSpot(taken: Footprint[], site: Site, cx: number, cy: number, w: number, d: number, step = 1): { x: number; y: number } {
  const fits = (x: number, y: number) => x >= 0 && y >= 0 && x + w <= site.width && y + d <= site.depth && !taken.some((t) => overlaps({ x, y, w, d }, t));
  const x0 = Math.round(cx - w / 2);
  const y0 = Math.round(cy - d / 2);
  const max = Math.ceil(Math.max(site.width, site.depth) / step);
  for (let r = 0; r <= max; r++) {
    // Within a ring, try the middle of each side first: those spots are nearest.
    for (let k = 0; k <= 2 * r; k++) {
      const i = k % 2 ? (k + 1) / 2 : -k / 2;
      for (const [dx, dy] of [[i, -r], [i, r], [-r, i], [r, i]]) {
        const x = x0 + dx * step;
        const y = y0 + dy * step;
        if (fits(x, y)) return { x, y };
      }
    }
  }
  return { x: Math.max(0, x0), y: Math.max(0, y0) };
}

// ---------- Turned entities ----------

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Turns a ground offset (dx, dy) by `deg` clockwise on the plan. */
export function turn(dx: number, dy: number, deg: number): Vec2 {
  if (!deg) return [dx, dy];
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [dx * c - dy * s, dx * s + dy * c];
}

/**
 * A projector for drawing one entity: its points are given as if the entity
 * weren't turned, and are turned about its center before projecting. Drawers
 * don't need to know about rotation at all.
 */
export function entityProjector(pj: Projector, e: Pick<MapEntity, "x" | "y" | "w" | "d" | "rot">): Projector {
  if (!e.rot) return pj;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.d / 2;
  const world = (x: number, y: number): Vec2 => {
    const [dx, dy] = turn(x - cx, y - cy, e.rot!);
    return [cx + dx, cy + dy];
  };
  return {
    ...pj,
    toR: (x, y) => pj.toR(...world(x, y)),
    p: (x, y, z = 0) => pj.p(...world(x, y), z),
    depth: (x, y, z = 0) => pj.depth(...world(x, y), z),
  };
}

/** The four ground corners of an entity's footprint, turned: NW, NE, SE, SW before turning. */
export function footprintCorners(e: Pick<MapEntity, "x" | "y" | "w" | "d" | "rot">): Vec2[] {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.d / 2;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const [dx, dy] = turn((sx * e.w) / 2, (sy * e.d) / 2, e.rot ?? 0);
    return [cx + dx, cy + dy];
  });
}

/** The square-to-the-lot box around a (possibly turned) footprint. */
export function footprintBounds(e: Pick<MapEntity, "x" | "y" | "w" | "d" | "rot">): Pick<MapEntity, "x" | "y" | "w" | "d"> {
  if (!e.rot) return { x: e.x, y: e.y, w: e.w, d: e.d };
  const pts = footprintCorners(e);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Resizing by dragging the (turned) south-east corner by a ground offset: the
 * opposite corner stays where it is, however the entity is turned.
 */
export function resizeFromCorner(
  e: Pick<MapEntity, "x" | "y" | "w" | "d" | "rot">,
  dx: number,
  dy: number,
  round: (v: number) => number = (v) => v,
  min = 0.25,
): Pick<MapEntity, "x" | "y" | "w" | "d"> {
  const rot = e.rot ?? 0;
  const [lx, ly] = turn(dx, dy, -rot);
  const w = Math.max(min, round(e.w + lx));
  const d = Math.max(min, round(e.d + ly));
  const [ax, ay] = footprintCorners(e)[0];
  const [ox, oy] = turn(w / 2, d / 2, rot);
  return { x: ax + ox - w / 2, y: ay + oy - d / 2, w, d };
}

/** The two ends of a run (a drip line, a fence) along its long side, on the lot: start (west or north end before turning), then end. */
export function lineEnds(e: Pick<MapEntity, "x" | "y" | "w" | "d" | "rot">): [Vec2, Vec2] {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.d / 2;
  const half = (e.w >= e.d ? [e.w / 2, 0] : [0, e.d / 2]) as Vec2;
  const [dx, dy] = turn(half[0], half[1], e.rot ?? 0);
  return [
    [cx - dx, cy - dy],
    [cx + dx, cy + dy],
  ];
}

/** A run from one end to the other, `thickness` feet wide: running along x, turned to point from a to b. */
export function lineFromEnds(a: Vec2, b: Vec2, thickness: number, minLength = 0.5): Pick<MapEntity, "x" | "y" | "w" | "d" | "rot"> {
  const len = Math.max(minLength, Math.hypot(b[0] - a[0], b[1] - a[1]));
  const rot = Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9 ? 0 : (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const [cx, cy] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return { x: cx - len / 2, y: cy - thickness / 2, w: len, d: thickness, rot: Math.round(rot * 100) / 100 };
}

/** Degrees, normalized to (-180, 180]. */
export function normDeg(deg: number): number {
  const v = ((deg % 360) + 360) % 360;
  return v > 180 ? v - 360 : v;
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compassPoint = (bearing: number) => POINTS[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];

/**
 * Which way an entity's long side runs, as a true-north bearing in [0, 180)
 * (rows run both ways). `northDeg` is how far true north is turned clockwise
 * from the top of the plan.
 */
export function longSideBearing(e: Pick<MapEntity, "w" | "d" | "rot">, northDeg: number): number {
  const onPlan = (e.w >= e.d ? 90 : 180) + (e.rot ?? 0);
  return (((onPlan - northDeg) % 180) + 180) % 180;
}

/** The turn that makes an entity's long side run along a true-north bearing. */
export function rotForBearing(e: Pick<MapEntity, "w" | "d">, bearing: number, northDeg: number): number {
  return normDeg(bearing + northDeg - (e.w >= e.d ? 90 : 180));
}

// ---------- Drawing order ----------

type Solid = Pick<MapEntity, "x" | "y" | "w" | "d" | "z" | "h" | "rot">;

/**
 * Back-to-front order for solid entities. In the isometric view one thing is
 * drawn before another when its footprint lies wholly behind the other's along
 * either ground axis (as the view sees them), so a long fence along the front
 * covers the beds behind it even though its middle is far away. Things whose
 * footprints overlap (netting over a bed, a tree over a bed) fall back to the
 * depth of their centers. The plan view draws lowest tops first.
 */
export function paintOrder<T extends Solid>(pj: Projector, items: T[]): T[] {
  if (pj.mode === "plan") return [...items].sort((a, b) => a.z + a.h - (b.z + b.h));
  const eps = 1e-6;
  const info = items.map((e) => {
    const corners = footprintCorners(e);
    const r = corners.map(([x, y]) => pj.toR(x, y));
    const s = [...corners.map(([x, y]) => pj.p(x, y, e.z)), ...corners.map(([x, y]) => pj.p(x, y, e.z + e.h))];
    return {
      rx0: Math.min(...r.map((q) => q[0])),
      rx1: Math.max(...r.map((q) => q[0])),
      ry0: Math.min(...r.map((q) => q[1])),
      ry1: Math.max(...r.map((q) => q[1])),
      sx0: Math.min(...s.map((q) => q[0])),
      sx1: Math.max(...s.map((q) => q[0])),
      sy0: Math.min(...s.map((q) => q[1])),
      sy1: Math.max(...s.map((q) => q[1])),
      depth: pj.depth(e.x + e.w / 2, e.y + e.d / 2, e.z),
    };
  });
  const behind = (a: (typeof info)[number], b: (typeof info)[number]) => a.rx1 <= b.rx0 + eps || a.ry1 <= b.ry0 + eps;
  // For each item, the items that must be drawn before it. Only things that overlap on screen matter.
  const first: number[][] = items.map(() => []);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = info[i];
      const b = info[j];
      if (a.sx1 <= b.sx0 || b.sx1 <= a.sx0 || a.sy1 <= b.sy0 || b.sy1 <= a.sy0) continue;
      const ab = behind(a, b);
      const ba = behind(b, a);
      if (ab !== ba) (ab ? first[j] : first[i]).push(ab ? i : j);
      else (a.depth <= b.depth ? first[j] : first[i]).push(a.depth <= b.depth ? i : j);
    }
  }
  // Depth-first topological sort, visiting nearer-last so ties keep the old order; a cycle is just broken.
  const order: T[] = [];
  const state = new Uint8Array(items.length); // 0 new, 1 visiting, 2 done
  const visit = (i: number) => {
    if (state[i]) return;
    state[i] = 1;
    for (const k of [...first[i]].sort((x, y) => info[x].depth - info[y].depth)) visit(k);
    state[i] = 2;
    order.push(items[i]);
  };
  for (const i of items.map((_, k) => k).sort((x, y) => info[x].depth - info[y].depth)) visit(i);
  return order;
}

/** A rounded rectangle's outline at height z, inset from the entity's footprint. */
export function roundedRect(e: Pick<MapEntity, "x" | "y" | "w" | "d">, radius: number, z: number, inset = 0, steps = 6): Vec3[] {
  const x0 = e.x + inset, y0 = e.y + inset, x1 = e.x + e.w - inset, y1 = e.y + e.d - inset;
  const r = Math.max(0, Math.min(radius - inset, (x1 - x0) / 2, (y1 - y0) / 2));
  const corners: [number, number, number][] = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
  const pts: Vec3[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = ((start + (90 * i) / steps) * Math.PI) / 180;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
    }
  }
  return pts;
}
