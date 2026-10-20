// Where in the world the garden is: a list of major cities to pick from, and a
// parser for coordinates pasted from Google Maps (or typed by hand).

export type City = { name: string; region: string; lat: number; lon: number };

const C = (region: string, rows: [string, number, number][]): City[] => rows.map(([name, lat, lon]) => ({ name, region, lat, lon }));

export const CITIES: City[] = [
  ...C("United States", [
    ["Albuquerque, NM", 35.08, -106.65], ["Anchorage, AK", 61.22, -149.9], ["Atlanta, GA", 33.75, -84.39], ["Austin, TX", 30.27, -97.74],
    ["Baltimore, MD", 39.29, -76.61], ["Boise, ID", 43.62, -116.2], ["Boston, MA", 42.36, -71.06], ["Buffalo, NY", 42.89, -78.88],
    ["Charlotte, NC", 35.23, -80.84], ["Chicago, IL", 41.88, -87.63], ["Cleveland, OH", 41.5, -81.69], ["Columbus, OH", 39.96, -83.0],
    ["Dallas, TX", 32.78, -96.8], ["Denver, CO", 39.74, -104.99], ["Detroit, MI", 42.33, -83.05], ["El Paso, TX", 31.76, -106.49],
    ["Honolulu, HI", 21.31, -157.86], ["Houston, TX", 29.76, -95.37], ["Indianapolis, IN", 39.77, -86.16], ["Kansas City, MO", 39.1, -94.58],
    ["Las Vegas, NV", 36.17, -115.14], ["Los Angeles, CA", 34.05, -118.24], ["Madison, WI", 43.07, -89.4], ["Memphis, TN", 35.15, -90.05],
    ["Miami, FL", 25.76, -80.19], ["Milwaukee, WI", 43.04, -87.91], ["Minneapolis, MN", 44.98, -93.27], ["Nashville, TN", 36.16, -86.78],
    ["New Orleans, LA", 29.95, -90.07], ["New York, NY", 40.71, -74.01], ["Oklahoma City, OK", 35.47, -97.52], ["Orlando, FL", 28.54, -81.38],
    ["Philadelphia, PA", 39.95, -75.17], ["Phoenix, AZ", 33.45, -112.07], ["Pittsburgh, PA", 40.44, -79.99], ["Portland, OR", 45.52, -122.68],
    ["Raleigh, NC", 35.78, -78.64], ["Richmond, VA", 37.54, -77.44], ["Sacramento, CA", 38.58, -121.49], ["Salt Lake City, UT", 40.76, -111.89],
    ["San Antonio, TX", 29.42, -98.49], ["San Diego, CA", 32.72, -117.16], ["San Francisco, CA", 37.77, -122.42], ["San Jose, CA", 37.34, -121.89],
    ["Seattle, WA", 47.61, -122.33], ["St. Louis, MO", 38.63, -90.2], ["Tampa, FL", 27.95, -82.46], ["Tucson, AZ", 32.22, -110.97],
    ["Washington, DC", 38.91, -77.04],
  ]),
  ...C("Canada", [
    ["Calgary, AB", 51.05, -114.07], ["Edmonton, AB", 53.55, -113.49], ["Halifax, NS", 44.65, -63.57], ["Montréal, QC", 45.5, -73.57],
    ["Ottawa, ON", 45.42, -75.7], ["Toronto, ON", 43.65, -79.38], ["Vancouver, BC", 49.28, -123.12], ["Winnipeg, MB", 49.9, -97.14],
  ]),
  ...C("Mexico, Central & South America", [
    ["Bogotá", 4.71, -74.07], ["Buenos Aires", -34.6, -58.38], ["Guadalajara", 20.66, -103.35], ["Havana", 23.11, -82.37],
    ["Lima", -12.05, -77.04], ["Mexico City", 19.43, -99.13], ["Monterrey", 25.69, -100.32], ["Quito", -0.18, -78.47],
    ["Rio de Janeiro", -22.91, -43.17], ["San Juan, PR", 18.47, -66.11], ["Santiago", -33.45, -70.67], ["São Paulo", -23.55, -46.63],
  ]),
  ...C("Europe", [
    ["Amsterdam", 52.37, 4.9], ["Athens", 37.98, 23.73], ["Barcelona", 41.39, 2.17], ["Berlin", 52.52, 13.4],
    ["Brussels", 50.85, 4.35], ["Budapest", 47.5, 19.04], ["Copenhagen", 55.68, 12.57], ["Dublin", 53.35, -6.26],
    ["Edinburgh", 55.95, -3.19], ["Hamburg", 53.55, 9.99], ["Helsinki", 60.17, 24.94], ["Istanbul", 41.01, 28.98],
    ["Kyiv", 50.45, 30.52], ["Lisbon", 38.72, -9.14], ["London", 51.51, -0.13], ["Madrid", 40.42, -3.7],
    ["Milan", 45.46, 9.19], ["Moscow", 55.76, 37.62], ["Munich", 48.14, 11.58], ["Oslo", 59.91, 10.75],
    ["Paris", 48.86, 2.35], ["Prague", 50.08, 14.44], ["Reykjavík", 64.15, -21.94], ["Rome", 41.9, 12.5],
    ["Stockholm", 59.33, 18.07], ["Vienna", 48.21, 16.37], ["Warsaw", 52.23, 21.01], ["Zürich", 47.38, 8.54],
  ]),
  ...C("Africa & Middle East", [
    ["Cairo", 30.04, 31.24], ["Cape Town", -33.92, 18.42], ["Casablanca", 33.57, -7.59], ["Dubai", 25.2, 55.27],
    ["Johannesburg", -26.2, 28.05], ["Lagos", 6.52, 3.38], ["Nairobi", -1.29, 36.82], ["Riyadh", 24.71, 46.68],
    ["Tehran", 35.69, 51.39], ["Tel Aviv", 32.09, 34.78],
  ]),
  ...C("Asia", [
    ["Bangkok", 13.76, 100.5], ["Beijing", 39.9, 116.41], ["Bengaluru", 12.97, 77.59], ["Delhi", 28.61, 77.21],
    ["Dhaka", 23.81, 90.41], ["Hanoi", 21.03, 105.85], ["Ho Chi Minh City", 10.82, 106.63], ["Hong Kong", 22.32, 114.17],
    ["Jakarta", -6.21, 106.85], ["Karachi", 24.86, 67.01], ["Kuala Lumpur", 3.14, 101.69], ["Manila", 14.6, 120.98],
    ["Mumbai", 19.08, 72.88], ["Osaka", 34.69, 135.5], ["Seoul", 37.57, 126.98], ["Shanghai", 31.23, 121.47],
    ["Singapore", 1.35, 103.82], ["Taipei", 25.03, 121.57], ["Tokyo", 35.68, 139.69],
  ]),
  ...C("Australia & New Zealand", [
    ["Adelaide", -34.93, 138.6], ["Auckland", -36.85, 174.76], ["Brisbane", -27.47, 153.03], ["Melbourne", -37.81, 144.96],
    ["Perth", -31.95, 115.86], ["Sydney", -33.87, 151.21], ["Wellington", -41.29, 174.78],
  ]),
];

