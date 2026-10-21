// Visitors to the garden map: songbirds that fly in to perch and hop in trees,
// shrubs, hedges and fences; hummingbirds and butterflies at flowering beds;
// squirrels foraging under the trees; now and then a neighborhood cat that
// strolls in, sits a while and leaves; and the household's dog, who comes out
// the back door to see off the cats and squirrels, make the rounds, and lie in
// the sun on the patio. Who comes, and where, is up to src/lib/map/wildlife.ts
// and src/lib/map/pets.ts; this runs the motion (the drawings are in
// CritterSprites.tsx). It keeps its own animation frame loop and re-renders
// only itself, and stays still for people who prefer reduced motion.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Projector, Vec2, Vec3 } from "@/lib/map/geometry";
import type { MapEntity, Site } from "@/lib/map/model";
import { backDoor, coatOf, insideLot, loungeSpot, niceOut, patrolSpot } from "@/lib/map/pets";
import type { SunPosition } from "@/lib/map/sun";
import {
  attractors,
  BIRDS,
  BUTTERFLIES,
  catSpot,
  CATS,
  climbTrees,
  edgePoint,
  nearestTree,
  pickAttractor,
  SQUIRRELS,
  VISITORS,
  WEATHER_FACTOR,
  type Attractor,
  type ClimbTree,
  type VisitorKind,
} from "@/lib/map/wildlife";
import type { Sky } from "@/lib/weather/forecast";
import type { GardenData, Pet } from "@/lib/types";
import { Butterfly, Cat, Dog, Hummingbird, Songbird, Squirrel, type DogPose, type SquirrelPose } from "./CritterSprites";

type Move = { from: Vec3; to: Vec3; t: number; dur: number; arc: number; wiggle: number };
type Leg = { to: Vec3; speed: number };

/** What the dog is up to: indoors, coming out, chasing, barking at what got away, making the rounds, sniffing, lying out, going back in. */
type DogMode = "inside" | "out" | "chase" | "bark" | "patrol" | "sniff" | "lounge" | "home";

type Agent = {
  id: number;
  kind: VisitorKind | "dog";
  pos: Vec3;
  move: Move | null;
  /** Moves still to make after this one (a squirrel running to a tree, then up it). */
  legs: Leg[];
  phase: "arrive" | "stay" | "leave";
  /** Seconds left in this stay (or, for the dog, in what it's doing), and until the next hop or flit. */
  timer: number;
  next: number;
  /** Flowers left to visit (hummingbirds), moves left (relocating songbirds), trips down the tree (squirrels), spots to sniff (the dog). */
  stops: number;
  attractor: Attractor | null;
  look: number;
  facing: 1 | -1;
  /** Going flat out: running from the dog, or the dog giving chase. */
  hurry: boolean;
  /** A squirrel sitting up. */
  up: boolean;
  /** The tree a squirrel is in, or making for. */
  tree: ClimbTree | null;
  pet: Pet | null;
  mode: DogMode;
  /** Who the dog is after. */
  prey: number | null;
  /** Where the dog was last drawn, to face the way it's going. */
  lastX: number | null;
};

const SPEED: Record<VisitorKind, number> = { songbird: 22, hummingbird: 30, butterfly: 5, cat: 3, squirrel: 7 };
/** Running from the dog. */
const FLEE: Partial<Record<VisitorKind, number>> = { cat: 11, squirrel: 13 };
/** The dog at a trot, and flat out. */
const TROT = 6;
const RUN = 16;
/** A squirrel going up or down a trunk. */
const CLIMB = 6;
/** How close the dog gets before what it's after bolts. */
const SPOOK = 14;

