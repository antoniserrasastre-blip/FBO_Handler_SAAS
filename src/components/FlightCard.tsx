"use client";

import { useState, memo } from "react";
import { Flight, Service, EventLog, LostItem } from "@/types/compat";
import {
  FLIGHT_STATE_CONFIG,
  FlightState,
  normalizeFlightState,
  FUEL_LABELS,
  FuelState,
  TOILET_STATES,
  TOILET_LABELS,
  ToiletState,
  TRANSPORT_LABELS,
  TransportType,
  TRANSPORT_STATE_LABELS,
  CREW_ARR_LOCATION_LABELS,
  CREW_DEP_LOCATION_LABELS,
  FLIGHT_STATES,
  FUEL_STATES,
  TRANSPORT_TYPES,
  PAX_ARR_STATES,
  PAX_ARR_STATE_LABELS,
  PaxArrState,
  BAGS_ARR_STATES,
  BAGS_ARR_STATE_LABELS,
  BagsArrState,
  PAX_DEP_STATES,
  PAX_DEP_STATE_LABELS,
  PaxDepState,
  BAGS_DEP_STATES,
  BAGS_DEP_STATE_LABELS,
  BagsDepState,
  SERVICE_TYPES,
  SERVICE_LABELS,
  ServiceType,
  SERVICE_TARGETS,
  SERVICE_TARGET_LABELS,
  ServiceTarget,
  LOST_ITEM_STATES,
  LOST_ITEM_STATE_CONFIG,
  LostItemState,
  LOST_ITEM_LOCATIONS,
  LOST_ITEM_LOCATION_LABELS,
  LostItemLocation,
} from "@/types";
import { ServiceIcon, ArrivedIcon, DeliveredIcon, ChevronUp, ChevronDown, CloseIcon, LostItemIcon, PdfIcon, ExcelIcon } from "./Icons";
import { ArrowRight, Trash2, Users, StickyNote } from "lucide-react";
import { ServiceBadges } from "./ServiceCheckbox";
import { PassengerCrewModal } from "./PassengerCrewModal";
import { findOperator } from "@/lib/operators";
import { getTemplatesForOperator } from "@/lib/serviceTemplates";
import { isServiceOverdue } from "@/lib/overdue";
import { TurnaroundCountdown } from "./TurnaroundCountdown";
import { QuickTimeEdit } from "./QuickTimeEdit";
import { checkCompatibility, getStandDescription, isFarFromGA } from "@/lib/parkingStands";
import { Direction } from "@/types";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems?: LostItem[];
  eventLogs?: (EventLog & { user: { name: string } | null })[];
};

