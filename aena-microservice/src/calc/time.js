// Time helpers. All `HH:MM` strings in the FBO platform are Zulu (UTC).
// `scheduledDate` is a UTC midnight aligned to the Palma local operating day.

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseHHMM(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = HHMM_RE.exec(hhmm.trim());
  if (!m) return null;
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

/**
 * Combine a UTC scheduledDate with an HH:MM Zulu time → Date.
 * Returns null if either input is missing/malformed.
 */
export function combineZulu(scheduledDate, hhmm) {
  if (!scheduledDate || !hhmm) return null;
  const t = parseHHMM(hhmm);
  if (!t) return null;
  const d = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    t.hh,
    t.mm,
    0,
    0,
  ));
}

const palmaParts = (() => {
  // Cached formatter; DST is handled automatically by the runtime.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
})();

/**
 * Returns the Palma local hour (0-23) and month (1-12) for a given UTC Date.
 */
export function palmaLocal(date) {
  const parts = palmaParts.formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour: Number(m.hour === '24' ? '0' : m.hour),
    minute: Number(m.minute),
  };
}

/**
 * True if the Palma-local time of `date` falls within the window
 * [startHHMM, endHHMM). If start > end the window wraps midnight.
 */
export function isInLocalWindow(date, startHHMM, endHHMM) {
  const { hour, minute } = palmaLocal(date);
  const m = hour * 60 + minute;
  const [sH, sM] = startHHMM.split(':').map(Number);
  const [eH, eM] = endHHMM.split(':').map(Number);
  const s = sH * 60 + sM;
  const e = eH * 60 + eM;
  if (s === e) return false;
  if (s < e) return m >= s && m < e;
  // Wraps midnight (e.g. 23:00 → 07:00).
  return m >= s || m < e;
}
