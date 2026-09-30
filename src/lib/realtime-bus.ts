type NotificationEvent = {
  type: "notification" | "count_update" | "rule_change";
  action: "created" | "updated" | "archived" | "deleted" | "recalculated";
  data?: any;
  unreadCount?: number;
  timestamp: string;
};

type Listener = (event: NotificationEvent) => void;

class RealtimeBus {
  private listeners: Set<Listener> = new Set();

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public broadcast(event: NotificationEvent) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error sending realtime event to subscriber:", err);
      }
    });
  }

  public get clientCount(): number {
    return this.listeners.size;
  }
}

// Global singleton across hot reloads in dev / server instance
const globalForBus = globalThis as unknown as { realtimeBus?: RealtimeBus };
export const realtimeBus = globalForBus.realtimeBus ?? new RealtimeBus();
if (process.env.NODE_ENV !== "production") globalForBus.realtimeBus = realtimeBus;
