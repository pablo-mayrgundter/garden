import assert from "node:assert/strict";
import { test } from "node:test";
import { dayOfYear, fetchFrostDates, frostDates, monthDay } from "../src/lib/weather/climate.ts";
import { detailFromText, detailFromWmo, fetchForecast, formatTemp, parseNoaa, parseOpenMeteo, prefersFahrenheit } from "../src/lib/weather/forecast.ts";

// Shaped like api.weather.gov's /gridpoints/…/forecast (trimmed).
const NOAA = {
  properties: {
    periods: [
      { name: "Tonight", startTime: "2026-10-20T18:00:00-05:00", isDaytime: false, temperature: 61, temperatureUnit: "F", probabilityOfPrecipitation: { value: 20 }, windSpeed: "5 mph", shortForecast: "Mostly Clear" },
      { name: "Tuesday", startTime: "2026-10-21T06:00:00-05:00", isDaytime: true, temperature: 84, temperatureUnit: "F", probabilityOfPrecipitation: { value: 60 }, windSpeed: "10 to 20 mph", shortForecast: "Chance Showers And Thunderstorms" },
      { name: "Tuesday Night", startTime: "2026-10-21T18:00:00-05:00", isDaytime: false, temperature: 58, temperatureUnit: "F", probabilityOfPrecipitation: { value: 30 }, windSpeed: "10 mph", shortForecast: "Showers Likely" },
      { name: "Wednesday", startTime: "2026-10-22T06:00:00-05:00", isDaytime: true, temperature: 70, temperatureUnit: "F", probabilityOfPrecipitation: { value: null }, windSpeed: "5 mph", shortForecast: "Sunny" },
      { name: "Wednesday Night", startTime: "2026-10-22T18:00:00-05:00", isDaytime: false, temperature: 45, temperatureUnit: "F", probabilityOfPrecipitation: null, windSpeed: "5 mph", shortForecast: "Clear" },
    ],
  },
};

test("NOAA periods become days: high from the day, low from that night", () => {
  const days = parseNoaa(NOAA);
  assert.deepEqual(days.map((d) => d.date), ["2026-10-20", "2026-10-21", "2026-10-22"]);
  assert.deepEqual([days[0].high, days[0].low, days[0].sky], [null, 61, "sun"], "only tonight is left of today");
  assert.deepEqual([days[1].high, days[1].low, days[1].sky, days[1].icon, days[1].precip, days[1].wind], [84, 58, "rain", "⛈️", 60, 20]);
  assert.equal(days[1].summary, "Chance Showers And Thunderstorms");
  assert.deepEqual([days[2].high, days[2].low, days[2].sky, days[2].precip], [70, 45, "sun", null]);
});

test("wording and weather codes map to sun, cloud, rain and snow", () => {
  const sky = (t: string) => detailFromText(t);
  assert.equal(sky("Sunny"), "clear");
  assert.equal(sky("Mostly Sunny"), "partly");
  assert.equal(sky("Partly Cloudy"), "partly");
  assert.equal(sky("Mostly Cloudy"), "cloudy");
  assert.equal(sky("Areas Of Fog"), "fog");
  assert.equal(sky("Slight Chance Rain Showers"), "rain");
  assert.equal(sky("Snow Showers Likely"), "snow");
  assert.equal(sky("Freezing Rain"), "sleet");
  assert.deepEqual([0, 2, 3, 45, 53, 63, 66, 73, 81, 95].map(detailFromWmo), ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "sleet", "snow", "rain", "storm"]);
});

