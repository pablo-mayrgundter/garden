import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { addNote, addPhoto, addTask, createPlanting, logCare, saveSpecies, updateGarden, updatePlanting } from "@/lib/actions";
import { isDate } from "@/lib/dates";
import { useGarden } from "@/lib/GardenContext";
import { EVENT_TYPES, PLANTING_STATUSES, type EventType, type PlantingStatus } from "@/lib/seed-data";
import type { Photo, Planting, Species } from "@/lib/types";

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

type Status = { error?: string; ok?: string } | undefined;

function StatusLine({ state }: { state: Status }) {
  if (state?.error) return <span className="error">{state.error}</span>;
  if (state?.ok) return <span className="ok">{state.ok} ✓</span>;
  return null;
}

/** onSubmit wrapper: runs the handler with the form's data, tracks pending/error/ok, resets on success. */
function useSubmit(handler: (fd: FormData) => Promise<Status>) {
  const [state, setState] = useState<Status>();
  const [pending, setPending] = useState(false);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setPending(true);
    try {
      const res = await handler(new FormData(form));
      setState(res);
      if (res?.ok) form.reset();
    } catch (err) {
      setState({ error: (err as Error).message });
    } finally {
      setPending(false);
    }
  };
  return { state, pending, onSubmit };
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optInt = (fd: FormData, key: string) => {
  const n = parseInt(str(fd, key), 10);
  return Number.isFinite(n) ? n : null;
};

export function QuickLog({ plantingIds, today }: { plantingIds: string[]; today: string }) {
  const { act } = useGarden();
  const [type, setType] = useState<EventType | null>(null);
  const { pending, onSubmit } = useSubmit(async (fd) => {
    await act((ctx) => logCare(ctx, { plantingIds, type: type!, date: isDate(str(fd, "date")) ? str(fd, "date") : undefined, note: str(fd, "note") }));
    setType(null);
    return { ok: "Logged" };
  });
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
        <form onSubmit={onSubmit} className="form-grid">
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

export function NoteForm({ plantingId }: { plantingId?: string }) {
  const { act } = useGarden();
  const { state, pending, onSubmit } = useSubmit(async (fd) => {
    const body = str(fd, "body");
    if (!body) return { error: "Write something first." };
    await act((ctx) => addNote(ctx, { plantingId: plantingId ?? null, body }));
    return { ok: "Saved" };
  });
  return (
    <form onSubmit={onSubmit} className="form">
      <textarea name="body" placeholder="What did you notice today?" required />
      <div className="row between">
        <StatusLine state={state} />
        <button className="primary small" disabled={pending}>Add note</button>
      </div>
    </form>
  );
}

export function TaskForm({ plantingId, today }: { plantingId?: string; today: string }) {
  const { act } = useGarden();
  const { state, pending, onSubmit } = useSubmit(async (fd) => {
    const title = str(fd, "title");
    const dueDate = str(fd, "dueDate");
    if (!title) return { error: "What needs doing?" };
    if (!isDate(dueDate)) return { error: "Pick a date." };
    await act((ctx) => addTask(ctx, { plantingId: plantingId ?? null, title, dueDate }));
    return { ok: "Added" };
  });
  return (
    <form onSubmit={onSubmit} className="row" style={{ alignItems: "flex-end" }}>
      <label style={{ flex: 2, minWidth: 160 }}>Reminder<input name="title" placeholder="e.g. Rotate tray toward window" required /></label>
      <label style={{ flex: 1, minWidth: 130 }}>Due<input type="date" name="dueDate" defaultValue={today} required /></label>
      <button className="small" disabled={pending}>Add</button>
      <StatusLine state={state} />
    </form>
  );
}

/** Downscale big phone photos before storing them. */
async function shrink(file: File, maxSide = 1600): Promise<Blob> {
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
    return blob ?? file;
  } catch {
    return file;
  }
}

