"use client";

import { useState } from "react";
import { Flight, Service, EventLog } from "@prisma/client";
import {
  FLIGHT_STATE_CONFIG,
  FlightState,
  FUEL_LABELS,
  FuelState,
  TOILET_STATES,
  TOILET_LABELS,
  ToiletState,
  TRANSPORT_LABELS,
  TransportType,
  TRANSPORT_STATE_LABELS,
  CREW_LOCATION_LABELS,
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
} from "@/types";
import { ServiceIcon, ArrivedIcon, DeliveredIcon, ChevronUp, ChevronDown, CloseIcon } from "./Icons";
import { ArrowRight, Trash2 } from "lucide-react";
import { ServiceBadges } from "./ServiceCheckbox";

type FlightWithRelations = Flight & {
  services: Service[];
  eventLogs?: (EventLog & { user: { name: string } | null })[];
};

interface FlightCardProps {
  flight: FlightWithRelations;
  onUpdate: (id: string, data: Partial<Flight>) => void;
  onServiceToggle: (serviceId: string, newState: string) => void;
  onAddService: (flightId: string, type: string, customName?: string, reference?: string, target?: string) => void;
  onDeleteService: (serviceId: string) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}

export function FlightCard({
  flight,
  onUpdate,
  onServiceToggle,
  onAddService,
  onDeleteService,
  onDelete,
  readOnly = false,
}: FlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const stateConfig = FLIGHT_STATE_CONFIG[flight.state as FlightState] || FLIGHT_STATE_CONFIG.EXPECTED;

  const stateProgress: Record<string, number> = { EXPECTED: 0, ON_GROUND: 33, BOARDING: 66, DISPATCHED: 100 };
  const progress = stateProgress[flight.state] ?? 0;

  const isOvernight = flight.arrivalDate && flight.departureDate && flight.arrivalDate !== flight.departureDate;

  return (
    <div
      className={`overflow-hidden rounded-lg border-l-4 bg-white shadow-sm transition-shadow hover:shadow-md`}
      style={{ borderLeftColor: stateConfig.color }}
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-base font-bold text-gray-900 sm:text-lg">{flight.registration}</span>
                <span className="text-xs text-gray-500 sm:text-sm">{flight.aircraftType}</span>
                <span className="text-xs text-gray-400 sm:text-sm">{flight.callsign}</span>
                {flight.parking && (
                  <span className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600 sm:px-1.5 sm:text-xs">
                    {flight.parking}
                  </span>
                )}
                {isOvernight && (
                  <span className="rounded bg-purple-100 px-1 py-0.5 text-[10px] font-medium text-purple-600 sm:px-1.5 sm:text-xs">
                    PERNOCTA
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-gray-600 sm:mt-1 sm:gap-x-2 sm:text-sm">
                <span className="text-gray-400">LLEG</span>
                <span className="font-medium">{flight.origin || "----"}</span>
                {flight.arrivalDate && <span className="text-[10px] text-gray-400">{flight.arrivalDate}</span>}
                <span className="text-gray-400">{flight.eta || "--:--"}</span>
                <ArrowRight size={12} className="shrink-0 text-gray-300" />
                <span className="text-gray-400">SAL</span>
                <span className="font-medium">{flight.destination || "----"}</span>
                {flight.departureDate && <span className="text-[10px] text-gray-400">{flight.departureDate}</span>}
                <span className="text-gray-400">{flight.etd || "--:--"}</span>
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-4 text-xs text-gray-500 sm:flex">
            <div className="text-center">
              <div className="text-gray-400">CREW</div>
              <div>{flight.crewArrival}/{flight.crewDeparture}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">PAX</div>
              <div>{flight.paxArrival}/{flight.paxDeparture}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">FUEL</div>
              <div className={flight.fuelState === "SERVED" ? "text-green-600" : flight.fuelState === "REQUESTED" ? "text-yellow-600" : ""}>
                {FUEL_LABELS[flight.fuelState as FuelState] || flight.fuelState}
              </div>
            </div>
            {expanded ? <ChevronUp size={16} className="text-gray-300" /> : <ChevronDown size={16} className="text-gray-300" />}
          </div>

          <span className="sm:hidden">{expanded ? <ChevronUp size={16} className="text-gray-300" /> : <ChevronDown size={16} className="text-gray-300" />}</span>
        </div>

        <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 sm:mt-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(progress, 2)}%`, backgroundColor: stateConfig.color }}
          />
        </div>

        <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-gray-500 sm:hidden">
          <span>C:{flight.crewArrival}/{flight.crewDeparture}</span>
          <span>P:{flight.paxArrival}/{flight.paxDeparture}</span>
          <span className={flight.fuelState === "SERVED" ? "text-green-600" : flight.fuelState === "REQUESTED" ? "text-yellow-600" : ""}>
            F:{FUEL_LABELS[flight.fuelState as FuelState] || flight.fuelState}
          </span>
        </div>

        {!expanded && (
          <div className="mt-2 flex items-center justify-between gap-4">
            <div onClick={(e) => e.stopPropagation()} className={readOnly ? "pointer-events-none" : ""}>
              {flight.services.length > 0 && (
                <ServiceBadges services={flight.services} onToggle={onServiceToggle} />
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
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3" onClick={(e) => e.stopPropagation()}>
          {/* Delete button */}
          {!readOnly && (
            <div className="mb-3 flex justify-end">
              <button
                onClick={() => {
                  if (window.confirm(`Eliminar vuelo ${flight.registration} (${flight.callsign})?`)) {
                    onDelete(flight.id);
                  }
                }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 size={12} />
                Eliminar vuelo
              </button>
            </div>
          )}

          <div className={`grid gap-4 lg:grid-cols-3 ${readOnly ? "pointer-events-none opacity-75" : ""}`}>

            {/* ===== LEFT COLUMN — LLEGADA ===== */}
            <div className="space-y-4 rounded-lg bg-blue-50/40 p-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-blue-700">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-[10px]">&#x2193;</span>
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
              <Section title="Tripulacion">
                <div className="space-y-2">
                  <div className="flex gap-4">
                    <NumberField label="Est." value={flight.crewArrival} onChange={(v) => onUpdate(flight.id, { crewArrival: v })} />
                    <NumberField label="Real" value={flight.crewArrivalReal ?? 0} onChange={(v) => onUpdate(flight.id, { crewArrivalReal: v })} />
                  </div>
                  <ButtonGroup
                    label="Ubicacion"
                    value={flight.crewArrLocation}
                    options={[
                      { value: "IN_AIRCRAFT", label: CREW_LOCATION_LABELS.IN_AIRCRAFT, activeClass: "bg-blue-100 text-blue-700 ring-1 ring-blue-400" },
                      { value: "IN_LOUNGE", label: CREW_LOCATION_LABELS.IN_LOUNGE, activeClass: "bg-amber-100 text-amber-700 ring-1 ring-amber-400" },
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
                      activeClass: s === "DELIVERED" ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                        : s === "UNLOADED" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400"
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
                      activeClass: s === "COMPLETED" ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                        : s === "IN_LOUNGE" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400"
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
                      { value: "CONFIRMED", label: TRANSPORT_STATE_LABELS.CONFIRMED, activeClass: "bg-green-100 text-green-700 ring-1 ring-green-400" },
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
                  {FLIGHT_STATES.map((s) => (
                    <button
                      key={s}
                      onClick={() => onUpdate(flight.id, { state: s })}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        flight.state === s
                          ? `${FLIGHT_STATE_CONFIG[s].bg} ${FLIGHT_STATE_CONFIG[s].text} ring-1 ring-current`
                          : "bg-gray-50 text-gray-400 hover:bg-gray-100"
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
                            ? s === "SERVED" ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                              : s === "REQUESTED" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400"
                              : "bg-gray-100 text-gray-700 ring-1 ring-gray-400"
                            : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                        }`}
                      >
                        {FUEL_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  {flight.fuelRequestedAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Pedido: {flight.fuelRequestedAt}</p>
                  )}
                  {flight.fuelServedAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Servido: {flight.fuelServedAt}</p>
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
                            ? s === "COMPLETED" ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                              : s === "REQUESTED" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400"
                              : "bg-gray-100 text-gray-700 ring-1 ring-gray-400"
                            : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                        }`}
                      >
                        {TOILET_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  {flight.toiletRequestedAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Pedido: {flight.toiletRequestedAt}</p>
                  )}
                  {flight.toiletCompletedAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Completado: {flight.toiletCompletedAt}</p>
                  )}
                </div>
              </Section>

              {/* Services */}
              <Section title="Servicios / Extras">
                <div className="space-y-2">
                  <ServiceBadges services={flight.services} onToggle={onServiceToggle} />
                  <AddServiceRow
                    flightId={flight.id}
                    existingTypes={flight.services.map((s) => s.type)}
                    onAdd={onAddService}
                  />
                  {flight.services.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {flight.services.map((service) => (
                        <div key={service.id} className="flex items-center justify-between gap-2 text-xs text-gray-500">
                          <span className="flex min-w-0 items-center gap-1">
                            <ServiceIcon type={service.type} size={12} className="shrink-0 text-gray-400" />
                            {service.type === "CUSTOM" ? service.customName : SERVICE_LABELS[service.type as ServiceType]}{" "}
                            {service.target && (
                              <span className={`rounded px-1 py-0.5 text-[10px] font-bold ${service.target === "CREW" ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600"}`}>
                                {SERVICE_TARGET_LABELS[service.target as ServiceTarget]}
                              </span>
                            )}
                            {service.reference && <span className="text-blue-500">#{service.reference}</span>}
                            {service.origin && <span className="text-gray-400">({service.origin})</span>}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {service.arrivedAt && <span className="flex items-center gap-0.5 text-blue-500"><ArrivedIcon size={10} /> {service.arrivedAt}</span>}
                            {service.deliveredAt && <span className="flex items-center gap-0.5 text-green-600"><DeliveredIcon size={10} /> {service.deliveredAt}</span>}
                            <button
                              onClick={() => onDeleteService(service.id)}
                              className="text-red-400 hover:text-red-600"
                              title="Eliminar servicio"
                            >
                              <CloseIcon size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
            </div>

            {/* ===== RIGHT COLUMN — SALIDA ===== */}
            <div className="space-y-4 rounded-lg bg-orange-50/40 p-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-orange-700">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-100 text-[10px]">&#x2191;</span>
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
              <Section title="Tripulacion">
                <div className="space-y-2">
                  <div className="flex gap-4">
                    <NumberField label="Est." value={flight.crewDeparture} onChange={(v) => onUpdate(flight.id, { crewDeparture: v })} />
                    <NumberField label="Real" value={flight.crewDepartureReal ?? 0} onChange={(v) => onUpdate(flight.id, { crewDepartureReal: v })} />
                  </div>
                  <ButtonGroup
                    label="Ubicacion"
                    value={flight.crewDepLocation}
                    options={[
                      { value: "IN_AIRCRAFT", label: CREW_LOCATION_LABELS.IN_AIRCRAFT, activeClass: "bg-blue-100 text-blue-700 ring-1 ring-blue-400" },
                      { value: "IN_LOUNGE", label: CREW_LOCATION_LABELS.IN_LOUNGE, activeClass: "bg-amber-100 text-amber-700 ring-1 ring-amber-400" },
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
                      activeClass: s === "SENT_TO_AIRCRAFT" ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                        : s === "TAGGED" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400"
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
                      activeClass: s === "BOARDED" ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                        : s === "IN_LOUNGE" ? "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-400"
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
                      { value: "CONFIRMED", label: TRANSPORT_STATE_LABELS.CONFIRMED, activeClass: "bg-green-100 text-green-700 ring-1 ring-green-400" },
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
                  <div className="relative border-l-2 border-gray-200 pl-4">
                    {flight.eventLogs.map((log, i) => (
                      <div key={log.id} className="relative pb-3">
                        <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${i === 0 ? "bg-blue-500" : "bg-gray-300"}`} />
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className={`text-xs font-medium ${i === 0 ? "text-gray-700" : "text-gray-500"}`}>
                            {log.action}
                          </span>
                          {log.user && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                              {log.user.name}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">
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
    </div>
  );
}

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
      <label className="block text-[10px] font-medium text-gray-400 mb-0.5">{label}</label>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              value === opt.value
                ? opt.activeClass || "bg-gray-200 text-gray-700 ring-1 ring-gray-400"
                : "bg-gray-50 text-gray-400 hover:bg-gray-100"
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
      <label className="block text-[10px] text-gray-400">{label}</label>
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
        className="mt-0.5 block w-full rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
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
      <label className="w-12 text-xs text-gray-500">{label}</label>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-sm hover:bg-gray-200"
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
            className="w-12 rounded border border-blue-400 px-1 py-0.5 text-center text-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        ) : (
          <button
            onClick={() => { setLocal(String(value)); setEditing(true); }}
            className="w-8 text-center text-sm font-medium cursor-text hover:bg-blue-50 rounded"
            title="Click para editar"
          >
            {value}
          </button>
        )}
        <button
          onClick={() => onChange(value + 1)}
          className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-sm hover:bg-gray-200"
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
    <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-400">
      {log.user?.name || "Sistema"} · {log.action.length > 30 ? log.action.slice(0, 30) + "..." : log.action} · {time}
    </span>
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
        className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-500"
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
        className="rounded border border-gray-200 px-2 py-1 text-xs"
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
          className="rounded border border-gray-200 px-2 py-1 text-xs"
        />
      )}
      {selectedType === "CATERING" && (
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded border border-gray-200 px-2 py-1 text-xs"
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
        className="w-24 rounded border border-gray-200 px-2 py-1 text-xs"
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
        className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
      >
        Añadir
      </button>
      <button
        onClick={() => { setShowForm(false); setSelectedType(""); setCustomName(""); setReference(""); setTarget(""); }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancelar
      </button>
    </div>
  );
}
