"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SERVICE_LABELS, ServiceType } from "@/types";
import { HelixButton, SegmentedControl } from "@/components/helix";
import { DeltaBadge, Donut, DiffBar, Sparkline, TrendChart } from "@/components/metrics/charts";

interface Metrics {
  range: number;
  daysWithData: number;
  totalFlights: number;
  paxArrival: number;
  paxDeparture: number;
  totalServices: number;
  servicesDelivered: number;
  servicesPending: number;
  serviceDeliveryRate: string;
  avgFlightsPerDay: string;
  overnightFlights: number;
  avgTurnaround: number;
  tightTurnarounds: number;
  dailyStats: { date: string; flights: number; paxArrival: number; paxDeparture: number; servicesTotal: number; servicesDelivered: number }[];
  topOperators: { icao: string; name: string; flights: number; pax: number }[];
  hourBuckets: { hour: number; arrivals: number; departures: number }[];
  weekdayCounts: { day: string; flights: number; pax: number }[];
  topServices: { type: string; count: number; delivered: number; rate: number }[];
  topAircraft: { type: string; count: number }[];
  policiaCount: number;
  guardaCivilCount: number;
  passengers: { total: number; confirmed: number; noShow: number; added: number; verified: number; verifiedRate: string };
  lostItems: { total: number; found: number; claimed: number; delivered: number };
  deltas: { flights: number | null; pax: number | null; serviceDeliveryRate: number | null; onTimeRate: number | null };
  previous: { totalFlights: number; totalPax: number; serviceDeliveryRate: number; onTimeRate: number };
  punctuality: {
    measured: number;
    onTime: number;
    onTimeRate: number;
    avgDelay: number;
    distribution: { early: number; onTime: number; d15_30: number; d30_60: number; d60plus: number };
    arrival: { measured: number; avgDelay: number };
    departure: { measured: number; avgDelay: number };
  };
  paxAccuracy: {
    measured: number;
    avgAbsDeviation: number;
    exactRate: number;
    under: number;
    over: number;
    exact: number;
    sumEstimate: number;
    sumReal: number;
  };
  servicesByOrigin: { origin: string; total: number; delivered: number }[];
  fuelToilet: { fuelRequested: number; fuelServed: number; toiletRequested: number; toiletServed: number };
  flightCategories: { commercial: number; ferry: number; cancelled: number };
  pets: number;
  transport: { type: string; count: number }[];
  nationalities: { code: string; count: number }[];
  handlers: { name: string; visits: number; events: number }[];
  forecast: {
    enough: boolean;
    minDays: number;
    trend?: number;
    days: { date: string; weekday: string; flights: number; pax: number; samples: number }[];
    method: string;
  };
}

type RangeOption = "7" | "14" | "30" | "90" | "365";

const RANGE_OPTIONS: { value: RangeOption; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "14", label: "14d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "365", label: "1a" },
];

const ORIGIN_LABELS: Record<string, string> = {
  NETJETS: "NetJets",
  CATERING_AIRE: "Catering Aire",
  MCR: "MCR",
  OTHER: "Otros",
};

const TRANSPORT_LABELS: Record<string, string> = {
  VIP_LOUNGE: "Sala VIP",
  TERMINAL: "Terminal",
  BUS: "Autobús",
  CAR: "Coche",
  VAN: "Furgoneta",
  OTHER: "Otro",
};

