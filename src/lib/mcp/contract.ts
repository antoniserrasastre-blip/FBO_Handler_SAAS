// Contrato de la superficie MCP (sprint 01 mcp-lectura) — tipos + semántica pineada.
// La spec vive en el workspace: stages/03_sprint/output/01_mcp-lectura/spec.md
//
// Envelope (POST /api/mcp, JSON-RPC 2.0, Streamable HTTP stateless):
// - Auth SIEMPRE antes de despachar cualquier método (incluido initialize):
//   header `Authorization: Bearer <token>` → hash sha256 → AgentToken vigente
//   (revokedAt == null). Fallo → HTTP 401 con body
//   {"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"Unauthorized"}}.
// - Métodos: initialize · notifications/initialized · ping · tools/list · tools/call.
//   Stateless: tools/call sin initialize previo es válido.
// - tools/list → result.tools = exactamente get_day, find_flight, get_event_log.
// - tools/call → result.content = [{ type: "text", text: JSON.stringify(payload) }]
//   donde payload es el tipo de abajo según la tool. Error de tool → isError: true.
// - Las lecturas NO escriben EventLog; el único efecto colateral permitido es
//   AgentToken.lastUsedAt.

/** Un movimiento (pierna) tal como lo lee el agente. Horas en Zulu "HH:MM". */
export interface McpMovement {
  movementId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  callsign: string | null;
  origin: string | null;
  destination: string | null;
  eta: string | null;
  etd: string | null;
  ata: string | null;
  atd: string | null;
  state: string | null;
  parking: string | null;
  paxCount: number | null;
  paxCountReal: number | null;
  crewCount: number | null;
}

/** Una rotación (Visit) del día con sus piernas. */
export interface McpDayFlight {
  visitId: string;
  registration: string | null;
  operator: string | null;
  movements: McpMovement[];
}

/** get_day({ fecha? }) — fecha "DD-MM-YYYY" o "YYYY-MM-DD"; default: hoy (día civil de Palma). */
export interface GetDayResult {
  date: string; // "YYYY-MM-DD" (palmaDay)
  flights: McpDayFlight[];
}

/**
 * find_flight({ texto, fecha? }) — texto libre (callsign, matrícula, hora "HH:MM").
 * Ancla = callsign + hora (timeDelta de upsert.ts: wrap medianoche, ≤90').
 * Matrícula sola y ambigua → TODOS los candidatos, jamás elegir en silencio.
 */
export interface FindFlightCandidate {
  visitId: string;
  registration: string | null;
  callsigns: string[];
  matchedBy: "callsign" | "time" | "registration";
  /** minutos de delta cuando matchedBy === "time" */
  timeDeltaMin?: number;
  movements: McpMovement[];
}
export interface FindFlightResult {
  candidates: FindFlightCandidate[]; // ordenados: callsign > time (menor delta) > registration
}

/** get_event_log({ fecha?, usuario? }) — auditoría del día, orden cronológico. */
export interface EventLogEntry {
  action: string;
  details: string | null;
  user: string | null; // User.name
  timestamp: string;   // ISO 8601
  callsign: string | null;
}
export interface GetEventLogResult {
  date: string;
  entries: EventLogEntry[];
}

/** Resultado de verificar el Bearer token. null = no autorizado. */
export interface AgentAuth {
  tokenId: string;
  userId: string;
  userName: string;
}

