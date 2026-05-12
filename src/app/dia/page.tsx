"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { palmaDayUtc, dateToSqlString } from "@/lib/time";
import { useEventStream } from "@/hooks/useEventStream";
import { ChevronLeft, ChevronRight, Maximize2, PlaneLanding, ParkingSquare, PlaneTakeoff, Plane, AlertTriangle } from "lucide-react";
import { QuickTimeEdit } from "@/components/QuickTimeEdit";
import { InlineTextEdit } from "@/components/InlineTextEdit";
import {
  deriveATA,
  deriveATD,
  computeHeaderStats,
  STATE_DOT_CLASS,
  arrivalSegmentState,
  departureSegmentState,
  SEGMENT_CELL_CLASS,
  shortDate,
  type FlightLite,
} from "./diaHelpers";
import { FlightDetailPanel } from "./FlightDetailPanel";
import { PassengerCrewModal } from "@/components/PassengerCrewModal";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

const LIVE_PHASE_UI: Record<string, { label: string; cls: string; Icon: typeof Plane }> = {
  APPROACHING: { label: "APROX", cls: "bg-sky-100 text-sky-700 animate-pulse", Icon: PlaneLanding },
  LANDED:      { label: "ATERR", cls: "bg-amber-100 text-amber-700 animate-pulse", Icon: PlaneLanding },
  ON_BLOCKS:   { label: "PARK",  cls: "bg-emerald-100 text-emerald-700", Icon: ParkingSquare },
  DEPARTED:    { label: "DESPG", cls: "bg-gray-100 text-gray-500", Icon: PlaneTakeoff },
};

const STALE_LIVE_MS = 10 * 60 * 1000;

// ─── Cycle orders for inline F / T toggles ─────────────────────────────────
const FUEL_CYCLE = ["NOT_REQUESTED", "REQUESTED", "SERVED"] as const;
const TOILET_CYCLE = ["NOT_REQUESTED", "REQUESTED", "COMPLETED"] as const;

function nextInCycle<T extends readonly string[]>(arr: T, current: string): T[number] {
  const i = arr.indexOf(current as T[number]);
  return arr[(i + 1) % arr.length];
}

