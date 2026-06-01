// ⚠️ PROTOTIPO DESECHABLE — NO ES PRODUCCIÓN ⚠️
// =============================================================================
// Pregunta que responde: "¿Cómo debería verse una tercera densidad ultra-compacta
// (rejilla de chips) para reducir el scroll en móvil, abriendo el VisitCard real
// en una ventana emergente al tocar un chip?"
//
// Tres variantes de rejilla conmutables desde `?variant=A|B|C` + la barra
// flotante inferior. Reutiliza la API real (/api/flights) para tener densidad
// realista, y monta el VisitCard real dentro de un modal.
//
// Cuando una variante gane: anota cuál y por qué (commit / NOTES) y pliega la
// ganadora en page.tsx como una tercera densidad. Luego BORRA esta carpeta
// entera (src/app/prototype/compact-grid) y la barra.
//
// Sin tests, sin manejo de errores más allá de lo justo para que arranque, sin
// persistencia: los toggles de servicio/estado viven en memoria (stub).
// =============================================================================
"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Flight, Service, LostItem, EventLog } from "@/types/compat";
import { FLIGHT_STATE_CONFIG, normalizeFlightState } from "@/types";
import { VisitCard } from "@/components/VisitCard";
import { dateToSqlString } from "@/lib/time";
import { ChevronLeft, ChevronRight, X, ChevronDown, PlaneLanding, PlaneTakeoff } from "lucide-react";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

type PeopleByVisit = Record<
  string,
  {
    passengers: Array<{ id: string; fullName: string; direction: string; nationality?: string | null; passportNumber: string | null; status: string; verified: boolean }>;
    crew: Array<{ id: string; fullName: string; direction: string; role: string; passportNumber: string | null; nationality?: string | null }>;
    paxSource: string | null;
  }
>;

const VARIANTS = ["A", "B", "C"] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<Variant, string> = {
  A: "Matrícula pura (máxima densidad)",
  B: "Chip con contexto (2 col)",
  C: "Agrupado por estado (carpetas)",
};

// --- helpers ---------------------------------------------------------------
function stateColor(state: string): string {
  return FLIGHT_STATE_CONFIG[normalizeFlightState(state)]?.color ?? "#9CA3AF";
}
function stateLabel(state: string): string {
  return FLIGHT_STATE_CONFIG[normalizeFlightState(state)]?.label ?? state;
}
// Hora "relevante": si ya salió usamos ETD; si no, la próxima (ETA si aún no
// llegó, ETD si está en tierra). Para el prototipo basta una heurística simple.
function primaryTime(f: FlightWithRelations): string {
  const norm = normalizeFlightState(f.state);
  if (norm === "EXPECTED") return f.eta || f.etd || "--:--";
  return f.etd || f.eta || "--:--";
}
function pendingServices(f: FlightWithRelations): number {
  return (f.services || []).filter((s) => s.state !== "DELIVERED").length;
}
// Colores de dirección (inline para no depender de la paleta purgada de Tailwind).
const ARR_COLOR = "#0284c7"; // llegada
const DEP_COLOR = "#059669"; // salida
// Leg "relevante": si aún no ha llegado, lo que importa es la LLEGADA (de dónde
// viene, origen); una vez en tierra, lo que importa es la SALIDA (a dónde va,
// destino). La hora es secundaria.
function primaryLeg(f: FlightWithRelations): { dir: "ARR" | "DEP"; airport: string; time: string } {
  if (normalizeFlightState(f.state) === "EXPECTED") {
    return { dir: "ARR", airport: f.origin || "----", time: f.eta || "--:--" };
  }
  return { dir: "DEP", airport: f.destination || "----", time: f.etd || "--:--" };
}

