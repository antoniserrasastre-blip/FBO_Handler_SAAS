"use client";

import { Flight, Service } from "@prisma/client";
import { AlertIcon } from "./Icons";
import { normalizeFlightState } from "@/types";

type FlightWithServices = Flight & { services: Service[] };

interface TurnaroundAlertsProps {
  flights: FlightWithServices[];
}

type AlertKind = "ARRIVAL" | "DEPARTURE";

interface FlightAlert {
  flightId: string;
  callsign: string;
  kind: AlertKind;
  minutesLeft: number;
  pendingServices: number;
}

export function getTurnaroundAlerts(flights: FlightWithServices[]): FlightAlert[] {
  const alerts: FlightAlert[] = [];

  const now = new Date();
  // Per CLAUDE.md: flight ETA/ETD are in Zulu (UTC); compare against UTC now, not local.
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  for (const flight of flights) {
    const state = normalizeFlightState(flight.state);

    // Llegada: vuelo EXPECTED con ETA <= 30 min
    if (state === "EXPECTED" && flight.eta) {
      const [h, m] = flight.eta.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const minutesUntilArrival = h * 60 + m - currentMinutes;
        if (minutesUntilArrival <= 30) {
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

    // Salida: ON_BLOCKS / PARKED / TURNAROUND / BOARDING con ETD <= 90 min y servicios pendientes
    if (
      (state === "ON_BLOCKS" || state === "PARKED" || state === "TURNAROUND" || state === "BOARDING") &&
      flight.etd
    ) {
      const [h, m] = flight.etd.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) continue;

      const minutesUntilDeparture = h * 60 + m - currentMinutes;
      if (minutesUntilDeparture > -30 && minutesUntilDeparture <= 90) {
        // Filtrar servicios DEPARTURE / BOTH pendientes
        const pendingServices = flight.services.filter(
          (s) =>
            s.state !== "DELIVERED" &&
            (s.phase === "DEPARTURE" || s.phase === "BOTH" || !s.phase),
        ).length;
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

export function TurnaroundAlerts({ flights }: TurnaroundAlertsProps) {
  const alerts = getTurnaroundAlerts(flights);

  if (alerts.length === 0) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-3">
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertIcon size={14} />
          <span>Alertas ({alerts.length})</span>
        </div>
        <div className="mt-2 space-y-1">
          {alerts.map((alert) => {
            const verb = alert.kind === "ARRIVAL" ? "llega" : "sale";
            const isPast = alert.minutesLeft < 0;
            return (
              <div
                key={alert.flightId + alert.kind}
                className="flex items-center gap-3 text-sm text-red-600"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    alert.kind === "ARRIVAL"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {alert.kind === "ARRIVAL" ? "LLEGADA" : "SALIDA"}
                </span>
                <span className="font-bold">{alert.callsign}</span>
                <span>
                  {verb}{" "}
                  {isPast ? (
                    <span className="font-semibold">hace {Math.abs(alert.minutesLeft)} min</span>
                  ) : (
                    <>
                      en <span className="font-semibold">{alert.minutesLeft} min</span>
                    </>
                  )}
                </span>
                {alert.pendingServices > 0 && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium">
                    {alert.pendingServices} servicio{alert.pendingServices !== 1 ? "s" : ""} pendiente{alert.pendingServices !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
