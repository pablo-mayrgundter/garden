import { useState } from "react";
import { Link } from "react-router";
import { deleteEvent, deleteNote, logCare, markSown, setTaskDone } from "@/lib/actions";
import { formatDate, relativeDay } from "@/lib/dates";
import { cellRange, type PlantingView } from "@/lib/garden";
import { useGarden, usePhotoUrl } from "@/lib/GardenContext";
import { CONDITIONS } from "@/lib/model";
import type { CareItem, CareStatus } from "@/lib/schedule";
import { RowBed } from "./RowBed";
import type { CareEvent, Note, Task, Tray } from "@/lib/types";

export function Photo({ id, alt, className, link }: { id: string | null | undefined; alt: string; className?: string; link?: boolean }) {
  const { data } = useGarden();
  const url = usePhotoUrl(id ? data.photos.find((p) => p.id === id) : undefined);
  if (!url) return <div className={className} />;
  const img = <img src={url} alt={alt} className={className} loading="lazy" />;
  return link ? <a href={url} target="_blank" rel="noreferrer">{img}</a> : img;
}

/** A button that shows a pending state while its async action runs. */
export function ActionButton({
  onClick,
  children,
  className = "small",
  title,
  confirmText,
}: {
  onClick: () => Promise<unknown>;
  children: React.ReactNode;
  className?: string;
  title?: string;
  confirmText?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      title={title}
      disabled={busy}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`chip ${status}`}>{status}</span>;
}

export function CareChip({ item, today }: { item: CareItem; today: string }) {
  if (item.status === "done") return <span className="chip done">✓ {item.doneOn ? formatDate(item.doneOn) : "done"}</span>;
  const when =
    item.status === "upcoming"
      ? relativeDay(item.start, today)
      : item.status === "due" && item.start !== item.end
        ? `until ${formatDate(item.end)}`
        : item.status === "overdue"
          ? `since ${formatDate(item.end)}`
          : item.status === "late"
            ? "check"
            : "due";
  return <span className={`chip ${item.status}`}>{when}</span>;
}

export const EVENT_LABEL: Record<string, { label: string; icon: string }> = {
  watered: { label: "Watered", icon: "💧" },
  sprouted: { label: "Sprouted", icon: "🌱" },
  thinned: { label: "Thinned", icon: "✂️" },
  pinched: { label: "Pinched", icon: "🤏" },
  fertilized: { label: "Fed", icon: "🧪" },
  potted_up: { label: "Potted up", icon: "🪴" },
  transplanted: { label: "Transplanted", icon: "🏡" },
  harvested: { label: "Harvested", icon: "🧺" },
  observed: { label: "Checked", icon: "🔎" },
  other: { label: "Other", icon: "📝" },
};

/** One care item with a "Done" button that logs the matching event. */
export function CareRow({
  item,
  plantingIds,
  today,
  title,
  subtitle,
  thumb,
  href,
}: {
  item: CareItem;
  plantingIds: string[];
  today: string;
  title?: string;
  subtitle?: React.ReactNode;
  thumb?: string | null;
  href?: string;
}) {
  const { act } = useGarden();
  const heading = title ?? item.title;
  const open = item.status !== "done" && item.status !== "upcoming";
  return (
    <li className={`care-item ${item.status === "done" ? "is-done" : ""}`}>
      {thumb !== undefined && <Photo id={thumb} alt="" className="thumb" />}
      <div className="what">
        <div className="title">{href ? <Link to={href}>{heading}</Link> : heading}</div>
        <div className="small muted">
          {subtitle ?? item.detail}
          {item.status !== "done" && item.start !== item.end && (
            <> · window {formatDate(item.start)}–{formatDate(item.end)}</>
          )}
        </div>
      </div>
      <CareChip item={item} today={today} />
      {open &&
        (item.event ? (
          <ActionButton
            title={`Log “${EVENT_LABEL[item.event]?.label}” for today`}
            onClick={() => act((ctx) => logCare(ctx, { plantingIds, type: item.event! }))}
          >
            {EVENT_LABEL[item.event]?.icon} Done
          </ActionButton>
        ) : (
          <ActionButton onClick={() => act((ctx) => markSown(ctx, plantingIds[0]))}>🌰 Sown today</ActionButton>
        ))}
    </li>
  );
}

