import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create users
  const adminPassword = await bcrypt.hash("admin123", 10);
  const handlerPassword = await bcrypt.hash("handler123", 10);

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

  // Create today's day sheet
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daySheet = await prisma.daySheet.upsert({
    where: { date: today },
    update: {},
    create: { date: today },
  });

  // Create sample flights
  const flights = [
    {
      callsign: "VJT630",
      registration: "9H-ILY",
      aircraftType: "CRJ2",
      origin: "LOWI",
      eta: "12:30",
      destination: "GMME",
      etd: "14:00",
      parking: "P232",
      state: "ON_GROUND",
      crewArrival: 3,
      paxArrival: 0,
      crewDeparture: 3,
      paxDeparture: 5,
      paxDepBagsChecked: 7,
      paxDepBagsCabin: 2,
      paxDepState: "IN_LOUNGE",
      paxDepTransportType: "PREPARED_CAR",
      paxDepTransportState: "CONFIRMED",
      fuelState: "NOT_REQUESTED",
    },
    {
      callsign: "EJU123",
      registration: "G-UZHA",
      aircraftType: "A320",
      origin: "EGKK",
      eta: "09:45",
      destination: "EGKK",
      etd: "11:30",
      parking: "B12",
      state: "BOARDING",
      crewArrival: 6,
      paxArrival: 180,
      crewDeparture: 6,
      paxDeparture: 175,
      paxDepBagsChecked: 120,
      paxDepBagsCabin: 85,
      paxDepState: "IN_LOUNGE",
      paxDepTransportType: "UNDEFINED",
      paxDepTransportState: "PENDING",
      fuelState: "SERVED",
      fuelServedAt: "10:15",
    },
    {
      callsign: "LXJ456",
      registration: "CS-DKF",
      aircraftType: "FA7X",
      origin: "LFPB",
      eta: "15:00",
      destination: "LEMD",
      etd: "17:30",
      parking: "P205",
      state: "EXPECTED",
      crewArrival: 2,
      paxArrival: 4,
      crewDeparture: 2,
      paxDeparture: 3,
      fuelState: "NOT_REQUESTED",
    },
    {
      callsign: "NJE789",
      registration: "CS-CHC",
      aircraftType: "CL35",
      origin: "LIRF",
      eta: "08:00",
      destination: "LIRF",
      etd: "09:30",
      parking: "P210",
      state: "DISPATCHED",
      crewArrival: 2,
      paxArrival: 3,
      crewDeparture: 2,
      paxDeparture: 3,
      paxDepBagsChecked: 4,
      paxDepBagsCabin: 2,
      paxDepBagsState: "SENT_TO_AIRCRAFT",
      paxDepState: "BOARDED",
      paxDepTransportType: "TAXI",
      paxDepTransportState: "CONFIRMED",
      fuelState: "SERVED",
      fuelServedAt: "08:30",
      toiletState: "COMPLETED",
    },
    {
      callsign: "TVS321",
      registration: "OK-TST",
      aircraftType: "B738",
      origin: "LKPR",
      eta: "13:15",
      destination: "LKPR",
      etd: "15:45",
      parking: "A04",
      state: "EXPECTED",
      crewArrival: 5,
      paxArrival: 160,
      crewDeparture: 5,
      paxDeparture: 155,
      fuelState: "NOT_REQUESTED",
    },
  ];

  for (const flightData of flights) {
    const flight = await prisma.flight.create({
      data: {
        daySheetId: daySheet.id,
        ...flightData,
      },
    });

    // Add services for some flights
    if (flightData.callsign === "VJT630") {
      await prisma.service.createMany({
        data: [
          { flightId: flight.id, type: "CATERING", state: "DELIVERED", deliveredAt: "12:45", origin: "Catering Aire" },
          { flightId: flight.id, type: "COOLER_BAG", state: "DELIVERED", deliveredAt: "12:50", origin: "Crossroads" },
          { flightId: flight.id, type: "THERMOS", state: "PENDING", origin: "Crossroads" },
          { flightId: flight.id, type: "NEWSPAPERS", state: "DELIVERED", deliveredAt: "13:00" },
        ],
      });
    }

    if (flightData.callsign === "LXJ456") {
      await prisma.service.createMany({
        data: [
          { flightId: flight.id, type: "CATERING", state: "PENDING", origin: "Catering Aire" },
          { flightId: flight.id, type: "LAUNDRY", state: "PENDING" },
          { flightId: flight.id, type: "NEWSPAPERS", state: "PENDING" },
        ],
      });
    }

    if (flightData.callsign === "NJE789") {
      await prisma.service.createMany({
        data: [
          { flightId: flight.id, type: "CATERING", state: "DELIVERED", deliveredAt: "08:20", origin: "Catering Aire" },
          { flightId: flight.id, type: "THERMOS", state: "DELIVERED", deliveredAt: "08:25" },
        ],
      });
    }

    // Add event logs
    await prisma.eventLog.create({
      data: {
        flightId: flight.id,
        userId: admin.id,
        action: "Vuelo creado",
        details: `${flightData.callsign} - ${flightData.registration}`,
      },
    });
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
