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
  /** §S4 C11: SIEMPRE presente desde S4 (opcional solo por compat del scaffold). */
  flightCategory?: "COMMERCIAL" | "FERRY" | "CANCELLED";
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
  /** §S4 C2/C3: estado COMPUESTO de la rotación (mostAdvancedState sobre las
   *  piernas, reusado de flightView.ts — jamás duplicado). SIEMPRE presente
   *  desde S4 (opcional solo por compat del scaffold). */
  estadoRotacion?: string;
  /** §S4 C1: palmaDay de la Visit "YYYY-MM-DD" (en arrastre != date pedido). */
  palmaDay?: string;
  /** §S4 C1: presente (true) SOLO cuando la visita viene arrastrada de un dia previo. */
  arrastre?: true;
  movements: McpMovement[];
}

/** get_day({ fecha? }) — fecha "DD-MM-YYYY" o "YYYY-MM-DD"; default: hoy (día civil de Palma). */
export interface GetDayResult {
  date: string; // "YYYY-MM-DD" (palmaDay)
  flights: McpDayFlight[];
  /** §S4 C11: recuento de PIERNAS del universo del dia (vivos + cancelados =
   *  total, aunque los cancelados esten excluidos del listado). SIEMPRE
   *  presente desde S4 (opcional solo por compat del scaffold). */
  summary?: { vivos: number; cancelados: number };
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
  /** §S4: estado compuesto de la rotacion (ver McpDayFlight). SIEMPRE presente desde S4. */
  estadoRotacion?: string;
  /** §S4 C1: palmaDay de la Visit "YYYY-MM-DD". SIEMPRE presente desde S4. */
  palmaDay?: string;
  /** §S4 C1: true solo en visitas arrastradas de dias previos. */
  arrastre?: true;
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

// ============================================================================
// Sprint 03 mcp-ciclo-completo — contrato del ciclo de vida.
// Spec: stages/03_sprint/output/03_mcp-ciclo-completo/spec.md (workspace).
//
// tools/list = 10: las 5 de S1/S2 INTACTAS + cancel_movement ·
// uncancel_movement · create_flight · fix_plan · import_daily.
// (El "9" del texto de la spec es un desliz aritmético: su §Superficie firma
// 5 tools nuevas una a una — la superficie firmada manda; desviación anotada
// en el closeout para ratificar.)
//
// Invariantes S3 (heredan TODAS las de S2):
// - EventLog en TODA escritura aplicada, atribuido al user del token.
//   Preview/lecturas → CERO escrituras (ni BD ni EventLog).
// - Horas de ENTRADA siempre por la lib (normalizarHora, EntradaHora);
//   confirmaciones con formatoDual; null limpia el campo (sin dual).
// - Errores de argumento/validación → throw Error con mensaje en español
//   apto para el agente (el route lo convierte en isError), estilo S2;
//   JAMÁS internals de Prisma/JS.
// - Toda escritura aplicada emite SSE (flight_updated; rotación nueva de
//   create_flight → flight_created) — la web viva lo ve.
// - `confirmar`, si viene, es booleano ESTRICTO (otro tipo → Error; un
//   "yes"/"1" dictado no cuenta como confirmación).
//
// cancel_movement({ movementId, motivo, confirmar? }) — d2.2, soft-cancel:
// - `motivo` string no vacío (queda en el EventLog). Movement inexistente →
//   Error. flightCategory ya "CANCELLED" → Error ("ya está cancelado") —
//   protege la conservación del previo (jamás un cancel sobre cancel).
// - GUARDIA DE EVIDENCIA: ata o atd con contenido (no-null, no-vacío) →
//   exige `confirmar: true`; sin él → Error que INCLUYE los datos del vuelo
//   (callsign, matrícula, ata/atd) — caso EC-NGX/CS-LTO del piloto.
// - Aplica: movement.update { flightCategory: "CANCELLED" } + 1 EventLog
//   action "Cancelado por agente" con details = JSON.stringify({ motivo,
//   previo }) — `previo` ∈ COMMERCIAL|FERRY es lo que lee el undo — con
//   visitId + movementId + userId del token. SIN autoTransition (cancelar
//   no es estado operativo). SSE flight_updated.
//
// uncancel_movement({ movementId }):
// - Movement inexistente → Error. flightCategory ≠ "CANCELLED" → Error
//   ("no está cancelado").
// - Restaura desde la ÚLTIMA EventLog del movementId con action
//   "Cancelado por agente" (orderBy timestamp desc), parseando
//   details.previo. Sin esa entrada (p. ej. cancelado por el import humano)
//   o details ilegible → Error claro: no hay previo fiable que restaurar.
// - PROPIEDAD DE CONSERVACIÓN: cancel ∘ uncancel = flightCategory previo
//   EXACTO (COMMERCIAL y FERRY, con y sin horas).
// - Aplica: movement.update { flightCategory: previo } + 1 EventLog
//   "Cancelación deshecha por agente" con details = JSON.stringify({
//   restaurado: previo }). SSE flight_updated.
//
// create_flight({ registration, callsign, fecha?, llegada?, salida?, operador? }) — T6:
// - `registration`/`callsign` strings no vacíos (uppercase/trim). `fecha`
//   "DD-MM-YYYY" | "YYYY-MM-DD" (resolvePalmaDay de tools.ts, ahora
//   exportado); default hoy; formato no reconocido → Error. Al menos UNA
//   pierna (llegada y/o salida); ninguna → Error (fricción 9H-YOU).
// - llegada = { hora, origen? } · salida = { hora, destino? }. `hora`
//   OBLIGATORIA en cada pierna presente (EntradaHora → se persiste eta/etd
//   en Zulu; es el ancla de identidad callsign+hora). origen/destino string
//   trim verbatim. Clave desconocida en una pierna → Error (dictado roto).
// - `operador` (opcional): resuelve contra Operators EXISTENTES por icaoCode
//   o name (ambos case-insensitive); sin match → Error claro (JAMÁS crear
//   operador desde texto libre). Omitido → findOperator(callsign)
//   best-effort, como el import.
// - Camino (reuso, jamás duplicar): upsertAircraft → upsertVisit con match
//   { callsigns: [callsign], eta, etd } — hereda el fix D-ASIM: sin match →
//   Visit PROPIA (2ª rotación del mismo avión+día no pisa la 1ª); con match
//   → la MISMA rotación con semántica upsert (piernas que faltan se crean,
//   plan de las existentes se actualiza) → upsertMovement por pierna
//   presente (ARRIVAL: origin/eta · DEPARTURE: destination/etd;
//   scheduledDate = fecha; state "EXPECTED" solo en create — el update de
//   una pierna existente jamás toca operativos) → visit.update
//   { arrivalDate/departureDate = fecha para las piernas presentes; type
//   SOLO si la Visit es nueva: "TURNAROUND" con ambas piernas, null con una;
//   Visit existente → type intacto }.
// - 1 EventLog por llamada: action "Vuelo creado por agente" (Visit nueva) |
//   "Rotación actualizada por agente" (existente); details = "CALLSIGN
//   (REG)" + horas en dual. SSE flight_created (nueva) | flight_updated.
//
// fix_plan({ movementId, campos }) — d2.3:
// - Allowlist = EXACTAMENTE FIX_PLAN_FIELDS (exportado en tools-ciclo.ts):
//   callsign · registration · eta · etd · origin · destination ·
//   scheduledDate. COMPLEMENTARIO a S2: FIX_PLAN_FIELDS ∩
//   MOVEMENT_OPERATIONAL_FIELDS = ∅ (test de disjunción importando AMBOS
//   Sets). Campo operativo/desconocido, `campos` vacío o no-objeto → Error
//   estilo S2 ("Campo no corregible por fix_plan: …"). Movement inexistente
//   → Error. Validación ATÓMICA de TODO `campos` antes de escribir nada.
// - Por campo: `callsign` string no vacío → uppercase/trim. `eta` SOLO en
//   ARRIVAL, `etd` SOLO en DEPARTURE (dirección contraria → rechazo);
//   EntradaHora → Zulu; null limpia; dual en el resultado. `origin` SOLO
//   ARRIVAL, `destination` SOLO DEPARTURE; string trim; null limpia.
//   `scheduledDate` "DD-MM-YYYY"|"YYYY-MM-DD" → palmaDayUtc; SOLO toca
//   movement.scheduledDate — la Visit y su palmaDay NO se tocan (identidad).
//   `registration` re-apunta la VISIT del movement a otro Aircraft
//   (upsertAircraft con la matrícula nueva, callsignForOperator = callsign
//   del movement; visit.update aircraftId) — afecta a las DOS piernas; el
//   visitId NO cambia.
// - Aplica: movement.update [+ visit.update si registration] + 1 EventLog
//   "Plan corregido por agente" (details estilo S2 "campo: valor", dual en
//   horas, "registration: ANTES → DESPUÉS") + SSE flight_updated.
//
// import_daily({ pdf_base64, confirmar? }) — T7 + d2.4:
// - `pdf_base64` string base64 no vacío → Buffer; debe empezar por "%PDF" y
//   respetar el límite de tamaño del REST (uploadValidation "pdf"); si no →
//   Error claro (jamás se intenta parsear).
// - REUSA el pipeline de /api/import EXTRAÍDO a lib compartida
//   (src/lib/v2/import-core.ts): preview (parse + reconciliación toCancel
//   del POST) y persist (camino del PUT parametrizado por userId/userName).
//   El route REST delega en la lib y su comportamiento HTTP queda
//   BYTE-IDÉNTICO (hard-rule #1; los tests existentes del route lo
//   guardan). El MCP JAMÁS duplica el pipeline.
// - DRY-RUN (default, todo lo que no sea confirmar === true): preview →
//   CERO escrituras (BD y EventLog — espías a todo el mock). Resultado:
//   { date, flights, errors, warnings, toCancel } con toCancel ENRIQUECIDO
//   con movements [{ movementId, direction, flightCategory }] para poder
//   confirmarlos UNO A UNO con cancel_movement. (El REST devuelve su shape
//   actual EXACTO, sin movements.)
// - CONFIRM (confirmar === true, repitiendo la llamada con el MISMO pdf):
//   re-parsea y persiste por el camino del PUT atribuido al user del token
//   (EventLogs propios del pipeline "Importado/Actualizado desde PDF" +
//   sweepNoShows({ userId: el del token }) + SSE flight_created de resumen)
//   — SIN cancelIds JAMÁS (hard-rule #8: toCancel nunca en bloque; el
//   escribano los confirma uno a uno contra el eSIA). Resultado: { date,
//   creados, actualizados, noShows, total, toCancel } con toCancel
//   RECALCULADO tras persistir.
// ============================================================================

/** cancel_movement — soft-cancel con guardia de evidencia (d2.2). */
export interface CancelMovementArgs {
  movementId: string;
  motivo: string;
  confirmar?: boolean;
}
export interface CancelMovementResult {
  movementId: string;
  visitId: string;
  callsign: string | null;
  registration: string | null;
  /** flightCategory previo guardado en el EventLog (lo que restaura el undo). */
  previo: "COMMERCIAL" | "FERRY";
  motivo: string;
}

/** uncancel_movement — restaura el flightCategory previo desde el EventLog. */
export interface UncancelMovementArgs {
  movementId: string;
}
export interface UncancelMovementResult {
  movementId: string;
  visitId: string;
  callsign: string | null;
  registration: string | null;
  restaurado: "COMMERCIAL" | "FERRY";
}

/** create_flight — rotación fuera del daily, con pierna de llegada (T6). */
export interface CreateFlightLegArrival {
  hora: EntradaHora;
  origen?: string | null;
}
export interface CreateFlightLegDeparture {
  hora: EntradaHora;
  destino?: string | null;
}
export interface CreateFlightArgs {
  registration: string;
  callsign: string;
  /** "DD-MM-YYYY" | "YYYY-MM-DD"; default hoy (día civil de Palma). */
  fecha?: string;
  llegada?: CreateFlightLegArrival;
  salida?: CreateFlightLegDeparture;
  /** Operator EXISTENTE por icaoCode o name; jamás se crea de texto libre. */
  operador?: string;
}
export interface CreateFlightLegResult {
  movementId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  /** true si la pierna se creó; false si ya existía (plan actualizado). */
  creada: boolean;
  /** "11:23Z / 13:23 local" de la hora dictada. */
  dual: string;
}
export interface CreateFlightResult {
  visitId: string;
  /** true si la Visit (rotación) es nueva; false si el hint la casó. */
  creada: boolean;
  registration: string;
  callsign: string;
  fecha: string; // "YYYY-MM-DD" (palmaDay)
  piernas: CreateFlightLegResult[];
}

/** fix_plan — corrige campos de PLAN sin re-import ni tocar identidad (d2.3). */
export interface FixPlanArgs {
  movementId: string;
  campos: Record<string, unknown>;
}
export interface FixPlanResult {
  movementId: string;
  visitId: string;
  /** Valores tal como se persistieron (horas en Zulu; registration normalizada). */
  aplicado: Record<string, unknown>;
  /** Por campo de hora aplicado: "11:23Z / 13:23 local". */
  dual?: Record<string, string>;
}

/** import_daily — daily PDF por tool, dry-run por defecto (T7 + d2.4). */
export interface ImportDailyArgs {
  /** §S4 C12: pdf_base64 XOR upload_id (ambos o ninguno -> Error). */
  pdf_base64?: string;
  upload_id?: string;
  confirmar?: boolean;
}
export interface ImportToCancelMovement {
  movementId: string;
  direction: "ARRIVAL" | "DEPARTURE";
  flightCategory: string;
}
/** Entrada de toCancel del MCP: la del REST + movements para cancelar uno a uno. */
export interface ImportToCancelEntry {
  visitId: string;
  registration: string;
  callsign: string;
  eta: string | null;
  etd: string | null;
  origin: string | null;
  destination: string | null;
  movements: ImportToCancelMovement[];
}
export interface ImportDailyPreviewResult {
  date: string;
  flights: unknown[];
  errors: string[];
  warnings: Array<{ row?: unknown; reason: string }>;
  toCancel: ImportToCancelEntry[];
}
export interface ImportDailyPersistResult {
  date: string;
  creados: number;
  actualizados: number;
  noShows: number;
  total: number;
  /** Recalculado tras persistir: siguen pendientes de confirmar uno a uno. */
  toCancel: ImportToCancelEntry[];
}
export type ImportDailyResult = ImportDailyPreviewResult | ImportDailyPersistResult;

// ----------------------------------------------------------------------------
// Pins finos post-rojo (orquestador, 19-07-2026 — a ratificar en closeout):
// - ANCLA DE DÍA CIVIL para conversión de horas (local↔zulu vía la lib):
//   create_flight ancla en la `fecha` RESUELTA (normalizarHora(entrada,
//   palmaDay de la fecha) — UTC midnight del día civil cae dentro del propio
//   día civil en Madrid, así que el ancla es correcta también en bordes DST).
//   fix_plan ancla en el scheduledDate del movement; si la MISMA llamada
//   trae `scheduledDate` nuevo, las horas se anclan al NUEVO.
// - `date` de import_daily (preview y persist): tal cual lo devuelve el
//   parser (mismo valor que el REST POST/PUT — sin reformatear).
// ----------------------------------------------------------------------------

// ============================================================================
// Sprint 04 board-del-turno — contrato §S4 (C1-C4 + C11-C14).
// Spec: stages/03_sprint/output/04_board-del-turno/spec.md (workspace).
// tools/list SIGUE = 10 (S4 no añade tools; añade un endpoint REST de agente).
//
// C1 — UNIVERSO DEL DÍA (compartido get_day · find_flight · /api/flights GET;
// una sola fuente: src/lib/v2/dayUniverse.ts, JAMÁS tres copias):
// - visitsForDay(D) = visits con palmaDay == D
//   ∪ visits con algún movement.scheduledDate == D
//   ∪ ARRASTRE: visits con palmaDay ∈ [D − ARRASTRE_WINDOW_DAYS, D) que tengan
//     DEPARTURE con atd == null y flightCategory != "CANCELLED".
//   ARRASTRE_WINDOW_DAYS = 14 (gate 23-07). Dedupe por visitId (una sola
//   findMany con OR — exactamente una vez por rotación). La aritmética de la
//   ventana es de CALENDARIO sobre la key palmaDay (UTC midnight), no TZ.
// - Rotación arrastrada → arrastre: true + su palmaDay real en la respuesta
//   MCP. /api/flights GET adopta el MISMO where (su include/proyección no
//   cambian; cero cambio visual — enmienda acotada de R1, gate 23-07).
// - C14: las visits SIN movimientos (huérfanas de extras) NO se listan en
//   ninguna de las tres superficies (esVisitaVisible). Siguen en BD y
//   reaparecen al enriquecerse con el PDF.
//
// C11 — CANCELLED en lecturas:
// - McpMovement.flightCategory SIEMPRE presente (verbatim del schema).
// - get_day({ fecha?, incluirCancelados? }): por DEFECTO excluye las piernas
//   CANCELLED del listado; una rotación sin ninguna pierna viva se omite
//   entera. summary = { vivos, cancelados } cuenta PIERNAS del universo del
//   día (vivos + cancelados = total real, se excluyan o no del listado).
//   incluirCancelados: true (booleano ESTRICTO, como confirmar) → las lista
//   marcadas (flightCategory visible). estadoRotacion se compone SOLO sobre
//   las piernas vivas (una rotación con salida cancelada no luce "salida").
// - find_flight NO excluye cancelados: los devuelve MARCADOS (flightCategory
//   en movements) — hacen falta para desambiguar y para uncancel.
//
// C2/C3 — ESTADO DE ROTACIÓN:
// - estadoRotacion = mostAdvancedState(piernas vivas) EXPORTADO de
//   src/lib/flightView.ts (jamás duplicado). El state POR PIERNA sigue
//   verbatim (compat interna; el agente debe leer estadoRotacion).
// - C2 (regresión 19-07): escribir ata vía update_movements sobre rotación
//   EXPECTED → estadoRotacion ≥ ON_BLOCKS. El fix se limita a la rama que la
//   sonda demuestre rota; la semántica del PATCH humano NO cambia.
// - C3 (property de seed): un import de visita NUEVA jamás siembra DEPARTURE
//   con state > EXPECTED ni con atd poblado — sobre resolveImportState Y el
//   pipeline entero de import-core. El re-import conserva lo operativo
//   (política "plan del PDF, operativo intocable", intacta).
//
// C4 — GUARDIAS DEL MATCHER (registrationMatches, tools.ts):
// - registration null, vacía o < 3 chars → SOLO igualdad exacta (el bug
//   ZJONES: token.includes("") siempre true). Substring bidireccional SOLO
//   si AMBOS lados ≥ 3 chars. Callsign exacto SIEMPRE ancla y va primero.
// - Sondas de regresión (fixtures sobre el universo C1): N546XJ con y sin
//   guion · N600CK · VJA546 por callsign · ZJONES (registration vacía) JAMÁS
//   candidata por matrícula.
//
// C12 — ENTRADA DEL PDF SIN BASE64 INLINE:
// - POST /api/mcp/upload (multipart, campo "file"): auth = MISMO Bearer
//   AGENT que /api/mcp (401 idéntico sin token); guardas REUSADAS de
//   uploadValidation "pdf" (%PDF + tamaño). Persiste en
//   process.env.MCP_UPLOAD_DIR || os.tmpdir()+"/fbo-mcp-uploads", nombre
//   <uploadId>.pdf con uploadId = crypto.randomUUID() (infra, no estado de
//   dominio). Respuesta 200: { uploadId, bytes, expiresAt } (ISO). TTL 1 h
//   por mtime del fichero (Date.now es infra aquí, no dominio).
// - import_daily: upload_id XOR pdf_base64 (ambos o ninguno → Error claro en
//   español). Con upload_id: lee el fichero, MISMAS guardas y pipeline que
//   base64 (efectos byte-idénticos). El dry-run NO consume el uploadId; el
//   confirmar === true con persist OK lo consume (unlink). Expirado,
//   consumido o inexistente → Error claro en español, jamás internals.
//
// C13 — FEED LIVE (liveTracking.ts):
// - KILL-SWITCH: el seeding de ata/atd desde el feed SOLO si
//   process.env.LIVE_SEED_TIMES === "true" (default: APAGADO, gate 23-07).
//   El snapshot live* y el EventLog "live → <phase>" fluyen en AMBOS modos.
// - GUARDIA (canSeedTime, pura y exportada; vigente cuando se reactive):
//   · ata: solo pierna ARRIVAL con scheduledDate == día civil de hoy Y
//     transición observada DESDE aire (livePhase previo APPROACHING|LANDED —
//     jamás sembrar ata a un avión visto por primera vez ya parado).
//   · atd: solo pierna DEPARTURE con scheduledDate == día civil de hoy Y
//     livePhase previo EN TIERRA (LANDED|ON_BLOCKS — un avión en crucero
//     jamás siembra atd; mata los DEPARTED de llegadas en vuelo y los
//     matcheos por matrícula de otro día).
//   · JAMÁS pisar ata/atd existentes (ya vigente, se conserva).
// ============================================================================

/** POST /api/mcp/upload — respuesta (C12). */
export interface McpUploadResult {
  uploadId: string;
  bytes: number;
  expiresAt: string; // ISO 8601
}
