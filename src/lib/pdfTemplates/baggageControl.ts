// Baggage control sheet PDF template — "HOJA DE CONTROL EQUIPAJE EN BODEGA".
// Replicates the Mallorcair Excel slip (Control_Bodega_Impresion sheet), but
// driven straight from the operational DB instead of the spreadsheet formulas.
//
// Layout: A4 portrait, 4 horizontal slips per page, single-sided. Flight data
// is pre-printed; the boxes for bag counts and the FILTRO / PISTA / COMANDANTE
// signatures are left blank to be filled in by hand when passing the control.
// Dashed cut lines (✂) separate the slips so a page can be guillotined into 4.
//
// Structure mirrors the original sheet:
//   · Title band with the Mallorcair logo (top-left) + sheet title
//   · Flight data row:  Fecha · Nº Vuelo · Destino · Matrícula · Tipo · Hora · Pax
//   · Bag-count row:    TOTAL BULTOS · Filtro Parcial · Filtro Final ·
//                       Pista Parcial · Pista Final · Totales Pista
//   · Signature blocks: FILTRO / PISTA / COMANDANTE  →  Firma / Nombre / Hora

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const LOGO_PATH = (() => {
  try {
    const p = path.join(process.cwd(), "public", "branding", "mallorcair-logo.jpeg");
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
})();
const LOGO_RATIO = 1356855 / 698500; // width/height from the original drawing (≈1.943)

export interface BaggageSheetData {
  fecha: string; // DD/MM/YY (departure scheduled date)
  callsign: string; // Nº de vuelo
  destination: string; // Destino (ICAO)
  registration: string; // Matrícula
  aircraftType: string; // Tipo
  hora: string; // Hora de salida (Zulu HH:MM)
  paxCount: number; // Pax de salida (estimado del import)
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 26;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;
const SLIPS_PER_PAGE = 4;
const GAP = 12; // vertical gap between slips (the scissors line sits here)
const SLIP_H = (A4_HEIGHT - MARGIN * 2 - GAP * (SLIPS_PER_PAGE - 1)) / SLIPS_PER_PAGE;

const INK = "#111827";
const MUTED = "#6B7280";
const LINE = "#374151";
const HAIR = "#9CA3AF";
const ACCENT = "#E8772E"; // Mallorcair orange

function drawScissors(doc: PDFKit.PDFDocument, x: number, y: number) {
  // tiny scissors glyph (Helvetica lacks ✂), blades pointing right
  doc.save().lineWidth(0.6).strokeColor(HAIR);
  doc.circle(x, y - 2.4, 1.5).stroke();
  doc.circle(x, y + 2.4, 1.5).stroke();
  doc.moveTo(x + 1.3, y - 1.6).lineTo(x + 8, y + 1.2).stroke();
  doc.moveTo(x + 1.3, y + 1.6).lineTo(x + 8, y - 1.2).stroke();
  doc.restore();
}

function drawCutLine(doc: PDFKit.PDFDocument, y: number) {
  doc.save();
  doc.lineWidth(0.6).strokeColor(HAIR).dash(4, { space: 3 });
  doc.moveTo(MARGIN + 14, y).lineTo(MARGIN + CONTENT_WIDTH, y).stroke();
  doc.undash();
  doc.restore();
  drawScissors(doc, MARGIN + 2, y);
}

// One slip with its top-left corner at (x0, y0).
function drawSlip(doc: PDFKit.PDFDocument, x0: number, y0: number, data: BaggageSheetData) {
  const W = CONTENT_WIDTH;
  doc.lineWidth(0.8).strokeColor(LINE).fillColor(INK);

  // Outer frame + accent rule on top
  doc.rect(x0, y0, W, SLIP_H).stroke();
  doc.save().lineWidth(2).strokeColor(ACCENT);
  doc.moveTo(x0, y0 + 0.6).lineTo(x0 + W, y0 + 0.6).stroke();
  doc.restore();

  // --- Title band: logo (left) + title -----------------------------------
  const titleH = 34;
  if (LOGO_PATH) {
    const lh = 22;
    const lw = lh * LOGO_RATIO;
    try {
      doc.image(LOGO_PATH, x0 + 8, y0 + (titleH - lh) / 2, { width: lw, height: lh });
    } catch {
      doc.fontSize(11).fillColor(ACCENT).text("MALLORCAIR", x0 + 8, y0 + 11);
    }
  } else {
    doc.fontSize(11).fillColor(ACCENT).text("MALLORCAIR", x0 + 8, y0 + 11);
  }
  doc
    .fontSize(11)
    .fillColor(INK)
    .font("Helvetica-Bold")
    .text("HOJA DE CONTROL DE EQUIPAJE EN BODEGA", x0, y0 + 12, { width: W - 12, align: "right" });
  doc.font("Helvetica");
  // separator under title band
  doc.lineWidth(0.6).strokeColor(LINE);
  doc.moveTo(x0, y0 + titleH).lineTo(x0 + W, y0 + titleH).stroke();

  // --- Flight data row (pre-printed) --------------------------------------
  const dataY = y0 + titleH;
  const dataH = 28;
  const cols = [
    { label: "FECHA", value: data.fecha, frac: 0.13 },
    { label: "Nº VUELO", value: data.callsign, frac: 0.17 },
    { label: "DESTINO", value: data.destination, frac: 0.13 },
    { label: "MATRÍCULA", value: data.registration, frac: 0.18 },
    { label: "TIPO", value: data.aircraftType, frac: 0.13 },
    { label: "HORA", value: data.hora ? `${data.hora}z` : "", frac: 0.13 },
    { label: "PAX", value: String(data.paxCount), frac: 0.13 },
  ];
  let x = x0;
  for (const c of cols) {
    const cw = W * c.frac;
    doc.lineWidth(0.6).strokeColor(LINE);
    doc.rect(x, dataY, cw, dataH).stroke();
    doc.fontSize(5.5).fillColor(MUTED).font("Helvetica").text(c.label, x + 4, dataY + 3.5, { width: cw - 8 });
    doc.fontSize(11).fillColor(INK).font("Helvetica-Bold").text(c.value, x + 4, dataY + 12.5, { width: cw - 8 });
    x += cw;
  }
  doc.font("Helvetica");

  // --- Bag counts row (blank, filled by hand) -----------------------------
  const countsY = dataY + dataH;
  const countsH = 34;
  const counts = [
    { t: "TOTAL BULTOS", strong: true },
    { t: "FILTRO PARCIAL" },
    { t: "FILTRO FINAL" },
    { t: "PISTA PARCIAL" },
    { t: "PISTA FINAL" },
    { t: "TOTALES PISTA", strong: true },
  ];
  const ccW = W / counts.length;
  for (let i = 0; i < counts.length; i++) {
    const cx = x0 + i * ccW;
    doc.lineWidth(0.6).strokeColor(LINE);
    doc.rect(cx, countsY, ccW, countsH).stroke();
    // label strip
    if (counts[i].strong) {
      doc.save().rect(cx + 0.6, countsY + 0.6, ccW - 1.2, 11).fill("#F3F4F6").restore();
    }
    doc
      .fontSize(5.8)
      .fillColor(counts[i].strong ? INK : MUTED)
      .font(counts[i].strong ? "Helvetica-Bold" : "Helvetica")
      .text(counts[i].t, cx + 2, countsY + 3, { width: ccW - 4, align: "center" });
    // big empty area below for the hand-written number
  }
  doc.font("Helvetica");

  // --- Signature blocks: FILTRO / PISTA / COMANDANTE ----------------------
  const sigY = countsY + countsH;
  const sigH = y0 + SLIP_H - sigY;
  const roles = ["FILTRO", "PISTA", "COMANDANTE"];
  const sgW = W / roles.length;
  const fields = ["Firma", "Nombre", "Hora"];
  for (let i = 0; i < roles.length; i++) {
    const sx = x0 + i * sgW;
    doc.lineWidth(0.6).strokeColor(LINE);
    doc.rect(sx, sigY, sgW, sigH).stroke();
    // header strip
    doc.save().rect(sx + 0.6, sigY + 0.6, sgW - 1.2, 12).fill("#F3F4F6").restore();
    doc.fontSize(7).fillColor(INK).font("Helvetica-Bold").text(roles[i], sx + 5, sigY + 3, { width: sgW - 10 });
    doc.font("Helvetica");
    // field labels with a writing line each
    const startY = sigY + 16;
    const rowH = (sigH - 18) / fields.length;
    for (let f = 0; f < fields.length; f++) {
      const fy = startY + f * rowH + rowH / 2;
      doc.fontSize(6.5).fillColor(MUTED).text(`${fields[f]}:`, sx + 5, fy - 4, { width: 34 });
      doc.lineWidth(0.5).strokeColor(HAIR);
      doc.moveTo(sx + 38, fy + 3).lineTo(sx + sgW - 6, fy + 3).stroke();
    }
  }
}

export async function generateBaggageSheets(sheets: BaggageSheetData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (sheets.length === 0) {
      doc.fontSize(12).fillColor(INK).text("No hay salidas con pasajeros para este día.", MARGIN, MARGIN + 20);
      doc.end();
      return;
    }

    for (let i = 0; i < sheets.length; i++) {
      const slot = i % SLIPS_PER_PAGE;
      if (i > 0 && slot === 0) doc.addPage();
      const y0 = MARGIN + slot * (SLIP_H + GAP);
      drawSlip(doc, MARGIN, y0, sheets[i]);

      const isLastOnPage = slot === SLIPS_PER_PAGE - 1;
      const isLastOverall = i === sheets.length - 1;
      if (!isLastOnPage && !isLastOverall) drawCutLine(doc, y0 + SLIP_H + GAP / 2);
    }

    doc.end();
  });
}
