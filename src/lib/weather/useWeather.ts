// React hooks for the forecast and frost dates. Results are cached in this
// browser (localStorage): the forecast for an hour, frost dates for good (they
// only change with the location). They're derived data, not part of the garden.

import { useEffect, useState } from "react";
import { useGarden } from "../GardenContext.tsx";
import { fetchFrostDates, type FrostDates } from "./climate.ts";
import { fetchForecast, roundForWeather, type Forecast } from "./forecast.ts";

export type Loaded<T> =
  | { status: "no-location" }
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; error: string };

const HOUR = 60 * 60 * 1000;
const inflight = new Map<string, Promise<unknown>>();

function readCache<T>(key: string, maxAge: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw);
    return Date.now() - at < maxAge ? (value as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Storage full or blocked: it just won't be cached.
  }
}

function useCached<T>(name: string, maxAge: number, load: (lat: number, lon: number) => Promise<T>): Loaded<T> & { retry: () => void } {
  const { data } = useGarden();
  const lat = data.garden.site?.lat;
  const lon = data.garden.site?.lon;
  const key = lat != null && lon != null ? `garden.${name}:${roundForWeather(lat)},${roundForWeather(lon)}` : null;
  const [state, setState] = useState<Loaded<T>>({ status: key ? "loading" : "no-location" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key || lat == null || lon == null) return setState({ status: "no-location" });
    const cached = readCache<T>(key, maxAge);
    if (cached) return setState({ status: "ready", value: cached });
    setState({ status: "loading" });
    let live = true;
    const job = (inflight.get(key) as Promise<T> | undefined) ?? load(lat, lon);
    inflight.set(key, job);
    job
      .then((value) => {
        writeCache(key, value);
        if (live) setState({ status: "ready", value });
      })
      .catch((e) => live && setState({ status: "error", error: (e as Error).message || "Couldn't reach the weather service." }))
      .finally(() => inflight.delete(key));
    return () => {
      live = false;
    };
  }, [key, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

export const useForecast = () => useCached<Forecast>("forecast", HOUR, (lat, lon) => fetchForecast(lat, lon));
export const useFrostDates = () => useCached<FrostDates>("frost.v1", Infinity, (lat, lon) => fetchFrostDates(lat, lon));
