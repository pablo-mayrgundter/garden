import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCell, groupCells, parseCell, parseTrayMarkdown, trayToMarkdown } from "../src/lib/trayMarkdown.ts";

const MD = `# Egg carton

18-cup egg carton on foil

Keep on the south windowsill.

| | 1 | 2 | 3 |
|:-:|---|---|---|
| A | **Basil** | Basil | - |
| b | Mint |  | Mint |
`;

test("parses name, description, rows, columns and cells", () => {
  const t = parseTrayMarkdown(MD);
  assert.equal(t.name, "Egg carton");
  assert.equal(t.kind, "18-cup egg carton on foil");
  assert.equal(t.notes, "Keep on the south windowsill.");
  assert.deepEqual(t.rows, ["A", "B"]);
  assert.equal(t.cols, 3);
  assert.deepEqual([...t.cells], [["1A", "Basil"], ["2A", "Basil"], ["1B", "Mint"], ["3B", "Mint"]]);
});

test("adjacent same names in a row are one planting; gaps split them", () => {
  assert.deepEqual(groupCells(parseTrayMarkdown(MD)), [
    { name: "Basil", variety: null, count: null, cells: ["1A", "2A"] },
    { name: "Mint", variety: null, count: null, cells: ["1B"] },
    { name: "Mint", variety: null, count: null, cells: ["3B"] },
  ]);
});

test("writes back out and re-parses to the same layout", () => {
  const t = parseTrayMarkdown(MD);
  const again = parseTrayMarkdown(trayToMarkdown(t, t.cells));
  assert.deepEqual({ ...again }, { ...t });
});

test("explains malformed tables", () => {
  assert.throws(() => parseTrayMarkdown("# T\n\nno table"), /Add a table/);
  assert.throws(() => parseTrayMarkdown("# T\n| | 1 |\n| x | y |\n| A | Basil |"), /separator/);
  assert.throws(() => parseTrayMarkdown("# T\n| | 1 |\n|---|---|\n| 1 | Basil |"), /start with a letter/);
  assert.throws(() => parseTrayMarkdown("# T\n| | 1 |\n|---|---|\n| A | Basil | Thyme |"), /has 2 cells but the header has 1/);
});

test("reads the row shorthand: name, (variety) and x count", () => {
  assert.deepEqual(parseCell("Beet (Detroit Golden) x 18"), { name: "Beet", variety: "Detroit Golden", count: 18 });
  assert.deepEqual(parseCell("Carrot ×24"), { name: "Carrot", variety: null, count: 24 });
  assert.deepEqual(parseCell("Lettuce (Black Seeded Simpson)"), { name: "Lettuce", variety: "Black Seeded Simpson", count: null });
  assert.deepEqual(parseCell("Basil"), { name: "Basil", variety: null, count: null });
  assert.equal(formatCell({ name: "Beet", variety: "Detroit Golden", count: 18 }), "Beet (Detroit Golden) x 18");
});

const BED = `# Bed 1

Raised bed, 8 × 4 ft

|   | 1 |
|---|---|
| A | Beet (Detroit Golden) x 18 |
| B | Carrot x 24 |
| C |   |
`;

test("a one-column table with counts is a bed planted in rows", () => {
  const t = parseTrayMarkdown(BED);
  assert.equal(t.layout, "rows");
  assert.deepEqual(groupCells(t), [
    { name: "Beet", variety: "Detroit Golden", count: 18, cells: ["1A"] },
    { name: "Carrot", variety: null, count: 24, cells: ["1B"] },
  ]);
  assert.equal(parseTrayMarkdown(MD).layout, "cells");
});

test("a row split across columns sums its counts", () => {
  const t = parseTrayMarkdown("# B\n| | 1 | 2 |\n|---|---|---|\n| A | Beet x 6 | Beet x 4 |");
  assert.deepEqual(groupCells(t), [{ name: "Beet", variety: null, count: 10, cells: ["1A", "2A"] }]);
});
