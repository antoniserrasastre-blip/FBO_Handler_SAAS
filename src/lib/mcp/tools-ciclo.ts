// Tools del CICLO DE VIDA del agente (sprint 03 mcp-ciclo-completo).
// Contrato pineado en ./contract.ts (§Sprint 03): cancel/uncancel con
// conservación vía EventLog, create_flight sobre upsertVisit con hint
// (hereda el fix D-ASIM), fix_plan con allowlist COMPLEMENTARIO al de S2,
// import_daily sobre el pipeline de /api/import extraído a lib compartida
// (dry-run por defecto, toCancel JAMÁS en bloque).
//
// Invariantes (heredan S2): EventLog en TODA escritura aplicada atribuida al
// user del token; preview/lecturas → cero escrituras; horas de entrada por la
// lib (normalizarHora/formatoDual); errores en español aptos para el agente
// (jamás internals de Prisma/JS); `confirmar` booleano ESTRICTO.

import { prisma } from "@/lib/db";
import { eventBus } from "@/lib/events";
import { normalizarHora, formatoDual } from "./horas";
import { resolvePalmaDay } from "./tools";
import { upsertAircraft, upsertVisit, upsertMovement, upsertOperator } from "@/lib/v2/upsert";
import { findOperator } from "@/lib/operators";
import { dateToSqlString } from "@/lib/time";
import { validateUpload } from "@/lib/uploadValidation";
import { parseBuffers, previewImport, persistImport, computeToCancel } from "@/lib/v2/import-core";
import type {
  AgentAuth,
  CancelMovementArgs,
  CancelMovementResult,
  CreateFlightArgs,
  CreateFlightLegResult,
  CreateFlightResult,
  EntradaHora,
  FixPlanArgs,
  FixPlanResult,
  HoraNormalizada,
  ImportDailyArgs,
  ImportDailyResult,
  UncancelMovementArgs,
  UncancelMovementResult,
} from "./contract";

/**
 * Allowlist de fix_plan: EXACTAMENTE los campos de PLAN corregibles sin
 * re-import. COMPLEMENTARIO a MOVEMENT_OPERATIONAL_FIELDS de upsert.ts
 * (la intersección es ∅ — hay test de disjunción importando ambos Sets).
 */
export const FIX_PLAN_FIELDS = new Set([
  "callsign",
  "registration",
  "eta",
  "etd",
  "origin",
  "destination",
  "scheduledDate",
]);

const RE_DDMMYYYY = /^\d{2}-\d{2}-\d{4}$/;
const RE_YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;

function esFechaValida(v: string): boolean {
  const t = v.trim();
  return RE_DDMMYYYY.test(t) || RE_YYYYMMDD.test(t);
}

/** `confirmar` debe ser booleano estricto si viene; un "yes"/"1" NO confirma. */
function validarConfirmar(confirmar: unknown): void {
  if (confirmar !== undefined && typeof confirmar !== "boolean") {
    throw new Error("El argumento `confirmar` debe ser booleano (true/false).");
  }
}

