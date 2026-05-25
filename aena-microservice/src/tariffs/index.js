import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pointer to the currently-active tariff edition for LEPA. To roll a new
// version, drop a new file alongside this one and change the import here.
const CURRENT_LEPA = resolve(__dirname, 'lepa-2026-03.json');

let _cached;

export function loadTariff(airportIcao = 'LEPA') {
  if (airportIcao !== 'LEPA') {
    throw new Error(`tariff_unavailable_for_airport: ${airportIcao}`);
  }
  if (!_cached) {
    _cached = JSON.parse(readFileSync(CURRENT_LEPA, 'utf8'));
  }
  return _cached;
}
