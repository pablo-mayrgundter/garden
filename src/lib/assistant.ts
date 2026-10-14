// The in-app garden assistant: builds context from where the user is in the app,
// exposes a few garden tools, and keeps each conversation append-only in SQLite.

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import fs from "node:fs";
import { z } from "zod";
import { formatDate, isDate } from "./dates";
import { db } from "./db";
import {
  addEvents,
  addNote,
  addTask,
  cellRange,
  getPlanting,
  getSpecies,
  getTray,
  listEvents,
  listNotes,
  listPhotos,
  listTasks,
  plantingLabel,
  plantingsWithCare,
  updatePlanting,
  type PlantingWithCare,
} from "./garden";
import { photoFile } from "./photos";
import type { CareItem } from "./schedule";
import { EVENT_TYPES, PLANTING_STATUSES } from "./seed-data";

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

Each user message starts with an <app_context> block describing today's date, the page the user is looking at, and current garden data. Treat it as the source of truth about the garden; it reflects the database at the moment the message was sent. Photo IDs listed there can be inspected with view_photo. When a photo is attached, look at it carefully — seedling color, legginess, damping off, mold, overcrowding — and say what you see.

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

function plantingSummary(p: PlantingWithCare, today: string): string {
  const where = p.trayName ? `${p.trayName} ${cellRange(p.cells)}` : (p.location ?? "no location");
  const sown = p.sownAt ? `sown ${p.sownAt}${p.sowDateEstimated ? " (estimated)" : ""}` : "not sown yet";
  const open = p.care.filter((c) => c.status !== "done" && c.status !== "upcoming").map((c) => careLine(c));
  const next = p.care.find((c) => c.status === "upcoming");
  return `- #${p.id} ${p.name}${p.variety ? ` '${p.variety}'` : ""} — ${where} — ${p.status}, ${sown}` +
    (open.length ? ` — needs: ${open.join("; ")}` : "") +
    (next ? ` — next: ${careLine(next)}` : "");
}

function plantingDetail(gardenId: number, p: PlantingWithCare, today: string): string {
  const s = p.species;
  const events = listEvents(gardenId, [p.id]).slice(0, 25);
  const notes = listNotes(gardenId, { plantingId: p.id, limit: 15 });
  const photos = listPhotos(gardenId, { plantingId: p.id, limit: 20 });
  const tasks = listTasks(gardenId, { plantingId: p.id });
  const lines = [
    `Planting #${p.id}: ${plantingLabel(p)} — status ${p.status}, ${p.sownAt ? `sown ${p.sownAt}${p.sowDateEstimated ? " (estimated)" : ""}` : "not sown"}`,
    `Plant: ${s.commonName}${s.variety ? ` '${s.variety}'` : ""} (${s.scientificName ?? "?"}), ${s.lifecycle ?? ""} ${s.category}, packet from ${s.source ?? "unknown"}`,
    `Packet data: sow depth ${s.sowDepth ?? "?"}; germination ${s.germDaysMin ?? "?"}–${s.germDaysMax ?? "?"} days; light ${s.light ?? "?"}; height ${s.height ?? "?"}; spread ${s.spread ?? "?"}; spacing ${s.spacing ?? "?"}; soil ${s.soil ?? "?"}; watering ${s.watering ?? "?"}; harvest ${s.harvestDaysMin ?? "?"}–${s.harvestDaysMax ?? "?"} days`,
    s.packetText ? `Packet text: ${s.packetText}` : "",
    s.tips.length ? `Tips: ${s.tips.join(" | ")}` : "",
    `Schedule:\n${p.care.map((c) => `  - ${careLine(c)}`).join("\n") || "  (none)"}`,
    `Care log (newest first):\n${events.map((e) => `  - ${e.date} ${e.type}${e.note ? `: ${e.note}` : ""}${e.userName ? ` (${e.userName})` : ""}`).join("\n") || "  (empty)"}`,
    `Notes (newest first):\n${notes.map((n) => `  - ${n.createdAt.slice(0, 10)}${n.userName ? ` ${n.userName}` : ""}${n.byAssistant ? " (assistant)" : ""}: ${n.body}`).join("\n") || "  (none)"}`,
    `Open tasks:\n${tasks.map((t) => `  - ${t.dueDate}: ${t.title}`).join("\n") || "  (none)"}`,
    `Photos (newest first):\n${photos.map((ph) => `  - photo #${ph.id}, ${ph.takenAt}${ph.caption ? `: ${ph.caption}` : ""}`).join("\n") || "  (none)"}`,
  ];
  return lines.filter(Boolean).join("\n");
}

