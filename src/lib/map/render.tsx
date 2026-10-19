// How each kind of map entity is drawn: shaded line art in the spirit of an
// illustrated garden plan. Drawers work in world feet and project through the
// view's Projector, so the same code draws the isometric and plan views and
// every rotation. Kinds without a drawer here draw as a plain box.

import type { ReactNode } from "react";
import { layoutBed } from "../bedLayout.ts";
import { plantStates } from "../garden.ts";
import { speciesColor } from "../plantColors.ts";
import type { GardenData, Planting } from "../types.ts";
import { boxFaces, entityProjector, orderFaces, pathOf, type Face, type Projector, type Vec3 } from "./geometry.ts";
import type { MapEntity } from "./model.ts";

export const PAL = {
  ink: "#4a3a28",
  paper: "#f3ead6",
  grass: "#dfe0b4",
  soil: "#9a7552",
  wood: "#c9a679",
  woodSide: "#b48f5c",
  woodSide2: "#a07c4d",
  concrete: "#ebe4d4",
  concreteSide: "#d2c8b2",
  wall: "#f1e8d5",
  wallSide: "#dccfb3",
  wallSide2: "#cbbb9a",
  roof: "#b88d64",
  roofDark: "#9c7550",
  foliage: "#a9bd84",
  foliageDark: "#86a064",
  trunk: "#7a5a3c",
  water: "#7fb0cf",
  metal: "#a7adb3",
  metalDark: "#8b9197",
  window: "#a9c0cc",
  plant: "#6f9f4f",
  seed: "#7a5a3c",
  accent: "#2f6fb0",
} as const;

/** Patterns (in scene units, so they scale with zoom like ink on paper). */
export function MapPatterns() {
  return (
    <defs>
      <pattern id="pat-grass" width="1.2" height="1.2" patternUnits="userSpaceOnUse">
        <rect width="1.2" height="1.2" fill={PAL.grass} />
        <path d="M0.2 0.9 l0.08 -0.3 M0.75 0.45 l0.06 -0.28 M0.5 1.15 l0.05 -0.25" stroke="#9aa66a" strokeWidth="0.06" />
      </pattern>
      <pattern id="pat-soil" width="1.3" height="1.1" patternUnits="userSpaceOnUse">
        <rect width="1.3" height="1.1" fill={PAL.soil} />
        <circle cx="0.17" cy="0.23" r="0.022" fill="#8a6748" />
        <circle cx="0.71" cy="0.09" r="0.018" fill="#a8845f" />
        <circle cx="1.02" cy="0.57" r="0.02" fill="#8a6748" />
        <circle cx="0.43" cy="0.81" r="0.017" fill="#a8845f" />
        <circle cx="0.93" cy="0.98" r="0.015" fill="#8a6748" />
        <circle cx="0.29" cy="0.52" r="0.014" fill="#a8845f" />
      </pattern>
      <pattern id="pat-pavers" width="2" height="2" patternUnits="userSpaceOnUse">
        <rect width="2" height="2" fill={PAL.concrete} />
        <path d="M0 0 H2 M0 1 H2 M1 0 V1 M0 1 V2" stroke="#b8ad95" strokeWidth="0.06" />
      </pattern>
      <pattern id="pat-gravel" width="0.8" height="0.8" patternUnits="userSpaceOnUse">
        <rect width="0.8" height="0.8" fill="#e2d8c2" />
        <circle cx="0.2" cy="0.2" r="0.07" fill="#a99a7c" />
        <circle cx="0.6" cy="0.5" r="0.06" fill="#b9ab8e" />
        <circle cx="0.35" cy="0.65" r="0.05" fill="#958668" />
      </pattern>
      <pattern id="pat-mulch" width="0.8" height="0.8" patternUnits="userSpaceOnUse">
        <rect width="0.8" height="0.8" fill="#a77c55" />
        <path d="M0.1 0.2 l0.25 0.08 M0.45 0.55 l0.25 -0.1 M0.2 0.7 l0.15 0.05" stroke="#7c5636" strokeWidth="0.07" />
      </pattern>
      <pattern id="pat-concrete" width="1" height="1" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill={PAL.concrete} />
        <circle cx="0.3" cy="0.4" r="0.03" fill="#c4b9a2" />
        <circle cx="0.75" cy="0.8" r="0.025" fill="#c4b9a2" />
      </pattern>
      <pattern id="pat-planks" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
        <rect width="0.5" height="0.5" fill={PAL.woodSide} />
        <path d="M0 0.25 H0.5" stroke="#8d6b40" strokeWidth="0.04" />
      </pattern>
      <pattern id="pat-boards" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
        <rect width="0.5" height="0.5" fill={PAL.wood} />
        <path d="M0.25 0 V0.5" stroke="#9c7a4c" strokeWidth="0.04" />
      </pattern>
      <pattern id="pat-roof" width="0.8" height="0.8" patternUnits="userSpaceOnUse">
        <rect width="0.8" height="0.8" fill={PAL.roof} />
        <path d="M0 0.4 H0.8 M0.4 0 V0.4 M0 0.4 V0.8" stroke="#8a6644" strokeWidth="0.05" />
      </pattern>
      <pattern id="pat-foliage" width="1" height="1" patternUnits="userSpaceOnUse">
        <rect width="1" height="1" fill={PAL.foliage} />
        <path d="M0.1 0.3 q0.15 -0.2 0.3 0 M0.5 0.8 q0.15 -0.2 0.3 0 M0.55 0.25 q0.12 -0.15 0.24 0" stroke="#6f8a4c" strokeWidth="0.05" fill="none" />
      </pattern>
      <pattern id="pat-net" width="0.4" height="0.4" patternUnits="userSpaceOnUse">
        <path d="M0 0 L0.4 0.4 M0.4 0 L0 0.4" stroke="#6b6b6b" strokeWidth="0.025" />
      </pattern>
    </defs>
  );
}

