"use client";

import { Suspense, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flight, Service, EventLog, LostItem } from "@/types/compat";
import { DaySummary } from "@/components/DaySummary";
import { VisitCard } from "@/components/VisitCard";
import { TurnaroundAlerts } from "@/components/TurnaroundAlert";
import { ToastContainer, ToastMessage } from "@/components/Toast";
import { useEventStream } from "@/hooks/useEventStream";
import { FlightEvent } from "@/lib/events";
import { ChevronDown } from "@/components/Icons";
import { SearchBar } from "@/components/SearchBar";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { PendingServicesPanel } from "@/components/PendingServicesPanel";
import { QuickAddFlight } from "@/components/QuickAddFlight";
import { PassengerCrewModal } from "@/components/PassengerCrewModal";
import { useOverdueAlert } from "@/hooks/useOverdueAlert";
import { Volume2, VolumeX, FileCheck2, Printer } from "lucide-react";
import { ShiftHandover } from "@/components/ShiftHandover";
import { detectParkingConflicts } from "@/lib/parkingConflicts";
import { HelixButton, Stat, StatBand, useDate } from "@/components/helix";

import { dateToSqlString } from "@/lib/time";

export const dynamic = "force-dynamic";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

// Side-channel of decrypted people for VisitCard, keyed by visitId.
type PeopleByVisit = Record<
  string,
  {
    passengers: Array<{ id: string; fullName: string; direction: string; nationality?: string | null; passportNumber: string | null; status: string; verified: boolean }>;
    crew: Array<{ id: string; fullName: string; direction: string; role: string; passportNumber: string | null; nationality?: string | null }>;
    paxSource: string | null;
  }
