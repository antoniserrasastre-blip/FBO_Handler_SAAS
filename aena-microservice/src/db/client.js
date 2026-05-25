import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, 'schema.sql');

let _db;

export function getDb() {
  if (_db) return _db;
  const dbPath = process.env.AENA_DB_PATH || resolve(__dirname, '../../data/aena.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

export function initDb() {
  const db = getDb();
  const schema = readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Seed type defaults idempotently. The seed file is generated from the
  // EASA Jet Noise DB and committed to the repo.
  const defaults = JSON.parse(
    readFileSync(resolve(__dirname, 'seed-types.json'), 'utf8'),
  );
  const insert = db.prepare(`
    INSERT INTO aircraft_type_defaults (
      icao_type, manufacturer_model, mtow_kg, noise_chapter,
      cumulative_margin_epndb, pax_capacity_certified, notes
    ) VALUES (
      @icao_type, @manufacturer_model, @mtow_kg, @noise_chapter,
      @cumulative_margin_epndb, @pax_capacity_certified, @notes
    )
    ON CONFLICT(icao_type) DO UPDATE SET
      manufacturer_model = excluded.manufacturer_model,
      mtow_kg = excluded.mtow_kg,
      noise_chapter = excluded.noise_chapter,
      cumulative_margin_epndb = excluded.cumulative_margin_epndb,
      pax_capacity_certified = excluded.pax_capacity_certified,
      notes = excluded.notes
  `);
  const tx = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  tx(defaults);
  return db;
}
