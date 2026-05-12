"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { palmaDayUtc, dateToSqlString } from "@/lib/time";
import { useEventStream } from "@/hooks/useEventStream";
import { ChevronLeft, ChevronRight, Maximize2, PlaneLanding, ParkingSquare, PlaneTakeoff, Plane, AlertTriangle } from "lucide-react";
import {
  isArrivalToday,
  isDepartureToday,
  deriveATA,
  deriveATD,
  nextEventMinutes,
  rowUrgency,
  computeHeaderStats,
  STATE_DOT_CLASS,
  URGENCY_ROW_CLASS,
  type FlightLite,
} from "./diaHelpers";

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

export default function DiaPage() {
  const { status } = useSession();
  const router = useRouter();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [date, setDate] = useState(() => palmaDayUtc());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

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

  const sortedFlights = useMemo(() => {
    const lite = flights as unknown as FlightLite[];
    return [...flights]
      .map((f, i) => ({
        f,
        next: nextEventMinutes(lite[i], date, now),
        urgency: rowUrgency(lite[i], date, now),
      }))
      .sort((a, b) => {
        // Departed/terminados al final
        if (a.urgency === "departed" && b.urgency !== "departed") return 1;
        if (b.urgency === "departed" && a.urgency !== "departed") return -1;
        // Sin próximo evento al final del bloque activo
        if (a.next === null && b.next !== null) return 1;
        if (b.next === null && a.next !== null) return -1;
        if (a.next === null && b.next === null) return 0;
        return (a.next ?? 0) - (b.next ?? 0);
      });
  }, [flights, date, now]);

  const stats = useMemo(
    () => computeHeaderStats(flights as unknown as FlightLite[], date, now),
    [flights, date, now],
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
            <span className="rounded bg-sky-700/60 px-2 py-1 border border-sky-300/40 animate-pulse" title="Aviones acercandose ahora">
              <PlaneLanding size={11} className="inline mb-0.5 mr-1" />
              {stats.approaching} aprox
            </span>
          )}
          {stats.pendingDepServices > 0 && (
            <span className="rounded bg-yellow-700/60 px-2 py-1 border border-yellow-300/40" title="Vuelos con servicios de salida pendientes">
              {stats.pendingDepServices} pend.
            </span>
          )}
          {stats.alerts > 0 && (
            <span className="rounded bg-red-700/70 px-2 py-1 border border-red-300/40 animate-pulse" title="Vuelos con alerta de retraso o servicios sin terminar">
              <AlertTriangle size={11} className="inline mb-0.5 mr-1" />
              {stats.alerts} alerta
            </span>
          )}
          <button onClick={() => router.push("/")} className="rounded bg-gray-700 p-1.5 hover:bg-gray-600" title="Volver a tarjetas">
            <Maximize2 size={16} />
          </button>
        </div>
      </header>

      {/* TABLE */}
      <main className="flex-1 overflow-auto bg-white p-1">
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
            {sortedFlights.map(({ f, urgency }) => {
              const lite = f as unknown as FlightLite;
              const isArr = isArrivalToday(f, date);
              const isDep = isDepartureToday(f, date);
              const ata = deriveATA(lite);
              const atd = deriveATD(lite);
              const live = f.livePhase ? LIVE_PHASE_UI[f.livePhase] : null;
              const liveStale =
                f.liveLastSeenAt && Date.now() - new Date(f.liveLastSeenAt).getTime() > STALE_LIVE_MS;
              const showLive = live && !liveStale;

              const dotClass = STATE_DOT_CLASS[f.state] ?? "bg-gray-300";
              const rowClass = URGENCY_ROW_CLASS[urgency];

              const paxArr = f.paxArrivalReal ?? f.paxArrival;
              const paxDep = f.paxDepartureReal ?? f.paxDeparture;
              const crewArr = f.crewArrivalReal ?? f.crewArrival;
              const crewDep = f.crewDepartureReal ?? f.crewDeparture;

              return (
                <tr
                  key={f.id}
                  className={`group border-b border-gray-200 transition-colors hover:bg-blue-50/40 ${rowClass}`}
                >
                  <td className="border border-gray-200 p-1 text-center">
                    <div className={`mx-auto h-3 w-3 rounded-full shadow-inner ${dotClass}`} title={f.state} />
                  </td>

                  <td className="border border-gray-200 p-0 text-center">
                    {showLive && live ? (
                      <div
                        className={`mx-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${live.cls}`}
                        title={`OpenSky · ultima posicion ${f.liveLastSeenAt ? new Date(f.liveLastSeenAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "?"}`}
                      >
                        <live.Icon size={9} />
                        {live.label}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-[10px]">—</span>
                    )}
                  </td>

                  {/* LLEGADA */}
                  {isArr ? (
                    <>
                      <td className="border border-gray-200 p-1 px-2 font-bold text-blue-700">{f.callsign}</td>
                      <td className="border border-gray-200 p-1 text-center font-mono">{f.origin || "—"}</td>
                      <td className="border border-gray-200 p-1 text-center font-mono font-medium">{f.eta || "—"}</td>
                      <td className={`border border-gray-200 p-1 text-center font-mono ${ata ? "text-emerald-700 font-semibold" : "text-gray-300 italic text-[11px]"}`}>{ata ?? "--:--"}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="border border-gray-200 bg-gray-50 p-1 text-center text-[11px] text-gray-300 italic">
                      sin llegada hoy
                    </td>
                  )}

                  {/* AVION */}
                  <td className="border border-gray-200 p-1 px-2 text-center bg-gray-50/50">
                    <span className="rounded bg-white border border-gray-300 px-2 py-0.5 font-mono font-bold tracking-tight shadow-sm">
                      {f.registration}
                    </span>
                  </td>
                  <td className="border border-gray-200 p-1 text-center font-mono text-gray-600">{f.aircraftType}</td>
                  <td className="border border-gray-200 p-1 text-center bg-gray-50/50">
                    <span className={`font-mono font-bold text-lg leading-none ${f.parking ? "text-gray-900" : "text-gray-300 italic text-xs font-normal"}`}>
                      {f.parking || "tbd"}
                    </span>
                  </td>

                  {/* SERVICIOS */}
                  <ServiceCell state={f.fuelState === "SERVED" ? "DELIVERED" : f.fuelState === "REQUESTED" ? "ARRIVED" : "PENDING"} label="F" />
                  <ServiceCell state={getServiceState(f, "CATERING")} label="C" />
                  <ServiceCell state={f.toiletState === "COMPLETED" ? "DELIVERED" : f.toiletState === "REQUESTED" ? "ARRIVED" : "PENDING"} label="T" />

                  {/* SALIDA */}
                  {isDep ? (
                    <>
                      <td className="border border-gray-200 p-1 px-2 font-bold text-orange-700">{f.callsign}</td>
                      <td className="border border-gray-200 p-1 text-center font-mono">{f.destination || "—"}</td>
                      <td className="border border-gray-200 p-1 text-center font-mono font-medium">{f.etd || "—"}</td>
                      <td className={`border border-gray-200 p-1 text-center font-mono ${atd ? "text-emerald-700 font-semibold" : "text-gray-300 italic text-[11px]"}`}>{atd ?? "--:--"}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="border border-gray-200 bg-gray-50 p-1 text-center text-[11px] text-gray-300 italic">
                      sin salida hoy
                    </td>
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
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-300 px-4 py-1 text-[11px] text-gray-500 flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" /> En llegada</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-700" /> Parking</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-500" /> Turnaround</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" /> Boarding</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" /> Despegado</span>
          <span className="ml-2 flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-200" /> alerta</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-yellow-50 ring-1 ring-yellow-300" /> ETD &lt;30m</span>
        </div>
        <div>MALLORCAIR Operations System v0.4 — orden por proximo evento</div>
      </footer>
    </div>
  );
}

function getServiceState(flight: FlightWithRelations, type: string) {
  const svc = flight.services.find((s) => s.type === type);
  if (!svc) return "NONE";
  return svc.state;
}

function ServiceCell({ state, label }: { state: string; label: string }) {
  const colors: Record<string, string> = {
    DELIVERED: "bg-green-500 text-white border-green-600",
    ARRIVED: "bg-yellow-400 text-yellow-900 border-yellow-500 animate-pulse",
    PENDING: "bg-gray-100 text-gray-400 border-gray-200",
    NONE: "bg-gray-50 text-gray-200 border-transparent",
  };
  const current =
    state === "DELIVERED" || state === "COMPLETED" || state === "SERVED"
      ? "DELIVERED"
      : state === "ARRIVED" || state === "REQUESTED"
        ? "ARRIVED"
        : state === "PENDING"
          ? "PENDING"
          : "NONE";
  return (
    <td className="border border-gray-200 p-0 text-center w-8 h-8">
      <div className={`flex h-full w-full items-center justify-center font-bold border-b-2 ${colors[current]}`}>
        {label}
      </div>
    </td>
  );
}