export type DrawCtx = {
  pj: Projector;
  data: GardenData;
  today: string;
  /** Pixels per scene unit, for things that should keep a constant size on screen. */
  zoom: number;
  /** Real sun shadows are drawn, so drawers skip their own soft ground shadows. */
  sunShadows?: boolean;
};

const ink = { stroke: PAL.ink, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const, strokeLinejoin: "round" as const };

export function Faces({ pj, faces }: { pj: Projector; faces: Face[] }) {
  return (
    <>
      {orderFaces(pj, faces).map((f, i) => (
        <path key={i} d={pathOf(pj, f.pts)} fill={f.fill} opacity={f.opacity} {...ink} stroke={f.stroke ?? PAL.ink} />
      ))}
    </>
  );
}

/** A flat polygon on the ground (or at height z) covering the entity's footprint, inset by `inset` feet. */
function Ground({ e, pj, fill, z = 0, inset = 0, dashed, noStroke }: { e: MapEntity; pj: Projector; fill: string; z?: number; inset?: number; dashed?: boolean; noStroke?: boolean }) {
  const x0 = e.x + inset;
  const y0 = e.y + inset;
  const x1 = e.x + e.w - inset;
  const y1 = e.y + e.d - inset;
  const pts: Vec3[] = [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
  return <path d={pathOf(pj, pts)} fill={fill} {...ink} strokeOpacity={noStroke ? 0 : 0.7} strokeDasharray={dashed ? "6 4" : undefined} />;
}

/** Whether a wall facing world direction (nx, ny) faces the viewer in this view. */
function facesViewer(pj: Projector, nx: number, ny: number): boolean {
  if (pj.mode === "plan") return false;
  // Through the projector, so a turned entity's walls are judged as turned.
  const cx = pj.site.width / 2;
  const cy = pj.site.depth / 2;
  return pj.depth(cx + nx, cy + ny) > pj.depth(cx, cy);
}

function box(e: MapEntity, fill: { top: string; sideX: string; sideY: string }, z0 = e.z, z1 = e.z + e.h): Face[] {
  return boxFaces(e.x, e.y, e.x + e.w, e.y + e.d, z0, z1, fill);
}

const woodFill = { top: PAL.wood, sideX: "url(#pat-planks)", sideY: "url(#pat-planks)" };
const wallFill = { top: PAL.wall, sideX: PAL.wallSide, sideY: PAL.wallSide2 };
const metalFill = { top: PAL.metal, sideX: PAL.metalDark, sideY: PAL.metal };

/** House or shed: walls, windows on the walls facing you, and a gable roof along the long side. */
function Building(e: MapEntity, { pj }: DrawCtx, windows: boolean) {
  const rise = Number(e.props.roofRise ?? 6);
  const h = e.h;
  const o = 0.8; // roof overhang
  const alongX = e.w >= e.d;
  const x0 = e.x - o, x1 = e.x + e.w + o, y0 = e.y - o, y1 = e.y + e.d + o;
  const faces: Face[] = box(e, wallFill).filter((f) => !f.top);
  if (alongX) {
    const ym = e.y + e.d / 2;
    faces.push(
      { pts: [[x0, y0, h], [x1, y0, h], [x1, ym, h + rise], [x0, ym, h + rise]], fill: "url(#pat-roof)", top: true },
      { pts: [[x0, y1, h], [x1, y1, h], [x1, ym, h + rise], [x0, ym, h + rise]], fill: "url(#pat-roof)", top: true },
      { pts: [[e.x, e.y, h], [e.x, e.y + e.d, h], [e.x, ym, h + rise]], fill: PAL.wallSide },
      { pts: [[e.x + e.w, e.y, h], [e.x + e.w, e.y + e.d, h], [e.x + e.w, ym, h + rise]], fill: PAL.wallSide },
    );
  } else {
    const xm = e.x + e.w / 2;
    faces.push(
      { pts: [[x0, y0, h], [x0, y1, h], [xm, y1, h + rise], [xm, y0, h + rise]], fill: "url(#pat-roof)", top: true },
      { pts: [[x1, y0, h], [x1, y1, h], [xm, y1, h + rise], [xm, y0, h + rise]], fill: "url(#pat-roof)", top: true },
      { pts: [[e.x, e.y, h], [e.x + e.w, e.y, h], [xm, e.y, h + rise]], fill: PAL.wallSide2 },
      { pts: [[e.x, e.y + e.d, h], [e.x + e.w, e.y + e.d, h], [xm, e.y + e.d, h + rise]], fill: PAL.wallSide2 },
    );
  }
  const extras: ReactNode[] = [];
  if (windows && pj.mode === "iso") {
    const wins: Face[] = [];
    const along = (len: number) => Array.from({ length: Math.max(0, Math.floor((len - 4) / 8)) }, (_, i) => 4 + i * 8 + ((len - 4) % 8) / 2);
    const winH: [number, number] = [3, Math.min(h - 2, 7)];
    if (facesViewer(pj, 0, 1)) for (const a of along(e.w)) wins.push({ pts: [[e.x + a, e.y + e.d, winH[0]], [e.x + a + 3, e.y + e.d, winH[0]], [e.x + a + 3, e.y + e.d, winH[1]], [e.x + a, e.y + e.d, winH[1]]], fill: PAL.window });
    if (facesViewer(pj, 0, -1)) for (const a of along(e.w)) wins.push({ pts: [[e.x + a, e.y, winH[0]], [e.x + a + 3, e.y, winH[0]], [e.x + a + 3, e.y, winH[1]], [e.x + a, e.y, winH[1]]], fill: PAL.window });
    if (facesViewer(pj, 1, 0)) for (const a of along(e.d)) wins.push({ pts: [[e.x + e.w, e.y + a, winH[0]], [e.x + e.w, e.y + a + 3, winH[0]], [e.x + e.w, e.y + a + 3, winH[1]], [e.x + e.w, e.y + a, winH[1]]], fill: PAL.window });
    if (facesViewer(pj, -1, 0)) for (const a of along(e.d)) wins.push({ pts: [[e.x, e.y + a, winH[0]], [e.x, e.y + a + 3, winH[0]], [e.x, e.y + a + 3, winH[1]], [e.x, e.y + a, winH[1]]], fill: PAL.window });
    extras.push(...wins.map((f, i) => <path key={`w${i}`} d={pathOf(pj, f.pts)} fill={f.fill} {...ink} />));
  }
  // Walls first, then windows on them, then the roof over everything.
  const ordered = orderFaces(pj, faces);
  const walls = ordered.filter((f) => !f.top);
  const roof = ordered.filter((f) => f.top);
  return (
    <>
      <Faces pj={pj} faces={walls} />
      {extras}
      {roof.map((f, i) => <path key={`r${i}`} d={pathOf(pj, f.pts)} fill={f.fill} {...ink} />)}
    </>
  );
}

/** Plants of a planter laid out in a bed, from the same layout as the planter page: rows along the long side. */
export function bedPlants(e: MapEntity, data: GardenData, inset = 0.18): { x: number; y: number; r: number; color: string; stage: number; key: string }[] {
  const tray = e.links.trayId ? data.trays.find((t) => t.id === e.links.trayId) : undefined;
  if (!tray) return [];
  const alongX = e.w >= e.d;
  const size = { length: (alongX ? e.w : e.d) - inset * 2, width: (alongX ? e.d : e.w) - inset * 2 };
  const plantings = data.plantings.filter((x) => x.trayId === tray.id);
  const bed = layoutBed(tray, plantings, size);
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const species = new Map(data.species.map((x) => [x.id, x]));
  const states = new Map(plantings.map((p) => [p.id, p.count ? plantStates(data, p.id, p.count) : []]));
  const stageOf = (p: Planting) => ({ planned: 0.15, sown: 0.3, sprouted: 0.6, growing: 0.85, transplanted: 0.85, harvesting: 1, done: 0.4, failed: 0.2 })[p.status] ?? 0.5;
  const rowGap = size.width / Math.max(1, tray.rows.length);
  const spacing = new Map(bed.rows.flatMap((r) => r.plantings.map((rp) => [rp.planting.id, rp.spacingIn / 12] as const)));
  return bed.spots.map((s) => {
    const p = byId.get(s.plantingId)!;
    const st = states.get(p.id)?.[s.n - 1];
    return {
      key: `${p.id}-${s.n}`,
      x: alongX ? e.x + inset + s.along : e.x + inset + s.across,
      y: alongX ? e.y + inset + s.across : e.y + inset + s.along,
      r: Math.min(spacing.get(p.id) ?? rowGap, rowGap) * 0.42,
      color: st && st.condition !== "healthy" ? CONDITION_TINT[st.condition] : speciesColor(species.get(p.speciesId)),
      stage: stageOf(p),
    };
  });
}

const CONDITION_TINT: Record<string, string> = {
  pests: "#d4572a",
  disease: "#8a5a2b",
  nutrients: "#e0b52d",
  water: "#4d86c4",
  weeds: "#8a9a3a",
  damage: "#9a5bb5",
  missing: "#333333",
  other: "#8a8a8a",
};

function Plants({ e, ctx, z }: { e: MapEntity; ctx: DrawCtx; z: number }) {
  const { pj, data } = ctx;
  const plants = bedPlants(e, data).sort((a, b) => pj.depth(a.x, a.y) - pj.depth(b.x, b.y));
  return (
    <>
      {plants.map((p) => {
        const [sx, sy] = pj.p(p.x, p.y, z);
        const r = Math.max(0.08, p.r * p.stage);
        const lift = pj.mode === "iso" ? r * 0.6 : 0;
        // Planned spots are marked out; sown ones show a seed; once up, a plant that grows with its stage.
        if (p.stage < 0.3)
          return <ellipse key={p.key} cx={sx} cy={sy} rx={p.r * 0.55} ry={p.r * (pj.mode === "iso" ? 0.32 : 0.55)} fill="none" stroke={p.color} strokeWidth={1.25} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />;
        return p.stage <= 0.3 ? (
          <ellipse key={p.key} cx={sx} cy={sy} rx={Math.max(0.07, p.r * 0.3)} ry={Math.max(0.05, p.r * (pj.mode === "iso" ? 0.18 : 0.3))} fill={p.color} stroke="#f3ead6" strokeOpacity={0.6} strokeWidth={0.75} vectorEffect="non-scaling-stroke" />
        ) : (
          <g key={p.key}>
            <ellipse cx={sx} cy={sy - lift} rx={r} ry={pj.mode === "iso" ? r * 0.75 : r} fill={p.color} {...ink} strokeWidth={0.6} />
            <ellipse cx={sx - r * 0.25} cy={sy - lift - r * 0.2} rx={r * 0.35} ry={r * 0.25} fill="#fff" opacity={0.25} />
          </g>
        );
      })}
    </>
  );
}

function Bed(e: MapEntity, ctx: DrawCtx) {
  const { pj } = ctx;
  const t = 0.18; // frame thickness
  const top = e.z + e.h;
  return (
    <>
      <Faces pj={pj} faces={box(e, woodFill)} />
      <Ground e={e} pj={pj} fill="url(#pat-soil)" z={top} inset={t} />
      <Plants e={e} ctx={ctx} z={top} />
    </>
  );
}

function Canopy(e: MapEntity, ctx: DrawCtx, opts: { trunk: number; fruit?: string }) {
  const { pj } = ctx;
  const cx = e.x + e.w / 2;
  const cy = e.y + e.d / 2;
  const rad = Math.min(e.w, e.d) / 2;
  const trunkTop = e.h * opts.trunk;
  const centerZ = pj.mode === "iso" ? trunkTop + (e.h - trunkTop) / 2 : 0;
  const [sx, sy] = pj.p(cx, cy, centerZ);
  const [gx, gy] = pj.p(cx, cy, 0);
  const vr = pj.mode === "iso" ? Math.max((e.h - trunkTop) / 2, rad * 0.6) * 0.85 : rad;
  // Deterministic scallops so a tree looks the same on every render.
  let seed = [...e.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const blobs = Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + rand();
    return { x: sx + Math.cos(a) * rad * 0.45, y: sy + Math.sin(a) * vr * 0.45, r: rad * (0.5 + rand() * 0.15) };
  });
  return (
    <>
      {pj.mode === "iso" && !ctx.sunShadows && <ellipse cx={gx} cy={gy} rx={rad * 0.9} ry={rad * 0.45} fill="#000" opacity={0.08} />}
      {opts.trunk > 0 && pj.mode === "iso" && (
        <path d={`M${gx - 0.25} ${gy} L${gx - 0.2} ${pj.p(cx, cy, trunkTop)[1]} L${gx + 0.2} ${pj.p(cx, cy, trunkTop)[1]} L${gx + 0.25} ${gy} Z`} fill={PAL.trunk} {...ink} />
      )}
      {blobs.map((b, i) => (
        <circle key={i} cx={b.x} cy={b.y} r={b.r} fill={i % 2 ? "url(#pat-foliage)" : PAL.foliageDark} {...ink} />
      ))}
      <circle cx={sx} cy={sy} r={rad * 0.55} fill="url(#pat-foliage)" {...ink} />
      {opts.fruit &&
        Array.from({ length: 9 }, (_, i) => (
          <circle key={`f${i}`} cx={sx + (rand() - 0.5) * rad * 1.3} cy={sy + (rand() - 0.5) * vr * 1.1} r={Math.max(0.15, rad * 0.06)} fill={opts.fruit} {...ink} strokeWidth={0.5} />
        ))}
    </>
  );
}

