// Conteo de movimientos por día — política ÚNICA para toda la app (B3).
//
// Un movimiento pertenece al día SOLO por su fecha (arrivalDate / departureDate,
// "DD/MM" o "DD/MM/YY" — comparamos los 5 primeros caracteres). NO exigimos
// eta/etd cuando la fecha está: un movimiento sin hora sigue siendo un
// movimiento del día (la cabecera de "/" exigía hora y por eso daba 34 cuando
// los banners de zona daban 36).
//
// Fecha ausente → se asume el día visualizado SOLO si hay evidencia de que el
// leg existe (eta/ata/origin para llegada; etd/atd/destination para salida).
// Sin esa guarda, un quick-add manual solo-salida (POST /api/flights crea la
// Visit con únicamente un movement DEPARTURE → arrivalDate=null, eta=null)
// contaba como LLEGADA fantasma del día y aparecía como chip en la zona
// LLEGADAS de "/". Con evidencia, mantenemos la asunción legacy de diaHelpers
// y TurnaroundAlert (datos viejos sin fecha explícita).
//
// Pendiente (otra sesión): unificar diaHelpers.isArrivalToday/isDepartureToday
// (que sí exigen eta/etd) sobre este módulo — ese fichero es de otra área en
// esta run y su criterio alimenta /dia.

export interface MovementDatesLike {
  arrivalDate?: string | null;
  departureDate?: string | null;
  // Evidencia de existencia del leg (para el fallback sin fecha).
  eta?: string | null;
  ata?: string | null;
  origin?: string | null;
  etd?: string | null;
  atd?: string | null;
  destination?: string | null;
}

/** "DD/MM" de un valor almacenado ("DD/MM" o "DD/MM/YY"). */
function ddMm(v: string | null | undefined): string {
  return (v || "").slice(0, 5);
}

/** El leg de llegada cae en `day` ("DD/MM" o "DD/MM/YY"). */
export function isArrivalOn(f: MovementDatesLike, day: string): boolean {
  // Sin fecha explícita → día visualizado, pero solo si el leg existe de
  // verdad (un quick-add solo-salida no tiene ARRIVAL: nada que contar).
  if (!f.arrivalDate) return !!(f.eta || f.ata || f.origin);
  return ddMm(f.arrivalDate) === ddMm(day);
}

/** El leg de salida cae en `day` ("DD/MM" o "DD/MM/YY"). */
export function isDepartureOn(f: MovementDatesLike, day: string): boolean {
  // Misma guarda simétrica: sin fecha, exige evidencia del leg de salida.
  if (!f.departureDate) return !!(f.etd || f.atd || f.destination);
  return ddMm(f.departureDate) === ddMm(day);
}

export interface MovementCounts {
  arrivals: number;
  departures: number;
}

/** Cuenta MOVIMIENTOS (no visits) del día `day` ("DD/MM" o "DD/MM/YY"). */
export function countMovements(flights: MovementDatesLike[], day: string): MovementCounts {
  let arrivals = 0;
  let departures = 0;
  for (const f of flights) {
    if (isArrivalOn(f, day)) arrivals++;
    if (isDepartureOn(f, day)) departures++;
  }
  return { arrivals, departures };
}
