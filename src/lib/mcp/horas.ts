// Lib de normalización horaria del agente (sprint 02 mcp-escritura-lote).
// Contrato pineado en ./contract.ts (§Lib de horas): entrada string u objeto
// { hora, tz }, default LOCAL, rango 00:00–23:59, conversión local↔zulu
// SIEMPRE vía Intl (Europe/Madrid) sobre el día civil de `ahora` — jamás
// offsets a mano. Bordes DST: local inexistente → Error; ambigua → CEST.

import { palmaDayUtc, palmaMidnightUtc, madridWallMinutes } from "@/lib/time";
import type { EntradaHora, HoraNormalizada } from "./contract";

const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const utcMinOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();

/** Parsea la entrada a { hh, mm, fuente }. Ilegible o fuera de rango → Error. */
function parseEntrada(entrada: EntradaHora): { hh: number; mm: number; fuente: "local" | "zulu" } {
  let hh: number;
  let mm: number;
  let fuente: "local" | "zulu";

  if (typeof entrada === "string") {
    // HH:MM con sufijo opcional Z/zulu/L/local (case-insensitive), espacios libres.
    const m = /^(\d{1,2}):(\d{2})\s*(z|zulu|l|local)?$/i.exec(entrada.trim());
    if (!m) {
      throw new Error(`Hora ilegible: "${entrada}". Usa HH:MM (opcional Z para Zulu o "local").`);
    }
    const suf = (m[3] ?? "").toLowerCase();
    fuente = suf === "z" || suf === "zulu" ? "zulu" : "local"; // sin sufijo → LOCAL por defecto
    hh = Number(m[1]);
    mm = Number(m[2]);
  } else if (entrada && typeof entrada.hora === "string" && (entrada.tz === "local" || entrada.tz === "zulu")) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(entrada.hora.trim());
    if (!m) throw new Error(`Hora ilegible: "${entrada.hora}". Usa HH:MM.`);
    fuente = entrada.tz;
    hh = Number(m[1]);
    mm = Number(m[2]);
  } else {
    throw new Error("Hora ilegible: se esperaba string HH:MM u objeto { hora, tz }.");
  }

  if (hh > 23 || mm > 59) {
    throw new Error(`Hora fuera de rango 00:00–23:59: "${hh}:${pad(mm)}".`);
  }
  return { hh, mm, fuente };
}

/**
 * Offset (minutos que la pared de Madrid va por delante de UTC) al COMIENZO del
 * día civil de `civil` (Date en medianoche UTC de la fecha civil). Derivado de
 * Intl vía los primitivos de time.ts (jamás ±1/±2 a mano): es la diferencia
 * entre la medianoche-como-UTC (palmaDayUtc) y el instante real de la medianoche
 * local (palmaMidnightUtc). Verano → 120, invierno → 60.
 *
 * Memoizado por día civil: es una función pura del día y cada conversión de
 * hora lo consulta, así que la cache mantiene barato el hot path Intl (las
 * property tests normalizan 1440 horas por dirección sin reconstruir formatters).
 */
const offsetCache = new Map<number, number>();
function offsetAlInicio(civil: Date): number {
  const key = civil.getTime();
  const hit = offsetCache.get(key);
  if (hit !== undefined) return hit;
  const off = (key - palmaMidnightUtc(civil).getTime()) / 60000;
  offsetCache.set(key, off);
  return off;
}

/**
 * Normaliza una hora dictada a su par { zulu, local, fuente }.
 * Entrada ilegible o fuera de 00:00–23:59 → Error descriptivo.
 */
export function normalizarHora(entrada: EntradaHora, ahora: Date = new Date()): HoraNormalizada {
  const { hh, mm, fuente } = parseEntrada(entrada);
  const civil = palmaDayUtc(ahora); // medianoche UTC de la fecha civil de Palma de `ahora`
  const y = civil.getUTCFullYear();
  const mo = civil.getUTCMonth();
  const d = civil.getUTCDate();

  if (fuente === "zulu") {
    // zulu→local: instante calendario D@HH:MM UTC leído en Madrid vía Intl
    // (total, jamás Error por DST).
    const inst = new Date(Date.UTC(y, mo, d, hh, mm));
    return { zulu: hhmm(hh * 60 + mm), local: hhmm(madridWallMinutes(inst)), fuente };
  }

  // local→zulu: instante MÁS TEMPRANO del día civil D cuya pared Madrid == hora
  // dictada. Los dos offsets que Madrid usa en el día D salen de Intl (el del
  // inicio de D y el que persiste hacia D+1 = inicio de D+1), nunca ±1/±2 a mano.
  const localMin = hh * 60 + mm;
  const wallAsUtc = Date.UTC(y, mo, d, hh, mm);
  const oInicio = offsetAlInicio(civil);
  const oFin = offsetAlInicio(new Date(civil.getTime() + DAY_MS));
  // Offset mayor primero → instante más temprano → primera ocurrencia (CEST) en
  // el borde ambiguo de otoño.
  const offsets = oInicio === oFin ? [oInicio] : [Math.max(oInicio, oFin), Math.min(oInicio, oFin)];

  for (const o of offsets) {
    const inst = new Date(wallAsUtc - o * 60000);
    if (madridWallMinutes(inst) === localMin) {
      return { zulu: hhmm(utcMinOfDay(inst)), local: hhmm(localMin), fuente };
    }
  }
  // Ningún offset la realiza → hora local inexistente (hueco de primavera).
  throw new Error(`La hora local ${hhmm(localMin)} no existe en Palma ese día (salto de hora de primavera).`);
}

/** Confirmación dual de toda escritura de hora: "11:23Z / 13:23 local". */
export function formatoDual(hora: HoraNormalizada): string {
  return `${hora.zulu}Z / ${hora.local} local`;
}
