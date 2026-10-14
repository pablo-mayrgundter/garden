"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  currentUser,
  endSession,
  hashPassword,
  ownerEmails,
  requireGardener,
  startSession,
  verifyPassword,
} from "@/lib/auth";
import { todayIn, isDate } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  addEvents,
  addNote,
  addTask,
  createPlanting,
  deleteEvent,
  deleteNote,
  deletePlanting,
  getPlanting,
  setTaskDone,
  updatePlanting,
} from "@/lib/garden";
import { deletePhoto, savePhoto } from "@/lib/photos";
import { EVENT_TYPES, PLANTING_STATUSES, type EventType, type PlantingStatus } from "@/lib/seed-data";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const optInt = (fd: FormData, key: string) => {
  const n = parseInt(str(fd, key), 10);
  return Number.isFinite(n) ? n : null;
};

// ---------- Auth ----------

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = String(fd.get("password") ?? "");
  const invite = str(fd, "invite");
  const tz = str(fd, "tz") || "UTC";

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email." };
  if (!name) return { error: "Tell us your name." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const d = db();
  if (d.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) return { error: "That email already has an account — log in instead." };

  let gardenId: number | null = null;
  let role = "member";
  if (invite) {
    const g = d.prepare("SELECT id FROM gardens WHERE invite_code = ?").get(invite) as { id: number } | undefined;
    if (!g) return { error: "That invite link isn't valid anymore. Ask for a fresh one." };
    gardenId = g.id;
  } else {
    const owners = ownerEmails();
    const memberCount = (d.prepare("SELECT COUNT(*) AS n FROM memberships").get() as { n: number }).n;
    // OWNER_EMAILS may join the original garden directly; with none configured, the very first sign-up claims it.
    if (owners.includes(email) || (owners.length === 0 && memberCount === 0)) {
      gardenId = (d.prepare("SELECT id FROM gardens ORDER BY id LIMIT 1").get() as { id: number }).id;
      role = "owner";
    }
  }
  if (!gardenId) return { error: "You need an invite link from a gardener to join." };

  const userId = d.transaction(() => {
    const id = Number(d.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)").run(email, name, hashPassword(password)).lastInsertRowid);
    const firstMember = !d.prepare("SELECT 1 FROM memberships WHERE garden_id = ?").get(gardenId);
    d.prepare("INSERT INTO memberships (garden_id, user_id, role) VALUES (?, ?, ?)").run(gardenId, id, role);
    if (firstMember) d.prepare("UPDATE gardens SET timezone = ? WHERE id = ?").run(tz, gardenId);
    return id;
  })();

  await startSession(userId);
  redirect("/");
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const user = db().prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return { error: "Wrong email or password." };
  await startSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function joinWithInvite(_: FormState, fd: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const code = str(fd, "invite").split("invite=").at(-1)!;
  const g = db().prepare("SELECT id FROM gardens WHERE invite_code = ?").get(code) as { id: number } | undefined;
  if (!g) return { error: "That invite code isn't valid." };
  db().prepare("INSERT OR IGNORE INTO memberships (garden_id, user_id) VALUES (?, ?)").run(g.id, user.id);
  redirect("/");
}

// ---------- Care log ----------

export async function logCare(fd: FormData): Promise<void> {
  const { user, garden } = await requireGardener();
  const type = str(fd, "type") as EventType;
  if (!EVENT_TYPES.includes(type)) throw new Error("Unknown event type");
  const date = isDate(str(fd, "date")) ? str(fd, "date") : todayIn(garden.timezone);
  const plantingIds = str(fd, "plantingIds")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter(Number.isFinite);
  addEvents(garden.gardenId, { plantingIds, type, date, note: str(fd, "note"), userId: user.id });
  revalidatePath("/", "layout");
}

export async function removeEvent(fd: FormData): Promise<void> {
  const { garden } = await requireGardener();
  deleteEvent(garden.gardenId, optInt(fd, "eventId") ?? 0);
  revalidatePath("/", "layout");
}

// ---------- Notes & tasks ----------

export async function saveNote(_: FormState, fd: FormData): Promise<FormState> {
  const { user, garden } = await requireGardener();
  const body = str(fd, "body");
  if (!body) return { error: "Write something first." };
  addNote(garden.gardenId, { plantingId: optInt(fd, "plantingId"), body, userId: user.id });
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function removeNote(fd: FormData): Promise<void> {
  const { garden } = await requireGardener();
  deleteNote(garden.gardenId, optInt(fd, "noteId") ?? 0);
  revalidatePath("/", "layout");
}

export async function saveTask(_: FormState, fd: FormData): Promise<FormState> {
  const { user, garden } = await requireGardener();
  const title = str(fd, "title");
  const dueDate = str(fd, "dueDate");
  if (!title) return { error: "What needs doing?" };
  if (!isDate(dueDate)) return { error: "Pick a date." };
  addTask(garden.gardenId, { plantingId: optInt(fd, "plantingId"), title, dueDate, userId: user.id });
  revalidatePath("/", "layout");
  return { ok: "Added" };
}

export async function toggleTask(fd: FormData): Promise<void> {
  const { garden } = await requireGardener();
  setTaskDone(garden.gardenId, optInt(fd, "taskId") ?? 0, str(fd, "done") === "1");
  revalidatePath("/", "layout");
}

// ---------- Plantings ----------

export async function editPlanting(_: FormState, fd: FormData): Promise<FormState> {
  const { garden } = await requireGardener();
  const id = optInt(fd, "plantingId") ?? 0;
  const status = str(fd, "status") as PlantingStatus;
  if (!PLANTING_STATUSES.includes(status)) return { error: "Unknown status." };
  const sownAt = str(fd, "sownAt");
  if (sownAt && !isDate(sownAt)) return { error: "Bad sow date." };
  updatePlanting(garden.gardenId, id, {
    status,
    sownAt: sownAt || null,
    sowDateEstimated: fd.get("sowDateEstimated") === "on",
    location: str(fd, "location") || null,
  });
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function markSown(fd: FormData): Promise<void> {
  const { garden } = await requireGardener();
  const id = optInt(fd, "plantingId") ?? 0;
  updatePlanting(garden.gardenId, id, { status: "sown", sownAt: todayIn(garden.timezone), sowDateEstimated: false });
  revalidatePath("/", "layout");
}

export async function plantCells(_: FormState, fd: FormData): Promise<FormState> {
  const { garden } = await requireGardener();
  const speciesId = optInt(fd, "speciesId");
  const trayId = optInt(fd, "trayId");
  const cells = str(fd, "cells").split(",").filter(Boolean);
  const sownAt = str(fd, "sownAt");
  if (!speciesId) return { error: "Choose a plant." };
  if (!cells.length) return { error: "Choose at least one cell." };
  if (sownAt && !isDate(sownAt)) return { error: "Bad sow date." };
  const id = createPlanting(garden.gardenId, { speciesId, trayId, cells, sownAt: sownAt || null });
  revalidatePath("/", "layout");
  redirect(`/plantings/${id}`);
}

export async function removePlanting(fd: FormData): Promise<void> {
  const { garden } = await requireGardener();
  const id = optInt(fd, "plantingId") ?? 0;
  const p = getPlanting(garden.gardenId, id);
  deletePlanting(garden.gardenId, id);
  revalidatePath("/", "layout");
  redirect(p?.trayId ? `/trays/${p.trayId}` : "/");
}

// ---------- Photos ----------

export async function uploadPhoto(_: FormState, fd: FormData): Promise<FormState> {
  const { user, garden } = await requireGardener();
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const takenAt = isDate(str(fd, "takenAt")) ? str(fd, "takenAt") : todayIn(garden.timezone);
  try {
    savePhoto(garden.gardenId, {
      data: Buffer.from(await file.arrayBuffer()),
      mime: file.type,
      plantingId: optInt(fd, "plantingId"),
      speciesId: optInt(fd, "speciesId"),
      trayId: optInt(fd, "trayId"),
      kind: str(fd, "kind") || "progress",
      caption: str(fd, "caption"),
      takenAt,
      userId: user.id,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: "Uploaded" };
}

export async function removePhoto(fd: FormData): Promise<void> {
  const { garden } = await requireGardener();
  deletePhoto(garden.gardenId, optInt(fd, "photoId") ?? 0);
  revalidatePath("/", "layout");
}

// ---------- Plant library ----------

const SPECIES_TEXT_FIELDS = {
  commonName: "common_name",
  variety: "variety",
  scientificName: "scientific_name",
  wikipediaTitle: "wikipedia_title",
  source: "source",
  sowDepth: "sow_depth",
  light: "light",
  height: "height",
  spread: "spread",
  spacing: "spacing",
  soil: "soil",
  watering: "watering",
  uses: "uses",
  packetText: "packet_text",
} as const;
const SPECIES_INT_FIELDS = {
  germDaysMin: "germ_days_min",
  germDaysMax: "germ_days_max",
  waterEveryDays: "water_every_days",
  harvestDaysMin: "harvest_days_min",
  harvestDaysMax: "harvest_days_max",
} as const;

export async function saveSpecies(_: FormState, fd: FormData): Promise<FormState> {
  const { garden } = await requireGardener();
  const id = optInt(fd, "speciesId");
  const commonName = str(fd, "commonName");
  if (!commonName) return { error: "A plant needs a name." };

  const values: Record<string, string | number | null> = {};
  for (const [field, col] of Object.entries(SPECIES_TEXT_FIELDS)) values[col] = str(fd, field) || null;
  for (const [field, col] of Object.entries(SPECIES_INT_FIELDS)) values[col] = optInt(fd, field);
  values.water_every_days ??= 2;
  values.wikipedia_title = (values.wikipedia_title as string | null)?.replace(/^https?:\/\/[a-z]+\.wikipedia\.org\/wiki\//, "").replace(/ /g, "_") ?? null;
  values.tips = JSON.stringify(
    str(fd, "tips")
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean),
  );

  const cols = Object.keys(values);
  const d = db();
  let speciesId = id;
  if (id) {
    d.prepare(`UPDATE species SET ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id AND garden_id = @gardenId`).run({
      ...values,
      id,
      gardenId: garden.gardenId,
    });
  } else {
    const slug = `${commonName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${crypto.randomBytes(2).toString("hex")}`;
    speciesId = Number(
      d
        .prepare(`INSERT INTO species (garden_id, slug, category, ${cols.join(", ")}) VALUES (@gardenId, @slug, @category, ${cols.map((c) => `@${c}`).join(", ")})`)
        .run({ ...values, gardenId: garden.gardenId, slug, category: str(fd, "category") || "herb" }).lastInsertRowid,
    );
  }
  revalidatePath("/", "layout");
  redirect(`/plants/${speciesId}`);
}

// ---------- Settings ----------

export async function saveGardenSettings(_: FormState, fd: FormData): Promise<FormState> {
  const { garden } = await requireGardener();
  const name = str(fd, "name");
  const tz = str(fd, "timezone");
  if (!name) return { error: "Name your garden." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return { error: "Unknown timezone." };
  }
  db().prepare("UPDATE gardens SET name = ?, timezone = ? WHERE id = ?").run(name, tz, garden.gardenId);
  revalidatePath("/", "layout");
  return { ok: "Saved" };
}

export async function rotateInvite(): Promise<void> {
  const { garden } = await requireGardener();
  db().prepare("UPDATE gardens SET invite_code = ? WHERE id = ?").run(crypto.randomBytes(9).toString("base64url"), garden.gardenId);
  revalidatePath("/settings");
}