type PageRef = { kind: "dashboard" | "planting" | "tray" | "plant" | "plants" | "settings" | "other"; id?: number };

export function parsePath(pathname: string): PageRef {
  const m = pathname.match(/^\/(plantings|trays|plants)\/(\d+)/);
  if (m) return { kind: ({ plantings: "planting", trays: "tray", plants: "plant" } as const)[m[1] as "plantings"], id: Number(m[2]) };
  if (pathname === "/") return { kind: "dashboard" };
  if (pathname.startsWith("/plants")) return { kind: "plants" };
  if (pathname.startsWith("/settings")) return { kind: "settings" };
  return { kind: "other" };
}

/** The per-turn context block plus at most one photo worth attaching. */
export function buildContext(
  gardenId: number,
  userName: string,
  pathname: string,
  today: string,
  timezone: string,
): { text: string; photoId: number | null } {
  const page = parsePath(pathname);
  const all = plantingsWithCare(gardenId, today);
  const parts: string[] = [
    `Today: ${today} (${formatDate(today, { weekday: true })}), garden timezone ${timezone}.`,
    `User: ${userName}.`,
  ];
  let photoId: number | null = null;

  if (page.kind === "planting" && page.id) {
    const p = all.find((x) => x.id === page.id);
    if (p) {
      parts.push(`Viewing: the page for planting #${p.id} (${plantingLabel(p)}).`, plantingDetail(gardenId, p, today));
      photoId = listPhotos(gardenId, { plantingId: p.id, kind: "progress", limit: 1 })[0]?.id ?? null;
    }
  } else if (page.kind === "tray" && page.id) {
    const tray = getTray(gardenId, page.id);
    if (tray) {
      const inTray = all.filter((p) => p.trayId === tray.id);
      const grid = tray.rows
        .map((r) =>
          Array.from({ length: tray.cols }, (_, i) => {
            const cell = `${i + 1}${r}`;
            const p = inTray.find((x) => x.cells.includes(cell));
            return `${cell}: ${p ? `${p.name} (#${p.id}, ${p.status})` : "empty"}`;
          }).join(" | "),
        )
        .join("\n");
      parts.push(`Viewing: the ${tray.name} planter (${tray.kind ?? ""}). ${tray.notes ?? ""}`, `Layout:\n${grid}`);
      const trayPhoto = listPhotos(gardenId, { trayId: tray.id, limit: 1 })[0];
      if (trayPhoto) {
        photoId = trayPhoto.id;
        parts.push(`Latest planter photo: #${trayPhoto.id} (${trayPhoto.takenAt}).`);
      }
    }
  } else if (page.kind === "plant" && page.id) {
    const s = getSpecies(gardenId, page.id);
    if (s) {
      parts.push(
        `Viewing: the seed library entry for ${s.commonName}${s.variety ? ` '${s.variety}'` : ""} (plant #${s.id}).`,
        `Packet data: ${JSON.stringify({ ...s, milestones: undefined })}`,
      );
      photoId = listPhotos(gardenId, { speciesId: s.id, kind: "packet_back", limit: 1 })[0]?.id ?? null;
    }
  } else {
    parts.push(`Viewing: the ${page.kind === "other" ? "app" : page.kind} page.`);
    const tasks = listTasks(gardenId);
    if (tasks.length) parts.push(`Open tasks:\n${tasks.map((t) => `- ${t.dueDate}: ${t.title}${t.plantingId ? ` (planting #${t.plantingId})` : ""}`).join("\n")}`);
  }

  parts.push(`All plantings:\n${all.map((p) => plantingSummary(p, today)).join("\n")}`);
  return { text: `<app_context>\n${parts.join("\n\n")}\n</app_context>`, photoId };
}

// ---------- Tools ----------

const LogCare = z.object({
  planting_ids: z.array(z.number().int()).min(1),
  type: z.enum(EVENT_TYPES),
  date: z.string(),
  note: z.string(),
});
const AddNote = z.object({ planting_id: z.number().int(), body: z.string().min(1) });
const CreateTask = z.object({ title: z.string().min(1), due_date: z.string(), planting_id: z.number().int() });
const UpdatePlanting = z.object({
  planting_id: z.number().int(),
  status: z.enum([...PLANTING_STATUSES, "unchanged"]),
  sown_at: z.string(),
  sow_date_estimated: z.enum(["yes", "no", "unchanged"]),
});
const PlantingRef = z.object({ planting_id: z.number().int() });
const PhotoRef = z.object({ photo_id: z.number().int() });

const tool = (name: string, description: string, properties: Record<string, unknown>): BetaTool => ({
  name,
  description,
  strict: true,
  eager_input_streaming: true,
  input_schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
});

const TOOLS: BetaTool[] = [
  tool("log_care", "Record care events that the user says happened (e.g. watering the whole tray, seeing sprouts, thinning). One event per planting.", {
    planting_ids: { type: "array", items: { type: "integer" }, description: "Planting IDs (#n in the context)." },
    type: { type: "string", enum: [...EVENT_TYPES] },
    date: { type: "string", description: "YYYY-MM-DD, or empty string for today." },
    note: { type: "string", description: "Optional short detail, or empty string." },
  }),
  tool("add_note", "Save a journal note, for an observation or something the user wants remembered.", {
    planting_id: { type: "integer", description: "Planting ID, or 0 for a garden-wide note." },
    body: { type: "string" },
  }),
  tool("create_task", "Create a to-do reminder that shows up on the dashboard on its due date.", {
    title: { type: "string" },
    due_date: { type: "string", description: "YYYY-MM-DD" },
    planting_id: { type: "integer", description: "Related planting ID, or 0." },
  }),
  tool("update_planting", "Correct a planting's status and/or sow date.", {
    planting_id: { type: "integer" },
    status: { type: "string", enum: [...PLANTING_STATUSES, "unchanged"] },
    sown_at: { type: "string", description: "YYYY-MM-DD, or empty string to leave unchanged." },
    sow_date_estimated: { type: "string", enum: ["yes", "no", "unchanged"] },
  }),
  tool("get_planting", "Get full details (packet info, schedule, care log, notes, photo list) for any planting.", {
    planting_id: { type: "integer" },
  }),
  tool("view_photo", "Look at one of the garden's photos by ID.", { photo_id: { type: "integer" } }),
];

const MUTATING = new Set(["log_care", "add_note", "create_task", "update_planting"]);

type ToolCtx = { gardenId: number; userId: number; today: string };
type ToolOutput = { content: BetaToolResultBlockParam["content"]; summary: string; isError?: boolean };

function imageBlock(gardenId: number, photoId: number) {
  const f = photoFile(gardenId, photoId);
  if (!f) return null;
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: f.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: fs.readFileSync(f.path).toString("base64"),
    },
  };
}

