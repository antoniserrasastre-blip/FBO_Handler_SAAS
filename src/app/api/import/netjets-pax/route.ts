// /api/import/netjets-pax — NEW in v2.
//
// Proxies a NetJets ALS PDF to the pdf-microservice, then persists the parsed
// passengers and crew into v2 entities:
//
//   - Aircraft.upsert(registration)
//   - Visit.upsert(aircraftId, palmaDay = report date)
//   - Movement.upsert(visitId, direction=DEPARTURE) keyed by rqstNumber
//   - Passenger.create for role=PAX  (encrypted)
//   - CrewMember.upsert(operatorId, passportHash) + CrewAssignment for PIC/SIC/FA
//
// Idempotency: re-importing the same PDF updates passenger/crew records
// silently (looked up by movementId + passportHash). Manual fields like
// status=NO_SHOW or verified=true are preserved.
//
// Env:
//   PDF_MICROSERVICE_URL   — base URL of the Express microservice
//   PDF_MICROSERVICE_AUTH  — optional bearer token

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { palmaDayUtc } from "@/lib/time";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { eventBus } from "@/lib/events";
import { encrypt, hashPII } from "@/lib/crypto";
import { upsertAircraft, upsertVisit, upsertMovement, upsertOperator } from "@/lib/v2/upsert";
import { findOperator } from "@/lib/operators";

const ROLE_MAP: Record<string, string> = {
  PIC: "CAPTAIN",
  SIC: "FIRST_OFFICER",
  FA: "CABIN_CREW",
};

interface NetjetsPerson {
  givenNames: string | null;
  surname: string | null;
  fullName: string | null;
  role: string;            // PIC | SIC | FA | PAX
  gender: string | null;
  dob: string | null;
  docType: string | null;  // NID | PP
  docNumber: string | null;
  country: string | null;
  docExpiry: string | null;
  unmatched: boolean;
}

interface NetjetsFlight {
  rqst: string;
  callSign: string | null;
  tailNumber: string | null;
  acType: string | null;
  etd: string | null;
  eta: string | null;
  from: string | null;
  to: string | null;
  date: string | null;        // yyyy-mm-dd
  type: "commercial" | "ferry" | "cancelled";
  operator: string | null;
  modified: boolean;
  paxCount: number;
  cancelled: boolean;
  persons: NetjetsPerson[];
}

interface NetjetsResponse {
  source: string;
  order: string | null;
  reportDate: string | null;
  generatedAt: string | null;
  flights: NetjetsFlight[];
  parseWarnings: string[];
}

