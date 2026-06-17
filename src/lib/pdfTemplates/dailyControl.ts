// Daily operational control sheet — "HOJA DE CONTROL DEL DÍA".
//
// A single printable A4 *landscape* sheet that gives the handler a clear
// picture of the operating day at a glance and doubles as a checklist to tick
// off by hand as the day goes. Two blocks (🛬 Llegadas / 🛫 Salidas), one row
// per movement, ordered chronologically by each leg's own time.
//
// Columns per block:
//   HORA(z) · VUELO · MATRÍCULA · TIPO · OPER · ORIGEN/DESTINO · STAND ·
//   PAX/TRIP · TRANSPORTE · SERVICIOS (catering) · ☐ HECHO
//
// Flight data is pre-printed from the DB; the "HECHO" box and the services that
// are still pending (shown in bold) are meant to be tracked by hand. Delivered
// services are muted with a ✓ so what's left to do stands out.
//
// Sibling of `baggageControl.ts`; same pdfkit toolbox and visual language.

import PDFDocument from "pdfkit";

export interface DailyControlService {
  label: string; // already localized, e.g. "Catering PAX"
  done: boolean; // DELIVERED or CANCELLED → considered resolved
}

export interface DailyControlRow {
  hora: string; // eta (llegadas) / etd (salidas), Zulu HH:MM
  callsign: string;
  registration: string;
  aircraftType: string;
  operator: string; // ICAO code or short name
  airport: string; // origin (llegadas) or destination (salidas)
  stand: string; // parking
  paxCrew: string; // "12 / 4"  (pax / crew)
  transport: string; // localized transport label or "—"
  services: DailyControlService[];
  cancelled: boolean;
  noShow: boolean;
}

export interface DailyControlData {
  fecha: string; // DD/MM/YYYY (long form for the title)
  arrivals: DailyControlRow[];
  departures: DailyControlRow[];
}

// A4 landscape
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 26;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = "#111827";
const MUTED = "#6B7280";
const LINE = "#374151";
const HAIR = "#9CA3AF";
const ACCENT = "#E8772E"; // brand orange
const ARR_TINT = "#EAF2FB"; // soft blue band for Llegadas
const DEP_TINT = "#FBEFE7"; // soft orange band for Salidas
const ZEBRA = "#F7F7F8";

// Column layout (fractions of CONTENT_W are resolved to px once).
interface Col {
  key: keyof DailyControlRow | "check";
  label: string;
  w: number; // absolute px
  align?: "left" | "center";
}

function buildColumns(airportHeader: string): Col[] {
  const fixed: Col[] = [
    { key: "hora", label: "HORA", w: 40, align: "center" },
    { key: "callsign", label: "VUELO", w: 64 },
    { key: "registration", label: "MATRÍCULA", w: 66 },
    { key: "aircraftType", label: "TIPO", w: 42, align: "center" },
    { key: "operator", label: "OPER", w: 42, align: "center" },
    { key: "airport", label: airportHeader, w: 92 },
    { key: "stand", label: "STAND", w: 46, align: "center" },
    { key: "paxCrew", label: "PAX/TRIP", w: 54, align: "center" },
    { key: "transport", label: "TRANSPORTE", w: 84 },
    { key: "check", label: "HECHO", w: 34, align: "center" },
  ];
  const used = fixed.reduce((s, c) => s + c.w, 0);
  // SERVICIOS takes the remaining width, inserted before the HECHO column.
  const services: Col = { key: "services", label: "SERVICIOS (catering)", w: CONTENT_W - used };
  return [...fixed.slice(0, -1), services, fixed[fixed.length - 1]];
}

const ROW_H = 14;
const HEADER_H = 13;
const BAND_H = 15;

function drawColHeaders(doc: PDFKit.PDFDocument, cols: Col[], y: number) {
  let x = MARGIN;
  doc.save();
  doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fill("#EDEEF0");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(6).fillColor(MUTED);
  for (const c of cols) {
    doc.text(c.label, x + 4, y + 3.5, { width: c.w - 8, align: c.align === "center" ? "center" : "left" });
    x += c.w;
  }
  // column separators
  doc.save().lineWidth(0.4).strokeColor(HAIR);
  x = MARGIN;
  for (const c of cols) {
    doc.moveTo(x, y).lineTo(x, y + HEADER_H).stroke();
    x += c.w;
  }
  doc.moveTo(MARGIN + CONTENT_W, y).lineTo(MARGIN + CONTENT_W, y + HEADER_H).stroke();
  doc.restore();
  doc.font("Helvetica");
}

// Renders the SERVICIOS cell: pending in bold ink with a • bullet, resolved
// items muted and plain. (pdfkit's standard fonts are WinAnsi — no ✓ glyph —
// so "done" is signalled by the muted gray + dropped bullet, not a checkmark.)
function drawServices(doc: PDFKit.PDFDocument, x: number, y: number, w: number, services: DailyControlService[]) {
  if (services.length === 0) {
    doc.font("Helvetica").fontSize(6.5).fillColor(HAIR).text("—", x + 4, y + 4.5, { width: w - 8 });
    return;
  }
  let cx = x + 4;
  const maxX = x + w - 4;
  const sep = "  ";
  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const mark = s.done ? "" : "• "; // bullet for pending only
    const text = mark + s.label + (i < services.length - 1 ? sep : "");
    doc.font(s.done ? "Helvetica" : "Helvetica-Bold").fontSize(6.5);
    const tw = doc.widthOfString(text);
    if (cx + tw > maxX && cx > x + 4) {
      doc.font("Helvetica-Bold").fontSize(6.5).fillColor(ACCENT).text("…", cx, y + 4.5);
      return;
    }
    doc.fillColor(s.done ? MUTED : INK).text(text, cx, y + 4.5, { lineBreak: false });
    cx += tw;
  }
  doc.font("Helvetica");
}

