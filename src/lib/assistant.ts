// The in-app garden assistant. Runs in the browser: builds context from where the
// user is in the app, exposes a few garden tools, calls Claude with the user's own
// API key, and keeps each conversation append-only in IndexedDB.

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { addNote, addTask, logCare, updatePlanting, type ActionCtx } from "./actions.ts";
import { formatDate, isDate } from "./dates.ts";
import { cellRange, eventsFor, notesFor, photosFor, plantingLabel, plantingViews, sortedTrays, tasksFor, type PlantingView } from "./garden.ts";
import type { CareItem } from "./schedule.ts";
import { EVENT_TYPES, PLANTING_STATUSES } from "./seed-data.ts";
import { appendChat, blobToBase64, currentThreadId, getPhotoBlob, loadChat, newThread, type GardenDB } from "./store.ts";
import type { ChatRecord, GardenData, Photo } from "./types.ts";

export const MODEL = "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 8;

// Kept byte-for-byte stable so it caches; anything that changes per request goes in the user turn.
const SYSTEM_PROMPT = `You are the garden assistant inside a small, private garden-tracking web app shared by a household of gardeners.

The app tracks:
- Planters ("trays"): a 16-cell seed tray and an 18-cup egg carton. Cells are named column number + row letter as printed on the tray (1A is top-left; "1-2C" means a planting spanning cells 1C and 2C).
- Plants (the seed library): one entry per seed packet, with the packet's sowing depth, germination days, spacing, watering and harvest info.
- Plantings: a plant sown in particular cells, with a status (planned, sown, sprouted, growing, transplanted, harvesting, done, failed) and a sow date. Some sow dates are estimates.
- A care log of events (watered, sprouted, thinned, pinched, fertilized, potted_up, transplanted, harvested, other), notes, photos, and to-do tasks.
- A computed care schedule per planting: daily misting while seedlings are in the tray, the germination window from the packet, and packet-based milestones (thinning, first feeding, pinching, transplanting, harvest). Logging the matching event completes a milestone.

Each user message starts with an <app_context> block describing today's date, the page the user is looking at, and current garden data. Treat it as the source of truth about the garden; it reflects the data at the moment the message was sent. Planting and photo IDs appear there in brackets, like [seed-tray-4A]. Photos can be inspected with view_photo. When a photo is attached, look at it carefully — seedling color, legginess, damping off, mold, overcrowding — and say what you see.

How to help:
- Answer as a knowledgeable, practical gardener. Be specific to this garden's plants, cells, dates and packet instructions rather than generic. Keep answers short and skimmable; use short lists when listing steps.
- When the user tells you something happened ("we watered the tray", "the parsley came up", "thinned the lettuce"), record it with log_care. When they share an observation or ask you to remember something, save it with add_note. When they want a reminder, use create_task. When a sow date or status is wrong, fix it with update_planting.
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

function plantingDetail(data: GardenData, p: PlantingView): string {
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

type PageRef = { kind: "dashboard" | "planting" | "tray" | "plant" | "plants" | "settings" | "other"; id?: string };

export function parsePath(pathname: string): PageRef {
  const m = pathname.match(/^\/(plantings|trays|plants)\/([^/]+)/);
  if (m && m[2] !== "new") return { kind: ({ plantings: "planting", trays: "tray", plants: "plant" } as const)[m[1] as "plantings"], id: decodeURIComponent(m[2]) };
  if (pathname === "/" || pathname === "") return { kind: "dashboard" };
  if (pathname.startsWith("/plants")) return { kind: "plants" };
  if (pathname.startsWith("/settings")) return { kind: "settings" };
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
      parts.push(`Viewing: the ${tray.name} planter (${tray.kind ?? ""}). ${tray.notes ?? ""}`, `Layout:\n${grid}`);
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

const LogCare = z.object({ planting_ids: z.array(z.string()).min(1), type: z.enum(EVENT_TYPES), date: z.string(), note: z.string() });
const AddNote = z.object({ planting_id: z.string(), body: z.string().min(1) });
const CreateTask = z.object({ title: z.string().min(1), due_date: z.string(), planting_id: z.string() });
const UpdatePlanting = z.object({
  planting_id: z.string(),
  status: z.enum([...PLANTING_STATUSES, "unchanged"]),
  sown_at: z.string(),
  sow_date_estimated: z.enum(["yes", "no", "unchanged"]),
});
const PlantingRef = z.object({ planting_id: z.string() });
const PhotoRef = z.object({ photo_id: z.string() });

const tool = (name: string, description: string, properties: Record<string, unknown>): BetaTool => ({
  name,
  description,
  strict: true,
  eager_input_streaming: true,
  input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});

const TOOLS: BetaTool[] = [
  tool("log_care", "Record care events that the user says happened (e.g. watering the whole tray, seeing sprouts, thinning). One event per planting.", {
    planting_ids: { type: "array", items: { type: "string" }, description: "Planting IDs (the [bracketed] IDs in the context)." },
    type: { type: "string", enum: [...EVENT_TYPES] },
    date: { type: "string", description: "YYYY-MM-DD, or empty string for today." },
    note: { type: "string", description: "Optional short detail, or empty string." },
  }),
  tool("add_note", "Save a journal note, for an observation or something the user wants remembered.", {
    planting_id: { type: "string", description: "Planting ID, or empty string for a garden-wide note." },
    body: { type: "string" },
  }),
  tool("create_task", "Create a to-do reminder that shows up on the Today page on its due date.", {
    title: { type: "string" },
    due_date: { type: "string", description: "YYYY-MM-DD" },
    planting_id: { type: "string", description: "Related planting ID, or empty string." },
  }),
  tool("update_planting", "Correct a planting's status and/or sow date.", {
    planting_id: { type: "string" },
    status: { type: "string", enum: [...PLANTING_STATUSES, "unchanged"] },
    sown_at: { type: "string", description: "YYYY-MM-DD, or empty string to leave unchanged." },
    sow_date_estimated: { type: "string", enum: ["yes", "no", "unchanged"] },
  }),
  tool("get_planting", "Get full details (packet info, schedule, care log, notes, photo list) for any planting.", { planting_id: { type: "string" } }),
  tool("view_photo", "Look at one of the garden's photos by ID.", { photo_id: { type: "string" } }),
];

const MUTATING = new Set(["log_care", "add_note", "create_task", "update_planting"]);

export type AssistantDeps = {
  db: GardenDB;
  latest: () => GardenData;
  act: <T>(fn: (ctx: ActionCtx) => Promise<T>) => Promise<T>;
  gardener: string | null;
  today: string;
  apiKey: string;
};

type ToolOutput = { content: BetaToolResultBlockParam["content"]; summary: string; isError?: boolean };

async function imageBlock(db: GardenDB, photo: Photo | undefined) {
  if (!photo) return null;
  let blob: Blob | undefined;
  if (photo.src) {
    const res = await fetch(`${import.meta.env.BASE_URL}${photo.src}`);
    if (res.ok) blob = await res.blob();
  } else blob = await getPhotoBlob(db, photo.id);
  if (!blob) return null;
  const mime = (blob.type || photo.mime) as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  return { type: "image" as const, source: { type: "base64" as const, media_type: mime, data: await blobToBase64(blob) } };
}

async function runTool(name: string, raw: unknown, deps: AssistantDeps): Promise<ToolOutput> {
  const data = deps.latest();
  const fail = (msg: string): ToolOutput => ({ content: msg, summary: `${name} failed`, isError: true });
  const planting = (id: string) => data.plantings.find((p) => p.id === id);
  const nameOf = (id: string) => data.species.find((s) => s.id === planting(id)?.speciesId)?.commonName ?? "planting";
  switch (name) {
    case "log_care": {
      const r = LogCare.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const date = r.data.date || deps.today;
      if (!isDate(date)) return fail("date must be YYYY-MM-DD");
      const n = await deps.act((ctx) => logCare(ctx, { plantingIds: r.data.planting_ids, type: r.data.type, date, note: r.data.note, byAssistant: true }));
      if (n === 0) return fail("None of those planting IDs exist in this garden.");
      return { content: `Logged ${r.data.type} on ${date} for ${n} planting(s).`, summary: `Logged “${r.data.type.replace("_", " ")}” for ${n} planting${n === 1 ? "" : "s"}` };
    }
    case "add_note": {
      const r = AddNote.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      if (r.data.planting_id && !planting(r.data.planting_id)) return fail("Unknown planting ID.");
      await deps.act((ctx) => addNote(ctx, { plantingId: r.data.planting_id || null, body: r.data.body, byAssistant: true }));
      return { content: "Note saved.", summary: `Saved a note${r.data.planting_id ? ` on ${nameOf(r.data.planting_id)}` : ""}` };
    }
    case "create_task": {
      const r = CreateTask.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      if (!isDate(r.data.due_date)) return fail("due_date must be YYYY-MM-DD");
      if (r.data.planting_id && !planting(r.data.planting_id)) return fail("Unknown planting ID.");
      await deps.act((ctx) => addTask(ctx, { plantingId: r.data.planting_id || null, title: r.data.title, dueDate: r.data.due_date, byAssistant: true }));
      return { content: "Task created.", summary: `Added task “${r.data.title}” for ${formatDate(r.data.due_date)}` };
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
      return { content: "Planting updated.", summary: `Updated ${nameOf(r.data.planting_id)}` };
    }
    case "get_planting": {
      const r = PlantingRef.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const p = plantingViews(data, deps.today).find((x) => x.id === r.data.planting_id);
      if (!p) return fail("Unknown planting ID.");
      return { content: plantingDetail(data, p), summary: `Looked up ${p.name}` };
    }
    case "view_photo": {
      const r = PhotoRef.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const img = await imageBlock(deps.db, data.photos.find((p) => p.id === r.data.photo_id));
      if (!img) return fail("Unknown photo ID.");
      return { content: [img], summary: "Looked at a photo" };
    }
    default:
      return fail(`Unknown tool ${name}`);
  }
}

// ---------- Conversation storage ----------

type StoredBlock = BetaContentBlockParam | { type: "garden_photo"; photo_id: string };

export async function threadForDisplay(db: GardenDB): Promise<{ role: "user" | "assistant"; text?: string; tools?: string[] }[]> {
  const rows = await loadChat(db, await currentThreadId(db));
  return rows.filter((m) => m.display).map((m) => ({ role: m.role, ...m.display! }));
}

export async function startNewThread(db: GardenDB): Promise<void> {
  await newThread(db);
}

async function toApiMessages(db: GardenDB, data: GardenData, rows: ChatRecord[]): Promise<BetaMessageParam[]> {
  return Promise.all(
    rows.map(async (m) => ({
      role: m.role,
      content: (
        await Promise.all(
          (m.content as StoredBlock[]).map(async (b): Promise<BetaContentBlockParam[]> => {
            if (b.type !== "garden_photo") return [b];
            const img = await imageBlock(db, data.photos.find((p) => p.id === b.photo_id));
            return img ? [img] : [{ type: "text", text: `[photo ${b.photo_id} no longer available]` }];
          }),
        )
      ).flat(),
    })),
  );
}

// ---------- Run a turn ----------

export type StreamEvent = { t: "text"; v: string } | { t: "tool"; summary: string } | { t: "done"; mutated: boolean } | { t: "error"; message: string };

export async function runAssistantTurn(deps: AssistantDeps, args: { pathname: string; message: string }, emit: (e: StreamEvent) => void): Promise<void> {
  const client = new Anthropic({ apiKey: deps.apiKey, dangerouslyAllowBrowser: true });
  const { db } = deps;
  const threadId = await currentThreadId(db);
  const append = (role: "user" | "assistant", content: StoredBlock[], display: ChatRecord["display"]) =>
    appendChat(db, { threadId, role, content, display, createdAt: new Date().toISOString() });

  const ctx = buildContext(deps.latest(), deps.gardener, args.pathname, deps.today);
  const shown = (await loadChat(db, threadId)).some((m) => (m.content as StoredBlock[]).some((b) => b.type === "garden_photo" && b.photo_id === ctx.photoId));
  const userContent: StoredBlock[] = [{ type: "text", text: ctx.text }];
  if (ctx.photoId && !shown) userContent.push({ type: "garden_photo", photo_id: ctx.photoId });
  userContent.push({ type: "text", text: args.message });
  await append("user", userContent, { text: args.message });

  let mutated = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: [{ type: "text", text: SYSTEM_PROMPT }],
      tools: TOOLS,
      messages: await toApiMessages(db, deps.latest(), await loadChat(db, threadId)),
    });
    stream.on("text", (delta) => emit({ t: "text", v: delta }));

    let message;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw err;
      // A streamed tool input wasn't parseable JSON; nothing was stored for this round, so retry it.
      continue;
    }

    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const toolUses = message.content.filter((b) => b.type === "tool_use");

    if (message.stop_reason === "refusal") {
      await append("assistant", message.content as StoredBlock[], { text: text || "Sorry — I can't help with that one." });
      if (!text) emit({ t: "text", v: "Sorry — I can't help with that one." });
      break;
    }
    if (message.stop_reason === "max_tokens" && toolUses.length) {
      // A cut-off tool call can't be run; keep the transcript valid by not storing the partial turn.
      emit({ t: "error", message: "The reply got too long. Try asking for something smaller." });
      break;
    }

    const results: BetaToolResultBlockParam[] = [];
    const summaries: string[] = [];
    for (const tu of toolUses) {
      if (tu.type !== "tool_use") continue;
      const out = await runTool(tu.name, tu.input, deps);
      if (MUTATING.has(tu.name) && !out.isError) mutated = true;
      summaries.push(out.summary);
      emit({ t: "tool", summary: out.summary });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.content, is_error: out.isError });
    }

    await append("assistant", message.content as StoredBlock[], text || summaries.length ? { text, tools: summaries } : null);
    if (!results.length) break;
    await append("user", results, null);
  }
  emit({ t: "done", mutated });
}

/** Friendlier messages for the errors people actually hit with a browser-held key. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "That API key was rejected. Check it in Settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (err instanceof Anthropic.RateLimitError) return "Too many requests right now — wait a moment and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your connection.";
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status ?? "?"}). Please try again.`;
  return "The assistant hit an error. Please try again.";
}
