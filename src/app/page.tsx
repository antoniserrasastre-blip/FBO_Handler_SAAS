"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { DaySummary } from "@/components/DaySummary";
import { FlightCard } from "@/components/FlightCard";
import { TurnaroundAlerts } from "@/components/TurnaroundAlert";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { useEventStream } from "@/hooks/useEventStream";
import { FlightEvent } from "@/lib/events";
import { ChevronDown } from "@/components/Icons";
import { SearchBar } from "@/components/SearchBar";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { PendingServicesPanel } from "@/components/PendingServicesPanel";
import { QuickAddFlight } from "@/components/QuickAddFlight";
import { useOverdueAlert } from "@/hooks/useOverdueAlert";
import { Volume2, VolumeX, FileCheck2 } from "lucide-react";
import { ShiftHandover } from "@/components/ShiftHandover";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
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
  const [filteredFlights, setFilteredFlights] = useState<FlightWithRelations[]>([]);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const allServices = useMemo(() => flights.flatMap((f) => f.services), [flights]);
  const overdueCount = useOverdueAlert(allServices, soundEnabled && isToday);

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

  const addToast = useCallback((text: string, userName?: string, type?: ToastMessage["type"], onRetry?: () => void) => {
    const id = String(++toastIdRef.current);
    setToasts((prev) => [...prev.slice(-4), { id, text, userName, type, onRetry }]);
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
          lost_item_updated: "objeto olvidado",
          passenger_updated: "pasajero actualizado",
          crew_updated: "tripulante actualizado",
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

  // --- Mutation handlers with error feedback ---
  const handleFlightUpdate = async (id: string, data: Partial<Flight>) => {
    setFlights((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
    try {
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
        addToast("Error al guardar vuelo", undefined, "warning", () => handleFlightUpdate(id, data));
      }
    } catch {
      fetchFlights();
      addToast("Sin conexion — cambio no guardado", undefined, "warning", () => handleFlightUpdate(id, data));
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
    try {
      const res = await fetch(`/api/services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState }),
      });
      if (!res.ok) {
        fetchFlights();
        addToast("Error al cambiar servicio", undefined, "warning", () => handleServiceToggle(serviceId, newState));
      }
    } catch {
      fetchFlights();
      addToast("Sin conexion — servicio no actualizado", undefined, "warning", () => handleServiceToggle(serviceId, newState));
    }
  };

  const handleAddService = async (flightId: string, type: string, customName?: string, reference?: string, target?: string) => {
    try {
      const res = await fetch(`/api/flights/${flightId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, customName, reference, target }),
      });
      if (res.ok) fetchFlights();
      else addToast("Error al anadir servicio", undefined, "warning", () => handleAddService(flightId, type, customName, reference, target));
    } catch {
      addToast("Sin conexion — servicio no anadido", undefined, "warning", () => handleAddService(flightId, type, customName, reference, target));
    }
  };

  const handleDeleteFlight = async (id: string) => {
    try {
      const res = await fetch(`/api/flights/${id}`, { method: "DELETE" });
      if (res.ok) fetchFlights();
      else addToast("Error al eliminar vuelo", undefined, "warning");
    } catch {
      addToast("Sin conexion — vuelo no eliminado", undefined, "warning");
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    try {
      const res = await fetch(`/api/services/${serviceId}`, { method: "DELETE" });
      if (res.ok) fetchFlights();
      else addToast("Error al eliminar servicio", undefined, "warning");
    } catch {
      addToast("Sin conexion — servicio no eliminado", undefined, "warning");
    }
  };

  const handleAddLostItem = async (flightId: string, description: string, location: string) => {
    try {
      const res = await fetch(`/api/flights/${flightId}/lost-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, location }),
      });
      if (res.ok) fetchFlights();
      else addToast("Error al registrar objeto", undefined, "warning");
    } catch {
      addToast("Sin conexion — objeto no registrado", undefined, "warning");
    }
  };

  const handleLostItemToggle = async (itemId: string, newState: string) => {
    setFlights((prev) =>
      prev.map((f) => ({
        ...f,
        lostItems: f.lostItems.map((li) =>
          li.id === itemId ? { ...li, state: newState } : li
        ),
      }))
    );
    try {
      const res = await fetch(`/api/lost-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: newState }),
      });
      if (!res.ok) {
        fetchFlights();
        addToast("Error al actualizar objeto", undefined, "warning", () => handleLostItemToggle(itemId, newState));
      }
    } catch {
      fetchFlights();
      addToast("Sin conexion — objeto no actualizado", undefined, "warning", () => handleLostItemToggle(itemId, newState));
    }
  };

  const handleDeleteLostItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/lost-items/${itemId}`, { method: "DELETE" });
      if (res.ok) fetchFlights();
      else addToast("Error al eliminar objeto", undefined, "warning");
    } catch {
      addToast("Sin conexion — objeto no eliminado", undefined, "warning");
    }
  };

  // Keyboard shortcuts (after handlers are defined)
  useEffect(() => {
    const FUEL_CYCLE: Record<string, string> = { NOT_REQUESTED: "REQUESTED", REQUESTED: "SERVED", SERVED: "NOT_REQUESTED" };
    const TOILET_CYCLE: Record<string, string> = { NOT_REQUESTED: "REQUESTED", REQUESTED: "COMPLETED", COMPLETED: "NOT_REQUESTED" };
    const SVC_NEXT: Record<string, string> = { PENDING: "ARRIVED", ARRIVED: "DELIVERED" };

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const list = filteredFlights;
      const idx = list.findIndex((f) => f.id === selectedFlightId);
      const selected = idx >= 0 ? list[idx] : null;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (list.length > 0) {
            const next = idx < list.length - 1 ? idx + 1 : 0;
            setSelectedFlightId(list[next].id);
            document.getElementById(`flight-${list[next].id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (list.length > 0) {
            const prev = idx > 0 ? idx - 1 : list.length - 1;
            setSelectedFlightId(list[prev].id);
            document.getElementById(`flight-${list[prev].id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
          break;
        case "f":
        case "F":
          if (selected) {
            const next = FUEL_CYCLE[selected.fuelState] || "NOT_REQUESTED";
            const data: Partial<Flight> & Record<string, unknown> = { fuelState: next };
            if (next === "REQUESTED") data.fuelRequestedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            if (next === "SERVED") data.fuelServedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            handleFlightUpdate(selected.id, data);
          }
          break;
        case "t":
        case "T":
          if (selected) {
            const next = TOILET_CYCLE[selected.toiletState] || "NOT_REQUESTED";
            const data: Partial<Flight> & Record<string, unknown> = { toiletState: next };
            if (next === "REQUESTED") data.toiletRequestedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            if (next === "COMPLETED") data.toiletCompletedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            handleFlightUpdate(selected.id, data);
          }
          break;
        case "c":
        case "C":
          if (selected) {
            const catering = selected.services.find((s) => s.type === "CATERING" && SVC_NEXT[s.state]);
            if (catering) handleServiceToggle(catering.id, SVC_NEXT[catering.state]);
          }
          break;
        case "s":
        case "S":
          if (selected) {
            const svc = selected.services.find((s) => SVC_NEXT[s.state]);
            if (svc) handleServiceToggle(svc.id, SVC_NEXT[svc.state]);
          }
          break;
        case "/":
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case "?":
          setShowShortcuts((prev) => !prev);
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredFlights, selectedFlightId]);

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

      <PendingServicesPanel flights={flights} onQuickFilter={setSearchQuery} />

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        {/* Search bar */}
        {flights.length > 0 && (
          <SearchBar
            flights={flights}
            onFilteredFlights={setFilteredFlights}
            resultCount={filteredFlights.length}
            totalCount={flights.length}
            inputRef={searchInputRef}
            query={searchQuery}
            onQueryChange={setSearchQuery}
          />
        )}

        {/* Action bar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
          <h2 className="text-xs font-medium text-gray-500 sm:text-sm">
            {filteredFlights.length === flights.length
              ? `${flights.length} vuelo${flights.length !== 1 ? "s" : ""}${isToday ? " hoy" : ""}`
              : `${filteredFlights.length} de ${flights.length} vuelos`
            }
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700 overdue-pulse">
                &#9888; {overdueCount} retrasado{overdueCount !== 1 ? "s" : ""}
              </span>
            )}
            {flights.length > 0 && (
              <button
                onClick={() => setShowHandover(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3 sm:py-2 sm:text-sm"
                title="Resumen para pasar turno"
              >
                <FileCheck2 size={14} /> Traspaso
              </button>
            )}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="rounded-lg border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50"
              title={soundEnabled ? "Desactivar sonido" : "Activar sonido de alertas"}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
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
                  <div className="mx-2 my-1 border-t border-gray-100" />
                  <button
                    onClick={() => window.open(`/api/export/daily/pdf?date=${date.toISOString().slice(0, 10)}`, "_blank")}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    PDF Diario (AENA)
                  </button>
                  <button
                    onClick={() => window.open(`/api/export/daily/excel?date=${date.toISOString().slice(0, 10)}`, "_blank")}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Excel Diario
                  </button>
                  <div className="mx-2 my-1 border-t border-gray-100" />
                  <button
                    onClick={() => window.open("/api/export/blank-declaration", "_blank")}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Declaracion en blanco
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
              onClick={() => setShowQuickAdd(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-500 sm:px-4 sm:py-2 sm:text-sm"
            >
              + Nuevo vuelo
            </button>
          </div>
        </div>

        {/* Quick add form */}
        {showQuickAdd && (
          <QuickAddFlight
            date={date}
            onCreated={() => { setShowQuickAdd(false); fetchFlights(); addToast("Vuelo creado", undefined, "success"); }}
            onCancel={() => setShowQuickAdd(false)}
            onError={(msg) => addToast(msg, undefined, "warning")}
          />
        )}

        {/* Flight list */}
        {flights.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center">
            <p className="text-gray-500">
              {isToday ? "No hay vuelos para hoy." : "No hay datos para este dia."}
            </p>
            {isToday && !showQuickAdd && (
              <button
                onClick={() => setShowQuickAdd(true)}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                Crear primer vuelo
              </button>
            )}
          </div>
        ) : filteredFlights.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">Ningun vuelo coincide con la busqueda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFlights.map((flight) => (
              <div key={flight.id} id={`flight-${flight.id}`}>
                <FlightCard
                  flight={flight}
                  onUpdate={handleFlightUpdate}
                  onServiceToggle={handleServiceToggle}
                  onAddService={handleAddService}
                  onDeleteService={handleDeleteService}
                  onDelete={handleDeleteFlight}
                  onAddLostItem={handleAddLostItem}
                  onLostItemToggle={handleLostItemToggle}
                  onDeleteLostItem={handleDeleteLostItem}
                  isSelected={selectedFlightId === flight.id}
                  onSelect={setSelectedFlightId}
                  readOnly={false}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <ShiftHandover isOpen={showHandover} onClose={() => setShowHandover(false)} flights={flights} date={date} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