/** A small thing (outlet, spigot, sensor) with a pin that keeps its size on screen. */
function Pin(e: MapEntity, ctx: DrawCtx, icon: string, fill: { top: string; sideX: string; sideY: string } = metalFill) {
  const { pj, zoom } = ctx;
  const [sx, sy] = pj.p(e.x + e.w / 2, e.y + e.d / 2, e.z + e.h);
  const s = 9 / zoom;
  return (
    <>
      <Faces pj={pj} faces={box(e, fill)} />
      <line x1={sx} y1={sy} x2={sx} y2={sy - s * 1.6} stroke={PAL.ink} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <circle cx={sx} cy={sy - s * 2.4} r={s} fill="#fffaf0" {...ink} />
      <text x={sx} y={sy - s * 2.4} fontSize={s * 1.2} textAnchor="middle" dominantBaseline="central">{icon}</text>
    </>
  );
}

function Fence(e: MapEntity, ctx: DrawCtx) {
  const { pj } = ctx;
  const style = String(e.props.style ?? "privacy");
  const alongX = e.w >= e.d;
  const len = alongX ? e.w : e.d;
  const posts = Math.max(2, Math.round(len / 8) + 1);
  const faces: Face[] = [];
  for (let i = 0; i < posts; i++) {
    const a = (i / (posts - 1)) * (len - 0.35);
    const px = alongX ? e.x + a : e.x;
    const py = alongX ? e.y : e.y + a;
    faces.push(...boxFaces(px, py, px + 0.35, py + 0.35, 0, e.h + 0.3, { top: PAL.woodSide2, sideX: PAL.woodSide2, sideY: PAL.woodSide }));
  }
  if (style === "privacy" || style === "picket") {
    faces.push(...boxFaces(e.x, e.y, e.x + (alongX ? e.w : 0.12), e.y + (alongX ? 0.12 : e.d), 0, style === "picket" ? e.h * 0.6 : e.h, { top: PAL.wood, sideX: "url(#pat-boards)", sideY: "url(#pat-boards)" }));
  }
  return (
    <>
      <Faces pj={pj} faces={faces} />
      {style === "wire" &&
        [0.3, 0.6, 0.9].map((f) => {
          const [ax, ay] = pj.p(e.x, e.y, e.h * f);
          const [bx, by] = pj.p(e.x + (alongX ? e.w : 0), e.y + (alongX ? 0 : e.d), e.h * f);
          return <line key={f} x1={ax} y1={ay} x2={bx} y2={by} stroke={PAL.ink} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />;
        })}
    </>
  );
}

