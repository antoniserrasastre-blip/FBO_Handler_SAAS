"use client";

import { Suspense, useEffect, useState, useCallback, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { useSession } from "next-auth/react";
import { Flight, Service, EventLog, LostItem } from "@/types/compat";
import { dateToSqlString } from "@/lib/time";
import { useEventStream } from "@/hooks/useEventStream";
import { ServicePip, Stat, StatBand, useDate } from "@/components/helix";
import { QuickTimeEdit } from "@/components/QuickTimeEdit";
import { InlineTextEdit } from "@/components/InlineTextEdit";
import { PassengerCrewModal } from "@/components/PassengerCrewModal";
import { FlightDetailPanel } from "./FlightDetailPanel";
import {
  STATE_DOT_CLASS,
  SEGMENT_CELL_CLASS,
  arrivalSegmentState,
  departureSegmentState,
  deriveATA,
  deriveATD,
  computeHeaderStats,
  type FlightLite,
} from "./diaHelpers";

export const dynamic = "force-dynamic";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

type PipState = "ok" | "req" | "no" | "hide";

function fuelPip(state: string | null | undefined): PipState {
  if (!state || state === "NONE") return "hide";
  if (state === "SERVED" || state === "DELIVERED" || state === "COMPLETED") return "ok";
  if (state === "REQUESTED" || state === "ARRIVED") return "req";
  return "no";
}

function servicePip(flight: FlightWithRelations, type: string): PipState {
  const svc = flight.services.find((s) => s.type === type);
  if (!svc) return "hide";
  if (svc.state === "DELIVERED" || svc.state === "COMPLETED" || svc.state === "SERVED") return "ok";
  if (svc.state === "ARRIVED" || svc.state === "REQUESTED") return "req";
  return "no";
}

export default function DiaPage() {
  return (
    <Suspense fallback={null}>
      <DiaPageInner />
    </Suspense>
  );
}

function DiaPageInner() {
  const { status } = useSession();
  const { date } = useDate();
  const [flights, setFlights] = useState<FlightWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paxCrewModal, setPaxCrewModal] = useState<{ flightId: string; direction: "ARRIVAL" | "DEPARTURE" } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Reset on date change so we don't render stale rows.
  useEffect(() => {
    setFlights([]);
    setLoading(true);
  }, [date]);

  const fetchFlights = useCallback(async () => {
    try {
      const dateStr = dateToSqlString(date);
      const res = await fetch(`/api/flights?date=${dateStr}`);
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

  useEffect(() => {
    if (status === "authenticated") fetchFlights();
  }, [status, fetchFlights]);

  useEventStream({ onEvent: () => fetchFlights(), enabled: status === "authenticated" });

  // ESC closes the side panel
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedId]);

  /** Optimistic PATCH on a Flight — rolls back via re-fetch on failure. */
  const patchFlight = useCallback(async (id: string, data: Partial<Flight>) => {
    setFlights((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
    try {
      const res = await fetch(`/api/flights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`PATCH ${res.status}`);
      fetchFlights();
    } catch (err) {
      console.error("[dia] patch failed", err);
      fetchFlights();
    }
  }, [fetchFlights]);

  const stats = useMemo(
    () => computeHeaderStats(flights as unknown as FlightLite[], date, now),
    [flights, date, now],
  );

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedId) ?? null,
    [flights, selectedId],
  );

  const cycleFuel = useCallback(async (f: FlightWithRelations) => {
    const next =
      f.fuelState === "NOT_REQUESTED" ? "REQUESTED" : f.fuelState === "REQUESTED" ? "SERVED" : "NOT_REQUESTED";
    patchFlight(f.id, { fuelState: next });
  }, [patchFlight]);

  const cycleToilet = useCallback(async (f: FlightWithRelations) => {
    const next =
      f.toiletState === "NOT_REQUESTED" ? "REQUESTED" : f.toiletState === "REQUESTED" ? "COMPLETED" : "NOT_REQUESTED";
    patchFlight(f.id, { toiletState: next });
  }, [patchFlight]);

  const cycleCateringService = useCallback(async (f: FlightWithRelations) => {
    const svc = f.services.find((s) => s.type === "CATERING");
    if (!svc) return;
    const next = svc.state === "PENDING" ? "ARRIVED" : svc.state === "ARRIVED" ? "DELIVERED" : "PENDING";
    setFlights((prev) =>
      prev.map((x) =>
        x.id === f.id
          ? { ...x, services: x.services.map((s) => (s.id === svc.id ? { ...s, state: next } : s)) }
          : x,
      ),
    );
    try {
      await fetch(`/api/services/${svc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: next }),
      });
    } catch (err) {
      console.error("cycleCateringService failed:", err);
      fetchFlights();
    }
  }, [fetchFlights]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center bg-bg text-ink-3">
        Cargando Tablón…
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-96px)] flex-col bg-bg text-sm select-none">
      {/* KPI band */}
      <StatBand>
        <Stat label="Llegadas" value={stats.arrivals} />
        <Stat label="Salidas" value={stats.departures} />
        <Stat label="Pendientes" value={stats.pendingDepServices} sub={stats.pendingDepServices > 0 ? "servicios" : "sin pendientes"} />
        {stats.approaching > 0 ? (
          <Stat label="Aprox" value={stats.approaching} sub="en ruta" />
        ) : null}
        {stats.alerts > 0 ? (
          <Stat label="Alerta" value={stats.alerts} sub="atención" tone="alert" />
        ) : null}
      </StatBand>

      {/* Date nav + brand chrome + clocks all live in the global Helix
          AppShell. /dia only ships the data surface. */}

      {/* Body: table + side panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="flex-1 overflow-auto bg-bg">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-20 bg-bg-subtle">
              <tr className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 28 }}>ST</th>
                {/* LLEGADA */}
                <th className="border-b border-l border-line px-2 py-1.5 text-left font-semibold" style={{ width: 96 }}>Vuelo llegada</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>Origen</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>ETA Z</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>ATA Z</th>
                {/* AVIÓN */}
                <th className="border-b border-l border-line px-2 py-1.5 text-center font-semibold" style={{ width: 96 }}>Matrícula</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>Tipo</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>Stand</th>
                {/* SVC */}
                <th className="border-b border-l border-line px-1 py-1.5 text-center font-semibold" style={{ width: 36 }} title="Fuel">F</th>
                <th className="border-b border-line px-1 py-1.5 text-center font-semibold" style={{ width: 36 }} title="Catering">C</th>
                <th className="border-b border-line px-1 py-1.5 text-center font-semibold" style={{ width: 36 }} title="Lavatory">T</th>
                {/* SALIDA */}
                <th className="border-b border-l border-line px-2 py-1.5 text-left font-semibold" style={{ width: 96 }}>Vuelo salida</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>Destino</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>ETD Z</th>
                <th className="border-b border-line px-2 py-1.5 text-center font-semibold" style={{ width: 56 }}>ATD Z</th>
                {/* PAX */}
                <th className="border-b border-l border-line px-2 py-1.5 text-center font-semibold">P · C</th>
              </tr>
            </thead>
            <tbody className="font-mono [font-variant-numeric:tabular-nums]">
              {flights.map((f) => {
                const isSelected = selectedId === f.id;
                const fLite = f as unknown as FlightLite;
                const arrState = arrivalSegmentState(fLite, date, now);
                const depState = departureSegmentState(fLite, date, now);
                const arrCellCls = arrState ? SEGMENT_CELL_CLASS[arrState] : "";
                const depCellCls = depState ? SEGMENT_CELL_CLASS[depState] : "";
                const ata = deriveATA(fLite);
                const atd = deriveATD(fLite);
                const dotCls = STATE_DOT_CLASS[f.state] ?? "bg-gray-300";

                return (
                  <tr
                    key={f.id}
                    onClick={() => setSelectedId(isSelected ? null : f.id)}
                    className={[
                      "cursor-pointer transition-colors",
                      isSelected
                        ? "bg-brand-tint shadow-[inset_3px_0_0_var(--c-brand)]"
                        : "hover:bg-bg-subtle",
                    ].join(" ")}
                  >
                    {/* Status dot */}
                    <td className="border-b border-line-subtle px-2 py-1.5 text-center">
                      <span className={`mx-auto block h-2.5 w-2.5 rounded-full ${dotCls}`} />
                    </td>

                    {/* LLEGADA */}
                    <td className={`border-b border-l border-line-subtle px-2 py-1.5 font-semibold ${arrCellCls || "text-ink-1"}`}>
                      {f.callsign}
                    </td>
                    <td className={`border-b border-line-subtle px-2 py-1.5 text-center ${arrCellCls || "text-ink-2"}`}>
                      {f.origin}
                    </td>
                    <td className={`border-b border-line-subtle px-2 py-1.5 text-center font-semibold ${arrCellCls || "text-ink-1"}`}>
                      <QuickTimeEdit
                        value={f.eta}
                        onSave={(v) => patchFlight(f.id, { eta: v })}
                      />
                    </td>
                    <td className={`border-b border-line-subtle px-2 py-1.5 text-center ${arrCellCls || (ata ? "text-ink-1" : "text-ink-disabled")}`}>
                      <QuickTimeEdit
                        value={ata}
                        onSave={(v) => patchFlight(f.id, { ata: v })}
                      />
                    </td>

                    {/* AVIÓN */}
                    <td className="border-b border-l border-line-subtle px-2 py-1.5 text-center">
                      <span className="inline-block rounded border border-line bg-bg px-1.5 py-px font-semibold tracking-tight text-ink-1">
                        {f.registration}
                      </span>
                    </td>
                    <td className="border-b border-line-subtle px-2 py-1.5 text-center text-ink-3">
                      {f.aircraftType}
                    </td>
                    <td className="border-b border-line-subtle px-2 py-1.5 text-center">
                      <InlineTextEdit
                        value={f.parking || ""}
                        onSave={(v) => patchFlight(f.id, { parking: v })}
                        placeholder="tbd"
                        stopPropagation
                        className="font-semibold text-ink-1"
                        inputClassName="text-center"
                      />
                    </td>

                    {/* SVC pips — click cycles state */}
                    <PipCell
                      state={fuelPip(f.fuelState)}
                      service="fuel"
                      onCycle={(ev) => { ev.stopPropagation(); cycleFuel(f); }}
                    />
                    <PipCell
                      state={servicePip(f, "CATERING")}
                      service="catering"
                      onCycle={(ev) => { ev.stopPropagation(); cycleCateringService(f); }}
                    />
                    <PipCell
                      state={fuelPip(f.toiletState)}
                      service="lavatory"
                      onCycle={(ev) => { ev.stopPropagation(); cycleToilet(f); }}
                    />

                    {/* SALIDA */}
                    <td className={`border-b border-l border-line-subtle px-2 py-1.5 font-semibold ${depCellCls || "text-ink-1"}`}>
                      {f.callsign}
                    </td>
                    <td className={`border-b border-line-subtle px-2 py-1.5 text-center ${depCellCls || "text-ink-2"}`}>
                      {f.destination}
                    </td>
                    <td className={`border-b border-line-subtle px-2 py-1.5 text-center font-semibold ${depCellCls || "text-ink-1"}`}>
                      <QuickTimeEdit
                        value={f.etd}
                        onSave={(v) => patchFlight(f.id, { etd: v })}
                      />
                    </td>
                    <td className={`border-b border-line-subtle px-2 py-1.5 text-center ${depCellCls || (atd ? "text-ink-1" : "text-ink-disabled")}`}>
                      <QuickTimeEdit
                        value={atd}
                        onSave={(v) => patchFlight(f.id, { atd: v })}
                      />
                    </td>

                    {/* PAX / CREW */}
                    <td className="whitespace-nowrap border-b border-l border-line-subtle px-2 py-1.5 text-center">
                      <span className="text-ink-1">{f.paxArrival}·{f.paxDeparture}</span>
                      <span className="mx-1.5 text-ink-disabled">/</span>
                      <span className="text-ink-3">{f.crewArrival}·{f.crewDeparture}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {flights.length === 0 ? (
            <div className="p-12 text-center italic text-ink-muted">
              No hay vuelos registrados para este día.
            </div>
          ) : null}
        </main>

        {selectedFlight ? (
          <FlightDetailPanel
            flight={selectedFlight}
            onClose={() => setSelectedId(null)}
            onMutated={fetchFlights}
            onOpenPaxCrew={(direction) => setPaxCrewModal({ flightId: selectedFlight.id, direction })}
            onDeleted={() => { setSelectedId(null); fetchFlights(); }}
          />
        ) : null}
      </div>

      {paxCrewModal && selectedFlight ? (
        <PassengerCrewModal
          isOpen={true}
          flightId={paxCrewModal.flightId}
          direction={paxCrewModal.direction}
          flightLabel={`${selectedFlight.callsign} (${selectedFlight.registration})`}
          onClose={() => { setPaxCrewModal(null); fetchFlights(); }}
        />
      ) : null}
    </div>
  );
}

function PipCell({
  state,
  service,
  onCycle,
}: {
  state: PipState;
  service: "fuel" | "catering" | "lavatory";
  onCycle?: (ev: ReactMouseEvent) => void;
}) {
  if (state === "hide") {
    return (
      <td className="border-b border-line-subtle px-1 py-1 text-center align-middle">
        <span className="text-[10px] text-ink-disabled">·</span>
      </td>
    );
  }
  return (
    <td className="border-b border-line-subtle px-1 py-1 text-center align-middle">
      <button
        type="button"
        onClick={onCycle}
        className="rounded-full p-0.5 transition hover:bg-bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        title="Click para avanzar estado"
      >
        <ServicePip service={service} state={state} size="sm" />
      </button>
    </td>
  );
}
