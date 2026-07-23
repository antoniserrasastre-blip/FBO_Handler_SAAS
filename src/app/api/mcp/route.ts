import { NextRequest } from "next/server";
import { verifyAgentToken } from "@/lib/mcp/auth";
import { getDay, findFlight, getEventLog } from "@/lib/mcp/tools";
import { updateMovements, logIncident } from "@/lib/mcp/tools-escritura";
import {
  cancelMovement,
  uncancelMovement,
  createFlight,
  fixPlan,
  importDaily,
} from "@/lib/mcp/tools-ciclo";
import type {
  AgentAuth,
  CancelMovementArgs,
  CreateFlightArgs,
  FixPlanArgs,
  ImportDailyArgs,
  LogIncidentArgs,
  UncancelMovementArgs,
  UpdateMovementsArgs,
} from "@/lib/mcp/contract";

// Superficie MCP del agente (Streamable HTTP stateless, JSON-RPC 2.0).
// Contrato pineado: src/lib/mcp/contract.ts
//
// Transporte: dispatcher JSON-RPC propio y mínimo sobre el par Web
// Request/Response del App Router. Elegido frente a @modelcontextprotocol/sdk
// (StreamableHTTPServerTransport habla Node req/res, no Web Request/Response —
// fricción real en Next 15) y frente a mcp-handler (arrastra store de sesión).
// Stateless por naturaleza → funciona idéntico en sirvici self-host y en Vercel,
// sin sesiones ni Redis. El cliente real es Claude Code, que acepta la respuesta
// application/json de un único request/response de Streamable HTTP.

// Prisma necesita el runtime Node (relevante en Vercel).
export const runtime = "nodejs";

const PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "get_day",
    description:
      "Devuelve todas las rotaciones (Visits) del día civil de Palma con sus movimientos (callsign, matrícula, operador, eta/etd/ata/atd en Zulu, estado, parking, pax/crew). fecha opcional 'DD-MM-YYYY' o 'YYYY-MM-DD'; sin fecha = hoy.",
    inputSchema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Día civil de Palma: 'DD-MM-YYYY' o 'YYYY-MM-DD'. Vacío = hoy." },
        incluirCancelados: { type: "boolean", description: "true = incluye también las piernas CANCELLED (marcadas). Ausente/false = solo las vivas." },
      },
      required: [],
    },
  },
  {
    name: "find_flight",
    description:
      "Resuelve texto libre (callsign, matrícula exacta/parcial y/u hora 'HH:MM') a los vuelos candidatos del día. Ancla = callsign + hora; matrícula ambigua devuelve TODOS los candidatos, nunca elige.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Callsign, matrícula y/u hora 'HH:MM' en cualquier orden." },
        fecha: { type: "string", description: "Día civil de Palma: 'DD-MM-YYYY' o 'YYYY-MM-DD'. Vacío = hoy." },
      },
      required: ["texto"],
    },
  },
  {
    name: "get_event_log",
    description:
      "Entradas del EventLog cuyo timestamp cae en el día pedido, orden cronológico, con filtro opcional por usuario (nombre exacto). Devuelve action, details, usuario, timestamp ISO y callsign de la visita si la hay.",
    inputSchema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Día civil de Palma: 'DD-MM-YYYY' o 'YYYY-MM-DD'. Vacío = hoy." },
        usuario: { type: "string", description: "Filtra por User.name exacto." },
      },
      required: [],
    },
  },
  {
    name: "update_movements",
    description:
      "Escribe en lote sobre movimientos (Movements) del día: horas reales (ata/atd/tobt dictadas en local o Zulu, se guardan en Zulu con confirmación dual), pax/bags reales, parking, estados de servicio, estado del vuelo. Cada fila es atómica (un campo malo rechaza sólo esa fila) y el lote sigue con las demás; cada escritura deja EventLog. Campos de PLAN (eta/etd/callsign) NO son editables.",
    inputSchema: {
      type: "object",
      properties: {
        cambios: {
          type: "array",
          description: "Una entrada por movimiento a actualizar.",
          items: {
            type: "object",
            properties: {
              movementId: { type: "string", description: "id del Movement (de get_day / find_flight)." },
              campos: {
                type: "object",
                description:
                  "Mapa campo→valor. Horas ata/atd/tobt como 'HH:MM' (local por defecto), 'HH:MMZ' o { hora, tz }; null limpia la hora.",
              },
            },
            required: ["movementId", "campos"],
          },
        },
      },
      required: ["cambios"],
    },
  },
  {
    name: "log_incident",
    description:
      "Registra una incidencia del turno (append-only, persiste en BD con autor y timestamp). 'vuelo' opcional asocia la incidencia a un vuelo por visitId exacto o texto libre (callsign + hora); si es ambiguo devuelve los candidatos y no crea nada. Deja también una entrada en el EventLog.",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Descripción de la incidencia." },
        vuelo: { type: "string", description: "Opcional: visitId exacto o texto libre (callsign + hora)." },
      },
      required: ["texto"],
    },
  },
  {
    name: "cancel_movement",
    description:
      "Cancela un movimiento (soft-cancel: flightCategory → CANCELLED) guardando el estado previo en el EventLog para poder deshacerlo con uncancel_movement. GUARDIA DE EVIDENCIA: si el movimiento tiene ATA o ATD, exige confirmar:true explícito; sin él devuelve error con los datos del vuelo para que verifiques contra el eSIA. motivo obligatorio (queda en la auditoría).",
    inputSchema: {
      type: "object",
      properties: {
        movementId: { type: "string", description: "id del Movement (de get_day / find_flight / import_daily.toCancel)." },
        motivo: { type: "string", description: "Por qué se cancela (p. ej. 'CNX en eSIA'). Queda en el EventLog." },
        confirmar: { type: "boolean", description: "Obligatorio true si el movimiento tiene ATA/ATD (ya operó)." },
      },
      required: ["movementId", "motivo"],
    },
  },
  {
    name: "uncancel_movement",
    description:
      "Deshace un cancel hecho por el agente: restaura el flightCategory previo EXACTO desde el EventLog del cancel. Sólo funciona sobre movimientos cancelados con cancel_movement (de otros cancels no hay previo fiable).",
    inputSchema: {
      type: "object",
      properties: {
        movementId: { type: "string", description: "id del Movement cancelado por el agente." },
      },
      required: ["movementId"],
    },
  },
  {
    name: "create_flight",
    description:
      "Crea una rotación fuera del daily (Visit + piernas) con su pierna de llegada: matrícula + callsign + al menos una pierna (llegada {hora, origen?} y/o salida {hora, destino?}). Horas en local por defecto, 'HH:MMZ' o {hora, tz}; se guardan en Zulu con confirmación dual. Identidad = callsign + hora: una 2ª rotación del mismo avión y día crea Visit PROPIA (no pisa la 1ª); si la rotación ya existe, añade las piernas que falten.",
    inputSchema: {
      type: "object",
      properties: {
        registration: { type: "string", description: "Matrícula (p. ej. '9H-YOU')." },
        callsign: { type: "string", description: "Callsign de la rotación (ambas piernas)." },
        fecha: { type: "string", description: "Día civil de Palma 'DD-MM-YYYY' o 'YYYY-MM-DD'. Vacío = hoy." },
        llegada: {
          type: "object",
          description: "Pierna de llegada: { hora (obligatoria), origen? }.",
          properties: {
            hora: { description: "'HH:MM' (local por defecto), 'HH:MMZ' o { hora, tz }." },
            origen: { type: "string", description: "Aeropuerto de origen (opcional)." },
          },
          required: ["hora"],
        },
        salida: {
          type: "object",
          description: "Pierna de salida: { hora (obligatoria), destino? }.",
          properties: {
            hora: { description: "'HH:MM' (local por defecto), 'HH:MMZ' o { hora, tz }." },
            destino: { type: "string", description: "Aeropuerto de destino (opcional)." },
          },
          required: ["hora"],
        },
        operador: { type: "string", description: "Opcional: Operator EXISTENTE por código ICAO o nombre. Omitir para resolverlo del callsign." },
      },
      required: ["registration", "callsign"],
    },
  },
  {
    name: "fix_plan",
    description:
      "Corrige campos de PLAN de un movimiento sin re-importar el PDF: callsign, registration (re-apunta la rotación ENTERA a otra matrícula), eta/etd, origin/destination, scheduledDate. NO toca campos operativos (esos van por update_movements) ni la identidad de la Visit. Horas en local por defecto o Zulu, confirmación dual.",
    inputSchema: {
      type: "object",
      properties: {
        movementId: { type: "string", description: "id del Movement a corregir." },
        campos: {
          type: "object",
          description:
            "Mapa campo→valor. Sólo campos de plan: callsign, registration, eta (sólo ARRIVAL), etd (sólo DEPARTURE), origin (sólo ARRIVAL), destination (sólo DEPARTURE), scheduledDate. null limpia eta/etd/origin/destination.",
        },
      },
      required: ["movementId", "campos"],
    },
  },
  {
    name: "import_daily",
    description:
      "Importa el daily de Cybermax. Pasa el PDF por `upload_id` (recomendado: súbelo antes a POST /api/mcp/upload y usa el id que devuelve) O por `pdf_base64` — uno de los dos, nunca ambos. DRY-RUN POR DEFECTO: devuelve el preview (vuelos parseados, avisos y toCancel propuestos) sin escribir NADA en BD ni EventLog. Para persistir, repite la llamada con confirmar:true. Los toCancel NUNCA se aplican en bloque: confírmalos uno a uno contra el eSIA con cancel_movement (el preview incluye sus movementIds).",
    inputSchema: {
      type: "object",
      properties: {
        upload_id: { type: "string", description: "id devuelto por POST /api/mcp/upload (evita el base64 inline). XOR con pdf_base64." },
        pdf_base64: { type: "string", description: "El PDF del daily codificado en base64. XOR con upload_id." },
        confirmar: { type: "boolean", description: "true = persistir (altas y cambios; toCancel NO se aplica). Ausente/false = sólo preview." },
      },
      required: [],
    },
  },
];

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    protocolVersion?: string;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function rpcResult(id: string | number | null, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  status = 200
): Response {
  return jsonResponse({ jsonrpc: "2.0", id, error: { code, message } }, status);
}

