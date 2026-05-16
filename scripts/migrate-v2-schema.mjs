// One-shot migration script: drops legacy V1 tables and creates V2 schema in
// Turso. Run with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in env.
import { createClient } from "/home/user/FBO_Handler_SAAS/node_modules/@libsql/client/node.js";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN");
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
  `CREATE TABLE IF NOT EXISTS "Operator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "icaoCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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
];

async function main() {
  console.log("→ Connecting to Turso...");
  const ping = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("Existing tables BEFORE:", ping.rows.map(r => r.name).join(", ") || "(none)");

  console.log("\n→ Dropping legacy V1 tables (User preserved)...");
  for (const sql of V1_DROPS) {
    await client.execute(sql);
    console.log("  ✓", sql);
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

  const after = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log("\nExisting tables AFTER:", after.rows.map(r => r.name).join(", "));
  console.log("\n✅ Migration complete.");
}

main().catch((e) => {
  console.error("✗ FATAL:", e);
  process.exit(1);
});
