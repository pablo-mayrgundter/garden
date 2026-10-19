import { useState } from "react";
import { Link } from "react-router";
import { logCare, setBedSize } from "@/lib/actions";
import { bedSize, formatInches, layoutBed } from "@/lib/bedLayout";
import { speciesColor } from "@/lib/plantColors";
import { formatDate } from "@/lib/dates";
import { plantStates, type PlantingView, type PlantState } from "@/lib/garden";
import { useGarden } from "@/lib/GardenContext";
import { CONDITION_KEYS, CONDITIONS, type Condition } from "@/lib/model";
import type { Tray } from "@/lib/types";

export const CONDITION_COLOR: Record<Condition, string> = {
  healthy: "#4f9a4a",
  pests: "#d4572a",
  disease: "#8a5a2b",
  nutrients: "#e0b52d",
  water: "#4d86c4",
  weeds: "#8a9a3a",
  damage: "#9a5bb5",
  missing: "#333333",
  other: "#8a8a8a",
};

function plantTitle(name: string, n: number, s: PlantState): string {
  return `${name} #${n}${s ? ` — ${CONDITIONS[s.condition].label} (${formatDate(s.date)})${s.note ? `: ${s.note}` : ""}` : ""}`;
}

/** One planting's plants as a strip of dots, tinted by their latest observed condition; tap dots to pick plants. */
export function PlantStrip({
  planting,
  selected,
  onToggle,
  mini,
}: {
  planting: PlantingView;
  selected?: Set<number>;
  onToggle?: (n: number) => void;
  mini?: boolean;
}) {
  const { data } = useGarden();
  const count = planting.count ?? 0;
  const states = plantStates(data, planting.id, count);
  return (
    <div className={`plant-strip ${mini ? "mini" : ""}`} role="group" aria-label={`${planting.name} plants`}>
      {states.map((s, i) => {
        const n = i + 1;
        const style = s ? { background: CONDITION_COLOR[s.condition], borderColor: CONDITION_COLOR[s.condition] } : undefined;
        return onToggle ? (
          <button
            key={n}
            type="button"
            className={`plant-dot ${selected?.has(n) ? "selected" : ""} ${s ? "observed" : ""}`}
            style={style}
            title={plantTitle(planting.name, n, s)}
            aria-pressed={selected?.has(n)}
            onClick={() => onToggle(n)}
          >
            {mini ? "" : n}
          </button>
        ) : (
          <span key={n} className={`plant-dot ${s ? "observed" : ""}`} style={style} title={plantTitle(planting.name, n, s)} />
        );
      })}
    </div>
  );
}

/** Record a condition for some plants (or the whole planting). */
export function ObservationForm({ planting, plants, onDone }: { planting: PlantingView; plants: number[]; onDone: () => void }) {
  const { act } = useGarden();
  const [condition, setCondition] = useState<Condition>("pests");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const who = plants.length ? `${plants.length === 1 ? "plant" : "plants"} ${plants.join(", ")}` : `all ${planting.count ?? ""} plants`;
  return (
    <form
      className="observe-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await act((ctx) => logCare(ctx, { plantingIds: [planting.id], type: "observed", condition, plants, note }));
        setBusy(false);
        setNote("");
        onDone();
      }}
    >
      <div className="small"><strong>{planting.name}</strong> · {who}</div>
      <div className="row">
        {CONDITION_KEYS.map((c) => (
          <button key={c} type="button" className={`small chip-btn ${condition === c ? "primary" : ""}`} onClick={() => setCondition(c)}>
            <span className="cond-swatch" style={{ background: CONDITION_COLOR[c] }} /> {CONDITIONS[c].label}
          </button>
        ))}
      </div>
      <div className="row">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you saw (optional)" style={{ flex: 1, minWidth: 160 }} />
        <button className="primary small" disabled={busy}>Record</button>
        <button type="button" className="ghost small" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

type Picking = { plantingId: string; plants: Set<number> } | null;

const WOOD = "#b48f5c";
const WOOD_DARK = "#8d6b40";
const SOIL = "#6b4f3a";

/** Status → how a plant spot is drawn: a marked-out spot, a seed, or a plant that grows with its stage. */
const STAGE: Record<string, number> = { planned: 0, sown: 0.45, sprouted: 0.7, growing: 1, transplanted: 1, harvesting: 1, done: 1, failed: 0.6 };

