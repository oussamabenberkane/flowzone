import { ok, readJson, userRoute } from "@/server/http/route";
import { chatMessageBody } from "@/shared/ai-schemas";
import { createServiceContext } from "@/services/context";
import { startChatTurn } from "@/services/ai/chat";

/**
 * Sends one message and streams the reply as newline-delimited JSON events:
 *   {"type":"start","messageId"} {"type":"delta","text"} {"type":"action","action"}
 *   {"type":"done","messageId"} {"type":"error","reason"}
 * If the AI cannot run, it answers with JSON instead: {"available":false,"reason"}.
 */
export const maxDuration = 60;

export const POST = userRoute(async ({ req, user }) => {
  const body = await readJson(req, chatMessageBody);
  const ctx = await createServiceContext(user);
  const turn = await startChatTurn(ctx, body.text);
  if (turn.kind === "unavailable") return ok({ available: false, reason: turn.reason });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of turn.events) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "error", reason: "provider_down" })}\n`),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
});
