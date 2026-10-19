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
