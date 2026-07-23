// Sprint 04 board-del-turno — fase ROJA. TEST-WRITER.
// T7 — import_daily acepta upload_id XOR pdf_base64 (C12). Con upload_id: lee el
// fichero del dir de uploads, MISMAS guardas y pipeline que base64 (efectos
// byte-idénticos); dry-run NO consume, confirm SÍ. Contrato: §S4 C12.
//
// Reusa el harness de mocks de tools-ciclo.test.ts (db + pdfParser + eventos +
// sweep). El fichero de upload es REAL (fs) en un dir temporal.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { AgentAuth, ImportDailyPreviewResult } from "@/lib/mcp/contract";

const mocks = vi.hoisted(() => ({
  aircraftFindUnique: vi.fn(),
  aircraftCreate: vi.fn(),
  aircraftUpdate: vi.fn(),
  operatorUpsert: vi.fn(),
  operatorFindFirst: vi.fn(),
  operatorFindUnique: vi.fn(),
  visitFindMany: vi.fn(),
  visitFindFirst: vi.fn(),
  visitCreate: vi.fn(),
  visitUpdate: vi.fn(),
  visitFindUnique: vi.fn(),
  movementFindUnique: vi.fn(),
  movementUpsert: vi.fn(),
  movementUpdate: vi.fn(),
  movementUpdateMany: vi.fn(),
  movementFindFirst: vi.fn(),
  eventLogCreate: vi.fn(),
  eventLogFindFirst: vi.fn(),
  incidentCreate: vi.fn(),
  applyAutoTransition: vi.fn(),
  emit: vi.fn(),
  sweepNoShows: vi.fn(),
  parseCybermaxPdf: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aircraft: { findUnique: mocks.aircraftFindUnique, create: mocks.aircraftCreate, update: mocks.aircraftUpdate },
    operator: { upsert: mocks.operatorUpsert, findFirst: mocks.operatorFindFirst, findUnique: mocks.operatorFindUnique },
    visit: {
      findMany: mocks.visitFindMany,
      findFirst: mocks.visitFindFirst,
      create: mocks.visitCreate,
      update: mocks.visitUpdate,
      findUnique: mocks.visitFindUnique,
    },
    movement: {
      findUnique: mocks.movementFindUnique,
      upsert: mocks.movementUpsert,
      update: mocks.movementUpdate,
      updateMany: mocks.movementUpdateMany,
      findFirst: mocks.movementFindFirst,
    },
    eventLog: { create: mocks.eventLogCreate, findFirst: mocks.eventLogFindFirst },
    incident: { create: mocks.incidentCreate },
  },
}));
vi.mock("@/lib/autoTransition", () => ({ applyAutoTransition: mocks.applyAutoTransition }));
vi.mock("@/lib/events", () => ({ eventBus: { emit: mocks.emit } }));
vi.mock("@/lib/noShowSweep", () => ({ sweepNoShows: mocks.sweepNoShows }));
vi.mock("@/lib/pdfParser", () => ({
  parseCybermaxPdf: mocks.parseCybermaxPdf,
  parseDate: (ddmmyy: string) => {
    const [dd, mm, yy] = ddmmyy.split("/").map(Number);
    const year = yy < 50 ? 2000 + yy : 1900 + yy;
    return new Date(Date.UTC(year, mm - 1, dd, 0, 0, 0, 0));
  },
}));

import { importDaily } from "@/lib/mcp/tools-ciclo";

const AUTH: AgentAuth = { tokenId: "tok-1", userId: "u-agent", userName: "agent-claude" };
type Call = Record<string, unknown>;
let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

const FLIGHT = {
  callsign: "NJE123",
  origin: "LFPB",
  arrivalDate: "23/07/26",
  eta: "09:00",
  registration: "9H-NEW",
  aircraftType: "C25A",
  parking: "P1",
  crewArrival: 2,
  crewDeparture: 2,
  paxArrival: 3,
  paxDeparture: 3,
  departureCallsign: "NJE123",
  destination: "LEMD",
  departureDate: "23/07/26",
  etd: "11:00",
};
const PARSE_OK = { date: "23/07/26", flights: [FLIGHT], errors: [], warnings: [] };
const PDF_B64 = Buffer.from("%PDF-1.4\n%daily mock\n").toString("base64");
const PDF_BYTES = Buffer.from("%PDF-1.4\n%daily mock\n");

let uploadDir: string;
let ORIG_DIR: string | undefined;

async function expectRejectsReal(p: Promise<unknown>, pattern?: RegExp) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).not.toMatch(/NotImplemented/i);
  if (pattern) expect((err as Error).message).toMatch(pattern);
}

