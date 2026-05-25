// /api/import/extras — Excel "extras" import. v2 implementation.
//
// Cross-references by aircraft registration against the Visits of the target
// Palma operating day. If no Visit exists yet (Excel arrived before the
// Cybermax PDF), an orphan Visit is created — it will be enriched when the
// PDF later imports.
//
// RECONCILIATION POLICY — additive-only, never destructive:
//
//   The import only ADDS services that are not already present.  It NEVER
//   deletes or modifies services that already exist (whether added manually
//   via the web UI or by a previous import).
//
//   EQUIVALENCE KEY (what "already present" means):
//     • When `reference` is non-null (NJE orders): same visitId + type + reference.
//       Two NJE rows with different references are different services.
//       Same reference on the same visit → skip (idempotent).
//     • When `reference` is null: same visitId + type + direction + target + customName.
//       This covers Catering Aire, MCR newspapers, THERMOS, DISHES, etc.
//       CUSTOM services include customName in the key so two distinct custom
//       descriptions are not collapsed.
//     • For quantity-expanded services (e.g. "2 TERMOS"), count existing rows
//       that match the key.  If existingCount >= quantityNeeded, skip entirely.
//       If existingCount < quantityNeeded, create only the missing (quantity - existingCount).
//       Conservative default: when in doubt, do NOT create (avoids duplicates).

import { NextRequest, NextResponse } from "next/server";
import { requireWriter } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { parseExtrasExcel } from "@/lib/excelParser";
import { palmaDayUtc } from "@/lib/time";
import { validateUpload, validateContentLength } from "@/lib/uploadValidation";
import { eventBus } from "@/lib/events";
import { SERVICE_TYPE_DEFAULT_PHASE, type ServiceType } from "@/types";
import { upsertAircraft, upsertVisit } from "@/lib/v2/upsert";

// --- Equivalence key helpers ---

/** A minimal representation of an existing Service row used for dedup checks. */
interface ExistingService {
  type: string;
  direction: string;
  target: string | null;
  reference: string | null;
  customName: string | null;
}

/**
 * Build the deduplication key for an incoming Excel service.
 * This must mirror `existingServiceKey()` so the two sides can be compared.
 *
 * Key shape:
 *   With reference (NJE):   "type|REF:<reference>"
 *   Without reference:      "type|<direction>|<target>|<customName>"
 *
 * CUSTOM services always include customName; other types include it only when
 * it differs from the type label (i.e. it carries actual information).
 */
function incomingServiceKey(
  type: string,
  direction: string,
  target: string | null | undefined,
  reference: string | null | undefined,
  customName: string | null | undefined,
): string {
  if (reference) return `${type}|REF:${reference}`;
  return `${type}|${direction}|${target ?? ""}|${customName ?? ""}`;
}

/** Same key formula applied to an existing DB row. */
function existingServiceKey(svc: ExistingService): string {
  if (svc.reference) return `${svc.type}|REF:${svc.reference}`;
  return `${svc.type}|${svc.direction}|${svc.target ?? ""}|${svc.customName ?? ""}`;
}

const ORIGIN_MAP: Record<string, string> = {
  NetJets: "NETJETS",
  "Catering Aire": "CATERING_AIRE",
  MCR: "MCR",
};

