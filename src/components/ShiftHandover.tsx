"use client";

import { useMemo } from "react";
import { Flight, Service, LostItem, EventLog } from "@/types/compat";
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
      (f.services || []).filter((s) => isServiceOverdue(s)).map((s) => ({ flight: f, service: s }))
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
          <Stat label="En tierra / Embarque" value={summary.inProgress.length} tone="onblocks" />
          <Stat label="Esperados" value={summary.expected.length} tone="expected" />
          <Stat label="Despachados" value={summary.dispatched.length} tone="departed" />
          <Stat label="Retrasados" value={summary.overdueServices.length} tone="alert" />
        </div>

        {summary.inProgress.length > 0 && (
          <Section title={`Vuelos en curso (${summary.inProgress.length})`}>
            <div className="space-y-1">
              {summary.inProgress.map((f) => {
                const stateConfig = FLIGHT_STATE_CONFIG[f.state as FlightState];
                const opName = getOperatorName(f.callsign);
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-hx-sm bg-bg-subtle px-3 py-1.5 font-mono text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded-hx-sm px-1.5 py-0.5 text-[10px] font-semibold ${stateConfig?.bg ?? "bg-bg-muted"} ${stateConfig?.text ?? "text-ink-2"}`}
                      >
                        {stateConfig?.label}
                      </span>
                      <span className="font-semibold text-ink-1">{f.registration}</span>
                      <span className="text-ink-3">{f.callsign}</span>
                      {opName !== "Privado" ? (
                        <span className="text-brand-active">{opName}</span>
                      ) : null}
                      {f.parking ? (
                        <span className="rounded-hx-sm bg-bg-muted px-1 text-[10px] text-ink-2">
                          {f.parking}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-ink-muted [font-variant-numeric:tabular-nums]">
                      ETD {f.etd || "--:--"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {summary.pendingServices.length > 0 && (
          <Section title={`Servicios pendientes (${summary.pendingServices.length})`}>
            <div className="space-y-1">
              {summary.pendingServices.slice(0, 20).map(({ flight, service }) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between rounded-hx-sm bg-bg-subtle px-3 py-1 font-mono text-xs"
                >
                  <span>
                    <span className="font-semibold text-ink-1">{flight.registration}</span>{" "}
                    <span className="text-ink-2">{service.customName || service.type}</span>
                    {service.origin ? (
                      <span className="text-ink-muted"> ({service.origin})</span>
                    ) : null}
                  </span>
                  <span
                    className={`rounded-hx-sm px-1.5 py-0.5 text-[10px] font-semibold ${
                      service.state === "ARRIVED"
                        ? "bg-info-bg text-info-strong"
                        : "bg-bg-muted text-ink-2"
                    }`}
                  >
                    {service.state === "ARRIVED" ? "Llegado, sin entregar" : "Pendiente"}
                  </span>
                </div>
              ))}
              {summary.pendingServices.length > 20 ? (
                <p className="font-mono text-xs text-ink-muted">
                  …y {summary.pendingServices.length - 20} más
                </p>
              ) : null}
            </div>
          </Section>
        )}

        {summary.overdueServices.length > 0 && (
          <Section title={`Servicios retrasados (${summary.overdueServices.length})`} tone="danger">
            <div className="space-y-1">
              {summary.overdueServices.map(({ flight, service }) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between rounded-hx-sm border border-danger-strong bg-danger-bg px-3 py-1 font-mono text-xs"
                >
                  <span>
                    <span className="text-danger-strong">⚠</span>{" "}
                    <span className="font-semibold text-ink-1">{flight.registration}</span>{" "}
                    <span className="text-ink-2">{service.customName || service.type}</span>
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {summary.fuelPending.length > 0 && (
          <Section title={`Fuel pendiente (${summary.fuelPending.length})`} tone="warning">
            <div className="flex flex-wrap gap-1">
              {summary.fuelPending.map((f) => (
                <span
                  key={f.id}
                  className="rounded-hx-sm bg-warning-bg px-2 py-0.5 font-mono text-xs text-warning-strong"
                >
                  {f.registration} {f.fuelState === "REQUESTED" ? "(pedido)" : "(no pedido)"}
                </span>
              ))}
            </div>
          </Section>
        )}

        {summary.policiaNeeded.length > 0 && (
          <Section title={`Policía necesaria (${summary.policiaNeeded.length})`}>
            <div className="flex flex-wrap gap-1">
              {summary.policiaNeeded.map((f) => (
                <span
                  key={f.id}
                  className="rounded-hx-sm bg-bg-muted px-2 py-0.5 font-mono text-xs text-ink-1"
                >
                  {f.registration} ({f.origin})
                </span>
              ))}
            </div>
          </Section>
        )}

        {summary.openLostItems.length > 0 && (
          <Section title={`Objetos sin reclamar (${summary.openLostItems.length})`} tone="warning">
            <div className="space-y-1">
              {summary.openLostItems.map(({ flight, item }) => (
                <div key={item.id} className="rounded-hx-sm bg-warning-bg px-3 py-1 font-mono text-xs">
                  <span className="font-semibold text-ink-1">{flight.registration}</span>
                  {" — "}
                  <span className="text-ink-2">{item.description}</span>{" "}
                  <span className="text-ink-muted">({item.location})</span>
                  {item.state === "CLAIMED" && item.claimedBy ? (
                    <span className="ml-2 text-brand-active">→ {item.claimedBy}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>
        )}

        {summary.inProgress.length === 0 &&
        summary.pendingServices.length === 0 &&
        summary.openLostItems.length === 0 &&
        summary.overdueServices.length === 0 ? (
          <div className="rounded-hx-md border border-success-strong bg-success-bg p-4 text-center text-sm text-success-strong">
            Todo resuelto para este turno. Buen trabajo.
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

const STAT_TONE: Record<string, string> = {
  onblocks: "text-fbo-onblocks",
  expected: "text-ink-2",
  departed: "text-fbo-departed",
  alert: "text-danger-strong",
};

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof STAT_TONE }) {
  return (
    <div className="rounded-hx-md border border-line-subtle bg-bg-subtle px-3 py-2">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div
        className={`font-mono text-xl font-semibold [font-variant-numeric:tabular-nums] ${STAT_TONE[tone]}`}
      >
        {value}
      </div>
    </div>
  );
}

const SECTION_TONE: Record<string, string> = {
  default: "text-ink-2",
  warning: "text-warning-strong",
  danger: "text-danger-strong",
};

function Section({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: keyof typeof SECTION_TONE;
}) {
  return (
    <div>
      <h3
        className={`mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider ${SECTION_TONE[tone]}`}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
