// Sondas ATA/ATD — derivación de horas reales desde el event log (/dia).
//
// Contexto investigado antes de escribir estas sondas:
//  - NINGÚN endpoint incluye eventLogs en la respuesta de vuelos hoy
//    (src/app/api/flights/route.ts include: sin eventLogs; FlightView en
//    src/lib/flightView.ts tampoco los serializa). No existe por tanto un
//    orderBy real en el fetch. La convención de TODOS los consumidores de UI
//    (VisitCard.tsx:840 y FlightCard.tsx:303 usan eventLogs[0] como
//    LastModifiedBadge; FlightDetailPanel.tsx:224 hace slice(0,12) para
//    "Actividad reciente") es eventLogs[0] = MÁS RECIENTE, es decir, orden
//    DESC por timestamp. Las sondas usan ese orden.
//  - Texto real del endpoint manual (src/app/api/flights/[id]/route.ts:158):
//    `Estado → ${rawBody.state}` con códigos EXPECTED/ON_BLOCKS/PARKED/
//    TURNAROUND/BOARDING/OFF_BLOCKS, unidos con ", " si hay varios cambios.
//  - Texto real de la auto-transición (src/app/api/flights/[id]/route.ts:170
//    y src/app/api/services/[id]/route.ts:151):
//    `Auto-transición → ${FLIGHT_STATE_CONFIG[next].label}` — la ETIQUETA en
//    castellano ("En calzos", "Fuera de calzos"), NO el código de estado.

import { describe, it, expect } from "vitest";
import { deriveATA, deriveATD, type FlightLite } from "./diaHelpers";
import type { EventLog } from "@/types/compat";

function mk(partial: Partial<FlightLite> = {}): FlightLite {
  return {
    id: "f1",
    callsign: "TST1",
    state: "EXPECTED",
    eta: null,
    etd: null,
    ata: null,
    atd: null,
    arrivalDate: null,
    departureDate: null,
    fuelState: "NOT_REQUESTED",
    toiletState: "NOT_REQUESTED",
    livePhase: null,
    liveLastSeenAt: null,
    liveOnGround: null,
    services: [],
    eventLogs: [],
    ...partial,
  } as FlightLite;
}

const day = new Date(Date.UTC(2026, 4, 12, 0, 0, 0));
const now = new Date(Date.UTC(2026, 4, 12, 10, 0, 0)); // 10:00 Z on the day
void day;
void now;

function log(action: string, hh: number, mm: number): EventLog {
  return {
    id: `e-${hh}${mm}`,
    visitId: "f1",
    userId: null,
    action,
    details: null,
    timestamp: new Date(Date.UTC(2026, 4, 12, hh, mm)),
  } as EventLog;
}

describe("deriveATA — mis-click del handler (doble transición a llegada)", () => {
  it("con dos transiciones a ARRIVING la ATA operativa es la PRIMERA (el avión aterrizó una vez)", () => {
    // Secuencia real: 10:00 aterriza, 10:05 lo pasan a PARKED, 10:07 mis-click
    // lo devuelve a ARRIVING. Array en orden DESC (más reciente primero), que
    // es la convención de eventLogs[0] = último cambio en toda la UI.
    const f = mk({
      eventLogs: [
        log("Estado → ARRIVING", 10, 7), // mis-click
        log("Estado → PARKED", 10, 5),
        log("Estado → ARRIVING", 10, 0), // aterrizaje real
      ],
    });
    // deriveATA (diaHelpers.ts:136) devuelve el PRIMER elemento del array que
    // matchea → con orden desc devuelve 10:07, la hora del mis-click.
    // Operativamente la ATA correcta es 10:00.
    expect(deriveATA(f)).toBe("10:00");
  });
});