>;

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [filteredFlights, setFilteredFlights] = useState<FlightWithRelations[]>([]);
  const [people, setPeople] = useState<PeopleByVisit>({});
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [showHandover, setShowHandover] = useState(false);
  const [peopleModal, setPeopleModal] = useState<{ visitId: string; direction: "ARRIVAL" | "DEPARTURE" } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  // Operations date is owned by the global Helix header via the URL (?d=).
  const { date, isToday, setDate } = useDate();

  // Compat: /historico parks the date it wants to view in sessionStorage,
  // then router.push("/"). Pick that up and translate it into the URL so the
  // header reflects the right day.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const viewDate = sessionStorage.getItem("viewDate");
    if (!viewDate) return;
    sessionStorage.removeItem("viewDate");
    setDate(new Date(viewDate));
  }, [setDate]);

  const allServices = useMemo(() => flights.flatMap((f) => f.services || []), [flights]);
  const overdueCount = useOverdueAlert(allServices, soundEnabled && isToday);
  const parkingConflicts = useMemo(() => detectParkingConflicts(flights), [flights]);

  const fetchFlights = useCallback(async () => {
    try {
      // Use helper to send clean YYYY-MM-DD
      const dateStr = dateToSqlString(date);
      const res = await fetch(`/api/flights?date=${dateStr}&include=people`);
      if (res.ok) {
        const data = await res.json();
        setFlights(data.flights);
        setPeople(data.people || {});
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

  // Clear list + show loading on date change so we don't display stale rows.
  useEffect(() => {
    setFlights([]);
    setLoading(true);
  }, [date]);

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
        services: (f.services || []).map((s) =>
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
      if (res.ok) {
        fetchFlights();
        addToast(`Servicio anadido`, undefined, "success");
      } else addToast("Error al anadir servicio", undefined, "warning", () => handleAddService(flightId, type, customName, reference, target));
    } catch {
      addToast("Sin conexion — servicio no anadido", undefined, "warning", () => handleAddService(flightId, type, customName, reference, target));
    }
  };

  const handleDeleteFlight = async (id: string) => {
    try {
      const res = await fetch(`/api/flights/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchFlights();
        addToast("Vuelo eliminado", undefined, "success");
      } else addToast("Error al eliminar vuelo", undefined, "warning");
    } catch {
      addToast("Sin conexion — vuelo no eliminado", undefined, "warning");
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    try {
      const res = await fetch(`/api/services/${serviceId}`, { method: "DELETE" });
      if (res.ok) {
        fetchFlights();
        addToast("Servicio eliminado", undefined, "success");
      } else addToast("Error al eliminar servicio", undefined, "warning");
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
      if (res.ok) {
        fetchFlights();
        addToast(`Objeto registrado: ${description}`, undefined, "success");
      } else addToast("Error al registrar objeto", undefined, "warning");
    } catch {
      addToast("Sin conexion — objeto no registrado", undefined, "warning");
    }
  };

  const handleLostItemToggle = async (itemId: string, newState: string) => {
    setFlights((prev) =>
      prev.map((f) => ({
        ...f,
        lostItems: (f.lostItems || []).map((li) =>
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
            const catering = (selected.services || []).find((s) => s.type === "CATERING" && SVC_NEXT[s.state]);
            if (catering) handleServiceToggle(catering.id, SVC_NEXT[catering.state]);
          }
          break;
        case "s":
        case "S":
          if (selected) {
            const svc = (selected.services || []).find((s) => SVC_NEXT[s.state]);
            if (svc) handleServiceToggle(svc.id, SVC_NEXT[svc.state]);
          }
          break;
        case "/":
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case "n":
        case "N":
          if (!showQuickAdd) {
            e.preventDefault();
            setShowQuickAdd(true);
          }
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

  // --- Movement counts for the selected day ---
  const movementStats = useMemo(() => {
    const dateStr = date.toISOString().slice(0, 10);
    const day = date.getUTCDate();
    const month = date.getUTCMonth() + 1;
    const shortDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;

    let arrivals = 0;
    let departures = 0;

    flights.forEach((f) => {
      // It's an arrival today if arrivalDate matches shortDate OR if arrivalDate is missing (assumed today)
      // but only if it actually has an ETA
      if (f.eta && (!f.arrivalDate || f.arrivalDate === shortDate)) {
        arrivals++;
      }
      // It's a departure today if departureDate matches shortDate OR if departureDate is missing (assumed today)
      // but only if it actually has an ETD
      if (f.etd && (!f.departureDate || f.departureDate === shortDate)) {
        departures++;
      }
    });

    return { arrivals, departures };
  }, [flights, date]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center text-ink-3">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-96px)] bg-bg">
      <DaySummary flights={flights} />

      {/* KPI band — replaces the gray "X aviones (Y + Z)" caption-as-heading. */}
      {flights.length > 0 && (
        <StatBand>
          <Stat
            label="Vuelos"
            value={
              filteredFlights.length === flights.length
                ? flights.length
                : `${filteredFlights.length} / ${flights.length}`
            }
            sub={filteredFlights.length === flights.length ? "del día" : "filtrados"}
          />
          <Stat label="Llegadas" value={movementStats.arrivals} />
          <Stat label="Salidas" value={movementStats.departures} />
          {overdueCount > 0 ? (
            <Stat
              label="Retrasados"
              value={overdueCount}
              sub={overdueCount === 1 ? "vuelo" : "vuelos"}
              tone="alert"
            />
          ) : null}
        </StatBand>
      )}

      {isToday && <TurnaroundAlerts flights={flights} />}

      <PendingServicesPanel flights={flights} onQuickFilter={setSearchQuery} />

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="print-header">
          MALLORCAIR FBO — Orden del dia {date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
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

        {/* Action bar — secondary actions are ghost (visually subordinate); only
            "Nuevo vuelo" is the primary CTA. */}
        <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5 sm:mb-4 sm:gap-2">
          {overdueCount > 0 && (
            <span className="hx-pill hx-pill-danger overdue-pulse mr-auto">
              ⚠ {overdueCount} retrasado{overdueCount !== 1 ? "s" : ""}
            </span>
          )}
          {flights.length > 0 && (
            <HelixButton variant="ghost" size="sm" onClick={() => window.print()} title="Imprimir hoja del día">
              <Printer size={14} /> Imprimir
            </HelixButton>
          )}
          {flights.length > 0 && (
            <HelixButton
              variant="ghost"
              size="sm"
              onClick={() => setShowHandover(true)}
              title="Resumen para pasar turno"
            >
              <FileCheck2 size={14} /> Traspaso
            </HelixButton>
          )}
          <HelixButton
            variant="ghost"
            size="icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Desactivar sonido" : "Activar sonido de alertas"}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </HelixButton>
          {flights.length > 0 && (
            <ExportMenu date={date} onExport={handleExport} />
          )}
          <HelixButton variant="secondary" size="sm" onClick={() => router.push("/import")}>
            Importar PDF
          </HelixButton>
          <HelixButton variant="primary" size="sm" onClick={() => setShowQuickAdd(true)}>
            + Nuevo vuelo
          </HelixButton>
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
          <div className="rounded-hx-md border border-dashed border-line p-12 text-center">
            <p className="text-ink-3">
              {isToday ? "No hay vuelos para hoy." : "No hay datos para este día."}
            </p>
            {isToday && !showQuickAdd && (
              <HelixButton
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => setShowQuickAdd(true)}
              >
                Crear primer vuelo
              </HelixButton>
            )}
          </div>
        ) : filteredFlights.length === 0 ? (
          <div className="rounded-hx-md border border-dashed border-line p-8 text-center">
            <p className="text-sm italic text-ink-muted">Ningún vuelo coincide con la búsqueda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFlights.map((flight) => {
              const ppl = people[flight.id];
              return (
                <div key={flight.id} id={`flight-${flight.id}`}>
                  <VisitCard
                    flight={flight}
                    passengers={ppl?.passengers || []}
                    crew={ppl?.crew || []}
                    paxSource={ppl?.paxSource || null}
                    isSelected={selectedFlightId === flight.id}
                    onSelect={setSelectedFlightId}
                    onUpdate={handleFlightUpdate}
                    onServiceToggle={handleServiceToggle}
                    onAddService={handleAddService}
                    onDeleteService={handleDeleteService}
                    onAddLostItem={handleAddLostItem}
                    onLostItemToggle={handleLostItemToggle}
                    onDeleteLostItem={handleDeleteLostItem}
                    onDelete={handleDeleteFlight}
                    onBadgeClick={setSearchQuery}
                    onOpenDetail={(id) => router.push(`/dia?flight=${id}`)}
                    onOpenPeople={(visitId, direction) => setPeopleModal({ visitId, direction })}
                    readOnly={false}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>

      <ShortcutsHelp isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <ShiftHandover isOpen={showHandover} onClose={() => setShowHandover(false)} flights={flights} date={date} />
      {peopleModal ? (
        (() => {
          const visit = flights.find((f) => f.id === peopleModal.visitId);
          return (
            <PassengerCrewModal
              isOpen
              onClose={() => {
                setPeopleModal(null);
                fetchFlights();
              }}
              flightId={peopleModal.visitId}
              direction={peopleModal.direction}
              flightLabel={visit ? `${visit.callsign} (${visit.registration})` : ""}
            />
          );
        })()
      ) : null}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function ExportMenu({
  date,
  onExport,
}: {
  date: Date;
  onExport: (type: "flights" | "services") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ymd = date.toISOString().slice(0, 10);
  const item =
    "block w-full px-4 py-2 text-left text-sm text-ink-2 hover:bg-bg-muted";

  return (
    <div className="relative" ref={ref}>
      <HelixButton
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Exportar <ChevronDown size={14} />
      </HelixButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-hx-md border border-line bg-bg py-1 shadow-hx-lg"
        >
          <button onClick={() => { onExport("flights"); setOpen(false); }} className={item}>
            Vuelos (CSV)
          </button>
          <button onClick={() => { onExport("services"); setOpen(false); }} className={item}>
            Servicios (CSV)
          </button>
          <div className="mx-2 my-1 border-t border-line-subtle" />
          <button
            onClick={() => { window.open(`/api/export/daily/pdf?date=${ymd}`, "_blank"); setOpen(false); }}
            className={item}
          >
            PDF Diario (AENA)
          </button>
          <button
            onClick={() => { window.open(`/api/export/daily/excel?date=${ymd}`, "_blank"); setOpen(false); }}
            className={item}
          >
            Excel Diario
          </button>
          <div className="mx-2 my-1 border-t border-line-subtle" />
          <button
            onClick={() => { window.open("/api/export/blank-declaration", "_blank"); setOpen(false); }}
            className={item}
          >
            Declaración en blanco
          </button>
        </div>
      )}
    </div>
  );
}
