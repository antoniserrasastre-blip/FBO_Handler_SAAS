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
import { SearchBar } from "@/components/SearchBar";
import { FilterToggleStrip } from "@/components/FilterToggleStrip";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { PendingServicesPanel } from "@/components/PendingServicesPanel";
import { QuickAddFlight } from "@/components/QuickAddFlight";
import { PassengerCrewModal } from "@/components/PassengerCrewModal";
import { useOverdueAlert } from "@/hooks/useOverdueAlert";
import { ShiftHandover } from "@/components/ShiftHandover";
import { HomeActionBar } from "@/components/HomeActionBar";
import { HelixButton, Stat, StatBand, useDate } from "@/components/helix";

import { dateToSqlString } from "@/lib/time";
import { shortDate } from "@/app/dia/diaHelpers";
import { isFlightPending } from "@/lib/pendingFilter";
import { flightWithinHours } from "@/lib/timeWindow";
import { isServiceOverdue } from "@/lib/overdue";

const PENDING_ONLY_KEY = "fbo:filters:pendingOnly";
// `NEXT_HOURS_KEY` reemplaza la antigua `NEXT_8H_KEY` ("1"/"0"). El chip ahora
// cicla entre 0 / 4 / 8 horas, así que persistimos el número en vez de un flag.
// Migración silenciosa desde la clave vieja en el efecto de rehidratación.
const NEXT_HOURS_KEY = "fbo:filters:nextHours";
const LEGACY_NEXT_8H_KEY = "fbo:filters:next8h";
const HIDE_CANCELLED_KEY = "fbo:filters:hideCancelled";

