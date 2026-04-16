import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const statements = [
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

  `CREATE TABLE IF NOT EXISTS "DaySheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DaySheet_date_key" ON "DaySheet"("date")`,

  `CREATE TABLE IF NOT EXISTS "Flight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "daySheetId" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "registration" TEXT NOT NULL,
    "aircraftType" TEXT NOT NULL,
    "origin" TEXT,
    "eta" TEXT,
    "arrivalDate" TEXT,
    "destination" TEXT,
    "etd" TEXT,
    "departureDate" TEXT,
    "parking" TEXT,
    "tobt" TEXT,
    "state" TEXT NOT NULL DEFAULT 'EXPECTED',
    "crewArrival" INTEGER NOT NULL DEFAULT 0,
    "paxArrival" INTEGER NOT NULL DEFAULT 0,
    "crewDeparture" INTEGER NOT NULL DEFAULT 0,
    "paxDeparture" INTEGER NOT NULL DEFAULT 0,
    "paxArrBagsChecked" INTEGER NOT NULL DEFAULT 0,
    "paxArrBagsCabin" INTEGER NOT NULL DEFAULT 0,
    "paxArrBagsState" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "paxArrTransportType" TEXT NOT NULL DEFAULT 'UNDEFINED',
    "paxArrTransportState" TEXT NOT NULL DEFAULT 'PENDING',
    "paxArrState" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "paxDepBagsChecked" INTEGER NOT NULL DEFAULT 0,
    "paxDepBagsCabin" INTEGER NOT NULL DEFAULT 0,
    "paxDepBagsState" TEXT NOT NULL DEFAULT 'NOT_ARRIVED',
    "paxDepTransportType" TEXT NOT NULL DEFAULT 'UNDEFINED',
    "paxDepTransportState" TEXT NOT NULL DEFAULT 'PENDING',
    "paxDepState" TEXT NOT NULL DEFAULT 'NOT_ARRIVED',
    "crewArrLocation" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "crewDepLocation" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "fuelState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "fuelRequestedAt" TEXT,
    "fuelServedAt" TEXT,
    "toiletState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "toiletRequestedAt" TEXT,
    "toiletCompletedAt" TEXT,
    "crewArrivalReal" INTEGER,
    "crewDepartureReal" INTEGER,
    "paxArrivalReal" INTEGER,
    "paxDepartureReal" INTEGER,
    "linkedFlightId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flight_daySheetId_fkey" FOREIGN KEY ("daySheetId") REFERENCES "DaySheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Flight_daySheetId_idx" ON "Flight"("daySheetId")`,

  `CREATE TABLE IF NOT EXISTS "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customName" TEXT,
    "reference" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "origin" TEXT,
    "arrivedAt" TEXT,
    "deliveredAt" TEXT,
    "target" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Service_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Service_flightId_idx" ON "Service"("flightId")`,

  `CREATE TABLE IF NOT EXISTS "EventLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventLog_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "EventLog_flightId_idx" ON "EventLog"("flightId")`,
  `CREATE INDEX IF NOT EXISTS "EventLog_userId_idx" ON "EventLog"("userId")`,

  `CREATE TABLE IF NOT EXISTS "Passenger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "dateOfBirth" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "corrections" TEXT,
    "verified" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Passenger_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Passenger_flightId_idx" ON "Passenger"("flightId")`,

  `CREATE TABLE IF NOT EXISTS "CrewMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "dateOfBirth" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OTHER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrewMember_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "CrewMember_flightId_idx" ON "CrewMember"("flightId")`,

  `CREATE TABLE IF NOT EXISTS "LostItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'FOUND',
    "foundAt" TEXT,
    "claimedAt" TEXT,
    "deliveredAt" TEXT,
    "claimedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LostItem_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "LostItem_flightId_idx" ON "LostItem"("flightId")`,
];

async function main() {
  console.log("Connecting to Turso...");
  for (const sql of statements) {
    const tableName = sql.match(/"(\w+)"/)?.[1] || "index";
    try {
      await client.execute(sql);
      console.log(`  ✓ Created: ${tableName}`);
    } catch (err: any) {
      console.error(`  ✗ Error on ${tableName}: ${err.message}`);
    }
  }
  console.log("\nDone! Schema pushed to Turso.");
}

main();