describe("deriveATA/ATD — compatibilidad con el texto real del endpoint manual", () => {
  it("matchea el string exacto que escribe hoy PATCH /api/flights/[id]: 'Estado → ON_BLOCKS'", () => {
    // flights/[id]/route.ts:158 escribe `Estado → ${rawBody.state}` con
    // flecha U+2192 y el código tal cual. El fix PII A3 (b35592c, 03-06-2026)
    // solo tocó gender/nationality, no este texto.
    const f = mk({ eventLogs: [log("Estado → ON_BLOCKS", 9, 45)] });
    expect(deriveATA(f)).toBe("09:45");
  });

  it("matchea cuando el cambio de estado viene combinado con otros cambios (changes.join(', '))", () => {
    // El endpoint une todos los cambios en una sola action:
    // p.ej. "Fuel → REQUESTED, Estado → ON_BLOCKS"
    const f = mk({ eventLogs: [log("Fuel → REQUESTED, Estado → ON_BLOCKS", 9, 50)] });
    expect(deriveATA(f)).toBe("09:50");
  });

  it("deriveATD matchea 'Estado → OFF_BLOCKS' (texto real de salida manual)", () => {
    const f = mk({ eventLogs: [log("Estado → OFF_BLOCKS", 12, 10)] });
    expect(deriveATD(f)).toBe("12:10");
  });
});

describe("deriveATA/ATD — compatibilidad con el texto real de las auto-transiciones", () => {
  it("deriveATA reconoce el texto real 'Auto-transición → En calzos' (label, no código)", () => {
    // services/[id]/route.ts:151 y flights/[id]/route.ts:170 escriben
    // `Auto-transición → ${FLIGHT_STATE_CONFIG[next].label}` — para ON_BLOCKS
    // el label es "En calzos" (types/index.ts:126). El regex de diaHelpers
    // (línea 139) exige el CÓDIGO (ARRIVING|ON_BLOCKS) tras la flecha, así
    // que el texto real nunca matchea y la ATA derivada muere en silencio.
    const f = mk({ eventLogs: [log("Auto-transición → En calzos", 9, 45)] });
    expect(deriveATA(f)).toBe("09:45");
  });

  it("deriveATD reconoce el texto real 'Auto-transición → Fuera de calzos'", () => {
    // Label de OFF_BLOCKS en FLIGHT_STATE_CONFIG (types/index.ts:152).
    const f = mk({ eventLogs: [log("Auto-transición → Fuera de calzos", 12, 30)] });
    expect(deriveATD(f)).toBe("12:30");
  });
});

describe("deriveATD — guardia liveOnGround en el fallback live", () => {
  it("livePhase DEPARTED con liveOnGround null no inventa ATD (puede seguir en tierra)", () => {
    const f = mk({
      livePhase: "DEPARTED",
      liveLastSeenAt: new Date(Date.UTC(2026, 4, 12, 11, 0)),
      liveOnGround: null,
    });
    expect(deriveATD(f)).toBeNull();
  });

  it("livePhase DEPARTED con liveOnGround true no inventa ATD (sigue en tierra)", () => {
    const f = mk({
      livePhase: "DEPARTED",
      liveLastSeenAt: new Date(Date.UTC(2026, 4, 12, 11, 0)),
      liveOnGround: true,
    });
    expect(deriveATD(f)).toBeNull();
  });
});

describe("deriveATA/ATD — no debe haber falsos matches con textos reales que mencionan estados", () => {
  it("un servicio custom cuyo nombre contiene 'ARRIVING' no genera ATA", () => {
    // services/route.ts:45 escribe `Servicio añadido: ${type} (${customName})`
    // con customName libre del handler.
    const f = mk({
      eventLogs: [log("Servicio añadido: CUSTOM (Briefing ARRIVING crew)", 8, 30)],
    });
    expect(deriveATA(f)).toBeNull();
  });

  it("un objeto perdido cuya descripción contiene 'DEPARTED' no genera ATD", () => {
    // lost-items/[id]/route.ts:47 escribe `Objeto "${desc}": ${changes}` donde
    // changes incluye `Estado → FOUND|CLAIMED|DELIVERED` — la palabra DEPARTED
    // puede aparecer en la descripción libre, antes del "Estado →".
    const f = mk({
      eventLogs: [log('Objeto "cargador pax DEPARTED ayer": Estado → CLAIMED', 13, 0)],
    });
    expect(deriveATD(f)).toBeNull();
  });

  it("el log de live-tracking 'live → ON_BLOCKS' no genera ATA por regex (la ATA llega por el campo m.ata)", () => {
    // liveTracking.ts:156 escribe `live → ${phase}`; no lleva "Estado" delante.
    // No debe matchear: liveTracking ya fija movement.ata directamente
    // (liveTracking.ts:140-142), y un match aquí duplicaría la fuente.
    const f = mk({ eventLogs: [log("live → ON_BLOCKS", 9, 58)] });
    expect(deriveATA(f)).toBeNull();
  });
});