function Path(e: MapEntity, ctx: DrawCtx) {
  const { pj } = ctx;
  const surface = String(e.props.surface ?? "pavers");
  if (surface !== "stepping") return <Ground e={e} pj={pj} fill={`url(#pat-${surface === "concrete" ? "concrete" : surface})`} z={0.02} />;
  const alongX = e.w >= e.d;
  const len = alongX ? e.w : e.d;
  const wid = alongX ? e.d : e.w;
  const n = Math.max(1, Math.floor(len / 2.2));
  const s = Math.min(wid * 0.8, 1.7);
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i + 0.5) * (len / n);
        const cx = alongX ? e.x + a : e.x + wid / 2;
        const cy = alongX ? e.y + wid / 2 : e.y + a;
        const pts: Vec3[] = [[cx - s / 2, cy - s / 2, 0.03], [cx + s / 2, cy - s / 2, 0.03], [cx + s / 2, cy + s / 2, 0.03], [cx - s / 2, cy + s / 2, 0.03]];
        return <path key={i} d={pathOf(pj, pts)} fill="#c7cdd0" {...ink} />;
      })}
    </>
  );
}

function Sprinkler(e: MapEntity, ctx: DrawCtx) {
  const { pj } = ctx;
  const r = Number(e.props.radius ?? 8);
  const cx = e.x + e.w / 2;
  const cy = e.y + e.d / 2;
  const ring: Vec3[] = Array.from({ length: 36 }, (_, i) => [cx + Math.cos((i / 36) * Math.PI * 2) * r, cy + Math.sin((i / 36) * Math.PI * 2) * r, 0.05]);
  return (
    <>
      <path d={pathOf(pj, ring)} fill={PAL.water} fillOpacity={0.18} stroke={PAL.water} strokeDasharray="5 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {Pin(e, ctx, "💦", { top: "#2f4f2f", sideX: "#1f3a1f", sideY: "#2f4f2f" })}
    </>
  );
}