export async function POST(req: NextRequest) {
  const { error } = await requireWriter();
  if (error) return error;

  const lenCheck = validateContentLength(req.headers.get("content-length"), "xlsx");
  if (!lenCheck.ok) return NextResponse.json({ error: lenCheck.message }, { status: lenCheck.status });

  const formData = await req.formData();
  const files = formData.getAll("xlsx") as File[];
  if (!files.length) return NextResponse.json({ error: "No se envio archivo Excel" }, { status: 400 });

  for (const file of files) {
    const v = validateUpload(file, "xlsx");
    if (!v.ok) return NextResponse.json({ error: v.message }, { status: v.status });
  }

  const allExtras: ReturnType<typeof parseExtrasExcel>["extras"] = [];
  const allErrors: string[] = [];
  let date = "";

  for (const file of files) {
    try {
      const result = parseExtrasExcel(Buffer.from(await file.arrayBuffer()));
      if (!date && result.date) date = result.date;
      for (const extra of result.extras) allExtras.push({ ...extra, date: result.date || undefined });
      if (result.errors?.length) allErrors.push(...result.errors.map((e: string) => `[${file.name}] ${e}`));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error procesando Excel";
      allErrors.push(`[${file.name}] ${msg}`);
    }
  }

  if (!allExtras.length && allErrors.length) {
    return NextResponse.json({ error: allErrors.join("; "), extras: [], errors: allErrors }, { status: 500 });
  }

  return NextResponse.json({ date, extras: allExtras, errors: allErrors });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireWriter();
  if (error) return error;

  const body = await req.json();
  const { extras, date: globalDate } = body;
  if (!extras || !Array.isArray(extras)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  // Group extras by date
  const byDate = new Map<string, typeof extras>();
  for (const extra of extras) {
    const d = extra.date || globalDate || new Date().toISOString().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(extra);
  }

  let matched = 0;
  let servicesCreated = 0;
  const pendingCreated: string[] = [];
  const datesProcessed = new Set<string>();

  for (const [dateStr, dateExtras] of byDate) {
    datesProcessed.add(dateStr);
    const palmaDay = palmaDayUtc(dateStr);

    // Build a lookup of Visits for this Palma day, keyed by registration.
    const visitsToday = await prisma.visit.findMany({
      where: { palmaDay },
      include: { aircraft: true },
    });
    const visitByReg = new Map<string, { id: string; aircraftId: string }>();
    for (const v of visitsToday) {
      const reg = v.aircraft.registration.toUpperCase();
      visitByReg.set(reg, v);
      visitByReg.set(reg.replace(/-/g, ""), v);
    }

    // Pernoctas: Visits from earlier days whose departureDate falls on this day
    const pernoctaVisits = await prisma.visit.findMany({
      where: {
        palmaDay: { not: palmaDay },
        departureDate: palmaDay,
      },
      include: { aircraft: true },
    });
    for (const v of pernoctaVisits) {
      const reg = v.aircraft.registration.toUpperCase();
      if (!visitByReg.has(reg)) visitByReg.set(reg, v);
      if (!visitByReg.has(reg.replace(/-/g, ""))) visitByReg.set(reg.replace(/-/g, ""), v);
    }

    // Cache of existing services per visit (loaded on first access for that visit).
    // Key: visitId → Map<equivalenceKey, count>
    const existingByVisit = new Map<string, Map<string, number>>();

    async function getExistingKeyCounts(visitId: string): Promise<Map<string, number>> {
      if (existingByVisit.has(visitId)) return existingByVisit.get(visitId)!;
      const rows = await prisma.service.findMany({
        where: { visitId },
        select: { type: true, direction: true, target: true, reference: true, customName: true },
      });
      const counts = new Map<string, number>();
      for (const row of rows) {
        const k = existingServiceKey(row);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      existingByVisit.set(visitId, counts);
      return counts;
    }

    for (const extra of dateExtras) {
      const reg = extra.registration.toUpperCase();
      const regNoDash = reg.replace(/-/g, "");
      let visit = visitByReg.get(reg) || visitByReg.get(regNoDash);

      if (!visit) {
        // Orphan: create Aircraft + Visit, no Movements yet.
        const aircraft = await upsertAircraft({ registration: extra.registration });
        const { record: orphanVisit } = await upsertVisit({ aircraftId: aircraft.id, palmaDay });
        // The orphan visit has only the base fields; cast to the map's key type
        // (only .id is used within this loop body).
        const slimVisit: { id: string; aircraftId: string } = orphanVisit;
        visit = slimVisit;
        pendingCreated.push(extra.registration);
        visitByReg.set(reg, slimVisit);
        await prisma.eventLog.create({
          data: {
            visitId: orphanVisit.id,
            userId: session.user.id,
            action: "Visit creada desde extras (matricula no encontrada en orden del dia)",
          },
        });
      }

      matched++;

      // Load existing services for this visit to drive the dedup check.
      const existingCounts = await getExistingKeyCounts(visit.id);
      let servicesCreatedForThisExtra = 0;

      for (const svc of extra.services) {
        if (!svc.name || svc.name.length < 2) continue;

        const direction = SERVICE_TYPE_DEFAULT_PHASE[svc.type as ServiceType] ?? "DEPARTURE";
        const reference = svc.reference || null;
        const target = svc.target || null;
        const customName = svc.type === "CUSTOM"
          ? svc.name
          : (svc.name !== svc.type ? svc.name : null);

        const eqKey = incomingServiceKey(svc.type, direction, target, reference, customName);

        // How many of this key already exist in the visit?
        const alreadyPresent = existingCounts.get(eqKey) ?? 0;
        const wantedTotal = svc.quantity || 1;
        const toCreate = Math.max(0, wantedTotal - alreadyPresent);

        for (let i = 0; i < toCreate; i++) {
          await prisma.service.create({
            data: {
              visitId: visit.id,
              type: svc.type,
              direction,
              customName,
              state: "PENDING",
              reference,
              target,
              origin: svc.origin ? (ORIGIN_MAP[svc.origin] || "OTHER") : null,
              rawDescription: svc.name,
              quantity: 1,
            },
          });
          servicesCreated++;
          servicesCreatedForThisExtra++;
          // Keep the in-memory count up to date so subsequent passes within
          // the same import run stay consistent.
          existingCounts.set(eqKey, (existingCounts.get(eqKey) ?? 0) + 1);
        }
      }

      await prisma.eventLog.create({
        data: {
          visitId: visit.id,
          userId: session.user.id,
          action: `Extras importados desde Excel (${servicesCreatedForThisExtra} nuevos de ${extra.services.length} en Excel)`,
        },
      });
    }
  }

  const dateList = Array.from(datesProcessed).sort().join(", ");
  eventBus.emit({
    type: "service_created",
    flightId: "import-extras",
    userId: session.user.id,
    userName: session.user.name || undefined,
    detail: `Extras: ${servicesCreated} servicios para ${matched} visitas (${dateList})`,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    matched,
    servicesCreated,
    notFound: [],
    pendingCreated,
    datesProcessed: Array.from(datesProcessed).sort(),
    total: extras.length,
  });
}
