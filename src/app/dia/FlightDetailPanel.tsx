"use client";

import { Flight, Service, EventLog, LostItem } from "@prisma/client";
import { X, Plane, ChevronRight } from "lucide-react";
import { FLIGHT_STATE_CONFIG, normalizeFlightState } from "@/types";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems?: LostItem[];
  eventLogs?: (EventLog & { user: { name: string } | null })[];
};

interface Props {
  flight: FlightWithRelations;
  onClose: () => void;
  /** Called when user wants the full PassengerCrewModal opened (TODO Phase 5). */
  onOpenPaxCrew?: (direction: "ARRIVAL" | "DEPARTURE") => void;
}

/**
 * Detalle del vuelo seleccionado en /dia. Vive como columna a la derecha del
 * tablon. Por ahora muestra info y botones; en fases siguientes se rellena
 * con servicios editables, notas, GenDec paste y lost items.
 */
export function FlightDetailPanel({ flight, onClose }: Props) {
  const stateNorm = normalizeFlightState(flight.state);
  const stateCfg = FLIGHT_STATE_CONFIG[stateNorm];

  const arrServices = flight.services.filter((s) => s.phase === "ARRIVAL" || s.phase === "BOTH" || !s.phase);
  const depServices = flight.services.filter((s) => s.phase === "DEPARTURE" || s.phase === "BOTH");

  return (
    <aside className="flex h-full w-[440px] flex-col border-l border-gray-300 bg-white shadow-inner">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Plane size={14} className="text-blue-600 shrink-0" />
            <span className="font-bold text-base">{flight.callsign}</span>
            <span className="font-mono text-xs text-gray-600">{flight.registration}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${stateCfg.bg} ${stateCfg.text}`}>
              {stateCfg.label}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            {flight.aircraftType}
            {flight.parking ? ` · stand ${flight.parking}` : " · sin stand"}
            {flight.isOvernight ? " · pernocta" : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
          title="Cerrar (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-auto px-3 py-3 text-xs">
        {/* Quick summary block */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <SummaryBox label="Llegada" lines={[
            `${flight.origin || "—"} → LEPA`,
            `ETA ${flight.eta || "--:--"}Z${flight.arrivalDate ? ` · ${flight.arrivalDate}` : ""}`,
            `Crew ${flight.crewArrivalReal ?? flight.crewArrival} · Pax ${flight.paxArrivalReal ?? flight.paxArrival}`,
          ]} />
          <SummaryBox label="Salida" lines={[
            `LEPA → ${flight.destination || "—"}`,
            `ETD ${flight.etd || "--:--"}Z${flight.departureDate ? ` · ${flight.departureDate}` : ""}`,
            `Crew ${flight.crewDepartureReal ?? flight.crewDeparture} · Pax ${flight.paxDepartureReal ?? flight.paxDeparture}`,
          ]} />
        </div>

        <Section title="Servicios">
          <div className="space-y-1">
            <ServiceLine label="Fuel" value={flight.fuelState} />
            <ServiceLine label="Toilet" value={flight.toiletState} />
            {arrServices.length === 0 && depServices.length === 0 && (
              <div className="text-gray-400 italic text-[11px]">Sin servicios extras</div>
            )}
            {[...arrServices, ...depServices].map((s) => (
              <div key={s.id} className="flex justify-between text-[11px]">
                <span>
                  {s.type === "CUSTOM" ? s.customName || "Custom" : s.type}
                  {s.target ? ` · ${s.target}` : ""}
                  <span className="ml-1 text-gray-400">({s.phase})</span>
                </span>
                <span className={`font-semibold ${
                  s.state === "DELIVERED" ? "text-green-700" :
                  s.state === "ARRIVED" ? "text-yellow-700" : "text-gray-500"
                }`}>{s.state}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Notas">
          {flight.notes ? (
            <p className="whitespace-pre-wrap rounded bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-900">
              {flight.notes}
            </p>
          ) : (
            <span className="text-gray-400 italic text-[11px]">Sin notas</span>
          )}
        </Section>

        {flight.eventLogs && flight.eventLogs.length > 0 && (
          <Section title="Actividad reciente">
            <ul className="space-y-1 text-[11px] text-gray-600">
              {flight.eventLogs.slice(0, 6).map((ev) => (
                <li key={ev.id} className="flex gap-2">
                  <span className="shrink-0 font-mono text-gray-400">
                    {new Date(ev.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="flex-1">{ev.action}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Placeholder TODO panel — Phases 4-6 */}
        <div className="mt-4 rounded border border-dashed border-gray-300 bg-gray-50 p-3 text-[11px] text-gray-500">
          <div className="font-semibold text-gray-600 mb-1">Próximas fases del panel</div>
          Editar servicios inline · Toggle notas · GenDec paste compacto · Lost items · Borrar vuelo. Por ahora la edición se sigue haciendo desde la vista <kbd className="rounded bg-white border px-1">Tarjetas</kbd>.
        </div>
      </div>
    </aside>
  );
}

function SummaryBox({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50/50 p-2">
      <div className="mb-1 text-[10px] font-bold uppercase text-gray-500 flex items-center gap-1">
        {label}
        <ChevronRight size={10} className="opacity-40" />
      </div>
      {lines.map((l, i) => (
        <div key={i} className="text-[11px] text-gray-700 leading-relaxed">{l}</div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">{title}</div>
      {children}
    </div>
  );
}

function ServiceLine({ label, value }: { label: string; value: string }) {
  const tone =
    value === "SERVED" || value === "COMPLETED" ? "text-green-700" :
    value === "REQUESTED" ? "text-yellow-700" : "text-gray-500";
  return (
    <div className="flex justify-between text-[11px]">
      <span>{label}</span>
      <span className={`font-semibold ${tone}`}>{value}</span>
    </div>
  );
}
