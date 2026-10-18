import { useState } from "react";
import { useNavigate } from "react-router";
import { applyTrayLayout, deleteTray, trayMarkdown, type LayoutResult } from "@/lib/actions";
import { useGarden } from "@/lib/GardenContext";
import { NEW_TRAY_TEMPLATE, parseTrayMarkdown } from "@/lib/trayMarkdown";

function describe(r: LayoutResult): string {
  const parts = [
    r.added && `${r.added} new planting${r.added === 1 ? "" : "s"} (planned)`,
    r.moved && `${r.moved} moved`,
    r.removed && `${r.removed} removed`,
    r.detached && `${r.detached} taken out but kept with their history`,
    r.newPlants.length && `added ${r.newPlants.join(", ")} to the seed library`,
  ].filter(Boolean);
  return parts.length ? `Saved: ${parts.join(", ")}.` : "Saved — no changes to plantings.";
}

/** Edit a planter as a markdown table: rows are letters, columns are numbers, cells name plants. */
export function TrayLayoutEditor({ trayId }: { trayId?: string }) {
  const { data, act, latest } = useGarden();
  const navigate = useNavigate();
  const [text, setText] = useState(() => (trayId ? trayMarkdown(data, trayId) : NEW_TRAY_TEMPLATE));
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>();
  const [busy, setBusy] = useState(false);

  let preview: string | null = null;
  try {
    const t = parseTrayMarkdown(text);
    preview = `${t.name}: ${t.rows.length} rows × ${t.cols} columns, ${t.cells.size} cells planted`;
  } catch (e) {
    preview = (e as Error).message;
  }

  const save = async () => {
    setBusy(true);
    try {
      const r = await act((ctx) => applyTrayLayout(ctx, trayId ?? null, text));
      setMsg({ ok: describe(r) });
      if (!trayId) navigate(`/trays/${r.trayId}`);
      else setText(trayMarkdown(latest(), trayId));
    } catch (e) {
      setMsg({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form">
      <p className="small muted" style={{ margin: 0 }}>
        One row per letter, one column per number; write a plant&rsquo;s name in each cell. The same name in neighbouring cells of a row is
        one planting across them. New names are added to the seed library.
      </p>
      <textarea className="code" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="small muted">{preview}</div>
      <div className="row between">
        <div className="row">
          <button className="primary small" disabled={busy} onClick={save}>{trayId ? "Save layout" : "Create planter"}</button>
          {trayId && (
            <button className="small" disabled={busy} onClick={() => setText(trayMarkdown(data, trayId))}>
              Reset
            </button>
          )}
        </div>
        {trayId && (
          <button
            className="small danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Delete this planter? Plantings with history are kept, outside any planter.")) return;
              await act((ctx) => deleteTray(ctx, trayId));
              navigate("/trays");
            }}
          >
            Delete planter
          </button>
        )}
      </div>
      {msg?.ok && <p className="ok">{msg.ok}</p>}
      {msg?.error && <p className="error">{msg.error}</p>}
    </div>
  );
}