export default function CompactGridPrototypePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const searchParams = useSearchParams();
  const variant = (VARIANTS as readonly string[]).includes(searchParams.get("variant") || "")
    ? (searchParams.get("variant") as Variant)
    : "A";

  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [people, setPeople] = useState<PeopleByVisit>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const dateStr = dateToSqlString(new Date());
        const res = await fetch(`/api/flights?date=${dateStr}&include=people`);
        if (res.ok) {
          const data = await res.json();
          setFlights(data.flights || []);
          setPeople(data.people || {});
        }
      } catch {
        // prototipo: ignoramos errores de red
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Stub en memoria: togglear servicios/estado actualiza el estado local sin
  // tocar el backend (anti-patrón del prototipo: no cablear mutaciones reales).
  const patchFlight = useCallback((id: string, data: Partial<Flight>) => {
    setFlights((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
  }, []);
  const toggleService = useCallback((serviceId: string, newState: string) => {
    setFlights((prev) =>
      prev.map((f) => ({
        ...f,
        services: (f.services || []).map((s) => (s.id === serviceId ? { ...s, state: newState } : s)),
      })),
    );
  }, []);

  const open = openId ? flights.find((f) => f.id === openId) ?? null : null;

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line-subtle bg-amber-50 px-4 py-2 text-xs text-amber-900">
        <strong>PROTOTIPO</strong> · rejilla compacta · variante <strong>{variant}</strong> — {VARIANT_NAMES[variant]}
        {" · "}
        {loading ? "cargando…" : `${flights.length} vuelos (hoy, datos reales)`}
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4">
        {loading ? (
          <p className="text-ink-3">Cargando…</p>
        ) : flights.length === 0 ? (
          <p className="text-ink-3">No hay vuelos hoy. Prueba en un día con tráfico para ver la densidad.</p>
        ) : variant === "A" ? (
          <VariantA flights={flights} onOpen={setOpenId} />
        ) : variant === "B" ? (
          <VariantB flights={flights} onOpen={setOpenId} />
        ) : (
          <VariantC flights={flights} onOpen={setOpenId} />
        )}
      </main>

      {/* Modal con el VisitCard REAL flotando sobre la rejilla */}
      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center"
          onClick={() => setOpenId(null)}
        >
          <div
            className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-bg p-3 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="absolute right-2 top-2 z-10 rounded-full bg-bg-muted p-1.5 text-ink-2 hover:bg-bg-sunken"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <VisitCard
              flight={open}
              passengers={people[open.id]?.passengers || []}
              crew={people[open.id]?.crew || []}
              paxSource={people[open.id]?.paxSource || null}
              onUpdate={patchFlight}
              onServiceToggle={toggleService}
            />
          </div>
        </div>
      ) : null}

      <PrototypeSwitcher current={variant} />
    </div>
  );
}

// Estados en orden de ciclo de vida — compartido por A (fusionada) y C.
const STATE_ORDER: { key: string; label: string }[] = [
  { key: "EXPECTED", label: "Esperando llegada" },
  { key: "ON_BLOCKS", label: "En calzos" },
  { key: "PARKED", label: "En plataforma" },
  { key: "TURNAROUND", label: "Preparación salida" },
  { key: "BOARDING", label: "Embarque" },
  { key: "OFF_BLOCKS", label: "Fuera de calzos" },
];

function groupByState(flights: FlightWithRelations[]): Record<string, FlightWithRelations[]> {
  const m: Record<string, FlightWithRelations[]> = {};
  for (const f of flights) (m[normalizeFlightState(f.state)] ||= []).push(f);
  return m;
}

// Tarjeta densa: matrícula + (llegada/salida + aeropuerto relevante) + hora 2ª.
function FlightChipA({ f, onOpen }: { f: FlightWithRelations; onOpen: (id: string) => void }) {
  const leg = primaryLeg(f);
  const arr = leg.dir === "ARR";
  const dirColor = arr ? ARR_COLOR : DEP_COLOR;
  return (
    <button
      onClick={() => onOpen(f.id)}
      className="flex flex-col items-stretch gap-1 rounded-lg border-l-4 bg-white p-2 text-left shadow-sm active:scale-[0.97]"
      style={{ borderLeftColor: stateColor(f.state) }}
    >
      {/* Fila 1: matrícula + servicios pendientes */}
      <span className="flex items-center justify-between">
        <span className="truncate font-mono text-sm font-bold text-ink-1">{f.registration}</span>
        {pendingServices(f) > 0 ? (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-bg px-1 text-[9px] font-bold text-warning-strong">
            {pendingServices(f)}
          </span>
        ) : null}
      </span>
      {/* Fila 2: lo que importa — llegada/salida + aeropuerto relevante */}
      <span className="flex items-center gap-1">
        {arr ? (
          <PlaneLanding size={14} className="shrink-0" style={{ color: dirColor }} aria-label="Llegada" />
        ) : (
          <PlaneTakeoff size={14} className="shrink-0" style={{ color: dirColor }} aria-label="Salida" />
        )}
        <span className="text-[10px] font-bold uppercase" style={{ color: dirColor }}>
          {arr ? "Lleg" : "Sal"}
        </span>
        <span className="ml-auto truncate font-mono text-base font-bold leading-none text-ink-1">
          {leg.airport}
        </span>
      </span>
      {/* Fila 3: hora, secundaria */}
      <span className="tabular-nums text-[10px] text-ink-muted">{leg.time}</span>
    </button>
  );
}