export const CITY_REGIONS = [...new Set(CITIES.map((c) => c.region))];

/** The nearest listed city, if one is within about 50 km. */
export function nearestCity(lat: number, lon: number): City | null {
  let best: City | null = null;
  let bestD = Infinity;
  for (const c of CITIES) {
    const dLat = c.lat - lat;
    const dLon = (c.lon - lon) * Math.cos((lat * Math.PI) / 180);
    const d = Math.hypot(dLat, dLon);
    if (d < bestD) [best, bestD] = [c, d];
  }
  return bestD < 0.45 ? best : null;
}

const NUM = String.raw`([-+]?\d{1,3}(?:\.\d+)?)`;

/**
 * Coordinates from whatever was pasted: Google Maps' "@30.1836998,-97.7891487",
 * a whole Google Maps link (a dropped pin's exact spot is preferred over the
 * view's center), "30.18, -97.78", or "30.18° N, 97.78° W".
 */
export function parseLatLng(text: string): { lat: number; lon: number } | null {
  const t = text.trim();
  const ok = (lat: number, lon: number) => (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null);
  const patterns = [
    new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
    new RegExp(String.raw`@${NUM},\s*${NUM}`),
    new RegExp(String.raw`[?&](?:q|ll|query|center|destination)=${NUM}(?:,|%2C)\s*${NUM}`, "i"),
    new RegExp(String.raw`^\(?\s*${NUM}°?\s*[,\s]\s*${NUM}°?\s*\)?$`),
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return ok(Number(m[1]), Number(m[2]));
  }
  const hemi = t.match(/(\d{1,3}(?:\.\d+)?)\s*°?\s*([NS])[\s,]+(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])/i);
  if (hemi) return ok(Number(hemi[1]) * (/s/i.test(hemi[2]) ? -1 : 1), Number(hemi[3]) * (/w/i.test(hemi[4]) ? -1 : 1));
  return null;
}
