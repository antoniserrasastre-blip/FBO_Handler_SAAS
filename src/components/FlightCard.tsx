"use client";

import { useState } from "react";
import { Flight, Service, EventLog } from "@prisma/client";
import {
  FLIGHT_STATE_CONFIG,
  FlightState,
  FUEL_LABELS,
  FuelState,
  TRANSPORT_LABELS,
  TransportType,
  PAX_STATE_LABELS,
  PaxState,
  FLIGHT_STATES,
  FUEL_STATES,
  TRANSPORT_TYPES,
  PAX_STATES,
  SERVICE_TYPES,
  SERVICE_LABELS,
  SERVICE_ICONS,
  ServiceType,
} from "@/types";
import { ServiceBadges } from "./ServiceCheckbox";

type FlightWithRelations = Flight & {
  services: Service[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

interface FlightCardProps {
  flight: FlightWithRelations;
  onUpdate: (id: string, data: Partial<Flight>) => void;
  onServiceToggle: (serviceId: string, newState: "PENDING" | "DELIVERED") => void;
  onAddService: (flightId: string, type: string, customName?: string) => void;
  onDeleteService: (serviceId: string) => void;
}

export function FlightCard({
  flight,
  onUpdate,
  onServiceToggle,
  onAddService,
  onDeleteService,
}: FlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const stateConfig = FLIGHT_STATE_CONFIG[flight.state as FlightState] || FLIGHT_STATE_CONFIG.EXPECTED;
  const needsTwoVans = flight.paxDeparture > 5;

  return (
    <div
      className={`overflow-hidden rounded-lg border-l-4 bg-white shadow-sm transition-shadow hover:shadow-md`}
      style={{ borderLeftColor: stateConfig.color }}
    >
      {/* Collapsed view — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 text-left"
      >
        <div className="flex items-start justify-between gap-4">
          {/* State badge + flight info */}
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${stateConfig.bg} ${stateConfig.text}`}
            >
              {stateConfig.label}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{flight.callsign}</span>
                <span className="text-sm text-gray-500">{flight.aircraftType}</span>
                <span className="text-sm text-gray-400">{flight.registration}</span>
                {flight.parking && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                    {flight.parking}
                  </span>
                )}
              </div>

              {/* Route line */}
              <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium">{flight.origin || "----"}</span>
                <span className="text-gray-400">{flight.eta || "--:--"}</span>
                <span className="text-gray-300">→</span>
                <span className="font-medium">{flight.destination || "----"}</span>
                <span className="text-gray-400">{flight.etd || "--:--"}</span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex shrink-0 items-center gap-4 text-xs text-gray-500">
            <div className="text-center">
              <div className="text-gray-400">LLEG</div>
              <div>C:{flight.crewArrival} P:{flight.paxArrival}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">SAL</div>
              <div>
                C:{flight.crewDeparture} P:{flight.paxDeparture}
                {needsTwoVans && <span className="ml-1 font-bold text-red-500">⚠2FURG</span>}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">FUEL</div>
              <div className={flight.fuelState === "SERVED" ? "text-green-600" : flight.fuelState === "REQUESTED" ? "text-yellow-600" : ""}>
                {FUEL_LABELS[flight.fuelState as FuelState] || flight.fuelState}
              </div>
            </div>
            <span className="text-gray-300">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>

        {/* Services row in collapsed view */}
        {flight.services.length > 0 && !expanded && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <ServiceBadges services={flight.services} onToggle={onServiceToggle} />
          </div>
        )}
      </button>

      {/* Expanded view */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3" onClick={(e) => e.stopPropagation()}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              {flight.tobt && (
                <p className="mt-1 text-xs text-gray-500">TOBT: {flight.tobt}</p>
              )}
            </Section>

            {/* Arrival Crew */}
            <Section title="Tripulacion llegada">
              <div className="space-y-2">
                <NumberField
                  label="Crew"
                  value={flight.crewArrival}
                  onChange={(v) => onUpdate(flight.id, { crewArrival: v })}
                />
                <SelectField
                  label="Ubicacion"
                  value={flight.crewArrLocation}
                  options={[
                    { value: "IN_AIRCRAFT", label: "En avion" },
                    { value: "IN_LOUNGE", label: "En sala" },
                  ]}
                  onChange={(v) => onUpdate(flight.id, { crewArrLocation: v })}
                />
                <NumberField
                  label="Cruces filtro"
                  value={flight.crewArrFilterCrossings}
                  onChange={(v) => onUpdate(flight.id, { crewArrFilterCrossings: v })}
                />
              </div>
            </Section>

            {/* Arrival Passengers */}
            <Section title="Pasajeros llegada">
              <div className="space-y-2">
                <NumberField
                  label="Pax"
                  value={flight.paxArrival}
                  onChange={(v) => onUpdate(flight.id, { paxArrival: v })}
                />
                <div className="flex gap-2">
                  <NumberField
                    label="Bodega"
                    value={flight.paxArrBagsChecked}
                    onChange={(v) => onUpdate(flight.id, { paxArrBagsChecked: v })}
                  />
                  <NumberField
                    label="Cabina"
                    value={flight.paxArrBagsCabin}
                    onChange={(v) => onUpdate(flight.id, { paxArrBagsCabin: v })}
                  />
                </div>
                <SelectField
                  label="Transporte"
                  value={flight.paxArrTransportType}
                  options={TRANSPORT_TYPES.map((t) => ({ value: t, label: TRANSPORT_LABELS[t] }))}
                  onChange={(v) => onUpdate(flight.id, { paxArrTransportType: v })}
                />
                <SelectField
                  label="Estado transporte"
                  value={flight.paxArrTransportState}
                  options={[
                    { value: "PENDING", label: "Pendiente" },
                    { value: "CONFIRMED", label: "Confirmado" },
                  ]}
                  onChange={(v) => onUpdate(flight.id, { paxArrTransportState: v })}
                />
              </div>
            </Section>

            {/* Departure Crew */}
            <Section title="Tripulacion salida">
              <div className="space-y-2">
                <NumberField
                  label="Crew"
                  value={flight.crewDeparture}
                  onChange={(v) => onUpdate(flight.id, { crewDeparture: v })}
                />
                <SelectField
                  label="Ubicacion"
                  value={flight.crewDepLocation}
                  options={[
                    { value: "IN_AIRCRAFT", label: "En avion" },
                    { value: "IN_LOUNGE", label: "En sala" },
                  ]}
                  onChange={(v) => onUpdate(flight.id, { crewDepLocation: v })}
                />
                <NumberField
                  label="Cruces filtro"
                  value={flight.crewDepFilterCrossings}
                  onChange={(v) => onUpdate(flight.id, { crewDepFilterCrossings: v })}
                />
              </div>
            </Section>

            {/* Departure Passengers */}
            <Section title={
              <span>
                Pasajeros salida
                {needsTwoVans && (
                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600">
                    ⚠ 2 FURGONETAS
                  </span>
                )}
              </span>
            }>
              <div className="space-y-2">
                <NumberField
                  label="Pax"
                  value={flight.paxDeparture}
                  onChange={(v) => onUpdate(flight.id, { paxDeparture: v })}
                />
                <div className="flex gap-2">
                  <NumberField
                    label="Bodega"
                    value={flight.paxDepBagsChecked}
                    onChange={(v) => onUpdate(flight.id, { paxDepBagsChecked: v })}
                  />
                  <NumberField
                    label="Cabina"
                    value={flight.paxDepBagsCabin}
                    onChange={(v) => onUpdate(flight.id, { paxDepBagsCabin: v })}
                  />
                </div>
                <SelectField
                  label="Maletas"
                  value={flight.paxDepBagsState}
                  options={[
                    { value: "PENDING", label: "Pendiente" },
                    { value: "SENT_TO_AIRCRAFT", label: "Enviadas a avion" },
                  ]}
                  onChange={(v) => onUpdate(flight.id, { paxDepBagsState: v })}
                />
                <SelectField
                  label="Estado pax"
                  value={flight.paxDepState}
                  options={PAX_STATES.map((s) => ({ value: s, label: PAX_STATE_LABELS[s] }))}
                  onChange={(v) => onUpdate(flight.id, { paxDepState: v })}
                />
                <SelectField
                  label="Transporte"
                  value={flight.paxDepTransportType}
                  options={TRANSPORT_TYPES.map((t) => ({ value: t, label: TRANSPORT_LABELS[t] }))}
                  onChange={(v) => onUpdate(flight.id, { paxDepTransportType: v })}
                />
                <SelectField
                  label="Estado transporte"
                  value={flight.paxDepTransportState}
                  options={[
                    { value: "PENDING", label: "Pendiente" },
                    { value: "CONFIRMED", label: "Confirmado" },
                  ]}
                  onChange={(v) => onUpdate(flight.id, { paxDepTransportState: v })}
                />
              </div>
            </Section>

            {/* Fuel & Toilet */}
            <Section title="Combustible y servicios">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">Fuel</label>
                  <div className="mt-1 flex gap-1">
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
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
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
                  {flight.fuelServedAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Servido: {flight.fuelServedAt}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-500">Toilet</label>
                  <div className="mt-1 flex gap-1">
                    {(["PENDING", "COMPLETED"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          const data: Partial<Flight> & Record<string, unknown> = { toiletState: s };
                          if (s === "COMPLETED") {
                            data.toiletCompletedAt = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
                          }
                          onUpdate(flight.id, data);
                        }}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                          flight.toiletState === s
                            ? s === "COMPLETED" ? "bg-green-100 text-green-700 ring-1 ring-green-400"
                              : "bg-gray-100 text-gray-700 ring-1 ring-gray-400"
                            : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                        }`}
                      >
                        {s === "PENDING" ? "Pendiente" : "Completado"}
                      </button>
                    ))}
                  </div>
                  {flight.toiletCompletedAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Completado: {flight.toiletCompletedAt}</p>
                  )}
                </div>
              </div>
            </Section>
          </div>

          {/* Services section */}
          <div className="mt-4">
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
                      <div key={service.id} className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {SERVICE_ICONS[service.type as ServiceType] || "🔧"}{" "}
                          {service.type === "CUSTOM" ? service.customName : SERVICE_LABELS[service.type as ServiceType]}{" "}
                          {service.origin && <span className="text-gray-400">({service.origin})</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          {service.deliveredAt && <span className="text-green-600">✓ {service.deliveredAt}</span>}
                          <button
                            onClick={() => onDeleteService(service.id)}
                            className="text-red-400 hover:text-red-600"
                            title="Eliminar servicio"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          </div>

          {/* Event log */}
          {flight.eventLogs.length > 0 && (
            <div className="mt-4">
              <Section title="Log de eventos">
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {flight.eventLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="shrink-0 text-gray-400">
                        {new Date(log.timestamp).toLocaleTimeString("es-ES", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>{log.action}</span>
                      {log.user && <span className="text-gray-400">— {log.user.name}</span>}
                    </div>
                  ))}
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
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 text-xs text-gray-500">{label}</label>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-sm hover:bg-gray-200"
        >
          -
        </button>
        <span className="w-8 text-center text-sm font-medium">{value}</span>
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

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 shrink-0 text-xs text-gray-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
  onAdd: (flightId: string, type: string, customName?: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState("");
  const [customName, setCustomName] = useState("");

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
    <div className="flex items-center gap-2">
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        className="rounded border border-gray-200 px-2 py-1 text-xs"
      >
        <option value="">Seleccionar...</option>
        {SERVICE_TYPES.map((t) => (
          <option key={t} value={t}>
            {SERVICE_ICONS[t]} {SERVICE_LABELS[t]}
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
      <button
        onClick={() => {
          if (selectedType) {
            onAdd(flightId, selectedType, customName || undefined);
            setSelectedType("");
            setCustomName("");
            setShowForm(false);
          }
        }}
        disabled={!selectedType}
        className="rounded bg-blue-500 px-2 py-1 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
      >
        Añadir
      </button>
      <button
        onClick={() => { setShowForm(false); setSelectedType(""); setCustomName(""); }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancelar
      </button>
    </div>
  );
}
