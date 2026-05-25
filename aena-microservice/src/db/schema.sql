-- aena-microservice local cache.
-- Source of truth lives in the Next.js platform (Aircraft.* fields); the
-- platform pushes updates here via PUT /aircraft/:registration. We also
-- store ICAO-type defaults so that an unknown registration can prefill
-- the operator confirmation modal with a sensible starting point.

CREATE TABLE IF NOT EXISTS aircraft_registrations (
  registration            TEXT PRIMARY KEY,           -- e.g. "EC-MIL"
  icao_type               TEXT,                       -- e.g. "GLEX"
  mtow_kg                 INTEGER NOT NULL,
  noise_chapter           TEXT NOT NULL,              -- "3" | "4" | "14" | "10"
  cumulative_margin_epndb REAL,                       -- null for turboprops
  pax_capacity_certified  INTEGER,                    -- for noise-surcharge eligibility
  confirmed               INTEGER NOT NULL DEFAULT 0, -- bool: human-verified
  confirmed_by            TEXT,
  confirmed_at            TEXT,
  updated_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aircraft_icao ON aircraft_registrations(icao_type);

-- ICAO-type seed: representative MTOW and noise data per type designator,
-- pulled from the EASA Jet Noise DB (Issue 52, 25-Feb-2026). Used to
-- prefill the operator confirmation modal when a registration is unknown.
CREATE TABLE IF NOT EXISTS aircraft_type_defaults (
  icao_type               TEXT PRIMARY KEY,
  manufacturer_model      TEXT NOT NULL,
  mtow_kg                 INTEGER NOT NULL,
  noise_chapter           TEXT NOT NULL,
  cumulative_margin_epndb REAL,
  pax_capacity_certified  INTEGER,
  notes                   TEXT
);

-- Calculation log for audit / dispute resolution.
CREATE TABLE IF NOT EXISTS calculations_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id        TEXT,
  registration    TEXT,
  tariff_version  TEXT NOT NULL,
  mode            TEXT NOT NULL,                      -- "provisional" | "final"
  request_payload TEXT NOT NULL,                      -- JSON
  response_total  REAL NOT NULL,
  response_payload TEXT NOT NULL,                     -- JSON breakdown
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calc_visit ON calculations_log(visit_id);
CREATE INDEX IF NOT EXISTS idx_calc_reg ON calculations_log(registration);