// ============================================================================
// Sprint 02 mcp-escritura-lote — contrato de escritura.
// Spec: stages/03_sprint/output/02_mcp-escritura-lote/spec.md (workspace).
//
// Invariantes de escritura:
// - EventLog en TODA escritura de agente, atribuida al user del token
//   (userId de AgentAuth). Las lecturas siguen sin loguear.
// - Allowlist de `campos` = EXACTAMENTE el Set MOVEMENT_OPERATIONAL_FIELDS
//   importado de src/lib/v2/upsert.ts (jamás duplicado). Campos plan
//   (eta, etd, callsign, …) y desconocidos → fila rechazada.
// - Campos de hora que pasan por la lib (src/lib/mcp/horas.ts):
//   EXACTAMENTE ata, atd, tobt (los Zulu "HH:MM" canónicos). Se persisten en
//   Zulu "HH:MM"; el resto de strings del allowlist (fuelRequestedAt, …)
//   pasan verbatim (la UI humana ya escribe formatos mixtos ahí — fuera del
//   alcance S2). `null` en un campo de hora limpia el campo (sin dual).
// - Tipos por campo: Int del schema (paxCount, paxCountReal, bagsChecked,
//   bagsCabin) → entero ≥ 0; state → clave válida de FLIGHT_STATE_CONFIG;
//   resto → string. Violación → fila rechazada.
// - Semántica de fila: ATÓMICA (un campo malo rechaza la fila entera, cero
//   efectos de esa fila) y el LOTE sigue (parcial explícito, nunca
//   silencioso). Filas en orden; movementId repetido → ambas aplican en orden.
// - Cada fila aplicada: prisma.movement.update + 1 EventLog (action
//   "Actualizado por agente", details con los campos y dual en las horas,
//   visitId + movementId) + emit flight_updated (SSE, la web viva lo ve).
//   Si campos.state NO viene → applyAutoTransition(visitId) del camino PATCH
//   (su EventLog/SSE propios son suyos, no se duplican ni se cuentan como
//   la entrada de la fila).
//
// Lib de horas (normalizarHora):
// - Entradas string: "11:23Z" / "11:23 zulu" (case-insensitive) → zulu;
//   "13:23L" / "13:23 local" → local; "13:23" a secas → LOCAL por defecto
//   (así dicta Toni; pineado en spec). Objeto { hora, tz: "local"|"zulu" }
//   equivalente. H de 1-2 dígitos, rango 00:00–23:59; fuera de rango o
//   ilegible → Error descriptivo (la tool lo convierte en rechazo de fila).
// - Conversión local↔zulu SIEMPRE vía Intl (Europe/Madrid) sobre el día
//   civil de Palma de `ahora` (default: new Date()) — jamás offsets a mano.
//   local→zulu: el instante MÁS TEMPRANO del día civil D cuya pared Madrid
//   es la hora dictada; INEXISTENTE (29-03 02:xx) → Error; AMBIGUA
//   (25-10 02:xx) → primera ocurrencia (CEST). zulu→local: instante
//   calendario D@HH:MM UTC leído con Intl (total, jamás Error por DST).
// - Confirmación dual SIEMPRE en respuestas de escritura: "11:23Z / 13:23 local".
//
// Endurecimiento m2 (misma superficie, cierra deuda S1): el token de hora de
// find_flight solo cuenta como hora si está en 00:00–23:59; si no, es token
// de texto (nunca delta fantasma).
// ============================================================================

/** Hora normalizada por la lib. zulu/local en "HH:MM"; fuente = qué cara se dictó. */
export interface HoraNormalizada {
  zulu: string;
  local: string;
  fuente: "local" | "zulu";
}

/** Entrada de hora aceptada por normalizarHora y por los campos de hora de update_movements. */
export type EntradaHora = string | { hora: string; tz: "local" | "zulu" };

/** update_movements({ cambios }) — lote de escrituras operativas. */
export interface UpdateMovementsChange {
  movementId: string;
  campos: Record<string, unknown>;
}
export interface UpdateMovementsArgs {
  cambios: UpdateMovementsChange[];
}
export interface UpdateMovementsRowOk {
  movementId: string;
  ok: true;
  /** Valores tal como se persistieron (horas ya en Zulu "HH:MM"). */
  aplicado: Record<string, unknown>;
  /** Por campo de hora aplicado: "11:23Z / 13:23 local". */
  dual?: Record<string, string>;
  /** Estado si applyAutoTransition avanzó tras la fila; null/ausente si no. */
  autoTransition?: string | null;
}
export interface UpdateMovementsRowError {
  movementId: string;
  ok: false;
  motivo: string;
}
export type UpdateMovementsRow = UpdateMovementsRowOk | UpdateMovementsRowError;
export interface UpdateMovementsResult {
  resultados: UpdateMovementsRow[];
}

/**
 * log_incident({ texto, vuelo? }) — persiste una incidencia append-only.
 * `vuelo` opcional: visitId exacto o texto libre resuelto con la MISMA lógica
 * de find_flight sobre HOY (día civil de Palma). 1 candidato → se asocia;
 * 0 o >1 → Error con los candidatos en el mensaje, CERO filas creadas
 * (jamás adivinar). Crea Incident + 1 EventLog ("Incidencia registrada",
 * details = texto, visitId si lo hay) atribuidos al user del token.
 */
export interface LogIncidentArgs {
  texto: string;
  vuelo?: string;
}
export interface LogIncidentResult {
  incidentId: string;
  visitId: string | null;
  registration: string | null;
  texto: string;
  createdAt: string; // ISO 8601
}
