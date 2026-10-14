import fs from "node:fs";
import { gardenerOrNull } from "@/lib/auth";
import { photoFile } from "@/lib/photos";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await gardenerOrNull();
  if (!g) return new Response("Not signed in", { status: 401 });
  const f = photoFile(g.garden.gardenId, Number((await params).id));
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(f.path)), {
    headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
