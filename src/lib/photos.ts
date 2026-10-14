import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, UPLOAD_DIR } from "./db";
import { getPlanting, getSpecies, getTray } from "./garden";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function savePhoto(
  gardenId: number,
  input: {
    data: Buffer;
    mime: string;
    plantingId?: number | null;
    speciesId?: number | null;
    trayId?: number | null;
    kind?: string;
    caption?: string | null;
    takenAt: string;
    userId: number;
  },
): number {
  const ext = EXT[input.mime];
  if (!ext) throw new Error("Unsupported image type");
  if (input.data.byteLength > MAX_PHOTO_BYTES) throw new Error("Photo is too large (10 MB max)");
  if (input.plantingId && !getPlanting(gardenId, input.plantingId)) throw new Error("Unknown planting");
  if (input.speciesId && !getSpecies(gardenId, input.speciesId)) throw new Error("Unknown plant");
  if (input.trayId && !getTray(gardenId, input.trayId)) throw new Error("Unknown tray");

  const file = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ UPLOAD_DIR, file), input.data);
  return Number(
    db()
      .prepare(
        `INSERT INTO photos (garden_id, planting_id, species_id, tray_id, kind, file, mime, caption, taken_at, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        gardenId,
        input.plantingId ?? null,
        input.speciesId ?? null,
        input.trayId ?? null,
        input.kind ?? "progress",
        file,
        input.mime,
        input.caption || null,
        input.takenAt,
        input.userId,
      ).lastInsertRowid,
  );
}

export function photoFile(gardenId: number, id: number): { path: string; mime: string } | null {
  const row = db().prepare("SELECT file, mime FROM photos WHERE id = ? AND garden_id = ?").get(id, gardenId) as
    | { file: string; mime: string }
    | undefined;
  if (!row) return null;
  const full = path.join(UPLOAD_DIR, path.basename(row.file));
  return fs.existsSync(full) ? { path: full, mime: row.mime } : null;
}

export function deletePhoto(gardenId: number, id: number): void {
  const row = db().prepare("SELECT file FROM photos WHERE id = ? AND garden_id = ?").get(id, gardenId) as { file: string } | undefined;
  if (!row) return;
  db().prepare("DELETE FROM photos WHERE id = ?").run(id);
  fs.rmSync(path.join(UPLOAD_DIR, path.basename(row.file)), { force: true });
}