function runTool(name: string, raw: unknown, ctx: ToolCtx): ToolOutput {
  const { gardenId, userId, today } = ctx;
  const fail = (msg: string): ToolOutput => ({ content: msg, summary: `${name} failed`, isError: true });
  switch (name) {
    case "log_care": {
      const r = LogCare.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const date = r.data.date ? r.data.date : today;
      if (!isDate(date)) return fail("date must be YYYY-MM-DD");
      const n = addEvents(gardenId, { plantingIds: r.data.planting_ids, type: r.data.type, date, note: r.data.note, userId, byAssistant: true });
      if (n === 0) return fail("None of those planting IDs exist in this garden.");
      return { content: `Logged ${r.data.type} on ${date} for ${n} planting(s).`, summary: `Logged “${r.data.type.replace("_", " ")}” for ${n} planting${n === 1 ? "" : "s"}` };
    }
    case "add_note": {
      const r = AddNote.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const p = r.data.planting_id ? getPlanting(gardenId, r.data.planting_id) : null;
      if (r.data.planting_id && !p) return fail("Unknown planting ID.");
      addNote(gardenId, { plantingId: p?.id ?? null, body: r.data.body, userId, byAssistant: true });
      return { content: "Note saved.", summary: `Saved a note${p ? ` on ${p.name}` : ""}` };
    }
    case "create_task": {
      const r = CreateTask.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      if (!isDate(r.data.due_date)) return fail("due_date must be YYYY-MM-DD");
      if (r.data.planting_id && !getPlanting(gardenId, r.data.planting_id)) return fail("Unknown planting ID.");
      addTask(gardenId, { plantingId: r.data.planting_id || null, title: r.data.title, dueDate: r.data.due_date, userId, byAssistant: true });
      return { content: "Task created.", summary: `Added task “${r.data.title}” for ${formatDate(r.data.due_date)}` };
    }
    case "update_planting": {
      const r = UpdatePlanting.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const p = getPlanting(gardenId, r.data.planting_id);
      if (!p) return fail("Unknown planting ID.");
      if (r.data.sown_at && !isDate(r.data.sown_at)) return fail("sown_at must be YYYY-MM-DD");
      updatePlanting(gardenId, p.id, {
        status: r.data.status === "unchanged" ? undefined : r.data.status,
        sownAt: r.data.sown_at || undefined,
        sowDateEstimated: r.data.sow_date_estimated === "unchanged" ? undefined : r.data.sow_date_estimated === "yes",
      });
      return { content: "Planting updated.", summary: `Updated ${p.name}` };
    }
    case "get_planting": {
      const r = PlantingRef.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const p = plantingsWithCare(gardenId, today).find((x) => x.id === r.data.planting_id);
      if (!p) return fail("Unknown planting ID.");
      return { content: plantingDetail(gardenId, p, today), summary: `Looked up ${p.name}` };
    }
    case "view_photo": {
      const r = PhotoRef.safeParse(raw);
      if (!r.success) return fail(`Invalid input: ${r.error.message}`);
      const img = imageBlock(gardenId, r.data.photo_id);
      if (!img) return fail("Unknown photo ID.");
      return { content: [img], summary: `Looked at photo #${r.data.photo_id}` };
    }
    default:
      return fail(`Unknown tool ${name}`);
  }
}

