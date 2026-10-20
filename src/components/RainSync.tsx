// Keeps the garden's rain record up to date while the app is open: fills in
// the days since it last ran (up to a few months back) and refreshes today's
// expected rain every hour. Quietly does nothing until the garden's location
// is set, or when the weather service can't be reached.

import { useEffect } from "react";
import { recordRain } from "@/lib/actions";
import { useGarden } from "@/lib/GardenContext";
import { fetchRain, rainNeededFrom, rainRecords } from "@/lib/weather/rain";

const HOUR = 60 * 60 * 1000;

export function RainSync() {
  const { data, today, act, latest } = useGarden();
  const lat = data.garden.site?.lat;
  const lon = data.garden.site?.lon;
  useEffect(() => {
    if (lat == null || lon == null) return;
    let stopped = false;
    const sync = async () => {
      try {
        const from = rainNeededFrom(latest(), today);
        const readings = await fetchRain(lat, lon, from, today);
        if (stopped) return;
        const records = rainRecords(latest().rain, readings, today);
        if (records.length) await act((ctx) => recordRain(ctx, records));
      } catch (e) {
        console.info("Couldn't update the rain record:", (e as Error).message);
      }
    };
    sync();
    const t = setInterval(sync, HOUR);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [lat, lon, today, act, latest]);
  return null;
}
