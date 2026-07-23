import type { Movement } from "@prisma/client";
import { prisma } from "@/lib/db";
import { palmaDayUtc, palmaMidnightUtc, dateToSqlString } from "@/lib/time";
// Ancla temporal REUSADA del matching de importación (jamás duplicar la
// tolerancia ni el wrap de medianoche): timeDelta = min(diff, 1440-diff).
import { timeDelta, ROTATION_TIME_TOLERANCE_MIN } from "@/lib/v2/upsert";
// §S4: estado compuesto de la rotación reusado de flightView (jamás duplicado).
import { mostAdvancedState } from "@/lib/flightView";
// §S4 C1/C14: universo del día compartido (fuente única con /api/flights).
import { dayUniverseWhere, esVisitaVisible, esArrastre } from "@/lib/v2/dayUniverse";
import type {
  GetDayResult,
  FindFlightResult,
  FindFlightCandidate,
  GetEventLogResult,
  McpMovement,
  McpDayFlight,
} from "./contract";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resuelve el día civil de Palma (UTC midnight) desde el arg `fecha`:
 *   - undefined            → ahora (día civil de Palma)
 *   - "DD-MM-YYYY"         → esa fecha civil
 *   - "YYYY-MM-DD"         → esa fecha civil (directa, sin conversión TZ)
 * Reusa palmaDayUtc de @/lib/time — jamás sumar offsets a mano.
 */
export function resolvePalmaDay(fecha?: string): Date {
  if (!fecha) return palmaDayUtc();
  const trimmed = fecha.trim();
  const ddmmyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (ddmmyyyy) {
    return palmaDayUtc(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
  }
  return palmaDayUtc(trimmed);
}

/** Mapea una fila Movement al tipo del agente. Horas Zulu VERBATIM (cero conversión). */
function mapMovement(m: Movement): McpMovement {
  return {
    movementId: m.id,
    direction: m.direction as "ARRIVAL" | "DEPARTURE",
    callsign: m.callsign ?? null,
    origin: m.origin ?? null,
    destination: m.destination ?? null,
    eta: m.eta ?? null,
    etd: m.etd ?? null,
    ata: m.ata ?? null,
    atd: m.atd ?? null,
    state: m.state ?? null,
    // §S4 C11: flightCategory verbatim del schema (SIEMPRE presente).
    flightCategory: m.flightCategory as McpMovement["flightCategory"],
    parking: m.parking ?? null,
    paxCount: m.paxCount ?? null,
    paxCountReal: m.paxCountReal ?? null,
    crewCount: m.crewCount ?? null,
  };
}

/** ¿Es una pierna cancelada? (C11) */
function esCancelada(m: { flightCategory: string | null }): boolean {
  return m.flightCategory === "CANCELLED";
}

/** Estado COMPUESTO de la rotación (C2/C3): mostAdvancedState SOLO sobre las
 *  piernas vivas (una salida cancelada no debe hacer lucir la rotación como
 *  "salida"). Reusa flightView, jamás duplica el ranking. */
function estadoRotacionDe(movements: Array<{ state: string | null; flightCategory: string | null }>): string {
  return mostAdvancedState(
    ...movements.filter((m) => !esCancelada(m)).map((m) => m.state ?? undefined)
  );
}

/** get_day — el día civil de Palma completo. fecha "DD-MM-YYYY" | "YYYY-MM-DD" | undefined = hoy. */
export async function getDay(args: {
  fecha?: string;
  incluirCancelados?: boolean;
}): Promise<GetDayResult> {
  // incluirCancelados es booleano ESTRICTO (como confirmar): un "true" NO cuela.
  if (args.incluirCancelados !== undefined && typeof args.incluirCancelados !== "boolean") {
    throw new Error("El argumento `incluirCancelados` debe ser booleano (true/false).");
  }
  const palmaDay = resolvePalmaDay(args.fecha);
  const visits = await prisma.visit.findMany({
    where: dayUniverseWhere(palmaDay),
    include: { movements: true, aircraft: true, operator: true },
  });

  let vivos = 0;
  let cancelados = 0;
  const flights: McpDayFlight[] = [];

  for (const v of visits) {
    // C14: las huérfanas de extras (sin movimientos) nunca se listan.
    if (!esVisitaVisible(v)) continue;

    // summary cuenta PIERNAS del universo (se listen o no): vivos + cancelados.
    for (const m of v.movements) {
      if (esCancelada(m)) cancelados++;
      else vivos++;
    }

    const vivas = v.movements.filter((m) => !esCancelada(m));
    // Por defecto: rotación sin ninguna pierna viva se omite entera.
    if (!args.incluirCancelados && vivas.length === 0) continue;

    const shown = args.incluirCancelados ? v.movements : vivas;
    const arr = esArrastre(v, palmaDay);

    flights.push({
      visitId: v.id,
      registration: v.aircraft?.registration ?? null,
      operator: v.operator?.name ?? null,
      estadoRotacion: estadoRotacionDe(v.movements),
      palmaDay: dateToSqlString(v.palmaDay),
      ...(arr ? { arrastre: true as const } : {}),
      movements: shown.map(mapMovement),
    });
  }

  return {
    date: dateToSqlString(palmaDay),
    flights,
    summary: { vivos, cancelados },
  };
}

/** Menor delta (min) entre la hora del texto y las eta/etd de las piernas, dentro de tolerancia. */
function bestTimeDelta(queryTime: string, movements: Movement[]): number | null {
  let best: number | null = null;
  for (const m of movements) {
    for (const leg of [m.eta, m.etd]) {
      const delta = timeDelta(queryTime, leg);
      if (delta === null || delta > ROTATION_TIME_TOLERANCE_MIN) continue;
      if (best === null || delta < best) best = delta;
    }
  }
  return best;
}

/** Un token "HH:MM" cuenta como hora sólo si cae en 00:00–23:59 (cierra m2). */
function isClockTime(token: string): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(token);
  if (!m) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59;
}