function drawRow(doc: PDFKit.PDFDocument, cols: Col[], y: number, row: DailyControlRow, zebra: boolean) {
  if (zebra) {
    doc.save().rect(MARGIN, y, CONTENT_W, ROW_H).fill(ZEBRA).restore();
  }
  let x = MARGIN;
  const dim = row.cancelled || row.noShow;
  for (const c of cols) {
    if (c.key === "services") {
      drawServices(doc, x, y, c.w, row.services);
    } else if (c.key === "check") {
      // empty tick box centered
      const bs = 8;
      doc.save().lineWidth(0.7).strokeColor(LINE);
      doc.rect(x + (c.w - bs) / 2, y + (ROW_H - bs) / 2, bs, bs).stroke();
      doc.restore();
    } else {
      const value = String(row[c.key] ?? "");
      const isCallsign = c.key === "callsign" || c.key === "registration";
      doc
        .font(isCallsign ? "Helvetica-Bold" : "Helvetica")
        .fontSize(isCallsign ? 7.5 : 7)
        .fillColor(dim ? HAIR : INK)
        .text(value, x + 4, y + 4, {
          width: c.w - 8,
          align: c.align === "center" ? "center" : "left",
          lineBreak: false,
          ellipsis: true,
        });
    }
    x += c.w;
  }
  // strike-through for cancelled/no-show rows
  if (dim) {
    doc.save().lineWidth(0.6).strokeColor(HAIR);
    doc.moveTo(MARGIN + 2, y + ROW_H / 2).lineTo(MARGIN + cols[0].w + cols[1].w + cols[2].w, y + ROW_H / 2).stroke();
    doc.restore();
  }
  // bottom hairline
  doc.save().lineWidth(0.4).strokeColor(HAIR);
  doc.moveTo(MARGIN, y + ROW_H).lineTo(MARGIN + CONTENT_W, y + ROW_H).stroke();
  doc.restore();
}

function drawSectionBand(doc: PDFKit.PDFDocument, y: number, title: string, count: number, tint: string) {
  doc.save().rect(MARGIN, y, CONTENT_W, BAND_H).fill(tint).restore();
  doc.save().lineWidth(2).strokeColor(ACCENT);
  doc.moveTo(MARGIN, y + 0.6).lineTo(MARGIN + 60, y + 0.6).stroke();
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(title, MARGIN + 6, y + 3.5);
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(MUTED)
    .text(`${count} ${count === 1 ? "movimiento" : "movimientos"}`, MARGIN, y + 4.5, {
      width: CONTENT_W - 8,
      align: "right",
    });
}

export async function generateDailyControl(data: DailyControlData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // --- Page title ---------------------------------------------------------
    let y = MARGIN;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("HOJA DE CONTROL DEL DÍA", MARGIN, y);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(`Palma · ${data.fecha}`, MARGIN, y + 1.5, { width: CONTENT_W, align: "right" });
    y += 17;
    // Turno / handler write-in line
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Turno / Handler:", MARGIN, y + 1);
    doc.save().lineWidth(0.5).strokeColor(HAIR);
    doc.moveTo(MARGIN + 70, y + 9).lineTo(MARGIN + 260, y + 9).stroke();
    doc.text("Notas:", MARGIN + 280, y + 1);
    doc.moveTo(MARGIN + 320, y + 9).lineTo(MARGIN + CONTENT_W, y + 9).stroke();
    doc.restore();
    y += 16;

    const bottomLimit = PAGE_H - MARGIN;

    const renderSection = (title: string, rows: DailyControlRow[], tint: string, airportHeader: string) => {
      const sectionCols = buildColumns(airportHeader);
      // Band + column header must fit together; otherwise new page.
      if (y + BAND_H + HEADER_H + ROW_H > bottomLimit) {
        doc.addPage();
        y = MARGIN;
      }
      drawSectionBand(doc, y, title, rows.length, tint);
      y += BAND_H;
      drawColHeaders(doc, sectionCols, y);
      y += HEADER_H;

      if (rows.length === 0) {
        doc.font("Helvetica-Oblique").fontSize(8).fillColor(HAIR).text("Sin movimientos.", MARGIN + 6, y + 6);
        y += ROW_H;
      }

      for (let i = 0; i < rows.length; i++) {
        if (y + ROW_H > bottomLimit) {
          doc.addPage();
          y = MARGIN;
          drawColHeaders(doc, sectionCols, y);
          y += HEADER_H;
        }
        drawRow(doc, sectionCols, y, rows[i], i % 2 === 1);
        y += ROW_H;
      }
    };

    renderSection("LLEGADAS", data.arrivals, ARR_TINT, "ORIGEN");
    y += 8;
    renderSection("SALIDAS", data.departures, DEP_TINT, "DESTINO");

    doc.end();
  });
}