/** The bed drawn to scale from above: its rows, and each plant's spot colored by crop. */
export function BedPlan({
  tray,
  plantings,
  picking,
  onToggle,
  compact,
}: {
  tray: Tray;
  plantings: PlantingView[];
  picking?: Picking;
  onToggle?: (plantingId: string, n: number) => void;
  compact?: boolean;
}) {
  const { data } = useGarden();
  const size = bedSize(data, tray);
  const bed = layoutBed(tray, plantings, size);
  const { length: L, width: W } = size;
  const frame = Math.min(0.17, W * 0.05);
  const unit = Math.max(L, W);
  const font = compact ? unit * 0.035 : Math.min(0.24, Math.max(unit * 0.022, 0.12));
  const left = compact ? frame : frame + font * 1.8;
  const top = compact ? frame : frame + font * 2.4;
  const right = compact ? frame : frame + font * 3.2;
  const vb = `${-left} ${-top} ${L + left + right} ${W + top + frame}`;
  const rowGap = W / Math.max(1, tray.rows.length);
  const tick = L <= 4 ? 0.5 : 1;
  const states = new Map(plantings.map((p) => [p.id, plantStates(data, p.id, p.count ?? p.cells.length)]));
  const byId = new Map(plantings.map((p) => [p.id, p]));
  const species = new Map(data.species.map((x) => [x.id, x]));
  const stroke = { vectorEffect: "non-scaling-stroke" as const };
  return (
    <svg className={`bed-plan ${compact ? "compact" : ""}`} viewBox={vb} role="img" aria-label={`${tray.name}, ${L} by ${W} feet, from above`}>
      <rect x={-frame} y={-frame} width={L + frame * 2} height={W + frame * 2} rx={frame * 0.4} fill={WOOD} stroke={WOOD_DARK} strokeWidth={1} {...stroke} />
      <rect x={0} y={0} width={L} height={W} fill={SOIL} />
      {bed.rows.map((r) => (
        <line key={r.row} x1={0.05} x2={L - 0.05} y1={r.across} y2={r.across} stroke="#fff" strokeOpacity={0.09} strokeWidth={Math.min(rowGap * 0.5, 0.25)} strokeLinecap="round" />
      ))}
      {!compact && (
        <g className="bed-ruler" fontSize={font} fill="currentColor">
          {Array.from({ length: Math.floor(L / tick + 1e-9) + 1 }, (_, i) => i * tick).map((x) => (
            <g key={x}>
              <line x1={x} x2={x} y1={-frame - font * 0.5} y2={-frame - (x % 1 === 0 ? font * 1.1 : font * 0.8)} stroke="currentColor" strokeWidth={1} {...stroke} />
              {x % 1 === 0 && x > 0 && x < L && <text x={x} y={-frame - font * 1.35} textAnchor="middle">{x}</text>}
            </g>
          ))}
          <line x1={0} x2={L} y1={-frame - font * 0.5} y2={-frame - font * 0.5} stroke="currentColor" strokeWidth={1} {...stroke} />
          <text x={L} y={-frame - font * 1.35} textAnchor="end" fontWeight={700}>{L} ft</text>
          <text x={L + frame + font * 0.5} y={W / 2} dominantBaseline="central" fontWeight={700}>{W} ft</text>
          {bed.rows.map((r) => (
            <text key={r.row} x={-frame - font * 0.6} y={r.across} textAnchor="end" dominantBaseline="central" fontWeight={700}>{r.row}</text>
          ))}
        </g>
      )}
      {bed.rows.flatMap((r) =>
        r.plantings.map(({ planting: rp, start, end, count }) => {
          const p = byId.get(rp.id)!;
          const step = (end - start) / count;
          const radius = Math.min(step, rowGap) * 0.4;
          const color = speciesColor(species.get(p.speciesId));
          const stage = STAGE[p.status] ?? 1;
          const st = states.get(p.id) ?? [];
          return (
            <g key={p.id} opacity={p.status === "done" ? 0.4 : 1}>
              {bed.spots
                .filter((s) => s.plantingId === p.id)
                .map((s) => {
                  const state = st[s.n - 1];
                  const sel = picking?.plantingId === p.id && picking.plants.has(s.n);
                  const ring = state ? CONDITION_COLOR[state.condition] : null;
                  return (
                    <g
                      key={s.n}
                      className={onToggle ? "bed-spot" : undefined}
                      onClick={onToggle ? () => onToggle(p.id, s.n) : undefined}
                    >
                      {!compact && <title>{plantTitle(`${p.name} (row ${s.row})`, s.n, state)}</title>}
                      {onToggle && <circle cx={s.along} cy={s.across} r={Math.min(step, rowGap) / 2} fill="transparent" />}
                      {sel && <circle cx={s.along} cy={s.across} r={radius * 1.45} fill="#fff" stroke="#2f5f8a" strokeWidth={2} {...stroke} />}
                      {ring && <circle cx={s.along} cy={s.across} r={radius * 1.2} fill="none" stroke={ring} strokeWidth={state!.condition === "healthy" ? 1 : 2.5} {...stroke} />}
                      {stage === 0 ? (
                        <circle cx={s.along} cy={s.across} r={radius * 0.75} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="2 2" {...stroke} />
                      ) : (
                        <circle
                          cx={s.along}
                          cy={s.across}
                          r={radius * stage}
                          fill={p.status === "failed" ? "#4a4a4a" : color}
                          stroke="#000"
                          strokeOpacity={0.25}
                          strokeWidth={1}
                          {...stroke}
                        />
                      )}
                    </g>
                  );
                })}
            </g>
          );
        }),
      )}
      {!compact &&
        bed.rows
          .filter((r) => !r.plantings.length)
          .map((r) => (
            <text key={r.row} x={L / 2} y={r.across} fontSize={font * 0.8} fill="#e8dcc6" fillOpacity={0.6} textAnchor="middle" dominantBaseline="central">empty</text>
          ))}
    </svg>
  );
}

