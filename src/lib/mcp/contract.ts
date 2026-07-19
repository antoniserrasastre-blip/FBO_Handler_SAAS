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