// ===========================================================================
// cancel_movement — soft-cancel con guardia de evidencia (d2.2).
// ===========================================================================
export async function cancelMovement(
  args: CancelMovementArgs,
  auth: AgentAuth
): Promise<CancelMovementResult> {
  if (!args || typeof args.movementId !== "string" || args.movementId.trim() === "") {
    throw new Error("El argumento `movementId` es obligatorio.");
  }
  if (typeof args.motivo !== "string" || args.motivo.trim() === "") {
    throw new Error("El argumento `motivo` es obligatorio (por qué se cancela; queda en el registro).");
  }
  validarConfirmar(args.confirmar);

  const mov = await prisma.movement.findUnique({
    where: { id: args.movementId },
    include: { visit: { include: { aircraft: true } } },
  });
  if (!mov) throw new Error(`Movimiento no encontrado: "${args.movementId}".`);

  if (mov.flightCategory === "CANCELLED") {
    throw new Error("El movimiento ya está cancelado.");
  }
  const previo = mov.flightCategory as "COMMERCIAL" | "FERRY";

  const callsign = mov.callsign ?? null;
  const registration = mov.visit?.aircraft?.registration ?? null;
  const ata = typeof mov.ata === "string" && mov.ata.trim() !== "" ? mov.ata : null;
  const atd = typeof mov.atd === "string" && mov.atd.trim() !== "" ? mov.atd : null;

  // GUARDIA DE EVIDENCIA: si ya operó (ata/atd) exige confirmar:true explícito.
  if ((ata || atd) && args.confirmar !== true) {
    const horas = [ata ? `ATA ${ata}` : null, atd ? `ATD ${atd}` : null].filter(Boolean).join(", ");
    throw new Error(
      `El vuelo ${callsign ?? "(sin callsign)"} (${registration ?? "sin matrícula"}) ya operó (${horas}). ` +
        `Verifícalo contra el eSIA y repite con confirmar:true para cancelarlo igualmente.`
    );
  }

  const visitId = mov.visitId;
  await prisma.movement.update({
    where: { id: args.movementId },
    data: { flightCategory: "CANCELLED" },
  });

  await prisma.eventLog.create({
    data: {
      visitId,
      movementId: args.movementId,
      userId: auth.userId,
      action: "Cancelado por agente",
      details: JSON.stringify({ motivo: args.motivo, previo }),
    },
  });

  eventBus.emit({
    type: "flight_updated",
    flightId: visitId,
    userId: auth.userId,
    userName: auth.userName || undefined,
    detail: "Cancelado por agente",
    timestamp: new Date().toISOString(),
  });

  return { movementId: args.movementId, visitId, callsign, registration, previo, motivo: args.motivo };
}

// ===========================================================================
// uncancel_movement — restaura el previo desde el EventLog del cancel.
// ===========================================================================
export async function uncancelMovement(
  args: UncancelMovementArgs,
  auth: AgentAuth
): Promise<UncancelMovementResult> {
  if (!args || typeof args.movementId !== "string" || args.movementId.trim() === "") {
    throw new Error("El argumento `movementId` es obligatorio.");
  }

  const mov = await prisma.movement.findUnique({
    where: { id: args.movementId },
    include: { visit: { include: { aircraft: true } } },
  });
  if (!mov) throw new Error(`Movimiento no encontrado: "${args.movementId}".`);
  if (mov.flightCategory !== "CANCELLED") {
    throw new Error("El movimiento no está cancelado; no hay nada que deshacer.");
  }

  const lastCancel = await prisma.eventLog.findFirst({
    where: { movementId: args.movementId, action: "Cancelado por agente" },
    orderBy: { timestamp: "desc" },
  });
  if (!lastCancel || typeof lastCancel.details !== "string") {
    throw new Error(
      "No hay un cancel previo del agente para este movimiento: no existe un estado fiable que restaurar."
    );
  }

  let previo: unknown;
  try {
    previo = (JSON.parse(lastCancel.details) as { previo?: unknown }).previo;
  } catch {
    throw new Error("No se pudo leer el estado previo del cancel: la anotación de auditoría es ilegible.");
  }
  if (previo !== "COMMERCIAL" && previo !== "FERRY") {
    throw new Error("El estado previo guardado no es válido; no se puede restaurar con seguridad.");
  }

  const visitId = mov.visitId;
  await prisma.movement.update({
    where: { id: args.movementId },
    data: { flightCategory: previo },
  });

  await prisma.eventLog.create({
    data: {
      visitId,
      movementId: args.movementId,
      userId: auth.userId,
      action: "Cancelación deshecha por agente",
      details: JSON.stringify({ restaurado: previo }),
    },
  });

  eventBus.emit({
    type: "flight_updated",
    flightId: visitId,
    userId: auth.userId,
    userName: auth.userName || undefined,
    detail: "Cancelación deshecha por agente",
    timestamp: new Date().toISOString(),
  });

  return {
    movementId: args.movementId,
    visitId,
    callsign: mov.callsign ?? null,
    registration: mov.visit?.aircraft?.registration ?? null,
    restaurado: previo,
  };
}