/**
 * Matrícula (C4): igualdad exacta SIEMPRE ancla; substring bidireccional SOLO
 * si AMBOS lados ≥ 3 chars. registration vacía/null/<3 → solo igualdad exacta
 * (mata el bug ZJONES: token.includes("") === true). uppercase/trim en origen.
 */
function registrationMatches(token: string, registration: string): boolean {
  if (token === registration) return true;
  if (registration.length < 3 || token.length < 3) return false;
  return registration.includes(token) || token.includes(registration);
}

/**
 * find_flight — resuelve texto libre a candidatos.
 * Prioridad: (1) callsign exacto del texto ↔ movement → matchedBy "callsign";
 * (2) hora "HH:MM" del texto ↔ eta/etd con timeDelta ≤ tolerancia → "time"
 *     (timeDeltaMin, menor delta primero);
 * (3) matrícula (exacta/parcial) → "registration", TODOS los candidatos
 *     (jamás elegir uno solo por matrícula).
 * Orden final: callsign > time (por delta) > registration.
 */
export async function findFlight(args: {
  texto: string;
  fecha?: string;
}): Promise<FindFlightResult> {
  const palmaDay = resolvePalmaDay(args.fecha);
  const visits = await prisma.visit.findMany({
    where: dayUniverseWhere(palmaDay),
    include: { movements: true, aircraft: true, operator: true },
  });

  // Tokeniza: la primera "HH:MM" VÁLIDA (00:00–23:59) es la hora; el resto son
  // tokens de texto (candidatos a callsign y/o matrícula), en uppercase/trim.
  // Endurecimiento m2 (deuda review S1): un "HH:MM" fuera de rango (25:00,
  // 12:60, 99:99…) NO es hora — sería un delta fantasma; se trata como texto.
  const rawTokens = args.texto.trim().split(/\s+/).filter(Boolean);
  let queryTime: string | null = null;
  const textTokens: string[] = [];
  for (const tok of rawTokens) {
    if (queryTime === null && isClockTime(tok)) {
      queryTime = tok;
    } else {
      textTokens.push(tok.toUpperCase());
    }
  }

  const callsignCands: FindFlightCandidate[] = [];
  const timeCands: FindFlightCandidate[] = [];
  const registrationCands: FindFlightCandidate[] = [];

  for (const v of visits) {
    // C14: las huérfanas de extras (sin movimientos) nunca son candidatas.
    if (!esVisitaVisible(v)) continue;

    const movements = v.movements;
    const registration = v.aircraft?.registration ?? null;
    const arr = esArrastre(v, palmaDay);

    const mkCandidate = (
      matchedBy: FindFlightCandidate["matchedBy"],
      timeDeltaMin?: number
    ): FindFlightCandidate => ({
      visitId: v.id,
      registration,
      callsigns: [
        ...new Set(
          movements
            .map((m) => m.callsign)
            .filter((c): c is string => Boolean(c))
        ),
      ],
      matchedBy,
      ...(timeDeltaMin !== undefined ? { timeDeltaMin } : {}),
      // §S4 C1/C2: estado compuesto + palmaDay + marca de arrastre.
      estadoRotacion: estadoRotacionDe(movements),
      palmaDay: dateToSqlString(v.palmaDay),
      ...(arr ? { arrastre: true as const } : {}),
      movements: movements.map(mapMovement),
    });

    // (1) callsign exacto
    const callsignHit =
      textTokens.length > 0 &&
      movements.some(
        (m) => m.callsign && textTokens.includes(m.callsign.toUpperCase().trim())
      );
    if (callsignHit) {
      callsignCands.push(mkCandidate("callsign"));
      continue;
    }

    // (2) hora
    const delta = queryTime !== null ? bestTimeDelta(queryTime, movements) : null;
    if (delta !== null) {
      timeCands.push(mkCandidate("time", delta));
      continue;
    }

    // (3) matrícula — todos los candidatos, nunca elegir en silencio
    const registrationHit =
      registration !== null &&
      textTokens.some((t) => registrationMatches(t, registration.toUpperCase().trim()));
    if (registrationHit) {
      registrationCands.push(mkCandidate("registration"));
    }
  }

  timeCands.sort((a, b) => (a.timeDeltaMin ?? 0) - (b.timeDeltaMin ?? 0));

  return { candidates: [...callsignCands, ...timeCands, ...registrationCands] };
}

