"use client";

import { useMemo } from "react";
import { Flight, Service, LostItem, EventLog } from "@prisma/client";
import { Modal } from "./Modal";
import { isServiceOverdue } from "@/lib/overdue";
import { getRequiredAuthorities } from "@/lib/countries";
import { getOperatorName } from "@/lib/operators";
import { FLIGHT_STATE_CONFIG, FlightState } from "@/types";

type FlightWithRelations = Flight & {
  services: Service[];
  lostItems: LostItem[];
  eventLogs: (EventLog & { user: { name: string } | null })[];
};

interface ShiftHandoverProps {
  isOpen: boolean;
  onClose: () => void;
  flights: FlightWithRelations[];
  date: Date;
}

export function ShiftHandover({ isOpen, onClose, flights, date }: ShiftHandoverProps) {
  const summary = useMemo(() => {
    const inProgress = flights.filter((f) => f.state !== "DISPATCHED" && f.state !== "EXPECTED");
    const expected = flights.filter((f) => f.state === "EXPECTED");
    const dispatched = flights.filter((f) => f.state === "DISPATCHED");
    const fuelPending = flights.filter((f) => f.state !== "DISPATCHED" && (f.fuelState === "REQUESTED" || f.fuelState === "NOT_REQUESTED"));
    const pendingServices = flights.flatMap((f) =>
      (f.services || []).filter((s) => s.state !== "DELIVERED").map((s) => ({ flight: f, service: s }))
    );
    const overdueServices = flights.flatMap((f) =>
      (f.services || []).filter(isServiceOverdue).map((s) => ({ flight: f, service: s }))
    );
    const openLostItems = flights.flatMap((f) =>
      (f.lostItems || []).filter((li) => li.state !== "DELIVERED").map((li) => ({ flight: f, item: li }))
    );
    const policiaNeeded = flights.filter((f) => f.state !== "DISPATCHED" && getRequiredAuthorities(f.origin).policia);

    return { inProgress, expected, dispatched, fuelPending, pendingServices, overdueServices, openLostItems, policiaNeeded };
  }, [flights]);

  const dateStr = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Traspaso de turno — ${dateStr}`} wide>
      <div className="space-y-4 text-sm">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="En tierra / Embarque" value={summary.inProgress.length} color="text-blue-700" />
          <Stat label="Esperados" value={summary.expected.length} color="text-gray-600" />
          <Stat label="Despachados" value={summary.dispatched.length} color="text-green-700" />
          <Stat label="Retrasados" value={summary.overdueServices.length} color="text-red-700" />
        </div>

        {/* Vuelos en curso */}
        {summary.inProgress.length > 0 && (
          <Section title={`Vuelos en curso (${summary.inProgress.length})`} color="text-blue-700">
            <div className="space-y-1">
              {summary.inProgress.map((f) => {
                const stateConfig = FLIGHT_STATE_CONFIG[f.state as FlightState];
                const opName = getOperatorName(f.callsign);
                return (
                  <div key={f.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-xs">
                    <span className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${stateConfig?.bg} ${stateConfig?.text}`}>
                        {stateConfig?.label}
                      </span>
                      <span className="font-semibold">{f.registration}</span>
                      <span className="text-gray-500">{f.callsign}</span>
                      {opName !== "Privado" && <span className="text-indigo-600">{opName}</span>}
                      {f.parking && <span className="rounded bg-gray-200 px-1 text-[10px]">{f.parking}</span>}
                    </span>
                    <span className="text-gray-400">
                      ETD {f.etd || "--:--"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Servicios pendientes */}
        {summary.pendingServices.length > 0 && (
          <Section title={`Servicios pendientes (${summary.pendingServices.length})`} color="text-amber-700">
            <div className="space-y-1">
              {summary.pendingServices.slice(0, 20).map(({ flight, service }) => (
                <div key={service.id} className="flex items-center justify-between rounded bg-gray-50 px-3 py-1 text-xs">
                  <span>
                    <span className="font-semibold">{flight.registration}</span>
                    {" "}
                    <span className="text-gray-600">{service.customName || service.type}</span>
                    {service.origin && <span className="text-gray-400"> ({service.origin})</span>}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    service.state === "ARRIVED" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {service.state === "ARRIVED" ? "Llegado, sin entregar" : "Pendiente"}
                  </span>
                </div>
              ))}
              {summary.pendingServices.length > 20 && (
                <p className="text-xs text-gray-400">...y {summary.pendingServices.length - 20} mas</p>
              )}
            </div>
          </Section>
        )}

        {/* Retrasados (urgente) */}
        {summary.overdueServices.length > 0 && (
          <Section title={`Servicios retrasados (${summary.overdueServices.length})`} color="text-red-700">
            <div className="space-y-1">
              {summary.overdueServices.map(({ flight, service }) => (
                <div key={service.id} className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-1 text-xs">
                  <span>
                    <span className="text-red-600">&#9888;</span>{" "}
                    <span className="font-semibold">{flight.registration}</span>
                    {" "}
                    <span className="text-gray-700">{service.customName || service.type}</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Fuel pendiente */}
        {summary.fuelPending.length > 0 && (
          <Section title={`Fuel pendiente (${summary.fuelPending.length})`} color="text-yellow-700">
            <div className="flex flex-wrap gap-1">
              {summary.fuelPending.map((f) => (
                <span key={f.id} className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                  {f.registration} {f.fuelState === "REQUESTED" ? "(pedido)" : "(no pedido)"}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Policia */}
        {summary.policiaNeeded.length > 0 && (
          <Section title={`Policia necesaria (${summary.policiaNeeded.length})`} color="text-purple-700">
            <div className="flex flex-wrap gap-1">
              {summary.policiaNeeded.map((f) => (
                <span key={f.id} className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
                  {f.registration} ({f.origin})
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Objetos olvidados abiertos */}
        {summary.openLostItems.length > 0 && (
          <Section title={`Objetos sin reclamar (${summary.openLostItems.length})`} color="text-orange-700">
            <div className="space-y-1">
              {summary.openLostItems.map(({ flight, item }) => (
                <div key={item.id} className="rounded bg-orange-50 px-3 py-1 text-xs">
                  <span className="font-semibold">{flight.registration}</span>
                  {" — "}
                  <span className="text-gray-700">{item.description}</span>
                  {" "}
                  <span className="text-gray-400">({item.location})</span>
                  {item.state === "CLAIMED" && item.claimedBy && (
                    <span className="ml-2 text-blue-600">&rarr; {item.claimedBy}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Todo OK */}
        {summary.inProgress.length === 0 && summary.pendingServices.length === 0 && summary.openLostItems.length === 0 && summary.overdueServices.length === 0 && (
          <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700">
            Todo resuelto para este turno. Buen trabajo.
          </div>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={`mb-1.5 text-xs font-bold uppercase tracking-wider ${color}`}>{title}</h3>
      {children}
    </div>
  );
}