const rand = Math.random;
const between = (a: number, b: number) => a + rand() * (b - a);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flat = (a: Vec3 | Vec2, b: Vec3 | Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

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
  const trees = useMemo(() => climbTrees(entities), [entities]);
  const door = useMemo(() => backDoor(entities), [entities]);
  const pets = data.garden.pets ?? [];
  const live = useRef({ draws, trees, door, pets, entities, site, sun, sky });
  live.current = { draws, trees, door, pets, entities, site, sun, sky };

  useEffect(() => {
    if (!enabled || reduced) {
      agents.current = [];
      setFrame((f) => f + 1);
      return;
    }
    // The first cat turns up fairly soon, so there's something to see.
    let catClock = between(6, 18);
    const newAgent = (kind: Agent["kind"], extra: Partial<Agent> = {}): Agent => ({
      id: nextId.current++,
      kind,
      pos: [0, 0, 0],
      move: null,
      legs: [],
      phase: "arrive",
      timer: 0,
      next: 0,
      stops: 0,
      attractor: null,
      look: 0,
      facing: 1,
      hurry: false,
      up: false,
      tree: null,
      pet: null,
      mode: "inside",
      prey: null,
      lastX: null,
      ...extra,
    });
    const fly = (a: Agent, to: Vec3, speed: number, arc: number, wiggle = 0) => {
      a.move = { from: [...a.pos], to, t: 0, dur: Math.max(0.3, dist(a.pos, to) / speed), arc, wiggle };
    };
    /** Along the ground (or up a trunk), one leg after another. */
    const go = (a: Agent, legs: Leg[]) => {
      a.legs = legs.slice(1);
      fly(a, legs[0].to, legs[0].speed, 0);
    };
    const leave = (a: Agent, speed = SPEED[a.kind as VisitorKind]) => {
      const ground = a.kind === "cat" || a.kind === "squirrel";
      const [x, y] = edgePoint(live.current.site, a.pos[0], a.pos[1], rand, ground ? 4 : 12);
      a.phase = "leave";
      a.up = false;
      // A squirrel up a tree comes down it first.
      if (a.kind === "squirrel" && a.pos[2] > 0.3 && a.tree) return go(a, [{ to: [a.tree.x, a.tree.y, 0], speed: CLIMB }, { to: [x, y, 0], speed }]);
      a.legs = [];
      fly(a, [x, y, ground ? 0 : between(18, 30)], speed, ground ? 0 : 4, a.kind === "butterfly" ? 1 : 0);
    };
    const settle = (a: Agent) => {
      a.phase = "stay";
      a.hurry = false;
      if (a.kind === "songbird") [a.timer, a.next] = [between(4, 14), between(0.8, 2.5)];
      if (a.kind === "hummingbird") [a.timer, a.next] = [between(1.2, 2.5), 0];
      if (a.kind === "butterfly") [a.timer, a.next] = [between(18, 40), 0];
      if (a.kind === "cat") [a.timer, a.next] = [between(30, 80), 0];
      if (a.kind === "squirrel") [a.timer, a.next] = [a.pos[2] > 0.3 ? between(12, 30) : between(20, 60), between(0.5, 2)];
    };
    /** A spot on the ground a few feet from a tree's trunk. */
    const underTree = (t: ClimbTree, near = 0.3): Vec3 => {
      const a = rand() * Math.PI * 2;
      const d = (near + rand() * (1 - near)) * Math.max(3, t.spread);
      const [x, y] = insideLot(live.current.site, [t.x + Math.cos(a) * d, t.y + Math.sin(a) * d]);
      return [x, y, 0];
    };
    const spawn = (kind: VisitorKind) => {
      const { draws, entities, site, trees } = live.current;
      const a = newAgent(kind);
      let to: Vec3;
      if (kind === "cat") {
        const [x, y] = catSpot(entities, site, rand);
        to = [x, y, 0];
        a.look = Math.floor(rand() * CATS.length);
      } else if (kind === "squirrel") {
        const t = trees.length ? trees[Math.floor(rand() * trees.length)] : null;
        to = t ? underTree(t) : [...catSpot(entities, site, rand), 0];
        a.look = Math.floor(rand() * SQUIRRELS.length);
        a.stops = 2;
      } else {
        const target = pickAttractor(draws, kind, rand);
        if (!target) return;
        a.attractor = target;
        to = target.spot(rand);
        a.look = Math.floor(rand() * (kind === "butterfly" ? BUTTERFLIES.length : BIRDS.length));
        a.stops = kind === "hummingbird" ? Math.floor(between(2, 5)) : kind === "songbird" ? (rand() < 0.4 ? 1 : 0) : 0;
      }
      const ground = kind === "cat" || kind === "squirrel";
      const [ex, ey] = edgePoint(site, to[0], to[1], rand, ground ? 4 : 12);
      a.pos = [ex, ey, ground ? 0 : between(20, 32)];
      fly(a, to, SPEED[kind], ground ? 0 : kind === "butterfly" ? 2 : 5, kind === "butterfly" ? 1.2 : 0);
      agents.current.push(a);
    };

    // ---------- The dog and what it chases ----------

    const inLot = (p: Vec3) => p[0] > 0 && p[1] > 0 && p[0] < live.current.site.width && p[1] < live.current.site.depth;
    /** Cats and squirrels on the ground in the yard, not already running. */
    const isPrey = (p: Agent) => (p.kind === "cat" || p.kind === "squirrel") && p.phase !== "leave" && !p.hurry && p.pos[2] < 0.3 && inLot(p.pos);
    /** Spooked: a cat makes for the fence; a squirrel for the nearest tree and up it, or over the fence if there's none near. */
    const flee = (p: Agent) => {
      if (p.hurry) return;
      p.hurry = true;
      p.up = false;
      if (p.kind === "squirrel") {
        const t = nearestTree(live.current.trees, p.pos[0], p.pos[1], 35);
        if (t) {
          p.tree = t;
          p.phase = "arrive";
          p.stops = Math.min(p.stops, 1);
          return go(p, [{ to: [t.x, t.y, 0], speed: FLEE.squirrel! }, { to: [t.x, t.y, t.crown], speed: CLIMB * 1.5 }]);
        }
      }
      leave(p, FLEE[p.kind as VisitorKind]);
    };
    const bark = (a: Agent, lo: number, hi: number) => {
      a.mode = "bark";
      a.timer = between(lo, hi);
      a.hurry = false;
      a.move = null;
    };
    const goHome = (a: Agent) => {
      const { door } = live.current;
      a.mode = "home";
      a.hurry = false;
      if (door) go(a, [{ to: [door.out[0], door.out[1], 0], speed: TROT }, { to: [door.door[0], door.door[1], 0], speed: TROT * 0.6 }]);
    };
    /** After a chase or a sniff: on to the next spot, out on the patio if it's nice, or back in. */
    const wander = (a: Agent) => {
      const { door, entities, site, sky, sun } = live.current;
      if (!door) return;
      a.hurry = false;
      if (a.stops-- > 0) {
        a.mode = "patrol";
        const [x, y] = patrolSpot(entities, site, door.out, rand);
        return fly(a, [x, y, 0], TROT, 0);
      }
      const spot = niceOut(sky, sun.altitude) ? loungeSpot(entities, door.out, rand) : null;
      if (spot) {
        a.mode = "lounge";
        a.timer = between(90, 300);
        return fly(a, spot, TROT * 0.7, 0);
      }
      goHome(a);
    };
    const chase = (a: Agent, dt: number) => {
      const p = agents.current.find((x) => x.id === a.prey);
      a.timer -= dt;
      if (!p) return bark(a, 1.5, 3);
      // A squirrel making for a tree: head for the trunk. Anything else: after it, up to the fence.
      const treed = p.kind === "squirrel" && p.tree && (p.hurry || p.pos[2] > 0.3);
      const target: Vec2 = treed ? [p.tree!.x + (a.pos[0] < p.tree!.x ? -1.6 : 1.6), p.tree!.y + 0.6] : insideLot(live.current.site, [p.pos[0], p.pos[1]]);
      const gap = flat(a.pos, p.pos);
      if (gap < SPOOK && !p.hurry && p.phase !== "leave") flee(p);
      // Flat out, but not running it down: once close, keep pace.
      const speed = p.hurry && gap < 5 && !treed ? Math.min(RUN, (FLEE[p.kind as VisitorKind] ?? RUN) * 0.9) : RUN;
      const d = flat(a.pos, target);
      const stepLen = Math.min(d, speed * dt);
      if (d > 1e-6) a.pos = [a.pos[0] + ((target[0] - a.pos[0]) / d) * stepLen, a.pos[1] + ((target[1] - a.pos[1]) / d) * stepLen, 0];
      if (d < 0.6 && (p.pos[2] > 0.3 || p.phase === "leave")) return bark(a, treed ? 3 : 1.5, treed ? 6 : 3);
      if (a.timer <= 0) bark(a, 1.5, 3);
    };
    const stepDog = (a: Agent, dt: number) => {
      const { door } = live.current;
      if (!door) {
        // No house, no back door: the dog stays in.
        a.mode = "inside";
        a.move = null;
        return;
      }
      const prey = agents.current.filter(isPrey);
      if (a.mode === "inside") {
        a.timer -= dt;
        // Out for a look around now and then, and sooner when there's something to chase.
        if (a.timer <= 0 || (prey.length && rand() < dt / 15)) {
          a.pos = [door.door[0], door.door[1], 0];
          a.lastX = null;
          a.mode = "out";
          a.stops = Math.floor(between(1, 4));
          fly(a, [door.out[0], door.out[1], 0], TROT, 0);
        }
        return;
      }
      // Spotting a cat or squirrel: quick when up and about, a little slower lying in the sun.
      if (a.mode !== "chase" && prey.length && rand() < dt / (a.mode === "lounge" ? 4 : 1.5)) {
        const nearest = prey.reduce((x, y) => (flat(y.pos, a.pos) < flat(x.pos, a.pos) ? y : x));
        Object.assign(a, { mode: "chase", prey: nearest.id, move: null, legs: [], timer: 12, hurry: true });
      }
      if (a.mode === "chase") return chase(a, dt);
      if (a.move) {
        a.move.t += dt / a.move.dur;
        a.pos = at(a.move);
        if (a.move.t < 1) return;
        a.pos = [...a.move.to];
        a.move = null;
        const leg = a.legs.shift();
        if (leg) return fly(a, leg.to, leg.speed, 0);
        // Arrived.
        if (a.mode === "out") wander(a);
        else if (a.mode === "patrol") [a.mode, a.timer] = ["sniff", between(1.5, 4)];
        else if (a.mode === "home") [a.mode, a.timer] = ["inside", between(120, 360)];
        return;
      }
      a.timer -= dt;
      if ((a.mode === "bark" || a.mode === "sniff") && a.timer <= 0) wander(a);
      if (a.mode === "lounge" && (a.timer <= 0 || !niceOut(live.current.sky, live.current.sun.altitude))) goHome(a);
    };
    /** One dog for each in the garden's pets, kept in step as they're added, changed and removed. */
    const keepPets = () => {
      const { pets } = live.current;
      for (const pet of pets) {
        const dog = agents.current.find((a) => a.pet?.id === pet.id);
        // The first outing comes soon, so there's something to see.
        if (!dog) agents.current.push(newAgent("dog", { pet, mode: "inside", timer: between(8, 25), look: 0 }));
        else dog.pet = pet;
      }
      agents.current = agents.current.filter((a) => a.kind !== "dog" || pets.some((p) => p.id === a.pet!.id));
    };

    const step = (dt: number) => {
      const { draws, sun, sky, trees, site } = live.current;
      keepPets();
      // Arrivals.
      for (const kind of ["songbird", "hummingbird", "butterfly"] as const) {
        const def = VISITORS[kind];
        if (sun.altitude < def.minSun || !def.skies.includes(sky) || !draws.some((d) => d.visitor === kind)) continue;
        const here = agents.current.filter((a) => a.kind === kind).length;
        const room = kind === "songbird" ? Math.min(def.max, 1 + Math.ceil(draws.filter((d) => d.visitor === kind).length * 0.8)) : def.max;
        const rate = def.rate * (kind === "songbird" ? WEATHER_FACTOR[sky] : 1);
        if (here < room && rand() < rate * dt) spawn(kind);
      }
      const sq = VISITORS.squirrel;
      if (sun.altitude >= sq.minSun && sq.skies.includes(sky) && agents.current.filter((a) => a.kind === "squirrel").length < sq.max && rand() < sq.rate * (trees.length ? 1 : 0.3) * dt) spawn("squirrel");
      catClock -= dt;
      if (catClock <= 0) {
        catClock = between(45, 150);
        const cats = agents.current.filter((a) => a.kind === "cat").length;
        if (VISITORS.cat.skies.includes(sky) && cats < VISITORS.cat.max && (cats === 0 || rand() < 0.3)) spawn("cat");
      }
      // Movement and behavior.
      for (const a of agents.current) {
        if (a.kind === "dog") {
          stepDog(a, dt);
          continue;
        }
        if (a.move) {
          a.move.t += dt / a.move.dur;
          a.pos = at(a.move);
          if (a.move.t >= 1) {
            a.pos = [...a.move.to];
            a.move = null;
            const leg = a.legs.shift();
            if (leg) fly(a, leg.to, leg.speed, 0);
            // Arrived: settle in. (Ones that have left are dropped below.)
            else if (a.phase === "arrive") settle(a);
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
        } else if (a.kind === "squirrel") {
          const inTree = a.pos[2] > 0.3;
          if (a.timer <= 0) {
            // Down from the tree to forage some more, or away.
            if (inTree && a.tree && a.stops-- > 0) {
              a.phase = "arrive";
              go(a, [{ to: [a.tree.x, a.tree.y, 0], speed: CLIMB }, { to: underTree(a.tree, 0.5), speed: SPEED.squirrel }]);
            } else leave(a);
          } else if (a.next <= 0 && !inTree) {
            // Foraging: a dash, a pause sitting up, or a run up the nearest tree.
            a.up = false;
            a.next = between(0.6, 2.2);
            const r = rand();
            const tree = r >= 0.88 ? nearestTree(trees, a.pos[0], a.pos[1], 30) : null;
            if (tree) {
              a.tree = tree;
              a.phase = "arrive";
              go(a, [{ to: [tree.x, tree.y, 0], speed: SPEED.squirrel }, { to: [tree.x, tree.y, tree.crown], speed: CLIMB }]);
            } else if (r < 0.62) {
              const ang = rand() * Math.PI * 2;
              const d = between(1.5, 5);
              const [x, y] = insideLot(site, [a.pos[0] + Math.cos(ang) * d, a.pos[1] + Math.sin(ang) * d]);
              fly(a, [x, y, 0], SPEED.squirrel, 0);
            } else {
              a.up = true;
              a.next = between(1.2, 3);
            }
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
  // Draw the far ones first; a dog indoors isn't drawn.
  const list = agents.current.filter((a) => !(a.kind === "dog" && a.mode === "inside")).sort((a, b) => pj.depth(a.pos[0], a.pos[1], a.pos[2]) - pj.depth(b.pos[0], b.pos[1], b.pos[2]));
  return (
    <g className="critters">
      {list.map((a) => {
        const [sx, sy] = pj.p(...a.pos);
        if (a.move) {
          // Face the way they're going, on screen.
          const dx = pj.p(...a.move.to)[0] - pj.p(...a.move.from)[0];
          if (Math.abs(dx) > 1e-6) a.facing = dx > 0 ? 1 : -1;
        } else if (a.kind === "dog" && a.lastX != null && Math.abs(sx - a.lastX) > 1e-3) a.facing = sx > a.lastX ? 1 : -1;
        if (a.kind === "dog") {
          a.lastX = sx;
          const pose: DogPose =
            a.mode === "chase" ? "run" : a.mode === "bark" ? "bark" : a.mode === "sniff" ? "sniff" : a.move ? "walk" : a.mode === "lounge" ? "lie" : "stand";
          return <Dog key={a.id} x={sx} y={sy} k={Math.max(0.75, 8 / zoom)} facing={a.facing} coat={coatOf(a.pet!)} pose={pose} name={a.pet!.name || "The dog"} />;
        }
        if (a.kind === "squirrel") {
          const climbing = !!a.move && Math.abs(a.move.to[2] - a.move.from[2]) > 0.5;
          const pose: SquirrelPose = climbing ? "climb" : a.move ? "run" : a.pos[2] > 0.3 ? "perch" : a.up ? "up" : "forage";
          return <Squirrel key={a.id} x={sx} y={sy} k={Math.max(0.5, 6 / zoom)} facing={a.facing} look={a.look} pose={pose} />;
        }
        const flying = !!a.move && a.move.dur > 0.6;
        if (a.kind === "cat") return <Cat key={a.id} x={sx} y={sy} k={Math.max(0.75, 8 / zoom)} facing={a.facing} coat={a.look} walking={!!a.move} running={a.hurry} />;
        if (a.kind === "butterfly") return <Butterfly key={a.id} x={sx} y={sy} k={Math.max(0.3, 6 / zoom)} look={a.look} />;
        if (a.kind === "hummingbird") return <Hummingbird key={a.id} x={sx} y={sy} k={Math.max(0.15, 4.5 / zoom)} facing={a.facing} />;
        return <Songbird key={a.id} x={sx} y={sy} k={Math.max(0.33, 6 / zoom)} facing={a.facing} look={a.look} flying={flying} />;
      })}
    </g>
  );
});
