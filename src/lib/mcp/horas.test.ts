// Sprint 02 mcp-escritura-lote — fase ROJA. TEST-WRITER.
// T1 (TZ round-trip property-based) · T2 (default local) · T3 (rango, nivel lib).
// Contrato pineado: src/lib/mcp/contract.ts §Lib de horas.
//
// Oráculo Intl: palmaMidnightUtc + madridWallMinutes de @/lib/time. NUNCA se
// suman offsets fijos (±1/±2): el instante y su cara Madrid/UTC salen de Intl.
// `ahora` es EXPLÍCITO por caso (determinista, no depende del día de la suite).

import { describe, it, expect } from "vitest";
import { normalizarHora, formatoDual } from "@/lib/mcp/horas";
import { palmaMidnightUtc, palmaDayUtc, madridWallMinutes } from "@/lib/time";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
const utcMinOfDay = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const DAY_MS = 24 * 60 * 60 * 1000;

// Midday-UTC anchor whose Palma civil day is unambiguously `civil` (YYYY-MM-DD).
const ahoraDe = (civil: string) => {
  const [y, mo, d] = civil.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12, 0));
};

// Oráculo del contrato "el instante MÁS TEMPRANO del día civil D cuya pared
// Madrid es la hora dictada": barre la ventana real del día civil
// [palmaMidnightUtc(D), palmaMidnightUtc(D+1)) minuto a minuto y anota, por
// minuto de pared Madrid (leída con Intl), el PRIMER instante que la muestra.
// En el día de 25h (fall-back) las paredes 02:xx quedan ancladas a su primera
// ocurrencia (CEST); en el de 23h (spring) las 02:xx no aparecen (hueco).
// NOTA: se indexa por pared LOCAL, no por cara UTC — en el día de 25h los UTC
// "22:xx" ocurren DOS veces en la ventana (local 00:xx CEST al inicio y 23:xx
// CET al final) y reconstruir desde el zulu por primera-ocurrencia elige mal.
// Intl puro (vía palmaMidnightUtc/madridWallMinutes); jamás offsets fijos.
function earliestInstantByLocalMinute(civil: string): Array<Date | undefined> {
  const start = palmaMidnightUtc(civil).getTime();
  const nextCivil = new Date(palmaDayUtc(civil).getTime() + DAY_MS);
  const end = palmaMidnightUtc(nextCivil).getTime();
  const primeras: Array<Date | undefined> = new Array(1440);
  for (let t = start; t < end; t += 60000) {
    const inst = new Date(t);
    const m = madridWallMinutes(inst);
    if (primeras[m] === undefined) primeras[m] = inst;
  }
  return primeras;
}

// ---------------------------------------------------------------------------
// T1 — días SIN transición DST: offset constante, round-trip identidad total.
// ---------------------------------------------------------------------------
function assertNonDstDay(civil: string): void {
  const ahora = ahoraDe(civil);
  const [y, mo, d] = civil.split("-").map(Number);
  const start = palmaMidnightUtc(civil).getTime(); // instante en que empieza el día civil

  // local -> zulu -> local: para las 1440 horas del día.
  for (let m = 0; m < 1440; m++) {
    const localStr = hhmm(m);
    const instant = new Date(start + m * 60000); // único instante del día civil con esa pared local
    const expZulu = hhmm(utcMinOfDay(instant)); // cara UTC de ese instante (oráculo Intl)

    const a = normalizarHora({ hora: localStr, tz: "local" }, ahora);
    expect(a.fuente).toBe("local");
    expect(a.local).toBe(localStr);
    expect(a.zulu).toBe(expZulu);

    const back = normalizarHora(`${a.zulu}Z`, ahora);
    expect(back.fuente).toBe("zulu");
    expect(back.zulu).toBe(a.zulu);
    expect(back.local).toBe(localStr); // identidad local->zulu->local
  }

  // zulu -> local -> zulu: para las 1440 horas del día.
  for (let m = 0; m < 1440; m++) {
    const zStr = hhmm(m);
    const inst = new Date(Date.UTC(y, mo - 1, d, Math.floor(m / 60), m % 60)); // instante calendario D@HH:MM UTC
    const expLocal = hhmm(madridWallMinutes(inst)); // oráculo Intl

    const r = normalizarHora(`${zStr}Z`, ahora);
    expect(r.fuente).toBe("zulu");
    expect(r.zulu).toBe(zStr);
    expect(r.local).toBe(expLocal);

    const r2 = normalizarHora({ hora: r.local, tz: "local" }, ahora);
    expect(r2.zulu).toBe(zStr); // identidad zulu->local->zulu
  }
}

