import { Router } from 'express';
import { getDb } from '../db/client.js';

const router = Router();

const VALID_CHAPTERS = new Set(['3', '4', '14', '10']);

function rowToAircraft(row) {
  if (!row) return null;
  return {
    registration: row.registration,
    icaoType: row.icao_type,
    mtowKg: row.mtow_kg,
    noiseChapter: row.noise_chapter,
    cumulativeMarginEpndb: row.cumulative_margin_epndb,
    paxCapacityCertified: row.pax_capacity_certified,
    confirmed: !!row.confirmed,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  };
}

function rowToDefault(row) {
  if (!row) return null;
  return {
    icaoType: row.icao_type,
    manufacturerModel: row.manufacturer_model,
    mtowKg: row.mtow_kg,
    noiseChapter: row.noise_chapter,
    cumulativeMarginEpndb: row.cumulative_margin_epndb,
    paxCapacityCertified: row.pax_capacity_certified,
    notes: row.notes,
  };
}

// GET /aircraft/:registration
// Returns the stored airframe data, or — if unknown — the default for the
// supplied ?icaoType=… query (so the platform's confirmation modal can
// preload sensible values).
router.get('/:registration', (req, res) => {
  const reg = String(req.params.registration || '').trim().toUpperCase();
  if (!reg) return res.status(400).json({ error: 'missing_registration' });

  const db = getDb();
  const row = db
    .prepare('SELECT * FROM aircraft_registrations WHERE registration = ?')
    .get(reg);

  if (row) return res.json({ aircraft: rowToAircraft(row), defaultForType: null });

  const icaoType = String(req.query.icaoType || '').trim().toUpperCase();
  const def = icaoType
    ? db
        .prepare('SELECT * FROM aircraft_type_defaults WHERE icao_type = ?')
        .get(icaoType)
    : null;
  return res.status(404).json({
    error: 'aircraft_unknown',
    aircraft: null,
    defaultForType: rowToDefault(def),
  });
});

// PUT /aircraft/:registration
// Body: { icaoType?, mtowKg, noiseChapter, cumulativeMarginEpndb?,
//         paxCapacityCertified?, confirmedBy }
// Marks the row as confirmed=1.
router.put('/:registration', (req, res) => {
  const reg = String(req.params.registration || '').trim().toUpperCase();
  if (!reg) return res.status(400).json({ error: 'missing_registration' });

  const {
    icaoType,
    mtowKg,
    noiseChapter,
    cumulativeMarginEpndb,
    paxCapacityCertified,
    confirmedBy,
  } = req.body || {};

  if (typeof mtowKg !== 'number' || mtowKg <= 0 || mtowKg > 1_000_000) {
    return res.status(400).json({ error: 'invalid_mtow' });
  }
  if (!VALID_CHAPTERS.has(String(noiseChapter))) {
    return res.status(400).json({ error: 'invalid_noise_chapter', allowed: [...VALID_CHAPTERS] });
  }
  if (
    cumulativeMarginEpndb != null &&
    (typeof cumulativeMarginEpndb !== 'number' || !Number.isFinite(cumulativeMarginEpndb))
  ) {
    return res.status(400).json({ error: 'invalid_cumulative_margin' });
  }
  if (
    paxCapacityCertified != null &&
    (!Number.isInteger(paxCapacityCertified) || paxCapacityCertified < 0)
  ) {
    return res.status(400).json({ error: 'invalid_pax_capacity' });
  }
  if (!confirmedBy || typeof confirmedBy !== 'string') {
    return res.status(400).json({ error: 'missing_confirmed_by' });
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO aircraft_registrations (
      registration, icao_type, mtow_kg, noise_chapter,
      cumulative_margin_epndb, pax_capacity_certified,
      confirmed, confirmed_by, confirmed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(registration) DO UPDATE SET
      icao_type = excluded.icao_type,
      mtow_kg = excluded.mtow_kg,
      noise_chapter = excluded.noise_chapter,
      cumulative_margin_epndb = excluded.cumulative_margin_epndb,
      pax_capacity_certified = excluded.pax_capacity_certified,
      confirmed = 1,
      confirmed_by = excluded.confirmed_by,
      confirmed_at = excluded.confirmed_at,
      updated_at = excluded.updated_at
  `).run(
    reg,
    icaoType ? String(icaoType).toUpperCase() : null,
    Math.round(mtowKg),
    String(noiseChapter),
    cumulativeMarginEpndb ?? null,
    paxCapacityCertified ?? null,
    confirmedBy,
    now,
    now,
  );

  const row = db
    .prepare('SELECT * FROM aircraft_registrations WHERE registration = ?')
    .get(reg);
  res.json({ aircraft: rowToAircraft(row) });
});

export default router;
