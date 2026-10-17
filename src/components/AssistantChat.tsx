import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useLocation } from "react-router";
import { useGarden } from "@/lib/GardenContext";
import { assistantReady, getAssistantSettings } from "@/lib/settings";

type Msg = { role: "user" | "assistant"; text?: string; tools?: string[] };

// The Claude SDK is only downloaded once someone sends a message.
const loadAssistant = () => import("@/lib/assistant/index");

function pageLabel(pathname: string): string {
  if (pathname.startsWith("/plantings/")) return "this planting";
  if (pathname.startsWith("/trays/")) return "this planter";
  if (pathname.startsWith("/plants/")) return "this plant";
  if (pathname.startsWith("/plants")) return "the seed library";
  return "your garden";
}

function suggestionsFor(pathname: string): string[] {
  if (pathname.startsWith("/plantings/"))
    return ["How does it look in the latest photo?", "What should we do this week?", "We just watered it", "When can we harvest?"];
  if (pathname.startsWith("/trays/")) return ["We misted the whole tray", "Which cells are behind schedule?", "What should go in the empty cells?"];
  if (pathname.startsWith("/plants/")) return ["Summarize the packet instructions", "Any tips for growing this indoors?"];
  return ["What needs doing today?", "Which seedlings are late to sprout?", "Plan the egg carton planting with us"];
}

export default function AssistantChat({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const { db, latest, act, gardener, today } = useGarden();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const settings = getAssistantSettings();
  const ready = assistantReady(settings);
  const provider = settings.provider;

  useEffect(() => {
    if (loaded) return;
    loadAssistant()
      .then((a) => a.threadForDisplay(db, provider))
      .then(setMessages)
      .finally(() => setLoaded(true));
  }, [loaded, db, provider]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      const key = assistantReady();
      if (!message || busy || !key) return;
      setInput("");
      setBusy(true);
      setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "", tools: [] }]);
      const update = (fn: (last: Msg) => Msg) => setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);
      const a = await loadAssistant();
      try {
        await a.runAssistantTurn({ db, latest, act, gardener, today }, { pathname, message }, (e) => {
          if (e.t === "text") update((l) => ({ ...l, text: (l.text ?? "") + e.v }));
          else if (e.t === "tool") update((l) => ({ ...l, text: l.text ? `${l.text}\n\n` : l.text, tools: [...(l.tools ?? []), e.summary] }));
          else if (e.t === "error") update((l) => ({ ...l, text: `${l.text ? `${l.text}\n\n` : ""}⚠️ ${e.message}` }));
        });
      } catch (err) {
        console.error(err);
        update((l) => ({ ...l, text: `${l.text ? `${l.text}\n\n` : ""}⚠️ ${a.describeError(err)}` }));
      } finally {
        setBusy(false);
      }
    },
    [busy, db, latest, act, gardener, today, pathname],
  );

  const reset = async () => {
    await (await loadAssistant()).startNewThread(db, provider);
    setMessages([]);
  };

  return (
    <section className="assistant-panel" aria-label="Garden assistant">
      <div className="assistant-head">
        <div style={{ flex: 1 }}>
          <strong>Garden assistant</strong>
          <div className="ctx">
            {provider === "ollama" ? settings.ollamaModel : "Claude"} · looking at {pageLabel(pathname)}
          </div>
        </div>
        <button className="ghost small" onClick={reset} disabled={busy} title="Start a new conversation">New chat</button>
        <button className="ghost small" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="assistant-body" ref={bodyRef}>
        {!ready && (
          <p className="small">
            To use the assistant, add your Anthropic API key or connect a local Ollama model in{" "}
            <Link to="/settings" onClick={onClose}>Settings</Link>.
          </p>
        )}
        {ready && loaded && messages.length === 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            I can see what page you&rsquo;re on, the packet info, schedule, notes and photos. I can also log care, save notes and set reminders for you.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">{m.text}</div>
          ) : (
            <div key={i} className="stack" style={{ gap: 6, alignItems: "flex-start" }}>
              {m.tools?.map((t, j) => (
                <span key={j} className="tool-note">✓ {t}</span>
              ))}
              {m.text ? (
                <div className="msg assistant">
                  <Markdown>{m.text}</Markdown>
                </div>
              ) : (
                busy && i === messages.length - 1 && <span className="typing">Thinking…</span>
              )}
            </div>
          ),
        )}
      </div>
      {ready && (
        <div className="stack" style={{ gap: 0 }}>
          {!busy && (
            <div className="suggestions" style={{ padding: "0 10px 8px" }}>
              {suggestionsFor(pathname).map((s) => (
                <button key={s} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}
          <form
            className="assistant-foot"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${pageLabel(pathname)}…`}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      )}
    </section>
  );
}
