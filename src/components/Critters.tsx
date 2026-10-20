// Visitors to the garden map: songbirds that fly in to perch and hop in trees,
// shrubs, hedges and fences; hummingbirds and butterflies at flowering beds;
// and now and then a neighborhood cat that strolls in, sits a while and
// leaves. Who comes, and where they land, is up to src/lib/map/wildlife.ts;
// this runs the motion. It keeps its own animation frame loop and re-renders
// only itself, and stays still for people who prefer reduced motion.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Projector, Vec3 } from "@/lib/map/geometry";
import type { MapEntity, Site } from "@/lib/map/model";
import type { SunPosition } from "@/lib/map/sun";
import {
  attractors,
  BIRDS,
  BUTTERFLIES,
  catSpot,
  CATS,
  edgePoint,
  pickAttractor,
  VISITORS,
  WEATHER_FACTOR,
  type Attractor,
  type VisitorKind,
} from "@/lib/map/wildlife";
import type { Sky } from "@/lib/weather/forecast";
import type { GardenData } from "@/lib/types";

type Move = { from: Vec3; to: Vec3; t: number; dur: number; arc: number; wiggle: number };

type Agent = {
  id: number;
  kind: VisitorKind;
  pos: Vec3;
  move: Move | null;
  phase: "arrive" | "stay" | "leave";
  /** Seconds left in this stay, and until the next hop or flit. */
  timer: number;
  next: number;
  /** Flowers left to visit (hummingbirds), or moves left (relocating songbirds). */
  stops: number;
  attractor: Attractor | null;
  look: number;
  facing: 1 | -1;
};

const SPEED: Record<VisitorKind, number> = { songbird: 22, hummingbird: 30, butterfly: 5, cat: 3 };
const rand = Math.random;
const between = (a: number, b: number) => a + rand() * (b - a);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (typeof matchMedia === "undefined") return;
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

function at(m: Move): Vec3 {
  const t = Math.min(1, m.t);
  const e = t * t * (3 - 2 * t); // ease in and out
  const x = m.from[0] + (m.to[0] - m.from[0]) * e;
  const y = m.from[1] + (m.to[1] - m.from[1]) * e;
  // Butterflies zig-zag across the line of travel.
  const len = Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1]) || 1;
  const side = Math.sin(t * Math.PI * 5) * m.wiggle;
  return [x - ((m.to[1] - m.from[1]) / len) * side, y + ((m.to[0] - m.from[0]) / len) * side, m.from[2] + (m.to[2] - m.from[2]) * e + Math.sin(t * Math.PI) * m.arc];
}

type Props = {
  pj: Projector;
  entities: MapEntity[];
  data: GardenData;
  site: Site;
  sun: SunPosition;
  sky: Sky;
  zoom: number;
  enabled: boolean;
};

