"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  editPlanting,
  logCare,
  plantCells,
  saveGardenSettings,
  saveNote,
  saveSpecies,
  saveTask,
  uploadPhoto,
  type FormState,
} from "@/app/actions";
import { EVENT_TYPES, PLANTING_STATUSES } from "@/lib/seed-data";
import type { Species } from "@/lib/garden";

const LABELS: Record<string, string> = {
  watered: "💧 Watered",
  sprouted: "🌱 Sprouted",
  thinned: "✂️ Thinned",
  pinched: "🤏 Pinched",
  fertilized: "🧪 Fed",
  potted_up: "🪴 Potted up",
  transplanted: "🏡 Transplanted",
  harvested: "🧺 Harvested",
  other: "📝 Other",
};

function Status({ state }: { state: FormState }) {
  if (state?.error) return <span className="error">{state.error}</span>;
  if (state?.ok) return <span className="ok">{state.ok} ✓</span>;
  return null;
}

/** Resets a form after a successful submit. */
function useResetOnOk(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function QuickLog({ plantingIds, today }: { plantingIds: number[]; today: string }) {
  const [type, setType] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        {EVENT_TYPES.map((t) => (
          <button key={t} type="button" className={`small ${type === t ? "primary" : ""}`} onClick={() => setType(type === t ? null : t)}>
            {LABELS[t]}
          </button>
        ))}
      </div>
      {type && (
        <form
          action={async (fd) => {
            setPending(true);
            await logCare(fd);
            setPending(false);
            setType(null);
          }}
          className="form-grid"
        >
          <input type="hidden" name="plantingIds" value={plantingIds.join(",")} />
          <input type="hidden" name="type" value={type} />
          <label>Date<input type="date" name="date" defaultValue={today} max={today} /></label>
          <label style={{ gridColumn: "span 2" }}>Note (optional)<input name="note" placeholder="e.g. bottom-watered, half-strength fish emulsion" /></label>
          <div className="row" style={{ alignSelf: "end" }}>
            <button className="primary" disabled={pending}>Log {LABELS[type]}</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function NoteForm({ plantingId }: { plantingId?: number }) {
  const [state, action, pending] = useActionState(saveNote, undefined);
  const ref = useResetOnOk(state);
  return (
    <form action={action} ref={ref} className="form">
      {plantingId && <input type="hidden" name="plantingId" value={plantingId} />}
      <textarea name="body" placeholder="What did you notice today?" required />
      <div className="row between">
        <Status state={state} />
        <button className="primary small" disabled={pending}>Add note</button>
      </div>
    </form>
  );
}

export function TaskForm({ plantingId, today }: { plantingId?: number; today: string }) {
  const [state, action, pending] = useActionState(saveTask, undefined);
  const ref = useResetOnOk(state);
  return (
    <form action={action} ref={ref} className="row" style={{ alignItems: "flex-end" }}>
      {plantingId && <input type="hidden" name="plantingId" value={plantingId} />}
      <label style={{ flex: 2, minWidth: 160 }}>Reminder<input name="title" placeholder="e.g. Rotate tray toward window" required /></label>
      <label style={{ flex: 1, minWidth: 130 }}>Due<input type="date" name="dueDate" defaultValue={today} required /></label>
      <button className="small" disabled={pending}>Add</button>
      <Status state={state} />
    </form>
  );
}

/** Downscale big phone photos in the browser before upload. */
async function shrink(file: File, maxSide = 1600): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2_000_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function PhotoUpload({
  plantingId,
  speciesId,
  trayId,
  kind,
  today,
}: {
  plantingId?: number;
  speciesId?: number;
  trayId?: number;
  kind?: string;
  today: string;
}) {
  const [state, setState] = useState<FormState>();
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const file = fd.get("photo");
        if (!(file instanceof File) || !file.size) return setState({ error: "Choose a photo." });
        setPending(true);
        fd.set("photo", await shrink(file));
        const res = await uploadPhoto(undefined, fd);
        setPending(false);
        setState(res);
        if (res?.ok) ref.current?.reset();
      }}
    >
      {plantingId && <input type="hidden" name="plantingId" value={plantingId} />}
      {speciesId && <input type="hidden" name="speciesId" value={speciesId} />}
      {trayId && <input type="hidden" name="trayId" value={trayId} />}
      <input type="hidden" name="kind" value={kind ?? "progress"} />
      <input type="file" name="photo" accept="image/*" capture="environment" required />
      <div className="form-grid">
        <label>Caption<input name="caption" placeholder="Optional" /></label>
        <label>Taken<input type="date" name="takenAt" defaultValue={today} max={today} /></label>
      </div>
      <div className="row between">
        <Status state={state} />
        <button className="primary small" disabled={pending}>{pending ? "Uploading…" : "📷 Add photo"}</button>
      </div>
    </form>
  );
}

export function PlantingEditForm({
  plantingId,
  status,
  sownAt,
  sowDateEstimated,
  location,
}: {
  plantingId: number;
  status: string;
  sownAt: string | null;
  sowDateEstimated: boolean;
  location: string | null;
}) {
  const [state, action, pending] = useActionState(editPlanting, undefined);
  return (
    <form action={action} className="form">
      <input type="hidden" name="plantingId" value={plantingId} />
      <div className="form-grid">
        <label>
          Status
          <select name="status" defaultValue={status}>
            {PLANTING_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>Sow date<input type="date" name="sownAt" defaultValue={sownAt ?? ""} /></label>
        <label>Location (after transplanting)<input name="location" defaultValue={location ?? ""} placeholder="e.g. kitchen windowsill" /></label>
      </div>
      <label className="inline"><input type="checkbox" name="sowDateEstimated" defaultChecked={sowDateEstimated} /> Sow date is an estimate</label>
      <div className="row between">
        <Status state={state} />
        <button className="primary small" disabled={pending}>Save</button>
      </div>
    </form>
  );
}

export function PlantCellsForm({
  trayId,
  emptyCells,
  initialCell,
  species,
  today,
}: {
  trayId: number;
  emptyCells: string[];
  initialCell: string;
  species: Pick<Species, "id" | "commonName" | "variety">[];
  today: string;
}) {
  const [state, action, pending] = useActionState(plantCells, undefined);
  const [cells, setCells] = useState<string[]>([initialCell]);
  const [sowNow, setSowNow] = useState(true);
  return (
    <form action={action} className="form">
      <input type="hidden" name="trayId" value={trayId} />
      <input type="hidden" name="cells" value={cells.join(",")} />
      <label>
        Plant
        <select name="speciesId" required defaultValue="">
          <option value="" disabled>Choose from the seed library…</option>
          {species.map((s) => (
            <option key={s.id} value={s.id}>{s.commonName}{s.variety ? ` — ${s.variety}` : ""}</option>
          ))}
        </select>
      </label>
      <div>
        <div className="small muted" style={{ marginBottom: 6 }}>Cells</div>
        <div className="row">
          {emptyCells.map((c) => (
            <button
              key={c}
              type="button"
              className={`small ${cells.includes(c) ? "primary" : ""}`}
              onClick={() => setCells(cells.includes(c) ? cells.filter((x) => x !== c) : [...cells, c])}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <label className="inline"><input type="checkbox" checked={sowNow} onChange={(e) => setSowNow(e.target.checked)} /> Seeds are in the soil</label>
      {sowNow && <label>Sow date<input type="date" name="sownAt" defaultValue={today} max={today} /></label>}
      <div className="row between">
        <Status state={state} />
        <button className="primary" disabled={pending || !cells.length}>{sowNow ? "🌰 Plant it" : "Reserve cells"}</button>
      </div>
    </form>
  );
}

export function SpeciesForm({ species }: { species?: Species }) {
  const [state, action, pending] = useActionState(saveSpecies, undefined);
  const s = species;
  const text = (name: keyof Species, label: string, placeholder?: string) => (
    <label>
      {label}
      <input name={name} defaultValue={(s?.[name] as string | null) ?? ""} placeholder={placeholder} />
    </label>
  );
  const num = (name: keyof Species, label: string) => (
    <label>
      {label}
      <input name={name} type="number" min={0} defaultValue={(s?.[name] as number | null) ?? ""} />
    </label>
  );
  return (
    <form action={action} className="form">
      {s && <input type="hidden" name="speciesId" value={s.id} />}
      <div className="form-grid">
        {text("commonName", "Name", "e.g. Mint")}
        {text("variety", "Variety", "e.g. Spearmint")}
        {text("scientificName", "Scientific name", "e.g. Mentha spicata")}
        {text("wikipediaTitle", "Wikipedia page", "e.g. Spearmint or a full URL")}
        {!s && (
          <label>
            Kind
            <select name="category" defaultValue="herb">
              <option value="herb">Herb</option>
              <option value="vegetable">Vegetable</option>
              <option value="flower">Flower</option>
              <option value="succulent">Succulent</option>
            </select>
          </label>
        )}
        {text("source", "Seed company")}
        {text("sowDepth", "Sow depth")}
        {text("light", "Light")}
        {num("germDaysMin", "Sprouts in (min days)")}
        {num("germDaysMax", "Sprouts in (max days)")}
        {text("height", "Height")}
        {text("spread", "Spread")}
        {text("spacing", "Spacing")}
        {text("soil", "Soil")}
        {text("watering", "Watering")}
        {num("waterEveryDays", "Water every N days (established)")}
        {num("harvestDaysMin", "Harvest from (days)")}
        {num("harvestDaysMax", "Harvest until (days)")}
        {text("uses", "Uses")}
      </div>
      <label>Packet text<textarea name="packetText" defaultValue={s?.packetText ?? ""} rows={4} /></label>
      <label>Tips (one per line)<textarea name="tips" defaultValue={s?.tips.join("\n") ?? ""} rows={4} /></label>
      <div className="row between">
        <Status state={state} />
        <button className="primary" disabled={pending}>{s ? "Save changes" : "Add to seed library"}</button>
      </div>
    </form>
  );
}

export function GardenSettingsForm({ name, timezone }: { name: string; timezone: string }) {
  const [state, action, pending] = useActionState(saveGardenSettings, undefined);
  return (
    <form action={action} className="form">
      <div className="form-grid">
        <label>Garden name<input name="name" defaultValue={name} required /></label>
        <label>Timezone (for “today”)<input name="timezone" defaultValue={timezone} required /></label>
      </div>
      <div className="row between">
        <Status state={state} />
        <button className="primary small" disabled={pending}>Save</button>
      </div>
    </form>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

export function ConfirmButton({ children, message }: { children: React.ReactNode; message: string }) {
  return (
    <button className="small" style={{ color: "var(--red)" }} onClick={(e) => !confirm(message) && e.preventDefault()}>
      {children}
    </button>
  );
}
