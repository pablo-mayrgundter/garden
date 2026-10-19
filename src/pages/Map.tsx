import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { TrayGrid } from "@/components/ui";
import { addMapEntity, applySiteTemplate, createPlanterForEntity, deleteMapEntity, setSite, updateMapEntity } from "@/lib/actions";
import { coverPhotos, plantingViews, sortedSpecies, sortedTrays } from "@/lib/garden";
import { useGarden } from "@/lib/GardenContext";
import {
  compassPoint,
  entityProjector,
  footprintBounds,
  freeSpot,
  longSideBearing,
  makeProjector,
  normDeg,
  paintOrder,
  resizeFromCorner,
  rotForBearing,
  siteBounds,
  snap,
  unprojectDelta,
  type Projector,
  type Rot,
  type ViewMode,
} from "@/lib/map/geometry";
import { KINDS, kindDef, type FieldDef } from "@/lib/map/kinds";
import { DEFAULT_SITE, LAYER_KEYS, LAYERS, type Layer, type MapEntity, type Site } from "@/lib/map/model";
import { drawEntity, MapPatterns, PAL } from "@/lib/map/render";
import { CITIES, CITY_REGIONS, nearestCity, parseLatLng } from "@/lib/map/places";
import { entityShadow, gardenLocation, shadowShape, sunFrom, sunGroundDirection, sunPosition, type SunPosition } from "@/lib/map/sun";

type View = { mode: ViewMode; rot: Rot; zoom: number; cx: number; cy: number };
type Draft = { id: string; x: number; y: number; w: number; d: number; rot?: number };
type Drag =
  | { type: "pan"; sx: number; sy: number; view: View; moved: boolean; selectId: string | null }
  | { type: "move" | "resize" | "rotate"; sx: number; sy: number; entity: MapEntity; moved: boolean }
  | { type: "compass"; sx: number; sy: number; moved: boolean };

/** Where the compass sits, from the map's bottom-right corner. */
const COMPASS_INSET = 40;

const VIEW_KEY = "garden.mapView";
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 80;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function readView(): Partial<View> {
  try {
    return JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    // Private mode: the view just isn't remembered.
  }
}

