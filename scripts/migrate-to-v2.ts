// Migrate the legacy v1 schema (DaySheet + Flight + …) to the v2 schema
// (Operator + Aircraft + Visit + Movement + …).
//
// CRITICAL: run this script BEFORE applying the new schema. It expects the
// v1 tables to still exist in the database. Steps:
//
//   1. Backup your DB.
//   2. tsx scripts/migrate-to-v2.ts          # dumps a v2.json file with the migration plan
//   3. npx prisma db push                    # applies the new schema (drops v1 tables)
//   4. tsx scripts/migrate-to-v2.ts --apply  # reads v2.json and writes the new tables
//
// This split (plan → push → apply) avoids the chicken-and-egg of needing
// both schemas live at the same time. The plan file is small (only IDs and
// raw fields) so it fits in memory.
//
// Encryption: passport / DOB are encrypted in step 4, using
// PASSPORT_ENCRYPTION_KEY. Same key required for runtime decryption.

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import fs from "node:fs";
import path from "node:path";
import { findOperator } from "../src/lib/operators";
import { encrypt, hashPII } from "../src/lib/crypto";

const PLAN_FILE = path.resolve(process.cwd(), ".v2-migration-plan.json");

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL || "file:./dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

interface LegacyFlight {
  id: string;
  daySheetDate: string;          // ISO
  callsign: string;
  registration: string;
  aircraftType: string;
  origin: string | null;
  eta: string | null;
  arrivalDate: string | null;    // DD/MM
  destination: string | null;
  etd: string | null;
  departureDate: string | null;
  parking: string | null;
  tobt: string | null;
  state: string;
  isOvernight: boolean;
  crewArrival: number;
  paxArrival: number;
  crewDeparture: number;
  paxDeparture: number;
  paxArrBagsState: string;
  paxArrTransportType: string;
  paxArrTransportState: string;
  paxArrState: string;
  paxDepBagsChecked: number;
  paxDepBagsCabin: number;
  paxDepBagsState: string;
  paxDepTransportType: string;
  paxDepTransportState: string;
  paxDepState: string;
  crewArrLocation: string;
  crewDepLocation: string;
  fuelState: string;
  fuelRequestedAt: string | null;
  fuelServedAt: string | null;
  toiletState: string;
  toiletRequestedAt: string | null;
  toiletCompletedAt: string | null;
  notes: string | null;
  services: Array<{ id: string; type: string; phase: string; state: string; customName: string | null; reference: string | null; target: string | null; origin: string | null; arrivedAt: string | null; deliveredAt: string | null }>;
  passengers: Array<{ id: string; direction: string; fullName: string; gender: string | null; nationality: string | null; passportNumber: string | null; dateOfBirth: string | null; status: string; verified: boolean }>;
  crewMembers: Array<{ id: string; direction: string; fullName: string; nationality: string | null; passportNumber: string | null; dateOfBirth: string | null; role: string }>;
  lostItems: Array<{ id: string; description: string; location: string; state: string; foundAt: string | null; claimedAt: string | null; deliveredAt: string | null; claimedBy: string | null }>;
}

interface Plan { flights: LegacyFlight[] }