export function TrayGrid({
  tray,
  plantings,
  covers,
  urgent,
  mini,
  preview,
}: {
  tray: Tray;
  plantings: PlantingView[];
  covers: Map<string, string>;
  urgent?: Map<string, CareStatus>;
  mini?: boolean;
  /** A bed's drawing only, for lists. */
  preview?: boolean;
}) {
  if (tray.layout === "rows") return <RowBed tray={tray} plantings={plantings} mini={mini} preview={preview} />;
  const cells: React.ReactNode[] = [];
  const covered = new Set<string>();
  for (const row of tray.rows) {
    for (let col = 1; col <= tray.cols; col++) {
      const cell = `${col}${row}`;
      if (covered.has(cell)) continue;
      const p = plantings.find((x) => x.cells.includes(cell));
      if (!p) {
        cells.push(
          mini ? (
            <div key={cell} className="cell empty" />
          ) : (
            <Link key={cell} to={`/trays/${tray.id}?cell=${cell}`} className="cell empty" title={`Plant cell ${cell}`}>
              <span className="pos" style={{ background: "transparent", color: "inherit" }}>{cell}</span>
              <span className="plus">+</span>
            </Link>
          ),
        );
        continue;
      }
      // A planting may span several adjacent cells in the same row.
      const span = p.cells.filter((c) => c.endsWith(row) && parseInt(c, 10) >= col).length;
      p.cells.forEach((c) => covered.add(c));
      const flag = urgent?.get(p.id);
      cells.push(
        <Link
          key={cell}
          to={`/plantings/${p.id}`}
          className={`cell ${span > 1 ? "span-2" : ""} ${p.status === "planned" ? "planned-cell" : ""}`}
          style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
          title={`${p.name} — ${cellRange(p.cells)}`}
        >
          {covers.get(p.id) && <Photo id={covers.get(p.id)} alt={p.name} />}
          <span className="pos">{cellRange(p.cells)}</span>
          {flag && <span className={`dot ${flag}`} />}
          <span className="label">
            <strong>{p.name}</strong>
            {p.status}
          </span>
        </Link>,
      );
    }
  }
  return (
    <div className={`tray ${mini ? "mini" : ""}`} style={{ gridTemplateColumns: `repeat(${tray.cols}, minmax(0, 1fr))` }}>
      {cells}
    </div>
  );
}

export function NoteList({ notes, plantingNames }: { notes: Note[]; plantingNames?: Map<string, { name: string }> }) {
  const { act } = useGarden();
  if (!notes.length) return <p className="empty">No notes yet.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {notes.map((n) => (
        <div key={n.id} className="note">
          <p>{n.body}</p>
          <div className="meta">
            <span>{formatDate(n.createdAt.slice(0, 10))}</span>
            {n.by && <span>· {n.by}</span>}
            {n.byAssistant && <span className="chip ai">via assistant</span>}
            {plantingNames && n.plantingId && plantingNames.get(n.plantingId) && (
              <Link to={`/plantings/${n.plantingId}`}>· {plantingNames.get(n.plantingId)!.name}</Link>
            )}
            <span className="spacer" />
            <ActionButton className="ghost tiny" title="Delete note" onClick={() => act((ctx) => deleteNote(ctx, n.id))}>
              ✕
            </ActionButton>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EventLog({ events }: { events: CareEvent[] }) {
  const { act } = useGarden();
  if (!events.length) return <p className="empty">Nothing logged yet.</p>;
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="date">{formatDate(e.date)}</span>
          <span style={{ flex: 1 }}>
            {EVENT_LABEL[e.type]?.icon} {EVENT_LABEL[e.type]?.label ?? e.type}
            {e.condition && <strong> {CONDITIONS[e.condition]?.icon} {CONDITIONS[e.condition]?.label}</strong>}
            {e.plants?.length ? <span className="muted"> · plant{e.plants.length === 1 ? "" : "s"} {e.plants.join(", ")}</span> : null}
            {e.note && <span className="muted"> — {e.note}</span>}
            {e.by && <span className="muted small"> · {e.by}</span>}
            {e.byAssistant && <span className="chip ai" style={{ marginLeft: 6 }}>via assistant</span>}
          </span>
          <ActionButton className="ghost tiny" title="Remove" onClick={() => act((ctx) => deleteEvent(ctx, e.id))}>
            ✕
          </ActionButton>
        </li>
      ))}
    </ul>
  );
}

export function TaskRow({ task, today, plantingName }: { task: Task; today: string; plantingName?: string }) {
  const { act } = useGarden();
  const status: CareStatus = task.doneAt ? "done" : task.dueDate < today ? "overdue" : task.dueDate === today ? "due" : "upcoming";
  return (
    <li className={`care-item ${task.doneAt ? "is-done" : ""}`}>
      <div className="what">
        <div className="title">{task.title}</div>
        <div className="small muted">
          {plantingName && task.plantingId ? <Link to={`/plantings/${task.plantingId}`}>{plantingName}</Link> : "Reminder"}
          {task.byAssistant && <span className="chip ai" style={{ marginLeft: 6 }}>via assistant</span>}
        </div>
      </div>
      <span className={`chip ${status}`}>{status === "done" ? "✓ done" : relativeDay(task.dueDate, today)}</span>
      <ActionButton onClick={() => act((ctx) => setTaskDone(ctx, task.id, !task.doneAt))}>{task.doneAt ? "Undo" : "✓ Done"}</ActionButton>
    </li>
  );
}
