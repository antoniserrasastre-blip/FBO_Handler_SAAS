# Modelo de Datos — FBO Handler SaaS

Schema fuente (única verdad): modelos en `prisma/schema.prisma`.
Enums TS: `src/types/index.ts` y `src/types/v2.ts`. Cifrado: `src/lib/crypto.ts`.

> Nota: SQLite no soporta enums nativos de Prisma. Todos los "enums" son
> columnas `String` validadas en TypeScript (constantes `as const` en `src/types`).
> Los valores documentados abajo salen de esas constantes y de los comentarios
> del propio `schema.prisma`.

## Jerarquía principal (modelo v2)

```
Operator (icaoCode, ej: NJE)
  ├── Aircraft[] (registration, ej: EC-MIL)   ── currentOperatorId → Operator
  │     └── Visit[]                            ── aircraftId → Aircraft (Cascade)
  │           ├── Movement[] (ARRIVAL/DEPARTURE) ── visitId → Visit (Cascade)
  │           │     ├── Passenger[]            ── movementId → Movement (Cascade)
  │           │     ├── CrewAssignment[]       ── movementId → Movement (Cascade)
  │           │     ├── MovementTask[]         ── movementId → Movement (Cascade)
  │           │     └── EventLog[]             ── movementId → Movement? (Cascade)
  │           ├── Service[]                    ── visitId → Visit (Cascade)
  │           ├── CrewItem[]                   ── visitId → Visit (Cascade)
  │           ├── LostItem[]                   ── visitId → Visit (Cascade)
  │           └── EventLog[]                   ── visitId → Visit? (Cascade)
  └── CrewMember[]                             ── operatorId → Operator (Cascade)
        └── CrewAssignment[]                   ── crewMemberId → CrewMember (Cascade)
```

Notas de relación reales (no asumir):
- `Visit.operatorId` es **opcional** (`Operator?`) y separado del operador del avión.
- `Passenger` cuelga de **Movement**, no de Visit (efímero por leg).
- `CrewMember` cuelga de **Operator** (persistente); se enlaza al `Movement` vía la
  tabla puente `CrewAssignment`.
- `Service`, `CrewItem` y `LostItem` cuelgan de **Visit**, no de Movement.
- `EventLog` tiene ambos FKs opcionales (`visitId?`, `movementId?`, `userId?`).

## Modelos

### Operator
- PK técnica: `id` (cuid). `icaoCode` es `@unique` (ej: `NJE`, `VJT`, `EJU`).
- `name`, `isStateAircraft` (boolean, exención total tasas AENA — Ley 21/2003 art.68.4).
- Relaciones: `aircraft[]`, `visits[]`, `crewMembers[]`.

### Aircraft
- `registration` `@unique` (matrícula, ej: `EC-MIL`, `CS-PHF`). PK técnica `id`.
- `aircraftType?`, `baseAirport?`, FK `currentOperatorId?` → Operator.
- Datos tasas AENA: `mtowKg?`, `noiseChapter?` ("3"|"4"|"14"|"10"),
  `cumulativeMarginEpndb?`, `paxCapacityCertified?`.
- Confirmación de datos: `aircraftDataConfirmed`, `aircraftDataConfirmedById?`, `aircraftDataConfirmedAt?`.

### Visit
- FK `aircraftId` → Aircraft (Cascade), FK `operatorId?` → Operator.
- `palmaDay`: DateTime, medianoche UTC de la fecha local de Palma (día operativo).
- `type?`: `TURNAROUND` | `OVERNIGHT` | null (constante `VISIT_TYPES` en `v2.ts`).
- `arrivalDate?`, `departureDate?`, `notes?`.
- FK `assignedToId?` → User (relación `AssignedVisits`, handler asignado por el coordinador).
- Único: `@@unique([aircraftId, palmaDay])`. Índices: `aircraftId`, `palmaDay`, `operatorId`, `assignedToId`.