// ===========================================================================
// create_flight — rotación fuera del daily sobre upsertVisit con hint (T6).
// ===========================================================================

/** Valida la ESTRUCTURA de una pierna (objeto con hora obligatoria y sólo la
 *  clave extra permitida). Devuelve la hora y el extra. Todo pre-BD. */
function validarPierna(
  leg: unknown,
  tipo: "llegada" | "salida",
  extraKey: "origen" | "destino"
): { hora: unknown; extra: unknown } {
  if (!leg || typeof leg !== "object" || Array.isArray(leg)) {
    throw new Error(`La pierna \`${tipo}\` debe ser un objeto { hora, ${extraKey}? }.`);
  }
  const obj = leg as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (k !== "hora" && k !== extraKey) {
      throw new Error(`Clave desconocida en \`${tipo}\`: "${k}". Sólo se admite \`hora\` y \`${extraKey}\`.`);
    }
  }
  if (!("hora" in obj) || obj.hora === undefined || obj.hora === null) {
    throw new Error(`La pierna \`${tipo}\` requiere \`hora\`.`);
  }
  return { hora: obj.hora, extra: obj[extraKey] };
}

/** origen/destino: string trim verbatim; null/ausente → null. */
function textoOpcional(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return String(v).trim();
}

export async function createFlight(
  args: CreateFlightArgs,
  auth: AgentAuth
): Promise<CreateFlightResult> {
  if (!args || typeof args.registration !== "string" || args.registration.trim() === "") {
    throw new Error("El argumento `registration` (matrícula) es obligatorio.");
  }
  if (typeof args.callsign !== "string" || args.callsign.trim() === "") {
    throw new Error("El argumento `callsign` es obligatorio.");
  }
  const registration = args.registration.toUpperCase().trim();
  const callsign = args.callsign.toUpperCase().trim();

  if (args.fecha !== undefined) {
    if (typeof args.fecha !== "string" || !esFechaValida(args.fecha)) {
      throw new Error(`Fecha no reconocida: "${String(args.fecha)}". Usa 'DD-MM-YYYY' o 'YYYY-MM-DD'.`);
    }
  }
  const palmaDay = resolvePalmaDay(args.fecha);

  const { llegada, salida } = args;
  if (llegada === undefined && salida === undefined) {
    throw new Error("Se requiere al menos una pierna: `llegada` y/o `salida` (con su hora).");
  }

  // Validación estructural de piernas ANTES de tocar la BD.
  const llegadaP = llegada !== undefined ? validarPierna(llegada, "llegada", "origen") : undefined;
  const salidaP = salida !== undefined ? validarPierna(salida, "salida", "destino") : undefined;

  // Horas ancladas a la fecha resuelta (día civil de Palma). Ilegible → Error.
  const arrHora: HoraNormalizada | undefined = llegadaP
    ? normalizarHora(llegadaP.hora as EntradaHora, palmaDay)
    : undefined;
  const depHora: HoraNormalizada | undefined = salidaP
    ? normalizarHora(salidaP.hora as EntradaHora, palmaDay)
    : undefined;

  // Operador: EXPLÍCITO contra Operators existentes (jamás se crea de texto
  // libre); omitido → findOperator(callsign) best-effort como el import.
  let operatorId: string | null = null;
  if (args.operador !== undefined) {
    if (typeof args.operador !== "string" || args.operador.trim() === "") {
      throw new Error("El argumento `operador` debe ser un código ICAO o nombre de un operador existente.");
    }
    const q = args.operador.trim();
    const existente = await prisma.operator.findFirst({
      where: { OR: [{ icaoCode: q.toUpperCase() }, { name: q }] },
    });
    if (!existente) {
      throw new Error(
        `No existe ningún operador con código o nombre "${q}". Los operadores no se crean desde texto libre.`
      );
    }
    operatorId = existente.id;
  } else {
    const op = findOperator(callsign);
    if (op) {
      const dbOp = await upsertOperator(op.icao, op.name);
      operatorId = dbOp.id;
    }
  }

  // --- Escrituras (todo lo anterior fue validación/lectura, cero mutaciones) ---
  const aircraft = await upsertAircraft({ registration, callsignForOperator: callsign });

  const { record: visit, wasCreated: visitWasCreated } = await upsertVisit({
    aircraftId: aircraft.id,
    palmaDay,
    operatorId,
    match: {
      callsigns: [callsign],
      eta: arrHora?.zulu ?? null,
      etd: depHora?.zulu ?? null,
    },
  });

  const piernas: CreateFlightLegResult[] = [];

  if (llegadaP && arrHora) {
    const { record, wasCreated } = await upsertMovement({
      visitId: visit.id,
      direction: "ARRIVAL",
      callsign,
      scheduledDate: palmaDay,
      data: { origin: textoOpcional(llegadaP.extra), eta: arrHora.zulu, state: "EXPECTED" },
    });
    piernas.push({ movementId: record.id, direction: "ARRIVAL", creada: wasCreated, dual: formatoDual(arrHora) });
  }

  if (salidaP && depHora) {
    const { record, wasCreated } = await upsertMovement({
      visitId: visit.id,
      direction: "DEPARTURE",
      callsign,
      scheduledDate: palmaDay,
      data: { destination: textoOpcional(salidaP.extra), etd: depHora.zulu, state: "EXPECTED" },
    });
    piernas.push({ movementId: record.id, direction: "DEPARTURE", creada: wasCreated, dual: formatoDual(depHora) });
  }

  // Visit plan: arrival/departure date de las piernas presentes; `type` SOLO
  // si la Visit es nueva (TURNAROUND con ambas, null con una).
  const visitData: Record<string, unknown> = {};
  if (llegadaP) visitData.arrivalDate = palmaDay;
  if (salidaP) visitData.departureDate = palmaDay;
  if (visitWasCreated) visitData.type = llegadaP && salidaP ? "TURNAROUND" : null;
  await prisma.visit.update({ where: { id: visit.id }, data: visitData });

  const dualDesc = piernas
    .map((p) => `${p.direction === "ARRIVAL" ? "ARR" : "DEP"} ${p.dual}`)
    .join(", ");
  await prisma.eventLog.create({
    data: {
      visitId: visit.id,
      userId: auth.userId,
      action: visitWasCreated ? "Vuelo creado por agente" : "Rotación actualizada por agente",
      details: `${callsign} (${registration}) ${dualDesc}`,
    },
  });

  eventBus.emit({
    type: visitWasCreated ? "flight_created" : "flight_updated",
    flightId: visit.id,
    userId: auth.userId,
    userName: auth.userName || undefined,
    detail: visitWasCreated ? "Vuelo creado por agente" : "Rotación actualizada por agente",
    timestamp: new Date().toISOString(),
  });

  return {
    visitId: visit.id,
    creada: visitWasCreated,
    registration,
    callsign,
    fecha: dateToSqlString(palmaDay),
    piernas,
  };
}