// Rejilla densa de tarjetas (reutilizada en cada subgrupo de estado).
function ChipGrid({ list, onOpen }: { list: FlightWithRelations[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {list.map((f) => (
        <FlightChipA key={f.id} f={f} onOpen={onOpen} />
      ))}
    </div>
  );
}

// Dos zonas de primer nivel: separan llegadas de salidas de un vistazo.
const DIRECTIONS = [
  { dir: "ARR" as const, label: "Llegadas", color: ARR_COLOR, Icon: PlaneLanding },
  { dir: "DEP" as const, label: "Salidas", color: DEP_COLOR, Icon: PlaneTakeoff },
];

// ─── Variante A (fusionada) — zonas LLEGADAS / SALIDAS, subgrupos por estado ──
function VariantA({ flights, onOpen }: { flights: FlightWithRelations[]; onOpen: (id: string) => void }) {
  const byDir = useMemo(() => {
    const m: Record<"ARR" | "DEP", FlightWithRelations[]> = { ARR: [], DEP: [] };
    for (const f of flights) m[primaryLeg(f).dir].push(f);
    return m;
  }, [flights]);

  return (
    <div className="space-y-4">
      {DIRECTIONS.map(({ dir, label, color, Icon }) => {
        const list = byDir[dir];
        if (list.length === 0) return null;
        const groups = groupByState(list);
        const present = STATE_ORDER.filter((g) => (groups[g.key] || []).length > 0);
        // Si solo hay un estado (caso típico de Llegadas), rejilla directa sin
        // subcabecera redundante; si hay varios (Salidas), subgrupos por estado.
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
                      <ChipGrid list={groups[g.key] || []} onOpen={onOpen} />
                    </div>
                  </details>
                ))
              ) : (
                <ChipGrid list={list} onOpen={onOpen} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── Variante B — chip con contexto, 2 columnas, más información ─────────────
function VariantB({ flights, onOpen }: { flights: FlightWithRelations[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {flights.map((f) => (
        <button
          key={f.id}
          onClick={() => onOpen(f.id)}
          className="flex items-center gap-2 rounded-lg border-l-4 bg-white px-3 py-2 text-left shadow-sm active:scale-[0.99]"
          style={{ borderLeftColor: stateColor(f.state) }}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: stateColor(f.state) }}
            title={stateLabel(f.state)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-base font-bold text-ink-1">{f.registration}</span>
              <span className="truncate text-[11px] text-ink-muted">{f.aircraftType}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-ink-3">
              <span className="text-ink-muted">{f.origin || "----"}</span>
              <span className="tabular-nums">{f.eta || "--:--"}</span>
              <ChevronRight size={11} className="text-ink-disabled" />
              <span className="text-ink-muted">{f.destination || "----"}</span>
              <span className="tabular-nums">{f.etd || "--:--"}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {f.parking ? (
              <span className="rounded bg-bg-muted px-1 text-[10px] font-medium text-ink-2">{f.parking}</span>
            ) : null}
            {pendingServices(f) > 0 ? (
              <span className="rounded-full bg-warning-bg px-1.5 text-[10px] font-bold text-warning-strong">
                {pendingServices(f)} svc
              </span>
            ) : null}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Variante C — agrupado por estado, secciones colapsables ("carpetas") ────
function VariantC({ flights, onOpen }: { flights: FlightWithRelations[]; onOpen: (id: string) => void }) {
  const groups = useMemo(() => groupByState(flights), [flights]);

  return (
    <div className="space-y-3">
      {STATE_ORDER.map((g) => {
        const list = groups[g.key] || [];
        if (list.length === 0) return null;
        return (
          <details key={g.key} open className="rounded-lg border border-line-subtle bg-white">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold text-ink-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stateColor(g.key) }} />
              {g.label}
              <span className="rounded-full bg-bg-muted px-1.5 text-xs text-ink-3">{list.length}</span>
              <ChevronDown size={15} className="ml-auto text-ink-disabled" />
            </summary>
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {list.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onOpen(f.id)}
                  className="flex items-center gap-1.5 rounded-md bg-bg-subtle px-2 py-1 active:scale-[0.97]"
                >
                  <span className="font-mono text-sm font-bold text-ink-1">{f.registration}</span>
                  <span className="tabular-nums text-[11px] text-ink-3">{primaryTime(f)}</span>
                  {pendingServices(f) > 0 ? (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-bg px-1 text-[9px] font-bold text-warning-strong">
                      {pendingServices(f)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

// ─── Barra flotante de variantes (oculta en producción) ──────────────────────
function PrototypeSwitcher({ current }: { current: Variant }) {
  const router = useRouter();

  const go = useCallback(
    (dir: 1 | -1) => {
      const idx = VARIANTS.indexOf(current);
      const next = VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length];
      router.replace(`/prototype/compact-grid?variant=${next}`);
    },
    [current, router],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [go]);

  // Prototipo: barra visible también en producción a propósito — la ruta es
  // oculta (/prototype/compact-grid) y solo-dev sin usuarios. Se borra junto
  // con la carpeta cuando gane una variante.
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-1 px-2 py-1.5 text-white shadow-xl ring-1 ring-black/20">
      <button onClick={() => go(-1)} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Variante anterior">
        <ChevronLeft size={18} />
      </button>
      <span className="px-1 text-xs font-medium tabular-nums">
        {current} — {VARIANT_NAMES[current]}
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Variante siguiente">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
