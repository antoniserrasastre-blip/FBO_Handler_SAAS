// /api/db/migrate — one-shot endpoint to materialise the V2 schema on Turso.
//
// The Dockerfile in this repo never runs `prisma db push`, so the production
// Turso DB was left with the legacy V1 tables (Flight + friends) from an old
// local seed. The V2 code writes to Visit/Movement/Aircraft/Operator/etc. —
// queries fail with "no such table" until those are materialised.
//
// Guarded by SETUP_SECRET (same env var as /api/setup). Excluded from
// next-auth middleware on the same matcher.
//
// Usage:
//   curl -X POST '<host>/api/db/migrate' -H 'x-setup-secret: <secret>'
//     → creates V2 tables IF NOT EXISTS. Returns 409 if legacy V1 tables
//       exist with incompatible FKs (Service.flightId etc.) — re-run with
//       ?reset=v1 to drop them.
//
//   curl -X POST '<host>/api/db/migrate?reset=v1' -H 'x-setup-secret: <secret>'
//     → DROPS legacy V1 tables (Flight, and V1 versions of Service/EventLog/
//       Passenger/CrewMember/LostItem). User table is preserved.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@libsql/client";

const V2_TABLES = [
  // User — preserved across migrations but ensured on fresh DBs
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'HANDLER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,

  // AgentToken — credencial MCP estática revocable (rol AGENT). Sprint 01
  // mcp-lectura (19-07-2026). Back-relation User.agentTokens ⇄ AgentToken.userId.
  `CREATE TABLE IF NOT EXISTS "AgentToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    CONSTRAINT "AgentToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AgentToken_tokenHash_key" ON "AgentToken"("tokenHash")`,

  // DaySheet — V2 version (opt-in day rows with notes + closed flag).
  // The old V1 DaySheet (no notes/closed) is dropped in V1_DROPS; recreated here.
  `CREATE TABLE IF NOT EXISTS "DaySheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "closed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DaySheet_date_key" ON "DaySheet"("date")`,
  `CREATE INDEX IF NOT EXISTS "DaySheet_date_idx" ON "DaySheet"("date")`,

  // Operator
  `CREATE TABLE IF NOT EXISTS "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icaoCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isStateAircraft" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Operator_icaoCode_key" ON "Operator"("icaoCode")`,

  // Aircraft
  `CREATE TABLE IF NOT EXISTS "Aircraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registration" TEXT NOT NULL,
    "aircraftType" TEXT,
    "currentOperatorId" TEXT,
    "baseAirport" TEXT,
    "mtowKg" INTEGER,
    "noiseChapter" TEXT,
    "cumulativeMarginEpndb" REAL,
    "paxCapacityCertified" INTEGER,
    "aircraftDataConfirmed" INTEGER NOT NULL DEFAULT 0,
    "aircraftDataConfirmedById" TEXT,
    "aircraftDataConfirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Aircraft_currentOperatorId_fkey" FOREIGN KEY ("currentOperatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Aircraft_registration_key" ON "Aircraft"("registration")`,
  `CREATE INDEX IF NOT EXISTS "Aircraft_currentOperatorId_idx" ON "Aircraft"("currentOperatorId")`,

  // Visit
  `CREATE TABLE IF NOT EXISTS "Visit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aircraftId" TEXT NOT NULL,
    "operatorId" TEXT,
    "palmaDay" DATETIME NOT NULL,
    "type" TEXT,
    "arrivalDate" DATETIME,
    "departureDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Visit_aircraftId_fkey" FOREIGN KEY ("aircraftId") REFERENCES "Aircraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Visit_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Visit_aircraftId_idx" ON "Visit"("aircraftId")`,
  `CREATE INDEX IF NOT EXISTS "Visit_palmaDay_idx" ON "Visit"("palmaDay")`,
  `CREATE INDEX IF NOT EXISTS "Visit_operatorId_idx" ON "Visit"("operatorId")`,
  // 18-07-2026: índice NO único — varias visitas por avión+día son legales
  // (dobles rotaciones). El unique antiguo se elimina en el paso de abajo.
  `CREATE INDEX IF NOT EXISTS "Visit_aircraftId_palmaDay_idx" ON "Visit"("aircraftId","palmaDay")`,

  // Movement
  `CREATE TABLE IF NOT EXISTS "Movement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "origin" TEXT,
    "destination" TEXT,
    "scheduledDate" DATETIME NOT NULL,
    "eta" TEXT,
    "etd" TEXT,
    "ata" TEXT,
    "atd" TEXT,
    "parking" TEXT,
    "tobt" TEXT,
    "state" TEXT NOT NULL DEFAULT 'EXPECTED',
    "paxCount" INTEGER NOT NULL DEFAULT 0,
    "paxCountReal" INTEGER,
    "crewCount" INTEGER NOT NULL DEFAULT 0,
    "crewCountReal" INTEGER,
    "paxState" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "bagsState" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "bagsChecked" INTEGER NOT NULL DEFAULT 0,
    "bagsCabin" INTEGER NOT NULL DEFAULT 0,
    "transportType" TEXT NOT NULL DEFAULT 'UNDEFINED',
    "transportState" TEXT NOT NULL DEFAULT 'PENDING',
    "crewLocation" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "rqstNumber" TEXT,
    "flightCategory" TEXT NOT NULL DEFAULT 'COMMERCIAL',
    "modifiedFlag" INTEGER NOT NULL DEFAULT 0,
    "petCount" INTEGER NOT NULL DEFAULT 0,
    "commercialFlag" INTEGER NOT NULL DEFAULT 0,
    "fuelState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "fuelRequestedAt" TEXT,
    "fuelServedAt" TEXT,
    "toiletState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "toiletRequestedAt" TEXT,
    "toiletCompletedAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Movement_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Movement_visitId_direction_key" ON "Movement"("visitId","direction")`,
  `CREATE INDEX IF NOT EXISTS "Movement_rqstNumber_idx" ON "Movement"("rqstNumber")`,
  `CREATE INDEX IF NOT EXISTS "Movement_scheduledDate_idx" ON "Movement"("scheduledDate")`,

  // Service (V2: FK to Visit)
  `CREATE TABLE IF NOT EXISTS "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'DEPARTURE',
    "customName" TEXT,
    "reference" TEXT,
    "target" TEXT,
    "origin" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rawDescription" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "arrivedAt" TEXT,
    "deliveredAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Service_visitId_idx" ON "Service"("visitId")`,

  // Passenger (V2: FK to Movement)
  `CREATE TABLE IF NOT EXISTS "Passenger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movementId" TEXT NOT NULL,
    "givenNames" TEXT,
    "surname" TEXT,
    "fullNameHash" TEXT,
    "passportEncrypted" TEXT,
    "passportHash" TEXT,
    "passportType" TEXT,
    "passportCountry" TEXT,
    "passportExpiry" TEXT,
    "dobEncrypted" TEXT,
    "gender" TEXT,
    "nationality" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "verified" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "corrections" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Passenger_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Passenger_movementId_idx" ON "Passenger"("movementId")`,
  `CREATE INDEX IF NOT EXISTS "Passenger_movementId_passportHash_idx" ON "Passenger"("movementId","passportHash")`,

  // CrewMember (V2: FK to Operator)
  `CREATE TABLE IF NOT EXISTS "CrewMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "givenNames" TEXT,
    "surname" TEXT,
    "fullName" TEXT NOT NULL,
    "passportEncrypted" TEXT,
    "passportHash" TEXT,
    "passportType" TEXT,
    "passportCountry" TEXT,
    "passportExpiry" TEXT,
    "dobEncrypted" TEXT,
    "gender" TEXT,
    "nationality" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OTHER',
    "active" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrewMember_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CrewMember_operatorId_passportHash_key" ON "CrewMember"("operatorId","passportHash")`,
  `CREATE INDEX IF NOT EXISTS "CrewMember_operatorId_idx" ON "CrewMember"("operatorId")`,

  // CrewAssignment (V2: compound PK on Movement + CrewMember)
  `CREATE TABLE IF NOT EXISTS "CrewAssignment" (
    "movementId" TEXT NOT NULL,
    "crewMemberId" TEXT NOT NULL,
    "roleOnFlight" TEXT NOT NULL DEFAULT 'OTHER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("movementId","crewMemberId"),
    CONSTRAINT "CrewAssignment_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrewAssignment_crewMemberId_fkey" FOREIGN KEY ("crewMemberId") REFERENCES "CrewMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "CrewAssignment_crewMemberId_idx" ON "CrewAssignment"("crewMemberId")`,

  // LostItem (V2: FK to Visit)
  `CREATE TABLE IF NOT EXISTS "LostItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'FOUND',
    "foundAt" TEXT,
    "claimedAt" TEXT,
    "deliveredAt" TEXT,
    "claimedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LostItem_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "LostItem_visitId_idx" ON "LostItem"("visitId")`,

  // EventLog (V2: nullable visitId/movementId/userId)
  `CREATE TABLE IF NOT EXISTS "EventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT,
    "movementId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventLog_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventLog_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "Movement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "EventLog_visitId_idx" ON "EventLog"("visitId")`,
  `CREATE INDEX IF NOT EXISTS "EventLog_movementId_idx" ON "EventLog"("movementId")`,
  `CREATE INDEX IF NOT EXISTS "EventLog_userId_idx" ON "EventLog"("userId")`,
];

