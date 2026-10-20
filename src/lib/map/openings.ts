// Doors and windows in a building's walls. Pure functions: where each wall is,
// sensible defaults for a house that hasn't had its openings set, and moving an
// opening to the wall spot nearest a point (for dragging on the map).

import type { MapEntity, Opening, Wall } from "./model.ts";

export const WALLS: Wall[] = ["n", "e", "s", "w"];

export const OPENING_DEFAULTS: Record<Opening["type"], Pick<Opening, "width" | "height" | "bottom">> = {
  window: { width: 3, height: 4, bottom: 3 },
  door: { width: 3, height: 7, bottom: 0 },
  garage: { width: 9, height: 7, bottom: 0 },
};

type Box = Pick<MapEntity, "x" | "y" | "w" | "d">;

/** A wall as a line in the building's own frame: its start, its direction, its length, and its outward normal. */
export function wallLine(e: Box, wall: Wall): { x: number; y: number; dx: number; dy: number; length: number; nx: number; ny: number } {
  switch (wall) {
    case "n":
      return { x: e.x, y: e.y, dx: 1, dy: 0, length: e.w, nx: 0, ny: -1 };
    case "s":
      return { x: e.x, y: e.y + e.d, dx: 1, dy: 0, length: e.w, nx: 0, ny: 1 };
    case "w":
      return { x: e.x, y: e.y, dx: 0, dy: 1, length: e.d, nx: -1, ny: 0 };
    case "e":
      return { x: e.x + e.w, y: e.y, dx: 0, dy: 1, length: e.d, nx: 1, ny: 0 };
  }
}

/** Where an opening sits along its wall, kept inside the wall. */
export function clampOpening(e: Box, o: Opening): Opening {
  const length = wallLine(e, o.wall).length;
  const width = Math.min(o.width, length);
  return { ...o, width, offset: Math.max(0, Math.min(length - width, o.offset)) };
}

/** House settings, with fallbacks for houses drawn before they existed. */
export function houseStories(e: Pick<MapEntity, "props" | "h">): { stories: number; storyHeight: number } {
  const stories = Math.max(1, Math.round(Number(e.props.stories ?? 1)));
  const storyHeight = Number(e.props.storyHeight ?? e.h / stories) || 9;
  return { stories, storyHeight };
}

/**
 * Openings for a building that hasn't had them set: on a house, a front door
 * in the middle of the south wall, a back door on the north, and windows about
 * every 8 ft on every story; on a shed, just a door.
 */
export function defaultOpenings(e: MapEntity): Opening[] {
  const out: Opening[] = [];
  const add = (o: Omit<Opening, "id">) => out.push({ ...o, id: `${o.wall}-${o.type}-${out.length}` });
  if (e.kind === "shed") {
    add({ type: "door", wall: "s", offset: Math.max(0, e.w / 2 - 1.5), ...OPENING_DEFAULTS.door });
    return out.map((o) => clampOpening(e, o));
  }
  const { stories, storyHeight } = houseStories(e);
  const doors: Partial<Record<Wall, number>> = { s: e.w / 2 - 1.5, n: e.w / 3 - 1.5 };
  for (const wall of WALLS) {
    const length = wallLine(e, wall).length;
    const door = doors[wall];
    if (door != null && length >= 6) add({ type: "door", wall, offset: door, ...OPENING_DEFAULTS.door });
    for (let story = 0; story < stories; story++) {
      const count = Math.floor((length - 4) / 8);
      for (let i = 0; i < count; i++) {
        const offset = 2 + ((length - 4) / count) * (i + 0.5) - 1.5;
        // Leave room around a ground-floor door.
        if (story === 0 && door != null && Math.abs(offset + 1.5 - (door + 1.5)) < 4) continue;
        add({ type: "window", wall, offset, width: 3, height: Math.min(4, storyHeight - 4), bottom: story * storyHeight + 3 });
      }
    }
  }
  return out.map((o) => clampOpening(e, o));
}

export const buildingOpenings = (e: MapEntity): Opening[] => e.openings ?? defaultOpenings(e);

/**
 * The spot on the nearest wall for an opening dragged to (x, y) in the
 * building's own frame: which wall, and how far along it, centered on the point.
 */
export function placeOpening(e: Box, o: Opening, x: number, y: number, round: (v: number) => number = (v) => v): Opening {
  let best: { wall: Wall; along: number; dist: number } | null = null;
  for (const wall of WALLS) {
    const l = wallLine(e, wall);
    const along = Math.max(0, Math.min(l.length, (x - l.x) * l.dx + (y - l.y) * l.dy));
    const px = l.x + l.dx * along;
    const py = l.y + l.dy * along;
    const dist = Math.hypot(x - px, y - py);
    if (!best || dist < best.dist) best = { wall, along, dist };
  }
  return clampOpening(e, { ...o, wall: best!.wall, offset: round(best!.along - o.width / 2) });
}

/** A new opening on a wall, in the widest free stretch of it. */
export function newOpening(e: MapEntity, type: Opening["type"], wall: Wall, id: string): Opening {
  const size = OPENING_DEFAULTS[type];
  const length = wallLine(e, wall).length;
  const taken = buildingOpenings(e)
    .filter((o) => o.wall === wall && o.bottom < size.bottom + size.height && size.bottom < o.bottom + o.height)
    .map((o) => [o.offset, o.offset + o.width] as const)
    .sort((a, b) => a[0] - b[0]);
  let gap = { start: 0, len: 0 };
  let cursor = 0;
  for (const [a, b] of [...taken, [length, length] as const]) {
    if (a - cursor > gap.len) gap = { start: cursor, len: a - cursor };
    cursor = Math.max(cursor, b);
  }
  return clampOpening(e, { id, type, wall, ...size, offset: gap.start + (gap.len - size.width) / 2 });
}