export default function MetricsPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeOption>("30");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics?range=${range}`)
      .then((r) => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !metrics) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center text-ink-3">Cargando métricas…</div>
    );
  }
  if (!metrics) return null;

  const maxHour = Math.max(...metrics.hourBuckets.map((h) => Math.max(h.arrivals, h.departures)), 1);
  const maxWeekday = Math.max(...metrics.weekdayCounts.map((w) => w.flights), 1);

  const flightSpark = metrics.dailyStats.map((d) => d.flights);
  const paxSpark = metrics.dailyStats.map((d) => d.paxArrival + d.paxDeparture);

  const trendHistory = metrics.dailyStats.map((d) => ({
    date: d.date,
    value: d.flights,
    pax: d.paxArrival + d.paxDeparture,
  }));
  const trendForecast = metrics.forecast.enough
    ? metrics.forecast.days.map((d) => ({ date: d.date, value: d.flights, pax: d.pax }))
    : [];

  const pd = metrics.punctuality.distribution;

  return (
    <div className="min-h-[calc(100vh-96px)] bg-bg px-4 py-8">
      <div className="mx-auto max-w-6xl">
        {/* ---- header ---- */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Métricas</h1>
            <p className="mt-1 text-sm text-ink-3">
              <span className="font-mono [font-variant-numeric:tabular-nums]">{metrics.daysWithData}</span> días con
              datos en los últimos{" "}
              <span className="font-mono [font-variant-numeric:tabular-nums]">{metrics.range}</span> días
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SegmentedControl<RangeOption> value={range} onChange={setRange} options={RANGE_OPTIONS} />
            <HelixButton variant="secondary" size="sm" onClick={() => router.push("/")}>
              Volver
            </HelixButton>
          </div>
        </div>

        {/* ---- KPIs principales (con delta y sparkline) ---- */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="Total vuelos"
            value={metrics.totalFlights}
            sub={`Media: ${metrics.avgFlightsPerDay}/día`}
            delta={{ value: metrics.deltas.flights, unit: "%", goodWhenUp: true }}
            spark={flightSpark}
          />
          <Kpi
            label="Pax llegada"
            value={metrics.paxArrival}
            spark={paxSpark}
            sparkColor="var(--c-state-departed)"
          />
          <Kpi
            label="Pax salida"
            value={metrics.paxDeparture}
            delta={{ value: metrics.deltas.pax, unit: "%", goodWhenUp: true }}
          />
          <Kpi
            label="Servicios entregados"
            value={`${metrics.serviceDeliveryRate}%`}
            sub={`${metrics.servicesDelivered}/${metrics.totalServices}`}
            tone="success"
            delta={{ value: metrics.deltas.serviceDeliveryRate, unit: "pp", goodWhenUp: true }}
          />
          <Kpi
            label="Puntualidad"
            value={`${metrics.punctuality.onTimeRate}%`}
            sub={`${metrics.punctuality.measured} movs · ±${metrics.punctuality.avgDelay}m medio`}
            tone="info"
            delta={{ value: metrics.deltas.onTimeRate, unit: "pp", goodWhenUp: true }}
          />
        </div>

        {/* ---- KPIs secundarios ---- */}
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Turnaround medio"
            value={`${metrics.avgTurnaround}m`}
            sub={`${metrics.tightTurnarounds} ajustados (<90m)`}
          />
          <Kpi label="Pernoctas" value={metrics.overnightFlights} tone="overnight" />
          <Kpi
            label="Pax verificados"
            value={`${metrics.passengers.verifiedRate}%`}
            sub={`${metrics.passengers.verified}/${metrics.passengers.total}`}
            tone="brand"
          />
          <Kpi
            label="Policía / G.Civil"
            value={metrics.policiaCount}
            sub={`G.Civil: ${metrics.guardaCivilCount}`}
            tone="warning"
          />
        </div>

        {/* ==== ACTIVIDAD ==== */}
        <SectionTitle>Actividad</SectionTitle>
        <Card title="Vuelos por día" wide>
          {metrics.dailyStats.length === 0 ? (
            <Empty />
          ) : (
            <>
              <TrendChart history={trendHistory} forecast={trendForecast} unitLabel="vuelos" />
              <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-ink-muted">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-brand" /> Histórico
                </span>
                {metrics.forecast.enough && (
                  <span className="flex items-center gap-1 text-info-strong">
                    <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-info-strong" /> Estimación
                    7d
                  </span>
                )}
              </div>
            </>
          )}
        </Card>

        {/* tira de estimación próximos 7 días */}
        {metrics.forecast.enough ? (
          <div className="mb-4 rounded-hx-md border border-info-strong/30 bg-info-bg/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-info-strong">
                Estimación próximos 7 días
              </h3>
              <span className="font-mono text-[10px] text-ink-muted">
                media móvil + estacionalidad semanal{metrics.forecast.trend ? ` · tendencia ×${metrics.forecast.trend}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {metrics.forecast.days.map((d) => (
                <div key={d.date} className="rounded-hx-sm border border-line bg-bg p-2 text-center">
                  <div className="text-[10px] font-semibold uppercase text-ink-muted">{d.weekday}</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">
                    ~{d.flights}
                  </div>
                  <div className="font-mono text-[10px] text-ink-muted">{d.pax} pax</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] italic text-ink-muted">
              Estimación orientativa basada en patrones históricos, no una predicción garantizada.
            </p>
          </div>
        ) : (
          <div className="mb-4 rounded-hx-md border border-line bg-bg-subtle p-3 text-[11px] italic text-ink-muted">
            Estimación de los próximos días disponible con {metrics.forecast.minDays}+ días de datos (ahora{" "}
            {metrics.daysWithData}). Selecciona un rango mayor o sigue importando.
          </div>
        )}

        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <Card title="Horas pico (llegadas / salidas)">
            <div className="flex h-32 items-end gap-0.5">
              {metrics.hourBuckets.map((h) => {
                const arrPct = (h.arrivals / maxHour) * 100;
                const depPct = (h.departures / maxHour) * 100;
                return (
                  <div key={h.hour} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full flex-1 items-end gap-0.5">
                      <div
                        className="flex-1 rounded-t bg-fbo-approach"
                        style={{ height: `${arrPct}%` }}
                        title={`${h.hour}:00 — ${h.arrivals} llegadas`}
                      />
                      <div
                        className="flex-1 rounded-t bg-fbo-board"
                        style={{ height: `${depPct}%` }}
                        title={`${h.hour}:00 — ${h.departures} salidas`}
                      />
                    </div>
                    {h.hour % 3 === 0 ? (
                      <span className="mt-0.5 font-mono text-[9px] text-ink-muted [font-variant-numeric:tabular-nums]">
                        {h.hour}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 font-mono text-[10px] text-ink-3">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-fbo-approach" /> Llegadas
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded bg-fbo-board" /> Salidas
              </span>
            </div>
          </Card>

          <Card title="Por día de la semana">
            <div className="space-y-1.5">
              {metrics.weekdayCounts.map((w) => (
                <BarRow
                  key={w.day}
                  label={w.day}
                  value={w.flights}
                  pct={(w.flights / maxWeekday) * 100}
                  barClass="bg-fbo-departed"
                  right={`${w.pax}pax`}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* ==== PUNTUALIDAD Y PRECISIÓN ==== */}
        <SectionTitle>Puntualidad y precisión operativa</SectionTitle>
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <Card title="Puntualidad (real vs programado)">
            {metrics.punctuality.measured === 0 ? (
              <Empty hint="Requiere horas reales (ATA/ATD) registradas." />
            ) : (
              <div className="space-y-4">
                <div className="flex items-end gap-6">
                  <div>
                    <div className="font-mono text-3xl font-semibold text-info-strong [font-variant-numeric:tabular-nums]">
                      {metrics.punctuality.onTimeRate}%
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted">a tiempo (±15m)</div>
                  </div>
                  <div className="flex-1 space-y-1 text-xs text-ink-2">
                    <div className="flex justify-between">
                      <span>Retraso medio llegadas</span>
                      <DelayChip min={metrics.punctuality.arrival.avgDelay} n={metrics.punctuality.arrival.measured} />
                    </div>
                    <div className="flex justify-between">
                      <span>Retraso medio salidas</span>
                      <DelayChip min={metrics.punctuality.departure.avgDelay} n={metrics.punctuality.departure.measured} />
                    </div>
                  </div>
                </div>
                <DiffBar
                  segments={[
                    { label: "Adelantado", value: pd.early, color: "var(--c-info)" },
                    { label: "A tiempo", value: pd.onTime, color: "var(--c-success)" },
                    { label: "15-30m", value: pd.d15_30, color: "var(--c-warning)" },
                    { label: "30-60m", value: pd.d30_60, color: "var(--c-warning-strong)" },
                    { label: "+60m", value: pd.d60plus, color: "var(--c-danger)" },
                  ]}
                />
              </div>
            )}
          </Card>

          <Card title="Precisión de estimación de pax">
            {metrics.paxAccuracy.measured === 0 ? (
              <Empty hint="Requiere conteo real de pax registrado." />
            ) : (
              <div className="space-y-4">
                <div className="flex items-end gap-6">
                  <div>
                    <div className="font-mono text-3xl font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">
                      ±{metrics.paxAccuracy.avgAbsDeviation}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted">desviación media (pax)</div>
                  </div>
                  <div className="flex-1 space-y-1 text-xs text-ink-2">
                    <div className="flex justify-between">
                      <span>Patas medidas</span>
                      <span className="font-mono font-semibold text-ink-1">{metrics.paxAccuracy.measured}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Exactas</span>
                      <span className="font-mono font-semibold text-success-strong">{metrics.paxAccuracy.exactRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimado / real</span>
                      <span className="font-mono text-ink-muted">
                        {metrics.paxAccuracy.sumEstimate} / {metrics.paxAccuracy.sumReal}
                      </span>
                    </div>
                  </div>
                </div>
                <DiffBar
                  segments={[
                    { label: "Infraestimado", value: metrics.paxAccuracy.under, color: "var(--c-warning)" },
                    { label: "Exacto", value: metrics.paxAccuracy.exact, color: "var(--c-success)" },
                    { label: "Sobreestimado", value: metrics.paxAccuracy.over, color: "var(--c-info)" },
                  ]}
                />
              </div>
            )}
          </Card>
        </div>

        {/* ==== SERVICIOS ==== */}
        <SectionTitle>Servicios</SectionTitle>
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <Card title="Estado de los servicios">
            {metrics.totalServices === 0 ? (
              <Empty />
            ) : (
              <Donut
                centerValue={`${metrics.serviceDeliveryRate}%`}
                centerLabel="entregados"
                segments={[
                  { label: "Entregados", value: metrics.servicesDelivered, color: "var(--c-success)" },
                  { label: "Pendientes", value: metrics.servicesPending, color: "var(--c-warning)" },
                  {
                    label: "Otros",
                    value: Math.max(metrics.totalServices - metrics.servicesDelivered - metrics.servicesPending, 0),
                    color: "var(--c-text-muted)",
                  },
                ]}
              />
            )}
          </Card>

          <Card title="Servicios por tipo (tasa de entrega)">
            {metrics.topServices.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {metrics.topServices.map((svc) => {
                  const maxSvc = metrics.topServices[0]?.count || 1;
                  const label = SERVICE_LABELS[svc.type as ServiceType] || svc.type;
                  return (
                    <BarRow
                      key={svc.type}
                      label={label}
                      value={svc.count}
                      pct={(svc.count / maxSvc) * 100}
                      barClass="bg-success"
                      right={`${svc.rate}%`}
                      titleAttr={`${label}: ${svc.delivered}/${svc.count} entregados`}
                    />
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Servicios por origen">
            {metrics.servicesByOrigin.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {metrics.servicesByOrigin.map((o) => {
                  const maxO = metrics.servicesByOrigin[0]?.total || 1;
                  const rate = o.total > 0 ? Math.round((o.delivered / o.total) * 100) : 0;
                  return (
                    <BarRow
                      key={o.origin}
                      label={ORIGIN_LABELS[o.origin] || o.origin}
                      value={o.total}
                      pct={(o.total / maxO) * 100}
                      barClass="bg-fbo-onblocks"
                      right={`${rate}%`}
                      titleAttr={`${o.delivered}/${o.total} entregados`}
                    />
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Combustible y aseos">
            <div className="space-y-3">
              <ProgressRow
                label="Combustible servido"
                done={metrics.fuelToilet.fuelServed}
                total={metrics.fuelToilet.fuelRequested}
                barClass="bg-warning-strong"
              />
              <ProgressRow
                label="Aseos completados"
                done={metrics.fuelToilet.toiletServed}
                total={metrics.fuelToilet.toiletRequested}
                barClass="bg-info-strong"
              />
            </div>
          </Card>
        </div>

        {/* ==== OPERACIÓN Y FLOTA ==== */}
        <SectionTitle>Operación y flota</SectionTitle>
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <Card title="Top operadores">
            {metrics.topOperators.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {metrics.topOperators.map((op) => (
                  <BarRow
                    key={op.icao}
                    label={op.name}
                    value={op.flights}
                    pct={(op.flights / (metrics.topOperators[0]?.flights || 1)) * 100}
                    barClass="bg-fbo-onblocks"
                    right={`${op.pax}pax`}
                    titleAttr={op.name}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Categoría de vuelo">
            <Donut
              centerValue={metrics.flightCategories.commercial + metrics.flightCategories.ferry + metrics.flightCategories.cancelled}
              centerLabel="vuelos"
              segments={[
                { label: "Comercial", value: metrics.flightCategories.commercial, color: "var(--c-brand)" },
                { label: "Ferry", value: metrics.flightCategories.ferry, color: "var(--c-state-overnight)" },
                { label: "Cancelado", value: metrics.flightCategories.cancelled, color: "var(--c-danger)" },
              ]}
            />
          </Card>

          <Card title="Tipos de aeronave" wide>
            {metrics.topAircraft.length === 0 ? (
              <Empty />
            ) : (
              <div className="flex flex-wrap gap-2">
                {metrics.topAircraft.map((ac) => (
                  <div key={ac.type} className="rounded-hx-md border border-line bg-bg-subtle px-3 py-2 text-center">
                    <div className="font-mono text-sm font-semibold text-ink-1 [font-variant-numeric:tabular-nums]">
                      {ac.type}
                    </div>
                    <div className="font-mono text-[10px] text-ink-muted">{ac.count} vuelos</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ==== PASAJEROS ==== */}
        <SectionTitle>Pasajeros</SectionTitle>
        <div className="mb-8 grid gap-4 lg:grid-cols-2">
          <Card title="Estado de pasajeros">
            {metrics.passengers.total === 0 ? (
              <Empty />
            ) : (
              <Donut
                centerValue={metrics.passengers.total}
                centerLabel="registrados"
                segments={[
                  { label: "Confirmados", value: metrics.passengers.confirmed, color: "var(--c-success)" },
                  { label: "No-show", value: metrics.passengers.noShow, color: "var(--c-danger)" },
                  { label: "Última hora", value: metrics.passengers.added, color: "var(--c-info)" },
                ]}
              />
            )}
          </Card>

          <Card title="Nacionalidades (pasaporte)">
            {metrics.nationalities.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-1.5">
                {metrics.nationalities.map((n) => (
                  <BarRow
                    key={n.code}
                    label={n.code}
                    value={n.count}
                    pct={(n.count / (metrics.nationalities[0]?.count || 1)) * 100}
                    barClass="bg-brand"
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Transporte de pax">
            {metrics.transport.length === 0 ? (
              <Empty hint="Sin transporte asignado en el rango." />
            ) : (
              <div className="space-y-1.5">
                {metrics.transport.map((t) => (
                  <BarRow
                    key={t.type}
                    label={TRANSPORT_LABELS[t.type] || t.type}
                    value={t.count}
                    pct={(t.count / (metrics.transport[0]?.count || 1)) * 100}
                    barClass="bg-fbo-parked"
                  />
                ))}
              </div>
            )}
          </Card>

          <Card title="Objetos olvidados y mascotas">
            <div className="space-y-2">
              <StatRow label="Objetos olvidados" value={metrics.lostItems.total} tone="default" />
              <StatRow label="Entregados a su dueño" value={metrics.lostItems.delivered} tone="success" />
              <StatRow label="Reclamados / encontrados" value={`${metrics.lostItems.claimed} / ${metrics.lostItems.found}`} tone="info" />
              <StatRow label="Mascotas transportadas" value={metrics.pets} tone="brand" />
            </div>
          </Card>
        </div>

        {/* ==== EQUIPO ==== */}
        <SectionTitle>Carga del equipo</SectionTitle>
        <Card title="Visitas asignadas y actividad por handler" wide>
          {metrics.handlers.length === 0 ? (
            <Empty hint="Sin asignaciones ni actividad registrada en el rango." />
          ) : (
            <div className="space-y-1.5">
              {metrics.handlers.map((h) => (
                <BarRow
                  key={h.name}
                  label={h.name}
                  value={h.visits}
                  pct={(h.visits / (metrics.handlers[0]?.visits || 1)) * 100}
                  barClass="bg-brand-active"
                  right={`${h.events} ev.`}
                  titleAttr={`${h.name}: ${h.visits} visitas, ${h.events} eventos`}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-componentes locales
// ============================================================================

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-2 border-b border-line pb-1.5 text-sm font-semibold tracking-tight text-ink-1">
      {children}
    </h2>
  );
}

function Empty({ hint }: { hint?: string }) {
  return <p className="text-sm italic text-ink-muted">{hint ?? "Sin datos"}</p>;
}

const KPI_TONE: Record<string, string> = {
  default: "text-ink-1",
  success: "text-success-strong",
  warning: "text-warning-strong",
  info: "text-info-strong",
  brand: "text-brand-active",
  overnight: "text-fbo-overnight",
};

function Kpi({
  label,
  value,
  sub,
  tone = "default",
  delta,
  spark,
  sparkColor,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof KPI_TONE;
  delta?: { value: number | null; unit: "%" | "pp"; goodWhenUp: boolean };
  spark?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="rounded-hx-md border border-line bg-bg p-4 shadow-hx-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</div>
        {delta ? <DeltaBadge value={delta.value} unit={delta.unit} goodWhenUp={delta.goodWhenUp} /> : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className={`font-mono text-2xl font-semibold [font-variant-numeric:tabular-nums] ${KPI_TONE[tone]}`}>
          {value}
        </div>
        {spark && spark.length > 1 ? <Sparkline values={spark} color={sparkColor} label={`tendencia ${label}`} /> : null}
      </div>
      {sub ? <div className="mt-0.5 font-mono text-[10px] text-ink-muted">{sub}</div> : null}
    </div>
  );
}

function Card({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mb-4 rounded-hx-md border border-line bg-bg p-5 shadow-hx-sm ${wide ? "lg:col-span-2" : ""}`}>
      <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

function BarRow({
  label,
  value,
  pct,
  barClass,
  right,
  titleAttr,
}: {
  label: string;
  value: number;
  pct: number;
  barClass: string;
  right?: string;
  titleAttr?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 truncate text-xs text-ink-2" title={titleAttr ?? label}>
        {label}
      </span>
      <div className="flex-1">
        <div className="h-5 rounded bg-bg-muted">
          <div
            className={`flex h-5 items-center rounded px-2 font-mono text-[10px] font-semibold text-white [font-variant-numeric:tabular-nums] ${barClass}`}
            style={{ width: `${Math.max(pct, 8)}%` }}
          >
            {value}
          </div>
        </div>
      </div>
      {right ? (
        <span className="w-14 shrink-0 text-right font-mono text-[10px] text-ink-muted [font-variant-numeric:tabular-nums]">
          {right}
        </span>
      ) : null}
    </div>
  );
}

function ProgressRow({
  label,
  done,
  total,
  barClass,
}: {
  label: string;
  done: number;
  total: number;
  barClass: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-ink-2">
        <span>{label}</span>
        <span className="font-mono text-[10px] text-ink-muted [font-variant-numeric:tabular-nums]">
          {done}/{total} · {pct}%
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded bg-bg-muted">
        <div className={`h-3 rounded ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DelayChip({ min, n }: { min: number; n: number }) {
  if (n === 0) return <span className="font-mono text-[10px] text-ink-muted">s/d</span>;
  const tone = min <= 5 ? "text-success-strong" : min <= 20 ? "text-warning-strong" : "text-danger-strong";
  const sign = min > 0 ? "+" : "";
  return (
    <span className={`font-mono text-xs font-semibold [font-variant-numeric:tabular-nums] ${tone}`}>
      {sign}
      {min}m
    </span>
  );
}

const STATROW_TONE: Record<string, string> = {
  default: "bg-bg-muted text-ink-2",
  success: "bg-success-bg text-success-strong",
  danger: "bg-danger-bg text-danger-strong",
  info: "bg-info-bg text-info-strong",
  brand: "bg-brand-tint text-brand-active",
};

function StatRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: keyof typeof STATROW_TONE;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-ink-2">{label}</span>
      <span
        className={`rounded-hx-pill px-2 py-0.5 font-mono text-xs font-semibold [font-variant-numeric:tabular-nums] ${STATROW_TONE[tone]}`}
      >
        {value}
      </span>
    </div>
  );
}
