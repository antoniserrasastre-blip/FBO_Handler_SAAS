// Tools de ESCRITURA del agente (sprint 02 mcp-escritura-lote).
// Contrato pineado en ./contract.ts (§Sprint 02): allowlist = EXACTAMENTE
// MOVEMENT_OPERATIONAL_FIELDS de upsert.ts (importado, jamás duplicado);
// horas ata/atd/tobt por la lib (./horas.ts); fila atómica, lote parcial
// explícito; EventLog en TODA escritura atribuida al user del token;
// autoTransition reusada del camino PATCH; Incident append-only.
//
// Robustez (review adversarial, fase fix): TODO el cuerpo por-fila corre en
// try/catch — cualquier error de una fila (estructura malformada, valor que
// revienta en BD, throw arbitrario del motor) rechaza SOLO esa fila con un
// motivo claro en español (jamás internals de Prisma/JS) y el lote sigue.

import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { applyAutoTransition } from "@/lib/autoTransition";
import { MOVEMENT_OPERATIONAL_FIELDS } from "@/lib/v2/upsert";
import { FLIGHT_STATE_CONFIG } from "@/types";
import { normalizarHora, formatoDual } from "./horas";
import { findFlight } from "./tools";
import type {
  AgentAuth,
  EntradaHora,
  HoraNormalizada,
  LogIncidentArgs,
  LogIncidentResult,
  UpdateMovementsArgs,
  UpdateMovementsResult,
  UpdateMovementsRow,
} from "./contract";

// Campos de hora que pasan por la lib (Zulu "HH:MM" canónicos). El resto del
// allowlist se persiste verbatim (fuera de ata/atd/tobt).
const HORA_FIELDS = new Set(["ata", "atd", "tobt"]);
// Columnas Int del schema dentro del allowlist → entero entre 0 e Int32 max
// (SQLite/Prisma rechazan valores que no caben en INT — se valida aquí para
// que el motivo sea claro y la fila no llegue a reventar en el motor).
const INT_FIELDS = new Set(["paxCount", "paxCountReal", "bagsChecked", "bagsCabin"]);
const INT32_MAX = 2147483647;

/**
 * Error de validación de fila: su mensaje es apto para el agente (español,
 * sin internals). Cualquier otro error capturado en el bucle por-fila se
 * sustituye por un motivo genérico — jamás se filtra el mensaje del motor.
 */
class FilaInvalida extends Error {}

const MOTIVO_GENERICO =
  "No se pudo aplicar la fila por un error interno al escribir en la base de datos. Revisa los valores e inténtalo de nuevo.";

/** Motivo seguro para el agente a partir de un error capturado por-fila. */
function motivoDe(e: unknown): string {
  return e instanceof FilaInvalida ? e.message : MOTIVO_GENERICO;
}

/** movementId best-effort de una fila cruda (para el resultado de rechazo). */
function movementIdDe(cambio: unknown): string {
  if (cambio && typeof cambio === "object") {
    const id = (cambio as { movementId?: unknown }).movementId;
    if (typeof id === "string") return id;
  }
  return "";
}

/**
 * Valida la ESTRUCTURA de la fila antes de tocar la BD: objeto con movementId
 * de texto no vacío y `campos` objeto campo→valor con al menos una clave.
 */
function validarEstructuraFila(cambio: unknown): {
  movementId: string;
  campos: Record<string, unknown>;
} {
  if (!cambio || typeof cambio !== "object" || Array.isArray(cambio)) {
    throw new FilaInvalida("Fila inválida: se esperaba un objeto { movementId, campos }.");
  }
  const { movementId, campos } = cambio as { movementId?: unknown; campos?: unknown };
  if (typeof movementId !== "string" || movementId.trim() === "") {
    throw new FilaInvalida("La fila requiere un movementId de texto no vacío.");
  }
  if (!campos || typeof campos !== "object" || Array.isArray(campos)) {
    throw new FilaInvalida(
      `La fila de "${movementId}" requiere \`campos\` como objeto campo→valor.`
    );
  }
  const obj = campos as Record<string, unknown>;
  if (Object.keys(obj).length === 0) {
    throw new FilaInvalida(`La fila de "${movementId}" no trae ningún campo que actualizar.`);
  }
  return { movementId, campos: obj };
}

