import { gardenerOrNull } from "@/lib/auth";
import { newThread, runAssistantTurn, threadForDisplay, type StreamEvent } from "@/lib/assistant";
import { todayIn } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () => Response.json({ error: "Not signed in" }, { status: 401 });

export async function GET() {
  const g = await gardenerOrNull();
  if (!g) return unauthorized();
  return Response.json({ messages: threadForDisplay(g.garden.gardenId, g.user.id) });
}

export async function DELETE() {
  const g = await gardenerOrNull();
  if (!g) return unauthorized();
  newThread(g.garden.gardenId, g.user.id);
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const g = await gardenerOrNull();
  if (!g) return unauthorized();
  const body = (await req.json().catch(() => null)) as { message?: unknown; pathname?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 8000) : "";
  const pathname = typeof body?.pathname === "string" ? body.pathname : "/";
  if (!message) return Response.json({ error: "Empty message" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAssistantTurn(
          {
            gardenId: g.garden.gardenId,
            userId: g.user.id,
            userName: g.user.name,
            timezone: g.garden.timezone,
            today: todayIn(g.garden.timezone),
            pathname,
            message,
          },
          emit,
        );
      } catch (err) {
        console.error("assistant error", err);
        emit({ t: "error", message: "The assistant hit an error. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