interface FlightCardProps {
  flight: FlightWithRelations;
  onUpdate: (id: string, data: Partial<Flight>) => void;
  onServiceToggle: (serviceId: string, newState: string) => void;
  onAddService: (flightId: string, type: string, customName?: string, reference?: string, target?: string) => void;
  onDeleteService: (serviceId: string) => void;
  onDelete: (id: string) => void;
  onAddLostItem: (flightId: string, description: string, location: string) => void;
  onLostItemToggle: (itemId: string, newState: string) => void;
  onDeleteLostItem: (itemId: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onBadgeClick?: (searchTerm: string) => void;
  parkingConflict?: string | null;
  readOnly?: boolean;
}

export const FlightCard = memo(function FlightCard({
  flight,
  onUpdate,
  onServiceToggle,
  onAddService,
  onDeleteService,
  onDelete,
  onAddLostItem,
  onLostItemToggle,
  onDeleteLostItem,
  isSelected = false,
  onSelect,
  onBadgeClick,
  parkingConflict,
  readOnly = false,
}: FlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [paxModal, setPaxModal] = useState<{ direction: Direction } | null>(null);
  const normalizedState = normalizeFlightState(flight.state);
  const stateConfig = FLIGHT_STATE_CONFIG[normalizedState];
  const progress = stateConfig.progress;

  // Pernocta: usa el campo persistido y, si no, infiere por fechas (fallback para datos antiguos)
  const isOvernight =
    flight.isOvernight ||
    Boolean(flight.arrivalDate && flight.departureDate && flight.arrivalDate !== flight.departureDate);

  return (
    <div
      className={`overflow-hidden rounded-lg border-l-4 bg-white shadow-sm transition-shadow hover:shadow-md ${isSelected ? "ring-2 ring-info ring-offset-1" : ""}`}
      style={{ borderLeftColor: stateConfig.color }}
      onClick={() => onSelect?.(flight.id)}
    >
      {/* Collapsed view */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="w-full cursor-pointer px-3 py-2 text-left sm:px-4 sm:py-3"
      >
        <div className="flex items-start justify-between gap-2 sm:gap-4">
          <div className="flex items-start gap-2 min-w-0 sm:gap-3">
            <span
              className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase sm:px-2.5 sm:text-xs ${stateConfig.bg} ${stateConfig.text}`}
            >
              {stateConfig.label}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="cursor-pointer rounded-md bg-ink-1 px-2 py-0.5 font-mono text-base font-bold tracking-wider text-white shadow-sm ring-1 ring-ink-1 hover:bg-info-strong hover:ring-info-strong sm:px-2.5 sm:py-1 sm:text-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard?.writeText(flight.registration);
                  }}
                  title="Click para copiar matricula"
                >
                  {flight.registration}
                </span>
                {(() => {
                  const op = findOperator(flight.callsign);
                  const prefixMatch = flight.callsign.replace(/[*\s]/g, "").match(/^([A-Z]+)/i);
                  const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : "";
                  if (op) {
                    return (
                      <span
                        className="cursor-pointer rounded bg-brand-tint px-1.5 py-0.5 text-[11px] font-semibold text-brand-active hover:brightness-95 sm:text-xs"
                        onClick={(e) => { e.stopPropagation(); onBadgeClick?.(op.name.toLowerCase()); }}
                        title={`Filtrar por ${op.name}${op.country ? " · " + op.country : ""}`}
                      >
                        {op.name}
                      </span>
                    );
                  }
                  return (
                    <span
                      className="cursor-pointer rounded border border-dashed border-line bg-bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-ink-muted hover:bg-bg-muted hover:text-ink-3 sm:text-xs"
                      onClick={(e) => { e.stopPropagation(); if (prefix) onBadgeClick?.(prefix.toLowerCase()); }}
                      title={prefix ? `Operador desconocido (${prefix}) — privado o sin catalogar` : "Operador desconocido"}
                    >
                      Privado{prefix && ` · ${prefix}`}
                    </span>
                  );
                })()}
                <span className="text-xs text-ink-3 sm:text-sm">{flight.aircraftType}</span>
                <span
                  className="cursor-pointer font-mono text-xs text-ink-muted hover:text-info-strong sm:text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard?.writeText(flight.callsign);
                  }}
                  title="Click para copiar indicativo"
                >
                  {flight.callsign}
                </span>
                {flight.parking && (() => {
                  const compat = checkCompatibility(flight.aircraftType, flight.parking);
                  const farFromGA = isFarFromGA(flight.parking);
                  const desc = getStandDescription(flight.parking);
                  let badgeClass = "bg-bg-muted text-ink-2 hover:bg-bg-sunken";
                  let tip = `Filtrar por parking ${flight.parking} — ${desc}`;
                  if (parkingConflict) {
                    badgeClass = "bg-danger-bg text-danger-strong ring-1 ring-danger hover:bg-danger-bg";
                    tip = `Conflicto con ${parkingConflict}`;
                  } else if (compat.severity === "error") {
                    badgeClass = "bg-danger-bg text-danger-strong ring-1 ring-danger hover:bg-danger-bg";
                    tip = compat.message || tip;
                  } else if (farFromGA) {
                    badgeClass = "bg-warning-bg text-warning-strong ring-1 ring-warning hover:bg-warning-bg";
                    tip = `${desc} — lejos del GA apron`;
                  }
                  return (
                    <span
                      className={`cursor-pointer rounded px-1 py-0.5 text-[10px] font-medium sm:px-1.5 sm:text-xs ${badgeClass}`}
                      onClick={(e) => { e.stopPropagation(); onBadgeClick?.(flight.parking!); }}
                      title={tip}
                    >
                      {(parkingConflict || compat.severity === "error") && <span className="mr-0.5">&#9888;</span>}
                      {farFromGA && !parkingConflict && compat.severity !== "error" && <span className="mr-0.5">&#8599;</span>}
                      {flight.parking}
                    </span>
                  );
                })()}
                {isOvernight && (
                  <span className="rounded bg-bg-muted px-1 py-0.5 text-[10px] font-medium text-fbo-overnight sm:px-1.5 sm:text-xs">
                    PERNOCTA
                  </span>
                )}
                {flight.notes && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-warning-bg px-1 py-0.5 text-[10px] font-medium text-warning-strong" title={flight.notes}>
                    <StickyNote size={10} /> Nota
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-ink-2 sm:mt-1 sm:gap-x-2 sm:text-sm">
                <span className="text-ink-muted">LLEG</span>
                <span className="font-medium">{flight.origin || "----"}</span>
                {flight.arrivalDate && <span className="text-[10px] text-ink-muted">{flight.arrivalDate}</span>}
                {readOnly ? (
                  <span className="text-ink-muted">{flight.eta || "--:--"}</span>
                ) : (
                  <QuickTimeEdit value={flight.eta} onSave={(v) => onUpdate(flight.id, { eta: v })} className="text-ink-3" />
                )}
                <ArrowRight size={12} className="shrink-0 text-ink-disabled" />
                <span className="text-ink-muted">SAL</span>
                <span className="font-medium">{flight.destination || "----"}</span>
                {flight.departureDate && <span className="text-[10px] text-ink-muted">{flight.departureDate}</span>}
                {readOnly ? (
                  <span className="text-ink-muted">{flight.etd || "--:--"}</span>
                ) : (
                  <QuickTimeEdit value={flight.etd} onSave={(v) => onUpdate(flight.id, { etd: v })} className="text-ink-3" />
                )}
                <TurnaroundCountdown eta={flight.eta} etd={flight.etd} flightState={flight.state} />
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-4 text-xs text-ink-3 sm:flex">
            <div className="text-center">
              <div className="text-ink-muted">CREW</div>
              <div>{flight.crewArrival}/{flight.crewDeparture}</div>
            </div>
            <div className="text-center">
              <div className="text-ink-muted">PAX</div>
              <div>{flight.paxArrival}/{flight.paxDeparture}</div>
            </div>
            <div className="text-center">
              <div className="text-ink-muted">FUEL</div>
              <div className={flight.fuelState === "SERVED" ? "text-success-strong" : flight.fuelState === "REQUESTED" ? "text-warning-strong" : ""}>
                {FUEL_LABELS[flight.fuelState as FuelState] || flight.fuelState}
              </div>
            </div>
            {expanded ? <ChevronUp size={16} className="text-ink-disabled" /> : <ChevronDown size={16} className="text-ink-disabled" />}
          </div>

          <span className="sm:hidden">{expanded ? <ChevronUp size={16} className="text-ink-disabled" /> : <ChevronDown size={16} className="text-ink-disabled" />}</span>
        </div>

        <div className="mt-1.5 h-1.5 w-full rounded-full bg-bg-muted sm:mt-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progress, 2)}%`, backgroundColor: stateConfig.color }}
          />
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-ink-3 sm:hidden">
          <span>C:{flight.crewArrival}/{flight.crewDeparture}</span>
          <span>P:{flight.paxArrival}/{flight.paxDeparture}</span>
          <span className={flight.fuelState === "SERVED" ? "text-success-strong" : flight.fuelState === "REQUESTED" ? "text-warning-strong" : ""}>
            F:{FUEL_LABELS[flight.fuelState as FuelState] || flight.fuelState}
          </span>
        </div>

        {!expanded && (
          <div className="mt-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className={readOnly ? "pointer-events-none" : ""}>
                {flight.services.length > 0 && (
                  <ServiceBadges services={flight.services} onToggle={onServiceToggle} />
                )}
              </div>
              {(flight.lostItems || []).filter((li) => li.state !== "DELIVERED").length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-medium text-warning-strong">
                  <LostItemIcon size={10} />
                  {(flight.lostItems || []).filter((li) => li.state !== "DELIVERED").length} objeto{(flight.lostItems || []).filter((li) => li.state !== "DELIVERED").length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {flight.eventLogs && flight.eventLogs.length > 0 && (
              <LastModifiedBadge log={flight.eventLogs[0]} />
            )}
          </div>
        )}
      </div>

      {/* ========== EXPANDED VIEW ========== */}
      {expanded && (
        <div className="border-t border-line-subtle px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3" onClick={(e) => e.stopPropagation()}>
          {/* Delete button */}
          {!readOnly && (
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => {
                  if (window.confirm(`Eliminar vuelo ${flight.registration} (${flight.callsign})?`)) {
                    onDelete(flight.id);
                  }
                }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger-strong hover:bg-danger-bg hover:text-danger-strong"
              >
                <Trash2 size={12} />
                Eliminar vuelo
              </button>
            </div>
          )}

          <div className={`grid gap-4 lg:grid-cols-3 ${readOnly ? "pointer-events-none opacity-75" : ""}`}>

            {/* ===== LEFT COLUMN — LLEGADA ===== */}
            <div className="space-y-4 rounded-lg bg-info-bg p-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-info-strong">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-info-bg text-[10px]">&#x2193;</span>
                Llegada
              </h2>

              {/* Arrival flight info */}
              <Section title="Vuelo">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <TextField label="Origen" value={flight.origin || ""} onChange={(v) => onUpdate(flight.id, { origin: v })} placeholder="ICAO" />
                    <TextField label="Fecha" value={flight.arrivalDate || ""} onChange={(v) => onUpdate(flight.id, { arrivalDate: v })} placeholder="DD/MM" />
                  </div>
                  <TextField label="ETA" value={flight.eta || ""} onChange={(v) => onUpdate(flight.id, { eta: v })} placeholder="HH:MM" />
                </div>
              </Section>

              {/* Arrival Crew */}
              <Section title={
                <span className="flex items-center gap-1.5">
                  Tripulacion
                  <button onClick={() => setPaxModal({ direction: "ARRIVAL" })} className="rounded p-0.5 text-info hover:bg-info-bg hover:text-info-strong" title="Ver nombres crew/pax llegada">
                    <Users size={11} />
                  </button>
                </span>
              }>
                <div className="space-y-2">
                  <div className="flex gap-4">
                    <NumberField label="Est." value={flight.crewArrival} onChange={(v) => onUpdate(flight.id, { crewArrival: v })} />
                    <NumberField label="Real" value={flight.crewArrivalReal ?? 0} onChange={(v) => onUpdate(flight.id, { crewArrivalReal: v })} />
                  </div>
                  <ButtonGroup
                    label="Ubicacion"
                    value={flight.crewArrLocation}
                    options={[
                      { value: "IN_AIRCRAFT", label: CREW_ARR_LOCATION_LABELS.IN_AIRCRAFT, activeClass: "bg-info-bg text-info-strong ring-1 ring-info" },
                      { value: "IN_LOUNGE", label: CREW_ARR_LOCATION_LABELS.IN_LOUNGE, activeClass: "bg-warning-bg text-warning-strong ring-1 ring-warning" },
                      { value: "HOTEL", label: CREW_ARR_LOCATION_LABELS.HOTEL, activeClass: "bg-bg-muted text-fbo-overnight ring-1 ring-fbo-overnight" },
                    ]}
                    onChange={(v) => onUpdate(flight.id, { crewArrLocation: v })}
                  />
                </div>
              </Section>

              {/* Arrival Passengers */}
              <Section title="Pasajeros">
                <div className="space-y-2">
                  <div className="flex gap-4">
                    <NumberField label="Est." value={flight.paxArrival} onChange={(v) => onUpdate(flight.id, { paxArrival: v })} />
                    <NumberField label="Real" value={flight.paxArrivalReal ?? 0} onChange={(v) => onUpdate(flight.id, { paxArrivalReal: v })} />
                  </div>
                  <div className="flex gap-2">
                    <NumberField label="Bodega" value={flight.paxArrBagsChecked} onChange={(v) => onUpdate(flight.id, { paxArrBagsChecked: v })} />
                    <NumberField label="Cabina" value={flight.paxArrBagsCabin} onChange={(v) => onUpdate(flight.id, { paxArrBagsCabin: v })} />
                  </div>
                  <ButtonGroup
                    label="Maletas"
                    value={flight.paxArrBagsState}
                    options={BAGS_ARR_STATES.map((s) => ({
                      value: s,
                      label: BAGS_ARR_STATE_LABELS[s],
                      activeClass: s === "DELIVERED" ? "bg-success-bg text-success-strong ring-1 ring-success"
                        : s === "UNLOADED" ? "bg-warning-bg text-warning-strong ring-1 ring-warning"
                        : undefined,
                    }))}
                    onChange={(v) => onUpdate(flight.id, { paxArrBagsState: v })}
                  />
                  <ButtonGroup
                    label="Estado pax"
                    value={flight.paxArrState}
                    options={PAX_ARR_STATES.map((s) => ({
                      value: s,
                      label: PAX_ARR_STATE_LABELS[s],
                      activeClass: s === "COMPLETED" ? "bg-success-bg text-success-strong ring-1 ring-success"
                        : s === "IN_LOUNGE" ? "bg-warning-bg text-warning-strong ring-1 ring-warning"
                        : undefined,
                    }))}
                    onChange={(v) => onUpdate(flight.id, { paxArrState: v })}
                  />
                  <ButtonGroup
                    label="Transporte"
                    value={flight.paxArrTransportType}
                    options={TRANSPORT_TYPES.map((t) => ({ value: t, label: TRANSPORT_LABELS[t] }))}
                    onChange={(v) => onUpdate(flight.id, { paxArrTransportType: v })}
                  />
                  <ButtonGroup
                    label="Est. transporte"
                    value={flight.paxArrTransportState}
                    options={[
                      { value: "PENDING", label: TRANSPORT_STATE_LABELS.PENDING },
                      { value: "CONFIRMED", label: TRANSPORT_STATE_LABELS.CONFIRMED, activeClass: "bg-success-bg text-success-strong ring-1 ring-success" },
                    ]}
                    onChange={(v) => onUpdate(flight.id, { paxArrTransportState: v })}
                  />
                </div>
              </Section>
            </div>

            {/* ===== CENTER COLUMN — ESTADO, DATOS, FUEL, TOILET ===== */}
            <div className="space-y-4">
              {/* Flight State */}
              <Section title="Estado del vuelo">
                <div className="flex flex-wrap gap-1">
                  {FLIGHT_STATES.filter((s) => s !== "PARKED" || isOvernight).map((s) => (
                    <button
                      key={s}
                      onClick={() => onUpdate(flight.id, { state: s })}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        normalizedState === s
                          ? `${FLIGHT_STATE_CONFIG[s].bg} ${FLIGHT_STATE_CONFIG[s].text} ring-1 ring-current`
                          : "bg-bg-subtle text-ink-muted hover:bg-bg-muted"
                      }`}
                    >
                      {FLIGHT_STATE_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Flight Data */}
              <Section title="Datos del vuelo">
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <TextField label="Indicativo" value={flight.callsign} onChange={(v) => onUpdate(flight.id, { callsign: v })} />
                    <TextField label="Matricula" value={flight.registration} onChange={(v) => onUpdate(flight.id, { registration: v })} />
                    <TextField label="Tipo" value={flight.aircraftType} onChange={(v) => onUpdate(flight.id, { aircraftType: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <TextField label="Parking" value={flight.parking || ""} onChange={(v) => onUpdate(flight.id, { parking: v })} />
                    <TextField label="TOBT" value={flight.tobt || ""} onChange={(v) => onUpdate(flight.id, { tobt: v })} placeholder="HH:MM" />
                  </div>
                </div>
              </Section>

              {/* Fuel */}
              <Section title="Combustible">
                <div>
                  <div className="flex gap-1">
                    {FUEL_STATES.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          const data: Partial<Flight> & Record<string, unknown> = { fuelState: s };
                          if (s === "REQUESTED") {
                            data.fuelRequestedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                          }
                          if (s === "SERVED") {
                            data.fuelServedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                          }
                          onUpdate(flight.id, data);
                        }}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          flight.fuelState === s
                            ? s === "SERVED" ? "bg-success-bg text-success-strong ring-1 ring-success"
                              : s === "REQUESTED" ? "bg-warning-bg text-warning-strong ring-1 ring-warning"
                              : "bg-bg-muted text-ink-1 ring-1 ring-gray-400"
                            : "bg-bg-subtle text-ink-muted hover:bg-bg-muted"
                        }`}
                      >
                        {FUEL_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  {flight.fuelRequestedAt && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning-strong"><span className="text-[10px]">&#9201;</span> Pedido: {flight.fuelRequestedAt}</p>
                  )}
                  {flight.fuelServedAt && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-success-strong"><span className="text-[10px]">&#9989;</span> Servido: {flight.fuelServedAt}</p>
                  )}
                </div>
              </Section>

              {/* Toilet */}
              <Section title="Toilet">
                <div>
                  <div className="flex gap-1">
                    {TOILET_STATES.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          const data: Partial<Flight> & Record<string, unknown> = { toiletState: s };
                          if (s === "REQUESTED") {
                            data.toiletRequestedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                          }
                          if (s === "COMPLETED") {
                            data.toiletCompletedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                          }
                          onUpdate(flight.id, data);
                        }}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          flight.toiletState === s
                            ? s === "COMPLETED" ? "bg-success-bg text-success-strong ring-1 ring-success"
                              : s === "REQUESTED" ? "bg-warning-bg text-warning-strong ring-1 ring-warning"
                              : "bg-bg-muted text-ink-1 ring-1 ring-gray-400"
                            : "bg-bg-subtle text-ink-muted hover:bg-bg-muted"
                        }`}
                      >
                        {TOILET_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  {flight.toiletRequestedAt && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning-strong"><span className="text-[10px]">&#9201;</span> Pedido: {flight.toiletRequestedAt}</p>
                  )}
                  {flight.toiletCompletedAt && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-success-strong"><span className="text-[10px]">&#9989;</span> Completado: {flight.toiletCompletedAt}</p>
                  )}
                </div>
              </Section>

              {/* Services */}
              <Section title="Servicios / Extras">
                <div className="space-y-2">
                  <ServiceBadges services={flight.services} onToggle={onServiceToggle} />
                  <div className="flex flex-wrap items-start gap-2">
                    <AddServiceRow
                      flightId={flight.id}
                      existingTypes={flight.services.map((s) => s.type)}
                      onAdd={onAddService}
                    />
                    <ServiceTemplateDropdown flightId={flight.id} callsign={flight.callsign} onAdd={onAddService} />
                    {flight.services.some((s) => s.state !== "DELIVERED") && (
                      <button
                        onClick={() => {
                          const pending = flight.services.filter((s) => s.state !== "DELIVERED");
                          if (window.confirm(`Marcar ${pending.length} servicio${pending.length !== 1 ? "s" : ""} como entregado${pending.length !== 1 ? "s" : ""}?`)) {
                            for (const s of pending) onServiceToggle(s.id, "DELIVERED");
                          }
                        }}
                        className="rounded-md border border-success-strong bg-success-bg px-2 py-1 text-xs font-medium text-success-strong hover:border-green-300 hover:bg-success-bg"
                        title="Marcar todos los servicios como entregados"
                      >
                        &#10003; Todos entregados
                      </button>
                    )}
                  </div>
                  {flight.services.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {flight.services.map((service) => {
                        const overdue = isServiceOverdue(service);
                        return (
                        <div
                          key={service.id}
                          className={`flex items-center justify-between gap-2 text-xs text-ink-3 ${overdue ? "overdue-pulse rounded border border-danger-strong px-1.5 py-1" : ""}`}
                        >
                          <span className="flex min-w-0 items-center gap-1">
                            {overdue && <span className="shrink-0 text-danger-strong" title="Retrasado">&#9888;</span>}
                            <ServiceIcon type={service.type} size={12} className="shrink-0 text-ink-muted" />
                            {service.type === "CUSTOM" ? service.customName : SERVICE_LABELS[service.type as ServiceType]}{" "}
                            {service.phase && service.phase !== "DEPARTURE" && (
                              <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${service.phase === "ARRIVAL" ? "bg-info-bg text-info-strong" : "bg-bg-muted text-ink-2"}`}>
                                {service.phase === "ARRIVAL" ? "LLEG" : "AMB"}
                              </span>
                            )}
                            {service.target && (
                              <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${service.target === "CREW" ? "bg-warning-bg text-warning-strong" : "bg-info-bg text-info-strong"}`}>
                                {SERVICE_TARGET_LABELS[service.target as ServiceTarget]}
                              </span>
                            )}
                            {service.reference && <span className="text-info-strong">#{service.reference}</span>}
                            {service.origin && <span className="text-ink-muted">({service.origin})</span>}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {service.arrivedAt && <span className="flex items-center gap-0.5 text-info-strong"><ArrivedIcon size={10} /> {service.arrivedAt}</span>}
                            {service.deliveredAt && <span className="flex items-center gap-0.5 text-success-strong"><DeliveredIcon size={10} /> {service.deliveredAt}</span>}
                            <button
                              onClick={() => onDeleteService(service.id)}
                              className="text-danger hover:text-danger-strong"
                              title="Eliminar servicio"
                            >
                              <CloseIcon size={12} />
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Section>

              {/* Notes */}
              <Section title={
                <span className="flex items-center gap-1.5">
                  <StickyNote size={12} />
                  Notas
                </span>
              }>
                <NotesField
                  value={flight.notes || ""}
                  onSave={(v) => onUpdate(flight.id, { notes: v || null } as Partial<Flight>)}
                />
              </Section>

              {/* Export buttons */}
              <Section title="Exportar vuelo">
                <div className="flex flex-wrap gap-1.5">
                  <a
                    href={`/api/export/flight/${flight.id}/pdf?direction=ARRIVAL`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-2 py-1 text-[10px] font-medium text-ink-2 hover:bg-bg-subtle"
                  >
                    <PdfIcon size={10} /> PDF Llegada
                  </a>
                  <a
                    href={`/api/export/flight/${flight.id}/pdf?direction=DEPARTURE`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-2 py-1 text-[10px] font-medium text-ink-2 hover:bg-bg-subtle"
                  >
                    <PdfIcon size={10} /> PDF Salida
                  </a>
                  <a
                    href={`/api/export/flight/${flight.id}/excel`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-2 py-1 text-[10px] font-medium text-ink-2 hover:bg-bg-subtle"
                  >
                    <ExcelIcon size={10} /> Excel
                  </a>
                  <a
                    href={`/api/export/blank-declaration?flightId=${flight.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-dashed border-line-subtle px-2 py-1 text-[10px] font-medium text-ink-muted hover:bg-bg-subtle hover:text-ink-2"
                  >
                    <PdfIcon size={10} /> En blanco
                  </a>
                </div>
              </Section>

              {/* Lost & Found */}
              <Section title={
                <span className="flex items-center gap-1.5">
                  <LostItemIcon size={12} />
                  Objetos olvidados
                  {(flight.lostItems || []).filter((li) => li.state !== "DELIVERED").length > 0 && (
                    <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] font-medium text-warning-strong">
                      {(flight.lostItems || []).filter((li) => li.state !== "DELIVERED").length}
                    </span>
                  )}
                </span>
              }>
                <div className="space-y-2">
                  <AddLostItemRow flightId={flight.id} onAdd={onAddLostItem} />
                  {(flight.lostItems || []).length > 0 && (
                    <div className="mt-2 space-y-1">
                      {(flight.lostItems || []).map((item) => {
                        const stateConfig = LOST_ITEM_STATE_CONFIG[item.state as LostItemState] || LOST_ITEM_STATE_CONFIG.FOUND;
                        const nextState = LOST_ITEM_STATES[(LOST_ITEM_STATES.indexOf(item.state as LostItemState) + 1) % LOST_ITEM_STATES.length];
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-2 text-xs text-ink-3">
                            <span className="flex min-w-0 items-center gap-1">
                              <button
                                onClick={() => onLostItemToggle(item.id, nextState)}
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${stateConfig.bg} ${stateConfig.text}`}
                                title={`Cambiar a: ${LOST_ITEM_STATE_CONFIG[nextState]?.label}`}
                              >
                                {stateConfig.label}
                              </button>
                              <span className="truncate">{item.description}</span>
                              <span className="shrink-0 text-[10px] text-ink-muted">
                                ({LOST_ITEM_LOCATION_LABELS[item.location as LostItemLocation] || item.location})
                              </span>
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              {item.foundAt && <span className="text-[10px] text-ink-muted">{item.foundAt}</span>}
                              {item.claimedBy && <span className="text-[10px] text-info-strong">{item.claimedBy}</span>}
                              <button
                                onClick={() => onDeleteLostItem(item.id)}
                                className="text-danger hover:text-danger-strong"
                                title="Eliminar"
                              >
                                <CloseIcon size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Section>
            </div>

            {/* ===== RIGHT COLUMN — SALIDA ===== */}
            <div className="space-y-4 rounded-lg bg-warning-bg p-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-warning-strong">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-warning-bg text-[10px]">&#x2191;</span>
                Salida
              </h2>

              {/* Departure flight info */}
              <Section title="Vuelo">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <TextField label="Destino" value={flight.destination || ""} onChange={(v) => onUpdate(flight.id, { destination: v })} placeholder="ICAO" />
                    <TextField label="Fecha" value={flight.departureDate || ""} onChange={(v) => onUpdate(flight.id, { departureDate: v })} placeholder="DD/MM" />
                  </div>
                  <TextField label="ETD" value={flight.etd || ""} onChange={(v) => onUpdate(flight.id, { etd: v })} placeholder="HH:MM" />
                </div>
              </Section>

              {/* Departure Crew */}
              <Section title={
                <span className="flex items-center gap-1.5">
                  Tripulacion
                  <button onClick={() => setPaxModal({ direction: "DEPARTURE" })} className="rounded p-0.5 text-warning hover:bg-warning-bg hover:text-warning-strong" title="Ver nombres crew/pax salida">
                    <Users size={11} />
                  </button>
                </span>
              }>
                <div className="space-y-2">
                  <div className="flex gap-4">
                    <NumberField label="Est." value={flight.crewDeparture} onChange={(v) => onUpdate(flight.id, { crewDeparture: v })} />
                    <NumberField label="Real" value={flight.crewDepartureReal ?? 0} onChange={(v) => onUpdate(flight.id, { crewDepartureReal: v })} />
                  </div>
                  <ButtonGroup
                    label="Ubicacion"
                    value={flight.crewDepLocation}
                    options={[
                      { value: "NOT_ARRIVED", label: CREW_DEP_LOCATION_LABELS.NOT_ARRIVED, activeClass: "bg-bg-sunken text-ink-1 ring-1 ring-gray-400" },
                      { value: "IN_AIRCRAFT", label: CREW_DEP_LOCATION_LABELS.IN_AIRCRAFT, activeClass: "bg-info-bg text-info-strong ring-1 ring-info" },
                      { value: "IN_LOUNGE", label: CREW_DEP_LOCATION_LABELS.IN_LOUNGE, activeClass: "bg-warning-bg text-warning-strong ring-1 ring-warning" },
                    ]}
                    onChange={(v) => onUpdate(flight.id, { crewDepLocation: v })}
                  />
                </div>
              </Section>

              {/* Departure Passengers */}
              <Section title="Pasajeros">
                <div className="space-y-2">
                  <div className="flex gap-4">
                    <NumberField label="Est." value={flight.paxDeparture} onChange={(v) => onUpdate(flight.id, { paxDeparture: v })} />
                    <NumberField label="Real" value={flight.paxDepartureReal ?? 0} onChange={(v) => onUpdate(flight.id, { paxDepartureReal: v })} />
                  </div>
                  <div className="flex gap-2">
                    <NumberField label="Bodega" value={flight.paxDepBagsChecked} onChange={(v) => onUpdate(flight.id, { paxDepBagsChecked: v })} />
                    <NumberField label="Cabina" value={flight.paxDepBagsCabin} onChange={(v) => onUpdate(flight.id, { paxDepBagsCabin: v })} />
                  </div>
                  <ButtonGroup
                    label="Maletas"
                    value={flight.paxDepBagsState}
                    options={BAGS_DEP_STATES.map((s) => ({
                      value: s,
                      label: BAGS_DEP_STATE_LABELS[s],
                      activeClass: s === "SENT_TO_AIRCRAFT" ? "bg-success-bg text-success-strong ring-1 ring-success"
                        : s === "TAGGED" ? "bg-warning-bg text-warning-strong ring-1 ring-warning"
                        : undefined,
                    }))}
                    onChange={(v) => onUpdate(flight.id, { paxDepBagsState: v })}
                  />
                  <ButtonGroup
                    label="Estado pax"
                    value={flight.paxDepState}
                    options={PAX_DEP_STATES.map((s) => ({
                      value: s,
                      label: PAX_DEP_STATE_LABELS[s],
                      activeClass: s === "BOARDED" ? "bg-success-bg text-success-strong ring-1 ring-success"
                        : s === "IN_LOUNGE" ? "bg-warning-bg text-warning-strong ring-1 ring-warning"
                        : undefined,
                    }))}
                    onChange={(v) => onUpdate(flight.id, { paxDepState: v })}
                  />
                  <ButtonGroup
                    label="Transporte"
                    value={flight.paxDepTransportType}
                    options={TRANSPORT_TYPES.map((t) => ({ value: t, label: TRANSPORT_LABELS[t] }))}
                    onChange={(v) => onUpdate(flight.id, { paxDepTransportType: v })}
                  />
                  <ButtonGroup
                    label="Est. transporte"
                    value={flight.paxDepTransportState}
                    options={[
                      { value: "PENDING", label: TRANSPORT_STATE_LABELS.PENDING },
                      { value: "CONFIRMED", label: TRANSPORT_STATE_LABELS.CONFIRMED, activeClass: "bg-success-bg text-success-strong ring-1 ring-success" },
                    ]}
                    onChange={(v) => onUpdate(flight.id, { paxDepTransportState: v })}
                  />
                </div>
              </Section>
            </div>
          </div>

          {/* Event log — only shown if loaded */}
          {flight.eventLogs && flight.eventLogs.length > 0 && (
            <div className="mt-4">
              <Section title="Log de eventos">
                <div className="max-h-48 overflow-y-auto">
                  <div className="relative border-l-2 border-line-subtle pl-4">
                    {flight.eventLogs.map((log, i) => (
                      <div key={log.id} className="relative pb-3">
                        <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${i === 0 ? "bg-brand" : "bg-bg-sunken"}`} />
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className={`text-xs font-medium ${i === 0 ? "text-ink-1" : "text-ink-3"}`}>
                            {log.action}
                          </span>
                          {log.user && (
                            <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-3">
                              {log.user.name}
                            </span>
                          )}
                          <span className="text-[10px] text-ink-muted">
                            {new Date(log.timestamp).toLocaleTimeString("es-ES", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            </div>
          )}
        </div>
      )}

      {/* Passenger/Crew Modal */}
      {paxModal && (
        <PassengerCrewModal
          isOpen={!!paxModal}
          onClose={() => setPaxModal(null)}
          flightId={flight.id}
          direction={paxModal.direction}
          flightLabel={`${flight.callsign} (${flight.registration})`}
        />
      )}
    </div>
  );
}, (prev, next) => {
  return prev.flight === next.flight
    && prev.readOnly === next.readOnly
    && prev.isSelected === next.isSelected
    && prev.onBadgeClick === next.onBadgeClick
    && prev.parkingConflict === next.parkingConflict;
});

// --- Helper sub-components ---

function ButtonGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; activeClass?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-ink-muted mb-0.5">{label}</label>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              value === opt.value
                ? opt.activeClass || "bg-bg-sunken text-ink-1 ring-1 ring-gray-400"
                : "bg-bg-subtle text-ink-muted hover:bg-bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);

  if (!dirty && local !== value) setLocal(value);

  return (
    <div>
      <label className="block text-[10px] text-ink-muted">{label}</label>
      <input
        type="text"
        value={local}
        placeholder={placeholder}
        onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
        onBlur={() => {
          if (dirty && local !== value) {
            onChange(local);
          }
          setDirty(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="mt-0.5 block w-full rounded border border-line-subtle px-2 py-1 text-xs text-ink-1 focus:border-brand focus:outline-none focus:ring-1 focus:ring-info"
      />
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(String(value));

  return (
    <div className="flex items-center gap-2">
      <label className="w-12 text-xs text-ink-3">{label}</label>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-6 w-6 items-center justify-center rounded bg-bg-muted text-sm hover:bg-bg-sunken"
        >
          -
        </button>
        {editing ? (
          <input
            type="number"
            value={local}
            autoFocus
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => {
              const n = parseInt(local, 10);
              if (!isNaN(n) && n >= 0) onChange(n);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-12 rounded border border-brand px-1 py-0.5 text-center text-sm font-medium focus:outline-none focus:ring-1 focus:ring-info [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        ) : (
          <button
            onClick={() => { setLocal(String(value)); setEditing(true); }}
            className="w-8 text-center text-sm font-medium cursor-text hover:bg-info-bg rounded"
            title="Click para editar"
          >
            {value}
          </button>
        )}
        <button
          onClick={() => onChange(value + 1)}
          className="flex h-6 w-6 items-center justify-center rounded bg-bg-muted text-sm hover:bg-bg-sunken"
        >
          +
        </button>
      </div>
    </div>
  );
}

function LastModifiedBadge({ log }: { log: EventLog & { user: { name: string } | null } }) {
  const time = new Date(log.timestamp).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] text-ink-muted">
      {log.user?.name || "Sistema"} · {log.action.length > 30 ? log.action.slice(0, 30) + "..." : log.action} · {time}
    </span>
  );
}

function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);

  if (!dirty && local !== value) setLocal(value);

  return (
    <textarea
      value={local}
      onChange={(e) => { setLocal(e.target.value); setDirty(true); }}
      onBlur={() => { if (dirty && local !== value) onSave(local); setDirty(false); }}
      placeholder="Observaciones (VIP, copiloto entrenamiento, etc.)"
      rows={2}
      className="block w-full resize-y rounded border border-line-subtle bg-white px-2 py-1 text-xs text-ink-1 focus:border-brand focus:outline-none focus:ring-1 focus:ring-info"
    />
  );
}

function ServiceTemplateDropdown({
  flightId,
  callsign,
  onAdd,
}: {
  flightId: string;
  callsign: string;
  onAdd: (flightId: string, type: string, customName?: string, reference?: string, target?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const operator = findOperator(callsign);
  const templates = getTemplatesForOperator(operator?.icao || null);

  if (templates.length === 0) return null;

  const applyTemplate = (items: { type: string; customName?: string; target?: string; origin?: string; reference?: string }[]) => {
    for (const item of items) {
      onAdd(flightId, item.type, item.customName, item.reference, item.target);
    }
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-dashed border-indigo-300 bg-brand-tint px-2 py-1 text-xs text-brand-active hover:border-indigo-400 hover:bg-brand-tint"
        title={`Plantillas${operator ? " para " + operator.name : ""}`}
      >
        + Plantilla
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border bg-white py-1 shadow-lg">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => applyTemplate(tpl.items)}
                className="block w-full px-3 py-2 text-left hover:bg-bg-subtle"
              >
                <div className="text-xs font-semibold text-ink-1">{tpl.label}</div>
                <div className="text-[10px] text-ink-3">{tpl.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AddLostItemRow({
  flightId,
  onAdd,
}: {
  flightId: string;
  onAdd: (flightId: string, description: string, location: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("AIRCRAFT");

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-md border border-dashed border-line px-2 py-1 text-xs text-ink-muted hover:border-line-strong hover:text-ink-3"
      >
        + Registrar objeto
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripcion del objeto..."
        className="min-w-[120px] flex-1 rounded border border-line-subtle px-2 py-1 text-xs"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && description.trim()) {
            onAdd(flightId, description.trim(), location);
            setDescription(""); setLocation("AIRCRAFT"); setShowForm(false);
          }
        }}
      />
      <select
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="rounded border border-line-subtle px-2 py-1 text-xs"
      >
        {LOST_ITEM_LOCATIONS.map((l) => (
          <option key={l} value={l}>{LOST_ITEM_LOCATION_LABELS[l]}</option>
        ))}
      </select>
      <button
        onClick={() => {
          if (description.trim()) {
            onAdd(flightId, description.trim(), location);
            setDescription(""); setLocation("AIRCRAFT"); setShowForm(false);
          }
        }}
        disabled={!description.trim()}
        className="rounded bg-warning px-2 py-1 text-xs font-semibold text-warning-strong hover:brightness-95 disabled:opacity-50"
      >
        Registrar
      </button>
      <button
        onClick={() => { setShowForm(false); setDescription(""); setLocation("AIRCRAFT"); }}
        className="text-xs text-ink-muted hover:text-ink-2"
      >
        Cancelar
      </button>
    </div>
  );
}

function AddServiceRow({
  flightId,
  existingTypes,
  onAdd,
}: {
  flightId: string;
  existingTypes: string[];
  onAdd: (flightId: string, type: string, customName?: string, reference?: string, target?: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [customName, setCustomName] = useState("");
  const [reference, setReference] = useState("");
  const [target, setTarget] = useState("");

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-md border border-dashed border-line px-2 py-1 text-xs text-ink-muted hover:border-line-strong hover:text-ink-3"
      >
        + Añadir servicio
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        className="rounded border border-line-subtle px-2 py-1 text-xs"
      >
        <option value="">Seleccionar...</option>
        {SERVICE_TYPES.map((t) => (
          <option key={t} value={t}>
            {SERVICE_LABELS[t]}
          </option>
        ))}
      </select>
      {selectedType === "CUSTOM" && (
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Nombre..."
          className="rounded border border-line-subtle px-2 py-1 text-xs"
        />
      )}
      {selectedType === "CATERING" && (
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded border border-line-subtle px-2 py-1 text-xs"
        >
          <option value="">Target...</option>
          {SERVICE_TARGETS.map((t) => (
            <option key={t} value={t}>
              {SERVICE_TARGET_LABELS[t]}
            </option>
          ))}
        </select>
      )}
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder="Ref# (opcional)"
        className="w-24 rounded border border-line-subtle px-2 py-1 text-xs"
      />
      <button
        onClick={() => {
          if (selectedType) {
            onAdd(flightId, selectedType, customName || undefined, reference || undefined, target || undefined);
            setSelectedType(""); setCustomName(""); setReference(""); setTarget("");
            setShowForm(false);
          }
        }}
        disabled={!selectedType}
        className="rounded bg-brand px-2 py-1 text-xs font-semibold text-brand-on hover:bg-brand-hover disabled:opacity-50"
      >
        Añadir
      </button>
      <button
        onClick={() => { setShowForm(false); setSelectedType(""); setCustomName(""); setReference(""); setTarget(""); }}
        className="text-xs text-ink-muted hover:text-ink-2"
      >
        Cancelar
      </button>
    </div>
  );
}