interface FilaValidada {
  data: Record<string, unknown>;
  dual: Record<string, string>;
  descripcion: string[];
}

/**
 * Valida TODO el `campos` de una fila ANTES de escribir nada (fila atómica).
 * Un campo malo → FilaInvalida con motivo en español; cero efectos de la fila.
 */
function validarFila(campos: Record<string, unknown>): FilaValidada {
  const data: Record<string, unknown> = {};
  const dual: Record<string, string> = {};
  const descripcion: string[] = [];

  for (const [campo, valor] of Object.entries(campos)) {
    if (!MOVEMENT_OPERATIONAL_FIELDS.has(campo)) {
      throw new FilaInvalida(`Campo no editable por el agente: "${campo}".`);
    }

    if (HORA_FIELDS.has(campo)) {
      if (valor === null) {
        data[campo] = null; // limpia el campo, sin dual
        descripcion.push(`${campo}: (sin hora)`);
        continue;
      }
      // La lib acepta string u objeto { hora, tz }; sus errores son mensajes
      // seguros en español → se reemiten como motivo de rechazo de la fila.
      let hn: HoraNormalizada;
      try {
        hn = normalizarHora(valor as EntradaHora);
      } catch (e) {
        throw new FilaInvalida(e instanceof Error ? e.message : String(e));
      }
      data[campo] = hn.zulu; // se persiste en Zulu "HH:MM"
      dual[campo] = formatoDual(hn);
      descripcion.push(`${campo}: ${dual[campo]}`);
      continue;
    }

    if (INT_FIELDS.has(campo)) {
      if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0 || valor > INT32_MAX) {
        throw new FilaInvalida(
          `El campo "${campo}" requiere un entero entre 0 y ${INT32_MAX} (recibido: ${JSON.stringify(valor)}).`
        );
      }
      data[campo] = valor;
      descripcion.push(`${campo}: ${valor}`);
      continue;
    }

    if (campo === "state") {
      if (typeof valor !== "string" || !(valor in FLIGHT_STATE_CONFIG)) {
        throw new FilaInvalida(`Estado no válido: "${String(valor)}".`);
      }
      data[campo] = valor;
      descripcion.push(`${campo}: ${valor}`);
      continue;
    }

    // Resto del allowlist → string verbatim.
    if (typeof valor !== "string") {
      throw new FilaInvalida(
        `El campo "${campo}" requiere texto (recibido: ${JSON.stringify(valor)}).`
      );
    }
    data[campo] = valor;
    descripcion.push(`${campo}: ${valor}`);
  }

  return { data, dual, descripcion };
}

/**
 * update_movements — lote de escrituras operativas sobre Movements.
 * Validación fila a fila; fila inválida (o que revienta al escribir) se
 * RECHAZA con motivo y las demás aplican (parcial explícito: los efectos ya
 * escritos de filas buenas anteriores se quedan). Cada fila aplicada →
 * movement.update + EventLog + flight_updated, y applyAutoTransition (camino
 * PATCH) cuando la fila no trae `state`.
 */
