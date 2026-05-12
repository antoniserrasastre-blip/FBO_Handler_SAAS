import { describe, it, expect } from "vitest";
import {
  parseGenDecText,
  parsePersonLine,
  extractDate,
  extractPassport,
  extractNationality,
  extractRole,
} from "./gendecParser";

describe("extractDate", () => {
  it("parses DD/MM/YYYY", () => {
    expect(extractDate("born 27/01/1979 in Berlin")).toEqual({ value: "27/01/1979", match: "27/01/1979" });
  });
  it("parses DD.MM.YYYY", () => {
    expect(extractDate("DOB 12.12.2002")?.value).toBe("12/12/2002");
  });
  it("parses DD-MM-YYYY", () => {
    expect(extractDate("07-07-1997")?.value).toBe("07/07/1997");
  });
  it("parses ISO YYYY-MM-DD", () => {
    expect(extractDate("1980-05-01")?.value).toBe("01/05/1980");
  });
  it("swaps to DD/MM if obvious from second part > 12", () => {
    expect(extractDate("05/27/1979")?.value).toBe("27/05/1979");
  });
  it("parses 2-digit year with pivot 30", () => {
    expect(extractDate("01/05/85")?.value).toBe("01/05/1985");
    expect(extractDate("01/05/25")?.value).toBe("01/05/2025");
  });
  it("parses '21 May 1985'", () => {
    expect(extractDate("21 May 1985")?.value).toBe("21/05/1985");
  });
  it("parses Spanish month abbrev", () => {
    expect(extractDate("21 abr 1985")?.value).toBe("21/04/1985");
  });
  it("returns null for no date", () => {
    expect(extractDate("just a name")).toBeNull();
  });
});

describe("extractPassport", () => {
  it("matches alphanumeric 6-12 with at least one digit", () => {
    expect(extractPassport("passport C717C9VJY issued")?.value).toBe("C717C9VJY");
    expect(extractPassport("number 211079330")?.value).toBe("211079330");
    expect(extractPassport("doc P12345678")?.value).toBe("P12345678");
  });
  it("rejects all-letter words", () => {
    expect(extractPassport("just a name HERE")).toBeNull();
  });
  it("rejects field-label words even if 6+ chars", () => {
    expect(extractPassport("PASSPORT NUMBER")).toBeNull();
  });
  it("ignores tiny pure numbers", () => {
    expect(extractPassport("crew 12345 onboard")).toBeNull();
  });
});

describe("extractNationality", () => {
  it("matches ISO-3 code", () => {
    expect(extractNationality("DEU")?.value).toBe("DEU");
  });
  it("matches English demonym", () => {
    expect(extractNationality("German national")?.value).toBe("DEU");
  });
  it("matches Spanish demonym", () => {
    expect(extractNationality("nacionalidad alemana")?.value).toBe("DEU");
  });
  it("matches multi-word country", () => {
    expect(extractNationality("United Kingdom citizen")?.value).toBe("GBR");
  });
  it("returns null when no match", () => {
    expect(extractNationality("just a regular sentence")).toBeNull();
  });
});

describe("extractRole", () => {
  it("captain variants", () => {
    expect(extractRole("Captain John Smith")).toBe("CAPTAIN");
    expect(extractRole("CMTE Garcia")).toBe("CAPTAIN");
    expect(extractRole("PIC: Jones")).toBe("CAPTAIN");
  });
  it("first officer variants", () => {
    expect(extractRole("F/O Jane")).toBe("FIRST_OFFICER");
    expect(extractRole("first officer Doe")).toBe("FIRST_OFFICER");
    expect(extractRole("SIC: Gomez")).toBe("FIRST_OFFICER");
  });
  it("cabin crew variants", () => {
    expect(extractRole("FA Maria")).toBe("CABIN_CREW");
    expect(extractRole("flight attendant Lin")).toBe("CABIN_CREW");
    expect(extractRole("azafata Lopez")).toBe("CABIN_CREW");
  });
});

