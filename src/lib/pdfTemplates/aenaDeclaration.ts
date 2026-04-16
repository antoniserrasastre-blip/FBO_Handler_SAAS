// AENA General Declaration PDF template
// Replicates the "DETALLE DE VUELOS EN TERMINAL DE AVIACION GENERAL — AEROPUERTO PMI" form
// Uses pdfkit for coordinate-based drawing on A4 pages

import PDFDocument from "pdfkit";

export interface CrewEntry {
  fullName: string;
  nationality?: string;
  passportNumber?: string;
  dateOfBirth?: string;
}

export interface PassengerEntry {
  fullName: string;
  nationality?: string;
  passportNumber?: string;
  dateOfBirth?: string;
  type?: "PAX" | "CREW";
}

export interface AenaDeclarationOptions {
  direction: "LLEGADAS" | "SALIDAS";
  fecha: string;
  hora: string;
  callsign: string;
  origin: string;
  registration: string;
  crewCount: number;
  paxCount: number;
  parking?: string;
  agentHandling?: string;
  crew?: CrewEntry[];
  passengers?: PassengerEntry[];
  blank?: boolean; // If true, draw ruled lines instead of data
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

function drawGrid(doc: PDFKit.PDFDocument, opts: AenaDeclarationOptions) {
  const y = 130;
  const cellH = 32;
  const cols = [
    { label: "FECHA", value: opts.fecha, width: 65 },
    { label: "HORA", value: opts.hora, width: 50 },
    { label: "VUELO", value: opts.callsign, width: 70 },
    { label: "ORIGEN/DESTINO", value: opts.origin, width: 85 },
    { label: "MATRICULA", value: opts.registration, width: 75 },
    { label: "PKG", value: opts.parking || "", width: 40 },
    { label: "CREW", value: String(opts.crewCount), width: 40 },
    { label: "PAX", value: String(opts.paxCount), width: 40 },
    { label: "AGENTE", value: opts.agentHandling || "MALLORCAIR", width: CONTENT_WIDTH - 465 },
  ];

  let x = MARGIN;
  for (const col of cols) {
    doc.rect(x, y, col.width, cellH).stroke();
    doc.fontSize(6).fillColor("#666666").text(col.label, x + 3, y + 3, { width: col.width - 6 });
    doc.fontSize(9).fillColor("#000000").text(col.value, x + 3, y + 14, { width: col.width - 6 });
    x += col.width;
  }

  return y + cellH;
}

function drawDataSection(doc: PDFKit.PDFDocument, startY: number, opts: AenaDeclarationOptions) {
  const headerY = startY + 12;
  const headerH = 20;

  // Section header
  doc.rect(MARGIN, headerY, CONTENT_WIDTH, headerH).fill("#E5E7EB");
  doc.fontSize(7).fillColor("#374151").text(
    "DATOS REQUERIDOS:   NOMBRE Y APELLIDOS   |   DNI O PASAPORTE   |   NAC   |   FECHA NACIMIENTO   |   PAX/CREW",
    MARGIN + 4, headerY + 6, { width: CONTENT_WIDTH - 8 }
  );

  let y = headerY + headerH + 4;
  const lineH = 14;
  const maxY = A4_HEIGHT - 120; // Leave room for signature block

  if (opts.blank || (!opts.crew?.length && !opts.passengers?.length)) {
    // Draw ruled lines for handwriting
    doc.fontSize(7).fillColor("#9CA3AF").text("CREW:", MARGIN + 4, y + 2);
    y += lineH;
    for (let i = 0; i < 6; i++) {
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor("#D1D5DB").lineWidth(0.5).stroke();
      y += lineH;
    }
    y += 4;
    doc.fontSize(7).fillColor("#9CA3AF").text("PAX:", MARGIN + 4, y + 2);
    y += lineH;
    while (y < maxY - lineH) {
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor("#D1D5DB").lineWidth(0.5).stroke();
      y += lineH;
    }
  } else {
    // Populated mode
    const colWidths = { name: 180, passport: 100, nat: 50, dob: 80, type: 40 };

    // Column headers
    doc.fontSize(6).fillColor("#6B7280");
    let cx = MARGIN + 4;
    doc.text("NOMBRE Y APELLIDOS", cx, y + 2); cx += colWidths.name;
    doc.text("DNI / PASAPORTE", cx, y + 2); cx += colWidths.passport;
    doc.text("NAC", cx, y + 2); cx += colWidths.nat;
    doc.text("F. NACIMIENTO", cx, y + 2); cx += colWidths.dob;
    doc.text("TIPO", cx, y + 2);
    y += lineH;

    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor("#9CA3AF").lineWidth(0.5).stroke();
    y += 2;

    // Crew label
    if (opts.crew && opts.crew.length > 0) {
      doc.fontSize(7).fillColor("#1E40AF").text("CREW", MARGIN + 4, y + 2);
      y += lineH;

      for (const c of opts.crew) {
        if (y > maxY) break;
        cx = MARGIN + 4;
        doc.fontSize(8).fillColor("#000000");
        doc.text(c.fullName, cx, y + 2, { width: colWidths.name - 8 }); cx += colWidths.name;
        doc.text(c.passportNumber || "", cx, y + 2, { width: colWidths.passport - 8 }); cx += colWidths.passport;
        doc.text(c.nationality || "", cx, y + 2, { width: colWidths.nat - 8 }); cx += colWidths.nat;
        doc.text(c.dateOfBirth || "", cx, y + 2, { width: colWidths.dob - 8 }); cx += colWidths.dob;
        doc.text("CREW", cx, y + 2);
        y += lineH;
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor("#E5E7EB").lineWidth(0.3).stroke();
      }
      y += 4;
    }

    // Pax label
    if (opts.passengers && opts.passengers.length > 0) {
      doc.fontSize(7).fillColor("#B45309").text("PAX", MARGIN + 4, y + 2);
      y += lineH;

      for (const p of opts.passengers) {
        if (y > maxY) break;
        cx = MARGIN + 4;
        doc.fontSize(8).fillColor("#000000");
        doc.text(p.fullName, cx, y + 2, { width: colWidths.name - 8 }); cx += colWidths.name;
        doc.text(p.passportNumber || "", cx, y + 2, { width: colWidths.passport - 8 }); cx += colWidths.passport;
        doc.text(p.nationality || "", cx, y + 2, { width: colWidths.nat - 8 }); cx += colWidths.nat;
        doc.text(p.dateOfBirth || "", cx, y + 2, { width: colWidths.dob - 8 }); cx += colWidths.dob;
        doc.text("PAX", cx, y + 2);
        y += lineH;
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor("#E5E7EB").lineWidth(0.3).stroke();
      }
    }
  }

  return y;
}

function drawSignatureBlock(doc: PDFKit.PDFDocument) {
  const y = A4_HEIGHT - 100;
  const blockH = 50;
  const halfW = CONTENT_WIDTH / 2;

  doc.rect(MARGIN, y, halfW, blockH).stroke();
  doc.rect(MARGIN + halfW, y, halfW, blockH).stroke();

  doc.fontSize(7).fillColor("#6B7280");
  doc.text("Nombre:", MARGIN + 6, y + 6);
  doc.text("N Tarjeta Identificacion Personal:", MARGIN + 6, y + 22);
  doc.text("Firma:", MARGIN + 6, y + 36);

  doc.text("Sello Agente Handling", MARGIN + halfW + 6, y + 6);
  doc.text("MALLORCAIR S.L.", MARGIN + halfW + 6, y + 22);

  // Legal footer
  doc.fontSize(5).fillColor("#9CA3AF").text(
    "Los datos personales recogidos seran tratados por AENA S.M.E., S.A. para cumplir las obligaciones legales en materia de seguridad aeroportuaria.",
    MARGIN, A4_HEIGHT - 40, { width: CONTENT_WIDTH, align: "center" }
  );
}

export function generateAenaDeclaration(optsList: AenaDeclarationOptions[]): Buffer {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  for (let i = 0; i < optsList.length; i++) {
    if (i > 0) doc.addPage();
    const opts = optsList[i];

    // Header
    doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, 30).fill("#1F2937");
    doc.fontSize(8).fillColor("#FFFFFF").text(
      "DETALLE DE VUELOS EN TERMINAL DE AVIACION GENERAL",
      MARGIN + 8, MARGIN + 6, { width: CONTENT_WIDTH - 16 }
    );
    doc.fontSize(7).text("AEROPUERTO PMI (PALMA DE MALLORCA)", MARGIN + 8, MARGIN + 17, { width: CONTENT_WIDTH - 16 });

    // Direction banner
    const bannerY = MARGIN + 34;
    const bannerColor = opts.direction === "LLEGADAS" ? "#2563EB" : "#EA580C";
    doc.rect(MARGIN, bannerY, CONTENT_WIDTH, 22).fill(bannerColor);
    doc.fontSize(12).fillColor("#FFFFFF").text(opts.direction, MARGIN + 8, bannerY + 5, { width: CONTENT_WIDTH - 16 });

    // Flight info grid
    doc.strokeColor("#374151").lineWidth(0.5).fillColor("#000000");
    const gridEndY = drawGrid(doc, opts);

    // Data section (crew/pax list or ruled lines)
    drawDataSection(doc, gridEndY, opts);

    // Signature block
    drawSignatureBlock(doc);
  }

