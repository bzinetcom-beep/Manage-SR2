import { getCurrentUser } from "@/lib/auth";
import { realtimeBus } from "@/lib/realtime-bus";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: any) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch (e) {
          // Client disconnected
        }
      };

      // Initial unread count payload on connection
      try {
        const [row] = await db
          .select({ count: sql<number>`count(*)` })
          .from(notifications)
          .where(eq(notifications.status, "unread"));
        sendEvent("connected", {
          message: "Real-time notification stream connected",
          unreadCount: Number(row?.count) || 0,
        });
      } catch (err) {
        sendEvent("connected", { message: "Connected", unreadCount: 0 });
      }

      // Listen for broadcasts from the server event bus
      const unsubscribe = realtimeBus.subscribe((evt) => {
        sendEvent(evt.type, evt);
      });

      // Periodic Keep-Alive ping every 15s to prevent browser/proxy timeouts
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch (e) {
          clearInterval(pingInterval);
          unsubscribe();
        }
      }, 15000);

      // Clean up on client abort
      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        unsubscribe();
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable buffering in Nginx/proxies
    },
  });
}