function DripLine(e: MapEntity, ctx: DrawCtx) {
  const { pj } = ctx;
  const alongX = e.w >= e.d;
  const len = alongX ? e.w : e.d;
  const [ax, ay] = pj.p(e.x + (alongX ? 0 : e.w / 2), e.y + (alongX ? e.d / 2 : 0), e.z + 0.05);
  const [bx, by] = pj.p(e.x + (alongX ? e.w : e.w / 2), e.y + (alongX ? e.d / 2 : e.d), e.z + 0.05);
  return (
    <>
      <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#222" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {Array.from({ length: Math.floor(len) }, (_, i) => {
        const t = (i + 0.5) / len;
        return <circle key={i} cx={ax + (bx - ax) * t} cy={ay + (by - ay) * t} r={0.12} fill={PAL.water} />;
      })}
    </>
  );
}

function Gantry(e: MapEntity, ctx: DrawCtx) {
  const { pj } = ctx;
  const alongX = e.w >= e.d;
  const rail = (o: number): Face[] =>
    alongX
      ? boxFaces(e.x, e.y + o, e.x + e.w, e.y + o + 0.2, 0, 1.2, metalFill)
      : boxFaces(e.x + o, e.y, e.x + o + 0.2, e.y + e.d, 0, 1.2, metalFill);
  const mid = alongX ? e.x + e.w * 0.4 : e.y + e.d * 0.4;
  const bridge = alongX ? boxFaces(mid, e.y, mid + 0.4, e.y + e.d, e.h - 0.3, e.h, metalFill) : boxFaces(e.x, mid, e.x + e.w, mid + 0.4, e.h - 0.3, e.h, metalFill);
  const legs = alongX
    ? [...boxFaces(mid, e.y, mid + 0.3, e.y + 0.3, 1.2, e.h, metalFill), ...boxFaces(mid, e.y + e.d - 0.3, mid + 0.3, e.y + e.d, 1.2, e.h, metalFill)]
    : [...boxFaces(e.x, mid, e.x + 0.3, mid + 0.3, 1.2, e.h, metalFill), ...boxFaces(e.x + e.w - 0.3, mid, e.x + e.w, mid + 0.3, 1.2, e.h, metalFill)];
  const planned = e.props.status !== "installed";
  return (
    <g opacity={planned ? 0.55 : 1} strokeDasharray={planned ? "4 3" : undefined}>
      <Faces pj={pj} faces={[...rail(0), ...rail((alongX ? e.d : e.w) - 0.2), ...legs, ...bridge]} />
    </g>
  );
}

