"use client";

import { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { Flight, Service, EventLog, LostItem } from "@/types/compat";
import { palmaDayUtc } from "@/lib/time";
import { useEventStream } from "@/hooks/useEventStream";
import { getOperatorName } from "@/lib/operators";
import { FlightDetailPanel } from "@/app/dia/FlightDetailPanel";
import { useDate } from "@/components/helix";
import { PassengerCrewModal } from "@/components/PassengerCrewModal";
import { CategoryPill } from "@/components/helix/CategoryPill";
import { RqstChip } from "@/components/helix/RqstChip";
import { PetCount } from "@/components/helix/PetCount";
import type { FlightCategory } from "@/types/v2";
import { computeHeaderStats, type FlightLite } from "@/app/dia/diaHelpers";
import {
  computeBarBounds,
  flightPips,
  msToPct,
  nowPctInRange,
  rangeFromCenter,
  rulerTicks,
  palmaDaysInRange,
  isCommercialCallsign,
  barSegments,
  HOUR_MS,
  type TimelineRange,
} from "./timelineHelpers";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

type FilterKind = "all" | "private" | "commercial" | "overnight" | "ferry" | "cancelled";
type SortKind = "time" | "stand";
type WindowHours = 6 | 12 | 24 | 48 | 72;

const ZOOM_STEPS: readonly WindowHours[] = [6, 12, 24, 48, 72] as const;
const STANDS = 12;
const ROW_H = 56;
const BAR_H = 22;

function stepHoursFor(window: WindowHours): number {
  if (window <= 12) return 1;
  if (window === 24) return 2;
  if (window === 48) return 3;
  return 6;
}

function toMs(instant: Date | string | null | undefined): number | null {
  if (instant === null || instant === undefined) return null;
  const d = instant instanceof Date ? instant : new Date(instant);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/** Devuelve el intervalo absoluto de presencia del vuelo en la base. */
function flightInterval(f: { arrivalInstant: Date | string | null; departureInstant: Date | string | null }): { startMs: number; endMs: number } | null {
  const arr = toMs(f.arrivalInstant);
  const dep = toMs(f.departureInstant);
  if (arr === null && dep === null) return null;
  if (arr !== null && dep !== null) return { startMs: arr, endMs: dep < arr ? arr + HOUR_MS : dep };
  if (arr !== null) return { startMs: arr, endMs: arr + 90 * 60 * 1000 };
  return { startMs: dep! - 90 * 60 * 1000, endMs: dep! };
}

export default function TimelinePage() {
  return (
    <Suspense fallback={null}>
      <TimelinePageInner />
    </Suspense>
  );
}

function TimelinePageInner() {
  const { status } = useSession();
  const { date, shift, goToday } = useDate();

  // Cache multi-dia y union deduplicada
  const [flightsByDate, setFlightsByDate] = useState<Map<string, FlightWithRelations[]>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [paxCrewModal, setPaxCrewModal] = useState<{ flightId: string; direction: "ARRIVAL" | "DEPARTURE" } | null>(null);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [sortBy, setSortBy] = useState<SortKind>("time");

  // ─── Viewport ─────────────────────────────────────────────────────
  const [windowHours, setWindowHours] = useState<WindowHours>(24);
  const [viewportCenterMs, setViewportCenterMs] = useState<number>(() => Date.now());
  const lastDateRef = useRef<number | null>(null);

  // Recentra cuando cambia `date` (URL): si es hoy, NOW; si no, mediodia UTC del dia
  useEffect(() => {
    const dms = date.getTime();
    if (lastDateRef.current === dms) return;
    lastDateRef.current = dms;
    const todayMs = palmaDayUtc().getTime();
    if (dms === todayMs) {
      setViewportCenterMs(Date.now());
    } else {
      setViewportCenterMs(palmaDayUtc(date).getTime() + 12 * HOUR_MS);
    }
  }, [date]);

  const range: TimelineRange = useMemo(
    () => rangeFromCenter(viewportCenterMs, windowHours * HOUR_MS),
    [viewportCenterMs, windowHours],
  );

  // ─── Tick de "now" cada minuto ──────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ─── Fetch multi-dia bajo demanda ─────────────────────────────────
  const fetchOne = useCallback(async (dateStr: string) => {
    if (inFlight.current.has(dateStr)) return;
    inFlight.current.add(dateStr);
    try {
      const res = await fetch(`/api/flights?date=${dateStr}`);
      if (res.ok) {
        const data = await res.json();
        setFlightsByDate((prev) => {
          const next = new Map(prev);
          next.set(dateStr, data.flights as FlightWithRelations[]);
          return next;
        });
      }
    } finally {
      inFlight.current.delete(dateStr);
    }
  }, []);

  // Re-fetch de los dias ya cacheados (para SSE)
  const refetchCached = useCallback(async () => {
    const dates = Array.from(flightsByDate.keys());
    await Promise.all(
      dates.map(async (d) => {
        // Bypass del lock — queremos refrescar incluso si una request previa estaba activa
        try {
          const res = await fetch(`/api/flights?date=${d}`);
          if (res.ok) {
            const data = await res.json();
            setFlightsByDate((prev) => {
              const next = new Map(prev);
              next.set(d, data.flights as FlightWithRelations[]);
              return next;
            });
          }
        } catch {
          // noop
        }
      }),
    );
  }, [flightsByDate]);

  // Cuando cambia el rango visible, descargamos los dias que faltan
  useEffect(() => {
    if (status !== "authenticated") return;
    const needed = palmaDaysInRange(range);
    const missing = needed.filter((d) => !flightsByDate.has(d) && !inFlight.current.has(d));
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    Promise.all(missing.map(fetchOne)).finally(() => setLoading(false));
  }, [range, status, flightsByDate, fetchOne]);

  useEventStream({ onEvent: () => refetchCached(), enabled: status === "authenticated" });

  // ─── Union deduplicada por id ────────────────────────────────────
  const flights = useMemo<FlightWithRelations[]>(() => {
    const map = new Map<string, FlightWithRelations>();
    for (const list of flightsByDate.values()) {
      for (const f of list) map.set(f.id, f);
    }
    return Array.from(map.values());
  }, [flightsByDate]);

  // ─── Vuelos cuyo intervalo intersecta el viewport ─────────────────
  const visibleInRange = useMemo(() => {
    return flights.filter((f) => {
      const iv = flightInterval(f);
      if (!iv) return false;
      return iv.endMs >= range.startMs && iv.startMs <= range.endMs;
    });
  }, [flights, range]);

  // ─── Atajos de teclado ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape" && selectedFlightId) { setSelectedFlightId(null); return; }
      if (e.key === "ArrowLeft") shift(-1);
      else if (e.key === "ArrowRight") shift(1);
      else if (e.key === "t" || e.key === "T") {
        goToday();
        setViewportCenterMs(Date.now());
      } else if (e.key === "1") setWindowHours(6);
      else if (e.key === "2") setWindowHours(12);
      else if (e.key === "3") setWindowHours(24);
      else if (e.key === "4") setWindowHours(48);
      else if (e.key === "5") setWindowHours(72);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFlightId, date]);

  // ─── Filter / sort ────────────────────────────────────────────────
  const filterCounts = useMemo(() => ({
    all: visibleInRange.length,
    private: visibleInRange.filter((f) => !isCommercialCallsign(f.callsign)).length,
    commercial: visibleInRange.filter((f) => isCommercialCallsign(f.callsign)).length,
    overnight: visibleInRange.filter((f) => f.isOvernight).length,
    ferry: visibleInRange.filter((f) => f.flightCategory === "FERRY").length,
    cancelled: visibleInRange.filter((f) => f.flightCategory === "CANCELLED").length,
  }), [visibleInRange]);

  const filtered = useMemo(() => {
    let xs = visibleInRange;
    if (filter === "private") xs = xs.filter((f) => !isCommercialCallsign(f.callsign));
    if (filter === "commercial") xs = xs.filter((f) => isCommercialCallsign(f.callsign));
    if (filter === "overnight") xs = xs.filter((f) => f.isOvernight);
    if (filter === "ferry") xs = xs.filter((f) => f.flightCategory === "FERRY");
    if (filter === "cancelled") xs = xs.filter((f) => f.flightCategory === "CANCELLED");
    return [...xs].sort((a, b) => {
      if (sortBy === "stand") {
        const pa = a.parking || ""; const pb = b.parking || "";
        if (pa && !pb) return -1;
        if (!pa && pb) return 1;
        if (pa && pb) {
          const cmp = pa.localeCompare(pb, undefined, { numeric: true, sensitivity: "base" });
          if (cmp !== 0) return cmp;
        }
      }
      const ta = toMs(a.arrivalInstant) ?? toMs(a.departureInstant) ?? Number.MAX_SAFE_INTEGER;
      const tb = toMs(b.arrivalInstant) ?? toMs(b.departureInstant) ?? Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
  }, [visibleInRange, filter, sortBy]);

  // Stats agregados sobre la union cacheada — el "now" puede caer en otro dia
  const stats = useMemo(
    () => computeHeaderStats(flights as unknown as FlightLite[], date, now),
    [flights, date, now],
  );

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedFlightId) ?? null,
    [flights, selectedFlightId],
  );

  const nowMs = now.getTime();
  const nowInRange = nowMs >= range.startMs && nowMs <= range.endMs;
  const nowPct = nowPctInRange(now, range);
  const fmt = (d: Date, tz?: string) =>
    d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });

  // ─── Ruler ticks ──────────────────────────────────────────────────
  const stepHours = stepHoursFor(windowHours);
  const ticks = useMemo(() => rulerTicks(range, stepHours), [range, stepHours]);

  // ─── Ocupacion (count por hora cubierta) ─────────────────────────
  const occupancy = useMemo(() => {
    const buckets = rulerTicks(range, 1);
    return buckets.map((t) => {
      const hourStart = t.ms;
      const hourEnd = t.ms + HOUR_MS;
      const count = flights.filter((f) => {
        const iv = flightInterval(f);
        if (!iv) return false;
        return iv.startMs <= hourEnd && iv.endMs >= hourStart;
      }).length;
      return { ms: t.ms, count };
    });
  }, [flights, range]);
  const occupancyPeak = useMemo(() => Math.max(0, ...occupancy.map((o) => o.count)), [occupancy]);

  // ─── Activos ahora / Proximas 2h sobre toda la union ─────────────
  const activeNowCount = useMemo(() => {
    return flights.filter((f) => {
      const iv = flightInterval(f);
      if (!iv) return false;
      return iv.startMs <= nowMs && nowMs <= iv.endMs;
    }).length;
  }, [flights, nowMs]);

  const next2h = useMemo(() => {
    const win = 2 * HOUR_MS;
    let arr = 0, dep = 0;
    for (const f of flights) {
      const a = toMs(f.arrivalInstant);
      const d = toMs(f.departureInstant);
      if (a !== null && a >= nowMs && a <= nowMs + win) arr++;
      if (d !== null && d >= nowMs && d <= nowMs + win) dep++;
    }
    return { arr, dep, total: arr + dep };
  }, [flights, nowMs]);

  // ─── Wheel handlers (pan / zoom) ─────────────────────────────────
  const laneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey || e.ctrlKey) {
        const idx = ZOOM_STEPS.indexOf(windowHours);
        if (idx < 0) return;
        const dir = (e.deltaY + e.deltaX) > 0 ? 1 : -1; // down → bigger window
        const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx + dir));
        if (nextIdx !== idx) setWindowHours(ZOOM_STEPS[nextIdx]);
        return;
      }
      const total = windowHours * HOUR_MS;
      const delta = (e.deltaY + e.deltaX) * total * 0.0008;
      setViewportCenterMs((c) => c + delta);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [windowHours]);

  if (status === "loading" || loading) {
    return <div className="flex h-screen items-center justify-center bg-[#0a0a0a] text-white">Cargando Timeline...</div>;
  }
  return (
    <div className="flex h-screen flex-col bg-[#fafafa] text-sm select-none" style={{ fontFamily: "Inter Tight, system-ui, sans-serif" }}>
      <style>{`@keyframes tlpulse { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>

      {/* SUMMARY band */}
      <div className="flex items-stretch border-b border-gray-200 bg-white px-7">
        <Stat label="Movimientos" value={String(filtered.length)} sub={`${stats.arrivals} LLEG · ${stats.departures} SAL`} />
        <Stat label="Activos ahora" value={String(activeNowCount)} sub="en parking" />
        <Stat label="Próximas 2 h" value={String(next2h.total)} sub={`${next2h.dep} SAL · ${next2h.arr} LLEG`} />
        <Stat label="Servicios pend." value={String(stats.pendingDepServices)} sub="fuel + catering" />
        {stats.alerts > 0 && (
          <Stat label="Alerta" value={String(stats.alerts)} sub="ETD pasada" alert />
        )}

        <div className="ml-auto flex items-center gap-2.5 py-2.5">
          <FilterPill label="Todos" count={filterCounts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterPill label="Privados" count={filterCounts.private} active={filter === "private"} onClick={() => setFilter("private")} />
          <FilterPill label="Comerciales" count={filterCounts.commercial} active={filter === "commercial"} onClick={() => setFilter("commercial")} />
          <FilterPill label="Pernoctas" count={filterCounts.overnight} active={filter === "overnight"} onClick={() => setFilter("overnight")} />
          {filterCounts.ferry > 0 ? (
            <FilterPill label="Ferry" count={filterCounts.ferry} active={filter === "ferry"} onClick={() => setFilter("ferry")} />
          ) : null}
          {filterCounts.cancelled > 0 ? (
            <FilterPill label="Cancelados" count={filterCounts.cancelled} active={filter === "cancelled"} onClick={() => setFilter("cancelled")} />
          ) : null}

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

          <div className="flex items-center bg-gray-100 rounded-md p-0.5" title="Zoom (1/2/3/4/5)">
            {ZOOM_STEPS.map((z) => (
              <button
                key={z}
                onClick={() => setWindowHours(z)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded ${windowHours === z ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                {z}h
              </button>
            ))}
          </div>

          {!nowInRange && (
            <button
              onClick={() => { goToday(); setViewportCenterMs(Date.now()); }}
              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
              title="Centrar en NOW (T)"
            >
              Centrar en ahora
            </button>
          )}
        </div>
      </div>

      {/* MAIN: timeline + panel */}
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white">
          {/* RULER */}
          <div className="grid grid-cols-[320px_1fr] border-b border-gray-200 sticky top-0 z-20 bg-white">
            <div className="flex items-end justify-between px-4 pt-3.5 pb-1.5 bg-[#fafafa] border-r border-gray-200">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Aeronave · {sortBy === "stand" ? "stand" : "hora"}</span>
              <span className="text-[9.5px] text-gray-400" style={{ fontFamily: "JetBrains Mono, monospace" }}>{filtered.length}</span>
            </div>
            <div className="relative h-[52px] overflow-hidden">
              {/* Hours */}
              {ticks.map((t) => {
                const pct = msToPct(t.ms, range);
                if (pct < 0 || pct > 100) return null;
                const d = new Date(t.ms);
                const dd = String(d.getUTCDate()).padStart(2, "0");
                const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
                return (
                  <div key={t.ms} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                    <div className={`absolute left-0 bottom-1 w-px ${t.isMidnight ? "h-4 bg-gray-400" : "h-2 bg-gray-300"}`} />
                    <div
                      className="absolute left-0 bottom-4 -translate-x-1/2 text-[11px] font-medium whitespace-nowrap tabular-nums text-gray-700"
                      style={{ fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {String(t.hour).padStart(2, "0")}
                    </div>
                    {t.isMidnight && (
                      <div
                        className="absolute left-0 -translate-x-1/2 text-[9.5px] font-semibold text-gray-500 whitespace-nowrap"
                        style={{ bottom: "0px", fontFamily: "JetBrains Mono, monospace" }}
                      >
                        {dd}/{mm}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* NOW tag */}
              {nowInRange && (
                <div
                  className="absolute top-1 -translate-x-1/2 px-2 py-0.5 text-[10px] font-bold rounded-full text-white tracking-wider z-10 whitespace-nowrap"
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
                pico {occupancyPeak}/{STANDS}
              </span>
            </div>
            <div className="relative h-10 py-1 overflow-hidden">
              <div className="absolute left-0 right-0 bottom-1 h-px bg-gray-200" />
              <div className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ bottom: `${4 + 0.8 * 28}px` }} />
              {occupancy.map((o) => {
                if (o.count === 0) return null;
                const leftPct = msToPct(o.ms, range);
                const widthPct = msToPct(o.ms + HOUR_MS, range) - leftPct;
                if (leftPct >= 100 || leftPct + widthPct <= 0) return null;
                const ratio = Math.min(1, o.count / STANDS);
                const barH = Math.max(2, ratio * 28);
                const peak = o.count >= Math.ceil(STANDS * 0.8);
                const visibleLeft = Math.max(0, leftPct);
                const visibleWidth = Math.min(100, leftPct + widthPct) - visibleLeft;
                if (visibleWidth <= 0) return null;
                return (
                  <div
                    key={o.ms}
                    className="absolute bottom-1 rounded-t"
                    style={{
                      left: `${visibleLeft + visibleWidth * 0.08}%`,
                      width: `${visibleWidth * 0.84}%`,
                      height: `${barH}px`,
                      background: peak ? "oklch(0.68 0.16 25 / 0.85)" : "oklch(0.7 0.1 245 / 0.7)",
                    }}
                  >
                    {windowHours <= 24 && (
                      <span
                        className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9.5px] font-bold tabular-nums"
                        style={{ fontFamily: "JetBrains Mono, monospace", color: peak ? "oklch(0.45 0.18 25)" : "#6b7280" }}
                      >
                        {o.count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ROWS — lane area que captura el wheel */}
          <div ref={laneRef} className="relative overflow-x-hidden">
            {filtered.map((f) => (
              <FlightRow
                key={f.id}
                flight={f}
                range={range}
                ticks={ticks}
                isSelected={selectedFlightId === f.id}
                onClick={() => setSelectedFlightId(selectedFlightId === f.id ? null : f.id)}
                nowPct={nowPct}
                showNow={nowInRange}
              />
            ))}

            {filtered.length === 0 && (
              <div className="py-20 px-12 text-center">
                <div className="text-[42px] mb-3 opacity-30">✈</div>
                <div className="text-gray-700 font-semibold text-[14px] mb-1">
                  {flights.length === 0 ? "Sin movimientos en la ventana visible" : "Ningún vuelo coincide con el filtro"}
                </div>
                <div className="text-gray-400 text-[12px]">
                  Desplaza la rueda para mover el eje · Shift+rueda para zoom · T para centrar en ahora
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
            onMutated={refetchCached}
            onOpenPaxCrew={(direction) => setPaxCrewModal({ flightId: selectedFlight.id, direction })}
            onDeleted={() => { setSelectedFlightId(null); refetchCached(); }}
          />
        )}
      </main>

      {paxCrewModal && selectedFlight && (
        <PassengerCrewModal
          isOpen={true}
          onClose={() => { setPaxCrewModal(null); refetchCached(); }}
          flightId={paxCrewModal.flightId}
          direction={paxCrewModal.direction}
          flightLabel={`${selectedFlight.callsign} (${selectedFlight.registration})`}
        />
      )}
    </div>
  );
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
  ON_BLOCKS:  "oklch(0.55 0.15 245)",
  TURNAROUND: "oklch(0.78 0.16 85)",
  BOARDING:   "oklch(0.68 0.18 50)",
  OFF_BLOCKS: "#d1d5db",
};

function FlightRow({
  flight, range, ticks, isSelected, onClick, nowPct, showNow,
}: {
  flight: FlightWithRelations;
  range: TimelineRange;
  ticks: { ms: number; hour: number; isMidnight: boolean }[];
  isSelected: boolean;
  onClick: () => void;
  nowPct: number;
  showNow: boolean;
}) {
  const bounds = computeBarBounds(flight, range);
  const pips = bounds ? flightPips(flight, flight.services, bounds, range) : [];
  const operator = getOperatorName(flight.callsign);
  const isPrivate = operator === "Privado";
  const segments = barSegments(flight.state, flight.paxDepState === "BOARDED");

  const nowMs = Date.now();
  const depMs = toMs(flight.departureInstant);
  const isAlert = flight.state !== "DEPARTED" && depMs !== null && depMs < nowMs;
  const isDeparted = flight.state === "DEPARTED" || flight.state === "OFF_BLOCKS";
  const isFuture = flight.state === "EXPECTED";

  const arrMs = toMs(flight.arrivalInstant);
  const etaPct = arrMs !== null ? msToPct(arrMs, range) : null;
  const etdPct = depMs !== null ? msToPct(depMs, range) : null;

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
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="text-[14.5px] font-semibold leading-tight -tracking-[0.01em] text-gray-900" style={{ fontFamily: "JetBrains Mono, monospace" }}>{flight.registration}</div>
            <div className="text-[11.5px] font-semibold leading-tight" style={{ color: "oklch(0.5 0.14 245)", fontFamily: "JetBrains Mono, monospace" }}>{flight.callsign}</div>
            <RqstChip rqstNumber={flight.rqstNumber} />
            <CategoryPill
              category={(flight.flightCategory || "COMMERCIAL") as FlightCategory}
              modified={flight.modifiedFlag}
            />
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
          <PetCount count={flight.petCount || 0} />
        </div>
      </div>

      {/* LANE */}
      <div className="relative">
        {/* hour grid lines — mas marcadas en medianoche */}
        {ticks.map((t) => {
          const pct = msToPct(t.ms, range);
          if (pct < 0 || pct > 100) return null;
          return (
            <div
              key={t.ms}
              className="absolute top-0 bottom-0 w-px"
              style={{ left: `${pct}%`, background: t.isMidnight ? "#d1d5db" : "oklch(0.95 0 0)" }}
            />
          );
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

        {/* NOW LINE per row */}
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

