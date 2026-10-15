import { lazy, Suspense, useState } from "react";

// The chat (markdown rendering, the Claude SDK) loads only when someone opens it.
const AssistantChat = lazy(() => import("./AssistantChat"));

export function AssistantPanel() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open garden assistant">
        🌿 Ask<span className="long"> the garden assistant</span>
      </button>
    );
  }
  return (
    <Suspense fallback={<section className="assistant-panel"><p className="typing" style={{ padding: 14 }}>Opening…</p></section>}>
      <AssistantChat onClose={() => setOpen(false)} />
    </Suspense>
  );
}