describe("normalizarHora — T1 round-trip property (días sin DST)", () => {
  it("verano 15-07-2026: 1440 horas, ambas direcciones, consistente con Intl", () => {
    assertNonDstDay("2026-07-15");
  });
  it("invierno 15-01-2026: 1440 horas, ambas direcciones, consistente con Intl", () => {
    assertNonDstDay("2026-01-15");
  });
});

// ---------------------------------------------------------------------------
// T1 — borde spring-forward 29-03-2026 (02:00 local no existe).
// ---------------------------------------------------------------------------
describe("normalizarHora — T1 borde DST spring-forward 29-03-2026", () => {
  const ahora = ahoraDe("2026-03-29");

  it("casos pineados: 01:59->00:59, 02:30->Error inexistente, 03:00->01:00", () => {
    expect(normalizarHora("01:59 local", ahora).zulu).toBe("00:59");
    expect(normalizarHora("03:00 local", ahora).zulu).toBe("01:00");
    // 02:xx no existe -> Error (y no es el stub NotImplemented cuando esté verde)
    expect(() => normalizarHora("02:30 local", ahora)).toThrow();
    expect(() => normalizarHora("02:30 local", ahora)).not.toThrow(/NotImplemented/i);
  });

  it("property: toda hora local EXISTENTE -> zulu del instante más temprano con esa pared; el hueco 02:xx lanza", () => {
    const primeras = earliestInstantByLocalMinute("2026-03-29");
    for (let m = 0; m < 1440; m++) {
      const localStr = hhmm(m);
      const enHueco = m >= 120 && m <= 179; // 02:00–02:59 no existen ese día
      // el oráculo Intl confirma el hueco exacto: sin instante <=> en hueco
      expect(primeras[m] === undefined).toBe(enHueco);
      if (enHueco) {
        expect(() => normalizarHora({ hora: localStr, tz: "local" }, ahora)).toThrow();
        expect(() => normalizarHora({ hora: localStr, tz: "local" }, ahora)).not.toThrow(/NotImplemented/i);
        continue;
      }
      const a = normalizarHora({ hora: localStr, tz: "local" }, ahora);
      expect(a.local).toBe(localStr);
      expect(a.zulu).toBe(hhmm(utcMinOfDay(primeras[m] as Date)));
    }
  });
});

