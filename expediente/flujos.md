# Flujos Principales — FBO Handler SaaS

> Reconstruido contra el código real. Cada paso cita el símbolo/fichero que lo
> implementa. Donde el código contradice la intuición, hay una nota.

Patrón común a todas las escrituras: **autorización** (`requireWriter` de
`src/lib/roles`), **escritura Prisma**, **EventLog** (`prisma.eventLog.create`)
y **emisión SSE** (`eventBus.emit` de `src/lib/events`). Los importadores usan
two-phase: `POST` = preview sin tocar DB, `PUT` = persistir.

---

## 1. Importación PDF (Cybermax → vuelos)

Ruta: `src/app/api/import/route.ts`. Parser vía la fachada
`parseCybermaxPdf` de `src/lib/pdfParser.ts`, que delega en
`src/lib/pdfParserV2.ts` (parser por coordenadas X,Y, pdfjs-dist v3 legacy).
V1 fue eliminado; `pdfParser.ts` es solo una fachada de tipos sobre V2.

### POST — preview (sin DB)
1. `validateContentLength` + `validateUpload` (`src/lib/uploadValidation`).
2. Por cada fichero: `parseCybermaxPdf(buffer)` → `{ date, flights, errors, warnings }`.
3. **Reconciliación de cancelaciones**: si hay `date`, busca `prisma.visit.findMany`
   con movimientos en `parseDate(date)`; los registros cuya matrícula NO está en
   el PDF nuevo y que aún no están `CANCELLED` se devuelven como `toCancel`
   (candidatos a cancelar, el usuario confirma en el preview).
4. Devuelve `{ date, flights, errors, warnings, toCancel }`. No escribe nada.

### PUT — persistir
Por cada vuelo `f` del body:
1. `resolveImportState(f.arrivalDate, f.departureDate, targetDate)`
   (`src/lib/v2/resolveImportState.ts`) deriva `arrivalState`, `departureState`,
   `visitDay` (= día de llegada, ancla la pernocta) y `visitType`
   (`OVERNIGHT` si arrDate ≠ depDate, si no `TURNAROUND`).
2. Operador: `findOperator(callsign)` (`src/lib/operators`) → `upsertOperator`.
3. `upsertAircraft({ registration, aircraftType, callsignForOperator })`.
4. `upsertVisit({ aircraftId, palmaDay: visitDay, operatorId })` → `{ record, wasCreated }`.
5. **Campos plan de la Visit siempre se actualizan**: tras el upsert hace
   `prisma.visit.update` con `type`, `arrivalDate`, `departureDate`.
6. `upsertMovement` ARRIVAL con `origin/eta/paxCount/crewCount/parking/state`
   (state = `arrivalState`).
7. `upsertMovement` DEPARTURE con `destination/etd/paxCount/crewCount/parking/state`
   (state = `departureState`, siempre `EXPECTED`: el leg de salida aún no ha despegado.
   El estado mostrado del visit lo **compone** `flightView` a partir de ambos legs — ver
   "Estado del visit" abajo).
8. `EventLog`: "Importado desde PDF" si `wasCreated`, "Actualizado desde PDF" si no.
9. Si `cancelIds` viene en el body: soft-cancel → `prisma.movement.updateMany`
   pone `flightCategory: "CANCELLED"` en todos los movements de esas visitas
   (servicios/pax/crew se preservan).
10. Un único `eventBus.emit({ type: "flight_created", flightId: "import", ... })`
    al final con el resumen (`N nuevos, M actualizados, K cancelados`).

### Plan vs operativo (clave de la idempotencia)
`upsertMovement` (`src/lib/v2/upsert.ts`) divide `data` usando el Set
`MOVEMENT_OPERATIONAL_FIELDS`. En CREATE escribe todo; en UPDATE (reimport)
escribe SOLO los campos plan.