export const Critters = memo(function Critters({ pj, entities, data, site, sun, sky, zoom, enabled }: Props) {
  const reduced = useReducedMotion();
  const [, setFrame] = useState(0);
  const agents = useRef<Agent[]>([]);
  const nextId = useRef(1);
  const draws = useMemo(() => attractors(entities, data), [entities, data]);
  const live = useRef({ draws, entities, site, sun, sky });
  live.current = { draws, entities, site, sun, sky };

  useEffect(() => {
    if (!enabled || reduced) {
      agents.current = [];
      setFrame((f) => f + 1);
      return;
    }
    // The first cat turns up fairly soon, so there's something to see.
    let catClock = between(6, 18);
    const fly = (a: Agent, to: Vec3, speed: number, arc: number, wiggle = 0) => {
      a.move = { from: [...a.pos], to, t: 0, dur: Math.max(0.3, dist(a.pos, to) / speed), arc, wiggle };
    };
    const leave = (a: Agent) => {
      const [x, y] = edgePoint(live.current.site, a.pos[0], a.pos[1], rand, a.kind === "cat" ? 4 : 12);
      a.phase = "leave";
      fly(a, [x, y, a.kind === "cat" ? 0 : between(18, 30)], SPEED[a.kind], a.kind === "cat" ? 0 : 4, a.kind === "butterfly" ? 1 : 0);
    };
    const settle = (a: Agent) => {
      a.phase = "stay";
      if (a.kind === "songbird") [a.timer, a.next] = [between(4, 14), between(0.8, 2.5)];
      if (a.kind === "hummingbird") [a.timer, a.next] = [between(1.2, 2.5), 0];
      if (a.kind === "butterfly") [a.timer, a.next] = [between(18, 40), 0];
      if (a.kind === "cat") [a.timer, a.next] = [between(30, 80), 0];
    };
    const spawn = (kind: VisitorKind) => {
      const { draws, entities, site } = live.current;
      const a: Agent = { id: nextId.current++, kind, pos: [0, 0, 0], move: null, phase: "arrive", timer: 0, next: 0, stops: 0, attractor: null, look: 0, facing: 1 };
      let to: Vec3;
      if (kind === "cat") {
        const [x, y] = catSpot(entities, site, rand);
        to = [x, y, 0];
        a.look = Math.floor(rand() * CATS.length);
      } else {
        const target = pickAttractor(draws, kind, rand);
        if (!target) return;
        a.attractor = target;
        to = target.spot(rand);
        a.look = Math.floor(rand() * (kind === "butterfly" ? BUTTERFLIES.length : BIRDS.length));
        a.stops = kind === "hummingbird" ? Math.floor(between(2, 5)) : kind === "songbird" ? (rand() < 0.4 ? 1 : 0) : 0;
      }
      const [ex, ey] = edgePoint(site, to[0], to[1], rand, kind === "cat" ? 4 : 12);
      a.pos = [ex, ey, kind === "cat" ? 0 : between(20, 32)];
      fly(a, to, SPEED[kind], kind === "cat" ? 0 : kind === "butterfly" ? 2 : 5, kind === "butterfly" ? 1.2 : 0);
      agents.current.push(a);
    };

    const step = (dt: number) => {
      const { draws, sun, sky } = live.current;
      // Arrivals.
      for (const kind of ["songbird", "hummingbird", "butterfly"] as const) {
        const def = VISITORS[kind];
        if (sun.altitude < def.minSun || !def.skies.includes(sky) || !draws.some((d) => d.visitor === kind)) continue;
        const here = agents.current.filter((a) => a.kind === kind).length;
        const room = kind === "songbird" ? Math.min(def.max, 1 + Math.ceil(draws.filter((d) => d.visitor === kind).length * 0.8)) : def.max;
        const rate = def.rate * (kind === "songbird" ? WEATHER_FACTOR[sky] : 1);
        if (here < room && rand() < rate * dt) spawn(kind);
      }
      catClock -= dt;
      if (catClock <= 0) {
        catClock = between(45, 150);
        const cats = agents.current.filter((a) => a.kind === "cat").length;
        if (VISITORS.cat.skies.includes(sky) && cats < VISITORS.cat.max && (cats === 0 || rand() < 0.3)) spawn("cat");
      }
      // Movement and behavior.
      for (const a of agents.current) {
        if (a.move) {
          a.move.t += dt / a.move.dur;
          a.pos = at(a.move);
          if (a.move.t >= 1) {
            a.pos = [...a.move.to];
            a.move = null;
            // Arrived: settle in. (Ones that have left are dropped below.)
            if (a.phase === "arrive") settle(a);
          }
          continue;
        }
        if (a.phase === "leave") continue;
        a.timer -= dt;
        a.next -= dt;
        const t = a.attractor;
        if (a.kind === "songbird") {
          if (a.timer <= 0) {
            // Off to another tree now and then, otherwise away.
            const other = a.stops > 0 ? pickAttractor(draws, "songbird", rand, t?.entityId) : null;
            if (other) {
              a.stops--;
              a.attractor = other;
              a.phase = "arrive";
              fly(a, other.spot(rand), SPEED.songbird, 3);
            } else leave(a);
          } else if (a.next <= 0 && t) {
            // A little hop within the branches.
            const s = t.spot(rand);
            const hop: Vec3 = [a.pos[0] + (s[0] - a.pos[0]) * 0.3, a.pos[1] + (s[1] - a.pos[1]) * 0.3, a.pos[2] + (s[2] - a.pos[2]) * 0.3];
            a.move = { from: [...a.pos], to: hop, t: 0, dur: 0.25, arc: 0.4, wiggle: 0 };
            a.next = between(0.8, 3);
          }
        } else if (a.kind === "hummingbird") {
          if (a.timer <= 0) {
            if (a.stops-- > 0) {
              const next = (rand() < 0.6 && t) || pickAttractor(draws, "hummingbird", rand) || t;
              a.attractor = next;
              a.phase = "arrive";
              if (next) fly(a, next.spot(rand), SPEED.hummingbird, 0.6);
            } else leave(a);
          }
        } else if (a.kind === "butterfly") {
          if (a.timer <= 0) leave(a);
          else if (t) {
            a.phase = "stay";
            a.move = { from: [...a.pos], to: t.spot(rand), t: 0, dur: between(1.5, 3.5), arc: 0.6, wiggle: 0.5 };
          }
        } else if (a.kind === "cat" && a.timer <= 0) leave(a);
      }
      agents.current = agents.current.filter((a) => !(a.phase === "leave" && !a.move));
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      step(Math.min(0.1, (now - last) / 1000));
      last = now;
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled, reduced]);

  if (!enabled || reduced) return null;
  // Draw the far ones first.
  const list = [...agents.current].sort((a, b) => pj.depth(a.pos[0], a.pos[1], a.pos[2]) - pj.depth(b.pos[0], b.pos[1], b.pos[2]));
  return (
    <g className="critters">
      {list.map((a) => {
        const [sx, sy] = pj.p(...a.pos);
        if (a.move) {
          // Face the way they're going, on screen.
          const dx = pj.p(...a.move.to)[0] - pj.p(...a.move.from)[0];
          if (Math.abs(dx) > 1e-6) a.facing = dx > 0 ? 1 : -1;
        }
        const flying = !!a.move && a.move.dur > 0.6;
        if (a.kind === "cat") return <Cat key={a.id} x={sx} y={sy} k={Math.max(0.75, 8 / zoom)} facing={a.facing} coat={a.look} walking={!!a.move} />;
        if (a.kind === "butterfly") return <Butterfly key={a.id} x={sx} y={sy} k={Math.max(0.3, 6 / zoom)} look={a.look} />;
        if (a.kind === "hummingbird") return <Hummingbird key={a.id} x={sx} y={sy} k={Math.max(0.15, 4.5 / zoom)} facing={a.facing} />;
        return <Songbird key={a.id} x={sx} y={sy} k={Math.max(0.33, 6 / zoom)} facing={a.facing} look={a.look} flying={flying} />;
      })}
    </g>
  );
});

const place = (x: number, y: number, k: number, facing = 1) => `translate(${x} ${y}) scale(${k * facing} ${k})`;

function Songbird({ x, y, k, facing, look, flying }: { x: number; y: number; k: number; facing: number; look: number; flying: boolean }) {
  const c = BIRDS[look % BIRDS.length];
  if (flying)
    return (
      <g transform={place(x, y, k, facing)}>
        <title>{c.name}</title>
        <g className="flap">
          <path d="M-1.7 -0.1 Q -0.9 -1 0 -0.1 Q 0.9 -1 1.7 -0.1" stroke={c.wing} strokeWidth={0.38} fill="none" strokeLinecap="round" />
        </g>
        <ellipse cx={0} cy={0} rx={0.55} ry={0.32} fill={c.body} />
      </g>
    );
  return (
    <g transform={place(x, y, k, facing)}>
      <title>{c.name}</title>
      <path d="M-0.8 -0.1 L-1.7 -0.55 L-1.55 0.1 Z" fill={c.wing} />
      <ellipse cx={0} cy={0} rx={1} ry={0.62} fill={c.body} />
      <ellipse cx={0.2} cy={0.17} rx={0.6} ry={0.4} fill={c.breast} />
      <path d="M-0.65 -0.25 Q -0.1 -0.55 0.45 -0.12 L -0.3 0.25 Z" fill={c.wing} />
      <circle cx={0.85} cy={-0.45} r={0.42} fill={c.body} />
      <path d="M1.22 -0.52 L1.6 -0.42 L1.22 -0.32 Z" fill="#d9a03a" />
      <circle cx={0.98} cy={-0.53} r={0.08} fill="#141414" />
      <path d="M-0.1 0.6 L-0.15 0.95 M0.25 0.6 L0.25 0.95" stroke="#5a4636" strokeWidth={0.1} />
    </g>
  );
}

function Hummingbird({ x, y, k, facing }: { x: number; y: number; k: number; facing: number }) {
  return (
    <g transform={place(x, y, k, facing)}>
      <title>Hummingbird</title>
      <g className="buzz">
        <ellipse cx={-0.1} cy={-0.7} rx={0.35} ry={0.9} fill="#d8eef0" opacity={0.7} transform="rotate(-25)" />
      </g>
      <ellipse cx={0} cy={0} rx={0.8} ry={0.38} fill="#3f8f5a" transform="rotate(-20)" />
      <path d="M-0.7 0.15 L-1.3 0.55 L-1.1 0.05 Z" fill="#2f6e45" />
      <circle cx={0.65} cy={-0.32} r={0.3} fill="#3f8f5a" />
      <circle cx={0.62} cy={-0.1} r={0.18} fill="#c0392b" />
      <path d="M0.92 -0.36 L1.85 -0.2" stroke="#2b2b2b" strokeWidth={0.08} />
      <circle cx={0.72} cy={-0.38} r={0.06} fill="#111" />
    </g>
  );
}

function Butterfly({ x, y, k, look }: { x: number; y: number; k: number; look: number }) {
  const c = BUTTERFLIES[look % BUTTERFLIES.length];
  return (
    <g transform={place(x, y, k)}>
      <title>{c.name}</title>
      <g className="flutter">
        <ellipse cx={-0.55} cy={-0.35} rx={0.6} ry={0.48} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
        <ellipse cx={0.55} cy={-0.35} rx={0.6} ry={0.48} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
        <ellipse cx={-0.4} cy={0.3} rx={0.38} ry={0.3} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
        <ellipse cx={0.4} cy={0.3} rx={0.38} ry={0.3} fill={c.wing} stroke={c.edge} strokeWidth={0.1} />
      </g>
      <line x1={0} y1={-0.55} x2={0} y2={0.55} stroke="#2b2b2b" strokeWidth={0.14} strokeLinecap="round" />
    </g>
  );
}

function Cat({ x, y, k, facing, coat, walking }: { x: number; y: number; k: number; facing: number; coat: number; walking: boolean }) {
  const c = CATS[coat % CATS.length];
  const belly = c.belly ?? c.base;
  const ears = (dx: number) => `M${0.02 + dx} -0.9 L${0.12 + dx} -1.45 L${0.45 + dx} -1.05 Z M${0.55 + dx} -1.05 L${0.95 + dx} -1.45 L${0.98 + dx} -0.88 Z`;
  return (
    <g transform={place(x, y, k, facing)} className="cat" pointerEvents="all">
      <title>{`${c.name} is visiting`}</title>
      <ellipse cx={0} cy={1.25} rx={1.4} ry={0.35} fill="#000" opacity={0.12} />
      {walking ? (
        <g className="cat-walk">
          <path d="M-1.05 0.1 C -1.6 -0.2 -1.7 -0.8 -1.35 -1.1" stroke={c.base} strokeWidth={0.28} fill="none" strokeLinecap="round" />
          <g className="leg-a">
            <path d="M-0.7 0.5 L-0.8 1.2 M0.55 0.5 L0.65 1.2" stroke={c.base} strokeWidth={0.26} strokeLinecap="round" />
          </g>
          <g className="leg-b">
            <path d="M-0.45 0.5 L-0.35 1.2 M0.8 0.5 L0.7 1.2" stroke={c.stripes ?? c.base} strokeWidth={0.26} strokeLinecap="round" />
          </g>
          <ellipse cx={0} cy={0.25} rx={1.15} ry={0.5} fill={c.base} />
          {c.stripes && <path d="M-0.6 -0.15 q0.1 0.3 0 0.6 M-0.2 -0.22 q0.1 0.35 0 0.7 M0.2 -0.2 q0.1 0.3 0 0.6" stroke={c.stripes} strokeWidth={0.12} fill="none" />}
          {c.patch && <ellipse cx={-0.4} cy={0.05} rx={0.45} ry={0.3} fill={c.patch} />}
          <ellipse cx={0.3} cy={0.45} rx={0.55} ry={0.22} fill={belly} />
          <g transform="translate(0.75 0.05)">
            <circle cx={0.45} cy={-0.55} r={0.5} fill={c.base} />
            <path d={ears(0)} fill={c.base} transform="translate(0.05 0.15) scale(0.85)" />
            <circle cx={0.62} cy={-0.62} r={0.07} fill="#2a2a2a" />
            <path d="M0.9 -0.48 l0.08 0.06 l-0.1 0.04 Z" fill="#e58a9a" />
          </g>
        </g>
      ) : (
        <g>
          <path className="tail" d="M-0.85 1 C -1.75 0.95 -1.8 0 -1.3 -0.35" stroke={c.base} strokeWidth={0.3} fill="none" strokeLinecap="round" />
          <ellipse cx={-0.15} cy={0.4} rx={0.9} ry={0.8} fill={c.base} />
          {c.stripes && <path d="M-0.75 0.1 q0.25 0.15 0.15 0.5 M-0.55 -0.15 q0.3 0.2 0.2 0.6 M-0.85 0.55 q0.25 0.1 0.2 0.4" stroke={c.stripes} strokeWidth={0.12} fill="none" />}
          {c.patch && <ellipse cx={-0.45} cy={0.25} rx={0.42} ry={0.38} fill={c.patch} />}
          <ellipse cx={0.25} cy={0.65} rx={0.42} ry={0.48} fill={belly} />
          <circle cx={0.45} cy={-0.5} r={0.6} fill={c.base} />
          {c.patch && <path d="M0.0 -0.85 Q 0.35 -0.95 0.42 -0.5 Q 0.1 -0.35 -0.08 -0.55 Z" fill={c.patch} />}
          <path d={ears(0)} fill={c.base} />
          <path d="M0.15 -1.05 L0.2 -1.3 L0.36 -1.1 Z M0.68 -1.1 L0.88 -1.3 L0.87 -1.02 Z" fill="#e8a3ad" />
          <g className="blink">
            <ellipse cx={0.28} cy={-0.55} rx={0.08} ry={0.12} fill="#2a2a2a" />
            <ellipse cx={0.66} cy={-0.55} rx={0.08} ry={0.12} fill="#2a2a2a" />
          </g>
          <path d="M0.42 -0.36 l0.08 0.07 l0.08 -0.07 Z" fill="#e58a9a" />
          <path d="M0.1 1.05 L0.12 1.2 M0.4 1.05 L0.42 1.2" stroke={belly} strokeWidth={0.22} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}