// ---------------------------------------------------------------------------
// T1 — borde fall-back 25-10-2026 (02:00 local ocurre dos veces; se elige CEST).
// ---------------------------------------------------------------------------
describe("normalizarHora — T1 borde DST fall-back 25-10-2026", () => {
  const ahora = ahoraDe("2026-10-25");

  it("casos pineados: 02:30->00:30 (primera ocurrencia CEST), 03:00->02:00, 23:30->22:30 (CET, tramo final)", () => {
    expect(normalizarHora("02:30 local", ahora).zulu).toBe("00:30");
    expect(normalizarHora("03:00 local", ahora).zulu).toBe("02:00");
    // tramo CET del final del día de 25h: su cara UTC "22:xx" también ocurre
    // al INICIO de la ventana (local 00:xx CEST) — el caso del defecto 1.
    expect(normalizarHora("23:30 local", ahora).zulu).toBe("22:30");
  });

  it("zulu->local es TOTAL: ninguna de las 1440 horas Zulu lanza", () => {
    for (let m = 0; m < 1440; m++) {
      expect(() => normalizarHora(`${hhmm(m)}Z`, ahora)).not.toThrow();
    }
  });

  it("property: toda hora local -> zulu del instante MÁS TEMPRANO con esa pared (02:xx ambiguas -> CEST)", () => {
    const primeras = earliestInstantByLocalMinute("2026-10-25");
    for (let m = 0; m < 1440; m++) {
      // día de 25h: TODA pared local 00:00–23:59 existe (las 02:xx dos veces;
      // el oráculo ancla la primera ocurrencia, CEST)
      expect(primeras[m]).toBeDefined();
      const a = normalizarHora({ hora: hhmm(m), tz: "local" }, ahora);
      expect(a.local).toBe(hhmm(m));
      expect(a.zulu).toBe(hhmm(utcMinOfDay(primeras[m] as Date)));
    }
  });
});

// ---------------------------------------------------------------------------
// T1 — formas de entrada + T2 (default local) + formatoDual.
// ---------------------------------------------------------------------------
describe("normalizarHora — T1 formas de entrada + T2 default local (verano)", () => {
  const ahora = ahoraDe("2026-07-15");
  const zulu = { zulu: "11:23", local: "13:23", fuente: "zulu" };
  const local = { zulu: "11:23", local: "13:23", fuente: "local" };

  it("T2: '13:23' a secas -> local por defecto (zulu 11:23)", () => {
    expect(normalizarHora("13:23", ahora)).toEqual(local);
  });

  it("sufijos Z / zulu / ZULU / L / local, objeto {hora,tz}, 1-dígito y espacios", () => {
    expect(normalizarHora("11:23Z", ahora)).toEqual(zulu);
    expect(normalizarHora("11:23 zulu", ahora)).toEqual(zulu);
    expect(normalizarHora("11:23 ZULU", ahora)).toEqual(zulu);
    expect(normalizarHora("13:23L", ahora)).toEqual(local);
    expect(normalizarHora("13:23 local", ahora)).toEqual(local);
    expect(normalizarHora({ hora: "11:23", tz: "zulu" }, ahora)).toEqual(zulu);
    expect(normalizarHora({ hora: "13:23", tz: "local" }, ahora)).toEqual(local);
    expect(normalizarHora("9:05", ahora)).toEqual({ zulu: "07:05", local: "09:05", fuente: "local" });
    expect(normalizarHora("  13:23  ", ahora)).toEqual(local);
  });

  it("formatoDual: '11:23Z / 13:23 local' exacto", () => {
    expect(formatoDual({ zulu: "11:23", local: "13:23", fuente: "zulu" })).toBe("11:23Z / 13:23 local");
    expect(formatoDual({ zulu: "07:05", local: "09:05", fuente: "local" })).toBe("07:05Z / 09:05 local");
  });
});

// ---------------------------------------------------------------------------
// T3 — rango: fuera de 00:00–23:59 e ilegibles -> Error (cierra m2 a nivel lib).
// ---------------------------------------------------------------------------
describe("normalizarHora — T3 rango 00:00–23:59 (nivel lib)", () => {
  const ahora = ahoraDe("2026-07-15");

  it("rechaza '25:00', '12:60', '99:99', 'abc', '' y {hora:'24:00',tz:'local'}", () => {
    for (const bad of ["25:00", "12:60", "99:99", "abc", ""]) {
      expect(() => normalizarHora(bad, ahora)).toThrow();
      // debe ser el Error de rango real, no el stub NotImplemented
      expect(() => normalizarHora(bad, ahora)).not.toThrow(/NotImplemented/i);
    }
    expect(() => normalizarHora({ hora: "24:00", tz: "local" }, ahora)).toThrow();
    expect(() => normalizarHora({ hora: "24:00", tz: "local" }, ahora)).not.toThrow(/NotImplemented/i);
  });
});
