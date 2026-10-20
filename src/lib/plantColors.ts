// A color per crop, so beds read at a glance: radish rows are pink-red,
// spinach dark green, carrots orange. Crops not listed get a stable color
// from a palette chosen to stay distinguishable from each other.

import type { Species } from "./types.ts";

const KNOWN: [RegExp, string][] = [
  [/radish/i, "#c2185b"],
  [/beet/i, "#8e2440"],
  [/carrot/i, "#e8730c"],
  [/spinach/i, "#1b5e20"],
  [/lettuce/i, "#7cb342"],
  [/kale/i, "#3e6b5a"],
  [/chard/i, "#d84315"],
  [/arugula|rocket/i, "#558b2f"],
  [/pea\b|peas/i, "#43a047"],
  [/bean/i, "#827717"],
  [/onion|scallion|leek|chive/i, "#7e57c2"],
  [/garlic/i, "#a1887f"],
  [/tomato/i, "#e53935"],
  [/pepper/i, "#ef6c00"],
  [/squash|zucchini|pumpkin/i, "#f9a825"],
  [/cucumber/i, "#33691e"],
  [/broccoli/i, "#2e6b4f"],
  [/cauliflower/i, "#b9ad8a"],
  [/cabbage/i, "#5c8a8a"],
  [/turnip|rutabaga/i, "#9c4f96"],
  [/basil/i, "#2e7d32"],
  [/cilantro|coriander/i, "#689f38"],
  [/parsley/i, "#4caf50"],
  [/dill/i, "#9ccc65"],
  [/strawberr/i, "#d32f2f"],
];

const PALETTE = ["#1565c0", "#6a1b9a", "#00838f", "#ad1457", "#4e342e", "#f57f17", "#2e7d32", "#c62828", "#283593", "#00695c"];

export function speciesColor(s: Pick<Species, "id" | "commonName"> | undefined): string {
  if (!s) return "#6f9f4f";
  for (const [re, color] of KNOWN) if (re.test(s.commonName)) return color;
  const h = [...s.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return PALETTE[h % PALETTE.length];
}