// ===========================================================================
// fix_plan — corrige campos de PLAN sin tocar operativos ni identidad (d2.3).
// ===========================================================================
export async function fixPlan(args: FixPlanArgs, auth: AgentAuth): Promise<FixPlanResult> {
  if (!args || typeof args.movementId !== "string" || args.movementId.trim() === "") {
    throw new Error("El argumento `movementId` es obligatorio.");
  }
  const campos = args.campos;
  if (!campos || typeof campos !== "object" || Array.isArray(campos)) {
    throw new Error("El argumento `campos` debe ser un objeto campo→valor.");
  }
  const entries = Object.entries(campos as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error("`campos` no trae ningún campo que corregir.");
  }
  // Allowlist (COMPLEMENTARIO a los operativos de S2): campo fuera → rechazo.
  for (const [campo] of entries) {
    if (!FIX_PLAN_FIELDS.has(campo)) {
      throw new Error(`Campo no corregible por fix_plan: "${campo}".`);
    }
  }

  const mov = await prisma.movement.findUnique({
    where: { id: args.movementId },
    include: { visit: { include: { aircraft: true } } },
  });
  if (!mov) throw new Error(`Movimiento no encontrado: "${args.movementId}".`);
  const direction = mov.direction as "ARRIVAL" | "DEPARTURE";
  const visitId = mov.visitId;
  const camposObj = campos as Record<string, unknown>;

  // Ancla de hora: el scheduledDate NUEVO si viene en la llamada, si no el del
  // movement. Se parsea ANTES para validar de forma atómica.
  let scheduledDateValue: Date | undefined;
  if ("scheduledDate" in camposObj) {
    const raw = camposObj.scheduledDate;
    if (typeof raw !== "string" || !esFechaValida(raw)) {
      throw new Error(`scheduledDate no reconocida: "${String(raw)}". Usa 'DD-MM-YYYY' o 'YYYY-MM-DD'.`);
    }
    scheduledDateValue = resolvePalmaDay(raw);
  }
  const anchorDay: Date | undefined = scheduledDateValue ?? (mov.scheduledDate ?? undefined);

  // Validación ATÓMICA de TODO `campos` antes de escribir nada.
  const data: Record<string, unknown> = {};
  const dual: Record<string, string> = {};
  const desc: string[] = [];
  let nuevaRegistration: string | null = null;

  for (const [campo, valor] of entries) {
    switch (campo) {
      case "callsign": {
        if (typeof valor !== "string" || valor.trim() === "") {
          throw new Error("`callsign` debe ser texto no vacío.");
        }
        data.callsign = valor.toUpperCase().trim();
        desc.push(`callsign: ${data.callsign as string}`);
        break;
      }
      case "eta": {
        if (direction !== "ARRIVAL") throw new Error("`eta` sólo se corrige en un movimiento ARRIVAL.");
        if (valor === null) {
          data.eta = null;
          desc.push("eta: (sin hora)");
          break;
        }
        const hn = normalizarHora(valor as EntradaHora, anchorDay);
        data.eta = hn.zulu;
        dual.eta = formatoDual(hn);
        desc.push(`eta: ${dual.eta}`);
        break;
      }
      case "etd": {
        if (direction !== "DEPARTURE") throw new Error("`etd` sólo se corrige en un movimiento DEPARTURE.");
        if (valor === null) {
          data.etd = null;
          desc.push("etd: (sin hora)");
          break;
        }
        const hn = normalizarHora(valor as EntradaHora, anchorDay);
        data.etd = hn.zulu;
        dual.etd = formatoDual(hn);
        desc.push(`etd: ${dual.etd}`);
        break;
      }
      case "origin": {
        if (direction !== "ARRIVAL") throw new Error("`origin` sólo se corrige en un movimiento ARRIVAL.");
        if (valor === null) {
          data.origin = null;
          desc.push("origin: (sin origen)");
          break;
        }
        if (typeof valor !== "string") throw new Error("`origin` debe ser texto o null.");
        data.origin = valor.trim();
        desc.push(`origin: ${data.origin as string}`);
        break;
      }
      case "destination": {
        if (direction !== "DEPARTURE") throw new Error("`destination` sólo se corrige en un movimiento DEPARTURE.");
        if (valor === null) {
          data.destination = null;
          desc.push("destination: (sin destino)");
          break;
        }
        if (typeof valor !== "string") throw new Error("`destination` debe ser texto o null.");
        data.destination = valor.trim();
        desc.push(`destination: ${data.destination as string}`);
        break;
      }
      case "scheduledDate": {
        data.scheduledDate = scheduledDateValue;
        desc.push(`scheduledDate: ${dateToSqlString(scheduledDateValue as Date)}`);
        break;
      }
      case "registration": {
        if (typeof valor !== "string" || valor.trim() === "") {
          throw new Error("`registration` debe ser texto no vacío.");
        }
        nuevaRegistration = valor.toUpperCase().trim();
        break;
      }
    }
  }

  // --- Escrituras (validación superada; ahora sí se muta) ---
  const aplicado: Record<string, unknown> = { ...data };

  // registration re-apunta la VISIT del movement a otro Aircraft (ambas
  // piernas; el visitId NO cambia). upsertAircraft + visit.update aircraftId.
  if (nuevaRegistration !== null) {
    const antes = mov.visit?.aircraft?.registration ?? "(sin matrícula)";
    const nuevoAircraft = await upsertAircraft({
      registration: nuevaRegistration,
      callsignForOperator: mov.callsign,
    });
    await prisma.visit.update({ where: { id: visitId }, data: { aircraftId: nuevoAircraft.id } });
    aplicado.registration = nuevaRegistration;
    desc.push(`registration: ${antes} → ${nuevaRegistration}`);
  }

  if (Object.keys(data).length > 0) {
    await prisma.movement.update({ where: { id: args.movementId }, data });
  }

  await prisma.eventLog.create({
    data: {
      visitId,
      movementId: args.movementId,
      userId: auth.userId,
      action: "Plan corregido por agente",
      details: desc.join(", "),
    },
  });

  eventBus.emit({
    type: "flight_updated",
    flightId: visitId,
    userId: auth.userId,
    userName: auth.userName || undefined,
    detail: "Plan corregido por agente",
    timestamp: new Date().toISOString(),
  });

  const result: FixPlanResult = { movementId: args.movementId, visitId, aplicado };
  if (Object.keys(dual).length > 0) result.dual = dual;
  return result;
}

