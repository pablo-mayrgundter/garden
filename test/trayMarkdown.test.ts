import assert from "node:assert/strict";
import { test } from "node:test";
import { groupCells, parseTrayMarkdown, trayToMarkdown } from "../src/lib/trayMarkdown.ts";

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
    { name: "Basil", cells: ["1A", "2A"] },
    { name: "Mint", cells: ["1B"] },
    { name: "Mint", cells: ["3B"] },
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
