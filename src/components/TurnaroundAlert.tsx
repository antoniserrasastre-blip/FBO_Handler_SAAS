"use client";

import { Flight, Service } from "@prisma/client";
import { AlertIcon } from "./Icons";

type FlightWithServices = Flight & { services: Service[] };

interface TurnaroundAlertsProps {
  flights: FlightWithServices[];
}

export function getTurnaroundAlerts(flights: FlightWithServices[]) {
  const alerts: { flightId: string; callsign: string; minutesLeft: number; pendingServices: number }[] = [];

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const flight of flights) {
    // Only check flights that are on ground or boarding and have an ETD
    if (flight.state !== "ON_GROUND" && flight.state !== "BOARDING") continue;
    if (!flight.etd) continue;

    // Parse ETD (format "HH:MM")
    const [hours, minutes] = flight.etd.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) continue;

    const etdMinutes = hours * 60 + minutes;
    const minutesUntilDeparture = etdMinutes - currentMinutes;

    // Check if <90 minutes until departure
    if (minutesUntilDeparture > 0 && minutesUntilDeparture <= 90) {
      const pendingServices = flight.services.filter((s) => s.state === "PENDING").length;
      if (pendingServices > 0) {
        alerts.push({
          flightId: flight.id,
          callsign: flight.callsign,
          minutesLeft: minutesUntilDeparture,
          pendingServices,
        });
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
          <span>Alertas de turnaround ({alerts.length})</span>
        </div>
        <div className="mt-2 space-y-1">
          {alerts.map((alert) => (
            <div
              key={alert.flightId}
              className="flex items-center gap-3 text-sm text-red-600"
            >
              <span className="font-bold">{alert.callsign}</span>
              <span>
                sale en <span className="font-semibold">{alert.minutesLeft} min</span>
              </span>
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium">
                {alert.pendingServices} servicio{alert.pendingServices !== 1 ? "s" : ""} pendiente{alert.pendingServices !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