// ---------- Thread storage ----------
// Stored content is exactly what was sent/received, except that attached garden photos are stored as
// {type: "garden_photo", photo_id} and expanded to the same image bytes on every request.

type StoredBlock = BetaContentBlockParam | { type: "garden_photo"; photo_id: number };
type Display = { text?: string; tools?: string[]; photoId?: number };

function currentThread(gardenId: number, userId: number): number {
  const row = db()
    .prepare("SELECT id FROM chat_threads WHERE garden_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1")
    .get(gardenId, userId) as { id: number } | undefined;
  if (row) return row.id;
  return newThread(gardenId, userId);
}

export function newThread(gardenId: number, userId: number): number {
  return Number(db().prepare("INSERT INTO chat_threads (garden_id, user_id) VALUES (?, ?)").run(gardenId, userId).lastInsertRowid);
}

function appendMessage(threadId: number, role: "user" | "assistant", content: StoredBlock[], display: Display | null) {
  db()
    .prepare("INSERT INTO chat_messages (thread_id, role, content, display) VALUES (?, ?, ?, ?)")
    .run(threadId, role, JSON.stringify(content), display ? JSON.stringify(display) : null);
}

function loadMessages(threadId: number) {
  return db()
    .prepare("SELECT role, content, display FROM chat_messages WHERE thread_id = ? ORDER BY id")
    .all(threadId) as { role: "user" | "assistant"; content: string; display: string | null }[];
}

