# Refactor v2: dominio Operator → Aircraft → Visit → Movement

Este documento describe el cambio de schema de v1 (Flight monolítico) a v2 (modelo
relacional con personas persistentes y PII encriptada).

## Diagrama

```
Operator (NJE, VJT, EJU, …)
   ├── Aircraft (por matrícula, una por avión)
   │     └── Visit (estancia en Palma, un día)
   │           ├── Movement (ARRIVAL)
   │           ├── Movement (DEPARTURE)
   │           ├── Service[] (catering, prensa, fuel, …)
   │           └── LostItem[]
   └── CrewMember (persistente, encriptado)
          └── CrewAssignment (por Movement)

Passenger (efímero, encriptado) → cuelga de Movement
```

## Fuentes de datos

1. **Cybermax PDF** (`src/lib/pdfParser.ts`) → `Aircraft + Visit + Movement(ARR/DEP)`.
   Orden del día del FBO. Contadores agregados de pax/crew, sin nombres.
2. **Excel Mallorcair extras** (`src/lib/excelParser.ts`) → `Service[]` colgando
   de `Visit`. Cruce por matrícula. Si llega antes que el PDF, se crea una
   `Visit` huérfana (sin Movements) que se enriquece después.
3. **NetJets ALS PDF** → `pdf-microservice` (Express @ sirvici, vía Cloudflare
   Tunnel). Devuelve JSON con `flights[]` y `persons[]`. Lo consume
   `/api/import/netjets-pax` que persiste `Passenger[]` (efímero) y
   `CrewMember + CrewAssignment` (persistente).

## PII y encriptación

Pasaportes y fechas de nacimiento se guardan en columnas `*Encrypted`
(AES-256-GCM, IV+tag+ciphertext en base64). Búsquedas e idempotencia usan
`*Hash` (SHA-256 normalizado). La clave vive en `PASSPORT_ENCRYPTION_KEY`.
Perder esa clave = perder los datos descifrables. **Backup obligatorio.**

## Lo que está hecho en este commit

- `prisma/schema.prisma`: schema v2 completo.
- `src/lib/crypto.ts`: encrypt/decrypt/hash.
- `src/lib/flightView.ts`: adapter `Visit + Movements → FlightView` con shape
  idéntico al `Flight` v1 para que la UI siga consumiendo lo mismo.
- `src/lib/v2/upsert.ts`: helpers de upsert para Aircraft/Visit/Movement.
- `src/app/api/flights/*`: reescrito sobre Visit; `id` ahora es `visitId`.
- `src/app/api/import/{route,extras}/`: reescritos al modelo v2.
- `src/app/api/import/netjets-pax/`: **NUEVO**, proxy al microservicio.
- `src/app/api/{services,passengers,crew,lost-items}/[id]/`: reescritos.
- `src/app/api/daysheets/`, `metrics/`: derivados de Visit/Movement.
- `src/types/{v2.ts,compat.ts}`: tipos v2 + aliases legacy para UI.
- `scripts/migrate-to-v2.ts`: dump v1 → apply v2 con encriptado.
- `prisma/seed.ts`: seed v2 con Operators + Aircraft + Visits demo.
- `.env.example`: vars nuevas (PASSPORT_ENCRYPTION_KEY, PDF_MICROSERVICE_URL,
  PDF_MICROSERVICE_AUTH).

## Lo que queda pendiente (TODO v2)

### Funcionalidades en pausa con 503

- `/api/export/*`: PDF/Excel exports. Hay que reescribir contra Visit/Movement.
- `/api/live/poll`, `/api/live/flights`: tracking ADS-B. Columnas live (lat/lng,
  phase) no portadas; decisión: ¿van en Movement o en `LiveSnapshot` aparte?
- `scripts/seed-from-docs.ts`, `scripts/seed-gendec-13apr.ts`: deprecados.

### Tests skipeados

- `src/app/api/flights/[id]/route.test.ts` (3 tests)
- `src/app/api/services/[id]/route.test.ts` (3 tests)
- `src/app/api/daysheets/route.test.ts` (1 test)

Hay que reescribir los mocks de Prisma para `visit`/`movement`.

### UI

Los componentes (`FlightCard`, `dia/`, `timeline/`, `page.tsx`) consumen el
adapter `FlightView` que mantiene el shape antiguo, así que **siguen funcionando
sin tocarlos**. A medio plazo conviene migrarlos a tipos v2 nativos
(Movement direccional, CrewMember separado de Passenger, etc.) y a usar los
campos nuevos: `rqstNumber`, `flightCategory`, `petCount`, `modifiedFlag`.

### Otros

- `liveTracking.ts` y `liveTrackingWorker.ts`: stubs no-op. Reimplementar
  cuando se decida el modelo de live columns.
- `parkingConflicts.ts`, `serviceTemplates.ts`, `gendecParser.ts`: sin tocar;
  consumen tipos estructurales que coinciden con `FlightView`.

## Cómo migrar la BD actual

```bash
# 1. Backup
cp dev.db dev.db.backup

# 2. Dump v1 plan (mientras el schema viejo siga vivo en la BD)
tsx scripts/migrate-to-v2.ts

# 3. Aplica el schema nuevo (esto BORRA las tablas v1)
npx prisma db push

# 4. Genera la PASSPORT_ENCRYPTION_KEY y ponla en .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 5. Aplica el plan al schema nuevo (encripta al vuelo)
tsx scripts/migrate-to-v2.ts --apply
```

## Variables de entorno nuevas

```
PASSPORT_ENCRYPTION_KEY=...    # 32 bytes base64
PDF_MICROSERVICE_URL=...       # http://localhost:3001 en dev
PDF_MICROSERVICE_AUTH=...      # opcional
```