/** Edit a bed's real size; on the map it changes there too. */
function BedSizeLine({ tray }: { tray: Tray }) {
  const { data, act } = useGarden();
  const size = bedSize(data, tray);
  const bed = layoutBed(tray, [], size);
  const [editing, setEditing] = useState(false);
  const [len, setLen] = useState(String(size.length));
  const [wid, setWid] = useState(String(size.width));
  const where = { map: "set on the map", planter: "", assumed: "assumed — set the real size" }[size.source];
  if (editing)
    return (
      <form
        className="row small bed-size"
        onSubmit={async (e) => {
          e.preventDefault();
          const length = Number(len);
          const width = Number(wid);
          if (!(length > 0 && width > 0)) return;
          await act((ctx) => setBedSize(ctx, tray.id, { length, width }));
          setEditing(false);
        }}
      >
        <label className="inline">Length <input type="number" step="0.25" min="0.5" value={len} onChange={(e) => setLen(e.target.value)} style={{ width: 80 }} /> ft</label>
        <label className="inline">Width <input type="number" step="0.25" min="0.5" value={wid} onChange={(e) => setWid(e.target.value)} style={{ width: 80 }} /> ft</label>
        <button className="primary small">Save</button>
        <button type="button" className="ghost small" onClick={() => setEditing(false)}>Cancel</button>
      </form>
    );
  return (
    <div className="row small muted bed-size">
      <span>
        {size.length} × {size.width} ft bed · rows {formatInches(bed.rowSpacingIn)} apart{where && ` · ${where}`}
      </span>
      <button
        className="ghost small"
        onClick={() => {
          setLen(String(size.length));
          setWid(String(size.width));
          setEditing(true);
        }}
      >
        Change size
      </button>
    </div>
  );
}

