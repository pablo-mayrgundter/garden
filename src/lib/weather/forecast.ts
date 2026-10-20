// The week's forecast for the garden: NOAA (api.weather.gov) in the US, where
// it's the source of record, and Open-Meteo everywhere else (or if NOAA fails).
// Both are free, need no key, and answer browsers directly. Everything is
// normalized to one shape, in °F and mph; the UI converts for display.

/** The four kinds of sky the map can show. */
export type Sky = "sun" | "cloud" | "rain" | "snow";

export type DayForecast = {
  /** YYYY-MM-DD, local to the garden. */
  date: string;
  /** Daytime high and overnight low, °F. */
  high: number | null;
  low: number | null;
  /** A few words, like "Chance Showers And Thunderstorms". */
  summary: string;
  sky: Sky;
  /** The emoji for the day. */
  icon: string;
  /** Chance of rain or snow, 0–100. */
  precip: number | null;
  /** Highest wind, mph. */
  wind: number | null;
};

export type Forecast = { source: "NOAA" | "Open-Meteo"; fetchedAt: string; lat: number; lon: number; days: DayForecast[] };

/** Rounded to about a kilometer before it leaves the browser: plenty for a forecast. */
export const roundForWeather = (v: number) => Math.round(v * 100) / 100;

const ICON = { clear: "☀️", partly: "⛅", cloudy: "☁️", fog: "🌫️", drizzle: "🌦️", rain: "🌧️", storm: "⛈️", snow: "🌨️", sleet: "🌨️" } as const;
type Detail = keyof typeof ICON;
const SKY: Record<Detail, Sky> = { clear: "sun", partly: "sun", cloudy: "cloud", fog: "cloud", drizzle: "rain", rain: "rain", storm: "rain", snow: "snow", sleet: "snow" };

/** From NOAA's short forecast wording. */
export function detailFromText(text: string): Detail {
  const t = text.toLowerCase();
  if (/snow|flurr|blizzard/.test(t)) return "snow";
  if (/sleet|freezing|ice|wintry/.test(t)) return "sleet";
  if (/thunder|t-storm|tstorm/.test(t)) return "storm";
  if (/drizzle/.test(t)) return "drizzle";
  if (/rain|shower/.test(t)) return "rain";
  if (/fog|haze|smoke|mist/.test(t)) return "fog";
  if (/mostly cloudy|overcast|^cloudy|\bcloudy\b/.test(t) && !/partly|mostly sunny|mostly clear/.test(t)) return "cloudy";
  if (/partly|mostly sunny|mostly clear|few clouds|increasing clouds|decreasing clouds/.test(t)) return "partly";
  return "clear";
}

/** From a WMO weather code (Open-Meteo). */
export function detailFromWmo(code: number): Detail {
  if (code <= 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code === 56 || code === 57 || code === 66 || code === 67) return "sleet";
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

const WMO_TEXT: Record<Detail, string> = { clear: "Sunny", partly: "Partly cloudy", cloudy: "Cloudy", fog: "Fog", drizzle: "Drizzle", rain: "Rain", storm: "Thunderstorms", snow: "Snow", sleet: "Sleet / freezing rain" };

const day = (detail: Detail): Pick<DayForecast, "sky" | "icon"> => ({ sky: SKY[detail], icon: ICON[detail] });

type NoaaPeriod = {
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation?: { value: number | null } | null;
  windSpeed?: string;
  shortForecast: string;
};

/**
 * NOAA gives day and night periods ("Today", "Tonight", "Tuesday", …). A
 * day's high and summary come from its daytime period, its low from the night
 * that starts that evening.
 */
export function parseNoaa(json: { properties?: { periods?: NoaaPeriod[] } }): DayForecast[] {
  const periods = json.properties?.periods ?? [];
  const byDate = new Map<string, DayForecast>();
  const toF = (p: NoaaPeriod) => (p.temperatureUnit === "C" ? Math.round(p.temperature * 1.8 + 32) : p.temperature);
  for (const p of periods) {
    const date = p.startTime.slice(0, 10); // already in the forecast office's local time
    const detail = detailFromText(p.shortForecast);
    const d = byDate.get(date) ?? { date, high: null, low: null, summary: p.shortForecast, ...day(detail), precip: null, wind: null };
    if (p.isDaytime) Object.assign(d, { high: toF(p), summary: p.shortForecast, ...day(detail) });
    else d.low = toF(p);
    const precip = p.probabilityOfPrecipitation?.value;
    if (precip != null) d.precip = Math.max(d.precip ?? 0, precip);
    const wind = Math.max(0, ...(p.windSpeed?.match(/\d+/g) ?? []).map(Number));
    if (wind) d.wind = Math.max(d.wind ?? 0, wind);
    byDate.set(date, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
}

type OpenMeteoDaily = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
};

/** Open-Meteo's daily forecast, asked for in °F and mph. */
export function parseOpenMeteo(json: { daily?: OpenMeteoDaily }): DayForecast[] {
  const d = json.daily;
  if (!d) return [];
  return d.time.slice(0, 7).map((date, i) => {
    const detail = detailFromWmo(d.weather_code[i] ?? 3);
    const r = (v: number | null | undefined) => (v == null ? null : Math.round(v));
    return {
      date,
      high: r(d.temperature_2m_max[i]),
      low: r(d.temperature_2m_min[i]),
      summary: WMO_TEXT[detail],
      ...day(detail),
      precip: r(d.precipitation_probability_max?.[i]),
      wind: r(d.wind_speed_10m_max?.[i]),
    };
  });
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetchFn: Fetch, url: string) {
  const res = await fetchFn(url, { headers: { Accept: "application/geo+json, application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

export async function fetchForecast(latIn: number, lonIn: number, fetchFn: Fetch = fetch): Promise<Forecast> {
  const lat = roundForWeather(latIn);
  const lon = roundForWeather(lonIn);
  const fetchedAt = new Date().toISOString();
  // NOAA covers the US and its territories; anywhere else it answers 404 and we use Open-Meteo.
  const inUS = lat > 15 && lat < 72 && lon > -180 && lon < -64;
  if (inUS) {
    try {
      const point = await getJson(fetchFn, `https://api.weather.gov/points/${lat},${lon}`);
      const url = point?.properties?.forecast;
      if (url) {
        const days = parseNoaa(await getJson(fetchFn, url));
        if (days.length) return { source: "NOAA", fetchedAt, lat, lon, days };
      }
    } catch {
      // Fall through to Open-Meteo.
    }
  }
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "7",
  });
  const days = parseOpenMeteo(await getJson(fetchFn, `https://api.open-meteo.com/v1/forecast?${q}`));
  return { source: "Open-Meteo", fetchedAt, lat, lon, days };
}

/** °F for people in the US (and the few places that use it), °C everywhere else. */
export function prefersFahrenheit(locale = typeof navigator === "undefined" ? "en-US" : navigator.language): boolean {
  return /-(US|LR|MM|BS|BZ|KY|PW|FM|MH)\b/i.test(locale) || locale === "en";
}

export function formatTemp(f: number | null, fahrenheit: boolean): string {
  if (f == null) return "–";
  return fahrenheit ? `${Math.round(f)}°` : `${Math.round(((f - 32) * 5) / 9)}°`;
}
