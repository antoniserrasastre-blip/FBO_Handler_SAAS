// CompactFlightGrid — vista compacta de la Lista (/).
//
// Reparte los movimientos del día en dos zonas — 🛬 Llegadas / 🛫 Salidas — con
// tarjetas densas. La clasificación es por MOVIMIENTO (fecha de llegada/salida vs
// el día de la hoja), no por estado: una pernocta que llegó otro día y sale hoy
// aparece sólo en Salidas; un turnaround del día aparece en ambas zonas.
//
// Cada tarjeta abre la VisitCard completa (con sus acciones reales) vía onOpen.

"use client";

import { useMemo } from "react";
import type { Flight, Service } from "@/types/compat";
import { FLIGHT_STATE_CONFIG, normalizeFlightState } from "@/types";
import { PlaneLanding, PlaneTakeoff, ChevronDown } from "lucide-react";

type GridFlight = Flight & { services?: Service[] };

// Colores de dirección (inline para no depender de la paleta purgada de Tailwind).
const ARR_COLOR = "#0284c7"; // llegada
const DEP_COLOR = "#059669"; // salida

function stateColor(state: string): string {
  return FLIGHT_STATE_CONFIG[normalizeFlightState(state)]?.color ?? "#9CA3AF";
}
function pendingServices(f: GridFlight): number {
  return (f.services || []).filter((s) => s.state !== "DELIVERED").length;
}
// Comparación "DD/MM" robusta (la API emite arrival/departureDate en ese formato).
function ddMm(v: string | null | undefined): string {
  return (v || "").slice(0, 5);
}
function isArrivalToday(f: GridFlight, sheetDdMm: string): boolean {
  return !!f.arrivalDate && ddMm(f.arrivalDate) === sheetDdMm;
}
function isDepartureToday(f: GridFlight, sheetDdMm: string): boolean {
  return !!f.departureDate && ddMm(f.departureDate) === sheetDdMm;
}
function legInfo(
  f: GridFlight,
  dir: "ARR" | "DEP",
): { airport: string; time: string; city: string | null } {
  return dir === "ARR"
    ? { airport: f.origin || "----", time: f.eta || "--:--", city: f.originCity || null }
    : { airport: f.destination || "----", time: f.etd || "--:--", city: f.destCity || null };
}
// Tripulación y pasaje del leg de hoy: real (override del handler) si existe, si no el estimado del import.
function legCounts(f: GridFlight, dir: "ARR" | "DEP"): { pax: number; crew: number } {
  return dir === "ARR"
    ? { pax: f.paxArrivalReal ?? f.paxArrival ?? 0, crew: f.crewArrivalReal ?? f.crewArrival ?? 0 }
    : { pax: f.paxDepartureReal ?? f.paxDeparture ?? 0, crew: f.crewDepartureReal ?? f.crewDeparture ?? 0 };
}

// Estados en orden de ciclo de vida (subgrupos dentro de cada zona).
const STATE_ORDER: { key: string; label: string }[] = [
  { key: "EXPECTED", label: "Esperando llegada" },
  { key: "ON_BLOCKS", label: "En calzos" },
  { key: "PARKED", label: "En plataforma" },
  { key: "TURNAROUND", label: "Preparación salida" },
  { key: "BOARDING", label: "Embarque" },
  { key: "OFF_BLOCKS", label: "Fuera de calzos" },
];
function groupByState(flights: GridFlight[]): Record<string, GridFlight[]> {
  const m: Record<string, GridFlight[]> = {};
  for (const f of flights) (m[normalizeFlightState(f.state)] ||= []).push(f);
  return m;
}

const DIRECTIONS = [
  { dir: "ARR" as const, label: "Llegadas", color: ARR_COLOR, Icon: PlaneLanding },
  { dir: "DEP" as const, label: "Salidas", color: DEP_COLOR, Icon: PlaneTakeoff },
];