/** An outdoor bed planted in rows: the bed to scale, then each row with its spacing and checks. */
export function RowBed({ tray, plantings, mini, preview }: { tray: Tray; plantings: PlantingView[]; mini?: boolean; preview?: boolean }) {
  const { data } = useGarden();
  const [picking, setPicking] = useState<Picking>(null);
  const [observing, setObserving] = useState<{ plantingId: string; plants: number[] } | null>(null);
  if (mini || preview) return <BedPlan tray={tray} plantings={plantings} compact={mini} />;
  const toggle = (plantingId: string, n: number) =>
    setPicking((cur) => {
      const plants = new Set(cur?.plantingId === plantingId ? cur.plants : []);
      if (plants.has(n)) plants.delete(n);
      else plants.add(n);
      return plants.size ? { plantingId, plants } : null;
    });
  const bed = layoutBed(tray, plantings, bedSize(data, tray));
  const species = new Map(data.species.map((x) => [x.id, x]));
  const crops = [...new Map(plantings.map((p) => [p.speciesId, p])).values()];

  return (
    <section className="card bed-card">
      <BedPlan tray={tray} plantings={plantings} picking={picking} onToggle={toggle} />
      <BedSizeLine tray={tray} />
      <div className="row small bed-legend">
        {crops.map((p) => (
          <span key={p.speciesId}><span className="cond-swatch" style={{ background: speciesColor(species.get(p.speciesId)) }} /> {p.name}{p.variety ? ` (${p.variety})` : ""}</span>
        ))}
        <span className="muted">◌ planned · • sown · ● up</span>
      </div>
      <p className="small muted" style={{ margin: "4px 0 10px" }}>Tap plants to pick them, then record what you see.</p>
      <ul className="bed-rows">
        {bed.rows.map((r) => (
          <li key={r.row}>
            <span className="bed-row-label">{r.row}</span>
            <div className="bed-row-body">
              {r.plantings.length === 0 && <span className="small muted">empty</span>}
              {r.plantings.map(({ planting: rp, count, spacingIn }) => {
                const p = plantings.find((x) => x.id === rp.id)!;
                const sel = picking?.plantingId === p.id ? picking.plants : undefined;
                return (
                  <div key={p.id} className="bed-planting">
                    <div className="row small">
                      <span className="cond-swatch" style={{ background: speciesColor(species.get(p.speciesId)) }} />
                      <Link to={`/plantings/${p.id}`}>
                        <strong>{p.name}</strong>
                        {p.variety && <span className="muted"> ({p.variety})</span>}
                      </Link>
                      <span className="muted">× {count} · {formatInches(spacingIn)} apart</span>
                      <span className={`chip ${p.status}`}>{p.status}</span>
                      <span className="spacer" />
                      {observing?.plantingId !== p.id &&
                        (sel ? (
                          <>
                            <span>{sel.size} selected</span>
                            <button className="small" onClick={() => setObserving({ plantingId: p.id, plants: [...sel].sort((a, b) => a - b) })}>🔎 Record condition</button>
                            <button className="ghost small" onClick={() => setPicking(null)}>Clear</button>
                          </>
                        ) : (
                          <button className="ghost small" onClick={() => setObserving({ plantingId: p.id, plants: [] })}>🔎 Check the row</button>
                        ))}
                    </div>
                    {observing?.plantingId === p.id && (
                      <ObservationForm
                        planting={p}
                        plants={observing.plants}
                        onDone={() => {
                          setObserving(null);
                          setPicking(null);
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      <ConditionLegend />
    </section>
  );
}

export function ConditionLegend() {
  return (
    <div className="row small muted cond-legend">
      <span><span className="plant-dot legend" /> not checked</span>
      {CONDITION_KEYS.filter((c) => c !== "other").map((c) => (
        <span key={c}><span className="plant-dot legend observed" style={{ background: CONDITION_COLOR[c], borderColor: CONDITION_COLOR[c] }} /> {CONDITIONS[c].label}</span>
      ))}
    </div>
  );
}

/** A planting's individual plants with per-plant condition recording, for its own page. */
export function PlantingPlants({ planting }: { planting: PlantingView }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [observing, setObserving] = useState<number[] | null>(null);
  if (!planting.count) return null;
  const toggle = (n: number) =>
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  return (
    <section className="card">
      <div className="card-head">
        <h2>Plants</h2>
        <span className="small muted">{planting.count} in the row · tap plants to record what you see</span>
      </div>
      <PlantStrip planting={planting} selected={sel} onToggle={toggle} />
      <div style={{ marginTop: 10 }}>
        {observing ? (
          <ObservationForm
            planting={planting}
            plants={observing}
            onDone={() => {
              setObserving(null);
              setSel(new Set());
            }}
          />
        ) : (
          <div className="row small">
            {sel.size > 0 && <span>{sel.size} selected</span>}
            <button className="small" onClick={() => setObserving([...sel].sort((a, b) => a - b))}>
              🔎 {sel.size ? "Record condition" : "Check the whole row"}
            </button>
            {sel.size > 0 && <button className="ghost small" onClick={() => setSel(new Set())}>Clear</button>}
          </div>
        )}
      </div>
      <ConditionLegend />
    </section>
  );
}
