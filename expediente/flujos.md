# Flujos Principales — FBO Handler SaaS

## A. Importación de Vuelos (PDF Cybermax)

```
PDF Cybermax (orden del día operacional)
  → src/lib/pdfParserV2.ts  (parsing por coordenadas X,Y)
  → POST /api/import
  → upsert Aircraft → upsert Visit (palmaDay) → upsert Movement (ARRIVAL/DEPARTURE)
  → SSE broadcast → UI actualiza en tiempo real
```

Reglas:
- Fuente de verdad para vuelos. V1 eliminado, solo `pdfParserV2.ts`.
- Si el vuelo ya existe (misma matrícula + palmaDay), hace upsert no duplica.

## B. Importación de Extras (Excel Mallorcair)

```
Excel Mallorcair (servicios por matrícula)
  → src/lib/excelParser.ts  (columna A=matrícula, cols E-G=cantidades)
  → POST /api/import/extras
  → Crea Service[] colgando de Visit (match por registro)
  → Si Visit no existe aún: crea Visit huérfana, se enriquece cuando llega el PDF
```

Reglas:
- Cruce por **Matrícula** (no por callsign ni fecha).
- Los servicios tienen `origin` (NETJETS, CATERING_AIRE, MCR, OTHER).

## C. Importación de Pasajeros (NetJets PDF)

```
PDF NetJets ALS
  → pdf-microservice (Express, Cloudflare Tunnel)
  → POST /api/import/netjets-pax
  → Crea Passenger[] (efímero, encriptado) + CrewMember (persistente) + CrewAssignment
```

Reglas:
- Pasaporte + DoB se encriptan inmediatamente (AES-256-GCM).
- CrewMember es UNIQUE por (operatorId, passportHash) — no se duplica.

## D. Ciclo de Estado de Servicio

```
PENDING  →  ARRIVED  →  DELIVERED
              ↓
           CANCELLED
```

- Handler marca "arrived" cuando el servicio llega a rampa/almacén.
- Handler marca "delivered" cuando se entrega al avión.
- Módulo: `src/lib/serviceCycle.ts`
- Detección de vencidos: `src/lib/overdue.ts`

## E. Ciclo de Estado de Movement

```
EXPECTED → ON_BLOCKS → PARKED → TURNAROUND → BOARDING → OFF_BLOCKS
```

- Cada cambio de estado se emite por SSE → todos los puestos ven el cambio en tiempo real.
- Bus de eventos: `src/lib/events.ts` (en memoria, se pierde en restart).

## F. Checklist por Puesto

Cada Movement genera `MovementTask[]` según el puesto activo del usuario:

| Puesto | Tareas ARRIVAL | Tareas DEPARTURE |
|---|---|---|
| RAMP | GPU, agua, limpieza, estacionamiento | Verificación last-minute |
| RUNNER (Almacén) | Registra STORED (thermos, nevera...) | Registra RETURNED |
| ARRIVALS | Recibe pax/crew, verifica pasaportes | — |
| DEPARTURES | — | Embarque, verificación fuel/toilet |
| COORDINADOR | Coordina todo | Prepara departure |

Módulo: `src/lib/checklist.ts` (catálogo declarativo de tareas).

## G. Ciclo Operativo Diario

```
1. Importar PDF del día → vuelos en DB
2. Puestos (Rampa, Llegadas, Runner) trabajan en paralelo vía SSE
3. Cada vuelo avanza de estado (EXPECTED → OFF_BLOCKS)
4. ShiftHandover al final del turno → notas para el siguiente
5. /historico acumula los días pasados
```

## H. Tasas AENA

```
Vuelo → datos (MTOW, pax, noise chapter, isStateAircraft)
  → aena-microservice/ (Node.js/Express)
  → Calcula: landing fee + parking fee + pax fee + noise surcharge
  → Devuelve desglose para exportación PDF/Excel
```

- `isStateAircraft = true` → exención total de tasas.

## I. Live Tracking (ADS-B)

```
Background polling → OpenSky API
  → src/lib/liveTracking.ts
  → GET /api/live/poll
  → Enriquece vuelos con lat/lng, altitud, velocidad, fase
  → Visible en /timeline y FlightCard (indicador live)
```
