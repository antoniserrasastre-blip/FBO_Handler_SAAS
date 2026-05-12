// Parser de texto libre de GenDec (General Declaration).
//
// Recibe lo que el handler ha pegado (cuerpo de email, copy-paste de PDF
// estructurado, mezcla de ambos) y devuelve crew[] + passengers[] listos
// para previsualizar en la UI antes de persistir.
//
// Filosofía: ser permisivo, marcar confianza, NUNCA inventar campos. Si
// algo no se puede extraer con seguridad lo dejamos vacío para que el
// handler lo complete a mano en la preview.
//
// Funciona offline. Sin LLM. Sin red. Sin filtrar datos de pasaportes.

import { lookupNationality } from "./nationalities";

export type ParsedRole = "CAPTAIN" | "FIRST_OFFICER" | "CABIN_CREW" | "OTHER";

export interface ParsedPerson {
  fullName: string;
  dateOfBirth: string | null; // DD/MM/YYYY normalised
  passportNumber: string | null;
  nationality: string | null; // ISO-3
  role?: ParsedRole;          // crew only
  /** 0..1 — how confident we are in this row. Below 0.5 → highlight in UI. */
  confidence: number;
  /** Raw line(s) the row was parsed from — useful for the editable preview. */
  raw: string;
}

export interface ParseResult {
  crew: ParsedPerson[];
  passengers: ParsedPerson[];
}

// ─── Field detectors ────────────────────────────────────────────────────────

const DATE_RE_DMY = /\b(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})\b/;
const DATE_RE_ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
const DATE_RE_TEXT = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|ene|abr|ago|dic)[a-z]*\s+(\d{2,4})\b/i;

const MONTH_TEXT: Record<string, string> = {
  jan: "01", ene: "01",
  feb: "02",
  mar: "03",
  apr: "04", abr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08", ago: "08",
  sep: "09", sept: "09",
  oct: "10",
  nov: "11",
  dec: "12", dic: "12",
};

/** Returns DD/MM/YYYY string + the matched substring (so caller can strip it). */
export function extractDate(text: string): { value: string; match: string } | null {
  let m = DATE_RE_TEXT.exec(text);
  if (m) {
    const month = MONTH_TEXT[m[2].toLowerCase().slice(0, 3)] ?? "01";
    const year = m[3].length === 2 ? `19${m[3]}` : m[3];
    return { value: `${m[1].padStart(2, "0")}/${month}/${year}`, match: m[0] };
  }
  m = DATE_RE_ISO.exec(text);
  if (m) {
    return {
      value: `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`,
      match: m[0],
    };
  }
  m = DATE_RE_DMY.exec(text);
  if (m) {
    let dd = parseInt(m[1], 10);
    let mm = parseInt(m[2], 10);
    // Heuristic: if first > 12 it's clearly DD/MM. If second > 12 swap to MM/DD.
    if (mm > 12 && dd <= 12) {
      const tmp = dd;
      dd = mm;
      mm = tmp;
    }
    let yyyy = m[3];
    if (yyyy.length === 2) {
      const n = parseInt(yyyy, 10);
      // Pivot: <30 → 20XX, else 19XX (DOBs span ~1925–2025)
      yyyy = n < 30 ? `20${yyyy.padStart(2, "0")}` : `19${yyyy}`;
    }
    return {
      value: `${String(dd).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${yyyy}`,
      match: m[0],
    };
  }
  return null;
}

// Passport: 6–12 alphanumeric, must contain at least one digit (rules out
// ordinary words). Matches "P12345678", "C717C9VJY", "211079330".
const PASSPORT_RE = /\b([A-Z0-9]{6,12})\b/g;
const NON_PASSPORT_WORDS = new Set([
  "PASSPORT", "PASAPORTE", "DOCUMENT", "DOCUMENTO", "NUMBER", "NUMERO",
  "NATIONALITY", "NACIONALIDAD", "CAPTAIN", "FIRSTOFFICER", "CABIN",
  "ARRIVAL", "DEPARTURE", "LLEGADA", "SALIDA", "PASSENGER", "PASAJERO",
  "CREW", "TRIPULACION", "PILOTOS", "MALE", "FEMALE", "MASCULINO", "FEMENINO",
]);

export function extractPassport(text: string): { value: string; match: string } | null {
  PASSPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PASSPORT_RE.exec(text)) !== null) {
    const candidate = m[1];
    if (!/\d/.test(candidate)) continue;          // must contain a digit
    if (/^\d+$/.test(candidate) && candidate.length < 7) continue; // tiny pure number, probably noise
    if (NON_PASSPORT_WORDS.has(candidate.toUpperCase())) continue;
    return { value: candidate, match: m[0] };
  }
  return null;
}

