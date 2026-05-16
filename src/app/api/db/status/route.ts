// GET /api/db/status?secret=… — diagnostico de DB (read-only).
//
// Abrible directo en el navegador. Devuelve estado del esquema:
//   - si TURSO_DATABASE_URL esta seteada
//   - lista de tablas existentes
//   - columnas de cada tabla
//   - si las tablas V2 esperadas estan presentes
//
// Sin datos sensibles, solo metadata. Igualmente lo protejo con SETUP_SECRET
// para evitar exponer detalles del schema al publico.
//
// Usage:
//   https://<host>/api/db/status?secret=<SETUP_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

const EXPECTED_V2_TABLES = [
  "User",
  "Operator",
  "Aircraft",
  "Visit",
  "Movement",
  "Service",
  "Passenger",
  "CrewMember",
  "CrewAssignment",
  "LostItem",
  "EventLog",
];

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.SETUP_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "SETUP_SECRET not configured on the server" },
      { status: 500 },
    );
  }
  const provided = req.nextUrl.searchParams.get("secret");
  if (provided !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    return NextResponse.json({
      tursoConfigured: false,
      message: "TURSO_DATABASE_URL not set — app would be using local SQLite",
    });
  }

  try {
    const client = createClient({ url, authToken });
    const tablesRes = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' ORDER BY name",
    );
    const tables = tablesRes.rows.map((r) => String(r.name));

    const schemas: Record<string, string[]> = {};
    for (const t of tables) {
      const cols = await client.execute(`PRAGMA table_info("${t}")`);
      schemas[t] = cols.rows.map((r) => `${r.name}:${r.type}`);
    }

    const missingV2 = EXPECTED_V2_TABLES.filter((t) => !tables.includes(t));
    const unexpectedLegacy = ["Flight", "DaySheet"].filter((t) => tables.includes(t));

    return NextResponse.json({
      tursoConfigured: true,
      url: url.replace(/\?.*$/, "") + " (token redacted)",
      tables,
      schemas,
      diagnosis: {
        missingV2Tables: missingV2,
        unexpectedLegacyV1Tables: unexpectedLegacy,
        looksHealthy: missingV2.length === 0 && unexpectedLegacy.length === 0,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
