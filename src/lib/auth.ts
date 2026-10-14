import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "garden_session";
const SESSION_DAYS = 60;

export type User = { id: number; email: string; name: string };
export type Membership = { gardenId: number; gardenName: string; role: string; timezone: string };

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function startSession(userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db()
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .run(hashToken(token), userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  jar.delete(COOKIE);
}

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as User | undefined;
  return row ?? null;
});

export function membershipsFor(userId: number): Membership[] {
  return db()
    .prepare(
      `SELECT g.id AS gardenId, g.name AS gardenName, m.role, g.timezone FROM memberships m
       JOIN gardens g ON g.id = m.garden_id WHERE m.user_id = ? ORDER BY m.created_at`,
    )
    .all(userId) as Membership[];
}

/** For pages: the signed-in user and their garden, or a redirect to login. */
export const requireGardener = cache(async (): Promise<{ user: User; garden: Membership }> => {
  const user = await currentUser();
  if (!user) redirect("/login");
  const garden = membershipsFor(user.id)[0];
  if (!garden) redirect("/join");
  return { user, garden };
});

/** For route handlers: like requireGardener but returns null instead of redirecting. */
export async function gardenerOrNull(): Promise<{ user: User; garden: Membership } | null> {
  const user = await currentUser();
  if (!user) return null;
  const garden = membershipsFor(user.id)[0];
  return garden ? { user, garden } : null;
}
