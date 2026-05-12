"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { palmaDayUtc, dateToSqlString } from "@/lib/time";
import { useEventStream } from "@/hooks/useEventStream";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getOperatorName } from "@/lib/operators";
import { ViewTabs } from "@/components/ViewTabs";
import { FlightDetailPanel } from "@/app/dia/FlightDetailPanel";
import { PassengerCrewModal } from "@/components/PassengerCrewModal";
import { computeHeaderStats, type FlightLite, shortDate } from "@/app/dia/diaHelpers";
import {
  computeBarBounds,
  flightPips,
  nowPctInRange,
  parseHHMM,
  zoomedRange,
  isCommercialCallsign,
  barSegments,
  minToPct,
  type TimelineRange,
} from "./timelineHelpers";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

type FilterKind = "all" | "private" | "commercial" | "overnight";
type SortKind = "time" | "stand";

const SHIFTS = [
  { label: "Mañana", startMin: 6 * 60, endMin: 14 * 60 },
  { label: "Tarde", startMin: 14 * 60, endMin: 22 * 60 },
  { label: "Noche", startMin: 22 * 60, endMin: 24 * 60 },
] as const;

const STANDS = 12;
const ROW_H = 56;
const BAR_H = 22;

export default function TimelinePage() {
  const { status } = useSession();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [date, setDate] = useState(() => palmaDayUtc());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [paxCrewModal, setPaxCrewModal] = useState<{ flightId: string; direction: "ARRIVAL" | "DEPARTURE" } | null>(null);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [zoom, setZoom] = useState<6 | 12 | 24>(24);
  const [sortBy, setSortBy] = useState<SortKind>("time");

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

  // Keyboard shortcuts: ESC cierra panel; ←/→ navega fechas; T = hoy; 1/2/3 = zoom.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape" && selectedFlightId) { setSelectedFlightId(null); return; }
      if (e.key === "ArrowLeft") {
        const d = new Date(date); d.setUTCDate(d.getUTCDate() - 1); setDate(d);
      } else if (e.key === "ArrowRight") {
        const d = new Date(date); d.setUTCDate(d.getUTCDate() + 1); setDate(d);
      } else if (e.key === "t" || e.key === "T") {
        setDate(palmaDayUtc());
      } else if (e.key === "1") setZoom(6);
      else if (e.key === "2") setZoom(12);
      else if (e.key === "3") setZoom(24);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedFlightId, date]);

  const range: TimelineRange = useMemo(() => zoomedRange(zoom, now), [zoom, now]);

  const filterCounts = useMemo(() => ({
    all: flights.length,
    private: flights.filter((f) => !isCommercialCallsign(f.callsign)).length,
    commercial: flights.filter((f) => isCommercialCallsign(f.callsign)).length,
    overnight: flights.filter((f) => f.isOvernight).length,
  }), [flights]);

  const filtered = useMemo(() => {
    let xs = flights;
    if (filter === "private") xs = xs.filter((f) => !isCommercialCallsign(f.callsign));
    if (filter === "commercial") xs = xs.filter((f) => isCommercialCallsign(f.callsign));
    if (filter === "overnight") xs = xs.filter((f) => f.isOvernight);
    return [...xs].sort((a, b) => {
      if (sortBy === "stand") {
        // Asignados primero (alfa-num natural), luego TBD por hora
        const pa = a.parking || ""; const pb = b.parking || "";
        if (pa && !pb) return -1;
        if (!pa && pb) return 1;
        if (pa && pb) {
          const cmp = pa.localeCompare(pb, undefined, { numeric: true, sensitivity: "base" });
          if (cmp !== 0) return cmp;
        }
      }
      const ta = parseHHMM(a.eta) ?? parseHHMM(a.etd) ?? 99999;
      const tb = parseHHMM(b.eta) ?? parseHHMM(b.etd) ?? 99999;
      return ta - tb;
    });
  }, [flights, filter, sortBy]);

  const stats = useMemo(
    () => computeHeaderStats(flights as unknown as FlightLite[], date, now),
    [flights, date, now],
  );

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedFlightId) ?? null,
    [flights, selectedFlightId],
  );

  const dayShort = shortDate(date);
  const isToday = dayShort === shortDate(palmaDayUtc());
  const nowPct = nowPctInRange(now, range);

  const fmt = (d: Date, tz?: string) =>
    d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  // Hours array for the ruler — major (every 1h) within the visible range
  const visibleHours = useMemo(() => {
    const startH = Math.ceil(range.startMin / 60);
    const endH = Math.floor(range.endMin / 60);
    return Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);
  }, [range]);

  // Parking occupancy per hour
  const occupancy = useMemo(() => {
    const out: Array<{ hour: number; count: number }> = [];
    for (const h of visibleHours) {
      const hourMin = h * 60;
      const c = flights.filter((f) => {
        const eta = parseHHMM(f.eta);
        const etd = parseHHMM(f.etd);
        if (eta === null || etd === null) return false;
        if (etd < eta) return hourMin >= eta || hourMin <= etd;
        return hourMin >= eta && hourMin <= etd;
      }).length;
      out.push({ hour: h, count: c });
    }
    return out;
  }, [flights, visibleHours]);

  // "Activos ahora" — robust to zoom: count flights whose [eta, etd] contains now,
  // independiente de si la hora actual está dentro de la ventana visible.
  const activeNowCount = useMemo(() => {
    if (!isToday) return 0;
    const m = now.getUTCHours() * 60 + now.getUTCMinutes();
    return flights.filter((f) => {
      const eta = parseHHMM(f.eta); const etd = parseHHMM(f.etd);
      if (eta === null || etd === null) return false;
      if (etd < eta) return m >= eta || m <= etd;
      return m >= eta && m <= etd;
    }).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, now, dayShort]);

  if (status === "loading" || loading) {
    return <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">Cargando Timeline...</div>;
  }
  return (
    <div className="flex h-screen flex-col bg-[#fafafa] text-sm select-none" style={{ fontFamily: "Inter Tight, system-ui, sans-serif" }}>
      <style>{`@keyframes tlpulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
      {/* HEADER */}
      <header className="flex items-center justify-between gap-6 bg-[#0a0a0a] px-7 py-3.5 text-[#e6edf3]">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div
              className="h-6 w-6 rounded-md relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, oklch(0.78 0.16 75), oklch(0.62 0.18 60))" }}
            >
              <div
                className="absolute inset-[5px] rounded-full border-[1.5px] border-white/85 border-r-transparent"
                style={{ transform: "rotate(-30deg)" }}
              />
            </div>
            <div className="leading-tight">
              <div className="text-[14.5px] font-semibold tracking-tight">Mallorcair Ops</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-px">FBO · LEPA</div>
            </div>
          </div>

          <ViewTabs tone="dark" />
        </div>

        <div className="flex items-center gap-8">
          <div className="flex items-center gap-1.5 text-[13px] text-gray-300" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            <button
              onClick={() => { const d = new Date(date); d.setUTCDate(d.getUTCDate() - 1); setDate(d); }}
              className="px-2 py-1 text-gray-500 hover:text-gray-200"
              title="Día anterior (←)"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="rounded-md bg-white/10 px-2.5 py-1">
              {date.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
                .replace(".", "")
                .replace(/^./, (c) => c.toUpperCase())}
            </span>
            <button
              onClick={() => { const d = new Date(date); d.setUTCDate(d.getUTCDate() + 1); setDate(d); }}
              className="px-2 py-1 text-gray-500 hover:text-gray-200"
              title="Día siguiente (→)"
            >
              <ChevronRight size={14} />
            </button>
            {!isToday && (
              <button
                onClick={() => setDate(palmaDayUtc())}
                className="ml-1 px-2 py-1 text-[10.5px] font-semibold rounded uppercase tracking-wider"
                style={{ background: "oklch(0.85 0.15 95 / 0.18)", color: "oklch(0.85 0.15 95)" }}
                title="Volver a hoy (T)"
              >
                Hoy
              </button>
            )}
          </div>

          <div className="flex items-baseline gap-7" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-widest text-gray-500">Palma</span>
              <span className="text-[22px] font-semibold leading-none -tracking-[0.01em]">{fmt(now, "Europe/Madrid")}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[9px] uppercase tracking-widest text-gray-500">Zulu</span>
              <span className="text-[22px] font-semibold leading-none -tracking-[0.01em]" style={{ color: "oklch(0.85 0.15 95)" }}>{fmt(now, "UTC")}</span>
            </div>
          </div>
        </div>
      </header>

      {/* SUMMARY band */}
      <div className="flex items-stretch border-b border-gray-200 bg-white px-7">
        <Stat label="Movimientos" value={String(flights.length)} sub={`${stats.arrivals} LLEG · ${stats.departures} SAL`} />
        <Stat label="Activos ahora" value={String(activeNowCount)} sub="en parking" />
        <Stat label="Próximas 2 h" value={String(countNext2h(flights, now))} sub={`${countNext2hKind(flights, now, "DEP")} SAL · ${countNext2hKind(flights, now, "ARR")} LLEG`} />
        <Stat label="Servicios pend." value={String(stats.pendingDepServices)} sub="fuel + catering" />
        {stats.alerts > 0 && (
          <Stat label="Alerta" value={String(stats.alerts)} sub="ETD pasada" alert />
        )}

        <div className="ml-auto flex items-center gap-2.5 py-2.5">
          <FilterPill label="Todos" count={filterCounts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterPill label="Privados" count={filterCounts.private} active={filter === "private"} onClick={() => setFilter("private")} />
          <FilterPill label="Comerciales" count={filterCounts.commercial} active={filter === "commercial"} onClick={() => setFilter("commercial")} />
          <FilterPill label="Pernoctas" count={filterCounts.overnight} active={filter === "overnight"} onClick={() => setFilter("overnight")} />

          <div className="w-px h-5 bg-gray-200 mx-1" />

          <div className="flex items-center bg-gray-100 rounded-md p-0.5" title="Ordenar por">
            {([["time", "Hora"], ["stand", "Stand"]] as const).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${sortBy === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-gray-100 rounded-md p-0.5" title="Zoom (1/2/3)">
            {([6, 12, 24] as const).map((z) => (
              <button
                key={z}
                onClick={() => setZoom(z)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${zoom === z ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {z}h
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN: timeline + panel */}
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto bg-white">
          {/* RULER */}
          <div className="grid grid-cols-[320px_1fr] border-b border-gray-200 sticky top-0 z-20 bg-white">
            <div className="flex items-end justify-between px-4 pt-3.5 pb-1.5 bg-[#fafafa] border-r border-gray-200">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Aeronave · {sortBy === "stand" ? "stand" : "hora"}</span>
              <span className="text-[9.5px] text-gray-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>{filtered.length}</span>
            </div>
            <div className="relative h-[42px]">
              {/* Shift bands behind — sutiles barras de color, no texto */}
              {SHIFTS.map((s, i) => {
                const left = minToPct(s.startMin, range);
                const width = minToPct(s.endMin, range) - left;
                if (width <= 0 || left >= 100) return null;
                const colors = ["oklch(0.97 0.02 75)", "oklch(0.97 0.02 230)", "oklch(0.96 0.02 280)"];
                return (
                  <div
                    key={s.label}
                    className="absolute bottom-0 h-1"
                    style={{ left: `${Math.max(0, left)}%`, width: `${Math.min(100 - Math.max(0, left), width)}%`, background: colors[i] }}
                    title={`Turno ${s.label}`}
                  />
                );
              })}

              {/* Hours */}
              {visibleHours.map((h) => {
                const pct = minToPct(h * 60, range);
                if (pct < 0 || pct > 100) return null;
                const isNowH = isToday && h === now.getUTCHours();
                return (
                  <div key={h} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                    <div className="absolute left-0 bottom-1 w-px h-2 bg-gray-300" />
                    <div
                      className={`absolute left-0 bottom-4 -translate-x-1/2 text-[11px] font-medium whitespace-nowrap tabular-nums ${isNowH ? "opacity-30" : "text-gray-700"}`}
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {String(h).padStart(2, "0")}
                    </div>
                  </div>
                );
              })}

              {/* NOW tag */}
              {isToday && (
                <div
                  className="absolute top-2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-bold rounded-full text-white tracking-wider z-10 whitespace-nowrap"
                  style={{ left: `${nowPct}%`, background: "oklch(0.55 0.2 25)", boxShadow: "0 1px 6px oklch(0.55 0.2 25 / 0.4)", fontFamily: "JetBrains Mono, monospace" }}
                >
                  {fmt(now, "UTC")} Z
                  <div
                    className="absolute left-1/2 -translate-x-1/2 -bottom-[3px] h-[6px] w-[6px] rotate-45"
                    style={{ background: "oklch(0.55 0.2 25)" }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* OCCUPANCY strip */}
          <div className="grid grid-cols-[320px_1fr] bg-white border-b border-gray-200">
            <div className="flex items-center justify-between px-4 py-2 bg-[#fafafa] border-r border-gray-200">
              <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Ocupación</span>
              <span className="text-[10.5px] text-gray-600" style={{ fontFamily: "JetBrains Mono, monospace" }}>
                pico {Math.max(...occupancy.map((o) => o.count), 0)}/{STANDS}
              </span>
            </div>
            <div className="relative h-10 py-1">
              {/* baseline */}
              <div className="absolute left-0 right-0 bottom-1 h-px bg-gray-200" />
              {/* capacity threshold (80% = 0.8 * STANDS) */}
              <div className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ bottom: `${4 + 0.8 * 28}px` }} />
              {occupancy.map((o) => {
                if (o.count === 0) return null;
                const leftPct = minToPct(o.hour * 60, range);
                const widthPct = minToPct((o.hour + 1) * 60, range) - leftPct;
                if (leftPct >= 100 || leftPct + widthPct <= 0) return null;
                const ratio = Math.min(1, o.count / STANDS);
                const barH = Math.max(2, ratio * 28);
                const peak = o.count >= Math.ceil(STANDS * 0.8);
                return (
                  <div
                    key={o.hour}
                    className="absolute bottom-1 rounded-t"
                    style={{
                      left: `${leftPct + widthPct * 0.08}%`,
                      width: `${widthPct * 0.84}%`,
                      height: `${barH}px`,
                      background: peak ? "oklch(0.68 0.16 25 / 0.85)" : "oklch(0.7 0.1 245 / 0.7)",
                    }}
                  >
                    <span
                      className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9.5px] font-bold tabular-nums"
                      style={{ fontFamily: "JetBrains Mono, monospace", color: peak ? "oklch(0.45 0.18 25)" : "#6b7280" }}
                    >
                      {o.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ROWS */}
          <div className="relative">
            {filtered.map((f) => (
              <FlightRow
                key={f.id}
                flight={f}
                viewDayShort={dayShort}
                range={range}
                isSelected={selectedFlightId === f.id}
                onClick={() => setSelectedFlightId(selectedFlightId === f.id ? null : f.id)}
                nowPct={nowPct}
                showNow={isToday}
              />
            ))}

            {filtered.length === 0 && (
              <div className="py-20 px-12 text-center">
                <div className="text-[42px] mb-3 opacity-30">✈</div>
                <div className="text-gray-700 font-semibold text-[14px] mb-1">
                  {flights.length === 0 ? "Sin movimientos para este día" : "Ningún vuelo coincide con el filtro"}
                </div>
                <div className="text-gray-400 text-[12px]">
                  {flights.length === 0
                    ? "Prueba con otra fecha (← →) o vuelve a hoy (T)"
                    : "Quita filtros para ver todos los movimientos"}
                </div>
              </div>
            )}
          </div>

          {/* LEGEND */}
          <div className="bg-white px-7 py-3.5 flex flex-wrap gap-7 items-center text-[11.5px] text-gray-500 border-t border-gray-200">
            <LegendGroup title="Fase">
              <LegendSwatch color="oklch(0.7 0.14 290)" label="Turnaround" />
              <LegendSwatch color="oklch(0.68 0.18 50)" label="Boarding" />
              <LegendSwatch color="transparent" border="1px dashed oklch(0.78 0.04 250)" label="Previsto" />
              <LegendSwatch color="transparent" border="1px solid #e5e7eb" label="Completado" />
            </LegendGroup>
            <LegendGroup title="Hitos">
              <LegendDiamond border="oklch(0.5 0.15 245)" label="ETA" />
              <LegendDiamond border="oklch(0.5 0.15 245)" filled label="ATA" />
              <LegendDiamond border="oklch(0.55 0.16 50)" label="ETD" />
              <LegendDiamond border="oklch(0.55 0.16 50)" filled label="ATD" />
            </LegendGroup>
            <LegendGroup title="Servicios">
              <LegendPip letter="F" state="ok" label="Servido" />
              <LegendPip letter="F" state="req" label="Pedido" />
              <LegendPip letter="F" state="no" label="Pendiente" />
            </LegendGroup>
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

// ─── Helpers de render ───────────────────────────────────────────────────────

function countNext2h(flights: Flight[], now: Date): number {
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return flights.filter((f) => {
    const eta = parseHHMM(f.eta); const etd = parseHHMM(f.etd);
    return (eta !== null && eta >= nowMin && eta <= nowMin + 120) ||
           (etd !== null && etd >= nowMin && etd <= nowMin + 120);
  }).length;
}

function countNext2hKind(flights: Flight[], now: Date, kind: "ARR" | "DEP"): number {
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return flights.filter((f) => {
    if (kind === "ARR") {
      const eta = parseHHMM(f.eta);
      return eta !== null && eta >= nowMin && eta <= nowMin + 120;
    }
    const etd = parseHHMM(f.etd);
    return etd !== null && etd >= nowMin && etd <= nowMin + 120;
  }).length;
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function Stat({ label, value, sub, alert }: {
  label: string; value: string; sub?: string; alert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 pr-6 mr-6 py-3.5 border-r border-gray-100 last:border-r-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{label}</div>
      <div
        className={`text-[24px] font-semibold leading-none -tracking-[0.02em] ${alert ? "" : "text-gray-900"}`}
        style={{ fontFamily: "JetBrains Mono, monospace", color: alert ? "oklch(0.55 0.2 25)" : undefined }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="text-[11px]"
          style={{ fontFamily: "JetBrains Mono, monospace", color: alert ? "oklch(0.55 0.2 25)" : "#6b7280" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium flex items-center gap-1.5 transition-colors ${
        active ? "" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
      }`}
      style={active ? { background: "oklch(0.92 0.04 250)", color: "oklch(0.45 0.16 250)" } : undefined}
    >
      {label} <span className="opacity-60 text-[10.5px]" style={{ fontFamily: "JetBrains Mono, monospace" }}>{count}</span>
    </button>
  );
}

function LegendGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 first:pl-0 not-first:border-l not-first:border-gray-100 not-first:pl-7">
      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mr-1">{title}</span>
      {children}
    </div>
  );
}

function LegendSwatch({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-3.5 w-3.5 rounded-sm" style={{ background: color, border }} />
      {label}
    </span>
  );
}

function LegendDiamond({ border, filled, label }: { border: string; filled?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rotate-45" style={{ border: `2px solid ${border}`, background: filled ? border : "#fff" }} />
      {label}
    </span>
  );
}

function LegendPip({ letter, state, label }: { letter: string; state: "ok" | "req" | "no"; label: string }) {
  const styles = state === "ok"
    ? { borderColor: "oklch(0.55 0.13 155)", background: "oklch(0.96 0.04 155)", color: "oklch(0.4 0.13 155)" }
    : state === "req"
    ? { borderColor: "oklch(0.7 0.16 85)", background: "oklch(0.97 0.06 85)", color: "oklch(0.45 0.16 85)" }
    : { borderColor: "#d1d5db", background: "#fff", color: "#9ca3af" };
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center text-[7px] font-bold"
        style={{ ...styles, fontFamily: "JetBrains Mono, monospace" }}
      >
        {letter}
      </span>
      {label}
    </span>
  );
}

// ─── Row ────────────────────────────────────────────────────────────