- **Operativos (solo en create, nunca se sobrescriben en reimport)**: `state`,
  `paxCount`, `paxCountReal`, `parking`, `paxState`, `bagsState`, `fuelState`,
  `fuelRequestedAt`, `fuelServedAt`, `toiletState`, `toiletRequestedAt`,
  `toiletCompletedAt`, `bagsChecked`, `bagsCabin`, `transportType`,
  `transportState`, `crewLocation`, `ata`, `atd`, `tobt`.
- **Plan (se actualizan en cada reimport)**: `callsign`, `scheduledDate`,
  `origin`, `destination`, `eta`, `etd`, `crewCount` (todo lo no listado arriba).

Nota: `upsertAircraft` trata `aircraftType` como plan (lo actualiza si el PDF
trae uno distinto). La actualización de `operatorId` del aircraft está aplazada.

---

## 2. Importación Excel (Mallorcair → servicios)

Ruta: `src/app/api/import/extras/route.ts`. Parser `parseExtrasExcel`
(`src/lib/excelParser.ts`). El cruce es **por matrícula contra las Visits del
palmaDay**, no por callsign ni por fecha de movimiento.

### POST — preview
`validate*` → `parseExtrasExcel(buffer)` por fichero, acumula `extras` con su
`date`. Devuelve `{ date, extras, errors }`. No escribe.

### PUT — persistir
Agrupa los extras por fecha. Por cada fecha (`palmaDay = palmaDayUtc(dateStr)`):
1. Construye `visitByReg`: `prisma.visit.findMany({ palmaDay })` indexado por
   matrícula (con y sin guiones).
2. **Pernoctas**: añade visitas de días previos cuyo `departureDate === palmaDay`.
3. Por cada extra, busca la Visit por matrícula. Si no existe →
   **Visit huérfana**: `upsertAircraft` + `upsertVisit` (sin Movements), EventLog
   "Visit creada desde extras...", se añade a `pendingCreated`. Se enriquecerá
   cuando llegue el PDF Cybermax.
4. **Dedup additivo, nunca destructivo** (`getExistingKeyCounts` + claves
   `incomingServiceKey`/`existingServiceKey`):
   - Con `reference` (NJE): clave `type|REF:<reference>`.
   - Sin reference: clave `type|direction|target|customName`.
   - Para cantidades: `toCreate = max(0, quantity − yaPresentes)`. Si ya hay
     suficientes, no crea nada. Nunca borra ni modifica servicios existentes
     (ni manuales ni de imports previos).
5. Crea cada `prisma.service.create` con `state: "PENDING"`, `direction` por
   `SERVICE_TYPE_DEFAULT_PHASE`, y `origin` mapeado por `ORIGIN_MAP`
   (`NetJets→NETJETS`, `Catering Aire→CATERING_AIRE`, `MCR→MCR`, resto `OTHER`).
6. EventLog por extra; un `eventBus.emit({ type: "service_created",
   flightId: "import-extras", ... })` al final.

---

## 3. Importación de Pasajeros

### 3a. NetJets PAX (flujo activo)
Ruta: `src/app/api/import/netjets-pax/route.ts`.
1. `callMicroservice(file)`: proxy a un microservicio Express externo
   (`PDF_MICROSERVICE_URL`, bearer `PDF_MICROSERVICE_AUTH`), POST a
   `/parse/netjets`. Devuelve `NetjetsResponse` con `flights[]` y `persons[]`.
2. Por cada flight: resuelve operador (línea "Operator:" o `findOperator` por
   callsign; si no, ICAO sintético de 3 letras), `upsertAircraft`, `upsertVisit`
   (palmaDay = fecha del vuelo/reporte).
3. Movement DEPARTURE **idempotente por `rqstNumber`**: si existe uno con ese
   `rqstNumber` lo actualiza (`movementsMatched`); si no, `upsertMovement`
   DEPARTURE (`movementsCreated`). `flightCategory` = CANCELLED/FERRY/COMMERCIAL.