/** get_event_log — auditoría del día, filtro opcional por usuario (exacto), orden cronológico. */
export async function getEventLog(args: {
  fecha?: string;
  usuario?: string;
}): Promise<GetEventLogResult> {
  const palmaDay = resolvePalmaDay(args.fecha);
  // Ventana = el día CIVIL de Palma como instantes UTC (verano [D-1 22:00Z,
  // D 22:00Z), invierno [D-1 23:00Z, D 23:00Z)) — derivada vía Intl en
  // palmaMidnightUtc, jamás sumando offsets a mano. palmaDay+DAY_MS es
  // aritmética de calendario sobre la KEY (medianoche UTC), no un offset TZ.
  const gte = palmaMidnightUtc(palmaDay);
  const lt = palmaMidnightUtc(new Date(palmaDay.getTime() + DAY_MS));

  const rows = await prisma.eventLog.findMany({
    where: { timestamp: { gte, lt } },
    include: { user: true, visit: { include: { movements: true } } },
    orderBy: { timestamp: "asc" },
  });

  const filtered = args.usuario
    ? rows.filter((r) => r.user?.name === args.usuario)
    : rows;

  return {
    date: dateToSqlString(palmaDay),
    entries: filtered.map((r) => ({
      action: r.action,
      details: r.details ?? null,
      user: r.user?.name ?? null,
      timestamp: new Date(r.timestamp).toISOString(),
      callsign: r.visit?.movements?.[0]?.callsign ?? null,
    })),
  };
}
