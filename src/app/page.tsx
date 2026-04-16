"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flight, Service, EventLog } from "@prisma/client";
import { DaySummary } from "@/components/DaySummary";
import { FlightCard } from "@/components/FlightCard";
import { TurnaroundAlerts } from "@/components/TurnaroundAlert";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { useEventStream } from "@/hooks/useEventStream";
import { FlightEvent } from "@/lib/events";
import { ChevronDown } from "@/components/Icons";

type FlightWithRelations = Flight & {
  services: Service[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);
  const [date, setDate] = useState(() => {
    // Check if history page set a specific date
    if (typeof window !== "undefined") {
      const viewDate = sessionStorage.getItem("viewDate");
      if (viewDate) {
        sessionStorage.removeItem("viewDate");
        const d = new Date(viewDate);
        d.setHours(0, 0, 0, 0);
        return d;
      }
    }
    return getToday();
  });

  const isToday = useMemo(() => {
    const today = getToday();
    return date.getTime() === today.getTime();
  }, [date]);

  const fetchFlights = useCallback(async () => {
    try {
      const res = await fetch(`/api/flights?date=${date.toISOString()}`);
      if (res.ok) {
        const data = await res.json();
        setFlights(data.flights);
      }
    } catch (err) {
      console.error("Error fetching flights:", err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const addToast = useCallback((text: string, userName?: string, type?: ToastMessage["type"]) => {
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev.slice(-4), { id, text, userName, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleEvent = useCallback(
    (event: FlightEvent) => {
      const isOwnChange = session?.user?.id === event.userId;
      if (!isOwnChange && event.userName) {
        const typeLabels: Record<string, string> = {
          flight_updated: "actualizo",
          flight_created: "creo vuelo",
          flight_deleted: "elimino vuelo",
          service_updated: "cambio servicio",
          service_created: "añadio servicio",
          service_deleted: "elimino servicio",
        };
        const action = typeLabels[event.type] || event.type;
        addToast(`${action}${event.detail ? `: ${event.detail}` : ""}`, event.userName, "info");
      }
      if (isToday) fetchFlights();
    },
    [fetchFlights, addToast, session?.user?.id, isToday]
  );

  const { connected } = useEventStream({
    onEvent: handleEvent,
    enabled: status === "authenticated",
  });

  useEffect(() => {
    if (status === "authenticated") {
      setLoading(true);
      fetchFlights();
    }
  }, [status, fetchFlights]);

  // Fallback polling only for today
  useEffect(() => {
    if (status !== "authenticated" || !isToday) return;
    const interval = setInterval(fetchFlights, 10000);
    return () => clearInterval(interval);
  }, [status, fetchFlights, isToday]);

  // Turnaround alert refresh
  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => {
      setFlights((prev) => [...prev]);
    }, 60000);
    return () => clearInterval(interval);
  }, [isToday]);

  const handleDateChange = useCallback((newDate: Date) => {
    setDate(newDate);
    setFlights([]);
    setLoading(true);
  }, []);

  // --- Mutation handlers (disabled for past days) ---
  const handleFlightUpdate = async (id: string, data: Partial<Flight>) => {
    setFlights((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
    const res = await fetch(`/api/flights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setFlights((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } else {
      fetchFlights();
    }
  };

  const handleServiceToggle = async (serviceId: string, newState: string) => {
    setFlights((prev) =>
      prev.map((f) => ({
        ...f,
        services: f.services.map((s) =>
          s.id === serviceId ? { ...s, state: newState } : s
        ),
      }))
    );
    const res = await fetch(`/api/services/${serviceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: newState }),
    });
    if (!res.ok) fetchFlights();
  };

  const handleAddService = async (flightId: string, type: string, customName?: string, reference?: string, target?: string) => {
    const res = await fetch(`/api/flights/${flightId}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, customName, reference, target }),
    });
    if (res.ok) fetchFlights();
  };

  const handleDeleteFlight = async (id: string) => {
    const res = await fetch(`/api/flights/${id}`, { method: "DELETE" });
    if (res.ok) fetchFlights();
  };

  const handleDeleteService = async (serviceId: string) => {
    const res = await fetch(`/api/services/${serviceId}`, { method: "DELETE" });
    if (res.ok) fetchFlights();
  };

  const handleExport = (type: "flights" | "services") => {
    const dateStr = date.toISOString().slice(0, 10);
    window.open(`/api/export?date=${dateStr}&type=${type}`, "_blank");
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DaySummary
        flights={flights}
        date={date}
        connected={connected}
        isToday={isToday}
        onDateChange={handleDateChange}
      />

      {isToday && <TurnaroundAlerts flights={flights} />}

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        {/* Action bar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
          <h2 className="text-xs font-medium text-gray-500 sm:text-sm">
            {flights.length} vuelo{flights.length !== 1 ? "s" : ""}
            {isToday ? " hoy" : ""}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {flights.length > 0 && (
              <div className="relative group">
                <button className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3 sm:py-2 sm:text-sm">
                  Exportar <ChevronDown size={14} className="inline" />
                </button>
                <div className="absolute right-0 top-full z-10 mt-1 hidden min-w-[140px] rounded-lg border bg-white py-1 shadow-lg group-hover:block">
                  <button
                    onClick={() => handleExport("flights")}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Vuelos (CSV)
                  </button>
                  <button
                    onClick={() => handleExport("services")}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Servicios (CSV)
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={() => router.push("/import")}
              className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-4 sm:py-2 sm:text-sm"
            >
              Importar PDF
            </button>
            <button
              onClick={() => router.push("/flights/new")}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500 sm:px-4 sm:py-2 sm:text-sm"
            >
              + Nuevo vuelo
            </button>
          </div>
        </div>

        {/* Flight list */}
        {flights.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
            <p className="text-gray-500">
              {isToday ? "No hay vuelos para hoy." : "No hay datos para este dia."}
            </p>
            {isToday && (
              <button
                onClick={() => router.push("/flights/new")}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Crear primer vuelo
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {flights.map((flight) => (
              <FlightCard
                key={flight.id}
                flight={flight}
                onUpdate={handleFlightUpdate}
                onServiceToggle={handleServiceToggle}
                onAddService={handleAddService}
                onDeleteService={handleDeleteService}
                onDelete={handleDeleteFlight}
                readOnly={false}
              />
            ))}
          </div>
        )}
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