// Los uploadId reales los genera /api/mcp/upload con crypto.randomUUID() → son
// UUID. El fixture usa un UUID válido para sobrevivir a la validación de formato
// que el implementer añadirá (MAJOR-1).
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

/** Escribe un upload real y devuelve su uploadId. */
function seedUpload(id = VALID_UUID): string {
  writeFileSync(join(uploadDir, `${id}.pdf`), PDF_BYTES);
  return id;
}

beforeEach(() => {
  vi.clearAllMocks();
  idSeq = 0;
  ORIG_DIR = process.env.MCP_UPLOAD_DIR;
  uploadDir = mkdtempSync(join(tmpdir(), "fbo-mcp-uploads-"));
  process.env.MCP_UPLOAD_DIR = uploadDir;

  mocks.aircraftFindUnique.mockResolvedValue(null);
  mocks.aircraftCreate.mockImplementation(async ({ data }: Call) => ({ id: nextId("ac"), ...(data as Call) }));
  mocks.operatorUpsert.mockImplementation(async ({ create }: Call) => ({ id: nextId("op"), ...(create as Call) }));
  mocks.operatorFindFirst.mockResolvedValue(null);
  mocks.operatorFindUnique.mockResolvedValue(null);
  mocks.visitFindMany.mockResolvedValue([]);
  mocks.visitFindFirst.mockResolvedValue(null);
  mocks.visitCreate.mockImplementation(async ({ data }: Call) => ({ id: nextId("v"), ...(data as Call) }));
  mocks.visitUpdate.mockImplementation(async ({ where, data }: Call) => ({ id: (where as Call).id, ...(data as Call) }));
  mocks.visitFindUnique.mockResolvedValue(null);
  mocks.movementFindUnique.mockResolvedValue(null);
  mocks.movementUpsert.mockImplementation(async ({ create }: Call) => {
    const c = create as Call;
    return { id: `${c.visitId as string}-${c.direction as string}`, ata: null, atd: null, livePhase: null, ...c };
  });
  mocks.movementUpdate.mockImplementation(async ({ where, data }: Call) => ({ id: (where as Call).id, ...(data as Call) }));
  mocks.movementUpdateMany.mockResolvedValue({ count: 0 });
  mocks.movementFindFirst.mockResolvedValue(null);
  mocks.eventLogCreate.mockResolvedValue({ id: "el-1" });
  mocks.eventLogFindFirst.mockResolvedValue(null);
  mocks.applyAutoTransition.mockResolvedValue(null);
  mocks.sweepNoShows.mockResolvedValue(0);
  mocks.parseCybermaxPdf.mockResolvedValue(PARSE_OK);
});
afterEach(() => {
  rmSync(uploadDir, { recursive: true, force: true });
  if (ORIG_DIR === undefined) delete process.env.MCP_UPLOAD_DIR;
  else process.env.MCP_UPLOAD_DIR = ORIG_DIR;
});

// ===========================================================================
// XOR upload_id / pdf_base64.
// ===========================================================================
describe("import_daily — upload_id XOR pdf_base64 (T7/C12)", () => {
  it("NINGUNO de los dos → Error que menciona upload_id (no sólo pdf_base64)", async () => {
    await expectRejectsReal(importDaily({}, AUTH), /upload_id/i);
  });

  it("AMBOS a la vez → Error (XOR, no se acepta la doble entrada)", async () => {
    await expectRejectsReal(importDaily({ pdf_base64: PDF_B64, upload_id: "up-123" }, AUTH), /upload_id|pdf_base64/i);
  });
});

// ===========================================================================
// Camino upload_id — dry-run (default) ≡ camino base64, sin consumir.
// ===========================================================================
describe("import_daily — camino upload_id (T7/C12)", () => {
  it("upload_id válido, dry-run → preview con toCancel, MISMOS efectos que base64, CERO escrituras", async () => {
    const id = seedUpload();
    const res = (await importDaily({ upload_id: id }, AUTH)) as ImportDailyPreviewResult;
    expect(res.flights).toHaveLength(1);
    expect(Array.isArray(res.toCancel)).toBe(true);
    // dry-run: cero escrituras.
    expect(mocks.visitCreate).not.toHaveBeenCalled();
    expect(mocks.eventLogCreate).not.toHaveBeenCalled();
  });

  it("el dry-run NO consume el uploadId (el fichero sigue ahí para el confirm)", async () => {
    const id = seedUpload();
    await importDaily({ upload_id: id }, AUTH);
    expect(existsSync(join(uploadDir, `${id}.pdf`))).toBe(true);
  });

  it("confirmar:true persiste y CONSUME el uploadId (unlink)", async () => {
    const id = seedUpload();
    await importDaily({ upload_id: id, confirmar: true }, AUTH);
    expect(mocks.visitCreate).toHaveBeenCalled(); // persistió por el pipeline real
    expect(existsSync(join(uploadDir, `${id}.pdf`))).toBe(false); // consumido
  });

  it("upload_id inexistente → Error claro en español (jamás internals)", async () => {
    await expectRejectsReal(importDaily({ upload_id: "no-existe" }, AUTH), /inválid|no.*(encontr|existe)|caduc|expir|upload/i);
  });

  it("caso feliz: upload_id = UUID válido apuntando a un fichero real → importa (dry-run)", async () => {
    const id = seedUpload(VALID_UUID);
    const res = (await importDaily({ upload_id: id }, AUTH)) as ImportDailyPreviewResult;
    expect(res.flights).toHaveLength(1);
    expect(mocks.parseCybermaxPdf).toHaveBeenCalled();
  });
});

