// In-memory SSE event bus for real-time updates.
// Each mutation broadcasts an event; connected SSE clients receive it instantly.
//
// IMPORTANT: this is process-local. It only delivers events across requests
// served by the same Node process. The current deploy is a single Docker
// container (see docker-compose.yml and ADR 0001) so this is fine. Do NOT
// move to a multi-instance deploy without replacing this with a pub/sub bus
// (Redis, Pusher, etc.). See docs/adr/0001-eventbus-single-container.md.
//
// v2 note: the `flightId` field in events now carries the Visit id (the same
// id the UI sees via FlightView.id), so consumers don't need to change.

export type FlightEventType =
  | "flight_created"
  | "flight_updated"
  | "flight_deleted"
  | "service_created"
  | "service_updated"
  | "service_deleted"
  | "passenger_updated"
  | "crew_updated"
  | "lost_item_updated"
  // v2-native event names — emitted alongside legacy names for new consumers
  | "visit_created"
  | "visit_updated"
  | "visit_deleted"
  | "movement_updated";

export type FlightEvent = {
  type: FlightEventType;
  flightId: string;        // = visitId for v2 events
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