export async function updateMovements(
  args: UpdateMovementsArgs,
  auth: AgentAuth
): Promise<UpdateMovementsResult> {
  if (!args || !Array.isArray(args.cambios)) {
    throw new Error("El argumento `cambios` debe ser una lista de filas { movementId, campos }.");
  }

  const resultados: UpdateMovementsRow[] = [];

  for (const cambio of args.cambios as unknown[]) {
    const movId = movementIdDe(cambio);
    try {
      // 1) Estructura de la fila ANTES de tocar la BD.
      const { movementId, campos } = validarEstructuraFila(cambio);

      // 2) El movimiento debe existir (lectura, sin efectos).
      const movimiento = await prisma.movement.findUnique({ where: { id: movementId } });
      if (!movimiento) {
        resultados.push({ movementId, ok: false, motivo: `Movimiento no encontrado: "${movementId}".` });
        continue;
      }

      // 3) Validación ATÓMICA de todo `campos` (cero efectos si algo falla).
      const fila = validarFila(campos);

      // 4) Fila válida → aplica: update + EventLog + emit + autoTransition.
      const visitId = movimiento.visitId;
      await prisma.movement.update({ where: { id: movementId }, data: fila.data });

      await prisma.eventLog.create({
        data: {
          visitId,
          movementId,
          userId: auth.userId,
          action: "Actualizado por agente",
          details: fila.descripcion.join(", "),
        },
      });

      eventBus.emit({
        type: "flight_updated",
        flightId: visitId,
        userId: auth.userId,
        userName: auth.userName || undefined,
        detail: "Actualizado por agente",
        timestamp: new Date().toISOString(),
      });

      // Sin `state` explícito → reusa la transición del camino PATCH (su
      // EventLog y su emit son suyos, no se cuentan como la entrada de la fila).
      let autoTransition: string | null = null;
      if (!("state" in campos)) {
        autoTransition = await applyAutoTransition({
          visitId,
          userId: auth.userId,
          userName: auth.userName,
        });
      }

      const filaOk: UpdateMovementsRow = { movementId, ok: true, aplicado: fila.data };
      if (Object.keys(fila.dual).length > 0) filaOk.dual = fila.dual;
      if (autoTransition !== null) filaOk.autoTransition = autoTransition;
      resultados.push(filaOk);
    } catch (e) {
      // Cualquier error de la fila (validación o motor) rechaza SOLO esta fila
      // con un motivo apto para el agente; el lote sigue con las demás.
      resultados.push({ movementId: movId, ok: false, motivo: motivoDe(e) });
    }
  }

  return { resultados };
}

/**
 * log_incident — persiste una incidencia (Incident + EventLog), append-only.
 * `vuelo` opcional: visitId exacto (visit.findUnique) o texto libre resuelto
 * con la MISMA lógica de find_flight sobre HOY. 0 o >1 candidatos → Error con
 * los candidatos, cero filas creadas (jamás adivinar).
 */
export async function logIncident(
  args: LogIncidentArgs,
  auth: AgentAuth
): Promise<LogIncidentResult> {
  // `texto` obligatorio y con contenido — se valida ANTES de tocar la BD.
  if (!args || typeof args.texto !== "string" || args.texto.trim() === "") {
    throw new Error("El argumento `texto` debe llevar la descripción de la incidencia (no vacío).");
  }

  // `vuelo` PRESENTE pero no-string o en blanco = dictado roto — se rechaza
  // con un único mensaje canónico (sin interpolar el valor) ANTES de tocar la
  // BD. `vuelo` ausente sigue siendo una incidencia general válida.
  if (args.vuelo !== undefined && (typeof args.vuelo !== "string" || args.vuelo.trim() === "")) {
    throw new Error(
      "El argumento `vuelo` debe ser un visitId o un texto de búsqueda no vacío (callsign, matrícula u hora), u omitirse para una incidencia general."
    );
  }

  let visitId: string | null = null;
  let registration: string | null = null;

  if (args.vuelo !== undefined) {
    // (a) visitId exacto.
    const exacto = await prisma.visit.findUnique({
      where: { id: args.vuelo },
      include: { aircraft: true },
    });
    if (exacto) {
      visitId = exacto.id;
      registration = exacto.aircraft?.registration ?? null;
    } else {
      // (b) texto libre → find_flight sobre HOY. 1 candidato → se asocia.
      const { candidates } = await findFlight({ texto: args.vuelo });
      if (candidates.length === 1) {
        visitId = candidates[0].visitId;
        registration = candidates[0].registration;
      } else if (candidates.length === 0) {
        throw new Error(
          `No se encontró ningún vuelo para "${args.vuelo}". Sé más específico (callsign + hora).`
        );
      } else {
        const lista = candidates
          .map((c) => `${c.visitId}${c.registration ? ` (${c.registration})` : ""}`)
          .join(", ");
        throw new Error(
          `Vuelo ambiguo "${args.vuelo}": ${candidates.length} candidatos (${lista}). Especifica callsign + hora.`
        );
      }
    }
  }

  const incident = await prisma.incident.create({
    data: { text: args.texto, authorId: auth.userId, visitId },
  });

  await prisma.eventLog.create({
    data: {
      visitId,
      userId: auth.userId,
      action: "Incidencia registrada",
      details: args.texto,
    },
  });

  return {
    incidentId: incident.id,
    visitId,
    registration,
    texto: args.texto,
    createdAt: new Date(incident.createdAt).toISOString(),
  };
}
