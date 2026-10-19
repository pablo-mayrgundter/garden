# Garden map

The map is "Google Maps for your garden": one drawing of the whole lot (house, front and back yards, the side yard where water and power come out of the house) that you can pan, zoom and turn, and edit both on the drawing and in the side panel. It's drawn in the style of an illustrated garden plan (isometric, shaded line art) with a flat plan view for precise layout.

This document is the spec: the data model, how drawing works, and where new features plug in.

## Code

| File | What it holds |
|---|---|
| `src/lib/map/model.ts` | Types: `Site`, `MapEntity`, `MapLinks`, and the `LAYERS` list. |
| `src/lib/map/kinds.ts` | The kinds registry: every kind of thing that can go on the map, as plain data. |
| `src/lib/map/geometry.ts` | Projection (iso and plan, four rotations), unprojection for dragging, face ordering, snapping, free-spot search. No DOM. |
| `src/lib/map/render.tsx` | SVG patterns and one drawer per kind. |
| `src/lib/map/template.ts` | The starting lot ("Start from a typical lot"). |
| `src/lib/actions.ts` | `setSite`, `applySiteTemplate`, `addMapEntity`, `updateMapEntity`, `deleteMapEntity`, `createPlanterForEntity`. The UI and the assistant both go through these. |
| `src/pages/Map.tsx` | The map page: viewport, pointer and keyboard handling, panels. |
| `test/map.test.ts` | Projection round trips, ordering, kinds, template, actions, garden-file round trip. |

## World coordinates

- Units are **feet**.
- The origin is the lot's **north-west corner**. **x** grows east, **y** grows south, **z** grows up.
- `Site` (stored on the garden as `garden.site`) gives the lot's `width` (east–west) and `depth` (north–south), `northDeg` (degrees clockwise from the top of the plan to true north; a lot that isn't square to the compass still draws square), and `gridFt` (snapping step; 0 turns it off).
- "North" in the coordinates means the top of the plan. True north is only used for the compass today, and later for sun and shade.

## Entities

Everything on the map is a `MapEntity`: a box, optionally turned about its center.

```ts
type MapEntity = {
  id: string;
  kind: string;              // key into the kinds registry
  name: string;
  x: number; y: number;      // north-west corner of the footprint
  w: number; d: number;      // east–west and north–south size
  h: number;                 // height
  z: number;                 // base height (netting over a bed, an outlet on a wall)
  rot?: number;              // turn about the center, degrees clockwise on the plan (0 = square to the lot)
  props: Record<string, string | number | boolean | null>;  // kind-specific settings
  links: { trayId?, speciesId?, entityId? };                 // ties to the rest of the garden
  notes: string | null;
  createdAt: string; updatedAt: string;
};
```