// ===========================================================================
// MAJOR-1 (review adversarial) — path traversal vía upload_id. REGRESIÓN.
// El upload_id viene de los args de la tool (controlado por el agente) y sólo
// se le hace .trim(): un `../` escapa mcpUploadDir() y hace que el server
// lea/parsee (y con confirmar:true, importe) cualquier *.pdf del filesystem.
// La semántica a implementar: validar el FORMATO de upload_id (UUID, o rechazar
// `/ \ .`) ANTES del join. Estos tests están escritos contra ESA semántica →
// hoy FALLAN (el código aún lee y parsea el fichero externo plantado).
// ===========================================================================
describe("import_daily — MAJOR-1 path traversal vía upload_id (seguridad)", () => {
  // upload_ids maliciosos: cada uno, tras `${id}.pdf` + join, apunta a un
  // fichero REAL plantado FUERA del dir de uploads (o con separadores/`.` que
  // un UUID jamás tiene). Ninguno debe leerse ni parsearse.
  const ATAQUES: Array<[string, string]> = [
    ["doble-subida clásica", "../../evil"],
    ["subida simple a hermano", "../OUTSIDE"],
    ["separador incrustado", "a/b"],
    ["separadores windows", "..\\..\\x"],
    ["UUID con slash incrustado", `${VALID_UUID}/../evil`],
  ];

  it.each(ATAQUES)(
    "%s (upload_id=%j) → Error de formato/no-encontrado y JAMÁS lee/parsea el fichero externo",
    async (_label, malicious) => {
      // uploads anidado hondo para que incluso `../../` quede DENTRO de `base`
      // (limpieza garantizada, cero fugas fuera del tmp del test).
      const base = mkdtempSync(join(tmpdir(), "fbo-trav-"));
      try {
        const uploads = join(base, "d1", "d2", "d3", "uploads");
        mkdirSync(uploads, { recursive: true });
        process.env.MCP_UPLOAD_DIR = uploads;

        // Planta un PDF real EXACTAMENTE donde el join sin validar lo resolvería:
        // así, si el código lo lee, el ataque "tiene éxito" (parseo) → rojo.
        const target = join(uploads, `${malicious}.pdf`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, PDF_BYTES);

        let err: unknown;
        try {
          await importDaily({ upload_id: malicious }, AUTH);
        } catch (e) {
          err = e;
        }

        // 1) El fichero externo NUNCA debe abrirse ni pasar por pdfjs.
        expect(mocks.parseCybermaxPdf).not.toHaveBeenCalled();
        // 2) Debe rechazar con Error claro en español; jamás el guard de
        //    magic-bytes (%PDF) ni internals → prueba que se validó el FORMATO
        //    del upload_id antes de tocar el filesystem.
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).not.toMatch(/NotImplemented/i);
        expect((err as Error).message).not.toMatch(/%PDF/);
        expect((err as Error).message).toMatch(/inválid|no.*(encontr|existe)|upload/i);
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    }
  );

  it("con confirmar:true tampoco importa un fichero externo (no escribe en BD)", async () => {
    const base = mkdtempSync(join(tmpdir(), "fbo-trav-"));
    try {
      const uploads = join(base, "d1", "d2", "d3", "uploads");
      mkdirSync(uploads, { recursive: true });
      process.env.MCP_UPLOAD_DIR = uploads;
      const target = join(uploads, "../../evil.pdf");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, PDF_BYTES);

      let err: unknown;
      try {
        await importDaily({ upload_id: "../../evil", confirmar: true }, AUTH);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Error);
      expect(mocks.parseCybermaxPdf).not.toHaveBeenCalled();
      expect(mocks.visitCreate).not.toHaveBeenCalled(); // nada llegó a BD
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
