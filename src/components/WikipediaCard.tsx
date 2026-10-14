"use client";

import { useEffect, useState } from "react";

type Summary = { extract: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page: string } } };

/** Fetches the page summary straight from Wikipedia's public REST API in the browser. */
export function WikipediaCard({ title }: { title: string }) {
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Summary) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [title]);

  return (
    <div className="stack" style={{ gap: 8 }}>
      {summary ? (
        <div className="wiki">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {summary.thumbnail && <img src={summary.thumbnail.source} alt="" />}
          <p className="small" style={{ margin: 0 }}>{summary.extract.length > 420 ? `${summary.extract.slice(0, 420)}…` : summary.extract}</p>
        </div>
      ) : (
        !failed && <p className="small muted">Loading from Wikipedia…</p>
      )}
      <a href={url} target="_blank" rel="noreferrer" className="small">
        Read more on Wikipedia ↗
      </a>
    </div>
  );
}