export default function DiaPage() {
  const { status } = useSession();
  const router = useRouter();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [date, setDate] = useState(() => palmaDayUtc());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [paxCrewModal, setPaxCrewModal] = useState<{ flightId: string; direction: "ARRIVAL" | "DEPARTURE" } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const fetchFlights = useCallback(async () => {
    try {
      const dateStr = dateToSqlString(date);
      const res = await fetch(`/api/flights?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setFlights(data.flights);
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (status === "authenticated") fetchFlights();
  }, [status, fetchFlights]);

  useEventStream({ onEvent: () => fetchFlights(), enabled: status === "authenticated" });

  // Esc closes the side panel
  useEffect(() => {
    if (!selectedFlightId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedFlightId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedFlightId]);

  /** Optimistic PATCH — updates local state immediately, rolls back on failure. */
  const patchFlight = useCallback(async (id: string, data: Partial<Flight>) => {
    setFlights((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
    try {
      const res = await fetch(`/api/flights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`PATCH ${res.status}`);
      // Re-fetch to get any server-side derivations (auto-transitions etc.)
      fetchFlights();
    } catch (e) {
      console.error("[dia] patch failed", e);
      fetchFlights(); // roll back
    }
  }, [fetchFlights]);

  // Mantenemos el orden que devuelve el API (cronologico por primer evento del
  // dia, igual que la vista de tarjetas). El tablon es una "hoja del dia" —
  // su orden es estable; el progreso se ve por color de celdas, no moviendo
  // filas. Esto evita la sensacion de que un vuelo "desaparece" al despachar.

  const stats = useMemo(
    () => computeHeaderStats(flights as unknown as FlightLite[], date, now),
    [flights, date, now],
  );

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedFlightId) ?? null,
    [flights, selectedFlightId],
  );

  const formatTime = (d: Date, tz?: string) =>
    d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });

  if (status === "loading" || loading) {
    return <div className="flex h-screen items-center justify-center bg-[#1a1a1a] text-white">Cargando Tablon...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-[#f0f0f0] text-sm font-sans select-none">
      {/* HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-2 bg-[#2c3e50] px-4 py-2 text-white shadow-md">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight text-blue-300 leading-tight">MALLORCAIR</h1>
            <span className="text-[10px] uppercase tracking-widest text-blue-100/50">Operations Dashboard</span>
          </div>

          <div className="h-8 w-[1px] bg-white/10" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(date);
                d.setUTCDate(d.getUTCDate() - 1);
                setDate(d);
              }}
              className="hover:text-blue-300"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="font-mono text-lg font-medium">
              {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase()}
            </span>
            <button
              onClick={() => {
                const d = new Date(date);
                d.setUTCDate(d.getUTCDate() + 1);
                setDate(d);
              }}
              className="hover:text-blue-300"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-8 font-mono">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-blue-200/60 uppercase">Local Palma</span>
            <span className="text-xl font-bold leading-none">{formatTime(now, "Europe/Madrid")}</span>
          </div>
          <div className="flex flex-col items-center border-l border-white/10 pl-8 text-yellow-400">
            <span className="text-[10px] text-yellow-400/60 uppercase">Zulu Time</span>
            <span className="text-xl font-bold leading-none">{formatTime(now, "UTC")}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs uppercase font-medium">
          <span className="rounded bg-blue-900/50 px-2 py-1 border border-blue-400/30">LLEG: {stats.arrivals}</span>
          <span className="rounded bg-orange-900/50 px-2 py-1 border border-orange-400/30">SAL: {stats.departures}</span>
          {stats.approaching > 0 && (
            <span className="rounded bg-sky-700/60 px-2 py-1 border border-sky-300/40 animate-pulse">
              <PlaneLanding size={11} className="inline mb-0.5 mr-1" />{stats.approaching} aprox
            </span>
          )}
          {stats.pendingDepServices > 0 && (
            <span className="rounded bg-yellow-700/60 px-2 py-1 border border-yellow-300/40">{stats.pendingDepServices} pend.</span>
          )}
          {stats.alerts > 0 && (
            <span className="rounded bg-red-700/70 px-2 py-1 border border-red-300/40 animate-pulse">
              <AlertTriangle size={11} className="inline mb-0.5 mr-1" />{stats.alerts} alerta
            </span>
          )}
          <button onClick={() => router.push("/")} className="rounded bg-gray-700 p-1.5 hover:bg-gray-600" title="Volver a tarjetas">
            <Maximize2 size={16} />
          </button>
        </div>
      </header>

      {/* MAIN: tabla + panel */}
      <main className="flex flex-1 overflow-hidden">
        {/* TABLE */}
        <div className="flex-1 overflow-auto bg-white p-1">
          <table className="w-full border-collapse border-spacing-0 text-[13px]">
            <thead className="sticky top-0 z-20 bg-[#ecf0f1] text-[#34495e] shadow-sm">
              <tr>
                <th className="border border-gray-300 p-1 font-bold w-8">ST</th>
                <th className="border border-gray-300 p-1 font-bold w-16">LIVE</th>
                <th colSpan={4} className="border border-gray-300 bg-blue-50 p-1 font-bold text-blue-800">LLEGADA</th>
                <th colSpan={3} className="border border-gray-300 bg-gray-100 p-1 font-bold text-gray-800">AVION / PARKING</th>
                <th colSpan={3} className="border border-gray-300 bg-yellow-50 p-1 font-bold text-yellow-800">SVC</th>
                <th colSpan={4} className="border border-gray-300 bg-orange-50 p-1 font-bold text-orange-800">SALIDA</th>
                <th className="border border-gray-300 bg-gray-50 p-1 font-bold">PAX / CREW</th>
              </tr>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <th className="border border-gray-300 p-1 w-6"></th>
                <th className="border border-gray-300 p-1 w-16"></th>
                <th className="border border-gray-300 p-1 w-24">Vuelo</th>
                <th className="border border-gray-300 p-1 w-16">Origen</th>
                <th className="border border-gray-300 p-1 w-16">ETA (Z)</th>
                <th className="border border-gray-300 p-1 w-16">ATA (Z)</th>
                <th className="border border-gray-300 p-1 w-28">Matricula</th>
                <th className="border border-gray-300 p-1 w-16">Tipo</th>
                <th className="border border-gray-300 p-1 w-16">Stand</th>
                <th className="border border-gray-300 p-1 w-8" title="Fuel">F</th>
                <th className="border border-gray-300 p-1 w-8" title="Catering">C</th>
                <th className="border border-gray-300 p-1 w-8" title="Toilet">T</th>
                <th className="border border-gray-300 p-1 w-24">Vuelo</th>
                <th className="border border-gray-300 p-1 w-16">Destino</th>
                <th className="border border-gray-300 p-1 w-16">ETD (Z)</th>
                <th className="border border-gray-300 p-1 w-16">ATD (Z)</th>
                <th className="border border-gray-300 p-1">P | C</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((f) => {
                const lite = f as unknown as FlightLite;
                const arrSeg = arrivalSegmentState(lite, date, now);
                const depSeg = departureSegmentState(lite, date, now);
                const arrCls = arrSeg ? SEGMENT_CELL_CLASS[arrSeg] : "";
                const depCls = depSeg ? SEGMENT_CELL_CLASS[depSeg] : "";
                const ata = deriveATA(lite);
                const atd = deriveATD(lite);
                const live = f.livePhase ? LIVE_PHASE_UI[f.livePhase] : null;
                const liveStale =
                  f.liveLastSeenAt && Date.now() - new Date(f.liveLastSeenAt).getTime() > STALE_LIVE_MS;
                const showLive = live && !liveStale;
                const dotClass = STATE_DOT_CLASS[f.state] ?? "bg-gray-300";
                const isSelected = selectedFlightId === f.id;
                const paxArr = f.paxArrivalReal ?? f.paxArrival;
                const paxDep = f.paxDepartureReal ?? f.paxDeparture;
                const crewArr = f.crewArrivalReal ?? f.crewArrival;
                const crewDep = f.crewDepartureReal ?? f.crewDeparture;

                return (
                  <tr
                    key={f.id}
                    onClick={() => setSelectedFlightId(isSelected ? null : f.id)}
                    className={`group cursor-pointer border-b border-gray-200 transition-colors hover:bg-blue-50/30 ${isSelected ? "outline outline-2 outline-blue-500 outline-offset-[-2px]" : ""}`}
                  >
                    <td className="border border-gray-200 p-1 text-center">
                      <div className={`mx-auto h-3 w-3 rounded-full shadow-inner ${dotClass}`} title={f.state} />
                    </td>

                    <td className="border border-gray-200 p-0 text-center">
                      {showLive && live ? (
                        <div className={`mx-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${live.cls}`}>
                          <live.Icon size={9} />{live.label}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-[10px]">—</span>
                      )}
                    </td>

                    {/* LLEGADA — siempre se renderiza si hay ETA. El color tiñe past/future/done/overdue. */}
                    {arrSeg ? (
                      <>
                        <td className={`border border-gray-200 p-1 px-2 font-bold ${arrCls || "text-blue-700"}`}>{f.callsign}</td>
                        <td className={`border border-gray-200 p-1 text-center font-mono ${arrCls}`}>{f.origin || "—"}</td>
                        <td className={`border border-gray-200 p-1 text-center font-mono font-medium ${arrCls}`}>
                          <div className="flex flex-col items-center leading-tight">
                            <QuickTimeEdit value={f.eta} onSave={(v) => patchFlight(f.id, { eta: v })} />
                            <DateSubscript date={f.arrivalDate} viewDay={date} />
                          </div>
                        </td>
                        <td className={`border border-gray-200 p-1 text-center font-mono ${arrCls || (ata ? "text-emerald-700 font-semibold" : "text-gray-300")}`}>
                          <QuickTimeEdit
                            value={ata}
                            onSave={(v) => patchFlight(f.id, { ata: v || null })}
                            placeholder="--:--"
                          />
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="border border-gray-200 bg-gray-50 p-1 text-center text-[11px] text-gray-300 italic">sin llegada</td>
                    )}

                    {/* AVION */}
                    <td className="border border-gray-200 p-1 px-2 text-center bg-gray-50/50">
                      <span className="rounded bg-white border border-gray-300 px-2 py-0.5 font-mono font-bold tracking-tight shadow-sm">{f.registration}</span>
                    </td>
                    <td className="border border-gray-200 p-1 text-center font-mono text-gray-600">{f.aircraftType}</td>
                    <td className="border border-gray-200 p-1 text-center bg-gray-50/50">
                      <InlineTextEdit
                        value={f.parking || ""}
                        onSave={(v) => patchFlight(f.id, { parking: v || null })}
                        placeholder="tbd"
                        stopPropagation
                        className={`font-mono font-bold ${f.parking ? "text-gray-900" : "text-gray-300 italic text-xs"}`}
                        inputClassName="w-12 text-center font-mono"
                      />
                    </td>

                    {/* SERVICIOS — F y T inline cycle, C abre panel (Phase 4) */}
                    <FuelCell
                      state={f.fuelState}
                      onCycle={(e) => {
                        e.stopPropagation();
                        patchFlight(f.id, { fuelState: nextInCycle(FUEL_CYCLE, f.fuelState) });
                      }}
                    />
                    <CateringCell
                      flight={f}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFlightId(f.id); // open panel to manage catering
                      }}
                    />
                    <ToiletCell
                      state={f.toiletState}
                      onCycle={(e) => {
                        e.stopPropagation();
                        patchFlight(f.id, { toiletState: nextInCycle(TOILET_CYCLE, f.toiletState) });
                      }}
                    />

                    {/* SALIDA — mismo tratamiento de tinte por estado */}
                    {depSeg ? (
                      <>
                        <td className={`border border-gray-200 p-1 px-2 font-bold ${depCls || "text-orange-700"}`}>{f.callsign}</td>
                        <td className={`border border-gray-200 p-1 text-center font-mono ${depCls}`}>{f.destination || "—"}</td>
                        <td className={`border border-gray-200 p-1 text-center font-mono font-medium ${depCls}`}>
                          <div className="flex flex-col items-center leading-tight">
                            <QuickTimeEdit value={f.etd} onSave={(v) => patchFlight(f.id, { etd: v })} />
                            <DateSubscript date={f.departureDate} viewDay={date} />
                          </div>
                        </td>
                        <td className={`border border-gray-200 p-1 text-center font-mono ${depCls || (atd ? "text-emerald-700 font-semibold" : "text-gray-300")}`}>
                          <QuickTimeEdit
                            value={atd}
                            onSave={(v) => patchFlight(f.id, { atd: v || null })}
                            placeholder="--:--"
                          />
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="border border-gray-200 bg-gray-50 p-1 text-center text-[11px] text-gray-300 italic">sin salida</td>
                    )}

                    {/* PAX / CREW */}
                    <td className="border border-gray-200 p-1 text-center whitespace-nowrap bg-gray-50/30">
                      <span className="text-gray-800 font-medium">P: {paxArr}/{paxDep}</span>
                      <span className="mx-2 text-gray-300">|</span>
                      <span className="text-gray-500">C: {crewArr}/{crewDep}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {flights.length === 0 && (
            <div className="p-12 text-center text-gray-400 italic">No hay vuelos registrados para este dia.</div>
          )}
        </div>

        {/* PANEL DETALLE — solo cuando hay seleccion */}
        {selectedFlight && (
          <FlightDetailPanel
            flight={selectedFlight}
            onClose={() => setSelectedFlightId(null)}
            onMutated={fetchFlights}
            onOpenPaxCrew={(direction) => setPaxCrewModal({ flightId: selectedFlight.id, direction })}
            onDeleted={() => {
              setSelectedFlightId(null);
              fetchFlights();
            }}
          />
        )}
      </main>

      {/* PassengerCrewModal montado fuera del flex para que no afecte al layout */}
      {paxCrewModal && selectedFlight && (
        <PassengerCrewModal
          isOpen={true}
          onClose={() => { setPaxCrewModal(null); fetchFlights(); }}
          flightId={paxCrewModal.flightId}
          direction={paxCrewModal.direction}
          flightLabel={`${selectedFlight.callsign} (${selectedFlight.registration})`}
        />
      )}

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-300 px-4 py-1 text-[11px] text-gray-500 flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-emerald-100 border border-emerald-300" /> hecho ✓</span>
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-red-100 border border-red-300" /> retrasado</span>
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-slate-200 border border-slate-300" /> dia anterior</span>
          <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-indigo-100 border border-indigo-300" /> dia siguiente</span>
          <span className="ml-3 text-gray-400">El orden no cambia durante el dia — el color marca lo hecho como un highlighter sobre la hoja impresa</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Subscript de fecha — solo cuando la fecha del segmento difiere del dia visualizado ─

function DateSubscript({ date, viewDay }: { date: string | null; viewDay: Date }) {
  if (!date) return null;
  const head = date.slice(0, 5); // "DD/MM"
  if (head === shortDate(viewDay)) return null; // mismo dia → no ruido
  return (
    <span className="mt-0.5 text-[9px] text-current opacity-60 font-sans">{date}</span>
  );
}

// ─── Service cells ─────────────────────────────────────────────────────────

function ServiceCellShell({ children, onClick, title, tone }: {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  title: string;
  tone: string;
}) {
  return (
    <td className="border border-gray-200 p-0 text-center w-8 h-8">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`flex h-full w-full items-center justify-center font-bold border-b-2 transition-colors ${tone}`}
      >
        {children}
      </button>
    </td>
  );
}

function FuelCell({ state, onCycle }: { state: string; onCycle: (e: React.MouseEvent) => void }) {
  const tone =
    state === "SERVED" ? "bg-green-500 text-white border-green-600 hover:bg-green-600" :
    state === "REQUESTED" ? "bg-yellow-400 text-yellow-900 border-yellow-500 animate-pulse hover:bg-yellow-500" :
    "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200";
  return (
    <ServiceCellShell onClick={onCycle} title={`Fuel: ${state} (click para avanzar)`} tone={tone}>F</ServiceCellShell>
  );
}

function ToiletCell({ state, onCycle }: { state: string; onCycle: (e: React.MouseEvent) => void }) {
  const tone =
    state === "COMPLETED" ? "bg-green-500 text-white border-green-600 hover:bg-green-600" :
    state === "REQUESTED" ? "bg-yellow-400 text-yellow-900 border-yellow-500 animate-pulse hover:bg-yellow-500" :
    "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200";
  return (
    <ServiceCellShell onClick={onCycle} title={`Toilet: ${state} (click para avanzar)`} tone={tone}>T</ServiceCellShell>
  );
}

function CateringCell({ flight, onClick }: { flight: FlightWithRelations; onClick: (e: React.MouseEvent) => void }) {
  const cat = flight.services.find((s) => s.type === "CATERING");
  const state = cat?.state ?? "NONE";
  const tone =
    state === "DELIVERED" ? "bg-green-500 text-white border-green-600 hover:bg-green-600" :
    state === "ARRIVED" ? "bg-yellow-400 text-yellow-900 border-yellow-500 animate-pulse hover:bg-yellow-500" :
    state === "PENDING" ? "bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200" :
    "bg-gray-50 text-gray-200 border-transparent hover:bg-gray-100";
  return (
    <ServiceCellShell onClick={onClick} title={cat ? `Catering: ${state} (click para gestionar)` : "Sin catering — click para añadir en el panel"} tone={tone}>C</ServiceCellShell>
  );
}