A box is enough for beds, buildings, slabs, fences, hedges, tree canopies, pipes and rails, and it keeps snapping, resizing and drawing simple. Things with an inherent direction (fences, paths, drip lines, gantries, a bed's rows) run along the box's **long side**.

`x`, `y`, `w` and `d` describe the box before it's turned; `rot` then turns it about its center. Drawers never deal with the turn themselves: `drawEntity` hands each one `entityProjector(pj, e)`, a projector that turns points about the entity's center before projecting, so a drawer written for a square box draws correctly at any angle, and so does everything inside it (a bed's rows of plants, a building's walls and windows). The rest of the geometry helpers work on turned boxes too: `footprintCorners` gives a footprint's corners, `footprintBounds` the square box around it (used when placing new things), and `resizeFromCorner` resizes from the turned corner while the opposite corner stays put. A bed's rows run along its long side, so `longSideBearing` and `rotForBearing` convert between a turn and the rows' true compass heading, using the lot's `northDeg`.

Entities live in their own IndexedDB store, `mapEntities` (database version 2), and travel in the garden file like every other record. An entity whose kind this version doesn't know still loads, edits and draws as a plain box, so a garden file from a newer version is safe to open.

### Links

- `trayId`: a planter. A bed linked to a planter draws its rows: rows run along the bed's long side and are spread evenly across it, and each row's plants are spaced evenly along it. The positions come from `layoutBed` in `src/lib/bedLayout.ts`, the same layout the planter page draws, so the two always agree. Plants are colored by crop (`src/lib/plantColors.ts`), drawn by growth stage, and tinted by their latest check. The bed's size on the map is the planter's size: changing it on the planter page resizes the map bed, and linking a planter that already has a size resizes the bed to match. A seed station linked to a tray draws its cells.
- `speciesId`: a plant from the seed library, e.g. the variety of a fruit tree.
- `entityId`: another map entity this one belongs to: netting over a bed, a drip line or sensor in a bed, a valve feeding a zone, a gantry over a bed. Removing an entity clears links that point to it.

## Kinds

`KINDS` in `kinds.ts` is pure data:

```ts
{
  kind: "raised-bed", label: "Raised bed", icon: "🟤", layer: "growing",
  description: "Raised bed; link a planter to show its rows and plants.",
  defaults: { name: "Raised bed", w: 8, d: 4, h: 1 },
  fields: [...],     // extra settings, edited in the panel, stored in props
  links: ["tray"],   // which link pickers the panel shows
  flat: false,       // ground covers draw beneath everything else
  resizable: true,   // points (outlet, spigot) keep their size
}
```

Layers group kinds for drawing order, the add palette and show/hide: ground & paths, house & structures, beds & plants, water & power, irrigation, automation, areas & labels.

Today's kinds: lawn, path (pavers, stepping stones, gravel, mulch, concrete), patio, driveway, mulch bed; house, shed, fence (privacy, picket, wire), gate, trellis, netting; raised bed, in-ground bed, herb garden, seed station, fruit tree, tree, shrub, hedge, container, compost; water spigot, power outlet, meter, AC unit, rain barrel; irrigation valve, sprinkler (spray radius, zone), drip line; robot gantry (planned or installed), robot dock, sensor; area (a named region such as "Front yard").

### Adding a kind

1. Add an entry to `KINDS`. That's enough for it to appear in the palette, be placed, edited, saved and drawn as a box.
2. Optionally add a drawer to `DRAWERS` in `render.tsx` for a better picture.
3. If it has settings, list them in `fields`. The panel builds number, text, select and checkbox inputs from them.

## Drawing

- `makeProjector(mode, rot, site)` maps world points to **scene** coordinates. Iso is a 2:1 dimetric projection (`sx = (rx − ry)·cos 30°`, `sy = (rx + ry)·½ − z·0.82`). Plan is top-down. `rot` turns the lot in quarter turns about its center, so you can look at it from any side.
- Zoom and pan are a single SVG transform over the scene, so panning never redraws. Strokes use `vector-effect: non-scaling-stroke` and patterns are in scene units, so the drawing scales like ink on paper.
- Order: flat kinds first (by layer, then largest first), then the sun's shadows, then solids back to front with `paintOrder`. In the isometric view one solid goes before another when its footprint lies wholly behind the other's along either ground axis (as the view sees them), so a long fence along the front covers the beds behind it even though its middle is far away; overlapping footprints (netting over a bed) fall back to center depth. The plan view draws lowest tops first. Inside a drawer, `Faces` sorts a solid's faces by depth.
- Drawers get `{ pj, data, today, zoom }`. They work in world feet and project through `pj`, so the same code draws both views and all rotations. Pins (`Pin`) and the selection handle divide by `zoom` to keep a constant size on screen.
- Labels are drawn in screen space on top, so text stays crisp. Areas are always labeled, and beds, buildings and trees once you zoom in.

## Sun and shadows

`src/lib/map/sun.ts` works out where the sun is (`sunPosition`, standard low-precision solar formulas, good to a fraction of a degree) from the time and the garden's location (`site.lat`, `site.lon`). Until the location is set, `gardenLocation` guesses one from the time zone's standard offset at 40°N, so the sun rises, peaks and sets about right.

- **Shadows** are cast straight onto the ground: each solid's footprint and top are pushed away from the sun by height ÷ tan(altitude) (capped for a sun at the horizon), and the shadow is the outline around both (`entityShadow`). Kinds choose a shape: boxes; buildings add the roof ridge; trees and shrubs cast a canopy on a trunk; ground covers and areas cast none. Turned entities cast turned shadows. All shadows are one path clipped to the lot, drawn between the ground covers and the solids, so overlaps don't double up.
- **The sun** is drawn at the edge of the map in the direction of its real place in the sky (out past the lot, raised by its altitude), with its altitude. Below the horizon the scene is shaded for night, fading in through twilight.
- **The clock** follows the real time by default. Drag through the day or pick a date to move the sun; *Now* goes back to live. The ☀️ box turns sun and shadows off.
- **Location** (lot settings): pick a city from the list (`src/lib/map/places.ts`), paste coordinates (`parseLatLng` reads Google Maps' `@30.1836998,-97.7891487`, whole Google Maps links, preferring a dropped pin's `!3d…!4d…` over the view's center, `30.18, -97.78`, and `30.18° N, 97.78° W`), type latitude and longitude, or use this device's location. It's kept to four decimals (about 10 m).
- **North**: drag the compass on the map until its N points at true north on your lot (the screen direction is turned back into a ground direction with `unprojectDelta`, so it works in every view and rotation). The sun, shadows and bed headings follow as you drag; it's saved when you let go. The lot settings have the same angle as a number.

## Interaction

- Drag the background, or anything that isn't selected, to **pan**. That way a lawn can't be dragged away by accident.
- Tap or click something to **select** it (`/map?e=<id>`, so a selection can be linked to). Drag the selected thing to **move** it, its corner handle to **resize** it, or the ⟳ handle off the end of its long side to **turn** it (5° steps, 1° with shift). Moves snap to the site grid. The panel shows the turn, and which way the long side runs by the compass ("Rows run 25° from north, NNE–SSW" for a bed); typing a heading turns the bed to match.
- Scroll, pinch, or the − / + buttons to **zoom**. The buttons zoom in on the selection. *Fit* shows the whole lot.
- *Iso* / *Plan* switch views and ⟲ / ⟳ turn the lot; the ground in the middle of the screen stays put.
- Keyboard (when the map has focus): arrows nudge the selection by the grid step (shift: 1 ft), `[` and `]` turn it 5° (shift: 1°), Delete removes it, Escape clears the selection.
- The side panel edits the selection live (name, position, size, kind settings, links, notes, duplicate, remove). With nothing selected it shows the add palette, layer toggles, a list of everything on the map, and the lot's settings.
- New things land in the nearest clear spot to the middle of the view (`freeSpot`).
- The view (mode, rotation, zoom, center) is remembered per browser in localStorage. It isn't part of the garden.

## Assistant

On the map page, the assistant's context lists the lot and every entity with its ID, kind, position, size, settings and links (plus which one is selected). Its `edit_map` tool adds, updates and removes entities in a batch, so "add a 4×8 bed east of Bed 3 and run a drip line along it" works in one message.

## Where it's headed

The model is meant to grow without migrations: new kinds are data, new settings go in `props`, new relationships in `links`.

- **Irrigation zones.** Valves (`props.zone`) feed sprinklers and drip lines with the same zone. Next: a zone record with a schedule and flow rate, coverage shading from sprinkler radii and drip lines, and checking that every bed is covered. A controller kind (on the house wall, near the outlet) would own the zones and could later be driven from the app.
- **Sensors.** `sensor` entities linked to a bed. Readings would be a new store keyed by sensor ID, shown on the map as badges and fed to the assistant.
- **Robotic cultivation.** `gantry` covers a bed on rails, FarmBot style. Plant positions already come from `bedPlants`, so a gantry can be given exact seeding, watering and weeding coordinates per plant, and per-plant checks (pests, weeds) can become jobs. A `robot-dock` and paths between beds would serve a rover.
- **Sun and shade.** Shadows are drawn for any date and time. Next: shadows falling on raised things (beds, roofs) rather than only the ground, and adding up the hours of direct sun each bed gets over a day or a season, from the same `entityShadow` polygons.
- **Plants on the map.** Tapping a plant dot in a bed could open that plant's check form directly, as on the bed's page.
- **Shapes.** If a box stops being enough (curved beds, a winding path), add an optional `outline` polygon to an entity, used for drawing and hit-testing, with the box kept as its bounding box.
- **Sync.** Entities have `updatedAt` and stable IDs, ready for a future sync or merge between devices.
