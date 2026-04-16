// Seed the database from docs/ files:
// - Category A (PDFs): Cybermax "Orden del dia" → flights
// - Category C (Excel): "Hoja de Extras" → services
//
// Usage: tsx scripts/seed-from-docs.ts
// Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars

import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parseCybermaxPdf, parseDate } from "../src/lib/pdfParser";
import { parseExtrasExcel } from "../src/lib/excelParser";

// Use Turso adapter if env vars present, otherwise local SQLite
let prisma: PrismaClient;
if (process.env.TURSO_DATABASE_URL) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaLibSql } = require("@prisma/adapter-libsql");
  const adapter = new PrismaLibSql({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  prisma = new PrismaClient({ adapter });
} else {
  prisma = new PrismaClient();
}

const DOCS_DIR = path.join(__dirname, "..", "docs");

// Map of known Excel file → approximate date (the parser reads FECHA from header)
// PDFs self-identify their date via the parser

async function main() {
  const files = fs.readdirSync(DOCS_DIR);
  const pdfFiles = files.filter((f) => f.toLowerCase().endsWith(".pdf") && !f.includes("LLEGADAS") && !f.includes("SALIDAS"));
  const xlsxFiles = files.filter((f) => f.toLowerCase().endsWith(".xlsx"));

  console.log(`Found ${pdfFiles.length} PDFs and ${xlsxFiles.length} Excel files in docs/\n`);

  // ── Step 1: Import PDFs → Flights ────────────────────────────────
  let totalFlights = 0;
  let totalDays = 0;

  for (const pdfFile of pdfFiles.sort()) {
    const filePath = path.join(DOCS_DIR, pdfFile);
    const buffer = fs.readFileSync(filePath);

    let result;
    try {
      result = await parseCybermaxPdf(buffer);
    } catch (err) {
      console.log(`  ✗ ${pdfFile}: parse error — ${(err as Error).message}`);
      continue;
    }

    if (!result.date || !result.flights.length) {
      console.log(`  ✗ ${pdfFile}: no date or no flights`);
      continue;
    }

    const targetDate = parseDate(result.date);
    let daySheet = await prisma.daySheet.findUnique({ where: { date: targetDate } });
    if (!daySheet) {
      daySheet = await prisma.daySheet.create({ data: { date: targetDate } });
      totalDays++;
    }

    // Check existing flights to avoid duplicates
    const existing = await prisma.flight.findMany({
      where: { daySheetId: daySheet.id },
      select: { registration: true },
    });
    const existingRegs = new Set(existing.map((f) => f.registration));

    let created = 0;
    for (const f of result.flights) {
      if (existingRegs.has(f.registration)) continue;

      await prisma.flight.create({
        data: {
          daySheetId: daySheet.id,
          callsign: f.callsign,
          registration: f.registration,
          aircraftType: f.aircraftType,
          origin: f.origin || null,
          eta: f.eta || null,
          arrivalDate: f.arrivalDate || null,
          destination: f.destination || null,
          etd: f.etd || null,
          departureDate: f.departureDate || null,
          parking: f.parking || null,
          crewArrival: f.crewArrival || 0,
          crewDeparture: f.crewDeparture || 0,
          paxArrival: f.paxArrival || 0,
          paxDeparture: f.paxDeparture || 0,
        },
      });
      existingRegs.add(f.registration);
      created++;
    }

    totalFlights += created;
    console.log(`  ✓ ${pdfFile}: ${result.date} — ${created} vuelos creados (${result.flights.length} parseados)`);
    if (result.errors.length) {
      for (const e of result.errors) console.log(`    ⚠ ${e}`);
    }
  }

  console.log(`\nPDFs: ${totalDays} dias, ${totalFlights} vuelos creados\n`);

  // ── Step 2: Import Excels → Services ─────────────────────────────
  let totalServices = 0;
  let totalMatched = 0;

  for (const xlsxFile of xlsxFiles.sort()) {
    const filePath = path.join(DOCS_DIR, xlsxFile);
    const buffer = fs.readFileSync(filePath);

    let result;
    try {
      result = parseExtrasExcel(buffer);
    } catch (err) {
      console.log(`  ✗ ${xlsxFile}: parse error — ${(err as Error).message}`);
      continue;
    }

    if (!result.extras.length) {
      console.log(`  ✗ ${xlsxFile}: no extras found`);
      continue;
    }

    // Find the right DaySheet by date
    const excelDate = result.date;
    let daySheet = null;

    if (excelDate && /^\d{4}-\d{2}-\d{2}$/.test(excelDate)) {
      const parts = excelDate.split("-");
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      d.setHours(0, 0, 0, 0);
      daySheet = await prisma.daySheet.findUnique({ where: { date: d } });
    }

    if (!daySheet) {
      console.log(`  ⚠ ${xlsxFile}: no DaySheet for date "${excelDate}" — skipping`);
      continue;
    }

    // Get flights for this day
    const flights = await prisma.flight.findMany({
      where: { daySheetId: daySheet.id },
      include: { services: true },
    });

    const flightByReg = new Map<string, typeof flights[0]>();
    for (const f of flights) {
      flightByReg.set(f.registration.toUpperCase(), f);
      flightByReg.set(f.registration.replace(/-/g, "").toUpperCase(), f);
    }

    let matched = 0;
    let services = 0;

    for (const extra of result.extras) {
      const reg = extra.registration.toUpperCase();
      const regNoDash = reg.replace(/-/g, "");
      const flight = flightByReg.get(reg) || flightByReg.get(regNoDash);

      if (!flight) continue;
      matched++;

      // Skip if flight already has services (avoid duplicates on re-run)
      if (flight.services.length > 0) continue;

      for (const svc of extra.services) {
        if (!svc.name || svc.name.length < 2) continue;

        for (let i = 0; i < (svc.quantity || 1); i++) {
          await prisma.service.create({
            data: {
              flightId: flight.id,
              type: svc.type,
              customName: svc.type === "CUSTOM" ? svc.name : (svc.name !== svc.type ? svc.name : null),
              state: "PENDING",
              reference: (svc as unknown as Record<string, string>).reference || null,
              target: (svc as unknown as Record<string, string>).target || null,
              origin: (svc as unknown as Record<string, string>).origin || null,
            },
          });
          services++;
        }
      }
    }

    totalMatched += matched;
    totalServices += services;
    console.log(`  ✓ ${xlsxFile}: ${excelDate} — ${matched} aviones, ${services} servicios`);
  }

  console.log(`\nExcels: ${totalMatched} aviones matched, ${totalServices} servicios creados`);
  console.log("\nSeed from docs complete!");
}

main()
  .catch((e) => {
    console.error("seed-from-docs error (non-fatal):", e.message || e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
