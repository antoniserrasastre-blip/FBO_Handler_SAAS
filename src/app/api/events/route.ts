import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { eventBus, FlightEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`)
      );

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Subscribe to flight events
      unsubscribe = eventBus.subscribe((event: FlightEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // Client disconnected
          clearInterval(heartbeat);
          if (unsubscribe) unsubscribe();
        }
      });

      // Clean up on abort
      const cleanup = () => {
        clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
      };

      // Store cleanup for cancel
      (controller as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },
    cancel(controller) {
      const ctrl = controller as unknown as { _cleanup?: () => void };
      if (ctrl._cleanup) ctrl._cleanup();
      if (unsubscribe) unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