async function handleToolCall(
  id: string | number | null,
  params: JsonRpcRequest["params"],
  auth: AgentAuth
): Promise<Response> {
  const name = params?.name;
  const args = params?.arguments ?? {};
  try {
    let payload: unknown;
    switch (name) {
      case "get_day":
        payload = await getDay(args as { fecha?: string; incluirCancelados?: boolean });
        break;
      case "find_flight":
        payload = await findFlight(args as { texto: string; fecha?: string });
        break;
      case "get_event_log":
        payload = await getEventLog(args as { fecha?: string; usuario?: string });
        break;
      case "update_movements":
        payload = await updateMovements(args as unknown as UpdateMovementsArgs, auth);
        break;
      case "log_incident":
        payload = await logIncident(args as unknown as LogIncidentArgs, auth);
        break;
      case "cancel_movement":
        payload = await cancelMovement(args as unknown as CancelMovementArgs, auth);
        break;
      case "uncancel_movement":
        payload = await uncancelMovement(args as unknown as UncancelMovementArgs, auth);
        break;
      case "create_flight":
        payload = await createFlight(args as unknown as CreateFlightArgs, auth);
        break;
      case "fix_plan":
        payload = await fixPlan(args as unknown as FixPlanArgs, auth);
        break;
      case "import_daily":
        payload = await importDaily(args as unknown as ImportDailyArgs, auth);
        break;
      default:
        return rpcResult(id, {
          content: [{ type: "text", text: `Unknown tool: ${String(name)}` }],
          isError: true,
        });
    }
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify(payload) }],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return rpcResult(id, {
      content: [{ type: "text", text: JSON.stringify({ error: message }) }],
      isError: true,
    });
  }
}

async function dispatch(msg: JsonRpcRequest, auth: AgentAuth): Promise<Response> {
  const id = msg?.id ?? null;
  const method = msg?.method;

  // Notificaciones (sin respuesta): 202 sin cuerpo, per Streamable HTTP.
  if (typeof method === "string" && method.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: msg.params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "fbo-handler-mcp", version: "1.0.0" },
      });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call":
      return handleToolCall(id, msg.params, auth);
    default:
      return rpcError(id, -32601, `Method not found: ${String(method)}`);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  // Auth SIEMPRE antes de despachar cualquier método (incluido initialize).
  const auth = await verifyAgentToken(req.headers.get("authorization"));
  if (!auth) {
    return rpcError(null, -32001, "Unauthorized", 401);
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  return dispatch(body, auth);
}