function SeedStation(e: MapEntity, ctx: DrawCtx) {
  const { pj, data } = ctx;
  const top = e.h;
  const leg = (x: number, y: number) => boxFaces(x, y, x + 0.2, y + 0.2, 0, top - 0.1, woodFill);
  const faces: Face[] = [
    ...leg(e.x, e.y),
    ...leg(e.x + e.w - 0.2, e.y),
    ...leg(e.x, e.y + e.d - 0.2),
    ...leg(e.x + e.w - 0.2, e.y + e.d - 0.2),
    ...boxFaces(e.x, e.y, e.x + e.w, e.y + e.d, top - 0.1, top, { top: PAL.wood, sideX: PAL.woodSide, sideY: PAL.woodSide2 }),
  ];
  const tray = e.links.trayId ? data.trays.find((t) => t.id === e.links.trayId) : undefined;
  const cells: ReactNode[] = [];
  if (tray) {
    const m = 0.15;
    const cw = (e.w - m * 2) / tray.cols;
    const cd = (e.d - m * 2) / tray.rows.length;
    tray.rows.forEach((row, r) =>
      Array.from({ length: tray.cols }, (_, c) => {
        const cell = `${c + 1}${row}`;
        const p = data.plantings.find((x) => x.trayId === tray.id && x.cells.includes(cell));
        const x0 = e.x + m + c * cw;
        const y0 = e.y + m + r * cd;
        const pts: Vec3[] = [[x0 + 0.03, y0 + 0.03, top + 0.02], [x0 + cw - 0.03, y0 + 0.03, top + 0.02], [x0 + cw - 0.03, y0 + cd - 0.03, top + 0.02], [x0 + 0.03, y0 + cd - 0.03, top + 0.02]];
        const green = p && !["planned", "sown"].includes(p.status);
        cells.push(<path key={cell} d={pathOf(pj, pts)} fill={p ? (green ? PAL.plant : PAL.soil) : "#5a4130"} {...ink} strokeWidth={0.4} />);
      }),
    );
  }
  return (
    <>
      <Faces pj={pj} faces={faces} />
      {cells}
    </>
  );
}

