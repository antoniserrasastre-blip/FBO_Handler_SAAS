import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // Users
  const adminPassword = await bcrypt.hash("admin123", 10);
  const handlerPassword = await bcrypt.hash("handler123", 10);
  const viewerPassword = await bcrypt.hash("viewer123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@mallorcair.com" },
    update: {},
    create: {
      email: "admin@mallorcair.com",
      name: "Antoni",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "handler@mallorcair.com" },
    update: {},
    create: {
      email: "handler@mallorcair.com",
      name: "Maria",
      password: handlerPassword,
      role: "HANDLER",
    },
  });

  await prisma.user.upsert({
    where: { email: "viewer@mallorcair.com" },
    update: {},
    create: {
      email: "viewer@mallorcair.com",
      name: "Director",
      password: viewerPassword,
      role: "VIEWER",
    },
  });

  // Operators
  const njeOp = await prisma.operator.upsert({
    where: { icaoCode: "NJE" },
    update: {},
    create: { icaoCode: "NJE", name: "NetJets Europe" },
  });
  const vjtOp = await prisma.operator.upsert({
    where: { icaoCode: "VJT" },
    update: {},
    create: { icaoCode: "VJT", name: "VistaJet" },
  });
  const ejuOp = await prisma.operator.upsert({
    where: { icaoCode: "EJU" },
    update: {},
    create: { icaoCode: "EJU", name: "easyJet Europe" },
  });

  // Aircraft
  const ac1 = await prisma.aircraft.upsert({
    where: { registration: "9H-ILY" },
    update: {},
    create: { registration: "9H-ILY", aircraftType: "CRJ2", currentOperatorId: vjtOp.id },
  });
  const ac2 = await prisma.aircraft.upsert({
    where: { registration: "G-UZHA" },
    update: {},
    create: { registration: "G-UZHA", aircraftType: "A320", currentOperatorId: ejuOp.id },
  });
  const ac3 = await prisma.aircraft.upsert({
    where: { registration: "CS-CHC" },
    update: {},
    create: { registration: "CS-CHC", aircraftType: "CL35", currentOperatorId: njeOp.id },
  });

  // Today's Visits (UTC midnight of Palma local date)
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

  // Sample: a turnaround
  const v1 = await prisma.visit.create({
    data: {
      aircraftId: ac1.id,
      operatorId: vjtOp.id,
      palmaDay: today,
      type: "TURNAROUND",
      arrivalDate: today,
      departureDate: today,
    },
  });
  await prisma.movement.create({
    data: {
      visitId: v1.id,
      direction: "ARRIVAL",
      callsign: "VJT630",
      scheduledDate: today,
      origin: "LOWI",
      eta: "12:30",
      parking: "P232",
      crewCount: 3,
      paxCount: 0,
      state: "PARKED",
    },
  });
  await prisma.movement.create({
    data: {
      visitId: v1.id,
      direction: "DEPARTURE",
      callsign: "VJT630",
      scheduledDate: today,
      destination: "GMME",
      etd: "14:00",
      parking: "P232",
      crewCount: 3,
      paxCount: 5,
      state: "TURNAROUND",
      paxState: "IN_LOUNGE",
      bagsChecked: 7,
      bagsCabin: 2,
      transportType: "PREPARED_CAR",
      transportState: "CONFIRMED",
    },
  });
  await prisma.service.createMany({
    data: [
      { visitId: v1.id, type: "CATERING", direction: "DEPARTURE", state: "DELIVERED", deliveredAt: "12:45", origin: "CATERING_AIRE" },
      { visitId: v1.id, type: "COOLER_BAG", direction: "BOTH", state: "DELIVERED", deliveredAt: "12:50" },
      { visitId: v1.id, type: "THERMOS", direction: "DEPARTURE", state: "PENDING" },
      { visitId: v1.id, type: "NEWSPAPERS", direction: "DEPARTURE", state: "DELIVERED", deliveredAt: "13:00", origin: "MCR" },
    ],
  });
  await prisma.eventLog.create({
    data: { visitId: v1.id, userId: admin.id, action: "Visit creada (seed)", details: "VJT630 — 9H-ILY" },
  });

  // Sample: a commercial larger flight
  const v2 = await prisma.visit.create({
    data: {
      aircraftId: ac2.id,
      operatorId: ejuOp.id,
      palmaDay: today,
      type: "TURNAROUND",
      arrivalDate: today,
      departureDate: today,
    },
  });
  await prisma.movement.create({
    data: {
      visitId: v2.id,
      direction: "ARRIVAL",
      callsign: "EJU123",
      scheduledDate: today,
      origin: "EGKK",
      eta: "09:45",
      parking: "B12",
      crewCount: 6,
      paxCount: 180,
      state: "PARKED",
    },
  });
  await prisma.movement.create({
    data: {
      visitId: v2.id,
      direction: "DEPARTURE",
      callsign: "EJU123",
      scheduledDate: today,
      destination: "EGKK",
      etd: "11:30",
      parking: "B12",
      crewCount: 6,
      paxCount: 175,
      state: "BOARDING",
      paxState: "IN_LOUNGE",
      bagsChecked: 120,
      bagsCabin: 85,
      fuelState: "SERVED",
      fuelServedAt: "10:15",
    },
  });

  // Sample: NetJets
  const v3 = await prisma.visit.create({
    data: {
      aircraftId: ac3.id,
      operatorId: njeOp.id,
      palmaDay: today,
      type: "TURNAROUND",
      arrivalDate: today,
      departureDate: today,
    },
  });
  await prisma.movement.create({
    data: {
      visitId: v3.id,
      direction: "ARRIVAL",
      callsign: "NJE789",
      scheduledDate: today,
      origin: "LIRF",
      eta: "08:00",
      parking: "P210",
      crewCount: 2,
      paxCount: 3,
      state: "PARKED",
    },
  });
  await prisma.movement.create({
    data: {
      visitId: v3.id,
      direction: "DEPARTURE",
      callsign: "NJE789",
      scheduledDate: today,
      destination: "LIRF",
      etd: "09:30",
      parking: "P210",
      crewCount: 2,
      paxCount: 3,
      state: "OFF_BLOCKS",
      paxState: "BOARDED",
      bagsChecked: 4,
      bagsCabin: 2,
      bagsState: "SENT_TO_AIRCRAFT",
      transportType: "TAXI",
      transportState: "CONFIRMED",
      fuelState: "SERVED",
      fuelServedAt: "08:30",
      toiletState: "COMPLETED",
    },
  });
  await prisma.service.createMany({
    data: [
      { visitId: v3.id, type: "CATERING", direction: "DEPARTURE", state: "DELIVERED", deliveredAt: "08:20", origin: "NETJETS", reference: "12297037", target: "PAX" },
      { visitId: v3.id, type: "THERMOS", direction: "DEPARTURE", state: "DELIVERED", deliveredAt: "08:25" },
    ],
  });

  console.log("Seed v2 completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