export function PhotoUpload({
  plantingId,
  speciesId,
  trayId,
  kind = "progress",
  today,
}: {
  plantingId?: string;
  speciesId?: string;
  trayId?: string;
  kind?: Photo["kind"];
  today: string;
}) {
  const { act } = useGarden();
  const { state, pending, onSubmit } = useSubmit(async (fd) => {
    const file = fd.get("photo");
    if (!(file instanceof File) || !file.size) return { error: "Choose a photo." };
    if (!file.type.startsWith("image/")) return { error: "That isn't an image." };
    const blob = await shrink(file);
    const takenAt = isDate(str(fd, "takenAt")) ? str(fd, "takenAt") : today;
    await act((ctx) =>
      addPhoto(ctx, { plantingId: plantingId ?? null, speciesId: speciesId ?? null, trayId: trayId ?? null, kind, caption: str(fd, "caption") || null, takenAt }, blob),
    );
    return { ok: "Added" };
  });
  return (
    <form className="form" onSubmit={onSubmit}>
      <input type="file" name="photo" accept="image/*" required />
      <div className="form-grid">
        <label>Caption<input name="caption" placeholder="Optional" /></label>
        <label>Taken<input type="date" name="takenAt" defaultValue={today} max={today} /></label>
      </div>
      <div className="row between">
        <StatusLine state={state} />
        <button className="primary small" disabled={pending}>{pending ? "Saving…" : "📷 Add photo"}</button>
      </div>
    </form>
  );
}