// ---------------------------------------------------------------------------
// Idempotent ALTER TABLE statements for DBs that were created by an earlier
// version of this script and are missing the new columns.
// "duplicate column name" / "already exists" errors are silently swallowed.
// ---------------------------------------------------------------------------
const V2_ALTERS = [
  // DaySheet — notes and closed added in V2 (V1 had neither)
  `ALTER TABLE "DaySheet" ADD COLUMN "notes" TEXT`,
  `ALTER TABLE "DaySheet" ADD COLUMN "closed" INTEGER NOT NULL DEFAULT 0`,

  // Operator — AENA state-aircraft exemption flag
  `ALTER TABLE "Operator" ADD COLUMN "isStateAircraft" INTEGER NOT NULL DEFAULT 0`,

  // Aircraft — AENA technical data fields
  `ALTER TABLE "Aircraft" ADD COLUMN "mtowKg" INTEGER`,
  `ALTER TABLE "Aircraft" ADD COLUMN "noiseChapter" TEXT`,
  `ALTER TABLE "Aircraft" ADD COLUMN "cumulativeMarginEpndb" REAL`,
  `ALTER TABLE "Aircraft" ADD COLUMN "paxCapacityCertified" INTEGER`,
  `ALTER TABLE "Aircraft" ADD COLUMN "aircraftDataConfirmed" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "Aircraft" ADD COLUMN "aircraftDataConfirmedById" TEXT`,
  `ALTER TABLE "Aircraft" ADD COLUMN "aircraftDataConfirmedAt" DATETIME`,

  // Movement — actual time fields + commercial flag
  `ALTER TABLE "Movement" ADD COLUMN "ata" TEXT`,
  `ALTER TABLE "Movement" ADD COLUMN "atd" TEXT`,
  `ALTER TABLE "Movement" ADD COLUMN "commercialFlag" INTEGER NOT NULL DEFAULT 0`,
];

