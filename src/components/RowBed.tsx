import { useState } from "react";
import { Link } from "react-router";
import { logCare } from "@/lib/actions";
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

/** An outdoor bed planted in rows: each row's planting with its plants laid out one by one. */
export function RowBed({ tray, plantings, mini }: { tray: Tray; plantings: PlantingView[]; mini?: boolean }) {
  const [picking, setPicking] = useState<{ plantingId: string; plants: Set<number> } | null>(null);
  const [observing, setObserving] = useState<{ plantingId: string; plants: number[] } | null>(null);
  const toggle = (plantingId: string, n: number) =>
    setPicking((cur) => {
      const plants = new Set(cur?.plantingId === plantingId ? cur.plants : []);
      if (plants.has(n)) plants.delete(n);
      else plants.add(n);
      return plants.size ? { plantingId, plants } : null;
    });

  return (
    <div className={`row-bed ${mini ? "mini" : ""}`}>
      {tray.rows.map((row) => {
        const inRow = plantings.filter((p) => p.cells.some((c) => c.replace(/^\d+/, "") === row));
        return (
          <div key={row} className="bed-row">
            <span className="bed-row-label">{row}</span>
            <div className="bed-row-body">
              {inRow.length === 0 && <span className="small muted">{mini ? "" : "empty"}</span>}
              {inRow.map((p) => {
                const sel = picking?.plantingId === p.id ? picking.plants : undefined;
                return (
                  <div key={p.id} className="bed-planting">
                    {!mini && (
                      <div className="row between small">
                        <Link to={`/plantings/${p.id}`}>
                          <strong>{p.name}</strong>
                          {p.variety && <span className="muted"> ({p.variety})</span>}
                          {p.count ? <span className="muted"> × {p.count}</span> : null}
                        </Link>
                        <span className={`chip ${p.status}`}>{p.status}</span>
                      </div>
                    )}
                    {p.count ? (
                      <PlantStrip planting={p} mini={mini} selected={sel} onToggle={mini ? undefined : (n) => toggle(p.id, n)} />
                    ) : (
                      mini && <span className="small">{p.name}</span>
                    )}
                    {!mini && (sel || observing?.plantingId === p.id) && (
                      observing?.plantingId === p.id ? (
                        <ObservationForm
                          planting={p}
                          plants={observing.plants}
                          onDone={() => {
                            setObserving(null);
                            setPicking(null);
                          }}
                        />
                      ) : (
                        <div className="row small">
                          <span>{sel!.size} selected</span>
                          <button className="small" onClick={() => setObserving({ plantingId: p.id, plants: [...sel!].sort((a, b) => a - b) })}>
                            🔎 Record condition
                          </button>
                          <button className="ghost small" onClick={() => setPicking(null)}>Clear</button>
                        </div>
                      )
                    )}
                    {!mini && !sel && observing?.plantingId !== p.id && p.count ? (
                      <button className="ghost small" onClick={() => setObserving({ plantingId: p.id, plants: [] })}>
                        🔎 Check the whole row
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!mini && <ConditionLegend />}
    </div>
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