async function dumpPlan() {
  console.log("[migrate] Dumping v1 plan…");
  // Read raw legacy data via a raw SQL query so the script works even after
  // Prisma client has been regenerated against the new schema.
  const rows: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(`
    SELECT f.*, ds.date as daySheetDate
    FROM Flight f
    INNER JOIN DaySheet ds ON ds.id = f.daySheetId
  `);
  const services: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(`SELECT * FROM Service`);
  const passengers: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(`SELECT * FROM Passenger`);
  const crew: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(`SELECT * FROM CrewMember`);
  const lost: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(`SELECT * FROM LostItem`);

  const byFlight = (table: Array<Record<string, unknown>>) => {
    const m = new Map<string, Array<Record<string, unknown>>>();
    for (const r of table) {
      const k = r.flightId as string;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  };
  const svcByFlight = byFlight(services);
  const paxByFlight = byFlight(passengers);
  const crewByFlight = byFlight(crew);
  const lostByFlight = byFlight(lost);

  const flights: LegacyFlight[] = rows.map((r) => ({
    id: r.id as string,
    daySheetDate: new Date(r.daySheetDate as string).toISOString(),
    callsign: (r.callsign as string) || "",
    registration: (r.registration as string) || "",
    aircraftType: (r.aircraftType as string) || "",
    origin: (r.origin as string) || null,
    eta: (r.eta as string) || null,
    arrivalDate: (r.arrivalDate as string) || null,
    destination: (r.destination as string) || null,
    etd: (r.etd as string) || null,
    departureDate: (r.departureDate as string) || null,
    parking: (r.parking as string) || null,
    tobt: (r.tobt as string) || null,
    state: (r.state as string) || "EXPECTED",
    isOvernight: Boolean(r.isOvernight),
    crewArrival: Number(r.crewArrival) || 0,
    paxArrival: Number(r.paxArrival) || 0,
    crewDeparture: Number(r.crewDeparture) || 0,
    paxDeparture: Number(r.paxDeparture) || 0,
    paxArrBagsState: (r.paxArrBagsState as string) || "IN_AIRCRAFT",
    paxArrTransportType: (r.paxArrTransportType as string) || "UNDEFINED",
    paxArrTransportState: (r.paxArrTransportState as string) || "PENDING",
    paxArrState: (r.paxArrState as string) || "IN_AIRCRAFT",
    paxDepBagsChecked: Number(r.paxDepBagsChecked) || 0,
    paxDepBagsCabin: Number(r.paxDepBagsCabin) || 0,
    paxDepBagsState: (r.paxDepBagsState as string) || "NOT_ARRIVED",
    paxDepTransportType: (r.paxDepTransportType as string) || "UNDEFINED",
    paxDepTransportState: (r.paxDepTransportState as string) || "PENDING",
    paxDepState: (r.paxDepState as string) || "NOT_ARRIVED",
    crewArrLocation: (r.crewArrLocation as string) || "IN_AIRCRAFT",
    crewDepLocation: (r.crewDepLocation as string) || "IN_AIRCRAFT",
    fuelState: (r.fuelState as string) || "NOT_REQUESTED",
    fuelRequestedAt: (r.fuelRequestedAt as string) || null,
    fuelServedAt: (r.fuelServedAt as string) || null,
    toiletState: (r.toiletState as string) || "NOT_REQUESTED",
    toiletRequestedAt: (r.toiletRequestedAt as string) || null,
    toiletCompletedAt: (r.toiletCompletedAt as string) || null,
    notes: (r.notes as string) || null,
    services: (svcByFlight.get(r.id as string) || []).map((s) => ({
      id: s.id as string,
      type: (s.type as string) || "CUSTOM",
      phase: (s.phase as string) || "DEPARTURE",
      state: (s.state as string) || "PENDING",
      customName: (s.customName as string) || null,
      reference: (s.reference as string) || null,
      target: (s.target as string) || null,
      origin: (s.origin as string) || null,
      arrivedAt: (s.arrivedAt as string) || null,
      deliveredAt: (s.deliveredAt as string) || null,
    })),
    passengers: (paxByFlight.get(r.id as string) || []).map((p) => ({
      id: p.id as string,
      direction: (p.direction as string) || "DEPARTURE",
      fullName: (p.fullName as string) || "",
      gender: (p.gender as string) || null,
      nationality: (p.nationality as string) || null,
      passportNumber: (p.passportNumber as string) || null,
      dateOfBirth: (p.dateOfBirth as string) || null,
      status: (p.status as string) || "CONFIRMED",
      verified: Boolean(p.verified),
    })),
    crewMembers: (crewByFlight.get(r.id as string) || []).map((c) => ({
      id: c.id as string,
      direction: (c.direction as string) || "DEPARTURE",
      fullName: (c.fullName as string) || "",
      nationality: (c.nationality as string) || null,
      passportNumber: (c.passportNumber as string) || null,
      dateOfBirth: (c.dateOfBirth as string) || null,
      role: (c.role as string) || "OTHER",
    })),
    lostItems: (lostByFlight.get(r.id as string) || []).map((l) => ({
      id: l.id as string,
      description: (l.description as string) || "",
      location: (l.location as string) || "AIRCRAFT",
      state: (l.state as string) || "FOUND",
      foundAt: (l.foundAt as string) || null,
      claimedAt: (l.claimedAt as string) || null,
      deliveredAt: (l.deliveredAt as string) || null,
      claimedBy: (l.claimedBy as string) || null,
    })),
  }));

  fs.writeFileSync(PLAN_FILE, JSON.stringify({ flights } satisfies Plan));
  console.log(`[migrate] Plan dumped: ${flights.length} flights → ${PLAN_FILE}`);
}

async function applyPlan() {
  console.log("[migrate] Applying v2 plan…");
  if (!fs.existsSync(PLAN_FILE)) {
    throw new Error(`Plan file not found at ${PLAN_FILE}. Run without --apply first.`);
  }
  const { flights }: Plan = JSON.parse(fs.readFileSync(PLAN_FILE, "utf-8"));

  // Cache operators / aircraft / visits to avoid duplicate writes
  const opByIcao = new Map<string, { id: string }>();
  const aircraftByReg = new Map<string, { id: string }>();

  async function getOperator(callsign: string) {
    const op = findOperator(callsign);
    if (!op) return null;
    const cached = opByIcao.get(op.icao);
    if (cached) return cached;
    const dbOp = await prisma.operator.upsert({
      where: { icaoCode: op.icao },
      create: { icaoCode: op.icao, name: op.name },
      update: {},
    });
    opByIcao.set(op.icao, dbOp);
    return dbOp;
  }

  async function getAircraft(reg: string, aircraftType: string, callsign: string) {
    const key = reg.toUpperCase();
    const cached = aircraftByReg.get(key);
    if (cached) return cached;
    const op = await getOperator(callsign);
    const ac = await prisma.aircraft.upsert({
      where: { registration: key },
      create: { registration: key, aircraftType, currentOperatorId: op?.id || null },
      update: { aircraftType, currentOperatorId: op?.id || null },
    });
    aircraftByReg.set(key, ac);
    return ac;
  }

  let visitCount = 0;
  let movementCount = 0;
  let serviceCount = 0;
  let passengerCount = 0;
  let crewCount = 0;
  let lostCount = 0;

  for (const f of flights) {
    const palmaDay = new Date(f.daySheetDate);
    const aircraft = await getAircraft(f.registration, f.aircraftType, f.callsign);
    const operator = await getOperator(f.callsign);

    const visit = await prisma.visit.create({
      data: {
        aircraftId: aircraft.id,
        operatorId: operator?.id || null,
        palmaDay,
        type: f.isOvernight ? "OVERNIGHT" : "TURNAROUND",
        arrivalDate: palmaDay,
        departureDate: palmaDay,
        notes: f.notes,
      },
    });
    visitCount++;

    // ARRIVAL
    await prisma.movement.create({
      data: {
        visitId: visit.id,
        direction: "ARRIVAL",
        callsign: f.callsign,
        scheduledDate: palmaDay,
        origin: f.origin,
        eta: f.eta,
        parking: f.parking,
        state: f.state,
        crewCount: f.crewArrival,
        paxCount: f.paxArrival,
        bagsState: f.paxArrBagsState,
        transportType: f.paxArrTransportType,
        transportState: f.paxArrTransportState,
        paxState: f.paxArrState,
        crewLocation: f.crewArrLocation,
      },
    });
    movementCount++;

    // DEPARTURE
    const depMovement = await prisma.movement.create({
      data: {
        visitId: visit.id,
        direction: "DEPARTURE",
        callsign: f.callsign,
        scheduledDate: palmaDay,
        destination: f.destination,
        etd: f.etd,
        parking: f.parking,
        tobt: f.tobt,
        state: f.state,
        crewCount: f.crewDeparture,
        paxCount: f.paxDeparture,
        bagsChecked: f.paxDepBagsChecked,
        bagsCabin: f.paxDepBagsCabin,
        bagsState: f.paxDepBagsState,
        transportType: f.paxDepTransportType,
        transportState: f.paxDepTransportState,
        paxState: f.paxDepState,
        crewLocation: f.crewDepLocation,
        fuelState: f.fuelState,
        fuelRequestedAt: f.fuelRequestedAt,
        fuelServedAt: f.fuelServedAt,
        toiletState: f.toiletState,
        toiletRequestedAt: f.toiletRequestedAt,
        toiletCompletedAt: f.toiletCompletedAt,
      },
    });
    movementCount++;

    // Services (on Visit)
    for (const s of f.services) {
      await prisma.service.create({
        data: {
          visitId: visit.id,
          type: s.type,
          direction: s.phase || "DEPARTURE",
          state: s.state,
          customName: s.customName,
          reference: s.reference,
          target: s.target,
          origin: s.origin,
          arrivedAt: s.arrivedAt,
          deliveredAt: s.deliveredAt,
        },
      });
      serviceCount++;
    }

    // Passengers — encrypted at write time
    for (const p of f.passengers) {
      const movementId = p.direction === "ARRIVAL"
        ? (await prisma.movement.findUnique({ where: { visitId_direction: { visitId: visit.id, direction: "ARRIVAL" } } }))?.id
        : depMovement.id;
      if (!movementId) continue;
      const [givenNames, ...rest] = p.fullName.split(" ");
      await prisma.passenger.create({
        data: {
          movementId,
          givenNames: givenNames || null,
          surname: rest.join(" ") || null,
          fullNameHash: hashPII(p.fullName),
          passportEncrypted: encrypt(p.passportNumber),
          passportHash: hashPII(p.passportNumber),
          dobEncrypted: encrypt(p.dateOfBirth),
          gender: p.gender,
          nationality: p.nationality,
          status: p.status,
          verified: p.verified,
          source: "MANUAL",
        },
      });
      passengerCount++;
    }

    // Crew → persistent CrewMember + CrewAssignment
    const crewOperatorId = operator?.id ?? (await prisma.operator.upsert({
      where: { icaoCode: "UNK" },
      create: { icaoCode: "UNK", name: "Operador desconocido" },
      update: {},
    })).id;
    for (const c of f.crewMembers) {
      const passportHash = hashPII(c.passportNumber);
      let crewMember = passportHash
        ? await prisma.crewMember.findUnique({
            where: { operatorId_passportHash: { operatorId: crewOperatorId, passportHash } },
          })
        : null;
      if (!crewMember) {
        const [givenNames, ...rest] = c.fullName.split(" ");
        crewMember = await prisma.crewMember.create({
          data: {
            operatorId: crewOperatorId,
            fullName: c.fullName,
            givenNames: givenNames || null,
            surname: rest.join(" ") || null,
            passportEncrypted: encrypt(c.passportNumber),
            passportHash,
            dobEncrypted: encrypt(c.dateOfBirth),
            nationality: c.nationality,
            role: c.role,
          },
        });
      }
      const movementId = c.direction === "ARRIVAL"
        ? (await prisma.movement.findUnique({ where: { visitId_direction: { visitId: visit.id, direction: "ARRIVAL" } } }))?.id
        : depMovement.id;
      if (!movementId) continue;
      await prisma.crewAssignment.upsert({
        where: { movementId_crewMemberId: { movementId, crewMemberId: crewMember.id } },
        create: { movementId, crewMemberId: crewMember.id, roleOnFlight: c.role },
        update: {},
      });
      crewCount++;
    }

    // Lost items
    for (const l of f.lostItems) {
      await prisma.lostItem.create({
        data: {
          visitId: visit.id,
          description: l.description,
          location: l.location,
          state: l.state,
          foundAt: l.foundAt,
          claimedAt: l.claimedAt,
          deliveredAt: l.deliveredAt,
          claimedBy: l.claimedBy,
        },
      });
      lostCount++;
    }
  }

  console.log(
    `[migrate] Done. Visits=${visitCount}, Movements=${movementCount}, ` +
    `Services=${serviceCount}, Passengers=${passengerCount}, Crew=${crewCount}, Lost=${lostCount}`
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply) {
    await applyPlan();
  } else {
    await dumpPlan();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
