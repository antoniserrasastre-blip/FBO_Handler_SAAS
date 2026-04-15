import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const schema = [
  `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "password" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'HANDLER', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,
  `CREATE TABLE IF NOT EXISTS "DaySheet" ("id" TEXT NOT NULL PRIMARY KEY, "date" DATETIME NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "DaySheet_date_key" ON "DaySheet"("date")`,
  `CREATE TABLE IF NOT EXISTS "Flight" ("id" TEXT NOT NULL PRIMARY KEY, "daySheetId" TEXT NOT NULL, "callsign" TEXT NOT NULL, "registration" TEXT NOT NULL, "aircraftType" TEXT NOT NULL, "origin" TEXT, "eta" TEXT, "arrivalDate" TEXT, "destination" TEXT, "etd" TEXT, "departureDate" TEXT, "parking" TEXT, "tobt" TEXT, "state" TEXT NOT NULL DEFAULT 'EXPECTED', "crewArrival" INTEGER NOT NULL DEFAULT 0, "paxArrival" INTEGER NOT NULL DEFAULT 0, "crewDeparture" INTEGER NOT NULL DEFAULT 0, "paxDeparture" INTEGER NOT NULL DEFAULT 0, "paxArrBagsChecked" INTEGER NOT NULL DEFAULT 0, "paxArrBagsCabin" INTEGER NOT NULL DEFAULT 0, "paxArrBagsState" TEXT NOT NULL DEFAULT 'PENDING', "paxArrTransportType" TEXT NOT NULL DEFAULT 'UNDEFINED', "paxArrTransportState" TEXT NOT NULL DEFAULT 'PENDING', "paxArrState" TEXT NOT NULL DEFAULT 'NOT_ARRIVED', "paxDepBagsChecked" INTEGER NOT NULL DEFAULT 0, "paxDepBagsCabin" INTEGER NOT NULL DEFAULT 0, "paxDepBagsState" TEXT NOT NULL DEFAULT 'PENDING', "paxDepTransportType" TEXT NOT NULL DEFAULT 'UNDEFINED', "paxDepTransportState" TEXT NOT NULL DEFAULT 'PENDING', "paxDepState" TEXT NOT NULL DEFAULT 'NOT_ARRIVED', "crewArrLocation" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT', "crewArrFilterCrossings" INTEGER NOT NULL DEFAULT 0, "crewDepLocation" TEXT NOT NULL DEFAULT 'IN_AIRCRAFT', "crewDepFilterCrossings" INTEGER NOT NULL DEFAULT 0, "fuelState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED', "fuelRequestedAt" TEXT, "fuelServedAt" TEXT, "toiletState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED', "toiletRequestedAt" TEXT, "toiletCompletedAt" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, CONSTRAINT "Flight_daySheetId_fkey" FOREIGN KEY ("daySheetId") REFERENCES "DaySheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS "Flight_daySheetId_idx" ON "Flight"("daySheetId")`,
  `CREATE TABLE IF NOT EXISTS "Service" ("id" TEXT NOT NULL PRIMARY KEY, "flightId" TEXT NOT NULL, "type" TEXT NOT NULL, "customName" TEXT, "reference" TEXT, "state" TEXT NOT NULL DEFAULT 'PENDING', "origin" TEXT, "arrivedAt" TEXT, "deliveredAt" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, CONSTRAINT "Service_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS "Service_flightId_idx" ON "Service"("flightId")`,
  `CREATE TABLE IF NOT EXISTS "EventLog" ("id" TEXT NOT NULL PRIMARY KEY, "flightId" TEXT NOT NULL, "userId" TEXT, "action" TEXT NOT NULL, "details" TEXT, "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EventLog_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "EventLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS "EventLog_flightId_idx" ON "EventLog"("flightId")`,
  `CREATE INDEX IF NOT EXISTS "EventLog_userId_idx" ON "EventLog"("userId")`,
];

function cuid() {
  return "c" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function GET() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    return NextResponse.json({ error: "TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set" }, { status: 500 });
  }

  const client = createClient({ url, authToken });
  const log: string[] = [];

  try {
    // 1. Create tables
    for (const sql of schema) {
      await client.execute(sql);
    }
    log.push("Tables created");

    // 2. Seed users
    const now = new Date().toISOString();
    const users = [
      { email: "admin@mallorcair.com", name: "Antoni", password: "admin123", role: "ADMIN" },
      { email: "handler@mallorcair.com", name: "Maria", password: "handler123", role: "HANDLER" },
      { email: "viewer@mallorcair.com", name: "Director", password: "viewer123", role: "VIEWER" },
    ];

    for (const u of users) {
      const existing = await client.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [u.email] });
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(u.password, 10);
        await client.execute({
          sql: `INSERT INTO "User" (id, email, name, password, role, "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [cuid(), u.email, u.name, hash, u.role, now, now],
        });
        log.push(`User created: ${u.email}`);
      } else {
        log.push(`User exists: ${u.email}`);
      }
    }

    return NextResponse.json({ success: true, log });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, log }, { status: 500 });
  }
}