### Movement
- FK `visitId` → Visit (Cascade). Único: `@@unique([visitId, direction])` (máx. 1 ARRIVAL + 1 DEPARTURE).
- `direction`: `ARRIVAL` | `DEPARTURE` (constante `MOVEMENT_DIRECTIONS`).
- `callsign`, `origin?` (solo ARRIVAL), `destination?` (solo DEPARTURE), `scheduledDate` (DateTime).
- Tiempos Zulu como `String` "HH:MM": `eta?` (ARRIVAL), `etd?` (DEPARTURE), `ata?`, `atd?` (overrides handler).
- `parking?`, `tobt?`.
- `state` (default `EXPECTED`): `EXPECTED | ON_BLOCKS | PARKED | TURNAROUND | BOARDING | OFF_BLOCKS`.
- Conteos: `paxCount`/`paxCountReal?`, `crewCount`/`crewCountReal?`.
- Flujo pax: `paxState` (default `IN_AIRCRAFT`), `bagsState` (default `IN_AIRCRAFT`),
  `bagsChecked`, `bagsCabin`, `transportType` (default `UNDEFINED`), `transportState` (default `PENDING`),
  `crewLocation` (default `IN_AIRCRAFT`).
- Metadatos NetJets ALS: `rqstNumber?` (re-import idempotente, indexado),
  `flightCategory` (default `COMMERCIAL`: `COMMERCIAL | FERRY | CANCELLED` — `FLIGHT_CATEGORIES`),
  `modifiedFlag`, `petCount`.
- AENA: `commercialFlag` (default false; private→tarifa 2.1.1).
- Fuel (leg DEPARTURE): `fuelState` (default `NOT_REQUESTED`: `NOT_REQUESTED | REQUESTED | SERVED`),
  `fuelRequestedAt?`, `fuelServedAt?`.
- Toilet: `toiletState` (default `NOT_REQUESTED`: `NOT_REQUESTED | REQUESTED | COMPLETED`),
  `toiletRequestedAt?`, `toiletCompletedAt?`.
- Live OpenSky (nullable hasta primer match): `liveIcao24?` (indexado), `livePhase?`
  (`APPROACHING | LANDED | ON_BLOCKS | DEPARTED`), `liveLastSeenAt?`, `liveOnGround?`,
  `liveAltitudeM?`, `liveVelocityMs?`.

### Service
- FK `visitId` → Visit (Cascade), indexado.
- `type`: `CATERING | DISHES | COOLER_BAG | STORAGE_BAG | LAUNDRY | THERMOS | NEWSPAPERS | WATER | GPU | ICE | CUSTOM`.
- `direction` (default `DEPARTURE`): `ARRIVAL | DEPARTURE | BOTH`.
- `customName?`, `reference?` (nº orden NJE), `target?` (`CREW | PAX`),
  `origin?` (`NETJETS | CATERING_AIRE | MCR | OTHER` — `SERVICE_ORIGINS`), `quantity` (default 1),
  `rawDescription?` (texto crudo Excel, auditoría).
- `state` (default `PENDING`): `PENDING | ARRIVED | DELIVERED | CANCELLED`, con `arrivedAt?`, `deliveredAt?`.

### Passenger (efímero, PII cifrada)
- FK `movementId` → Movement (Cascade). Índices: `movementId`, `(movementId, passportHash)`.
- Nombre: `givenNames?`, `surname?`, `fullNameHash?` (SHA-256 para upsert idempotente).
- Pasaporte: `passportEncrypted?` (AES-256-GCM), `passportHash?` (SHA-256 lookup/dedupe),
  `passportType?` (`NID | PP` — `PASSPORT_TYPES`), `passportCountry?`, `passportExpiry?` (yyyy-mm-dd).