describe("parsePersonLine", () => {
  it("extracts all four fields from single TSV line", () => {
    const p = parsePersonLine("Frank Claessens   27/01/1979   C717C9VJY   DEU", false);
    expect(p?.fullName).toBe("Frank Claessens");
    expect(p?.dateOfBirth).toBe("27/01/1979");
    expect(p?.passportNumber).toBe("C717C9VJY");
    expect(p?.nationality).toBe("DEU");
    expect(p?.confidence).toBeGreaterThan(0.8);
  });

  it("handles 'Surname, First' form", () => {
    const p = parsePersonLine("Eriksen, Henrik   10/02/1972   211079330   DNK", false);
    expect(p?.fullName).toBe("Eriksen Henrik");
    expect(p?.passportNumber).toBe("211079330");
    expect(p?.nationality).toBe("DNK");
  });

  it("extracts role and strips it from name when crew section", () => {
    const p = parsePersonLine("Captain John Smith    01/05/1980   P12345678   USA", true);
    expect(p?.role).toBe("CAPTAIN");
    expect(p?.fullName).toBe("John Smith");
  });

  it("handles numbered list prefix '1.'", () => {
    const p = parsePersonLine("1. Teresa Schell  07/07/1997  C86HT6314  Germany", false);
    expect(p?.fullName).toBe("Teresa Schell");
    expect(p?.nationality).toBe("DEU");
  });

  it("returns null for empty / junk lines", () => {
    expect(parsePersonLine("", false)).toBeNull();
    expect(parsePersonLine("   ", false)).toBeNull();
    expect(parsePersonLine("12345", false)).toBeNull();
  });

  it("works when fields are comma-separated", () => {
    const p = parsePersonLine("John Schmidt, 01/05/1980, USA, P12345678", false);
    expect(p?.fullName).toBe("John Schmidt");
    expect(p?.dateOfBirth).toBe("01/05/1980");
    expect(p?.nationality).toBe("USA");
    expect(p?.passportNumber).toBe("P12345678");
  });
});

describe("parseGenDecText — realistic fixtures", () => {
  it("parses tabular email with explicit CREW / PASSENGERS sections", () => {
    const text = `
GenDec OE-GLB arrival 12/05/2026

CREW
1. Frank Claessens     27/01/1979   C717C9VJY   DEU
2. Vasco Maia          12/12/2002   CF828980    PRT

PASSENGERS
1. Teresa Schell       07/07/1997   C86HT6314   DEU
2. Benjamin Stoll      10/09/1978   C86H915TW   DEU
`;
    const r = parseGenDecText(text);
    expect(r.crew).toHaveLength(2);
    expect(r.passengers).toHaveLength(2);
    expect(r.crew[0].fullName).toBe("Frank Claessens");
    expect(r.crew[0].role).toBe("OTHER");
    expect(r.passengers[1].nationality).toBe("DEU");
  });

  it("parses Spanish-labelled email", () => {
    const text = `
TRIPULACIÓN
Capitán Garcia, Juan, 15/03/1975, ESP, P98765432
F/O López, María, 22/07/1988, ESP, P11223344

PASAJEROS
Schmidt, Anna, 03/04/1990, alemana, C5566778H
`;
    const r = parseGenDecText(text);
    expect(r.crew).toHaveLength(2);
    expect(r.crew[0].role).toBe("CAPTAIN");
    expect(r.crew[1].role).toBe("FIRST_OFFICER");
    expect(r.passengers).toHaveLength(1);
    expect(r.passengers[0].nationality).toBe("DEU");
  });

  it("parses multi-line label format", () => {
    const text = `
Name: John Smith
DOB: 15/06/1985
Nationality: United Kingdom
Passport: 540122334

Name: Jane Doe
DOB: 22/11/1990
Nationality: USA
Passport: P98765432
`;
    const r = parseGenDecText(text);
    expect(r.passengers).toHaveLength(2);
    expect(r.passengers[0].fullName).toBe("John Smith");
    expect(r.passengers[0].nationality).toBe("GBR");
    expect(r.passengers[1].passportNumber).toBe("P98765432");
  });

  it("auto-classifies as crew when role keyword present without section header", () => {
    const text = `
Captain Jones, 01/01/1970, GBR, P12345678
First Officer Smith, 05/05/1985, USA, P87654321
Mr Visitor, 10/10/1990, DEU, P22334455
`;
    const r = parseGenDecText(text);
    expect(r.crew.length).toBeGreaterThanOrEqual(2);
    expect(r.crew.some((c) => c.role === "CAPTAIN")).toBe(true);
  });

  it("handles overflow / wrap around (numbered list, varying nationality formats)", () => {
    const text = `
PAX
1. Romain de Meyer      06/05/1994  X0F31Z62   Switzerland
2. Olivia de Meyer      04/05/2021  X0E96F56   suiza
3. Jerome de Meyer      03/11/1963  X0X29Z12   CHE
`;
    const r = parseGenDecText(text);
    expect(r.passengers).toHaveLength(3);
    expect(r.passengers.every((p) => p.nationality === "CHE")).toBe(true);
  });

  it("returns empty result for noise-only input", () => {
    const text = `
================
GenDec template
Page 1 of 1
================
`;
    const r = parseGenDecText(text);
    expect(r.crew).toHaveLength(0);
    expect(r.passengers).toHaveLength(0);
  });
});