export function threadForDisplay(gardenId: number, userId: number): { role: "user" | "assistant"; text?: string; tools?: string[]; photoId?: number }[] {
  return loadMessages(currentThread(gardenId, userId))
    .filter((m) => m.display)
    .map((m) => ({ role: m.role, ...(JSON.parse(m.display!) as Display) }));
}

function toApiMessages(gardenId: number, threadId: number): BetaMessageParam[] {
  return loadMessages(threadId).map((m) => ({
    role: m.role,
    content: (JSON.parse(m.content) as StoredBlock[]).flatMap((b): BetaContentBlockParam[] => {
      if (b.type !== "garden_photo") return [b];
      const img = imageBlock(gardenId, b.photo_id);
      return img ? [img] : [{ type: "text", text: `[photo #${b.photo_id} no longer available]` }];
    }),
  }));
}

function photosAlreadyShown(threadId: number): Set<number> {
  const ids = new Set<number>();
  for (const m of loadMessages(threadId)) {
    for (const b of JSON.parse(m.content) as StoredBlock[]) if (b.type === "garden_photo") ids.add(b.photo_id);
  }
  return ids;
}

// ---------- Run a turn ----------

export type StreamEvent =
  | { t: "text"; v: string }
  | { t: "tool"; summary: string }
  | { t: "done"; mutated: boolean }
  | { t: "error"; message: string };

let client: Anthropic | null = null;

export async function runAssistantTurn(
  args: { gardenId: number; userId: number; userName: string; timezone: string; today: string; pathname: string; message: string },
  emit: (e: StreamEvent) => void,
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    emit({ t: "error", message: "The assistant isn't configured yet — set ANTHROPIC_API_KEY on the server." });
    return;
  }
  client ??= new Anthropic();
  const { gardenId, userId, today } = args;
  const threadId = currentThread(gardenId, userId);

  const ctx = buildContext(gardenId, args.userName, args.pathname, today, args.timezone);
  const attach = ctx.photoId && !photosAlreadyShown(threadId).has(ctx.photoId) ? ctx.photoId : null;
  const userContent: StoredBlock[] = [{ type: "text", text: ctx.text }];
  if (attach) userContent.push({ type: "garden_photo", photo_id: attach });
  userContent.push({ type: "text", text: args.message });
  appendMessage(threadId, "user", userContent, { text: args.message });

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
      messages: toApiMessages(gardenId, threadId),
    });
    stream.on("text", (delta) => emit({ t: "text", v: delta }));

    let message;
    try {
      message = await stream.finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.APIError) throw err;
      // A streamed tool input wasn't parseable JSON; nothing was stored for this round, so just retry it.
      continue;
    }

    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const toolUses = message.content.filter((b) => b.type === "tool_use");

    if (message.stop_reason === "refusal") {
      appendMessage(threadId, "assistant", message.content as StoredBlock[], { text: text || "Sorry — I can't help with that one." });
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
      const out = runTool(tu.name, tu.input, { gardenId, userId, today });
      if (MUTATING.has(tu.name) && !out.isError) mutated = true;
      summaries.push(out.summary);
      emit({ t: "tool", summary: out.summary });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.content, is_error: out.isError });
    }

    appendMessage(threadId, "assistant", message.content as StoredBlock[], text || summaries.length ? { text, tools: summaries } : null);
    if (!results.length) break;
    appendMessage(threadId, "user", results, null);
  }
  emit({ t: "done", mutated });
}
