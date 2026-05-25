# aena-microservice

Express microservice that computes AENA aerodrome fees for movements
coming from the FBO Handler SAAS app. Designed to run on `sirvici` and
be exposed to the Vercel-hosted Next.js app via Cloudflare Tunnel
(`aena.randomite.space` → `localhost:3002`).

The tariff source is the **Guía de Tarifas AENA, Edición Marzo 2026**.
Currently scoped to **LEPA (Palma de Mallorca)**.

## Endpoints

### `GET /health`
Liveness probe. No auth.

### `GET /aircraft/:registration?icaoType=XXXX`
Returns the stored airframe data for `:registration`. If the registration
is unknown and `icaoType` is supplied, the response includes a
`defaultForType` block prefilled from the EASA Jet Noise DB so the
platform's confirmation modal can preload sensible values.

### `POST /calculate`
Body shape:
```json
{
  "registration": "EC-CL35",
  "icaoType": "CL35",
  "visitId": "v_abc",
  "operator": { "isStateAircraft": false },
  "arrival": {
    "scheduledDate": "2026-05-18T00:00:00.000Z",
    "eta": "08:00",
    "ata": "08:05",
    "origin": "LFPB",
    "paxCount": 4,
    "paxCountReal": 4,
    "commercialFlag": false,
    "flightCategory": "COMMERCIAL"
  },
  "departure": {
    "scheduledDate": "2026-05-18T00:00:00.000Z",
    "etd": "15:00",
    "atd": "15:10",
    "destination": "LFPB",
    "paxCount": 4,
    "paxCountReal": 4,
    "connectionPax": 0,
    "commercialFlag": false,
    "flightCategory": "COMMERCIAL"
  }
}
```
Returns:
- `409 AIRCRAFT_UNKNOWN` if the registration has never been stored — payload includes `defaultForType` so the platform can preload the confirmation modal.
- `409 AIRCRAFT_UNCONFIRMED` if it exists but `confirmed = 0`.
- `200 OK` with `{ mode, total, breakdown, surcharges, tariffVersion }` otherwise. `mode` is `"provisional"` until both legs have real times (`ata` / `atd`) and real pax counts.

### `PUT /aircraft/:registration`
Body:
```json
{
  "icaoType": "CL35",
  "mtowKg": 18416,
  "noiseChapter": "4",
  "cumulativeMarginEpndb": 26.4,
  "paxCapacityCertified": 10,
  "confirmedBy": "antoni@mallorcair.es"
}
```
Marks the registration as human-confirmed.

## Run

```bash
npm install
npm start            # production
npm run dev          # auto-restart on file changes
PORT=4000 npm start  # custom port (default 3002)
```

## Tests

```bash
npm test
```

## Environment

See `.env.example`.
- `PORT` — listen port (default 3002)
- `AENA_MICROSERVICE_AUTH` — shared bearer token; empty disables auth
- `AENA_DB_PATH` — SQLite file (default `./data/aena.db`)

## Architecture

- `src/server.js` — Express bootstrap, bearer middleware, routers.
- `src/middleware/auth.js` — `Authorization: Bearer …` check.
- `src/db/schema.sql` — three tables: `aircraft_registrations` (mirror of
  the platform's `Aircraft.*` AENA fields), `aircraft_type_defaults`
  (EASA-seeded ICAO-type defaults), `calculations_log` (audit).
- `src/db/seed-types.json` — ~45 ICAO-type defaults sourced from
  `MAdB_JETS_20260225_.xlsx` (EASA Jet Noise DB, Issue 52).
- `src/routes/aircraft.js` — GET/PUT `/aircraft/:registration`.

Future folders: `src/calc/`, `src/tariffs/lepa-2026-03.json`,
`src/routes/calculate.js`.