4. Por persona:
   - Crew (PIC/SIC/FA → `ROLE_MAP`): `CrewMember` UNIQUE por
     `(operatorId, passportHash)` — `findUnique` y crea o refresca campos;
     `passportEncrypted`/`dobEncrypted` vía `encrypt`, `passportHash` vía
     `hashPII` (`src/lib/crypto`). Luego `crewAssignment.upsert`
     por `(movementId, crewMemberId)`.
   - Pax: idempotente por `(movementId, passportHash)`; crea/actualiza
     `Passenger` cifrado, `source: "NETJETS"`, `status: "CONFIRMED"`.
5. EventLog por vuelo; `eventBus.emit({ type: "flight_updated",
   flightId: "import-netjets", ... })`.

Idempotencia: reimportar el mismo PDF actualiza en silencio; campos manuales
(p.ej. status NO_SHOW, verified) se conservan.

### 3b. GenDec (APARCADO — secundario, no se usa en operación)
Ruta: `src/app/api/flights/[id]/gendec/extract/route.ts`, parser
`parseGenDecText` (`src/lib/gendecParser.ts`). Solo hace **preview**: parsea el
texto pegado y devuelve `{ crew, passengers }` sin escribir en DB. La intención
era que la UI editara y POSTeara a `/crew` y `/passengers`. Decisión de
producto: flujo en pausa, no es la vía activa de pasajeros (esa es NetJets PAX).

---

## 4. Ciclo de servicio + auto-transición de estado

### Ciclo de servicio
`src/lib/serviceCycle.ts`: `nextServiceState` es un ciclo de 3 pasos que
envuelve — `PENDING → ARRIVED → DELIVERED → PENDING`. Usado en UI
(`ServiceChipRow.tsx`, `dia/page.tsx`), no en el backend. El PATCH de servicio
acepta además `CANCELLED`.

### PATCH de servicio → `src/app/api/services/[id]/route.ts`
1. Whitelist `ALLOWED_SERVICE_PATCH_FIELDS`; legacy `phase`→`direction`.
2. `resolveService(id)`: soporta ids sentinela `ci_<crewItemId>` materializando
   un Service mirror desde un `CrewItem` (`crewItemToService`).
3. Timestamps automáticos según `state`: ARRIVED→`arrivedAt`,
   DELIVERED→`deliveredAt` (+`arrivedAt` si faltaba), PENDING/CANCELLED limpian.
4. Si cambió el estado: EventLog + `eventBus.emit("service_updated")`.
5. **Auto-transición**: recarga la Visit y llama
   `suggestNextState(view, visit.services)` (`src/lib/flightUrgency`). Si sugiere
   un estado distinto, escribe el `state` en el Movement DEPARTURE (o ARRIVAL de
   fallback), crea EventLog "Auto-transición →" con `movementId`, y emite
   `eventBus.emit("flight_updated")`.

### PATCH de vuelo → `src/app/api/flights/[id]/route.ts`
1. `id` = visitId. Whitelist `ALLOWED_FLIGHT_PATCH_FIELDS`. Cada campo legacy se
   enruta a ARRIVAL/DEPARTURE/Visit/Aircraft vía `routeFieldToMovement`
   (`src/lib/flightView`). `assignedToId` va a `Visit.assignedToId`.
2. Aplica updates por bucket (visitUpdates / arrival / departure).
3. **Auto-transición solo si `rawBody.state === undefined`** (si el cliente fijó
   estado explícito, no auto-transiciona): recarga, llama
   `suggestNextState(flightView, refreshed.services)`. Si difiere, escribe el
   nuevo `state` en DEPARTURE (o ARRIVAL fallback) y recarga.
4. Construye `changes[]` legibles, EventLog si hay cambios, y siempre
   `eventBus.emit("flight_updated")`.

### Estado del visit (`mostAdvancedState` en `src/lib/flightView.ts`)
Cada Movement guarda el progreso **de su propio leg** (`arrivalState`, `departureState`). El
estado único que ven la Lista, `/dia` y `VisitCard` se **compone** tomando el punto más avanzado
del ciclo (`EXPECTED<ON_BLOCKS<PARKED<TURNAROUND<BOARDING<OFF_BLOCKS`) entre ARRIVAL y DEPARTURE.
Esto evita que una pernocta en su día de salida (llegada `PARKED`, salida `EXPECTED`) se muestre
como "Esperando llegada" y desatasca la auto-transición, que lee este estado compuesto. Normaliza
alias legacy (`ON_GROUND`→`ON_BLOCKS`) antes de comparar. La auto-transición sigue **escribiendo**
el nuevo estado en el movimiento DEPARTURE (o ARRIVAL fallback), no en el compuesto.

