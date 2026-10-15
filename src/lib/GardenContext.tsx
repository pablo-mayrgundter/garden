import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ActionCtx } from "./actions.ts";
import { todayIn } from "./dates.ts";
import { getPhotoBlob, loadAll, openGardenDb, type GardenDB } from "./store.ts";
import type { GardenData, Photo } from "./types.ts";

const GARDENER_KEY = "garden.gardener";

type GardenState = {
  db: GardenDB;
  data: GardenData;
  today: string;
  /** Who's using this browser; signs care entries, notes and photos. */
  gardener: string | null;
  setGardener: (name: string | null) => void;
  /** Runs a change, then reloads the garden so every page sees it. */
  act: <T>(fn: (ctx: ActionCtx) => Promise<T>) => Promise<T>;
  /** The latest data, even from inside a long-running async flow (e.g. an assistant turn). */
  latest: () => GardenData;
  reload: () => Promise<void>;
};

const Ctx = createContext<GardenState | null>(null);

function readGardener(): string | null {
  try {
    return localStorage.getItem(GARDENER_KEY);
  } catch {
    return null;
  }
}

export function GardenProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<GardenDB | null>(null);
  const [data, setData] = useState<GardenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gardener, setGardenerState] = useState<string | null>(readGardener);
  const [, setTick] = useState(0);

  useEffect(() => {
    openGardenDb()
      .then(async (d) => {
        setDb(d);
        setData(await loadAll(d));
      })
      .catch((e) => setError(String(e?.message ?? e)));
    // Re-render every few minutes so "today" rolls over at midnight.
    const t = setInterval(() => setTick((n) => n + 1), 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  const reload = useCallback(async () => {
    if (db) setData(await loadAll(db));
  }, [db]);

  const setGardener = useCallback((name: string | null) => {
    try {
      if (name) localStorage.setItem(GARDENER_KEY, name);
      else localStorage.removeItem(GARDENER_KEY);
    } catch {
      // Private mode: keep it for this visit only.
    }
    setGardenerState(name);
  }, []);

  const today = data ? todayIn(data.garden.timezone) : "";
  const dataRef = useRef(data);
  dataRef.current = data;
  const gardenerRef = useRef(gardener);
  gardenerRef.current = gardener;
  const latest = useCallback(() => dataRef.current!, []);

  const act = useCallback(
    async <T,>(fn: (ctx: ActionCtx) => Promise<T>): Promise<T> => {
      const current = dataRef.current;
      if (!db || !current) throw new Error("Garden not loaded");
      const result = await fn({ db, data: current, by: gardenerRef.current, today: todayIn(current.garden.timezone) });
      const fresh = await loadAll(db);
      dataRef.current = fresh;
      setData(fresh);
      return result;
    },
    [db],
  );

  const value = useMemo(
    () => (db && data ? { db, data, today, gardener, setGardener, act, latest, reload } : null),
    [db, data, today, gardener, setGardener, act, latest, reload],
  );

  if (error)
    return (
      <main className="auth-wrap">
        <div className="card auth-card">
          <h1>Can&rsquo;t open the garden</h1>
          <p className="muted">This browser blocked local storage ({error}). Try a regular (not private) window.</p>
        </div>
      </main>
    );
  if (!value) return <p className="empty" style={{ padding: 24 }}>Opening the garden…</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGarden(): GardenState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGarden outside GardenProvider");
  return v;
}

// ---------- Photo URLs ----------

const objectUrls = new Map<string, string>();

export function staticUrl(src: string): string {
  return `${import.meta.env.BASE_URL}${src}`;
}

/** A displayable URL for a photo: the bundled file, or an object URL for an uploaded blob. */
export function usePhotoUrl(photo: Photo | undefined): string | null {
  const { db } = useGarden();
  const [url, setUrl] = useState<string | null>(() =>
    photo ? (photo.src ? staticUrl(photo.src) : (objectUrls.get(photo.id) ?? null)) : null,
  );
  useEffect(() => {
    if (!photo) return setUrl(null);
    if (photo.src) return setUrl(staticUrl(photo.src));
    const cached = objectUrls.get(photo.id);
    if (cached) return setUrl(cached);
    let live = true;
    getPhotoBlob(db, photo.id).then((blob) => {
      if (!blob || !live) return;
      const u = URL.createObjectURL(blob);
      objectUrls.set(photo.id, u);
      setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [db, photo]);
  return url;
}
