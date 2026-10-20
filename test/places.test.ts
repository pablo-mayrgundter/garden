import assert from "node:assert/strict";
import { test } from "node:test";
import { CITIES, nearestCity, parseLatLng } from "../src/lib/map/places.ts";

test("reads coordinates the way Google Maps and people write them", () => {
  const austin = { lat: 30.1836998, lon: -97.7891487 };
  assert.deepEqual(parseLatLng("@30.1836998,-97.7891487"), austin);
  assert.deepEqual(parseLatLng("https://www.google.com/maps/@30.1836998,-97.7891487,17z?entry=ttu"), austin);
  // A place link: the pin (!3d…!4d…) wins over the view's center (@…).
  assert.deepEqual(
    parseLatLng("https://www.google.com/maps/place/Somewhere/@30.18,-97.79,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d30.1836998!4d-97.7891487"),
    austin,
  );
  assert.deepEqual(parseLatLng("https://maps.google.com/?q=30.1836998,-97.7891487"), austin);
  assert.deepEqual(parseLatLng("30.1836998, -97.7891487"), austin);
  assert.deepEqual(parseLatLng(" (30.1836998 -97.7891487) "), austin);
  assert.deepEqual(parseLatLng("30.1837° N, 97.7891° W"), { lat: 30.1837, lon: -97.7891 });
  assert.deepEqual(parseLatLng("33.87 S 151.21 E"), { lat: -33.87, lon: 151.21 });
  assert.equal(parseLatLng("Austin, TX"), null);
  assert.equal(parseLatLng("@95.1,-97.7"), null, "latitude out of range");
});

test("cities are sane and findable", () => {
  for (const c of CITIES) assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180, c.name);
  assert.equal(new Set(CITIES.map((c) => c.name)).size, CITIES.length);
  assert.equal(nearestCity(30.1837, -97.7891)?.name, "Austin, TX");
  assert.equal(nearestCity(0, -140), null, "nowhere near a city");
});