test("Open-Meteo's daily forecast", () => {
  const days = parseOpenMeteo({
    daily: {
      time: ["2026-10-20", "2026-10-21"],
      weather_code: [3, 71],
      temperature_2m_max: [72.4, 35.1],
      temperature_2m_min: [55.6, 28.2],
      precipitation_probability_max: [10, 80],
      wind_speed_10m_max: [8.2, 15.9],
    },
  });
  assert.deepEqual(days.map((d) => [d.sky, d.high, d.low, d.precip, d.wind, d.summary]), [
    ["cloud", 72, 56, 10, 8, "Cloudy"],
    ["snow", 35, 28, 80, 16, "Snow"],
  ]);
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("NOAA in the US, Open-Meteo elsewhere or when NOAA fails; location rounded", async () => {
  const asked: string[] = [];
  const om = { daily: { time: ["2026-10-20"], weather_code: [0], temperature_2m_max: [80], temperature_2m_min: [60] } };
  const fake = (noaaWorks: boolean) => async (url: string) => {
    asked.push(url);
    if (url.startsWith("https://api.weather.gov/points/")) return noaaWorks ? json({ properties: { forecast: "https://api.weather.gov/gridpoints/EWX/1,2/forecast" } }) : json({}, 500);
    if (url.startsWith("https://api.weather.gov/gridpoints/")) return json(NOAA);
    return json(om);
  };
  const us = await fetchForecast(30.1836998, -97.7891487, fake(true));
  assert.equal(us.source, "NOAA");
  assert.equal(asked[0], "https://api.weather.gov/points/30.18,-97.79");
  assert.equal(us.days.length, 3);
  const down = await fetchForecast(30.18, -97.79, fake(false));
  assert.equal(down.source, "Open-Meteo");
  asked.length = 0;
  const paris = await fetchForecast(48.8566, 2.3522, fake(true));
  assert.equal(paris.source, "Open-Meteo");
  assert.ok(asked.every((u) => !u.includes("weather.gov")));
  assert.match(asked[0], /latitude=48\.86&longitude=2\.35/);
  assert.match(asked[0], /temperature_unit=fahrenheit/);
});

test("temperatures display in the viewer's units", () => {
  assert.equal(prefersFahrenheit("en-US"), true);
  assert.equal(prefersFahrenheit("en-GB"), false);
  assert.equal(prefersFahrenheit("fr-FR"), false);
  assert.equal(formatTemp(32, true), "32°");
  assert.equal(formatTemp(32, false), "0°");
  assert.equal(formatTemp(null, true), "–");
});

/** Synthetic years of daily lows: a cosine year, coldest in mid-January (or mid-July down south). */
function years(n: number, meanC: number, swingC: number, south = false) {
  const dates: string[] = [];
  const mins: number[] = [];
  for (let y = 2000; y < 2000 + n; y++) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = d.toISOString().slice(0, 10);
      const coldest = south ? 196 : 15;
      const phase = ((dayOfYear(date) - coldest) / 365) * 2 * Math.PI;
      dates.push(date);
      mins.push(meanC - swingC * Math.cos(phase));
    }
  }
  return { dates, mins };
}

test("frost dates: the last freezing night of spring and the first of autumn, averaged", () => {
  // Lows from -10°C to 20°C: below 0°C for about a third of the year around mid-January.
  const { dates, mins } = years(30, 5, 15);
  const f = frostDates(dates, mins, 40);
  assert.equal(f.years, 30);
  assert.equal(f.frostYears, 30);
  // Symmetric about Jan 15: cos(phase) = 1/3 → about ±71 days.
  const within = (got: string | null, want: number) => assert.ok(got && Math.abs(dayOfYear(`2001-${got}`) - want) <= 2, `${got} vs ${monthDay(want)}`);
  within(f.lastFrost, dayOfYear("2001-01-15") + 71.5);
  within(f.firstFrost, dayOfYear("2001-01-15") - 71.5 + 365);
  assert.ok(dayOfYear(`2001-${f.lastHardFreeze}`) < dayOfYear(`2001-${f.lastFrost}`), "hard freezes end earlier in spring");
  assert.ok(dayOfYear(`2001-${f.firstHardFreeze}`) > dayOfYear(`2001-${f.firstFrost}`), "and start later in autumn");
});

test("frost dates down south, and where it hardly ever freezes", () => {
  const south = frostDates(...Object.values(years(10, 5, 15, true)) as [string[], number[]], -35);
  // Winter centered mid-July: last frost in spring (Sep), first in autumn (May).
  assert.equal(Number(south.lastFrost!.slice(0, 2)), 9);
  assert.equal(Number(south.firstFrost!.slice(0, 2)), 5);
  const warm = frostDates(...Object.values(years(10, 15, 10)) as [string[], number[]], 25);
  assert.deepEqual([warm.lastFrost, warm.firstFrost, warm.frostYears], [null, null, 0]);
});

test("frost dates come from 30 full years of history", async () => {
  let url = "";
  const { dates, mins } = years(30, 5, 15);
  const f = await fetchFrostDates(30.1836998, -97.7891487, async (u) => ((url = u), json({ daily: { time: dates, temperature_2m_min: mins } })), new Date("2026-10-20T12:00:00Z"));
  assert.match(url, /^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?/);
  assert.match(url, /latitude=30\.18&longitude=-97\.79/);
  assert.match(url, /start_date=1996-01-01&end_date=2025-12-31/);
  assert.equal(f.years, 30);
});
