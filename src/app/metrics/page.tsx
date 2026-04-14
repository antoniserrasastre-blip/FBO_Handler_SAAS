"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_LABELS, ServiceType } from "@/types";

interface Metrics {
  daysWithData: number;
  totalFlights: number;
  totalPax: number;
  totalServices: number;
  avgFlightsPerDay: string;
  dailyStats: { date: string; flights: number; paxTotal: number; servicesTotal: number; servicesDelivered: number }[];
  topServices: { type: string; count: number }[];
  topAircraft: { type: string; count: number }[];
}

export default function MetricsPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Cargando metricas...</div>
      </div>
    );
  }

  if (!metrics) return null;

  const maxFlights = Math.max(...metrics.dailyStats.map((d) => d.flights), 1);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Metricas</h1>
            <p className="mt-1 text-sm text-gray-500">
              Datos de {metrics.daysWithData} dias con actividad
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Volver
          </button>
        </div>

        {/* KPI cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total vuelos" value={String(metrics.totalFlights)} />
          <KpiCard label="Media vuelos/dia" value={metrics.avgFlightsPerDay} />
          <KpiCard label="Total pasajeros" value={String(metrics.totalPax)} />
          <KpiCard label="Total servicios" value={String(metrics.totalServices)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily flights chart */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Vuelos por dia</h2>
            {metrics.dailyStats.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {metrics.dailyStats.slice(0, 15).map((day) => {
                  const d = new Date(day.date);
                  const label = d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
                  const pct = (day.flights / maxFlights) * 100;
                  return (
                    <div key={day.date} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 text-xs text-gray-500">{label}</span>
                      <div className="flex-1">
                        <div className="h-5 rounded bg-gray-100">
                          <div
                            className="flex h-5 items-center rounded bg-blue-400 px-2 text-[10px] font-medium text-white"
                            style={{ width: `${Math.max(pct, 8)}%` }}
                          >
                            {day.flights}
                          </div>
                        </div>
                      </div>
                      <span className="w-16 shrink-0 text-right text-[10px] text-gray-400">
                        {day.paxTotal}pax
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top services */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Servicios mas solicitados</h2>
            {metrics.topServices.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="space-y-3">
                {metrics.topServices.map((svc) => {
                  const maxSvc = metrics.topServices[0]?.count || 1;
                  const pct = (svc.count / maxSvc) * 100;
                  const label = SERVICE_LABELS[svc.type as ServiceType] || svc.type;
                  return (
                    <div key={svc.type} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs text-gray-600">{label}</span>
                      <div className="flex-1">
                        <div className="h-5 rounded bg-gray-100">
                          <div
                            className="flex h-5 items-center rounded bg-green-400 px-2 text-[10px] font-medium text-white"
                            style={{ width: `${Math.max(pct, 10)}%` }}
                          >
                            {svc.count}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top aircraft types */}
          <div className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">Tipos de aeronave mas frecuentes</h2>
            {metrics.topAircraft.length === 0 ? (
              <p className="text-sm text-gray-400">Sin datos</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {metrics.topAircraft.map((ac) => (
                  <div
                    key={ac.type}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center"
                  >
                    <div className="text-sm font-bold text-gray-900">{ac.type}</div>
                    <div className="text-[10px] text-gray-500">{ac.count} vuelos</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
