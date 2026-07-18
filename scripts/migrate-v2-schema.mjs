// Migration script: drops legacy V1 tables and creates V2 schema in Turso.
//
// Runs automatically on container startup (CMD in Dockerfile) so every deploy
// reconciles the live DB with the current Prisma schema. Idempotent: V1_DROPS
// are guarded by IF EXISTS, V2_TABLES use IF NOT EXISTS.
//
// Skips silently if TURSO_DATABASE_URL is not set (local SQLite dev).
// Can also be invoked standalone via:
//   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/migrate-v2-schema.mjs
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.log("[migrate] TURSO_DATABASE_URL not set — skipping (local dev mode)");
  process.exit(0);
}
if (!authToken) {
  console.error("[migrate] TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing");
  process.exit(1);
}

const client = createClient({ url, authToken });

const V1_DROPS = [
  `DROP TABLE IF EXISTS "EventLog"`,
  `DROP TABLE IF EXISTS "LostItem"`,
  `DROP TABLE IF EXISTS "CrewMember"`,
  `DROP TABLE IF EXISTS "Passenger"`,
  `DROP TABLE IF EXISTS "Service"`,
  `DROP TABLE IF EXISTS "Flight"`,
  `DROP TABLE IF EXISTS "DaySheet"`,
];

const V2_TABLES = [
  // User is preserved across migrations (never dropped). Ensure it exists here
  // in case this script runs on a fresh DB.
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

  // DaySheet — V2 version (opt-in day rows with notes + closed flag).
  // The old V1 DaySheet (no notes/closed) is dropped above in V1_DROPS;
  // we recreate it here with the correct V2 schema.
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

  `CREATE TABLE IF NOT EXISTS "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icaoCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isStateAircraft" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Operator_icaoCode_key" ON "Operator"("icaoCode")`,

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

  `CREATE TABLE IF NOT EXISTS "CustomServicePreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "defaultTarget" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "CustomServicePreset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CustomServicePreset_name_key" ON "CustomServicePreset"("name")`,
  `CREATE INDEX IF NOT EXISTS "CustomServicePreset_createdById_idx" ON "CustomServicePreset"("createdById")`,
];

// ---------------------------------------------------------------------------
// Idempotent ALTER TABLE statements for DBs that were created by an earlier
// version of this script and are missing the new columns. Each ALTER is
// wrapped in a try/catch: "duplicate column name" means the column already
// exists and can be safely ignored.  Any other error is re-thrown.
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

  // Movement — OpenSky live-tracking snapshot (last seen). All nullable.
  `ALTER TABLE "Movement" ADD COLUMN "liveIcao24" TEXT`,
  `ALTER TABLE "Movement" ADD COLUMN "livePhase" TEXT`,
  `ALTER TABLE "Movement" ADD COLUMN "liveLastSeenAt" DATETIME`,
  `ALTER TABLE "Movement" ADD COLUMN "liveOnGround" INTEGER`,
  `ALTER TABLE "Movement" ADD COLUMN "liveAltitudeM" REAL`,
  `ALTER TABLE "Movement" ADD COLUMN "liveVelocityMs" REAL`,

  // Visit — Rampa: el coordinador asigna el vuelo entero a un handler de turno.
  `ALTER TABLE "Visit" ADD COLUMN "assignedToId" TEXT`,
];

async function main() {
  console.log("→ Connecting to Turso...");
  const ping = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("Existing tables BEFORE:", ping.rows.map(r => r.name).join(", ") || "(none)");

  // V1_DROPS is DESTRUCTIVE: several dropped names (EventLog, Service, Passenger,
  // CrewMember, LostItem, DaySheet) are also V2 table names, so running it wipes
  // their rows. Gate it behind MIGRATE_RESET=v1 so normal deploys never destroy
  // data — they rely on CREATE TABLE IF NOT EXISTS + V2_ALTERS (non-destructive).
  if (process.env.MIGRATE_RESET === "v1") {
    console.log("\n→ MIGRATE_RESET=v1 → dropping legacy V1 tables (User preserved)...");
    for (const sql of V1_DROPS) {
      await client.execute(sql);
      console.log("  ✓", sql);
    }
  } else {
    console.log("\n→ Skipping V1 drops (set MIGRATE_RESET=v1 to force a destructive V1→V2 reset).");
  }

  console.log("\n→ Creating V2 tables...");
  for (const sql of V2_TABLES) {
    const name = sql.match(/"(\w+)"/)?.[1] || "?";
    const kind = sql.startsWith("CREATE UNIQUE INDEX") ? "uniq idx" : sql.startsWith("CREATE INDEX") ? "idx" : "table";
    try {
      await client.execute(sql);
      console.log(`  ✓ ${kind}: ${name}`);
    } catch (e) {
      console.error(`  ✗ ${kind}: ${name} — ${e.message}`);
      throw e;
    }
  }

  console.log("\n→ Applying idempotent column additions...");
  for (const sql of V2_ALTERS) {
    try {
      await client.execute(sql);
      console.log(`  ✓ ${sql.slice(0, 80)}`);
    } catch (e) {
      if (e.message?.includes("duplicate column name") || e.message?.includes("already exists")) {
        console.log(`  ⊘ skipped (already exists): ${sql.slice(0, 80)}`);
      } else {
        console.error(`  ✗ ALTER failed: ${e.message}`);
        throw e;
      }
    }
  }

  // Visit rotation index — 18-07-2026: el UNIQUE (aircraftId, palmaDay) se
  // ELIMINA porque las dobles rotaciones del mismo día son legales (cada
  // rotación su propia Visit; identidad por callsign + hora en upsertVisit).
  // Se sustituye por un índice normal para conservar el lookup.
  console.log("\n→ Visit rotation index (drop unique, keep lookup)...");
  try {
    await client.execute(`DROP INDEX IF EXISTS "Visit_aircraftId_palmaDay_key"`);
    console.log("  ✓ dropped Visit_aircraftId_palmaDay_key (unique)");
    await client.execute(
      `CREATE INDEX IF NOT EXISTS "Visit_aircraftId_palmaDay_idx" ON "Visit"("aircraftId","palmaDay")`
    );
    console.log("  ✓ Visit_aircraftId_palmaDay_idx");
  } catch (e) {
    console.error(`  ✗ Visit rotation index failed: ${e.message}`);
    throw e;
  }

  const after = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("\nExisting tables AFTER:", after.rows.map(r => r.name).join(", "));
  console.log("\n✅ Migration complete.");
}

main().catch((e) => {
  console.error("✗ FATAL:", e);
  process.exit(1);
});
