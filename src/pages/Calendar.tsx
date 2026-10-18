import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { calendarEntries, monthGrid, type CalendarEntry } from "@/lib/calendar";
import { formatDate } from "@/lib/dates";
import { useGarden } from "@/lib/GardenContext";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PER_DAY = 4;

function Entry({ e, full }: { e: CalendarEntry; full?: boolean }) {
  const body = (
    <>
      <span className="cal-icon">{e.icon}</span>
      <span className="cal-text">{full ? e.detail : e.text}</span>
    </>
  );
  return e.href ? (
    <Link to={e.href} className={`cal-entry ${e.kind}`} title={e.detail}>{body}</Link>
  ) : (
    <span className={`cal-entry ${e.kind}`} title={e.detail}>{body}</span>
  );
}

export function CalendarPage() {
  const { data, today } = useGarden();
  const [params, setParams] = useSearchParams();
  const month = params.get("m") ?? today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const [selected, setSelected] = useState<string>(today);

  const days = monthGrid(y, m - 1);
  const entries = calendarEntries(data, today, days[0], days.at(-1)!);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const go = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setParams({ m: d.toISOString().slice(0, 7) });
  };
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const selectedEntries = byDay.get(selected) ?? [];

  return (
    <>
      <div className="page-head cal-head">
        <div className="row">
          <button className="small" onClick={() => { setParams({}); setSelected(today); }}>Today</button>
          <button className="ghost" onClick={() => go(-1)} aria-label="Previous month">‹</button>
          <button className="ghost" onClick={() => go(1)} aria-label="Next month">›</button>
          <h1 style={{ margin: 0 }}>{title}</h1>
        </div>
        <div className="row small muted cal-legend">
          <span className="cal-entry logged">done</span>
          <span className="cal-entry scheduled">planned</span>
          <span className="cal-entry overdue">overdue</span>
          <span className="cal-entry task">reminder</span>
        </div>
      </div>

      <div className="calendar">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const other = d.slice(0, 7) !== month;
          return (
            <div
              key={d}
              className={`cal-day ${other ? "other" : ""} ${d === selected ? "selected" : ""}`}
              onClick={() => setSelected(d)}
            >
              <div className={`cal-date ${d === today ? "today" : ""}`}>{Number(d.slice(8))}</div>
              {list.slice(0, PER_DAY).map((e, i) => (
                <Entry key={i} e={e} />
              ))}
              {list.length > PER_DAY && <span className="cal-more">{list.length - PER_DAY} more</span>}
            </div>
          );
        })}
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>{formatDate(selected, { weekday: true, year: true })}</h3>
        {selectedEntries.length ? (
          <div className="stack" style={{ gap: 6 }}>
            {selectedEntries.map((e, i) => (
              <Entry key={i} e={e} full />
            ))}
          </div>
        ) : (
          <p className="empty">Nothing logged or planned.</p>
        )}
      </section>
    </>
  );
}