type NextHoursWindow = 0 | 4 | 8;

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
  const didAutoScrollRef = useRef<boolean>(false);

  // "Solo pendientes" + "Próximas 8h" + "Ocultar cancelados" — toggles que se
  // aplican EN CIMA del filtro de SearchBar (AND con la query). Se persisten en
  // localStorage para sobrevivir al refresco.
  const [pendingOnly, setPendingOnly] = useState<boolean>(false);
  const [nextHours, setNextHours] = useState<NextHoursWindow>(0);
  const [hideCancelled, setHideCancelled] = useState<boolean>(false);
  // Tick que se incrementa cada minuto cuando "Próximas Xh" está activo y es
  // hoy, para que un vuelo entre/salga de la ventana sin refresco manual.
  const [nowTick, setNowTick] = useState(0);

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

  // Rehidrata los toggles de filtro desde localStorage al montar.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(PENDING_ONLY_KEY) === "1") setPendingOnly(true);
      // Ventana temporal: lee la clave nueva; si no existe, migra desde la
      // antigua `fbo:filters:next8h` ("1" → 8) y la borra para limpiar.
      const rawNextHours = window.localStorage.getItem(NEXT_HOURS_KEY);
      if (rawNextHours === "4" || rawNextHours === "8") {
        setNextHours(Number(rawNextHours) as NextHoursWindow);
      } else if (rawNextHours === null) {
        const legacy = window.localStorage.getItem(LEGACY_NEXT_8H_KEY);
        if (legacy === "1") {
          setNextHours(8);
          window.localStorage.setItem(NEXT_HOURS_KEY, "8");
        }
        if (legacy !== null) window.localStorage.removeItem(LEGACY_NEXT_8H_KEY);
      }
      if (window.localStorage.getItem(HIDE_CANCELLED_KEY) === "1") setHideCancelled(true);
    } catch {
      // localStorage no disponible (modo privado, sandbox, etc.) — sin coste.
    }
  }, []);

  // Persiste los toggles cuando cambian.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PENDING_ONLY_KEY, pendingOnly ? "1" : "0");
    } catch {
      // ignore
    }
  }, [pendingOnly]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(NEXT_HOURS_KEY, String(nextHours));
    } catch {
      // ignore
    }
  }, [nextHours]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(HIDE_CANCELLED_KEY, hideCancelled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [hideCancelled]);

  const allServices = useMemo(() => flights.flatMap((f) => f.services || []), [flights]);
  const overdueCount = useOverdueAlert(allServices, soundEnabled && isToday);

  const fetchFlights = useCallback(async () => {
    try {
      // Use helper to send clean YYYY-MM-DD
      const dateStr = dateToSqlString(date);
      const res = await fetch(`/api/flights?date=${dateStr}&include=people`);
      if (res.ok) {
        const data = await res.json();
        // Lista = operaciones del día. Ocultamos visits cuyo arrivalDate y
        // departureDate no coincidan con el día seleccionado (p. ej. pernoctas
        // en su día intermedio sin movimiento, u órfanos sin fechas).
        const dayStr = shortDate(date);
        const todayOnly = (data.flights as FlightWithRelations[]).filter((f) => {
          const arr = f.arrivalDate ? f.arrivalDate.slice(0, 5) : null;
          const dep = f.departureDate ? f.departureDate.slice(0, 5) : null;
          return arr === dayStr || dep === dayStr;
        });
        setFlights(todayOnly);
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

  useEventStream({
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

  // Re-evalúa "Próximas Xh" cada minuto cuando el filtro está activo y es hoy,
  // para que un vuelo entre/salga de la ventana ±Xh sin refresco manual.
  useEffect(() => {
    if (!isToday || nextHours === 0) return;
    const interval = setInterval(() => setNowTick((t) => t + 1), 60000);
    return () => clearInterval(interval);
  }, [isToday, nextHours]);

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

  // Vista final: filteredFlights (SearchBar) ∩ pendingOnly ∩ nextHours (si hoy)
  // ∩ hideCancelled. Definida antes del handler de teclado para que
  // `list = visibleFlights` en las flechas arriba/abajo recorra exactamente lo
  // que se está pintando.
  const visibleFlights = useMemo(() => {
    let xs = filteredFlights;
    if (pendingOnly) xs = xs.filter(isFlightPending);
    if (nextHours > 0 && isToday) xs = xs.filter((f) => flightWithinHours(f, nextHours));
    if (hideCancelled) xs = xs.filter((f) => f.flightCategory !== "CANCELLED");
    return xs;
    // `nowTick` fuerza recálculo cada minuto cuando el filtro está activo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredFlights, pendingOnly, nextHours, hideCancelled, isToday, nowTick]);

  // Auto-scroll al primer vuelo activo en la primera carga
  useEffect(() => {
    if (didAutoScrollRef.current) return;
    if (!visibleFlights.length) return;

    const now = new Date();
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();

    const parseHHMM = (s: string | null | undefined): number | null => {
      if (!s) return null;
      const m = s.match(/^(\d{1,2}):(\d{2})$/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
    };

    const target = visibleFlights.find((f) => {
      if (f.state === "OFF_BLOCKS") return false;
      const ref = parseHHMM(f.etd) ?? parseHHMM(f.eta);
      if (ref === null) return true;
      return ref >= nowMin - 30;
    });

    if (!target) return;

    const id = window.setTimeout(() => {
      const el = document.getElementById(`flight-${target.id}`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const inView = rect.top >= 0 && rect.top <= window.innerHeight - 100;
      if (inView) {
        didAutoScrollRef.current = true;
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      didAutoScrollRef.current = true;
    }, 100);

    return () => window.clearTimeout(id);
  }, [visibleFlights]);

  // Seleccionar y enfocar el card de un vuelo desde alertas/stats. Si el vuelo
  // no está en `visibleFlights` por culpa de los filtros activos, los limpiamos
  // (con un toast informativo) y diferimos el scroll un frame para que React
  // re-renderice la lista antes de buscar el elemento.
  const focusFlight = useCallback((flightId: string) => {
    const visible = visibleFlights.some((f) => f.id === flightId);
    if (!visible) {
      const inFlights = flights.some((f) => f.id === flightId);
      if (!inFlights) {
        // Defensa por si la alerta se computó sobre flights pero algo cambió:
        // abrimos la vista de detalle como fallback.
        router.push(`/dia?flight=${flightId}`);
        return;
      }
      if (searchQuery) setSearchQuery("");
      if (pendingOnly) setPendingOnly(false);
      if (nextHours > 0) setNextHours(0);
      if (hideCancelled) setHideCancelled(false);
      addToast("Filtros desactivados para mostrar el vuelo", undefined, "info");
    }
    setSelectedFlightId(flightId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`flight-${flightId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [visibleFlights, flights, searchQuery, pendingOnly, nextHours, hideCancelled, addToast, router]);

  // Keyboard shortcuts (after handlers are defined)
  useEffect(() => {
    const FUEL_CYCLE: Record<string, string> = { NOT_REQUESTED: "REQUESTED", REQUESTED: "SERVED", SERVED: "NOT_REQUESTED" };
    const TOILET_CYCLE: Record<string, string> = { NOT_REQUESTED: "REQUESTED", REQUESTED: "COMPLETED", COMPLETED: "NOT_REQUESTED" };
    const SVC_NEXT: Record<string, string> = { PENDING: "ARRIVED", ARRIVED: "DELIVERED" };

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const list = visibleFlights;
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
  }, [visibleFlights, selectedFlightId]);

  const handleExport = (type: "flights" | "services") => {
    const dateStr = date.toISOString().slice(0, 10);
    window.open(`/api/export?date=${dateStr}&type=${type}`, "_blank");
  };

  // --- Movement counts for the selected day ---
  const movementStats = useMemo(() => {
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

  // Counts sobre la lista COMPLETA (pre-búsqueda) para los badges del strip.
  // Así el usuario sabe qué hay aunque tenga la búsqueda activa.
  const pendingCount = useMemo(
    () => flights.filter(isFlightPending).length,
    [flights],
  );
  // Count for the time-window chip. Cuando el chip está apagado (`nextHours===0`)
  // mostramos el conteo que tendría con 8h, así el usuario ve "qué pasaría si
  // lo enciendo" antes de hacer clic. Cuando está activo, refleja la ventana real.
  const nextHoursCount = useMemo(
    () => flights.filter((f) => flightWithinHours(f, nextHours === 0 ? 8 : nextHours)).length,
    // `nowTick` fuerza recálculo cada minuto cuando el filtro está activo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flights, nextHours, nowTick],
  );

  const togglesActive = pendingOnly || (nextHours > 0 && isToday);

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
              visibleFlights.length === flights.length
                ? flights.length
                : `${visibleFlights.length} / ${flights.length}`
            }
            sub={visibleFlights.length === flights.length ? "del día" : "filtrados"}
          />
          <Stat label="Llegadas" value={movementStats.arrivals} />
          <Stat label="Salidas" value={movementStats.departures} />
          {overdueCount > 0 ? (
            <Stat
              label="Retrasados"
              value={overdueCount}
              sub={overdueCount === 1 ? "vuelo" : "vuelos"}
              tone="alert"
              onClick={() => {
                const overdue = flights.find((f) =>
                  (f.services || []).some(isServiceOverdue),
                );
                if (overdue) focusFlight(overdue.id);
              }}
            />
          ) : null}
        </StatBand>
      )}

      {isToday && <TurnaroundAlerts flights={flights} referenceDate={date} onSelectFlight={focusFlight} />}

      <PendingServicesPanel flights={flights} onQuickFilter={setSearchQuery} />

      <main className="mx-auto max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
        <div className="print-header">
          MALLORCAIR FBO — Orden del dia {date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        {/* Filter toggles — pendingOnly + nextHours + hideCancelled, capa AND sobre SearchBar. */}
        {flights.length > 0 && (
          <FilterToggleStrip
            pendingOnly={pendingOnly}
            nextHours={nextHours}
            hideCancelled={hideCancelled}
            showNextHours={isToday}
            pendingCount={pendingCount}
            nextHoursCount={nextHoursCount}
            hideCancelledCount={flights.filter((f) => f.flightCategory === "CANCELLED").length}
            onChange={({ pendingOnly: nextPending, nextHours: nextWindow, hideCancelled: nextHideCancelled }) => {
              setPendingOnly(nextPending);
              setNextHours(nextWindow);
              setHideCancelled(nextHideCancelled);
            }}
          />
        )}

        {/* Search bar */}
        {flights.length > 0 && (
          <SearchBar
            flights={flights}
            onFilteredFlights={setFilteredFlights}
            resultCount={visibleFlights.length}
            totalCount={flights.length}
            inputRef={searchInputRef}
            query={searchQuery}
            onQueryChange={setSearchQuery}
          />
        )}

        {/* Action bar — secondary actions colapsan a un kebab en móvil. */}
        <HomeActionBar
          hasFlights={flights.length > 0}
          overdueCount={overdueCount}
          soundEnabled={soundEnabled}
          date={date}
          onPrint={() => window.print()}
          onHandover={() => setShowHandover(true)}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          onExport={handleExport}
          onImport={() => router.push("/import")}
          onNewFlight={() => setShowQuickAdd(true)}
        />

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
        ) : visibleFlights.length === 0 ? (
          <div className="rounded-hx-md border border-dashed border-line p-8 text-center">
            <p className="text-sm italic text-ink-muted">
              {filteredFlights.length === 0
                ? "Ningún vuelo coincide con la búsqueda."
                : togglesActive
                ? "Ningún vuelo coincide con los filtros activos."
                : "Ningún vuelo coincide con la búsqueda."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleFlights.map((flight) => {
              const ppl = people[flight.id];
              return (
                <div key={flight.id} id={`flight-${flight.id}`}>
                  <VisitCard
                    flight={flight}
                    sheetDate={shortDate(date)}
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
