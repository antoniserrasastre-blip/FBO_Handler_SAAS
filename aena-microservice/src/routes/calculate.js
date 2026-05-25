import { Router } from 'express';
import { getDb } from '../db/client.js';
import { loadTariff } from '../tariffs/index.js';
import { calculateAenaFees } from '../calc/index.js';

const router = Router();

function lookupAircraft(db, registration) {
  const row = db
    .prepare('SELECT * FROM aircraft_registrations WHERE registration = ?')
    .get(registration);
  if (!row) return { found: false };
  return {
    found: true,
    confirmed: !!row.confirmed,
    aircraft: {
      registration: row.registration,
      icaoType: row.icao_type,
      mtowKg: row.mtow_kg,
      noiseChapter: row.noise_chapter,
      cumulativeMarginEpndb: row.cumulative_margin_epndb,
      paxCapacityCertified: row.pax_capacity_certified,
    },
  };
}

function lookupDefaultForType(db, icaoType) {
  if (!icaoType) return null;
  const row = db
    .prepare('SELECT * FROM aircraft_type_defaults WHERE icao_type = ?')
    .get(String(icaoType).toUpperCase());
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

// POST /calculate
// Body shape: see README.
router.post('/', (req, res) => {
  const payload = req.body || {};
  const registration = String(payload.registration || '').trim().toUpperCase();
  if (!registration) {
    return res.status(400).json({ error: 'missing_registration' });
  }
  if (!payload.arrival || !payload.departure) {
    return res.status(400).json({ error: 'missing_legs', message: 'payload.arrival and payload.departure are required' });
  }

  const db = getDb();
  const ac = lookupAircraft(db, registration);

  if (!ac.found) {
    return res.status(409).json({
      error: 'AIRCRAFT_UNKNOWN',
      registration,
      defaultForType: lookupDefaultForType(db, payload.icaoType),
    });
  }
  if (!ac.confirmed) {
    return res.status(409).json({
      error: 'AIRCRAFT_UNCONFIRMED',
      registration,
      current: ac.aircraft,
    });
  }

  const tariff = loadTariff('LEPA');
  const result = calculateAenaFees({ payload, aircraft: ac.aircraft, tariff });

  // Persist the calculation for audit. Drop the _audit field from the
  // response body but keep it in the log.
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO calculations_log (
      visit_id, registration, tariff_version, mode,
      request_payload, response_total, response_payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.visitId || null,
    registration,
    result.tariffVersion,
    result.mode,
    JSON.stringify(payload),
    result.total,
    JSON.stringify(result),
    now,
  );

  const { _audit, ...publicResult } = result;
  res.json(publicResult);
});

export default router;
