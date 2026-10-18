// What every assistant backend shares: the system prompt, the per-turn context
// built from the page the user is on, and the garden tools with their handlers.

import { z } from "zod";
import { addNote, addTask, applyTrayLayout, logCare, trayMarkdown, updatePlanting, type ActionCtx } from "../actions.ts";
import { formatDate, isDate } from "../dates.ts";
import { cellRange, eventsFor, notesFor, photosFor, plantingLabel, plantingViews, sortedTrays, tasksFor, type PlantingView } from "../garden.ts";
import { EVENT_TYPES, PLANTING_STATUSES } from "../model.ts";
import type { CareItem } from "../schedule.ts";
import { blobToBase64, getPhotoBlob, type GardenDB } from "../store.ts";
import type { GardenData, Photo } from "../types.ts";

export const MAX_TOOL_ROUNDS = 8;

// Kept byte-for-byte stable so Claude can cache it; anything that changes per request goes in the user turn.
export const SYSTEM_PROMPT = `You are the garden assistant inside a small, private garden-tracking web app shared by a household of gardeners.

The app tracks:
- Planters: containers of cells (seed trays, egg cartons, pots). Cells are named column number + row letter (1A is top-left; "1-2C" means a planting spanning cells 1C and 2C). Each planter's layout can be written as a markdown table with letters on rows and numbers on columns.
- Plants (the seed library): one entry per seed packet, with the packet's sowing depth, germination days, spacing, watering and harvest info.
- Plantings: a plant sown in particular cells, with a status (planned, sown, sprouted, growing, transplanted, harvesting, done, failed) and a sow date. Some sow dates are estimates.
- A care log of events (watered, sprouted, thinned, pinched, fertilized, potted_up, transplanted, harvested, other), notes, photos, and to-do tasks.
- A computed care schedule per planting: daily misting while seedlings are in a planter, the germination window from the packet, and packet-based milestones (thinning, first feeding, pinching, transplanting, harvest). Logging the matching event completes a milestone.

Each user message starts with an <app_context> block describing today's date, the page the user is looking at, and current garden data. Treat it as the source of truth about the garden; it reflects the data at the moment the message was sent. Planting, planter and photo IDs appear there in brackets, like [k3x9p2]. Photos can be inspected with view_photo. When a photo is attached, look at it carefully — seedling color, legginess, damping off, mold, overcrowding — and say what you see.

How to help:
- Answer as a knowledgeable, practical gardener. Be specific to this garden's plants, cells, dates and packet instructions rather than generic. Keep answers short and skimmable; use short lists when listing steps.
- When the user tells you something happened ("we watered the tray", "the parsley came up", "thinned the lettuce"), record it with log_care. When they share an observation or ask you to remember something, save it with add_note. When they want a reminder, use create_task. When a sow date or status is wrong, fix it with update_planting. When they plant, move or clear cells, or set up a new planter, rewrite its layout with update_planter_layout, then mark newly sown plantings with update_planting.
- Only record things the user said happened or asked you to record. Never invent care events. If you're unsure which planting they mean, ask.
- After using a tool, briefly confirm what you recorded.
- Wikipedia links and packet info are in the app; you don't need to repeat them unless asked.`;

// ---------- Context ----------

function careLine(c: CareItem): string {
  const when = c.start === c.end ? formatDate(c.start) : `${formatDate(c.start)}–${formatDate(c.end)}`;
  const status = c.status === "done" ? `done ${c.doneOn ? formatDate(c.doneOn) : ""}`.trim() : c.status;
  return `${c.title} (${when}; ${status})`;
}

function plantingSummary(p: PlantingView): string {
  const where = p.trayName ? `${p.trayName} ${cellRange(p.cells)}` : (p.location ?? "no location");
  const sown = p.sownAt ? `sown ${p.sownAt}${p.sowDateEstimated ? " (estimated)" : ""}` : "not sown yet";
  const open = p.care.filter((c) => c.status !== "done" && c.status !== "upcoming").map(careLine);
  const next = p.care.find((c) => c.status === "upcoming");
  return (
    `- [${p.id}] ${p.name}${p.variety ? ` '${p.variety}'` : ""} — ${where} — ${p.status}, ${sown}` +
    (open.length ? ` — needs: ${open.join("; ")}` : "") +
    (next ? ` — next: ${careLine(next)}` : "")
  );
}