// Tables that exist in V1 with incompatible FKs (point to Flight, which no
// longer exists in the V2 code). DROP order respects FK dependencies.
const V1_DROPS = [
  `DROP TABLE IF EXISTS "EventLog"`,
  `DROP TABLE IF EXISTS "LostItem"`,
  `DROP TABLE IF EXISTS "CrewMember"`,
  `DROP TABLE IF EXISTS "Passenger"`,
  `DROP TABLE IF EXISTS "Service"`,
  `DROP TABLE IF EXISTS "Flight"`,
  `DROP TABLE IF EXISTS "DaySheet"`,
];

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function runMigration(req: NextRequest) {
  const expectedSecret = process.env.SETUP_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "SETUP_SECRET not configured; refusing to run /api/db/migrate" },
      { status: 500 },
    );
  }
  // Accept secret via header (preferred) or query param (mobile-friendly).
  const provided =
    req.headers.get("x-setup-secret") || req.nextUrl.searchParams.get("secret");
  if (provided !== expectedSecret) return unauthorized();

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    return NextResponse.json(
      { error: "TURSO_DATABASE_URL not set — refusing to migrate non-Turso DB" },
      { status: 500 },
    );
  }

  const reset = req.nextUrl.searchParams.get("reset") === "v1";
  const client = createClient({ url, authToken });
  const log: string[] = [];

  try {
    if (reset) {
      log.push("== DROP V1 tables ==");
      for (const sql of V1_DROPS) {
        await client.execute(sql);
        log.push(`  ✓ ${sql}`);
      }
    }

    log.push("== CREATE V2 tables ==");
    for (const sql of V2_TABLES) {
      const name = sql.match(/"(\w+)"/)?.[1] || "?";
      try {
        await client.execute(sql);
        log.push(`  ✓ ${sql.startsWith("CREATE UNIQUE INDEX") ? "uniq idx" : sql.startsWith("CREATE INDEX") ? "idx" : "table"}: ${name}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.push(`  ✗ ${name}: ${msg}`);
        return NextResponse.json(
          {
            error: `Migration failed on ${name}: ${msg}. If this is a legacy V1 table with FKs to Flight, re-run with ?reset=v1 to drop and recreate.`,
            log,
          },
          { status: 409 },
        );
      }
    }

    log.push("== ALTER existing tables (idempotent column additions) ==");
    for (const sql of V2_ALTERS) {
      try {
        await client.execute(sql);
        log.push(`  ✓ ${sql.slice(0, 80)}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("duplicate column name") || msg.includes("already exists")) {
          log.push(`  ⊘ skipped (already exists): ${sql.slice(0, 80)}`);
        } else {
          log.push(`  ✗ ALTER failed: ${msg}`);
          return NextResponse.json({ error: `ALTER failed: ${msg}`, log }, { status: 500 });
        }
      }
    }

    // Visit rotation index — 18-07-2026: el UNIQUE (aircraftId, palmaDay) se
    // ELIMINA porque las dobles rotaciones del mismo día son legales (cada
    // rotación su propia Visit; identidad por callsign + hora en upsertVisit).
    // Se sustituye por un índice normal para conservar el lookup.
    log.push("== Visit rotation index (drop unique, keep lookup) ==");
    try {
      await client.execute(`DROP INDEX IF EXISTS "Visit_aircraftId_palmaDay_key"`);
      log.push("  ✓ dropped Visit_aircraftId_palmaDay_key (unique)");
      await client.execute(
        `CREATE INDEX IF NOT EXISTS "Visit_aircraftId_palmaDay_idx" ON "Visit"("aircraftId","palmaDay")`
      );
      log.push("  ✓ Visit_aircraftId_palmaDay_idx");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.push(`  ✗ Visit rotation index failed: ${msg}`);
      return NextResponse.json(
        { error: `Visit rotation index failed: ${msg}`, log },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, reset, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, log }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runMigration(req);
}

// GET variant so the endpoint is callable from a plain Safari tab on mobile
// (no curl, no Shortcuts). Same auth + same query params.
export async function GET(req: NextRequest) {
  return runMigration(req);
}
