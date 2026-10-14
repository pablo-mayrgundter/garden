import Link from "next/link";
import { logCare, markSown, removeEvent, removeNote, toggleTask } from "@/app/actions";
import { formatDate, relativeDay } from "@/lib/dates";
import { cellRange, type CareEvent, type Note, type Planting, type Task, type Tray } from "@/lib/garden";
import type { CareItem, CareStatus } from "@/lib/schedule";

export function Photo({ id, alt, className }: { id: number; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/photos/${id}`} alt={alt} className={className} loading="lazy" />;
}

export function StatusChip({ status }: { status: string }) {
  return <span className={`chip ${status}`}>{status}</span>;
}

const CARE_LABEL: Record<CareStatus, string> = { overdue: "overdue", late: "check", due: "due", upcoming: "upcoming", done: "done" };

export function CareChip({ item, today }: { item: CareItem; today: string }) {
  if (item.status === "done") return <span className="chip done">✓ {item.doneOn ? formatDate(item.doneOn) : "done"}</span>;
  const when =
    item.status === "upcoming"
      ? relativeDay(item.start, today)
      : item.status === "due" && item.start !== item.end
        ? `until ${formatDate(item.end)}`
        : item.status === "overdue"
          ? `since ${formatDate(item.end)}`
          : CARE_LABEL[item.status];
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
  plantingIds: number[];
  today: string;
  title?: string;
  subtitle?: React.ReactNode;
  thumb?: number | null;
  href?: string;
}) {
  const heading = title ?? item.title;
  return (
    <li className={`care-item ${item.status === "done" ? "is-done" : ""}`}>
      {thumb !== undefined && (thumb ? <Photo id={thumb} alt="" className="thumb" /> : <div className="thumb" />)}
      <div className="what">
        <div className="title">{href ? <Link href={href}>{heading}</Link> : heading}</div>
        <div className="small muted">
          {subtitle ?? item.detail}
          {item.status !== "done" && item.start !== item.end && (
            <> · window {formatDate(item.start)}–{formatDate(item.end)}</>
          )}
        </div>
      </div>
      <CareChip item={item} today={today} />
      {item.status !== "done" && item.status !== "upcoming" && (
        item.event ? (
          <form action={logCare}>
            <input type="hidden" name="plantingIds" value={plantingIds.join(",")} />
            <input type="hidden" name="type" value={item.event} />
            <button className="small" title={`Log “${EVENT_LABEL[item.event]?.label}” for today`}>
              {EVENT_LABEL[item.event]?.icon} Done
            </button>
          </form>
        ) : (
          <form action={markSown}>
            <input type="hidden" name="plantingId" value={plantingIds[0]} />
            <button className="small">🌰 Sown today</button>
          </form>
        )
      )}
    </li>
  );
}

export function TrayGrid({
  tray,
  plantings,
  covers,
  urgent,
  mini,
}: {
  tray: Tray;
  plantings: Planting[];
  covers: Map<number, number>;
  urgent?: Map<number, CareStatus>;
  mini?: boolean;
}) {
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
            <Link key={cell} href={`/trays/${tray.id}?cell=${cell}`} className="cell empty" title={`Plant cell ${cell}`}>
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
      const cover = covers.get(p.id);
      const flag = urgent?.get(p.id);
      cells.push(
        <Link
          key={cell}
          href={`/plantings/${p.id}`}
          className={`cell ${span > 1 ? "span-2" : ""} ${p.status === "planned" ? "planned-cell" : ""}`}
          style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
          title={`${p.name} — ${cellRange(p.cells)}`}
        >
          {cover && <Photo id={cover} alt={p.name} />}
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

export function NoteList({ notes, plantingNames }: { notes: Note[]; plantingNames?: Map<number, { name: string }> }) {
  if (!notes.length) return <p className="empty">No notes yet.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {notes.map((n) => (
        <div key={n.id} className="note">
          <p>{n.body}</p>
          <div className="meta">
            <span>{formatDate(n.createdAt.slice(0, 10))}</span>
            {n.userName && <span>· {n.userName}</span>}
            {n.byAssistant && <span className="chip ai">via assistant</span>}
            {plantingNames && n.plantingId && plantingNames.get(n.plantingId) && (
              <Link href={`/plantings/${n.plantingId}`}>· {plantingNames.get(n.plantingId)!.name}</Link>
            )}
            <span className="spacer" />
            <form action={removeNote}>
              <input type="hidden" name="noteId" value={n.id} />
              <button className="ghost tiny" title="Delete note">✕</button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

export function EventLog({ events }: { events: CareEvent[] }) {
  if (!events.length) return <p className="empty">Nothing logged yet.</p>;
  return (
    <ul className="timeline">
      {events.map((e) => (
        <li key={e.id}>
          <span className="date">{formatDate(e.date)}</span>
          <span style={{ flex: 1 }}>
            {EVENT_LABEL[e.type]?.icon} {EVENT_LABEL[e.type]?.label ?? e.type}
            {e.note && <span className="muted"> — {e.note}</span>}
            {e.userName && <span className="muted small"> · {e.userName}</span>}
            {e.byAssistant && <span className="chip ai" style={{ marginLeft: 6 }}>via assistant</span>}
          </span>
          <form action={removeEvent}>
            <input type="hidden" name="eventId" value={e.id} />
            <button className="ghost tiny" title="Remove">✕</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function TaskRow({ task, today, plantingName }: { task: Task; today: string; plantingName?: string }) {
  const status: CareStatus = task.doneAt ? "done" : task.dueDate < today ? "overdue" : task.dueDate === today ? "due" : "upcoming";
  return (
    <li className={`care-item ${task.doneAt ? "is-done" : ""}`}>
      <div className="what">
        <div className="title">{task.title}</div>
        <div className="small muted">
          {plantingName && task.plantingId ? <Link href={`/plantings/${task.plantingId}`}>{plantingName}</Link> : "Reminder"}
          {task.byAssistant && <span className="chip ai" style={{ marginLeft: 6 }}>via assistant</span>}
        </div>
      </div>
      <span className={`chip ${status}`}>{status === "done" ? "✓ done" : relativeDay(task.dueDate, today)}</span>
      <form action={toggleTask}>
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="done" value={task.doneAt ? "0" : "1"} />
        <button className="small">{task.doneAt ? "Undo" : "✓ Done"}</button>
      </form>
    </li>
  );
}