// Nationality: scan word-by-word and 2-word phrases against the lookup table.
export function extractNationality(text: string): { value: string; match: string } | null {
  const tokens = text.split(/[\s,;|]+/).filter(Boolean);
  // Try 2-word phrases first ("United Kingdom", "Saudi Arabia")
  for (let i = 0; i < tokens.length - 1; i++) {
    const phrase = `${tokens[i]} ${tokens[i + 1]}`;
    const iso = lookupNationality(phrase);
    if (iso) return { value: iso, match: phrase };
  }
  for (const t of tokens) {
    const iso = lookupNationality(t);
    if (iso) return { value: iso, match: t };
  }
  return null;
}

// ─── Role detection (crew) ──────────────────────────────────────────────────

const ROLE_PATTERNS: Array<{ re: RegExp; role: ParsedRole }> = [
  { re: /\b(captain|capit[aá]n|cpt|cmdr|commander|comandante|cmte)\b/i, role: "CAPTAIN" },
  { re: /\b(first\s*officer|f\/?o|fo|copilot|copiloto|primer\s*oficial)\b/i, role: "FIRST_OFFICER" },
  { re: /\b(cabin|fa|flight\s*att|attendant|sobrecargo|tripulante\s*de\s*cabina|azafat[ao])\b/i, role: "CABIN_CREW" },
  { re: /\bpic\b/i, role: "CAPTAIN" },
  { re: /\bsic\b/i, role: "FIRST_OFFICER" },
];

export function extractRole(text: string): ParsedRole | null {
  for (const p of ROLE_PATTERNS) if (p.re.test(text)) return p.role;
  return null;
}

// ─── Section header detection ───────────────────────────────────────────────

const CREW_HEADER = /^\s*(crew|tripulacion|tripulación|pilots?|pilotos?|cockpit|crew\s+members?)\s*:?\s*$/i;
const PAX_HEADER = /^\s*(passengers?|pasajeros?|pax|guests?|invitados?)\s*:?\s*$/i;

// Lines we should drop entirely (titles, separators, signatures)
const NOISE_RE = /^(\s*[-=*_]{3,}\s*|\s*page\s+\d+|gendec|general\s+decl|signature)/i;

// "Field: value" pattern → multi-line mode
const LABEL_LINE_RE = /^\s*(name|full\s*name|nombre|surname|apellido|dob|date\s*of\s*birth|fecha\s*nac|passport|pasaporte|doc(?:ument)?\s*(?:number|n[oº])?|nationality|nacionalidad|country|país|pais|role|rol|position|cargo)\s*[:=]\s*(.+)$/i;

const LABEL_MAP: Record<string, keyof RawPerson> = {
  name: "name", "full name": "name", nombre: "name",
  surname: "surnameOnly", apellido: "surnameOnly",
  dob: "dob", "date of birth": "dob", "fecha nac": "dob", "fecha de nacimiento": "dob",
  passport: "passport", pasaporte: "passport", "doc number": "passport",
  "document number": "passport", "doc n": "passport", "doc nº": "passport",
  "doc no": "passport", "documento": "passport", document: "passport",
  nationality: "nationality", nacionalidad: "nationality", country: "nationality",
  pais: "nationality", país: "nationality",
  role: "role", rol: "role", position: "role", cargo: "role",
};

interface RawPerson {
  name?: string;
  surnameOnly?: string;
  dob?: string;
  passport?: string;
  nationality?: string;
  role?: string;
  rawLines: string[];
}

// ─── Per-line parser ────────────────────────────────────────────────────────

/**
 * Parse a single line that should describe one person.
 * Strips date/passport/nationality/role; whatever remains is the name.
 */