### `suggestNextState` (`src/lib/flightUrgency.ts`)
Máquina de estados de vuelo (distinta del ciclo de servicio):
- Si `atd` fijado y no OFF_BLOCKS → `OFF_BLOCKS`.
- `EXPECTED`: si la llegada fue "tocada" (ata / fuel / toilet / paxArr) → `ON_BLOCKS`.
- `ON_BLOCKS`: si `isArrivalComplete` (fuel SERVED + toilet COMPLETED + servicios
  ARRIVAL DELIVERED/CANCELLED) → `PARKED` si overnight, si no `TURNAROUND`.
- `PARKED`: si ETD a ≤90 min (y >−60) → `TURNAROUND`.
- `TURNAROUND`: si `paxDepState === BOARDED` → `BOARDING`.

> NOTA (deuda RESUELTA el 11-06-2026, commit `1557ee0`): la auto-transición que
> estaba duplicada y divergida entre `flights/[id]/route.ts` y
> `services/[id]/route.ts` se unificó en `src/lib/autoTransition.ts` — eventos
> SSE idénticos en ambos caminos y EventLog con el **código** de estado.

---

## 5. Eventos SSE (emit → stream)

- Bus: `src/lib/events.ts`. `EventBus` en memoria (Set de listeners), singleton
  process-local (un solo contenedor Docker — ver ADR 0001). Se **pierde en
  restart** y NO cruza instancias.
- Tipos en `FlightEventType` (flight_*/service_*/visit_*/movement_updated/
  passenger_updated/crew_updated/lost_item_updated). `flightId` = visitId en v2.
- Productores: cada mutación relevante llama `eventBus.emit(...)` (imports,
  PATCH/DELETE de flight y service, etc.).
- Consumidor: `src/app/api/events/route.ts` (`GET`, `force-dynamic`). Exige
  sesión, abre un `ReadableStream` SSE: mensaje inicial `connected`, heartbeat
  `: heartbeat` cada 30 s, y `eventBus.subscribe` reenvía cada evento como
  `data: <json>\n\n`. Limpia el listener en cancel/abort.

---

## 6. Zonas horarias (regla crítica transversal)

`src/lib/time.ts`:
- `palmaDayUtc(input)`: medianoche **UTC** del día local de Palma
  (Europe/Madrid). Una string `YYYY-MM-DD` se trata como fecha local directa
  (sin conversión de TZ); un `Date`/now se convierte vía `Intl`. Es la clave de
  Visit (`palmaDay`) y de los cruces de import.
- Vuelos en **Zulu**: `getZuluNow` usa `getUTCHours/getUTCMinutes`; y en
  `flightUrgency.minutesUntil_HHMM` el "ahora" por defecto es
  `new Date().getUTCHours()*60 + getUTCMinutes()`. Los relojes ETA/ETD de vuelo
  se comparan en UTC.
- Extras/catering en **peninsular** (Madrid): `madridWallMinutes(instant)` usa
  `Intl` con `timeZone: "Europe/Madrid"` (no `getHours()` crudo, para ser
  correcto bajo `TZ=UTC` en el contenedor). `getSpainToday` está deprecado a
  favor de `palmaDayUtc`.
- `src/lib/overdue.ts`: `isServiceOverdue` extrae HH:MM de `scheduledAt` o,
  como fallback, de `customName`/`rawDescription` ("Catering Aire 08:00"), y
  compara contra `madridWallMinutes(now)` + umbral (15 min por defecto). Es
  decir, los vencimientos de servicio se evalúan en **hora peninsular**,
  coherente con que los servicios son de Mallorcair/catering.
