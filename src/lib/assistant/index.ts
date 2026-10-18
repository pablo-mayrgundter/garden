// The in-app garden assistant: one conversation per backend (Claude or a local
// Ollama model), stored append-only in IndexedDB. Loaded only when the chat opens.

import { getAssistantSettings } from "../settings.ts";
import { currentThreadId, loadChat, newThread, type GardenDB, type Provider } from "../store.ts";
import { describeClaudeError, runClaudeTurn } from "./claude.ts";
import type { AssistantDeps } from "./core.ts";
import { OllamaError, runOllamaTurn } from "./ollama.ts";

export type StreamEvent = { t: "text"; v: string } | { t: "tool"; summary: string } | { t: "done"; mutated: boolean } | { t: "error"; message: string };
export type DisplayMessage = { role: "user" | "assistant"; text?: string; tools?: string[] };

export async function threadForDisplay(db: GardenDB, provider: Provider): Promise<DisplayMessage[]> {
  const rows = await loadChat(db, await currentThreadId(db, provider));
  return rows.filter((m) => m.display && m.role !== "tool").map((m) => ({ role: m.role as DisplayMessage["role"], ...m.display! }));
}

export async function startNewThread(db: GardenDB, provider: Provider): Promise<void> {
  await newThread(db, provider);
}

/** Runs one user message through whichever backend Settings selects. */
export async function runAssistantTurn(deps: AssistantDeps, args: { pathname: string; message: string }, emit: (e: StreamEvent) => void): Promise<void> {
  const s = getAssistantSettings();
  if (s.provider === "ollama") return runOllamaTurn({ ...deps, url: s.ollamaUrl, model: s.ollamaModel }, args, emit);
  if (!s.apiKey) throw new Error("Add your Anthropic API key in Settings first.");
  return runClaudeTurn({ ...deps, apiKey: s.apiKey }, args, emit);
}

export function describeError(err: unknown): string {
  if (err instanceof OllamaError) return err.message;
  return describeClaudeError(err) ?? ((err as Error)?.message || "The assistant hit an error. Please try again.");
}
