// Cálculos puros para la pestaña de Métricas. Sin acceso a Prisma ni a la red,
// para poder testearlos de forma aislada. El endpoint /api/metrics consume estas
// funciones tras proyectar las visitas a FlightView.

export const ON_TIME_THRESHOLD_MIN = 15; // tolerancia estándar de puntualidad
export const FORECAST_MIN_DAYS = 21; // días con datos mínimos para mostrar estimación
export const FORECAST_HORIZON = 7; // días estimados hacia delante

export const WEEKDAYS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

export function timeToMinutes(hhmm: string): number {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

/** Retraso firmado en minutos entre programado y real, tolerando cruce de medianoche. */
export function signedDelay(scheduled: string, actual: string): number | null {
  if (!/^\d{1,2}:\d{2}$/.test(scheduled) || !/^\d{1,2}:\d{2}$/.test(actual)) return null;
  let delay = timeToMinutes(actual) - timeToMinutes(scheduled);
  if (delay > 720) delay -= 1440;
  if (delay < -720) delay += 1440;
  return delay;
}

export interface MovementTimes {
  direction: string;
  eta?: string | null;
  etd?: string | null;
  ata?: string | null;
  atd?: string | null;
}

export function computePunctuality(movements: MovementTimes[]) {
  const delays: number[] = [];
  let arrMeasured = 0;
  let arrSum = 0;
  let depMeasured = 0;
  let depSum = 0;

  for (const m of movements) {
    let d: number | null = null;
    if (m.direction === "ARRIVAL" && m.eta && m.ata) {
      d = signedDelay(m.eta, m.ata);
      if (d !== null) {
        arrMeasured++;
        arrSum += d;
      }
    } else if (m.direction === "DEPARTURE" && m.etd && m.atd) {
      d = signedDelay(m.etd, m.atd);
      if (d !== null) {
        depMeasured++;
        depSum += d;
      }
    }
    if (d !== null) delays.push(d);
  }

  const measured = delays.length;
  const onTime = delays.filter((d) => d <= ON_TIME_THRESHOLD_MIN).length;
  const onTimeRate = measured > 0 ? (onTime / measured) * 100 : 0;
  const avgDelay = measured > 0 ? delays.reduce((s, d) => s + d, 0) / measured : 0;

  const distribution = {
    early: delays.filter((d) => d < -ON_TIME_THRESHOLD_MIN).length,
    onTime: delays.filter((d) => d >= -ON_TIME_THRESHOLD_MIN && d <= ON_TIME_THRESHOLD_MIN).length,
    d15_30: delays.filter((d) => d > 15 && d <= 30).length,
    d30_60: delays.filter((d) => d > 30 && d <= 60).length,
    d60plus: delays.filter((d) => d > 60).length,
  };

  return {
    measured,
    onTime,
    onTimeRate: round1(onTimeRate),
    avgDelay: Math.round(avgDelay),
    distribution,
    arrival: { measured: arrMeasured, avgDelay: arrMeasured > 0 ? Math.round(arrSum / arrMeasured) : 0 },
    departure: { measured: depMeasured, avgDelay: depMeasured > 0 ? Math.round(depSum / depMeasured) : 0 },
  };
}

export interface FlightPax {
  paxArrival: number;
  paxArrivalReal: number | null;
  paxDeparture: number;
  paxDepartureReal: number | null;
}

export function computePaxAccuracy(flights: FlightPax[]) {
  let measured = 0;
  let sumAbsDev = 0;
  let sumEstimate = 0;
  let sumReal = 0;
  let under = 0; // estimamos de menos (real > estimado)
  let over = 0; // estimamos de más
  let exact = 0;

  for (const f of flights) {
    const legs: [number, number | null][] = [
      [f.paxArrival, f.paxArrivalReal],
      [f.paxDeparture, f.paxDepartureReal],
    ];
    for (const [est, real] of legs) {
      if (real === null || real === undefined) continue;
      measured++;
      sumEstimate += est;
      sumReal += real;
      const dev = real - est;
      sumAbsDev += Math.abs(dev);
      if (dev > 0) under++;
      else if (dev < 0) over++;
      else exact++;
    }
  }

  const avgAbsDeviation = measured > 0 ? round1(sumAbsDev / measured) : 0;
  const exactRate = measured > 0 ? round1((exact / measured) * 100) : 0;

  return { measured, avgAbsDeviation, exactRate, under, over, exact, sumEstimate, sumReal };
}

export interface DailyStat {
  date: Date;
  flights: number;
  paxTotal: number;
}

export interface ForecastDay {
  date: string;
  weekday: string;
  flights: number;
  pax: number;
  samples: number;
}

export function computeForecast(dailyStats: DailyStat[], daysWithData: number, now: Date = new Date()) {
  if (daysWithData < FORECAST_MIN_DAYS) {
    return { enough: false as const, minDays: FORECAST_MIN_DAYS, days: [] as ForecastDay[], method: "weekday-seasonal" };
  }

  // Medias por día de la semana sobre la ventana.
  const wdFlights: number[][] = Array.from({ length: 7 }, () => []);
  const wdPax: number[][] = Array.from({ length: 7 }, () => []);
  for (const d of dailyStats) {
    const dow = d.date.getUTCDay();
    wdFlights[dow].push(d.flights);
    wdPax[dow].push(d.paxTotal);
  }
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
  const overallAvg = avg(dailyStats.map((d) => d.flights)) || 1;

  // Factor de tendencia reciente: media de últimos 14 días / media global (clamp).
  const recent = dailyStats.slice(-14);
  const recentAvg = avg(recent.map((d) => d.flights));
  let trend = overallAvg > 0 ? recentAvg / overallAvg : 1;
  if (!isFinite(trend) || trend <= 0) trend = 1;
  trend = Math.max(0.6, Math.min(1.6, trend));

  const days: ForecastDay[] = [];
  const cursor = new Date(now);
  cursor.setUTCHours(0, 0, 0, 0);
  const paxOverall = avg(dailyStats.map((d) => d.paxTotal));
  for (let i = 1; i <= FORECAST_HORIZON; i++) {
    const day = new Date(cursor);
    day.setUTCDate(day.getUTCDate() + i);
    const dow = day.getUTCDay();
    const fBase = wdFlights[dow].length > 0 ? avg(wdFlights[dow]) : overallAvg;
    const pBase = wdPax[dow].length > 0 ? avg(wdPax[dow]) : paxOverall;
    days.push({
      date: day.toISOString().slice(0, 10),
      weekday: WEEKDAYS[dow],
      flights: Math.max(0, Math.round(fBase * trend)),
      pax: Math.max(0, Math.round(pBase * trend)),
      samples: wdFlights[dow].length,
    });
  }

  return { enough: true as const, minDays: FORECAST_MIN_DAYS, trend: round1(trend), days, method: "weekday-seasonal" };
}

/** Variación porcentual (null si no hay base de comparación). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return round1(((current - previous) / previous) * 100);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
