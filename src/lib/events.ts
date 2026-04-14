// In-memory SSE event bus for real-time updates
// Each mutation broadcasts an event; connected SSE clients receive it instantly.

export type FlightEvent = {
  type: "flight_updated" | "flight_created" | "flight_deleted" | "service_updated" | "service_created" | "service_deleted";
  flightId: string;
  userId?: string;
  userName?: string;
  detail?: string;
  timestamp: string;
};

type Listener = (event: FlightEvent) => void;

class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: FlightEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore failed listeners (e.g., closed connections)
      }
    }
  }

  get connectionCount() {
    return this.listeners.size;
  }
}

// Singleton — survives across API route invocations in the same process
const globalForEvents = globalThis as unknown as { eventBus: EventBus | undefined };
export const eventBus = globalForEvents.eventBus ?? new EventBus();
if (process.env.NODE_ENV !== "production") globalForEvents.eventBus = eventBus;
