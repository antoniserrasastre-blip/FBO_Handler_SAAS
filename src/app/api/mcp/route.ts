import { NextRequest } from "next/server";
import { verifyAgentToken } from "@/lib/mcp/auth";
import { getDay, findFlight, getEventLog } from "@/lib/mcp/tools";

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
  params: JsonRpcRequest["params"]
): Promise<Response> {
  const name = params?.name;
  const args = params?.arguments ?? {};
  try {
    let payload: unknown;
    switch (name) {
      case "get_day":
        payload = await getDay(args as { fecha?: string });
        break;
      case "find_flight":
        payload = await findFlight(args as { texto: string; fecha?: string });
        break;
      case "get_event_log":
        payload = await getEventLog(args as { fecha?: string; usuario?: string });
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

async function dispatch(msg: JsonRpcRequest): Promise<Response> {
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
      return handleToolCall(id, msg.params);
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

  return dispatch(body);
}
