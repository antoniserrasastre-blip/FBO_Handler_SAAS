"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { FlightEvent } from "@/lib/events";

interface UseEventStreamOptions {
  onEvent: (event: FlightEvent) => void;
  enabled?: boolean;
}

export function useEventStream({ onEvent, enabled = true }: UseEventStreamOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") {
          setConnected(true);
          return;
        }
        onEventRef.current(data as FlightEvent);
      } catch {
        // Ignore parse errors (heartbeats, etc.)
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (enabled) connect();
      }, 3000);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, connect]);

  return { connected };
}
