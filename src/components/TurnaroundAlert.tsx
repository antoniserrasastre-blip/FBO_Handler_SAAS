"use client";

import { Flight, Service } from "@/types/compat";
import { AlertIcon } from "./Icons";
import { normalizeFlightState } from "@/types";

type FlightWithServices = Flight & { services: Service[] };

interface TurnaroundAlertsProps {
  flights: FlightWithServices[];
  /** Día operativo visualizado. Por defecto, hoy UTC. */
  referenceDate?: Date;
  /** Si se provee, cada fila se vuelve clicable y dispara este callback. */
  onSelectFlight?: (flightId: string) => void;
}

type AlertKind = "ARRIVAL" | "DEPARTURE";

interface FlightAlert {
  flightId: string;
  callsign: string;
  kind: AlertKind;
  minutesLeft: number;
  pendingServices: number;
}

/** "DD/MM" UTC del día de referencia (formato que usa Flight.arrivalDate/departureDate). */
function refShortDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** Una pernocta trae arrivalDate de ayer y departureDate de hoy (o viceversa).
 *  La alerta solo es relevante si la leg en cuestión cae en el día visualizado. */
function isSameDay(stored: string | null | undefined, refDay: string): boolean {
  if (!stored) return true; // sin fecha explícita → asumimos hoy (datos legacy)
  return stored.slice(0, 5) === refDay;
}

export function getTurnaroundAlerts(
  flights: FlightWithServices[],
  referenceDate: Date = new Date(),
): FlightAlert[] {
  const alerts: FlightAlert[] = [];

  const now = new Date();
  // Per CLAUDE.md: flight ETA/ETD are in Zulu (UTC); compare against UTC now, not local.
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const refDay = refShortDate(referenceDate);

  for (const flight of flights) {
    const state = normalizeFlightState(flight.state);

    // Llegada: vuelo EXPECTED con ETA en ventana [-15, +30] min y arrivalDate de hoy
    if (state === "EXPECTED" && flight.eta) {
      if (!isSameDay(flight.arrivalDate, refDay)) continue;
      const [h, m] = flight.eta.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const minutesUntilArrival = h * 60 + m - currentMinutes;
        if (minutesUntilArrival > -15 && minutesUntilArrival <= 30) {
          alerts.push({
            flightId: flight.id,
            callsign: flight.callsign,
            kind: "ARRIVAL",
            minutesLeft: minutesUntilArrival,
            pendingServices: 0,
          });
        }
      }
      continue;
    }

    // Salida: ON_BLOCKS / PARKED / TURNAROUND / BOARDING con ETD <= 90 min y departureDate de hoy.
    // Con ATD anotado el avión ya salió (aunque el estado no se haya cerrado): sin alerta.
    if (
      (state === "ON_BLOCKS" || state === "PARKED" || state === "TURNAROUND" || state === "BOARDING") &&
      flight.etd &&
      !flight.atd
    ) {
      if (!isSameDay(flight.departureDate, refDay)) continue;
      const [h, m] = flight.etd.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) continue;

      const minutesUntilDeparture = h * 60 + m - currentMinutes;
      // Sin límite inferior: un vuelo con ETD pasada sigue en tierra y la alerta
      // "sale hace X min" persiste hasta OFF_BLOCKS / atd (B4).
      if (minutesUntilDeparture <= 90) {
        // Filtrar servicios DEPARTURE / BOTH pendientes. La API v2 emite
        // `direction`; `phase` es el alias legacy — espejo de servicePhase()
        // en lib/flightUrgency.ts (no exportado).
        const pendingServices = flight.services.filter((s) => {
          const phase = s.phase || s.direction || "DEPARTURE";
          return s.state !== "DELIVERED" && (phase === "DEPARTURE" || phase === "BOTH");
        }).length;
        if (pendingServices > 0 || minutesUntilDeparture <= 30) {
          alerts.push({
            flightId: flight.id,
            callsign: flight.callsign,
            kind: "DEPARTURE",
            minutesLeft: minutesUntilDeparture,
            pendingServices,
          });
        }
      }
    }
  }

  return alerts.sort((a, b) => a.minutesLeft - b.minutesLeft);
}

export function TurnaroundAlerts({ flights, referenceDate, onSelectFlight }: TurnaroundAlertsProps) {
  const alerts = getTurnaroundAlerts(flights, referenceDate);

  if (alerts.length === 0) return null;

  const clickable = Boolean(onSelectFlight);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-3">
      <div className="rounded-hx-md border border-danger-strong bg-danger-bg p-3">
        <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-danger-strong">
          <AlertIcon size={14} />
          <span>
            Alertas (<span className="[font-variant-numeric:tabular-nums]">{alerts.length}</span>)
          </span>
        </div>
        <div className="mt-2 space-y-1 font-mono text-sm [font-variant-numeric:tabular-nums]">
          {alerts.map((alert) => {
            const verb = alert.kind === "ARRIVAL" ? "llega" : "sale";
            const isPast = alert.minutesLeft < 0;
            const verbLabel = isPast
              ? `${verb} hace ${Math.abs(alert.minutesLeft)} min`
              : `${verb} en ${alert.minutesLeft} min`;
            const ariaLabel = `Ir al vuelo ${alert.callsign}, ${verbLabel}`;
            const rowClass = `flex w-full items-center gap-3 rounded-hx-sm text-left text-danger-strong${
              clickable
                ? " cursor-pointer px-1 py-0.5 transition-colors hover:bg-danger-bg/60 focus:outline-none focus:ring-2 focus:ring-danger-strong/40"
                : ""
            }`;
            const content = (
              <>
                <span
                  className={`rounded-hx-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    alert.kind === "ARRIVAL"
                      ? "bg-info-bg text-info-strong"
                      : "bg-warning-bg text-warning-strong"
                  }`}
                >
                  {alert.kind === "ARRIVAL" ? "LLEGADA" : "SALIDA"}
                </span>
                <span className="font-semibold text-ink-1">{alert.callsign}</span>
                <span className="text-ink-2">
                  {verb}{" "}
                  {isPast ? (
                    <span className="font-semibold text-danger-strong">
                      hace {Math.abs(alert.minutesLeft)} min
                    </span>
                  ) : (
                    <>
                      en{" "}
                      <span className="font-semibold text-danger-strong">
                        {alert.minutesLeft} min
                      </span>
                    </>
                  )}
                </span>
                {alert.pendingServices > 0 ? (
                  <span className="rounded-hx-sm bg-danger-bg px-1.5 py-0.5 text-xs font-semibold text-danger-strong ring-1 ring-danger-strong">
                    {alert.pendingServices} servicio{alert.pendingServices !== 1 ? "s" : ""}{" "}
                    pendiente{alert.pendingServices !== 1 ? "s" : ""}
                  </span>
                ) : null}
              </>
            );
            if (clickable) {
              return (
                <button
                  key={alert.flightId + alert.kind}
                  type="button"
                  onClick={() => onSelectFlight?.(alert.flightId)}
                  aria-label={ariaLabel}
                  className={rowClass}
                >
                  {content}
                </button>
              );
            }
            return (
              <div
                key={alert.flightId + alert.kind}
                className={rowClass}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