export function PlantingEditForm({ planting }: { planting: Planting }) {
  const { act } = useGarden();
  const { state, pending, onSubmit } = useSubmit(async (fd) => {
    const status = str(fd, "status") as PlantingStatus;
    const sownAt = str(fd, "sownAt");
    if (sownAt && !isDate(sownAt)) return { error: "Bad sow date." };
    await act((ctx) =>
      updatePlanting(ctx, planting.id, {
        status,
        sownAt: sownAt || null,
        sowDateEstimated: fd.get("sowDateEstimated") === "on",
        location: str(fd, "location") || null,
      }),
    );
    return { ok: "Saved" };
  });
  return (
    <form onSubmit={onSubmit} className="form" key={planting.updatedAt}>
      <div className="form-grid">
        <label>
          Status
          <select name="status" defaultValue={planting.status}>
            {PLANTING_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>Sow date<input type="date" name="sownAt" defaultValue={planting.sownAt ?? ""} /></label>
        <label>Location (after transplanting)<input name="location" defaultValue={planting.location ?? ""} placeholder="e.g. kitchen windowsill" /></label>
      </div>
      <label className="inline"><input type="checkbox" name="sowDateEstimated" defaultChecked={planting.sowDateEstimated} /> Sow date is an estimate</label>
      <div className="row between">
        <StatusLine state={state} />
        <button className="primary small" disabled={pending}>Save</button>
      </div>
    </form>
  );
}

export function PlantCellsForm({ trayId, emptyCells, initialCell, today }: { trayId: string; emptyCells: string[]; initialCell: string; today: string }) {
  const { act, data } = useGarden();
  const navigate = useNavigate();
  const [cells, setCells] = useState<string[]>([initialCell]);
  const [sowNow, setSowNow] = useState(true);
  const { state, pending, onSubmit } = useSubmit(async (fd) => {
    const speciesId = str(fd, "speciesId");
    const sownAt = sowNow ? str(fd, "sownAt") : "";
    if (!speciesId) return { error: "Choose a plant." };
    if (!cells.length) return { error: "Choose at least one cell." };
    if (sownAt && !isDate(sownAt)) return { error: "Bad sow date." };
    const id = await act((ctx) => createPlanting(ctx, { speciesId, trayId, cells, sownAt: sownAt || null }));
    navigate(`/plantings/${id}`);
    return undefined;
  });
  const species = [...data.species].sort((a, b) => a.commonName.localeCompare(b.commonName));
  return (
    <form onSubmit={onSubmit} className="form">
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
        <StatusLine state={state} />
        <button className="primary" disabled={pending || !cells.length}>{sowNow ? "🌰 Plant it" : "Reserve cells"}</button>
      </div>
    </form>
  );
}

const SPECIES_TEXT = ["commonName", "variety", "scientificName", "wikipediaTitle", "source", "seedsPerPacket", "sowDepth", "light", "height", "spread", "spacing", "soil", "watering", "uses", "packetText"] as const;
const SPECIES_INT = ["germDaysMin", "germDaysMax", "waterEveryDays", "harvestDaysMin", "harvestDaysMax"] as const;

export function SpeciesForm({ species }: { species?: Species }) {
  const { act } = useGarden();
  const navigate = useNavigate();
  const s = species;
  const { state, pending, onSubmit } = useSubmit(async (fd) => {
    const commonName = str(fd, "commonName");
    if (!commonName) return { error: "A plant needs a name." };
    const text = Object.fromEntries(SPECIES_TEXT.map((k) => [k, str(fd, k) || null])) as Record<(typeof SPECIES_TEXT)[number], string | null>;
    const ints = Object.fromEntries(SPECIES_INT.map((k) => [k, optInt(fd, k)])) as Record<(typeof SPECIES_INT)[number], number | null>;
    const id = await act((ctx) =>
      saveSpecies(ctx, {
        id: s?.id,
        ...text,
        commonName,
        wikipediaTitle: text.wikipediaTitle?.replace(/^https?:\/\/[a-z]+\.(m\.)?wikipedia\.org\/wiki\//, "").replace(/ /g, "_") ?? null,
        ...ints,
        waterEveryDays: ints.waterEveryDays ?? 2,
        category: s?.category ?? (str(fd, "category") || "herb"),
        lifecycle: s?.lifecycle ?? null,
        tips: str(fd, "tips").split("\n").map((t) => t.trim()).filter(Boolean),
      }),
    );
    if (!s) navigate(`/plants/${id}`);
    return { ok: "Saved" };
  });
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
    <form onSubmit={onSubmit} className="form">
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
        {text("seedsPerPacket", "Seeds per packet")}
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
        <StatusLine state={state} />
        <button className="primary" disabled={pending}>{s ? "Save changes" : "Add to seed library"}</button>
      </div>
    </form>
  );
}

export function GardenSettingsForm() {
  const { act, data } = useGarden();
  const { state, pending, onSubmit } = useSubmit(async (fd) => {
    const name = str(fd, "name");
    const timezone = str(fd, "timezone");
    const gardeners = str(fd, "gardeners").split(",").map((g) => g.trim()).filter(Boolean);
    if (!name) return { error: "Name your garden." };
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      return { error: "Unknown timezone." };
    }
    await act((ctx) => updateGarden(ctx, { name, timezone, gardeners }));
    return { ok: "Saved" };
  });
  const g = data.garden;
  return (
    <form onSubmit={onSubmit} className="form" key={`${g.name}|${g.timezone}|${g.gardeners.join()}`}>
      <div className="form-grid">
        <label>Garden name<input name="name" defaultValue={g.name} required /></label>
        <label>Timezone (for “today”)<input name="timezone" defaultValue={g.timezone} required /></label>
      </div>
      <label>Gardeners (comma-separated)<input name="gardeners" defaultValue={g.gardeners.join(", ")} placeholder="e.g. Pablo, Sam" /></label>
      <div className="row between">
        <StatusLine state={state} />
        <button className="primary small" disabled={pending}>Save</button>
      </div>
    </form>
  );
}

/** Pick (or add) who is gardening on this device. */
export function GardenerPicker({ onDone }: { onDone?: () => void }) {
  const { data, gardener, setGardener, act } = useGarden();
  const input = useRef<HTMLInputElement>(null);
  const choose = async (name: string) => {
    const n = name.trim();
    if (!n) return;
    if (!data.garden.gardeners.includes(n)) await act((ctx) => updateGarden(ctx, { gardeners: [...data.garden.gardeners, n] }));
    setGardener(n);
    onDone?.();
  };
  return (
    <div className="stack" style={{ gap: 12 }}>
      {data.garden.gardeners.length > 0 && (
        <div className="row">
          {data.garden.gardeners.map((g) => (
            <button key={g} type="button" className={g === gardener ? "primary" : ""} onClick={() => choose(g)}>
              {g}
            </button>
          ))}
        </div>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          choose(input.current?.value ?? "");
        }}
      >
        <input ref={input} placeholder={data.garden.gardeners.length ? "Someone else…" : "Your name"} style={{ flex: 1, minWidth: 160 }} />
        <button className="primary">Continue</button>
      </form>
    </div>
  );
}