- `dobEncrypted?`, `gender?` (`M | F`), `nationality?`.
- `status` (default `CONFIRMED`): `CONFIRMED | NO_SHOW | ADDED`.
- `unmatched` (flag parser NetJets), `verified`,
  `source` (default `MANUAL`): `NETJETS | VISTAJET | EJU | GENDEC_PASTE | MANUAL` (`PASSENGER_SOURCES`),
  `corrections?`.

### CrewMember (persistente, PII cifrada)
- FK `operatorId` → Operator (Cascade). Único: `@@unique([operatorId, passportHash])`.
- `givenNames?`, `surname?`, `fullName` (obligatorio, **NO** tiene `fullNameHash` — eso es solo de Passenger).
- Pasaporte: `passportEncrypted?` (AES-256-GCM), `passportHash?` (SHA-256),
  `passportType?`, `passportCountry?`, `passportExpiry?`.
- `dobEncrypted?`, `gender?`, `nationality?`.
- `role` (default `OTHER`): `CAPTAIN | FIRST_OFFICER | CABIN_CREW | OTHER`. `active` (default true).

### CrewAssignment (tabla puente Movement ↔ CrewMember)
- PK compuesta: `@@id([movementId, crewMemberId])`. Índice: `crewMemberId`.
- Ambos FKs en Cascade. `roleOnFlight` (default `OTHER`): mismos valores que `CrewMember.role`.

### CrewItem (inventario de almacén crew)
- FK `visitId` → Visit (Cascade), indexado.
- `type`: `THERMOS | COOLER_BAG | STORAGE_BAG | DISHES | LAUNDRY | CUSTOM` (`CREW_ITEM_TYPES`).
- `customName?`, `quantity` (default 1).
- `state` (default `STORED`): `STORED | RETURNED` (`CREW_ITEM_STATES`).
- `notes?`, trazas: `storedAt`/`storedById?`, `returnedAt?`/`returnedById?`.

### MovementTask (checklist por leg)
- FK `movementId` → Movement (Cascade). Único: `@@unique([movementId, type])`.
- `type`: valores en `TASK_TYPES` (`src/types/index.ts`):
  `PAX_COUNTED, CREW_RECEIVED, POLICE_NOTIFIED, PETS_ARRIVAL, SECURITY_PAX, SECURITY_CREW,`
  `CATERING_LOADED, PETS_DEPARTURE, IN_POSITION, PAX_OFF, BAGS_OFF, CREW_PICKUP, BAGS_ON, PAX_ON, PUSHBACK`.
- `state` (default `PENDING`): `PENDING | DONE | NA` (`TASK_STATES`). `doneById?`, `doneAt?`.
- Catálogo de aplicabilidad/puesto: `src/lib/checklist.ts` (declarativo).

### LostItem
- FK `visitId` → Visit (Cascade), indexado.
- `description`, `location`: `AIRCRAFT | LOUNGE | RAMP`.
- `state` (default `FOUND`): `FOUND | CLAIMED | DELIVERED`, con `foundAt?`, `claimedAt?`, `deliveredAt?`, `claimedBy?`.

### EventLog (auditoría)
- FKs opcionales: `visitId?` → Visit, `movementId?` → Movement (ambos Cascade), `userId?` → User.
- `action`, `details?`, `timestamp`. Índices: `visitId`, `movementId`, `userId`.

## Modelos de identidad / soporte

### User
- `email` `@unique`, `name`, `password`, `role` (default `HANDLER`): `ADMIN | SUPERVISOR | HANDLER | VIEWER`.
- Relaciones: `eventLogs[]`, `servicePresets[]`, `shifts[]`, `assignedVisits[]`.

### Shift (fichaje de turno)
- FK `userId` → User (Cascade).
- `posts`: **CSV** de `ShiftPost` (multi-puesto, ej: `"ARRIVALS,DEPARTURES"`).
  Valores `SHIFT_POSTS` (`src/types/index.ts`): `RAMP | ARRIVALS | DEPARTURES | RUNNER | COORDINATOR`.
