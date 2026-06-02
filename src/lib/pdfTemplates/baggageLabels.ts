// Baggage label PDF template — one label per piece of hold baggage.
//
// Designed for Brother TD-4650TNWB (203 dpi) / TD-4750TNWB (300 dpi) desktop
// label printers, printed via the OS driver from the browser. Page size equals
// the physical label (62 × 29 mm die-cut), one label per page, `qty` pages
// (qty = number of bags). Each label is numbered "i/N" so a missing tag on the
// ramp is obvious. The label count is the TOTAL BULTOS of the paper control sheet.

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
const LOGO_RATIO = 1356855 / 698500; // width/height (≈1.943)

const MM = 2.834645669; // pt per mm
const LABEL_W = 62 * MM; // 175.7 pt
const LABEL_H = 29 * MM; // 82.2 pt
const PAD = 5;

const INK = "#000000";
const MUTED = "#555555";
const ACCENT = "#E8772E";

export interface BaggageLabelData {
  callsign: string; // Nº de vuelo
  destination: string; // Destino (ICAO)
  registration: string; // Matrícula
  aircraftType: string; // Tipo
  fecha: string; // DD/MM/YY
  hora: string; // HH:MM Zulu
}

function drawLabel(doc: PDFKit.PDFDocument, d: BaggageLabelData, index: number, qty: number) {
  const innerW = LABEL_W - PAD * 2;

  // --- Header: logo (left) + Nº de bulto (right) --------------------------
  const headerH = 16;
  if (LOGO_PATH) {
    const lh = 12;
    const lw = lh * LOGO_RATIO;
    try {
      doc.image(LOGO_PATH, PAD, PAD, { width: lw, height: lh });
    } catch {
      doc.fontSize(8).fillColor(ACCENT).font("Helvetica-Bold").text("MALLORCAIR", PAD, PAD + 2);
    }
  } else {
    doc.fontSize(8).fillColor(ACCENT).font("Helvetica-Bold").text("MALLORCAIR", PAD, PAD + 2);
  }

  // Bulto counter box (top-right) — the important bit for counting bags
  const boxW = 44;
  const boxX = LABEL_W - PAD - boxW;
  doc.save().lineWidth(0.8).strokeColor(INK).rect(boxX, PAD - 1, boxW, headerH + 6).stroke().restore();
  doc.fontSize(4.5).fillColor(MUTED).font("Helvetica").text("BULTO", boxX, PAD, { width: boxW, align: "center" });
  doc
    .fontSize(13)
    .fillColor(INK)
    .font("Helvetica-Bold")
    .text(`${index}/${qty}`, boxX, PAD + 6, { width: boxW, align: "center" });

  // accent divider under header
  doc.save().lineWidth(1.2).strokeColor(ACCENT);
  doc.moveTo(PAD, PAD + headerH + 7).lineTo(PAD + innerW, PAD + headerH + 7).stroke();
  doc.restore();

  // --- Flight number + destination (the big line) -------------------------
  let y = PAD + headerH + 11;
  doc.fontSize(17).fillColor(INK).font("Helvetica-Bold");
  doc.text(d.callsign || "—", PAD, y, { width: innerW * 0.56, lineBreak: false });
  // right-pointing arrow (drawn — Helvetica lacks the → glyph)
  const ax = PAD + innerW * 0.565;
  const ay = y + 9;
  doc.save().fillColor(MUTED);
  doc.moveTo(ax, ay - 4).lineTo(ax, ay + 4).lineTo(ax + 7, ay).fill();
  doc.restore();
  doc.fontSize(15).fillColor(INK).font("Helvetica-Bold");
  doc.text(d.destination || "—", PAD + innerW * 0.62, y + 1, { width: innerW * 0.38, align: "right", lineBreak: false });

  // --- Detail line: matrícula · tipo · fecha · hora -----------------------
  y += 22;
  doc.fontSize(8.5).fillColor(INK).font("Helvetica-Bold");
  doc.text(d.registration || "", PAD, y, { width: innerW * 0.5, lineBreak: false });
  if (d.aircraftType) {
    const regW = doc.widthOfString(d.registration || "");
    doc.fontSize(7).fillColor(MUTED).font("Helvetica").text(`· ${d.aircraftType}`, PAD + regW + 4, y + 1, { lineBreak: false });
  }
  const meta = [d.fecha, d.hora ? `${d.hora}z` : ""].filter(Boolean).join("  ");
  doc.fontSize(8).fillColor(INK).font("Helvetica").text(meta, PAD + innerW * 0.45, y, { width: innerW * 0.55, align: "right", lineBreak: false });

  doc.font("Helvetica");
}

export async function generateBaggageLabels(d: BaggageLabelData, qty: number): Promise<Buffer> {
  const n = Math.max(1, Math.min(99, Math.floor(qty) || 1));
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [LABEL_W, LABEL_H], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (let i = 1; i <= n; i++) {
      if (i > 1) doc.addPage({ size: [LABEL_W, LABEL_H], margin: 0 });
      drawLabel(doc, d, i, n);
    }
    doc.end();
  });
}
