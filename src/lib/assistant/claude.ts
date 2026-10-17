// Claude backend: calls the Claude API from the browser with the user's own key.

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessageParam, BetaTool, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { appendChat, currentThreadId, loadChat, type GardenDB } from "../store.ts";
import type { ChatRecord, GardenData } from "../types.ts";
import { buildContext, MAX_TOOL_ROUNDS, MUTATING, photoData, runTool, SYSTEM_PROMPT, TOOL_SPECS, type AssistantDeps } from "./core.ts";
import type { StreamEvent } from "./index.ts";

export const CLAUDE_MODEL = "claude-opus-5-5";

const TOOLS: BetaTool[] = TOOL_SPECS.map((t) => ({
  name: t.name,
  description: t.description,
  strict: true,
  eager_input_streaming: true,
  input_schema: { type: "object", properties: t.properties, required: Object.keys(t.properties), additionalProperties: false },
}));

// Stored content is exactly what was sent/received, except that garden photos are kept as
// {type: "garden_photo", photo_id} and expanded to the same image bytes on every request.
type PhotoRef = { type: "garden_photo"; photo_id: string };
type StoredBlock = BetaContentBlockParam | PhotoRef;
type StoredToolResult = Omit<BetaToolResultBlockParam, "content"> & { content: (BetaContentBlockParam | PhotoRef)[] | string };

async function expand(db: GardenDB, data: GardenData, b: StoredBlock | StoredToolResult): Promise<BetaContentBlockParam[]> {
  if (b.type === "garden_photo") {
    const img = await photoData(db, data.photos.find((p) => p.id === b.photo_id));
    return img
      ? [{ type: "image", source: { type: "base64", media_type: img.mime, data: img.base64 } }]
      : [{ type: "text", text: `[photo ${b.photo_id} no longer available]` }];
  }
  if (b.type === "tool_result" && Array.isArray(b.content)) {
    const content = (await Promise.all(b.content.map((c) => expand(db, data, c as StoredBlock)))).flat();
    return [{ ...b, content } as BetaToolResultBlockParam];
  }
  return [b as BetaContentBlockParam];
}

async function toApiMessages(db: GardenDB, data: GardenData, rows: ChatRecord[]): Promise<BetaMessageParam[]> {
  return Promise.all(
    rows.map(async (m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: (await Promise.all((m.content as StoredBlock[]).map((b) => expand(db, data, b)))).flat(),
    })),
  );
}

export async function runClaudeTurn(
  deps: AssistantDeps & { apiKey: string },
  args: { pathname: string; message: string },
  emit: (e: StreamEvent) => void,
): Promise<void> {
  const client = new Anthropic({ apiKey: deps.apiKey, dangerouslyAllowBrowser: true });
  const { db } = deps;
  const threadId = await currentThreadId(db, "claude");
  const append = (role: "user" | "assistant", content: unknown[], display: ChatRecord["display"]) =>
    appendChat(db, { threadId, provider: "claude", role, content, display, createdAt: new Date().toISOString() });

  const ctx = buildContext(deps.latest(), deps.gardener, args.pathname, deps.today);
  const shown = (await loadChat(db, threadId)).some((m) => JSON.stringify(m.content).includes(`"photo_id":"${ctx.photoId}"`));
  const userContent: StoredBlock[] = [{ type: "text", text: ctx.text }];
  if (ctx.photoId && !shown) userContent.push({ type: "garden_photo", photo_id: ctx.photoId });
  userContent.push({ type: "text", text: args.message });
  await append("user", userContent, { text: args.message });

  let mutated = false;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream({
      model: CLAUDE_MODEL,
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
      await append("assistant", message.content, { text: text || "Sorry — I can't help with that one." });
      if (!text) emit({ t: "text", v: "Sorry — I can't help with that one." });
      break;
    }
    if (message.stop_reason === "max_tokens" && toolUses.length) {
      // A cut-off tool call can't be run; keep the transcript valid by not storing the partial turn.
      emit({ t: "error", message: "The reply got too long. Try asking for something smaller." });
      break;
    }

    const results: StoredToolResult[] = [];
    const summaries: string[] = [];
    for (const tu of toolUses) {
      if (tu.type !== "tool_use") continue;
      const out = await runTool(tu.name, tu.input, deps);
      if (MUTATING.has(tu.name) && !out.isError) mutated = true;
      summaries.push(out.summary);
      emit({ t: "tool", summary: out.summary });
      const content: StoredToolResult["content"] = [{ type: "text", text: out.text }];
      if (out.photoId) content.push({ type: "garden_photo", photo_id: out.photoId });
      results.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: out.isError });
    }

    await append("assistant", message.content, text || summaries.length ? { text, tools: summaries } : null);
    if (!results.length) break;
    await append("user", results, null);
  }
  emit({ t: "done", mutated });
}

/** Friendlier messages for the errors people actually hit with a browser-held key. */
export function describeClaudeError(err: unknown): string | null {
  if (err instanceof Anthropic.AuthenticationError) return "That API key was rejected. Check it in Settings.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (err instanceof Anthropic.RateLimitError) return "Too many requests right now — wait a moment and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check your connection.";
  if (err instanceof Anthropic.APIError) return `Claude returned an error (${err.status ?? "?"}). Please try again.`;
  return null;
}
