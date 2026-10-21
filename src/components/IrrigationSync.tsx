// Records irrigation timers' runs as they come due while the app is open (and
// any missed since it was last open, up to a month back), so a timed sprinkler
// run counts as watering without anyone having to log it. Checks once a minute;
// no network involved.

import { useEffect } from "react";
import { recordIrrigation } from "@/lib/actions";
import { timeIn } from "@/lib/dates";
import { useGarden } from "@/lib/GardenContext";
import { irrigationZones, timerRunsDue } from "@/lib/irrigation";

const MINUTE = 60 * 1000;

export function IrrigationSync() {
  const { data, today, act, latest } = useGarden();
  const timers = (data.garden.zones ?? []).some((z) => z.timer && !z.timer.paused);
  // Check again as soon as a timer is set or changed, not just once a minute.
  const settings = JSON.stringify(data.garden.zones ?? []);
  useEffect(() => {
    if (!timers) return;
    const sync = () => {
      const current = latest();
      const due = timerRunsDue(irrigationZones(current), current.irrigation ?? [], today, timeIn(current.garden.timezone));
      if (due.length) act((ctx) => recordIrrigation(ctx, due)).catch((e) => console.info("Couldn't record the irrigation timers' runs:", (e as Error).message));
    };
    sync();
    const t = setInterval(sync, MINUTE);
    return () => clearInterval(t);
  }, [timers, settings, today, act, latest]);
  return null;
}
