import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seedGarden } from "./seed";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE gardens (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE memberships (
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (garden_id, user_id)
  );
  CREATE TABLE species (
    id INTEGER PRIMARY KEY,
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    common_name TEXT NOT NULL,
    variety TEXT,
    scientific_name TEXT,
    wikipedia_title TEXT,
    category TEXT NOT NULL DEFAULT 'herb',
    lifecycle TEXT,
    source TEXT,
    seeds_per_packet TEXT,
    sow_depth TEXT,
    light TEXT,
    germ_days_min INTEGER,
    germ_days_max INTEGER,
    height TEXT,
    spread TEXT,
    spacing TEXT,
    soil TEXT,
    watering TEXT,
    water_every_days INTEGER NOT NULL DEFAULT 2,
    harvest_days_min INTEGER,
    harvest_days_max INTEGER,
    uses TEXT,
    packet_text TEXT,
    tips TEXT NOT NULL DEFAULT '[]',
    milestones TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (garden_id, slug)
  );
  CREATE TABLE trays (
    id INTEGER PRIMARY KEY,
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT,
    rows TEXT NOT NULL,
    cols INTEGER NOT NULL,
    notes TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE plantings (
    id INTEGER PRIMARY KEY,
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    species_id INTEGER NOT NULL REFERENCES species(id),
    tray_id INTEGER REFERENCES trays(id) ON DELETE SET NULL,
    cells TEXT NOT NULL DEFAULT '[]',
    location TEXT,
    status TEXT NOT NULL DEFAULT 'planned',
    sown_at TEXT,
    sow_date_estimated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    planting_id INTEGER NOT NULL REFERENCES plantings(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    by_assistant INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX events_planting ON events(planting_id, date);
  CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    planting_id INTEGER REFERENCES plantings(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    by_assistant INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX notes_planting ON notes(planting_id, created_at);
  CREATE TABLE photos (
    id INTEGER PRIMARY KEY,
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    planting_id INTEGER REFERENCES plantings(id) ON DELETE CASCADE,
    species_id INTEGER REFERENCES species(id) ON DELETE CASCADE,
    tray_id INTEGER REFERENCES trays(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'progress',
    file TEXT NOT NULL,
    mime TEXT NOT NULL,
    caption TEXT,
    taken_at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    planting_id INTEGER REFERENCES plantings(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL,
    done_at TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    by_assistant INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE chat_threads (
    id INTEGER PRIMARY KEY,
    garden_id INTEGER NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    display TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

function open(): Database.Database {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "garden.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const version = db.pragma("user_version", { simple: true }) as number;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }

  const gardens = db.prepare("SELECT COUNT(*) AS n FROM gardens").get() as { n: number };
  if (gardens.n === 0) seedGarden(db, UPLOAD_DIR);
  return db;
}

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { __gardenDb?: Database.Database };

export function db(): Database.Database {
  if (!globalForDb.__gardenDb) globalForDb.__gardenDb = open();
  return globalForDb.__gardenDb;
}