const URGENCY_PILL_COLOR: Record<string, string> = {
  EXPECTED:   "#d1d5db",
  ARRIVING:   "oklch(0.55 0.15 245)",
  PARKED:     "oklch(0.7 0.14 290)",
  DEPARTING:  "oklch(0.78 0.16 85)",
  DEPARTED:   "#d1d5db",
  // legacy
  ON_BLOCKS:  "oklch(0.55 0.15 245)",
  TURNAROUND: "oklch(0.78 0.16 85)",
  BOARDING:   "oklch(0.68 0.18 50)",
  OFF_BLOCKS: "#d1d5db",
};

function FlightRow({
  flight, viewDayShort, range, isSelected, onClick, nowPct, showNow,
}: {
  flight: FlightWithRelations;
  viewDayShort: string;
  range: TimelineRange;
  isSelected: boolean;
  onClick: () => void;
  nowPct: number;
  showNow: boolean;
}) {
  const bounds = computeBarBounds(flight, viewDayShort, range);
  const pips = bounds ? flightPips(flight, flight.services, bounds, range) : [];
  const operator = getOperatorName(flight.callsign);
  const isPrivate = operator === "Privado";
  const segments = barSegments(flight.state, flight.paxDepState === "BOARDED");

  const isAlert = flight.state !== "DEPARTED" && flight.etd && parseHHMM(flight.etd) !== null && parseHHMM(flight.etd)! < (new Date().getUTCHours() * 60 + new Date().getUTCMinutes());
  const isDeparted = flight.state === "DEPARTED" || flight.state === "OFF_BLOCKS";
  const isFuture = flight.state === "EXPECTED";

  const etaPct = parseHHMM(flight.eta) !== null ? minToPct(parseHHMM(flight.eta)!, range) : null;
  const etdPct = parseHHMM(flight.etd) !== null ? minToPct(parseHHMM(flight.etd)!, range) : null;

  const rowBg = isAlert ? "bg-red-50/60" : isDeparted ? "bg-gray-50" : "bg-white";

  return (
    <div
      onClick={onClick}
      className={`grid grid-cols-[320px_1fr] cursor-pointer border-b border-gray-100 transition-colors hover:bg-blue-50/30 ${rowBg} ${isSelected ? "ring-2 ring-blue-400 ring-inset z-10 relative" : ""}`}
      style={{ minHeight: ROW_H }}
    >
      {/* META */}
      <div
        className={`flex items-center gap-2.5 py-2.5 px-3.5 border-r border-gray-100 bg-white/60 ${isAlert ? "border-l-[3px] pl-[13px]" : ""} ${isDeparted ? "opacity-60" : ""}`}
        style={isAlert ? { borderLeftColor: "oklch(0.6 0.2 25)" } : undefined}
      >
        <div className="w-1.5 h-9 rounded-sm shrink-0" style={{ background: URGENCY_PILL_COLOR[flight.state] ?? "#d1d5db" }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <div className="text-[14.5px] font-semibold leading-tight -tracking-[0.01em] text-gray-900" style={{ fontFamily: "JetBrains Mono, monospace" }}>{flight.registration}</div>
            <div className="text-[11.5px] font-semibold leading-tight" style={{ color: "oklch(0.5 0.14 245)", fontFamily: "JetBrains Mono, monospace" }}>{flight.callsign}</div>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            <span className="text-gray-600">{flight.aircraftType}</span>
            <span aria-hidden className="text-gray-300">·</span>
            <span className={flight.parking
              ? "bg-gray-100 px-1.5 py-px rounded text-gray-800 font-semibold text-[10.5px]"
              : "text-gray-300 italic font-normal text-[10.5px]"}>
              {flight.parking || "sin stand"}
            </span>
            {!isPrivate && (
              <>
                <span aria-hidden className="text-gray-300">·</span>
                <span className="text-[10.5px] text-gray-500 truncate">{operator}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5" style={{ fontFamily: "JetBrains Mono, monospace" }}>
          <span className="text-[11px] text-gray-700 font-medium">P {flight.paxArrivalReal ?? flight.paxArrival}/{flight.paxDepartureReal ?? flight.paxDeparture}</span>
          <span className="text-[10px] text-gray-400">C {flight.crewArrivalReal ?? flight.crewArrival}/{flight.crewDepartureReal ?? flight.crewDeparture}</span>
        </div>
      </div>

      {/* LANE */}
      <div className="relative">
        {/* hour grid lines */}
        {Array.from({ length: Math.ceil((range.endMin - range.startMin) / 60) + 1 }, (_, i) => {
          const h = Math.ceil(range.startMin / 60) + i;
          const pct = minToPct(h * 60, range);
          if (pct < 0 || pct > 100) return null;
          const major = h % 6 === 0;
          return <div key={h} className="absolute top-0 bottom-0 w-px" style={{ left: `${pct}%`, background: major ? "#f3f4f6" : "oklch(0.95 0 0)" }} />;
        })}

        {/* BAR */}
        {bounds && (
          <div
            className="absolute top-1/2 -translate-y-1/2 rounded-[3px] flex overflow-visible shadow-sm"
            style={{
              left: `${bounds.startPct}%`,
              width: `${Math.max(bounds.endPct - bounds.startPct, 0.5)}%`,
              height: `${BAR_H}px`,
              background: isFuture ? "oklch(0.94 0.02 250)" : isDeparted ? "oklch(0.92 0.01 250)" : segments.length === 0 ? "oklch(0.7 0.14 290)" : undefined,
              border: isFuture ? "1px dashed oklch(0.78 0.04 250)" : isDeparted ? "1px solid #e5e7eb" : undefined,
              boxShadow: isAlert ? "0 0 0 1.5px oklch(0.6 0.2 25), 0 0 12px oklch(0.6 0.2 25 / 0.35)" : undefined,
            }}
          >
            {!isFuture && !isDeparted && segments.map((seg, i) => (
              <div
                key={i}
                className="h-full first:rounded-l-[3px] last:rounded-r-[3px]"
                style={{
                  flex: 1,
                  background:
                    seg === "turn-parked" ? "oklch(0.7 0.14 290)" :
                    seg === "turn-svc" ? "linear-gradient(90deg, oklch(0.7 0.14 290) 0%, oklch(0.75 0.16 85) 100%)" :
                    seg === "turn-board" ? "oklch(0.68 0.18 50)" :
                    "oklch(0.7 0.14 290)",
                }}
              />
            ))}
          </div>
        )}

        {/* PIPS */}
        {pips.map((p, i) => {
          const styles = p.state === "ok"
            ? { borderColor: "oklch(0.55 0.13 155)", background: "oklch(0.96 0.04 155)", color: "oklch(0.4 0.13 155)" }
            : p.state === "req"
            ? { borderColor: "oklch(0.7 0.16 85)", background: "oklch(0.97 0.06 85)", color: "oklch(0.45 0.16 85)", animation: "tlpulse 1.6s infinite" }
            : { borderColor: "#d1d5db", background: "#fff", color: "#9ca3af" };
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 flex items-center justify-center text-[8.5px] font-extrabold z-[6] shadow"
              style={{ left: `${p.pct}%`, fontFamily: "JetBrains Mono, monospace", ...styles }}
              title={p.label}
            >
              {p.letter}
            </div>
          );
        })}

        {/* ETA / ETD MARKERS */}
        {etaPct !== null && etaPct >= 0 && etaPct <= 100 && (
          <Marker pct={etaPct} kind="eta" actual={!!flight.ata} label={flight.ata || flight.eta || ""} />
        )}
        {etdPct !== null && etdPct >= 0 && etdPct <= 100 && (
          <Marker pct={etdPct} kind="etd" actual={!!flight.atd} label={flight.atd || flight.etd || ""} below />
        )}

        {/* NOW LINE per row — sutil, debajo de pips y markers */}
        {showNow && nowPct >= 0 && nowPct <= 100 && (
          <div className="absolute top-0 bottom-0 w-px z-[2] pointer-events-none" style={{ left: `${nowPct}%`, background: "oklch(0.6 0.2 25 / 0.55)" }} />
        )}
      </div>

    </div>
  );
}

function Marker({ pct, kind, actual, label, below }: {
  pct: number; kind: "eta" | "etd"; actual: boolean; label: string; below?: boolean;
}) {
  const color = kind === "eta" ? "oklch(0.5 0.15 245)" : "oklch(0.55 0.16 50)";
  const labelColor = kind === "eta" ? "oklch(0.45 0.17 245)" : "oklch(0.5 0.17 50)";
  return (
    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-[4]" style={{ left: `${pct}%` }}>
      <div
        className="h-[9px] w-[9px] rotate-45"
        style={{ border: `2px solid ${color}`, background: actual ? color : "#fff" }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 text-[9.5px] font-bold whitespace-nowrap py-px px-1 bg-white rounded-sm shadow-sm"
        style={{
          ...(below ? { top: "14px" } : { bottom: "14px" }),
          color: labelColor,
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {label}
      </div>
    </div>
  );
}
