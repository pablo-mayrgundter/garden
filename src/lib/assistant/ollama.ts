// Ollama backend: talks to a local Ollama server (http://localhost:11434 by
// default) straight from the browser, using its native /api/chat endpoint with
// tool calling. Ollama must allow this site's origin via OLLAMA_ORIGINS.

import { appendChat, currentThreadId, loadChat, type GardenDB } from "../store.ts";
import type { ChatRecord, GardenData } from "../types.ts";
import { buildContext, MAX_TOOL_ROUNDS, MUTATING, photoData, runTool, SYSTEM_PROMPT, TOOL_SPECS, type AssistantDeps } from "./core.ts";
import type { StreamEvent } from "./index.ts";

/** Ollama's default context window is small; the garden context needs room. */
const NUM_CTX = 16384;
/** Local models get less history than Claude: the last N stored messages. */
const HISTORY = 24;

const TOOLS = TOOL_SPECS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: { type: "object", properties: t.properties, required: Object.keys(t.properties) } },
}));

type ToolCall = { function: { name: string; arguments: Record<string, unknown> | string } };
/** A chat message as stored: Ollama's shape, with photos kept by id and the user's own words kept apart from the context block. */
type StoredMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  question?: string;
  photo_ids?: string[];
  tool_calls?: ToolCall[];
  tool_name?: string;
};
type WireMessage = Omit<StoredMessage, "question" | "photo_ids"> & { images?: string[] };

export class OllamaError extends Error {}

const trimUrl = (url: string) => url.replace(/\/+$/, "");

async function post(url: string, body: unknown): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${trimUrl(url)}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new OllamaError(
      `Couldn't reach Ollama at ${url}. Is it running, and does OLLAMA_ORIGINS include ${location.origin}? (See Settings for setup.)`,
    );
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new OllamaError(err.error || `Ollama returned HTTP ${res.status}`);
  }
  return res;
}

/** Lists the models the server has, to check the connection from Settings. */
export async function listOllamaModels(url: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${trimUrl(url)}/api/tags`);
  } catch {
    throw new OllamaError(`Couldn't reach Ollama at ${url}. Is it running, and does OLLAMA_ORIGINS include ${location.origin}?`);
  }
  if (!res.ok) throw new OllamaError(`Ollama returned HTTP ${res.status}`);
  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name);
}

async function toWire(db: GardenDB, data: GardenData, rows: ChatRecord[]): Promise<WireMessage[]> {
  let recent = rows.slice(-HISTORY);
  // Start the window at a user's own message so tool calls keep their results.
  const firstUser = recent.findIndex((r) => r.role === "user" && (r.content[0] as StoredMessage)?.question !== undefined);
  if (firstUser > 0) recent = recent.slice(firstUser);
  const lastUser = recent.map((r) => (r.content[0] as StoredMessage).question !== undefined).lastIndexOf(true);
  return Promise.all(
    recent.map(async (r, i) => {
      const { question, photo_ids, ...msg } = r.content[0] as StoredMessage;
      // Older turns carry only what the user typed; the current turn carries the full page context.
      const wire: WireMessage = question !== undefined && i !== lastUser ? { ...msg, content: question } : msg;
      if (photo_ids?.length && i >= lastUser) {
        const images = (await Promise.all(photo_ids.map((id) => photoData(db, data.photos.find((p) => p.id === id))))).filter((x) => x);
        if (images.length) wire.images = images.map((img) => img!.base64);
      }
      return wire;
    }),
  );
}

export async function runOllamaTurn(
  deps: AssistantDeps & { url: string; model: string },
  args: { pathname: string; message: string },
  emit: (e: StreamEvent) => void,
): Promise<void> {
  const { db } = deps;
  const threadId = await currentThreadId(db, "ollama");
  const append = (msg: StoredMessage, display: ChatRecord["display"]) =>
    appendChat(db, { threadId, provider: "ollama", role: msg.role, content: [msg], display, createdAt: new Date().toISOString() });

  const ctx = buildContext(deps.latest(), deps.gardener, args.pathname, deps.today);
  const shown = (await loadChat(db, threadId)).some((m) => ((m.content[0] as StoredMessage).photo_ids ?? []).includes(ctx.photoId ?? ""));
  await append(
    { role: "user", content: `${ctx.text}\n\n${args.message}`, question: args.message, photo_ids: ctx.photoId && !shown ? [ctx.photoId] : undefined },
    { text: args.message },
  );

  let mutated = false;
  let useTools = true;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...(await toWire(db, deps.latest(), await loadChat(db, threadId)))];
    let res: Response;
    try {
      res = await post(deps.url, { model: deps.model, messages, tools: useTools ? TOOLS : undefined, stream: true, options: { num_ctx: NUM_CTX } });
    } catch (err) {
      if (useTools && err instanceof OllamaError && /does not support tools/i.test(err.message)) {
        useTools = false;
        emit({ t: "tool", summary: `${deps.model} can't use tools, so it can answer but not record anything` });
        round--;
        continue;
      }
      throw err;
    }

    // Ollama streams one JSON object per line.
    let content = "";
    const toolCalls: ToolCall[] = [];
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string; tool_calls?: ToolCall[] }; error?: string };
        if (chunk.error) throw new OllamaError(chunk.error);
        if (chunk.message?.content) {
          content += chunk.message.content;
          emit({ t: "text", v: chunk.message.content });
        }
        if (chunk.message?.tool_calls) toolCalls.push(...chunk.message.tool_calls);
      }
    }

    const summaries: string[] = [];
    const results: StoredMessage[] = [];
    const photos: string[] = [];
    for (const call of toolCalls) {
      let input = call.function.arguments;
      if (typeof input === "string") {
        try {
          input = JSON.parse(input) as Record<string, unknown>;
        } catch {
          input = {};
        }
      }
      const out = await runTool(call.function.name, input, deps);
      if (MUTATING.has(call.function.name) && !out.isError) mutated = true;
      summaries.push(out.summary);
      emit({ t: "tool", summary: out.summary });
      results.push({ role: "tool", content: out.isError ? `Error: ${out.text}` : out.text, tool_name: call.function.name });
      if (out.photoId) photos.push(out.photoId);
    }

    await append({ role: "assistant", content, tool_calls: toolCalls.length ? toolCalls : undefined }, content || summaries.length ? { text: content, tools: summaries } : null);
    if (!toolCalls.length) break;
    for (const r of results) await append(r, null);
    // Ollama tool results are text only, so photos the model asked to see come as a follow-up message.
    if (photos.length) await append({ role: "user", content: "Here are the photos you asked to see.", photo_ids: photos }, null);
  }
  emit({ t: "done", mutated });
}