  doc.end();

  // Collect all chunks into a single Buffer
  return Buffer.concat(chunks);
}

// Async wrapper for streaming contexts
export async function generateAenaDeclarationAsync(optsList: AenaDeclarationOptions[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (let i = 0; i < optsList.length; i++) {
      if (i > 0) doc.addPage();
      const opts = optsList[i];

      doc.rect(MARGIN, MARGIN, CONTENT_WIDTH, 30).fill("#1F2937");
      doc.fontSize(8).fillColor("#FFFFFF").text(
        "DETALLE DE VUELOS EN TERMINAL DE AVIACION GENERAL",
        MARGIN + 8, MARGIN + 6, { width: CONTENT_WIDTH - 16 }
      );
      doc.fontSize(7).text("AEROPUERTO PMI (PALMA DE MALLORCA)", MARGIN + 8, MARGIN + 17, { width: CONTENT_WIDTH - 16 });

      const bannerY = MARGIN + 34;
      const bannerColor = opts.direction === "LLEGADAS" ? "#2563EB" : "#EA580C";
      doc.rect(MARGIN, bannerY, CONTENT_WIDTH, 22).fill(bannerColor);
      doc.fontSize(12).fillColor("#FFFFFF").text(opts.direction, MARGIN + 8, bannerY + 5, { width: CONTENT_WIDTH - 16 });

      doc.strokeColor("#374151").lineWidth(0.5).fillColor("#000000");
      const gridEndY = drawGrid(doc, opts);
      drawDataSection(doc, gridEndY, opts);
      drawSignatureBlock(doc);
    }

    doc.end();
  });
}