- `startedAt`, `endedAt?` (null mientras abierto), `handoverNotes?`. Índices: `userId`, `endedAt`.

### DaySheet (opt-in por día)
- `date` `@unique` (medianoche UTC de fecha local Palma), `notes?`, `closed` (default false, reservado).
- Opcional: el día existe en `/historico` derivado de `Visit.palmaDay` aunque no haya fila DaySheet.

### CustomServicePreset
- `name` `@unique`, `defaultTarget?` (`CREW | PAX | null`), FK `createdById?` → User.

## Cifrado de PII

Módulo: `src/lib/crypto.ts`.

- **Algoritmo**: AES-256-GCM (`ALGO = "aes-256-gcm"`), IV de 12 bytes, authTag de 16 bytes.
- **Formato del ciphertext**: `base64(iv || authTag || ciphertext)` (concatenación, luego base64).
- **Clave**: env `PASSPORT_ENCRYPTION_KEY`, base64 que decodifica a exactamente 32 bytes (se cachea).
  Su pérdida = pérdida permanente del PII descifrable.
- **Campos cifrados** (cada uno columna `*Encrypted`):
  - `Passenger.passportEncrypted`, `Passenger.dobEncrypted`
  - `CrewMember.passportEncrypted`, `CrewMember.dobEncrypted`
- **Campos hash (SHA-256, lookup/dedupe sin descifrar)** — vía `hashPII` (normaliza: trim + upper-case):
  - `Passenger.passportHash`, `Passenger.fullNameHash`
  - `CrewMember.passportHash` (NO existe `fullNameHash` en CrewMember)
- API: `encrypt`/`decrypt`/`tryDecrypt` (no lanza en lectura), `hashPII`, `encryptWithHash`.

## Tipos v2 vs compat/legacy

- **v2** (`src/types/v2.ts`): forma canónica del nuevo esquema. Incluye:
  - Constantes de enum: `MOVEMENT_DIRECTIONS`, `VISIT_TYPES`, `FLIGHT_CATEGORIES`,
    `SERVICE_ORIGINS`, `PASSPORT_TYPES`, `PASSENGER_SOURCES`.
  - `FlightView`: forma **adaptadora** que aplana Visit + sus Movements ARRIVAL/DEPARTURE en
    una estructura plana parecida al antiguo modelo `Flight`. Se construye en `src/lib/flightView.ts`.
    Su `id` **es el `visitId`** (los endpoints `/api/flights/[id]/*` lo usan como id de recurso).
    Sub-formas: `FlightViewService`, `FlightViewLostItem`, `FlightViewCrewItem`, `FlightViewTask`.
- **compat/legacy** (`src/types/compat.ts`): alias para componentes UI que antes importaban de
  `@prisma/client`. Los modelos v1 (`Flight`, `DaySheet`, `Service`, `Passenger`, `CrewMember`,
  `LostItem`) **ya no existen** en Prisma. Mapea:
  - `Flight = FlightView`, `Service = FlightViewService`, `LostItem = FlightViewLostItem`,
    `CrewItem = FlightViewCrewItem`, `Task = FlightViewTask` (re-exports de `./v2`).
  - Interfaces planas propias `DaySheet`, `Passenger`, `CrewMember`, `EventLog` con
    `flightId?` (alias legacy = `movementId`) para no romper imports antiguos.

## Zonas horarias (Regla de Oro)

| Dato | Zona |
|---|---|
| `Visit.palmaDay`, `DaySheet.date` | Medianoche UTC de la fecha local de Palma |
| `Movement.scheduledDate` | Medianoche UTC de la fecha local de Palma |
| `eta`, `etd`, `ata`, `atd` (HH:MM string) | **Zulu** (UTC) — usar `getUTCHours()` |
| Servicios / Catering | **Peninsular** (Europe/Madrid) — usar `getHours()` |