function fitView(pj: Projector, width: number, height: number): Pick<View, "zoom" | "cx" | "cy"> {
  const b = siteBounds(pj);
  const zoom = clampZoom(Math.min(width / (b.maxX - b.minX), height / (b.maxY - b.minY)) * 0.92);
  return { zoom, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
}

/** Kinds whose names are worth printing on the map. */
const LABELLED = new Set(["house", "shed", "raised-bed", "in-ground-bed", "herb-garden", "seed-station", "fruit-tree", "tree", "compost", "gantry", "patio"]);

export function MapPage() {
  const { data, today, act } = useGarden();
  const savedSite: Site = data.garden.site ?? DEFAULT_SITE;
  // While the compass is being turned, north follows it before it's saved.
  const [northDraft, setNorthDraft] = useState<number | null>(null);
  const site = useMemo(() => (northDraft == null ? savedSite : { ...savedSite, northDeg: northDraft }), [savedSite, northDraft]);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("e");
  const select = useCallback(
    (id: string | null) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (id) n.set("e", id);
          else n.delete("e");
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>(() => ({ mode: "iso", rot: 1, zoom: 0, cx: 0, cy: 0, ...readView() }));
  const [hidden, setHidden] = useState<Set<Layer>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const pj = useMemo(() => makeProjector(view.mode, view.rot, site), [view.mode, view.rot, site]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: Math.max(200, entry.contentRect.width), h: Math.max(200, entry.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // First visit (or a forgotten view): fit the lot to the screen.
  useEffect(() => {
    if (view.zoom === 0 && size.w) setView((v) => ({ ...v, ...fitView(pj, size.w, size.h) }));
  }, [view.zoom, pj, size.w, size.h]);

  useEffect(() => {
    if (view.zoom) writeView(view);
  }, [view]);

  const toScreen = useCallback((sx: number, sy: number): [number, number] => [(sx - view.cx) * view.zoom + size.w / 2, (sy - view.cy) * view.zoom + size.h / 2], [view, size]);
  const toScene = useCallback((px: number, py: number): [number, number] => [(px - size.w / 2) / view.zoom + view.cx, (py - size.h / 2) / view.zoom + view.cy], [view, size]);

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) =>
      setView((v) => {
        const zoom = clampZoom(v.zoom * factor);
        // Keep the scene point under the cursor where it is.
        const sx = (px - size.w / 2) / v.zoom + v.cx;
        const sy = (py - size.h / 2) / v.zoom + v.cy;
        return { ...v, zoom, cx: sx - (px - size.w / 2) / zoom, cy: sy - (py - size.h / 2) / zoom };
      }),
    [size],
  );

  // Wheel zoom needs a non-passive listener to stop the page scrolling.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /** Changes the projection while keeping the same spot of ground in the middle of the screen. */
  const reproject = (mode: ViewMode, rot: Rot) => {
    const [wx, wy] = pj.unproject(view.cx, view.cy);
    const next = makeProjector(mode, rot, site);
    const [cx, cy] = next.p(wx, wy);
    setView((v) => ({ ...v, mode, rot, cx, cy }));
  };

  const entities = useMemo(() => {
    const list = data.mapEntities.map((e) => (draft && draft.id === e.id ? { ...e, ...draft } : e)).filter((e) => !hidden.has(kindDef(e.kind).layer));
    const flat = list.filter((e) => kindDef(e.kind).flat).sort((a, b) => LAYERS[kindDef(a.kind).layer].order - LAYERS[kindDef(b.kind).layer].order || b.w * b.d - a.w * a.d);
    const solid = paintOrder(pj, list.filter((e) => !kindDef(e.kind).flat));
    return { flat, solid, all: [...flat, ...solid] };
  }, [data.mapEntities, draft, hidden, pj]);

  const selected = entities.all.find((e) => e.id === selectedId) ?? null;

  // ---------- Sun and shadows ----------

  const [clock, setClock] = useState<{ live: boolean; at: number }>({ live: true, at: Date.now() });
  const [shadows, setShadows] = useState(true);
  useEffect(() => {
    if (!clock.live) return;
    const t = setInterval(() => setClock({ live: true, at: Date.now() }), 30_000);
    return () => clearInterval(t);
  }, [clock.live]);
  const when = new Date(clock.at);
  const where = gardenLocation(site, when);
  const sun = sunPosition(when, where.lat, where.lon);
  const shadowPaths = useMemo(() => {
    if (!shadows || sun.altitude <= 0) return "";
    return entities.solid
      .map((e) => entityShadow(e, shadowShape(e.kind, kindDef(e.kind).flat), sun, site.northDeg))
      .filter((poly): poly is [number, number][] => !!poly && poly.length > 2)
      .map((poly) => poly.map(([x, y], i) => `${i ? "L" : "M"}${pj.p(x, y, 0.03).map((v) => v.toFixed(3)).join(" ")}`).join(" ") + " Z")
      .join(" ");
  }, [shadows, sun.altitude, sun.azimuth, entities.solid, site.northDeg, pj]);

  // ---------- Pointer handling ----------

  const localPoint = (ev: { clientX: number; clientY: number }) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const startDrag = (ev: RPointerEvent, d: Drag) => {
    svgRef.current?.setPointerCapture(ev.pointerId);
    drag.current = d;
  };

  const onPointerDown = (ev: RPointerEvent<SVGSVGElement>) => {
    // No text selection or native dragging while panning; keep keyboard focus for nudging.
    ev.preventDefault();
    svgRef.current?.focus({ preventScroll: true });
    const pt = localPoint(ev);
    pointers.current.set(ev.pointerId, pt);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
      drag.current = null;
      return;
    }
    const target = (ev.target as Element).closest("[data-handle], [data-id]");
    const handle = target?.getAttribute("data-handle");
    const id = target?.getAttribute("data-id") ?? null;
    if (handle === "compass") {
      startDrag(ev, { type: "compass", sx: pt.x, sy: pt.y, moved: false });
    } else if ((handle === "resize" || handle === "rotate") && selected) {
      startDrag(ev, { type: handle, sx: pt.x, sy: pt.y, entity: selected, moved: false });
    } else if (id && id === selectedId && selected) {
      startDrag(ev, { type: "move", sx: pt.x, sy: pt.y, entity: selected, moved: false });
    } else {
      // Dragging anything that isn't selected pans, so a lawn can't be moved by accident.
      startDrag(ev, { type: "pan", sx: pt.x, sy: pt.y, view, moved: false, selectId: id });
    }
  };

  const onPointerMove = (ev: RPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(ev.pointerId)) return;
    const pt = localPoint(ev);
    pointers.current.set(ev.pointerId, pt);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const factor = (pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist)) / view.zoom;
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, factor);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = pt.x - d.sx;
    const dy = pt.y - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    if (d.type === "pan") {
      setView({ ...d.view, cx: d.view.cx - dx / d.view.zoom, cy: d.view.cy - dy / d.view.zoom });
      return;
    }
    if (d.type === "compass") {
      // Point the N arrow at the pointer: turn that screen direction back into a direction on the ground.
      const vx = pt.x - (size.w - COMPASS_INSET);
      const vy = pt.y - (size.h - COMPASS_INSET);
      if (Math.hypot(vx, vy) < 6) return;
      const [gx, gy] = unprojectDelta(pj, vx, vy);
      const deg = (Math.atan2(gx, -gy) * 180) / Math.PI;
      setNorthDraft((((Math.round(deg) % 360) + 360) % 360));
      return;
    }
    const [wx, wy] = unprojectDelta(pj, dx / view.zoom, dy / view.zoom);
    const e = d.entity;
    const g = site.gridFt;
    if (d.type === "move") {
      setDraft({ id: e.id, x: snap(e.x + wx, g), y: snap(e.y + wy, g), w: e.w, d: e.d, rot: e.rot });
    } else if (d.type === "resize") {
      setDraft({ id: e.id, ...resizeFromCorner(e, wx, wy, (v) => snap(v, g), Math.max(g, 0.25)), rot: e.rot });
    } else {
      // Turn so the handle follows the pointer: 5° steps, 1° with shift.
      const [gx, gy] = pj.unproject(...toScene(pt.x, pt.y));
      const angle = (Math.atan2(gy - (e.y + e.d / 2), gx - (e.x + e.w / 2)) * 180) / Math.PI - (e.w >= e.d ? 0 : 90);
      const step = ev.shiftKey ? 1 : 5;
      setDraft({ id: e.id, x: e.x, y: e.y, w: e.w, d: e.d, rot: normDeg(Math.round(angle / step) * step) });
    }
  };

  const onPointerUp = (ev: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(ev.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.type === "pan") {
      if (!d.moved) select(d.selectId);
      return;
    }
    if (d.type === "compass") {
      if (northDraft != null) act((ctx) => setSite(ctx, { ...savedSite, northDeg: northDraft })).finally(() => setNorthDraft(null));
      return;
    }
    if (d.moved && draft) {
      const { id, ...geom } = draft;
      act((ctx) => updateMapEntity(ctx, id, geom)).finally(() => setDraft(null));
    }
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (!selected) return;
    if (ev.key === "Escape") return select(null);
    if (ev.key === "Delete" || ev.key === "Backspace") {
      ev.preventDefault();
      if (confirm(`Remove ${selected.name} from the map?`)) act((ctx) => deleteMapEntity(ctx, selected.id)).then(() => select(null));
      return;
    }
    // [ and ] turn the selection (5°, or 1° with shift).
    if ((ev.key === "[" || ev.key === "]" || ev.key === "{" || ev.key === "}") && kindDef(selected.kind).resizable) {
      ev.preventDefault();
      const step = (ev.shiftKey ? 1 : 5) * (ev.key === "[" || ev.key === "{" ? -1 : 1);
      act((ctx) => updateMapEntity(ctx, selected.id, { rot: normDeg((selected.rot ?? 0) + step) }));
      return;
    }
    // Arrows nudge along the ground grid as it's drawn (diagonals in the isometric view).
    const dir = ({ ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] } as Record<string, [number, number]>)[ev.key];
    if (!dir) return;
    ev.preventDefault();
    const step = ev.shiftKey ? 1 : Math.max(site.gridFt, 0.25);
    const [ax, ay] = pj.fromR(dir[0] * step, dir[1] * step);
    const [bx, by] = pj.fromR(0, 0);
    act((ctx) => updateMapEntity(ctx, selected.id, { x: selected.x + ax - bx, y: selected.y + ay - by }));
  };

  // ---------- Adding things ----------

  const add = async (kind: string) => {
    const [wx, wy] = pj.unproject(view.cx, view.cy);
    const def = kindDef(kind);
    const { w, d } = def.defaults;
    // Ground covers can go anywhere; anything else lands in the nearest clear spot.
    const taken = def.flat ? [] : data.mapEntities.filter((e) => !kindDef(e.kind).flat).map(footprintBounds);
    const spot = freeSpot(taken, site, wx, wy, w, d, Math.max(site.gridFt, 0.5));
    const id = await act((ctx) => addMapEntity(ctx, kind, { x: spot.x + w / 2, y: spot.y + d / 2 }, { x: spot.x, y: spot.y }));
    if (hidden.has(kindDef(kind).layer)) setHidden((h) => new Set([...h].filter((l) => l !== kindDef(kind).layer)));
    select(id);
  };

  /** The zoom buttons zoom in on the selected thing, bringing it to the middle, or else on the middle of the view. */
  const zoomBy = (factor: number) => {
    if (!selected) return zoomAt(size.w / 2, size.h / 2, factor);
    const [cx, cy] = pj.p(selected.x + selected.w / 2, selected.y + selected.d / 2, selected.z);
    setView((v) => ({ ...v, cx, cy, zoom: clampZoom(v.zoom * factor) }));
  };

  /** Selects something and brings it into the middle of the view. */
  const focusOn = (e: MapEntity) => {
    const [sx, sy] = pj.p(e.x + e.w / 2, e.y + e.d / 2, e.z);
    setView((v) => ({ ...v, cx: sx, cy: sy }));
    select(e.id);
  };

  const empty = data.mapEntities.length === 0;
  const ctx = { pj, data, today, zoom: view.zoom || 1, sunShadows: shadows && sun.altitude > 0 };
  // Night: shade the whole scene, fading in through twilight.
  const night = Math.min(1, Math.max(0, -sun.altitude / 8)) * 0.42;
  const transform = `translate(${size.w / 2 - view.cx * view.zoom} ${size.h / 2 - view.cy * view.zoom}) scale(${view.zoom || 1})`;
  const lot: [number, number, number][] = [
    [0, 0, 0],
    [site.width, 0, 0],
    [site.width, site.depth, 0],
    [0, site.depth, 0],
  ];
  const lotPath = lot.map((q, i) => `${i ? "L" : "M"}${pj.p(q[0], q[1], q[2]).join(" ")}`).join(" ") + " Z";
  const gridStep = view.zoom > 14 ? 1 : view.zoom > 4 ? 5 : 10;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Garden map</h1>
          <p className="sub">The whole lot, house and yards. Drag to pan, scroll or pinch to zoom, tap something to select it, then drag it to move.</p>
        </div>
      </div>

      <div className="map-layout">
        <div className="map-wrap card" ref={wrapRef}>
          <svg
            ref={svgRef}
            className="map-svg"
            width={size.w}
            height={size.h}
            tabIndex={0}
            role="application"
            aria-label="Garden map"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <MapPatterns />
            <rect width={size.w} height={size.h} fill="var(--map-bg)" />
            <g transform={transform}>
              <path d={lotPath} fill={PAL.paper} stroke={PAL.ink} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              <Grid pj={pj} site={site} step={gridStep} />
              {entities.flat.map((e) => (
                <g key={e.id} data-id={e.id} className={`ent ent-${e.kind}`}>
                  {drawEntity(e, ctx)}
                </g>
              ))}
              {shadowPaths && (
                <>
                  <clipPath id="lot-clip">
                    <path d={lotPath} />
                  </clipPath>
                  <path d={shadowPaths} fill="#1d2440" fillOpacity={0.2} pointerEvents="none" clipPath="url(#lot-clip)" />
                </>
              )}
              {entities.solid.map((e) => (
                <g key={e.id} data-id={e.id} className={`ent ent-${e.kind}`}>
                  {drawEntity(e, ctx)}
                </g>
              ))}
              {selected && <Selection pj={pj} e={selected} zoom={view.zoom || 1} resizable={kindDef(selected.kind).resizable ?? false} />}
            </g>
            {shadows && <Sun pj={pj} site={site} sun={sun} toScreen={toScreen} w={size.w} h={size.h} />}
            {night > 0 && <rect width={size.w} height={size.h} fill="#141b3c" fillOpacity={night} pointerEvents="none" />}
            <Labels entities={entities.all} pj={pj} toScreen={toScreen} zoom={view.zoom} selectedId={selectedId} />
            <Compass pj={pj} site={site} x={size.w - COMPASS_INSET} y={size.h - COMPASS_INSET} turning={northDraft != null} />
          </svg>

          <div className="map-toolbar">
            <div className="seg">
              <button className={view.mode === "iso" ? "on" : ""} onClick={() => reproject("iso", view.rot)} title="Isometric view">Iso</button>
              <button className={view.mode === "plan" ? "on" : ""} onClick={() => reproject("plan", view.rot)} title="Top-down plan">Plan</button>
            </div>
            <div className="seg">
              <button onClick={() => reproject(view.mode, ((view.rot + 3) % 4) as Rot)} title="Turn left">⟲</button>
              <button onClick={() => reproject(view.mode, ((view.rot + 1) % 4) as Rot)} title="Turn right">⟳</button>
            </div>
            <div className="seg">
              <button onClick={() => zoomBy(1 / 1.4)} title="Zoom out">−</button>
              <button onClick={() => zoomBy(1.4)} title="Zoom in">+</button>
              <button onClick={() => setView((v) => ({ ...v, ...fitView(pj, size.w, size.h) }))} title="Fit the lot">Fit</button>
            </div>
          </div>

          <SunClock
            clock={clock}
            setClock={setClock}
            sun={sun}
            approximate={where.approximate}
            shadows={shadows}
            setShadows={setShadows}
          />

          {empty && (
            <div className="map-empty card">
              <h3>Lay out your place</h3>
              <p className="small muted">Start from a typical lot (house, front and back yards, fence, three raised beds, water and power on the side of the house) and drag things to match, or start with an empty {site.width} × {site.depth} ft lot.</p>
              <div className="row">
                <button className="primary" onClick={() => act(applySiteTemplate)}>Start from a typical lot</button>
                <button onClick={() => act((c) => setSite(c, site))}>Empty lot</button>
              </div>
            </div>
          )}
        </div>

        <aside className="map-panel stack">
          {selected ? (
            <EntityPanel key={selected.id} e={selected} onClose={() => select(null)} onSelect={select} />
          ) : (
            <>
              <section className="card">
                <h3>Add to the map</h3>
                <p className="small muted">Added in the middle of the view; drag it into place.</p>
                {LAYER_KEYS.map((l) => (
                  <div key={l} className="palette-group">
                    <div className="small muted">{LAYERS[l].label}</div>
                    <div className="palette">
                      {KINDS.filter((k) => k.layer === l).map((k) => (
                        <button key={k.kind} className="small" onClick={() => add(k.kind)} title={k.description}>
                          {k.icon} {k.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
              <section className="card">
                <h3>Layers</h3>
                <div className="layer-toggles">
                  {LAYER_KEYS.map((l) => (
                    <label key={l} className="check">
                      <input
                        type="checkbox"
                        checked={!hidden.has(l)}
                        onChange={(ev) => setHidden((h) => { const n = new Set(h); if (ev.target.checked) n.delete(l); else n.add(l); return n; })}
                      />
                      {LAYERS[l].label}
                    </label>
                  ))}
                </div>
              </section>
              {!empty && (
                <section className="card">
                  <details>
                    <summary>Everything on the map ({data.mapEntities.length})</summary>
                    <ul className="ent-list">
                      {[...data.mapEntities]
                        .sort((a, b) => LAYERS[kindDef(a.kind).layer].order - LAYERS[kindDef(b.kind).layer].order || a.name.localeCompare(b.name))
                        .map((e) => (
                          <li key={e.id}>
                            <button className="ghost small" onClick={() => focusOn(e)}>{kindDef(e.kind).icon} {e.name}</button>
                          </li>
                        ))}
                    </ul>
                  </details>
                </section>
              )}
              <SitePanel site={site} />
            </>
          )}
        </aside>
      </div>
    </>
  );
}

// ---------- Map overlays ----------

function Grid({ pj, site, step }: { pj: Projector; site: Site; step: number }) {
  const lines: string[] = [];
  for (let x = step; x < site.width; x += step) lines.push(`M${pj.p(x, 0).join(" ")} L${pj.p(x, site.depth).join(" ")}`);
  for (let y = step; y < site.depth; y += step) lines.push(`M${pj.p(0, y).join(" ")} L${pj.p(site.width, y).join(" ")}`);
  return <path d={lines.join(" ")} stroke={PAL.ink} strokeOpacity={0.08} strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none" pointerEvents="none" />;
}

function Selection({ pj: base, e, zoom, resizable }: { pj: Projector; e: MapEntity; zoom: number; resizable: boolean }) {
  // Through the entity's own projector, so the outline and handles turn with it.
  const pj = entityProjector(base, e);
  const ring = (z: number) => [pj.p(e.x, e.y, z), pj.p(e.x + e.w, e.y, z), pj.p(e.x + e.w, e.y + e.d, z), pj.p(e.x, e.y + e.d, z)].map((q, i) => `${i ? "L" : "M"}${q.join(" ")}`).join(" ") + " Z";
  const [hx, hy] = pj.p(e.x + e.w, e.y + e.d, e.z);
  // The turn handle sits off the end of the long side.
  const off = 22 / zoom;
  const alongX = e.w >= e.d;
  const [ex, ey] = pj.p(alongX ? e.x + e.w : e.x + e.w / 2, alongX ? e.y + e.d / 2 : e.y + e.d, e.z);
  const [tx, ty] = pj.p(alongX ? e.x + e.w + off : e.x + e.w / 2, alongX ? e.y + e.d / 2 : e.y + e.d + off, e.z);
  return (
    <g pointerEvents="none">
      <path d={ring(e.z)} fill={PAL.accent} fillOpacity={0.12} stroke={PAL.accent} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeDasharray="6 3" />
      {pj.mode === "iso" && e.h > 0.5 && <path d={ring(e.z + e.h)} fill="none" stroke={PAL.accent} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      {resizable && (
        <>
          <line x1={ex} y1={ey} x2={tx} y2={ty} stroke={PAL.accent} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <g data-handle="rotate" pointerEvents="all" style={{ cursor: "grab" }}>
            <title>Drag to turn ([ and ] keys too)</title>
            <circle cx={tx} cy={ty} r={8 / zoom} fill={PAL.accent} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <text x={tx} y={ty} fontSize={11 / zoom} fill="#fff" textAnchor="middle" dominantBaseline="central">⟳</text>
          </g>
          <circle data-handle="resize" cx={hx} cy={hy} r={7 / zoom} fill="#fff" stroke={PAL.accent} strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="all" style={{ cursor: "nwse-resize" }}>
            <title>Drag to resize</title>
          </circle>
        </>
      )}
    </g>
  );
}

/**
 * The sun, at the edge of the map in the direction of its real place in the
 * sky (out past the lot that way, raised by its altitude), with its altitude.
 */
function Sun({ pj, site, sun, toScreen, w, h }: { pj: Projector; site: Site; sun: SunPosition; toScreen: (x: number, y: number) => [number, number]; w: number; h: number }) {
  if (sun.altitude < -1) return null;
  const R = Math.max(site.width, site.depth) * 0.62;
  const [ux, uy] = sunGroundDirection(sun, site.northDeg);
  const lift = R * 0.55 * Math.sin((Math.max(0, sun.altitude) * Math.PI) / 180);
  const [tx, ty] = toScreen(...pj.p(site.width / 2 + ux * R, site.depth / 2 + uy * R, lift));
  const [ox, oy] = toScreen(...pj.p(site.width / 2, site.depth / 2, 0));
  const dx = tx - ox || 1e-6;
  const dy = ty - oy;
  // Out from the middle of the map, in that direction, to just inside its edge.
  const m = 34;
  const t = Math.min(Math.abs((w / 2 - m) / dx), dy ? Math.abs((h / 2 - m) / dy) : Infinity);
  const sx = w / 2 + dx * t;
  const sy = h / 2 + dy * t;
  const r = 12;
  const color = sun.altitude < 8 ? "#f08a3c" : "#f6b93b";
  return (
    <g pointerEvents="none" className="map-sun">
      <title>{`Sun ${Math.round(sun.altitude)}° up, from the ${sunFrom(sun.azimuth)}`}</title>
      <circle cx={sx} cy={sy} r={r * 2.3} fill={color} fillOpacity={0.2} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={sx + Math.cos(a) * r * 1.35} y1={sy + Math.sin(a) * r * 1.35} x2={sx + Math.cos(a) * r * 1.85} y2={sy + Math.sin(a) * r * 1.85} stroke={color} strokeWidth={2} strokeLinecap="round" />;
      })}
      <circle cx={sx} cy={sy} r={r} fill={color} stroke="#c47a12" strokeWidth={1} />
      <text x={sx} y={sy + r * 2.3 + 10} textAnchor="middle" className="sun-label">{Math.max(0, Math.round(sun.altitude))}°</text>
    </g>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The map's clock: live by default; drag through the day (or pick a date) to see the shadows move. */
function SunClock({
  clock,
  setClock,
  sun,
  approximate,
  shadows,
  setShadows,
}: {
  clock: { live: boolean; at: number };
  setClock: (c: { live: boolean; at: number }) => void;
  sun: SunPosition;
  approximate: boolean;
  shadows: boolean;
  setShadows: (on: boolean) => void;
}) {
  const at = new Date(clock.at);
  const minutes = at.getHours() * 60 + at.getMinutes();
  const set = (d: Date) => setClock({ live: false, at: d.getTime() });
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className="map-clock">
      <div className="row small">
        <label className="check" title="Sun and shadows">
          <input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} /> ☀️
        </label>
        <strong>{time}</strong>
        <span className="muted">
          {sun.altitude > 0 ? `sun ${Math.round(sun.altitude)}° up, from the ${sunFrom(sun.azimuth)}` : "sun down"}
        </span>
        {clock.live ? <span className="live-dot" title="Following the real time">live</span> : (
          <button className="ghost small" onClick={() => setClock({ live: true, at: Date.now() })}>Now</button>
        )}
      </div>
      {shadows && (
        <div className="row small">
          <input
            type="range"
            min={0}
            max={1439}
            step={5}
            value={minutes}
            aria-label="Time of day"
            onChange={(e) => {
              const m = Number(e.target.value);
              const d = new Date(clock.at);
              d.setHours(Math.floor(m / 60), m % 60, 0, 0);
              set(d);
            }}
          />
          <input
            type="date"
            value={localDate(at)}
            aria-label="Date"
            onChange={(e) => {
              const [y, mo, da] = e.target.value.split("-").map(Number);
              if (!y) return;
              const d = new Date(clock.at);
              d.setFullYear(y, mo - 1, da);
              set(d);
            }}
          />
        </div>
      )}
      {shadows && approximate && <div className="small muted">Location guessed from your time zone; set it under The lot.</div>}
    </div>
  );
}

function Labels({ entities, pj, toScreen, zoom, selectedId }: { entities: MapEntity[]; pj: Projector; toScreen: (x: number, y: number) => [number, number]; zoom: number; selectedId: string | null }) {
  return (
    <g className="map-labels" pointerEvents="none">
      {entities.map((e) => {
        const isArea = e.kind === "area";
        if (!(e.id === selectedId || isArea || (LABELLED.has(e.kind) && zoom >= 3.5))) return null;
        const [sx, sy] = isArea ? pj.p(e.x + e.w / 2, e.y + e.d / 2, 0) : pj.p(e.x + e.w / 2, e.y + e.d / 2, e.z + e.h);
        const [x, y] = toScreen(sx, sy);
        return (
          <text key={e.id} x={x} y={isArea ? y : y - 6} className={isArea ? "area-label" : "ent-label"} textAnchor="middle">
            {e.name}
          </text>
        );
      })}
    </g>
  );
}

/** Which way north is. Drag it to point the N at true north on your lot; the sun, shadows and bed headings follow. */
function Compass({ pj, site, x, y, turning }: { pj: Projector; site: Site; x: number; y: number; turning: boolean }) {
  const th = (site.northDeg * Math.PI) / 180;
  const cx = site.width / 2;
  const cy = site.depth / 2;
  const [ax, ay] = pj.p(cx, cy);
  const [bx, by] = pj.p(cx + Math.sin(th), cy - Math.cos(th));
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const R = 26;
  return (
    <g className={`compass ${turning ? "turning" : ""}`} data-handle="compass" style={{ cursor: turning ? "grabbing" : "grab" }}>
      <title>Drag to point N at true north on your lot</title>
      <circle cx={x} cy={y} r={R} fill="#fffaf0" stroke={turning ? PAL.accent : PAL.ink} strokeOpacity={turning ? 1 : 0.4} strokeWidth={turning ? 2 : 1} />
      {[0, 90, 180, 270].map((a) => {
        const r = (a * Math.PI) / 180;
        // Ticks for the other compass points, turned with north.
        const tx = ux * Math.cos(r) - uy * Math.sin(r);
        const ty = uy * Math.cos(r) + ux * Math.sin(r);
        return a === 0 ? null : <line key={a} x1={x + tx * (R - 6)} y1={y + ty * (R - 6)} x2={x + tx * (R - 2)} y2={y + ty * (R - 2)} stroke={PAL.ink} strokeOpacity={0.5} strokeWidth={1.5} />;
      })}
      <line x1={x - ux * 15} y1={y - uy * 15} x2={x + ux * 5} y2={y + uy * 5} stroke={PAL.ink} strokeWidth={1.5} />
      <path d={`M${x + ux * 10} ${y + uy * 10} L${x + ux * 2 - uy * 5} ${y + uy * 2 + ux * 5} L${x + ux * 2 + uy * 5} ${y + uy * 2 - ux * 5} Z`} fill="#b23a2e" />
      <text x={x + ux * 18} y={y + uy * 18} fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill="#b23a2e">N</text>
      {(turning || site.northDeg !== 0) && (
        <text x={x} y={y - R - 8} fontSize={11} fontWeight={600} textAnchor="middle" className="compass-deg">{Math.round(site.northDeg)}°</text>
      )}
    </g>
  );
}

// ---------- Panels ----------

/** A number input that writes through as you type, and follows the map when you aren't typing in it. */
function NumField({ label, value, onCommit, step = 0.5, min, unit = "ft" }: { label: string; value: number; onCommit: (v: number) => void; step?: number; min?: number; unit?: string }) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(+value.toFixed(2)));
  }, [value]);
  return (
    <label className="num-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(String(+value.toFixed(2)));
        }}
        onChange={(ev) => {
          setText(ev.target.value);
          const v = Number(ev.target.value);
          if (ev.target.value !== "" && Number.isFinite(v) && (min == null || v >= min)) onCommit(v);
        }}
      />
      {unit && <span className="muted small">{unit}</span>}
    </label>
  );
}

