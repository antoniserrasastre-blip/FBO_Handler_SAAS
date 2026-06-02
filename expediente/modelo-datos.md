# Modelo de Datos — FBO Handler SaaS

Schema fuente: `prisma/schema.prisma`. Tipos TS: `src/types/v2.ts`.

## Jerarquía principal

```
Operator (ICAO code, ej: NJE)
  └── Aircraft (matrícula, ej: EC-MIL)
        └── Visit (1 estancia = 1 día operativo = palmaDay)
              ├── Movement ARRIVAL (eta, ata, state, paxCount)
              ├── Movement DEPARTURE (etd, atd, state)
              ├── Service[] (catering, extras, equipamiento)
              ├── Passenger[] (efímeros, encriptados)
              ├── CrewAssignment[] → CrewMember (persistente, encriptado)
              ├── MovementTask[] (checklist por puesto)
              └── EventLog[] (auditoría)
```

## Modelos clave

### Operator
- PK: `icaoCode` (ej: `NJE`, `VJT`, `EJU`)
- `isStateAircraft`: boolean — exención tasas AENA

### Aircraft
- PK: `registration` (matrícula, ej: `EC-MIL`)
- `aircraftType`, `mtowKg`, `noiseChapter`, `paxCapacityCertified`
- FK: `currentOperatorId` → Operator

### Visit
- `palmaDay`: fecha UTC calculada como medianoche local de Palma (ver Reglas de Oro)
- `type`: `TURNAROUND` | `OVERNIGHT`
- `arrivalDate`, `departureDate`
- FK: `assignedToId` → User (handler asignado)

### Movement
- `direction`: `ARRIVAL` | `DEPARTURE`
- `state`: `EXPECTED` → `ON_BLOCKS` → `PARKED` → `TURNAROUND` → `BOARDING` → `OFF_BLOCKS`
- `eta`/`etd`: hora planificada en **Zulu** (HH:MM UTC)
- `ata`/`atd`: hora actual en **Zulu**
- `callsign`, `parking`, `tobt` (Target Off-Blocks Time)

### Service
- `type`: `CATERING | DISHES | COOLER_BAG | STORAGE_BAG | LAUNDRY | THERMOS | NEWSPAPERS | WATER | GPU | ICE | CLEANING | STAIRS | ASU | CUSTOM`
- `state`: `PENDING` → `ARRIVED` → `DELIVERED` (o `CANCELLED`)
- `origin`: `NETJETS | CATERING_AIRE | MCR | OTHER`
- Fuente: Excel Mallorcair (importación) o manual

### Passenger (efímero, encriptado)
- `fullNameHash`: SHA-256 del nombre (para búsqueda sin desencriptar)
- `passportEncrypted`, `dobEncrypted`: AES-256-GCM
- Cuelga de Movement (no persiste entre visitas)

### CrewMember (persistente, encriptado)
- UNIQUE: `(operatorId, passportHash)`
- `passportEncrypted`, `dobEncrypted`: AES-256-GCM
- `role`: `CAPTAIN | FIRST_OFFICER | CABIN_CREW | OTHER`

### CrewItem (almacén)
- `state`: `STORED` (llegada) → `RETURNED` (salida)
- Tipos: thermos, bolsa nevera, vajilla, lavandería

### Shift
- Turno activo de un usuario + sus puestos: `ARRIVALS | DEPARTURES | RAMP | RUNNER | COORDINADOR`

### User
- `role`: `ADMIN | SUPERVISOR | HANDLER | VIEWER`

## Zonas horarias (Regla de Oro)

| Dato | Zona |
|---|---|
| `palmaDay` | Medianoche UTC según fecha local Palma |
| `eta`, `etd`, `ata`, `atd` | **Zulu** (UTC) — usar `getUTCHours()` |
| Servicios/Catering | **Peninsular** (Europe/Madrid) — usar `getHours()` |

## Encriptación

Módulo: `src/lib/crypto.ts`
- Algoritmo: AES-256-GCM
- Campos encriptados: `passportEncrypted`, `dobEncrypted` (Passenger + CrewMember)
- Campos hash: `fullNameHash`, `passportHash` (SHA-256, para búsqueda/dedup)
- Key: env var `PASSPORT_ENCRYPTION_KEY`
