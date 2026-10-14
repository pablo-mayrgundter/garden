"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";

type Msg = { role: "user" | "assistant"; text?: string; tools?: string[] };

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
  if (pathname.startsWith("/trays/"))
    return ["We misted the whole tray", "Which cells are behind schedule?", "What should go in the empty cells?"];
  if (pathname.startsWith("/plants/")) return ["Summarize the packet instructions", "Any tips for growing this indoors?"];
  return ["What needs doing today?", "Which seedlings are late to sprout?", "Plan the egg carton planting with us"];
}

export function AssistantPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/assistant")
      .then((r) => r.json())
      .then((d: { messages?: Msg[] }) => setMessages(d.messages ?? []))
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, open]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setInput("");
      setBusy(true);
      setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "", tools: [] }]);
      const update = (fn: (last: Msg) => Msg) => setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])]);

      let mutated = false;
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, pathname }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.getReader();
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
            const e = JSON.parse(line);
            if (e.t === "text") update((l) => ({ ...l, text: (l.text ?? "") + e.v }));
            else if (e.t === "tool")
              update((l) => ({ ...l, text: l.text ? `${l.text}\n\n` : l.text, tools: [...(l.tools ?? []), e.summary] }));
            else if (e.t === "error") update((l) => ({ ...l, text: `${l.text ? `${l.text}\n\n` : ""}⚠️ ${e.message}` }));
            else if (e.t === "done") mutated = e.mutated;
          }
        }
      } catch {
        update((l) => ({ ...l, text: "⚠️ Couldn't reach the assistant. Check your connection and try again." }));
      } finally {
        setBusy(false);
        if (mutated) router.refresh();
      }
    },
    [busy, pathname, router],
  );

  const reset = async () => {
    await fetch("/api/assistant", { method: "DELETE" });
    setMessages([]);
  };

  if (!open) {
    return (
      <button className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open garden assistant">
        🌿 Ask<span className="long"> the garden assistant</span>
      </button>
    );
  }

  return (
    <section className="assistant-panel" aria-label="Garden assistant">
      <div className="assistant-head">
        <div style={{ flex: 1 }}>
          <strong>Garden assistant</strong>
          <div className="ctx">Looking at {pageLabel(pathname)}</div>
        </div>
        <button className="ghost small" onClick={reset} disabled={busy} title="Start a new conversation">New chat</button>
        <button className="ghost small" onClick={() => setOpen(false)} aria-label="Close">✕</button>
      </div>
      <div className="assistant-body" ref={bodyRef}>
        {loaded && messages.length === 0 && (
          <div className="stack" style={{ gap: 10 }}>
            <p className="muted small" style={{ margin: 0 }}>
              I can see what page you&rsquo;re on, the packet info, schedule, notes and photos. I can also log care, save notes and set reminders for you.
            </p>
          </div>
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
    </section>
  );
}