// ===========================================================================
// import_daily — daily PDF por tool, dry-run por defecto (T7 + d2.4).
// ===========================================================================
export async function importDaily(
  args: ImportDailyArgs,
  auth: AgentAuth
): Promise<ImportDailyResult> {
  if (!args || typeof args.pdf_base64 !== "string" || args.pdf_base64.trim() === "") {
    throw new Error("El argumento `pdf_base64` es obligatorio (el PDF del daily en base64).");
  }
  validarConfirmar(args.confirmar);

  const buffer = Buffer.from(args.pdf_base64, "base64");
  if (buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new Error("El contenido no es un PDF (no empieza por %PDF). Revisa el archivo.");
  }
  // Mismo límite de tamaño que el REST (uploadValidation "pdf").
  const val = validateUpload({ name: "daily.pdf", type: "application/pdf", size: buffer.length }, "pdf");
  if (!val.ok) throw new Error(val.message);

  const inputs = [{ name: "daily.pdf", buffer }];

  // CONFIRM (confirmar === true estricto): re-parsea y persiste por el PUT
  // atribuido al user del token, SIN cancelIds JAMÁS; toCancel recalculado.
  if (args.confirmar === true) {
    const parsed = await parseBuffers(inputs);
    const persisted = await persistImport({
      date: parsed.date,
      flights: parsed.flights,
      userId: auth.userId,
      userName: auth.userName,
    });
    const toCancel = await computeToCancel(parsed.date, parsed.flights);
    return {
      date: parsed.date,
      creados: persisted.created,
      actualizados: persisted.updated,
      noShows: persisted.noShows,
      total: persisted.total,
      toCancel,
    };
  }

  // DRY-RUN (default): preview con toCancel enriquecido, CERO escrituras.
  const preview = await previewImport(inputs);
  return {
    date: preview.date,
    flights: preview.flights,
    errors: preview.errors,
    warnings: preview.warnings,
    toCancel: preview.toCancel,
  };
}
