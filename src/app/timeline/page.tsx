"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { palmaDayUtc, dateToSqlString } from "@/lib/time";
import { useEventStream } from "@/hooks/useEventStream";
import { ChevronLeft, ChevronRight, AlertTriangle, PlaneLanding } from "lucide-react";
import { getOperatorName } from "@/lib/operators";
import { ViewTabs } from "@/components/ViewTabs";
import { FlightDetailPanel } from "@/app/dia/FlightDetailPanel";
import { PassengerCrewModal } from "@/components/PassengerCrewModal";
import { computeHeaderStats, type FlightLite, shortDate } from "@/app/dia/diaHelpers";
import {
  computeBarBounds,
  flightPips,
  nowZuluPercent,
  parseHHMM,
  BAR_COLOR,
} from "./timelineHelpers";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0..24 ticks
const MAJOR_HOUR = 2; // label every 2h
const ROW_HEIGHT = 38;

export default function TimelinePage() {
  const { status } = useSession();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [date, setDate] = useState(() => palmaDayUtc());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [paxCrewModal, setPaxCrewModal] = useState<{ flightId: string; direction: "ARRIVAL" | "DEPARTURE" } | null>(null);

  // Tick every minute for the NOW line
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
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

  useEffect(() => {
    if (!selectedFlightId) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedFlightId(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedFlightId]);

  const stats = useMemo(
    () => computeHeaderStats(flights as unknown as FlightLite[], date, now),
    [flights, date, now],
  );

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedFlightId) ?? null,
    [flights, selectedFlightId],
  );

  // Sort flights by their ETA (or ETD if no ETA) — stable order top→bottom
  const sortedFlights = useMemo(() => {
    return [...flights].sort((a, b) => {
      const ta = parseHHMM(a.eta) ?? parseHHMM(a.etd) ?? 99999;
      const tb = parseHHMM(b.eta) ?? parseHHMM(b.etd) ?? 99999;
      return ta - tb;
    });
  }, [flights]);

  const dayShort = shortDate(date);
  const nowPct = nowZuluPercent(now);
  const isToday = dayShort === shortDate(palmaDayUtc());

  const fmt = (d: Date, tz?: string) =>
    d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz });

  if (status === "loading" || loading) {
    return <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">Cargando Timeline...</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-[#fafafa] text-sm font-sans select-none">
      {/* HEADER (dark) */}
      <header className="flex flex-wrap items-center justify-between gap-4 bg-[#0a0a0a] px-7 py-3 text-[#e6edf3]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded bg-gradient-to-br from-amber-400 to-amber-600" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">MALLORCAIR</div>
              <div className="text-[9px] uppercase tracking-widest text-gray-500">Operations · Timeline</div>
            </div>
          </div>

          <ViewTabs tone="dark" />
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-gray-300">
          <button
            onClick={() => { const d = new Date(date); d.setUTCDate(d.getUTCDate() - 1); setDate(d); }}
            className="rounded p-1 text-gray-400 hover:text-white"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="rounded bg-gray-700/40 px-2.5 py-1">
            {date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "2-digit" }).toUpperCase()}
          </span>
          <button
            onClick={() => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + 1); setDate(d); }}
            className="rounded p-1 text-gray-400 hover:text-white"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-baseline gap-7 font-mono">
          <div className="flex flex-col items-end leading-tight">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Local Palma</div>
            <div className="text-xl font-semibold text-white">{fmt(now, "Europe/Madrid")}</div>
          </div>
          <div className="flex flex-col items-end leading-tight">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Zulu</div>
            <div className="text-xl font-semibold text-amber-400">{fmt(now, "UTC")}</div>
          </div>
        </div>
      </header>

      {/* SUMMARY band */}
      <div className="flex items-stretch gap-0 border-b border-gray-200 bg-white px-7">
        <Stat label="Vuelos hoy" value={String(flights.length)} />
        <Stat label="Llegadas" value={String(stats.arrivals)} />
        <Stat label="Salidas" value={String(stats.departures)} />
        <Stat label="Aproximandose" value={String(stats.approaching)} icon={<PlaneLanding size={11} className="text-sky-600" />} />
        <Stat label="Pendientes" value={String(stats.pendingDepServices)} sub="servicios SAL" />
        <Stat label="Alertas" value={String(stats.alerts)} alert icon={stats.alerts > 0 ? <AlertTriangle size={11} className="text-red-600" /> : undefined} />
      </div>

      {/* MAIN: timeline + panel */}
      <main className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-auto bg-white">
          {/* TIME AXIS (sticky top) */}
          <div className="sticky top-0 z-20 border-b border-gray-200 bg-white">
            <div className="relative h-9">
              {HOURS.map((h) => {
                const pct = (h / 24) * 100;
                const isMajor = h % MAJOR_HOUR === 0;
                return (
                  <div
                    key={h}
                    className="absolute top-0 h-full"
                    style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                  >
                    {isMajor && (
                      <div className="font-mono text-[11px] text-gray-500 px-1 mt-1">
                        {String(h).padStart(2, "0")}:00
                      </div>
                    )}
                    <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 ${isMajor ? "h-3 w-px bg-gray-400" : "h-1.5 w-px bg-gray-300"}`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* CANVAS rows */}
          <div className="relative">
            {/* vertical hour grid lines (subtle) */}
            <div className="pointer-events-none absolute inset-0 z-0">
              {HOURS.map((h) => {
                const pct = (h / 24) * 100;
                const isMajor = h % MAJOR_HOUR === 0;
                return (
                  <div
                    key={h}
                    className={`absolute top-0 bottom-0 w-px ${isMajor ? "bg-gray-200" : "bg-gray-100"}`}
                    style={{ left: `${pct}%` }}
                  />
                );
              })}
            </div>

            {/* NOW line */}
            {isToday && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-red-500"
                style={{ left: `${nowPct}%` }}
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-1.5 w-1.5 rounded-full bg-red-500 shadow" />
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-1 py-0 text-[9px] font-mono font-bold text-white bg-red-500 rounded">NOW</div>
              </div>
            )}

            {sortedFlights.map((f) => (
              <FlightRow
                key={f.id}
                flight={f}
                viewDayShort={dayShort}
                isSelected={selectedFlightId === f.id}
                onClick={() => setSelectedFlightId(selectedFlightId === f.id ? null : f.id)}
              />
            ))}

            {flights.length === 0 && (
              <div className="p-12 text-center text-gray-400 italic">No hay vuelos registrados para este dia.</div>
            )}
          </div>
        </div>

        {selectedFlight && (
          <FlightDetailPanel
            flight={selectedFlight}
            onClose={() => setSelectedFlightId(null)}
            onMutated={fetchFlights}
            onOpenPaxCrew={(direction) => setPaxCrewModal({ flightId: selectedFlight.id, direction })}
            onDeleted={() => { setSelectedFlightId(null); fetchFlights(); }}
          />
        )}
      </main>

      {/* FOOTER leyenda */}
      <footer className="bg-white border-t border-gray-300 px-7 py-1 text-[11px] text-gray-500 flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          <LegendDot cls="bg-gray-300" label="EXPECTED" />
          <LegendDot cls="bg-blue-500" label="ARRIVING" />
          <LegendDot cls="bg-purple-500" label="PARKED" />
          <LegendDot cls="bg-cyan-500" label="DEPARTING" />
          <LegendDot cls="bg-emerald-600" label="DEPARTED" />
          <span className="ml-3 text-gray-400">Pips: ⛽ fuel · 🚽 toilet · 📦 servicios. Click un vuelo para abrir su detalle.</span>
        </div>
      </footer>

      {/* Pax/Crew modal montado fuera del flex */}
      {paxCrewModal && selectedFlight && (
        <PassengerCrewModal
          isOpen={true}
          onClose={() => { setPaxCrewModal(null); fetchFlights(); }}
          flightId={paxCrewModal.flightId}
          direction={paxCrewModal.direction}
          flightLabel={`${selectedFlight.callsign} (${selectedFlight.registration})`}
        />
      )}
    </div>
  );
}

// ─── Componentes auxiliares ────────────────────────────────────────────────

function Stat({ label, value, sub, icon, alert }: {
  label: string; value: string; sub?: string; icon?: React.ReactNode; alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-6 py-3 border-r border-gray-100 last:border-r-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-gray-400">
        {icon}{label}
      </div>
      <div className={`font-mono text-2xl font-semibold leading-none ${alert && value !== "0" ? "text-red-600" : "text-gray-900"}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500 font-mono">{sub}</div>}
    </div>
  );
}

function LegendDot({ cls, label }: { cls: string; label: string }) {
  return <span className="flex items-center gap-1"><span className={`h-2 w-3 rounded ${cls}`} />{label}</span>;
}

function FlightRow({
  flight, viewDayShort, isSelected, onClick,
}: {
  flight: FlightWithRelations;
  viewDayShort: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const bounds = computeBarBounds(flight, viewDayShort);
  const pips = flightPips(flight, flight.services);
  const colors = BAR_COLOR[flight.state] ?? BAR_COLOR.EXPECTED;
  const operator = getOperatorName(flight.callsign);
  const opLabel = operator !== "Privado" ? operator : "Privado";

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer border-b border-gray-100 hover:bg-blue-50/30 ${isSelected ? "bg-blue-50/60 ring-2 ring-blue-400 ring-inset z-10" : ""}`}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Sticky label on the left (overlay over the canvas) */}
      <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-2 text-[11px]">
        <span className="rounded bg-white/90 backdrop-blur px-1.5 py-0.5 font-mono font-bold text-gray-800 shadow-sm">
          {flight.callsign}
        </span>
        <span className="rounded bg-white/70 backdrop-blur px-1 py-0.5 font-mono text-gray-500">
          {flight.registration}
        </span>
        {opLabel !== "Privado" && (
          <span className="rounded bg-indigo-50/80 backdrop-blur px-1 py-0.5 text-[10px] font-medium text-indigo-700">{opLabel}</span>
        )}
      </div>

      {/* Bar */}
      {bounds && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md ${colors.bar} ${bounds.kind !== "stay" ? "opacity-60" : ""} shadow-sm transition-shadow group-hover:shadow-md`}
          style={{
            left: `${bounds.startPct}%`,
            width: `${Math.max(bounds.endPct - bounds.startPct, 0.5)}%`,
          }}
          title={`${flight.callsign} · ${flight.eta || "?"} → ${flight.etd || "?"}`}
        >
          {/* ETA tick (left edge) */}
          {flight.eta && bounds.kind !== "departure-only" && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-white border-2 border-current opacity-80" />
          )}
          {/* ETD tick (right edge) */}
          {flight.etd && bounds.kind !== "arrival-only" && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3 w-3 rounded-full bg-white border-2 border-current opacity-80" />
          )}
        </div>
      )}

      {/* Pips */}
      {pips.map((p, i) => (
        <div
          key={i}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 h-1.5 w-1.5 rounded-full ${
            p.kind.includes("served") || p.kind.includes("done") || p.kind.includes("delivered")
              ? "bg-emerald-600 ring-1 ring-white"
              : "bg-amber-500 ring-1 ring-white"
          }`}
          style={{ left: `${p.pct}%` }}
          title={p.label}
        />
      ))}
    </div>
  );
}