// Tarjeta densa: matrícula + (aeropuerto del leg que toca) + hora secundaria.
// El `dir` lo fija la zona, no el estado, para que el leg mostrado sea el de hoy.
function FlightChip({
  f,
  dir,
  selected,
  onOpen,
}: {
  f: GridFlight;
  dir: "ARR" | "DEP";
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const arr = dir === "ARR";
  const dirColor = arr ? ARR_COLOR : DEP_COLOR;
  const leg = legInfo(f, dir);
  const counts = legCounts(f, dir);
  return (
    <button
      id={`flight-${f.id}`}
      onClick={() => onOpen(f.id)}
      className="flex flex-col items-stretch gap-1 rounded-lg border-l-4 bg-bg-surface p-2 text-left shadow-sm active:scale-[0.97]"
      style={{
        borderLeftColor: stateColor(f.state),
        boxShadow: selected ? `0 0 0 2px ${dirColor}` : undefined,
      }}
    >
      {/* Fila 1: matrícula + servicios pendientes (izq) · aeropuerto del leg (der, a la altura de la matrícula) */}
      <span className="flex items-center justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate font-mono text-sm font-bold text-ink-1">{f.registration}</span>
          {pendingServices(f) > 0 ? (
            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-warning-bg px-1 text-[9px] font-bold text-warning-strong">
              {pendingServices(f)}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 font-mono text-base font-bold leading-none text-ink-1">{leg.airport}</span>
      </span>
      {/* Fila 2: dirección (izq) · ciudad del aeropuerto en lenguaje natural (der, bajo el ICAO) */}
      <span className="flex items-center gap-1">
        {arr ? (
          <PlaneLanding size={14} className="shrink-0" style={{ color: dirColor }} aria-label="Llegada" />
        ) : (
          <PlaneTakeoff size={14} className="shrink-0" style={{ color: dirColor }} aria-label="Salida" />
        )}
        <span className="text-[10px] font-bold uppercase" style={{ color: dirColor }}>
          {arr ? "Lleg" : "Sal"}
        </span>
        {leg.city ? (
          <span className="ml-auto min-w-0 truncate text-[9px] font-normal text-ink-muted" title={leg.city}>
            {leg.city}
          </span>
        ) : null}
      </span>
      {/* Fila 3: hora (izq, secundaria) + pasaje/tripulación del leg (der) */}
      <span className="flex items-center justify-between text-[10px] text-ink-muted">
        <span className="tabular-nums">{leg.time}</span>
        <span className="tabular-nums font-medium text-ink-2">
          {counts.pax}P <span className="text-ink-disabled">·</span> {counts.crew}T
        </span>
      </span>
    </button>
  );
}

function ChipGrid({
  list,
  dir,
  selectedId,
  onOpen,
}: {
  list: GridFlight[];
  dir: "ARR" | "DEP";
  selectedId: string | null | undefined;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {list.map((f) => (
        <FlightChip key={f.id} f={f} dir={dir} selected={selectedId === f.id} onOpen={onOpen} />
      ))}
    </div>
  );
}

export interface CompactFlightGridProps {
  flights: GridFlight[];
  /** Día de la hoja en "DD/MM" (= shortDate(date)). */
  sheetDdMm: string;
  /** Vuelo resaltado (navegación por teclado de la Lista). */
  selectedId?: string | null;
  /** Abre el detalle (VisitCard) del vuelo pulsado. */
  onOpen: (id: string) => void;
}

export function CompactFlightGrid({ flights, sheetDdMm, selectedId, onOpen }: CompactFlightGridProps) {
  const byDir = useMemo(
    () => ({
      ARR: flights.filter((f) => isArrivalToday(f, sheetDdMm)),
      DEP: flights.filter((f) => isDepartureToday(f, sheetDdMm)),
    }),
    [flights, sheetDdMm],
  );

  return (
    <div className="space-y-4">
      {DIRECTIONS.map(({ dir, label, color, Icon }) => {
        const list = byDir[dir];
        if (list.length === 0) return null;
        const groups = groupByState(list);
        const present = STATE_ORDER.filter((g) => (groups[g.key] || []).length > 0);
        // Un solo estado (típico en Llegadas) → rejilla directa; varios → subgrupos.
        const subgroup = present.length > 1;
        return (
          <section key={dir} className="overflow-hidden rounded-xl border-2" style={{ borderColor: color }}>
            <header
              className="flex items-center gap-2 px-3 py-2 text-sm font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: color }}
            >
              <Icon size={17} aria-hidden />
              {label}
              <span className="rounded-full bg-white/25 px-1.5 text-xs">{list.length}</span>
            </header>
            <div className="space-y-2 p-2">
              {subgroup ? (
                present.map((g) => (
                  <details key={g.key} open className="rounded-lg border border-line-subtle">
                    <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs font-semibold text-ink-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stateColor(g.key) }} />
                      {g.label}
                      <span className="rounded-full bg-bg-muted px-1.5 text-[11px] text-ink-3">
                        {(groups[g.key] || []).length}
                      </span>
                      <ChevronDown size={14} className="ml-auto text-ink-disabled" />
                    </summary>
                    <div className="px-2 pb-2">
                      <ChipGrid list={groups[g.key] || []} dir={dir} selectedId={selectedId} onOpen={onOpen} />
                    </div>
                  </details>
                ))
              ) : (
                <ChipGrid list={list} dir={dir} selectedId={selectedId} onOpen={onOpen} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