function TextField({ value, onCommit, multiline, placeholder }: { value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => text !== value && onCommit(text);
  return multiline ? (
    <textarea rows={3} value={text} placeholder={placeholder} onChange={(ev) => setText(ev.target.value)} onBlur={commit} />
  ) : (
    <input value={text} placeholder={placeholder} onChange={(ev) => setText(ev.target.value)} onBlur={commit} onKeyDown={(ev) => ev.key === "Enter" && commit()} />
  );
}

function PropField({ f, value, onCommit }: { f: FieldDef; value: string | number | boolean | null | undefined; onCommit: (v: string | number | boolean) => void }) {
  if (f.type === "number") return <NumField label={f.label} value={Number(value ?? 0)} step={f.step} min={f.min} unit={f.unit ?? ""} onCommit={onCommit} />;
  if (f.type === "boolean")
    return (
      <label className="check">
        <input type="checkbox" checked={!!value} onChange={(ev) => onCommit(ev.target.checked)} /> {f.label}
      </label>
    );
  if (f.type === "select")
    return (
      <label className="field">
        <span>{f.label}</span>
        <select value={String(value ?? "")} onChange={(ev) => onCommit(ev.target.value)}>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  return (
    <label className="field">
      <span>{f.label}</span>
      <TextField value={String(value ?? "")} onCommit={onCommit} />
    </label>
  );
}

function EntityPanel({ e, onClose, onSelect }: { e: MapEntity; onClose: () => void; onSelect: (id: string | null) => void }) {
  const { data, today, act } = useGarden();
  const def = kindDef(e.kind);
  const update = (patch: Partial<MapEntity>) => act((ctx) => updateMapEntity(ctx, e.id, patch));
  const tray = e.links.trayId ? data.trays.find((t) => t.id === e.links.trayId) : undefined;
  const species = e.links.speciesId ? data.species.find((s) => s.id === e.links.speciesId) : undefined;
  const others = data.mapEntities.filter((m) => m.id !== e.id && !kindDef(m.kind).flat).sort((a, b) => a.name.localeCompare(b.name));
  const plantings = tray ? plantingViews(data, today).filter((p) => p.trayId === tray.id) : [];

  const duplicate = async () => {
    const id = await act((ctx) =>
      addMapEntity(ctx, e.kind, { x: 0, y: 0 }, { name: `${e.name} copy`, x: e.x + 1, y: e.y + 1, w: e.w, d: e.d, h: e.h, z: e.z, rot: e.rot, props: { ...e.props }, notes: e.notes }),
    );
    onSelect(id);
  };

  return (
    <>
      <section className="card">
        <div className="panel-head">
          <span className="small muted">{def.icon} {def.label}</span>
          <button className="ghost small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <label className="field">
          <span>Name</span>
          <TextField value={e.name} onCommit={(name) => update({ name: name.trim() || def.defaults.name })} />
        </label>
        <div className="num-grid">
          <NumField label="X" value={e.x} onCommit={(x) => update({ x })} />
          <NumField label="Y" value={e.y} onCommit={(y) => update({ y })} />
          {def.resizable && (
            <>
              <NumField label="Width" value={e.w} min={0.1} onCommit={(w) => update({ w })} />
              <NumField label="Depth" value={e.d} min={0.1} onCommit={(d) => update({ d })} />
            </>
          )}
          <NumField label="Height" value={e.h} min={0} onCommit={(h) => update({ h })} />
          <NumField label="Raised" value={e.z} min={0} onCommit={(z) => update({ z })} />
          {def.resizable && <NumField label="Turn" value={e.rot ?? 0} step={5} unit="°" onCommit={(rot) => update({ rot: normDeg(rot) })} />}
        </div>
        {def.resizable && <Heading e={e} onCommit={(rot) => update({ rot })} />}
        <p className="small muted">{def.description} X runs east from the lot&rsquo;s west edge, Y south from its north edge.</p>
        {def.fields?.map((f) => <PropField key={f.key} f={f} value={e.props[f.key]} onCommit={(v) => update({ props: { [f.key]: v } })} />)}
      </section>

      {def.links?.includes("tray") && (
        <section className="card">
          <h3>Planter</h3>
          <select value={e.links.trayId ?? ""} onChange={(ev) => update({ links: { trayId: ev.target.value || null } })}>
            <option value="">— none —</option>
            {sortedTrays(data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {tray ? (
            <>
              <div style={{ marginTop: 10 }}>
                <TrayGrid tray={tray} plantings={plantings} covers={coverPhotos(data).byPlanting} mini />
              </div>
              <p className="small"><Link to={`/trays/${tray.id}`}>Open {tray.name} →</Link></p>
            </>
          ) : (
            <p className="small muted" style={{ marginTop: 8 }}>
              Link a planter to draw its rows here.{" "}
              <button className="small" onClick={() => act((ctx) => createPlanterForEntity(ctx, e.id))}>Create a planter for {e.name}</button>
            </p>
          )}
        </section>
      )}

      {def.links?.includes("species") && (
        <section className="card">
          <h3>Plant</h3>
          <select value={e.links.speciesId ?? ""} onChange={(ev) => update({ links: { speciesId: ev.target.value || null } })}>
            <option value="">— none —</option>
            {sortedSpecies(data).map((s) => <option key={s.id} value={s.id}>{s.commonName}{s.variety ? ` (${s.variety})` : ""}</option>)}
          </select>
          {species && <p className="small"><Link to={`/plants/${species.id}`}>Open {species.commonName} →</Link></p>}
        </section>
      )}

      {def.links?.includes("entity") && (
        <section className="card">
          <h3>Belongs to</h3>
          <select value={e.links.entityId ?? ""} onChange={(ev) => update({ links: { entityId: ev.target.value || null } })}>
            <option value="">— nothing —</option>
            {others.map((m) => <option key={m.id} value={m.id}>{kindDef(m.kind).icon} {m.name}</option>)}
          </select>
          {e.links.entityId && <p className="small"><button className="ghost small" onClick={() => onSelect(e.links.entityId!)}>Select it →</button></p>}
        </section>
      )}

      <section className="card">
        <h3>Notes</h3>
        <TextField multiline value={e.notes ?? ""} placeholder="Soil, sun, what's planned here…" onCommit={(v) => update({ notes: v.trim() || null })} />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="small" onClick={duplicate}>Duplicate</button>
          <button
            className="small danger"
            onClick={() => confirm(`Remove ${e.name} from the map?`) && act((ctx) => deleteMapEntity(ctx, e.id)).then(() => onSelect(null))}
          >
            Remove
          </button>
        </div>
      </section>
    </>
  );
}

/** Which way the long side (a bed's rows) runs, by the compass; editable. */
function Heading({ e, onCommit }: { e: MapEntity; onCommit: (rot: number) => void }) {
  const { data } = useGarden();
  const north = (data.garden.site ?? DEFAULT_SITE).northDeg;
  const bearing = Math.round(longSideBearing(e, north) * 10) / 10;
  const rows = e.links.trayId && data.trays.find((t) => t.id === e.links.trayId)?.layout === "rows";
  return (
    <div className="heading-field">
      <NumField label={rows ? "Rows run" : "Runs"} value={bearing} step={5} unit="° from north" onCommit={(b) => onCommit(rotForBearing(e, b, north))} />
      <span className="small muted">
        {compassPoint(bearing)}–{compassPoint(bearing + 180)}
        {north === 0 && " · north is the top of the plan until you set it in the lot settings"}
      </span>
    </div>
  );
}

const PASTE_HINT =
  "Paste from Google Maps: right-click a spot and click the coordinates to copy them, or copy the page's link. For example @30.1836998,-97.7891487";

/** Where the garden is, for the sun: a city, pasted coordinates, this device's location, or typed numbers. */
function LocationPicker({ site, save }: { site: Site; save: (patch: Partial<Site>) => Promise<unknown> }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const guess = gardenLocation(site);
  const set = site.lat != null && site.lon != null;
  const city = set ? nearestCity(site.lat!, site.lon!) : null;
  // Four decimals is about 10 m: plenty for the sun, and no more precise than it needs to be.
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const setTo = (lat: number, lon: number) => {
    setError(null);
    return save({ lat: round(lat), lon: round(lon) });
  };
  const usePasted = (text: string) => {
    if (!text.trim()) return;
    const at = parseLatLng(text);
    if (!at) return setError("Couldn't find coordinates in that. Try the @lat,lng from a Google Maps link.");
    setTo(at.lat, at.lon).then(() => setPasted(""));
  };
  return (
    <div className="location">
      <h3>Location</h3>
      <p className="small">
        {set ? (
          <>📍 {city ? `Near ${city.name}` : "Set"} <span className="muted">({site.lat!.toFixed(4)}, {site.lon!.toFixed(4)})</span></>
        ) : (
          <span className="muted">Not set: the sun is guessed from your time zone.</span>
        )}
      </p>
      <label className="field">
        <span>City</span>
        <select
          value=""
          onChange={(e) => {
            const c = CITIES.find((x) => x.name === e.target.value);
            if (c) setTo(c.lat, c.lon);
          }}
        >
          <option value="">{city ? city.name : "Choose a city…"}</option>
          {CITY_REGIONS.map((r) => (
            <optgroup key={r} label={r}>
              {CITIES.filter((c) => c.region === r).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <span>
          Or paste coordinates <span className="hint" title={PASTE_HINT} aria-label={PASTE_HINT}>ⓘ</span>
        </span>
        <div className="row">
          <input
            value={pasted}
            placeholder="@30.1836998,-97.7891487"
            title={PASTE_HINT}
            onChange={(e) => setPasted(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (parseLatLng(text)) {
                e.preventDefault();
                usePasted(text);
              }
            }}
            onKeyDown={(e) => e.key === "Enter" && usePasted(pasted)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="small" type="button" onClick={() => usePasted(pasted)}>Set</button>
        </div>
      </label>
      <div className="num-grid">
        <NumField label="Lat" value={site.lat ?? guess.lat} step={0.01} unit="°" onCommit={(lat) => setTo(Math.max(-90, Math.min(90, lat)), site.lon ?? guess.lon)} />
        <NumField label="Lon" value={site.lon ?? guess.lon} step={0.01} unit="°" onCommit={(lon) => setTo(site.lat ?? guess.lat, ((lon + 540) % 360) - 180)} />
      </div>
      <div className="row small">
        <button
          className="small"
          type="button"
          disabled={locating}
          onClick={() => {
            if (!navigator.geolocation) return setError("This browser can't share its location.");
            setLocating(true);
            setError(null);
            navigator.geolocation.getCurrentPosition(
              (p) => {
                setLocating(false);
                setTo(p.coords.latitude, p.coords.longitude);
              },
              (err) => {
                setLocating(false);
                setError(err.message || "Couldn't get the location.");
              },
              { timeout: 15000 },
            );
          }}
        >
          📍 {locating ? "Locating…" : "Use this device's location"}
        </button>
      </div>
      {error && <p className="small error">{error}</p>}
      <p className="small muted">For the sun and shadows. Kept only in this browser and your garden files, to about 10 m.</p>
    </div>
  );
}

function SitePanel({ site }: { site: Site }) {
  const { act } = useGarden();
  const save = (patch: Partial<Site>) => act((ctx) => setSite(ctx, { ...site, ...patch }));
  return (
    <section className="card">
      <h3>The lot</h3>
      <div className="num-grid">
        <NumField label="Width" value={site.width} min={10} step={1} onCommit={(width) => save({ width })} />
        <NumField label="Depth" value={site.depth} min={10} step={1} onCommit={(depth) => save({ depth })} />
        <NumField label="North" value={site.northDeg} step={5} unit="°" onCommit={(northDeg) => save({ northDeg: ((northDeg % 360) + 360) % 360 })} />
        <NumField label="Snap" value={site.gridFt} min={0} step={0.25} onCommit={(gridFt) => save({ gridFt })} />
      </div>
      <p className="small muted">Width runs east–west, depth north–south. North is degrees clockwise from the top of the plan; or drag the compass on the map. Snap 0 turns snapping off.</p>
      <LocationPicker site={site} save={save} />
    </section>
  );
}