export function parsePersonLine(line: string, isCrewSection: boolean): ParsedPerson | null {
  let working = line.replace(/^\s*\d+\s*[\.\)\-]\s*/, "").trim(); // strip leading "1." / "1)"
  if (!working) return null;

  let confidence = 0;
  let dob: string | null = null;
  let passport: string | null = null;
  let nationality: string | null = null;
  let role: ParsedRole | undefined;

  const dateHit = extractDate(working);
  if (dateHit) {
    dob = dateHit.value;
    working = working.replace(dateHit.match, " ").trim();
    confidence += 0.3;
  }

  const passHit = extractPassport(working);
  if (passHit) {
    passport = passHit.value;
    working = working.replace(passHit.match, " ").trim();
    confidence += 0.3;
  }

  const natHit = extractNationality(working);
  if (natHit) {
    nationality = natHit.value;
    // remove only the first occurrence
    const idx = working.toLowerCase().indexOf(natHit.match.toLowerCase());
    if (idx >= 0) {
      working = (working.slice(0, idx) + " " + working.slice(idx + natHit.match.length)).trim();
    }
    confidence += 0.2;
  }

  if (isCrewSection) {
    const r = extractRole(working);
    if (r) {
      role = r;
      // strip role keywords from name
      for (const p of ROLE_PATTERNS) working = working.replace(p.re, " ").trim();
    } else {
      role = "OTHER";
    }
  }

  // Whatever is left → name. Clean up commas, multiple spaces, trailing punctuation.
  const fullName = working
    .replace(/[,;|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-]+|[\s\-]+$/g, "")
    .trim();

  if (!fullName || fullName.length < 2) return null;
  // Reject lines that look like junk (no letters, all digits)
  if (!/[A-Za-zÀ-ÿ]/.test(fullName)) return null;

  if (fullName.length >= 3) confidence += 0.2;

  return {
    fullName,
    dateOfBirth: dob,
    passportNumber: passport,
    nationality,
    role: isCrewSection ? role : undefined,
    confidence: Math.min(confidence, 1),
    raw: line,
  };
}

// ─── Multi-line block parser ────────────────────────────────────────────────

function blockToPerson(block: string[], isCrewSection: boolean): ParsedPerson | null {
  const acc: RawPerson = { rawLines: block };
  let usedLabels = false;

  for (const line of block) {
    const lm = line.match(LABEL_LINE_RE);
    if (lm) {
      usedLabels = true;
      const key = LABEL_MAP[lm[1].toLowerCase().trim()];
      if (key && key !== "rawLines") {
        const value = lm[2].trim();
        if (key === "name" && acc.name) acc.name = `${acc.name} ${value}`;
        else (acc as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  if (!usedLabels) return null;

  const name = [acc.name, acc.surnameOnly].filter(Boolean).join(" ").trim();
  if (!name) return null;

  const dob = acc.dob ? extractDate(acc.dob)?.value ?? null : null;
  const passport = acc.passport ? extractPassport(acc.passport)?.value ?? acc.passport.trim() : null;
  const nationality = acc.nationality ? lookupNationality(acc.nationality) : null;
  const role = acc.role ? extractRole(acc.role) ?? "OTHER" : "OTHER";

  let confidence = 0.4; // started with field labels = baseline trust
  if (dob) confidence += 0.2;
  if (passport) confidence += 0.2;
  if (nationality) confidence += 0.2;

  return {
    fullName: name,
    dateOfBirth: dob,
    passportNumber: passport,
    nationality,
    role: isCrewSection ? role : undefined,
    confidence: Math.min(confidence, 1),
    raw: block.join("\n"),
  };
}

// ─── Top-level orchestrator ─────────────────────────────────────────────────

export function parseGenDecText(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const crew: ParsedPerson[] = [];
  const passengers: ParsedPerson[] = [];

  // Section state — default to passengers. Headers flip it.
  let isCrewSection = false;
  let sectionExplicit = false;

  // First pass: split into blocks separated by blank lines, so we can decide
  // per block whether to use line-mode or block-mode.
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (current.length) blocks.push(current);
      current = [];
      continue;
    }
    if (NOISE_RE.test(line)) continue;
    current.push(line);
  }
  if (current.length) blocks.push(current);

  for (const block of blocks) {
    // Detect section headers in this block
    for (const line of block) {
      if (CREW_HEADER.test(line)) {
        isCrewSection = true;
        sectionExplicit = true;
      } else if (PAX_HEADER.test(line)) {
        isCrewSection = false;
        sectionExplicit = true;
      }
    }

    // Strip header lines from the block
    const dataLines = block.filter(
      (l) => !CREW_HEADER.test(l) && !PAX_HEADER.test(l),
    );
    if (!dataLines.length) continue;

    // If block looks like field-per-line (label lines present), parse as one
    // person.
    const labelHits = dataLines.filter((l) => LABEL_LINE_RE.test(l)).length;
    if (labelHits >= 2) {
      const person = blockToPerson(dataLines, isCrewSection);
      if (person) {
        if (isCrewSection) crew.push(person);
        else passengers.push(person);
      }
      continue;
    }

    // Otherwise, treat each non-empty line as a person.
    for (const line of dataLines) {
      // If section wasn't set explicitly and the line itself smells like crew
      // (role keyword), classify it as crew.
      const lineIsCrew = isCrewSection || (!sectionExplicit && extractRole(line) !== null);
      const person = parsePersonLine(line, lineIsCrew);
      if (!person) continue;
      if (lineIsCrew) crew.push(person);
      else passengers.push(person);
    }
  }

  return { crew, passengers };
}