type Drawer = (e: MapEntity, ctx: DrawCtx) => ReactNode;

export const DRAWERS: Record<string, Drawer> = {
  lawn: (e, { pj }) => <Ground e={e} pj={pj} fill="url(#pat-grass)" noStroke />,
  path: Path,
  patio: (e, { pj }) => <Faces pj={pj} faces={box(e, { top: "url(#pat-concrete)", sideX: PAL.concreteSide, sideY: PAL.concreteSide })} />,
  driveway: (e, { pj }) => <Faces pj={pj} faces={box(e, { top: "url(#pat-concrete)", sideX: PAL.concreteSide, sideY: PAL.concreteSide })} />,
  mulch: (e, { pj }) => <Ground e={e} pj={pj} fill="url(#pat-mulch)" z={0.05} />,
  house: (e, ctx) => Building(e, ctx, true),
  shed: (e, ctx) => Building(e, ctx, false),
  fence: Fence,
  gate: (e, { pj }) => <Faces pj={pj} faces={box(e, { top: PAL.wood, sideX: "url(#pat-boards)", sideY: "url(#pat-boards)" })} />,
  trellis: (e, ctx) => Fence({ ...e, props: { style: "wire" } }, ctx),
  netting: (e, { pj }) => <Faces pj={pj} faces={box(e, { top: "url(#pat-net)", sideX: "url(#pat-net)", sideY: "url(#pat-net)" }).map((f) => ({ ...f, stroke: "#6b6b6b" }))} />,
  "raised-bed": Bed,
  "herb-garden": Bed,
  "in-ground-bed": (e, ctx) => (
    <>
      <Ground e={e} pj={ctx.pj} fill="url(#pat-soil)" z={e.h} />
      <Plants e={e} ctx={ctx} z={e.h} />
    </>
  ),
  "seed-station": SeedStation,
  "fruit-tree": (e, ctx) => Canopy(e, ctx, { trunk: 0.35, fruit: String(e.props.fruit ?? "#c0392b") }),
  tree: (e, ctx) => Canopy(e, ctx, { trunk: 0.4 }),
  shrub: (e, ctx) => Canopy(e, ctx, { trunk: 0 }),
  hedge: (e, { pj }) => <Faces pj={pj} faces={box(e, { top: "url(#pat-foliage)", sideX: PAL.foliageDark, sideY: PAL.foliage })} />,
  container: (e, ctx) => (
    <>
      <Faces pj={ctx.pj} faces={box(e, { top: PAL.soil, sideX: "#b5643c", sideY: "#c97a4f" })} />
      <Plants e={e} ctx={ctx} z={e.h} />
    </>
  ),
  compost: (e, { pj }) => <Faces pj={pj} faces={box(e, { top: "url(#pat-mulch)", sideX: "url(#pat-planks)", sideY: "url(#pat-planks)" })} />,
  spigot: (e, ctx) => Pin(e, ctx, "🚰"),
  outlet: (e, ctx) => Pin(e, ctx, "🔌", { top: "#eee", sideX: "#ccc", sideY: "#ddd" }),
  meter: (e, ctx) => Pin(e, ctx, "⚡"),
  "ac-unit": (e, { pj }) => <Faces pj={pj} faces={box(e, metalFill)} />,
  "rain-barrel": (e, { pj }) => <Faces pj={pj} faces={box(e, { top: "#3c5a6e", sideX: "#4f7690", sideY: "#5d86a2" })} />,
  valve: (e, ctx) => Pin(e, ctx, "🔧", { top: "#2f4f2f", sideX: "#1f3a1f", sideY: "#2f4f2f" }),
  sprinkler: Sprinkler,
  "drip-line": DripLine,
  gantry: Gantry,
  "robot-dock": (e, ctx) => Pin(e, ctx, "🔋"),
  sensor: (e, ctx) => Pin(e, ctx, "📡"),
  area: (e, { pj }) => <Ground e={e} pj={pj} fill="none" dashed />,
};

export function drawEntity(e: MapEntity, base: DrawCtx): ReactNode {
  // Drawers work as if the entity were square to the lot; the projector turns it.
  const ctx = { ...base, pj: entityProjector(base.pj, e) };
  const d = DRAWERS[e.kind];
  if (d) return d(e, ctx);
  return <Faces pj={ctx.pj} faces={box(e, { top: "#e5dccb", sideX: "#cfc4ae", sideY: "#d9cfba" })} />;
}
