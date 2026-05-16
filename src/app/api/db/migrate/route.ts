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
  // Operator
  `CREATE TABLE IF NOT EXISTS "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icaoCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.SETUP_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "SETUP_SECRET not configured; refusing to run /api/db/migrate" },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-setup-secret");
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
        // Surface the first conflict so the user knows to pass ?reset=v1.
        return NextResponse.json(
          {
            error: `Migration failed on ${name}: ${msg}. If this is a legacy V1 table with FKs to Flight, re-run with ?reset=v1 to drop and recreate.`,
            log,
          },
          { status: 409 },
        );
      }
    }

    return NextResponse.json({ success: true, reset, log });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, log }, { status: 500 });
  }
}
