// A planter's layout as a small markdown document: a heading for the name, a
// line or two of description, and a table whose rows are letters and columns are
// numbers. Each cell names the plant growing there; the same name in adjacent
// cells of a row means one planting spanning them (e.g. lavender in 1C and 2C).
//
//   # Seed tray
//
//   16-cell seed tray with humidity dome
//
//   |   | 1        | 2        | 3    | 4     |
//   |---|----------|----------|------|-------|
//   | A | Rosemary | Thyme    | Dill | Basil |
//   | B | Oregano  |          |      | Sage  |

export type ParsedTray = {
  name: string;
  kind: string | null;
  notes: string | null;
  rows: string[];
  cols: number;
  /** Plant name per cell label ("1A"), only for non-empty cells. */
  cells: Map<string, string>;
};

export type CellGroup = { name: string; cells: string[] };

const EMPTY = new Set(["", "-", "–", "—", "·", ".", "empty", "x"]);

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

const clean = (s: string) => s.replace(/[*_`]/g, "").trim();

export function parseTrayMarkdown(md: string): ParsedTray {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let name: string | null = null;
  const prose: string[][] = [[]];
  const table: { line: number; text: string }[] = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("|")) table.push({ line: i + 1, text: line });
    else if (/^#\s+/.test(line) && name === null) name = clean(line.replace(/^#+\s*/, ""));
    else if (!line) {
      if (prose.at(-1)!.length) prose.push([]);
    } else if (!line.startsWith("#")) prose.at(-1)!.push(line);
  });

  if (!name) throw new Error("Start with a heading naming the planter, like “# Seed tray”.");
  if (table.length < 3) throw new Error("Add a table: a header row of column numbers, a |---| row, then one row per letter.");

  const header = splitRow(table[0].text).slice(1);
  const cols = header.length;
  header.forEach((h, i) => {
    if (clean(h) !== String(i + 1)) throw new Error(`Line ${table[0].line}: the header should number the columns 1, 2, 3… (column ${i + 1} is “${h}”).`);
  });
  if (!cols) throw new Error(`Line ${table[0].line}: the header needs at least one column number.`);
  if (!splitRow(table[1].text).every((c) => /^:?-{1,}:?$/.test(c)))
    throw new Error(`Line ${table[1].line}: the second table row should be the |---|---| separator.`);

  const rows: string[] = [];
  const cells = new Map<string, string>();
  for (const { line, text } of table.slice(2)) {
    const [label, ...values] = splitRow(text);
    const row = clean(label).toUpperCase();
    if (!/^[A-Z]{1,2}$/.test(row)) throw new Error(`Line ${line}: each row should start with a letter (got “${label}”).`);
    if (rows.includes(row)) throw new Error(`Line ${line}: row ${row} appears twice.`);
    if (values.length > cols) throw new Error(`Line ${line}: row ${row} has ${values.length} cells but the header has ${cols} columns.`);
    rows.push(row);
    values.forEach((v, i) => {
      const plant = clean(v);
      if (!EMPTY.has(plant.toLowerCase())) cells.set(`${i + 1}${row}`, plant);
    });
  }

  const paragraphs = prose.map((p) => p.join(" ")).filter(Boolean);
  return { name, kind: paragraphs[0] ?? null, notes: paragraphs.slice(1).join("\n\n") || null, rows, cols, cells };
}

/** Adjacent cells in a row naming the same plant become one group. */
export function groupCells(t: Pick<ParsedTray, "rows" | "cols" | "cells">): CellGroup[] {
  const groups: CellGroup[] = [];
  for (const row of t.rows) {
    let current: CellGroup | null = null;
    for (let col = 1; col <= t.cols; col++) {
      const cell = `${col}${row}`;
      const plant = t.cells.get(cell);
      if (plant && current && current.name.toLowerCase() === plant.toLowerCase()) current.cells.push(cell);
      else {
        current = plant ? { name: plant, cells: [cell] } : null;
        if (current) groups.push(current);
      }
    }
  }
  return groups;
}

export function trayToMarkdown(t: { name: string; kind: string | null; notes: string | null; rows: string[]; cols: number }, cellNames: Map<string, string>): string {
  const header = ["", ...Array.from({ length: t.cols }, (_, i) => String(i + 1))];
  const body = t.rows.map((r) => [r, ...Array.from({ length: t.cols }, (_, i) => cellNames.get(`${i + 1}${r}`) ?? "")]);
  const widths = header.map((_, c) => Math.max(3, ...[header, ...body].map((row) => row[c].length)));
  const fmt = (row: string[]) => `| ${row.map((v, c) => v.padEnd(widths[c])).join(" | ")} |`;
  return [
    `# ${t.name}`,
    "",
    ...(t.kind ? [t.kind, ""] : []),
    ...(t.notes ? [t.notes, ""] : []),
    fmt(header),
    `|${widths.map((w) => "-".repeat(w + 2)).join("|")}|`,
    ...body.map(fmt),
    "",
  ].join("\n");
}

export const NEW_TRAY_TEMPLATE = `# New planter

What it is, e.g. 16-cell seed tray with a humidity dome

|   | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| A |   |   |   |   |
| B |   |   |   |   |
`;
