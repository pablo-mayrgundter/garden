import type Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ESTIMATED_SOW_DATE, PHOTO_DATE, PLANTINGS, SPECIES, TRAYS } from "./seed-data";

const SEED_IMAGE_DIR = path.resolve(process.cwd(), "seed", "images");

/** Copy a committed seed image into the uploads dir; returns its stored file name, or null if missing. */
function copySeedImage(name: string, uploadDir: string): string | null {
  const src = path.join(SEED_IMAGE_DIR, `${name}.webp`);
  if (!fs.existsSync(src)) return null;
  const file = `seed-${name}.webp`;
  fs.copyFileSync(src, path.join(uploadDir, file));
  return file;
}

/** Creates the first garden from the handwritten plan and seed packets. Runs once, on an empty database. */
export function seedGarden(db: Database.Database, uploadDir: string): void {
  db.transaction(() => {
    const garden = db
      .prepare("INSERT INTO gardens (name, invite_code) VALUES (?, ?)")
      .run("Herb Garden", crypto.randomBytes(9).toString("base64url"));
    const gardenId = Number(garden.lastInsertRowid);

    const addPhoto = db.prepare(
      `INSERT INTO photos (garden_id, planting_id, species_id, tray_id, kind, file, mime, caption, taken_at)
       VALUES (@gardenId, @plantingId, @speciesId, @trayId, @kind, @file, 'image/webp', @caption, @takenAt)`,
    );
    const photo = (image: string, fields: { plantingId?: number; speciesId?: number; trayId?: number; kind: string; caption: string }) => {
      const file = copySeedImage(image, uploadDir);
      if (!file) return;
      addPhoto.run({
        gardenId,
        plantingId: fields.plantingId ?? null,
        speciesId: fields.speciesId ?? null,
        trayId: fields.trayId ?? null,
        kind: fields.kind,
        file,
        caption: fields.caption,
        takenAt: PHOTO_DATE,
      });
    };

    const insertSpecies = db.prepare(
      `INSERT INTO species (garden_id, slug, common_name, variety, scientific_name, wikipedia_title, category, lifecycle,
         source, seeds_per_packet, sow_depth, light, germ_days_min, germ_days_max, height, spread, spacing, soil, watering,
         water_every_days, harvest_days_min, harvest_days_max, uses, packet_text, tips, milestones)
       VALUES (@gardenId, @slug, @commonName, @variety, @scientificName, @wikipediaTitle, @category, @lifecycle,
         @source, @seedsPerPacket, @sowDepth, @light, @germDaysMin, @germDaysMax, @height, @spread, @spacing, @soil, @watering,
         @waterEveryDays, @harvestDaysMin, @harvestDaysMax, @uses, @packetText, @tips, @milestones)`,
    );
    const speciesIds = new Map<string, number>();
    for (const s of SPECIES) {
      const { hasPacketImages, ...rest } = s;
      const id = Number(
        insertSpecies.run({ ...rest, gardenId, tips: JSON.stringify(s.tips), milestones: JSON.stringify(s.milestones) })
          .lastInsertRowid,
      );
      speciesIds.set(s.slug, id);
      if (hasPacketImages) {
        photo(`${s.slug}-front`, { speciesId: id, kind: "packet_front", caption: "Seed packet (front)" });
        photo(`${s.slug}-back`, { speciesId: id, kind: "packet_back", caption: "Seed packet (back)" });
      }
    }

    const insertTray = db.prepare(
      "INSERT INTO trays (garden_id, name, kind, rows, cols, notes, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const trayIds = new Map<string, number>();
    TRAYS.forEach((t, i) => {
      const id = Number(insertTray.run(gardenId, t.name, t.kind, JSON.stringify(t.rows), t.cols, t.notes, i).lastInsertRowid);
      trayIds.set(t.key, id);
      if (t.photo) photo(t.photo, { trayId: id, kind: "tray", caption: `${t.name}, ${PHOTO_DATE}` });
    });

    const insertPlanting = db.prepare(
      `INSERT INTO plantings (garden_id, species_id, tray_id, cells, status, sown_at, sow_date_estimated)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEvent = db.prepare("INSERT INTO events (planting_id, type, date, note) VALUES (?, ?, ?, ?)");
    const insertNote = db.prepare("INSERT INTO notes (garden_id, planting_id, body) VALUES (?, ?, ?)");
    for (const p of PLANTINGS) {
      const sown = p.status !== "planned";
      const id = Number(
        insertPlanting.run(
          gardenId,
          speciesIds.get(p.species)!,
          trayIds.get(p.tray)!,
          JSON.stringify(p.cells),
          p.status,
          sown ? ESTIMATED_SOW_DATE : null,
          sown ? 1 : 0,
        ).lastInsertRowid,
      );
      if (p.sprouted) insertEvent.run(id, "sprouted", PHOTO_DATE, "Seen in the tray photo");
      if (p.note) insertNote.run(gardenId, id, p.note);
      if (p.photo) photo(p.photo, { plantingId: id, kind: "progress", caption: `Cell ${p.cells.join("–")}, ${PHOTO_DATE}` });
    }
  })();
}
