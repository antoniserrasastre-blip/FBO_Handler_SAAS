import { createClient } from "@libsql/client";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN!;

// ── 1. Create tables using raw SQL ──────────────────────────────
const libsql = createClient({ url, authToken });

const schemaStatements = [
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
    "origin" TEXT, "eta" TEXT, "arrivalDate" TEXT,
    "destination" TEXT, "etd" TEXT, "departureDate" TEXT,
    "parking" TEXT, "tobt" TEXT,
    "state" TEXT NOT NULL DEFAULT 'EXPECTED',
    "crewArrival" INTEGER NOT NULL DEFAULT 0,
    "paxArrival" INTEGER NOT NULL DEFAULT 0,
    "crewDeparture" INTEGER NOT NULL DEFAULT 0,
    "paxDeparture" INTEGER NOT NULL DEFAULT 0,
    "paxArrBagsChecked" INTEGER NOT NULL DEFAULT 0,
    "paxArrBagsCabin" INTEGER NOT NULL DEFAULT 0,
    "paxArrBagsState" TEXT NOT NULL DEFAULT 'PENDING',
    "paxArrTransportType" TEXT NOT NULL DEFAULT 'UNDEFINED',
    "paxArrTransportState" TEXT NOT NULL DEFAULT 'PENDING',
    "paxArrState" TEXT NOT NULL DEFAULT 'NOT_ARRIVED',
    "paxDepBagsChecked" INTEGER NOT NULL DEFAULT 0,
    "paxDepBagsCabin" INTEGER NOT NULL DEFAULT 0,
    "paxDepBagsState" TEXT NOT NULL DEFAULT 'PENDING',
    "paxDepTransportType" TEXT NOT NULL DEFAULT 'UNDEFINED',
    "paxDepTransportState" TEXT NOT NULL DEFAULT 'PENDING',
    "paxDepState" TEXT NOT NULL DEFAULT 'NOT_ARRIVED',
    "crewArrLocation" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "crewArrFilterCrossings" INTEGER NOT NULL DEFAULT 0,
    "crewDepLocation" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT',
    "crewDepFilterCrossings" INTEGER NOT NULL DEFAULT 0,
    "fuelState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "fuelRequestedAt" TEXT, "fuelServedAt" TEXT,
    "toiletState" TEXT NOT NULL DEFAULT 'PENDING',
    "toiletCompletedAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Flight_daySheetId_fkey" FOREIGN KEY ("daySheetId") REFERENCES "DaySheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Flight_daySheetId_idx" ON "Flight"("daySheetId")`,
  `CREATE TABLE IF NOT EXISTS "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "flightId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "customName" TEXT, "reference" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "origin" TEXT, "arrivedAt" TEXT, "deliveredAt" TEXT,
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
];

// ── 2. Seed data using Prisma ───────────────────────────────────
async function main() {
  // Step 1: Push schema
  console.log("1/2 Creating tables in Turso...");
  for (const sql of schemaStatements) {
    const name = sql.match(/"(\w+)"/)?.[1] || "?";
    await libsql.execute(sql);
    console.log(`  ✓ ${name}`);
  }

  // Step 2: Seed data via Prisma
  console.log("\n2/2 Seeding data...");
  const adapter = new PrismaLibSql({ url, authToken });
  const prisma = new PrismaClient({ adapter });

  const adminPassword = await bcrypt.hash("admin123", 10);
  const handlerPassword = await bcrypt.hash("handler123", 10);
  const viewerPassword = await bcrypt.hash("viewer123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@mallorcair.com" },
    update: {},
    create: { email: "admin@mallorcair.com", name: "Antoni", password: adminPassword, role: "ADMIN" },
  });
  console.log("  ✓ User: admin@mallorcair.com / admin123");

  await prisma.user.upsert({
    where: { email: "handler@mallorcair.com" },
    update: {},
    create: { email: "handler@mallorcair.com", name: "Maria", password: handlerPassword, role: "HANDLER" },
  });
  console.log("  ✓ User: handler@mallorcair.com / handler123");

  await prisma.user.upsert({
    where: { email: "viewer@mallorcair.com" },
    update: {},
    create: { email: "viewer@mallorcair.com", name: "Director", password: viewerPassword, role: "VIEWER" },
  });
  console.log("  ✓ User: viewer@mallorcair.com / viewer123");

  console.log("\nDone! Turso database is ready.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
