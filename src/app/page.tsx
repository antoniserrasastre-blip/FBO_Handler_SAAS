"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flight, Service, EventLog } from "@prisma/client";
import { DaySummary } from "@/components/DaySummary";
import { FlightCard } from "@/components/FlightCard";

type FlightWithRelations = Flight & {
  services: Service[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [date] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

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

  useEffect(() => {
    if (status === "authenticated") {
      fetchFlights();
    }
  }, [status, fetchFlights]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (status !== "authenticated") return;
    const interval = setInterval(fetchFlights, 30000);
    return () => clearInterval(interval);
  }, [status, fetchFlights]);

  const handleFlightUpdate = async (id: string, data: Partial<Flight>) => {
    // Optimistic update
    setFlights((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...data } : f))
    );

    const res = await fetch(`/api/flights/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const updated = await res.json();
      setFlights((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } else {
      // Revert on error
      fetchFlights();
    }
  };

  const handleServiceToggle = async (serviceId: string, newState: "PENDING" | "DELIVERED") => {
    // Optimistic update
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

    if (res.ok) {
      fetchFlights();
    }
  };

  const handleAddService = async (flightId: string, type: string, customName?: string) => {
    const res = await fetch(`/api/flights/${flightId}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, customName }),
    });

    if (res.ok) {
      fetchFlights();
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const res = await fetch(`/api/services/${serviceId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      fetchFlights();
    }
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
      <DaySummary flights={flights} date={date} />

      <main className="mx-auto max-w-7xl px-4 py-4">
        {/* Action bar */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-500">
            {flights.length} vuelo{flights.length !== 1 ? "s" : ""} hoy
          </h2>
          <button
            onClick={() => router.push("/flights/new")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
          >
            + Nuevo vuelo
          </button>
        </div>

        {/* Flight list */}
        {flights.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
            <p className="text-gray-500">No hay vuelos para hoy.</p>
            <button
              onClick={() => router.push("/flights/new")}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Crear primer vuelo
            </button>
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
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