export function plantingDetail(data: GardenData, p: PlantingView): string {
  const s = p.species;
  const events = eventsFor(data, p.id).slice(0, 25);
  const notes = notesFor(data, p.id).slice(0, 15);
  const photos = photosFor(data, { plantingId: p.id }).slice(0, 20);
  const tasks = tasksFor(data, { plantingId: p.id });
  return [
    `Planting [${p.id}]: ${plantingLabel(p)} — status ${p.status}, ${p.sownAt ? `sown ${p.sownAt}${p.sowDateEstimated ? " (estimated)" : ""}` : "not sown"}`,
    `Plant: ${s.commonName}${s.variety ? ` '${s.variety}'` : ""} (${s.scientificName ?? "?"}), ${s.lifecycle ?? ""} ${s.category}, packet from ${s.source ?? "unknown"}`,
    `Packet data: sow depth ${s.sowDepth ?? "?"}; germination ${s.germDaysMin ?? "?"}–${s.germDaysMax ?? "?"} days; light ${s.light ?? "?"}; height ${s.height ?? "?"}; spread ${s.spread ?? "?"}; spacing ${s.spacing ?? "?"}; soil ${s.soil ?? "?"}; watering ${s.watering ?? "?"}; harvest ${s.harvestDaysMin ?? "?"}–${s.harvestDaysMax ?? "?"} days`,
    s.packetText ? `Packet text: ${s.packetText}` : "",
    s.tips.length ? `Tips: ${s.tips.join(" | ")}` : "",
    `Schedule:\n${p.care.map((c) => `  - ${careLine(c)}`).join("\n") || "  (none)"}`,
    `Care log (newest first):\n${events.map((e) => `  - ${e.date} ${e.type}${e.note ? `: ${e.note}` : ""}${e.by ? ` (${e.by})` : ""}`).join("\n") || "  (empty)"}`,
    `Notes (newest first):\n${notes.map((n) => `  - ${n.createdAt.slice(0, 10)}${n.by ? ` ${n.by}` : ""}${n.byAssistant ? " (assistant)" : ""}: ${n.body}`).join("\n") || "  (none)"}`,
    `Open tasks:\n${tasks.map((t) => `  - ${t.dueDate}: ${t.title}`).join("\n") || "  (none)"}`,
    `Photos (newest first):\n${photos.map((ph) => `  - photo [${ph.id}], ${ph.takenAt}${ph.caption ? `: ${ph.caption}` : ""}`).join("\n") || "  (none)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

type PageRef = { kind: "dashboard" | "planting" | "tray" | "plant" | "plants" | "settings" | "calendar" | "other"; id?: string };

export function parsePath(pathname: string): PageRef {
  const m = pathname.match(/^\/(plantings|trays|plants)\/([^/]+)/);
  if (m && m[2] !== "new") return { kind: ({ plantings: "planting", trays: "tray", plants: "plant" } as const)[m[1] as "plantings"], id: decodeURIComponent(m[2]) };
  if (pathname === "/" || pathname === "") return { kind: "dashboard" };
  if (pathname.startsWith("/plants")) return { kind: "plants" };
  if (pathname.startsWith("/settings")) return { kind: "settings" };
  if (pathname.startsWith("/calendar")) return { kind: "calendar" };
  return { kind: "other" };
}

/** The per-turn context block plus at most one photo worth attaching. */
export function buildContext(data: GardenData, userName: string | null, pathname: string, today: string): { text: string; photoId: string | null } {
  const page = parsePath(pathname);
  const all = plantingViews(data, today);
  const parts: string[] = [`Today: ${today} (${formatDate(today, { weekday: true })}), garden timezone ${data.garden.timezone}.`, `User: ${userName ?? "unknown"}.`];
  let photoId: string | null = null;

  if (page.kind === "planting" && page.id) {
    const p = all.find((x) => x.id === page.id);
    if (p) {
      parts.push(`Viewing: the page for planting [${p.id}] (${plantingLabel(p)}).`, plantingDetail(data, p));
      photoId = photosFor(data, { plantingId: p.id, kind: "progress" })[0]?.id ?? null;
    }
  } else if (page.kind === "tray" && page.id) {
    const tray = data.trays.find((t) => t.id === page.id);
    if (tray) {
      const inTray = all.filter((p) => p.trayId === tray.id);
      const grid = tray.rows
        .map((r) =>
          Array.from({ length: tray.cols }, (_, i) => {
            const cell = `${i + 1}${r}`;
            const p = inTray.find((x) => x.cells.includes(cell));
            return `${cell}: ${p ? `${p.name} [${p.id}], ${p.status}` : "empty"}`;
          }).join(" | "),
        )
        .join("\n");
      parts.push(
        `Viewing: the ${tray.name} planter [${tray.id}] (${tray.kind ?? ""}). ${tray.notes ?? ""}`,
        `Layout:\n${grid}`,
        `Layout as markdown (the format update_planter_layout takes):\n${trayMarkdown(data, tray.id)}`,
      );
      const trayPhoto = photosFor(data, { trayId: tray.id })[0];
      if (trayPhoto) {
        photoId = trayPhoto.id;
        parts.push(`Latest planter photo: [${trayPhoto.id}] (${trayPhoto.takenAt}).`);
      }
    }
  } else if (page.kind === "plant" && page.id) {
    const s = data.species.find((x) => x.id === page.id);
    if (s) {
      parts.push(
        `Viewing: the seed library entry for ${s.commonName}${s.variety ? ` '${s.variety}'` : ""} [${s.id}].`,
        `Packet data: ${JSON.stringify({ ...s, milestones: undefined })}`,
      );
      photoId = photosFor(data, { speciesId: s.id, kind: "packet_back" })[0]?.id ?? null;
    }
  } else {
    parts.push(`Viewing: the ${page.kind === "other" ? "app" : page.kind} page.`);
    const tasks = tasksFor(data);
    if (tasks.length) parts.push(`Open tasks:\n${tasks.map((t) => `- ${t.dueDate}: ${t.title}${t.plantingId ? ` (planting [${t.plantingId}])` : ""}`).join("\n")}`);
  }

  parts.push(`Planters: ${sortedTrays(data).map((t) => `${t.name} [${t.id}]`).join(", ")}`);
  parts.push(`All plantings:\n${all.map(plantingSummary).join("\n")}`);
  return { text: `<app_context>\n${parts.join("\n\n")}\n</app_context>`, photoId };
}


// ---------- Tools ----------

export type ToolSpec = { name: string; description: string; properties: Record<string, unknown> };

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "log_care",
    description: "Record care events that the user says happened (e.g. watering the whole tray, seeing sprouts, thinning). One event per planting.",
    properties: {
      planting_ids: { type: "array", items: { type: "string" }, description: "Planting IDs (the [bracketed] IDs in the context)." },
      type: { type: "string", enum: [...EVENT_TYPES] },
      date: { type: "string", description: "YYYY-MM-DD, or empty string for today." },
      note: { type: "string", description: "Optional short detail, or empty string." },
    },
  },
  {
    name: "add_note",
    description: "Save a journal note, for an observation or something the user wants remembered.",
    properties: { planting_id: { type: "string", description: "Planting ID, or empty string for a garden-wide note." }, body: { type: "string" } },
  },
  {
    name: "create_task",
    description: "Create a to-do reminder that shows up on the Today page and calendar on its due date.",
    properties: {
      title: { type: "string" },
      due_date: { type: "string", description: "YYYY-MM-DD" },
      planting_id: { type: "string", description: "Related planting ID, or empty string." },
    },
  },
  {
    name: "update_planting",
    description: "Correct a planting's status and/or sow date.",
    properties: {
      planting_id: { type: "string" },
      status: { type: "string", enum: [...PLANTING_STATUSES, "unchanged"] },
      sown_at: { type: "string", description: "YYYY-MM-DD, or empty string to leave unchanged." },
      sow_date_estimated: { type: "string", enum: ["yes", "no", "unchanged"] },
    },
  },
  {
    name: "update_planter_layout",
    description:
      "Create a planter or rewrite its layout. Pass the whole planter as markdown: a '# Name' heading, an optional one-line description, then a table whose header row is | | 1 | 2 | ... |, a |---| separator row, and one row per letter (| A | Basil | Thyme | ... |). Leave a cell blank when empty; repeat a name in adjacent cells of a row for one planting spanning them. Plants not in the seed library are added to it. New plantings start as 'planned'.",
    properties: {
      planter_id: { type: "string", description: "Planter ID to rewrite, or empty string to create a new planter." },
      markdown: { type: "string" },
    },
  },
  { name: "get_planting", description: "Get full details (packet info, schedule, care log, notes, photo list) for any planting.", properties: { planting_id: { type: "string" } } },
  { name: "view_photo", description: "Look at one of the garden's photos by ID.", properties: { photo_id: { type: "string" } } },
];

export const MUTATING = new Set(["log_care", "add_note", "create_task", "update_planting", "update_planter_layout"]);

const LogCare = z.object({ planting_ids: z.array(z.string()).min(1), type: z.enum(EVENT_TYPES), date: z.string().default(""), note: z.string().default("") });
const AddNote = z.object({ planting_id: z.string().default(""), body: z.string().min(1) });
const CreateTask = z.object({ title: z.string().min(1), due_date: z.string(), planting_id: z.string().default("") });
const UpdatePlanting = z.object({
  planting_id: z.string(),
  status: z.enum([...PLANTING_STATUSES, "unchanged"]).default("unchanged"),
  sown_at: z.string().default(""),
  sow_date_estimated: z.enum(["yes", "no", "unchanged"]).default("unchanged"),
});
const UpdateLayout = z.object({ planter_id: z.string().default(""), markdown: z.string().min(1) });
const PlantingRef = z.object({ planting_id: z.string() });
const PhotoRef = z.object({ photo_id: z.string() });

export type AssistantDeps = {
  db: GardenDB;
  latest: () => GardenData;
  act: <T>(fn: (ctx: ActionCtx) => Promise<T>) => Promise<T>;
  gardener: string | null;
  today: string;
};

/** A tool's outcome: text for the model, a photo to show it (each backend attaches images its own way), and a line for the UI. */
export type ToolOutput = { text: string; photoId?: string; summary: string; isError?: boolean };

export async function runTool(name: string, raw: unknown, deps: AssistantDeps): Promise<ToolOutput> {
  const data = deps.latest();
  const fail = (msg: string): ToolOutput => ({ text: msg, summary: `${name} failed`, isError: true });
  const planting = (id: string) => data.plantings.find((p) => p.id === id);
  const nameOf = (id: string) => data.species.find((s) => s.id === planting(id)?.speciesId)?.commonName ?? "planting";
  try {
    switch (name) {
      case "log_care": {
        const r = LogCare.safeParse(raw);
        if (!r.success) return fail(`Invalid input: ${r.error.message}`);
        const date = r.data.date || deps.today;
        if (!isDate(date)) return fail("date must be YYYY-MM-DD");
        const n = await deps.act((ctx) => logCare(ctx, { plantingIds: r.data.planting_ids, type: r.data.type, date, note: r.data.note, byAssistant: true }));
        if (n === 0) return fail("None of those planting IDs exist in this garden.");
        return { text: `Logged ${r.data.type} on ${date} for ${n} planting(s).`, summary: `Logged “${r.data.type.replace("_", " ")}” for ${n} planting${n === 1 ? "" : "s"}` };
      }
      case "add_note": {
        const r = AddNote.safeParse(raw);
        if (!r.success) return fail(`Invalid input: ${r.error.message}`);
        if (r.data.planting_id && !planting(r.data.planting_id)) return fail("Unknown planting ID.");
        await deps.act((ctx) => addNote(ctx, { plantingId: r.data.planting_id || null, body: r.data.body, byAssistant: true }));
        return { text: "Note saved.", summary: `Saved a note${r.data.planting_id ? ` on ${nameOf(r.data.planting_id)}` : ""}` };
      }
      case "create_task": {
        const r = CreateTask.safeParse(raw);
        if (!r.success) return fail(`Invalid input: ${r.error.message}`);
        if (!isDate(r.data.due_date)) return fail("due_date must be YYYY-MM-DD");
        if (r.data.planting_id && !planting(r.data.planting_id)) return fail("Unknown planting ID.");
        await deps.act((ctx) => addTask(ctx, { plantingId: r.data.planting_id || null, title: r.data.title, dueDate: r.data.due_date, byAssistant: true }));
        return { text: "Task created.", summary: `Added task “${r.data.title}” for ${formatDate(r.data.due_date)}` };
      }
      case "update_planting": {
        const r = UpdatePlanting.safeParse(raw);
        if (!r.success) return fail(`Invalid input: ${r.error.message}`);
        if (!planting(r.data.planting_id)) return fail("Unknown planting ID.");
        if (r.data.sown_at && !isDate(r.data.sown_at)) return fail("sown_at must be YYYY-MM-DD");
        const patch: Parameters<typeof updatePlanting>[2] = {};
        if (r.data.status !== "unchanged") patch.status = r.data.status;
        if (r.data.sown_at) patch.sownAt = r.data.sown_at;
        if (r.data.sow_date_estimated !== "unchanged") patch.sowDateEstimated = r.data.sow_date_estimated === "yes";
        await deps.act((ctx) => updatePlanting(ctx, r.data.planting_id, patch));
        return { text: "Planting updated.", summary: `Updated ${nameOf(r.data.planting_id)}` };
      }
      case "update_planter_layout": {
        const r = UpdateLayout.safeParse(raw);
        if (!r.success) return fail(`Invalid input: ${r.error.message}`);
        if (r.data.planter_id && !data.trays.some((t) => t.id === r.data.planter_id)) return fail("Unknown planter ID.");
        const res = await deps.act((ctx) => applyTrayLayout(ctx, r.data.planter_id || null, r.data.markdown));
        const fresh = deps.latest();
        const ids = plantingViews(fresh, deps.today)
          .filter((p) => p.trayId === res.trayId)
          .map((p) => `[${p.id}] ${p.name} ${cellRange(p.cells)} (${p.status})`)
          .join("; ");
        return {
          text: `Planter [${res.trayId}] saved: ${res.added} planned, ${res.moved} moved, ${res.kept} unchanged, ${res.removed} removed, ${res.detached} kept outside the planter because they have history.${res.newPlants.length ? ` Added to the seed library: ${res.newPlants.join(", ")}.` : ""} Plantings now: ${ids || "none"}`,
          summary: `Updated a planter layout (${res.added} new, ${res.moved} moved, ${res.removed + res.detached} removed)`,
        };
      }
      case "get_planting": {
        const r = PlantingRef.safeParse(raw);
        if (!r.success) return fail(`Invalid input: ${r.error.message}`);
        const p = plantingViews(data, deps.today).find((x) => x.id === r.data.planting_id);
        if (!p) return fail("Unknown planting ID.");
        return { text: plantingDetail(data, p), summary: `Looked up ${p.name}` };
      }
      case "view_photo": {
        const r = PhotoRef.safeParse(raw);
        if (!r.success) return fail(`Invalid input: ${r.error.message}`);
        if (!data.photos.some((p) => p.id === r.data.photo_id)) return fail("Unknown photo ID.");
        return { text: `Photo [${r.data.photo_id}] attached.`, photoId: r.data.photo_id, summary: "Looked at a photo" };
      }
      default:
        return fail(`Unknown tool ${name}`);
    }
  } catch (err) {
    return fail((err as Error).message || "That didn't work.");
  }
}

// ---------- Photos ----------

export type ImageData = { mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string };

export async function photoData(db: GardenDB, photo: Photo | undefined): Promise<ImageData | null> {
  if (!photo) return null;
  let blob: Blob | undefined;
  if (photo.src) {
    const res = await fetch(`${import.meta.env.BASE_URL}${photo.src}`);
    if (res.ok) blob = await res.blob();
  } else blob = await getPhotoBlob(db, photo.id);
  if (!blob) return null;
  return { mime: (blob.type || photo.mime) as ImageData["mime"], base64: await blobToBase64(blob) };
}