async function callMicroservice(file: File): Promise<NetjetsResponse> {
  const baseUrl = process.env.PDF_MICROSERVICE_URL;
  if (!baseUrl) {
    throw new Error("PDF_MICROSERVICE_URL no configurado");
  }
  const form = new FormData();
  form.append("pdf", file, file.name);

  const headers: Record<string, string> = {};
  if (process.env.PDF_MICROSERVICE_AUTH) {
    headers["Authorization"] = `Bearer ${process.env.PDF_MICROSERVICE_AUTH}`;
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/parse/netjets`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Microservicio respondio ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as NetjetsResponse;
}

function normaliseReg(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.toUpperCase().replace(/\s+/g, "").trim();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lenCheck = validateContentLength(req.headers.get("content-length"), "pdf");
  if (!lenCheck.ok) return NextResponse.json({ error: lenCheck.message }, { status: lenCheck.status });

  const formData = await req.formData();
  const files = formData.getAll("pdf") as File[];
  if (!files.length) return NextResponse.json({ error: "No se envio archivo PDF" }, { status: 400 });

  for (const file of files) {
    const v = validateUpload(file, "pdf");
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status });
  }

  let passengersCreated = 0;
  let passengersUpdated = 0;
  let crewLinked = 0;
  let movementsMatched = 0;
  let movementsCreated = 0;
  const warnings: string[] = [];

  for (const file of files) {
    let parsed: NetjetsResponse;
    try {
      parsed = await callMicroservice(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return NextResponse.json({ error: `[${file.name}] ${msg}` }, { status: 502 });
    }
    warnings.push(...parsed.parseWarnings);

    for (const fl of parsed.flights) {
      const reg = normaliseReg(fl.tailNumber);
      if (!reg) {
        warnings.push(`Flight ${fl.rqst}: sin tail number — saltado`);
        continue;
      }
      const flightDate = fl.date || parsed.reportDate;
      if (!flightDate) {
        warnings.push(`Flight ${fl.rqst}: sin fecha — saltado`);
        continue;
      }

      const palmaDay = palmaDayUtc(flightDate);

      // Operator: prefer the explicit "Operator: …" line, else derive from callsign
      let operatorId: string | null = null;
      if (fl.operator) {
        // The microservice reports "NetJets", "VistaJet", etc.; map to ICAO via callsign if possible
        const opByCallsign = fl.callSign ? findOperator(fl.callSign) : null;
        if (opByCallsign) {
          const dbOp = await upsertOperator(opByCallsign.icao, opByCallsign.name);
          operatorId = dbOp.id;
        } else {
          // Synthetic ICAO from the operator name (e.g., "NetJets" → "NET")
          const synth = fl.operator.toUpperCase().slice(0, 3) || "UNK";
          const dbOp = await upsertOperator(synth, fl.operator);
          operatorId = dbOp.id;
        }
      } else if (fl.callSign) {
        const op = findOperator(fl.callSign);
        if (op) {
          const dbOp = await upsertOperator(op.icao, op.name);
          operatorId = dbOp.id;
        }
      }

      const aircraft = await upsertAircraft({
        registration: reg,
        aircraftType: fl.acType,
        callsignForOperator: fl.callSign,
      });

      const visit = await upsertVisit({
        aircraftId: aircraft.id,
        palmaDay,
        operatorId,
      });

      // Movement: NetJets PDFs describe a single departure. Try DEPARTURE first.
      // Idempotency by rqstNumber: if a movement with this rqst already exists,
      // update it; otherwise upsert by (visitId, DEPARTURE).
      let movement = await prisma.movement.findFirst({
        where: { visitId: visit.id, rqstNumber: fl.rqst },
      });
      const movementData = {
        callsign: fl.callSign || "",
        destination: fl.to,
        etd: fl.etd,
        scheduledDate: palmaDay,
        paxCount: fl.paxCount || 0,
        rqstNumber: fl.rqst,
        flightCategory: fl.cancelled ? "CANCELLED" : fl.type === "ferry" ? "FERRY" : "COMMERCIAL",
        modifiedFlag: !!fl.modified,
        petCount: (fl as unknown as { petCount?: number }).petCount || 0,
      };

      if (movement) {
        await prisma.movement.update({ where: { id: movement.id }, data: movementData });
        movementsMatched++;
      } else {
        movement = await upsertMovement({
          visitId: visit.id,
          direction: "DEPARTURE",
          callsign: fl.callSign || "",
          scheduledDate: palmaDay,
          data: {
            destination: fl.to,
            etd: fl.etd,
            paxCount: fl.paxCount || 0,
            rqstNumber: fl.rqst,
            flightCategory: movementData.flightCategory,
            modifiedFlag: movementData.modifiedFlag,
          },
        });
        movementsCreated++;
      }

      // Persons
      for (const person of fl.persons) {
        const isCrew = person.role === "PIC" || person.role === "SIC" || person.role === "FA";

        if (isCrew) {
          // Persist CrewMember; need operatorId
          const crewOperatorId = operatorId ?? (await upsertOperator("UNK", "Operador desconocido")).id;
          const passportHash = hashPII(person.docNumber);

          let crewMember = passportHash
            ? await prisma.crewMember.findUnique({
                where: { operatorId_passportHash: { operatorId: crewOperatorId, passportHash } },
              })
            : null;

          if (!crewMember) {
            crewMember = await prisma.crewMember.create({
              data: {
                operatorId: crewOperatorId,
                givenNames: person.givenNames,
                surname: person.surname,
                fullName: person.fullName || `${person.givenNames || ""} ${person.surname || ""}`.trim(),
                passportEncrypted: encrypt(person.docNumber),
                passportHash,
                passportType: person.docType,
                passportCountry: person.country,
                passportExpiry: person.docExpiry,
                dobEncrypted: encrypt(person.dob),
                gender: person.gender,
                nationality: person.country,
                role: ROLE_MAP[person.role] || "OTHER",
              },
            });
          } else {
            // Silent upsert: refresh fields that might have changed
            await prisma.crewMember.update({
              where: { id: crewMember.id },
              data: {
                givenNames: person.givenNames || crewMember.givenNames,
                surname: person.surname || crewMember.surname,
                passportType: person.docType || crewMember.passportType,
                passportExpiry: person.docExpiry || crewMember.passportExpiry,
                passportCountry: person.country || crewMember.passportCountry,
              },
            });
          }

          await prisma.crewAssignment.upsert({
            where: {
              movementId_crewMemberId: { movementId: movement.id, crewMemberId: crewMember.id },
            },
            create: {
              movementId: movement.id,
              crewMemberId: crewMember.id,
              roleOnFlight: ROLE_MAP[person.role] || "OTHER",
            },
            update: { roleOnFlight: ROLE_MAP[person.role] || "OTHER" },
          });
          crewLinked++;
        } else {
          // Passenger: idempotent on (movementId, passportHash)
          const passportHash = hashPII(person.docNumber);
          const existing = passportHash
            ? await prisma.passenger.findFirst({
                where: { movementId: movement.id, passportHash },
              })
            : null;

          if (existing) {
            await prisma.passenger.update({
              where: { id: existing.id },
              data: {
                givenNames: person.givenNames,
                surname: person.surname,
                fullNameHash: hashPII(person.fullName),
                passportEncrypted: encrypt(person.docNumber),
                passportType: person.docType,
                passportCountry: person.country,
                passportExpiry: person.docExpiry,
                dobEncrypted: encrypt(person.dob),
                gender: person.gender,
                nationality: person.country,
                unmatched: person.unmatched,
                source: "NETJETS",
              },
            });
            passengersUpdated++;
          } else {
            await prisma.passenger.create({
              data: {
                movementId: movement.id,
                givenNames: person.givenNames,
                surname: person.surname,
                fullNameHash: hashPII(person.fullName),
                passportEncrypted: encrypt(person.docNumber),
                passportHash,
                passportType: person.docType,
                passportCountry: person.country,
                passportExpiry: person.docExpiry,
                dobEncrypted: encrypt(person.dob),
                gender: person.gender,
                nationality: person.country,
                status: "CONFIRMED",
                unmatched: person.unmatched,
                source: "NETJETS",
              },
            });
            passengersCreated++;
          }
        }
      }

      await prisma.eventLog.create({
        data: {
          visitId: visit.id,
          movementId: movement.id,
          userId: session.user.id,
          action: "NetJets PDF importado",
          details: `${fl.callSign || fl.rqst} (${reg}) — ${fl.persons.length} personas`,
        },
      });
    }
  }

  eventBus.emit({
    type: "flight_updated",
    flightId: "import-netjets",
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `NetJets: ${passengersCreated} pax, ${crewLinked} crew, ${movementsCreated + movementsMatched} vuelos`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    movementsMatched,
    movementsCreated,
    passengersCreated,
    passengersUpdated,
    crewLinked,
    warnings,
  });
}
