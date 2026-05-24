# Auditoría y plan de test del "Modo Turno" (MALLORCAIR FBO)

> Documento de diseño. **No** modifica código. Audita el flujo de turno (ficha → cola por puesto → checklist → asignación → inventario crew → servicios/runner → traspaso) y propone un catálogo grande de tests realistas de pista.
>
> Convenciones de zona horaria que **todo test debe respetar** (invariantes):
> - `palmaDay`: medianoche UTC del día local de Palma vía `palmaDayUtc()` (`src/lib/time.ts:15`). Nunca `setHours(0,0,0,0)`.
> - Horas de vuelo (ETA/ETD/ATA/ATD): **Zulu/UTC**, comparar con `getUTCHours()`. La ventana de cola usa esto (`src/lib/shiftView.ts:42`, `src/lib/flightUrgency.ts:137`).
> - Horas de extras/catering: **Peninsular (Madrid)**, comparar con `getHours()` (`src/lib/overdue.ts:31`). `overdue.ts` es el patrón correcto.
> - Vuelos pernocta aparecen en dos días operativos.

---

## Parte 1 — Auditoría del flujo

### A. Qué sobra (peso muerto / redundante / no se usa en pista)

1. **Doble `useShift()` desacoplado** — `page.tsx:121` instancia `useShift()` solo para `activeShifts`, y `ShiftBar` (`ShiftBar.tsx:29`) instancia OTRO `useShift()` para `myShift` y lo sube por `onShiftChange` (`page.tsx:798`). Son dos fetchers independientes a `/api/shift`, sin SSE, cada uno con su `loading` y su estado. Resultado: dos round-trips por carga, posibilidad de que `myShift` (vía ShiftBar) y `activeShifts` (vía page) queden desincronizados unos segundos. La lista de `assignableUsers` se deriva de un fetch distinto del que decide la cola. *Es problema de código/arquitectura, no de modelo.* Debería ser un único provider/contexto de turno.

2. **`PrimaryAction` para foco SERVICES tira de checklist tasks, no de servicios** — `postFocus.ts:139` (`derivePrimaryAction`, rama `focus === "SERVICES"`) busca la próxima *MovementTask* pendiente. Pero la cola del runner se construye sobre `hasPendingService` (servicios reales: catering, agua…) en `shiftView.ts:75`, y el runner toca servicios en `ServiceChipRow`, no el checklist. La acción primaria "Siguiente: …" para un runner casi nunca apuntará a lo que de verdad va a hacer (mover un servicio del almacén). Foco SERVICES + acción primaria están desalineados. *Problema de modelo.*

3. **`getZuluNow()` / `getSpainToday()` duplican utilidades** — `time.ts:39` marca `getSpainToday` como deprecated pero `flights/route.ts:13,29,132` lo sigue usando. `getZuluNow()` (`time.ts:48`) no lo usa nadie del flujo de turno (shiftView calcula su propio `now` inline en `shiftView.ts:42`). Peso muerto.

4. **`crew-items` emite eventos con `type: "lost_item_updated"`** (`crew-items/route.ts:70,148,194`). El inventario de crew reusa el canal de eventos de objetos perdidos. No rompe nada, pero el toast que ve otro handler dirá "objeto olvidado" cuando en realidad se guardó/devolvió inventario crew (`page.tsx:250`). Etiqueta engañosa.

5. **`linkedFlightId` muerto** — `FlightView.linkedFlightId` siempre `null` (`flightView.ts:177`), `routeFieldToMovement` lo ignora (`flightView.ts:220`), y sigue en la whitelist de PATCH (`flights/[id]/route.ts:31`). Campo fantasma.

6. **Edit-strip pesado dentro de `VisitCard`** (`VisitCard.tsx:536-777`, ~240 líneas) está oculto en móvil (que es el dispositivo real de pista) y duplica lo que el detalle `/dia` ya hace. En el dispositivo del handler nunca se ve. Candidato a recorte para el caso "pista".

### B. Qué falta (situaciones reales que el modelo NO cubre)

1. **No hay auto-reparto entre dos handlers del mismo puesto** — *Confirmado* leyendo `shiftView.ts:130` (`visibleForPosts`) y `shift/route.ts`: la cola es puramente función del **puesto**, no del usuario. Dos personas fichadas en `RAMP` ven exactamente la misma cola; no hay partición. El único mecanismo de propiedad por persona es `assignedToId` (coordinador asigna) + filtro "Mis vuelos" (`page.tsx:487`). En pico de tráfico con 2 ramperos sin coordinador asignando, ambos pueden ir al mismo vuelo. *Falta de modelo.*

2. **Continuidad de traspaso a medio turnaround (handover) es parcial** — El estado operativo SÍ persiste en DB (MovementTask, CrewItem, Visit.assignedToId, Movement.state), así que el siguiente handler lo ve. PERO: `Visit.assignedToId` apunta a un `userId`; cuando ese handler ficha salida, `activeShifts` ya no lo incluye, así que `assignableUsers` (`page.tsx:122`) no lo trae y la insignia "Mío" (`VisitCard.tsx:186`) no resuelve para nadie. La asignación queda "huérfana" (apunta a alguien que ya no está en turno) y nadie la hereda. `handoverNotes` se guarda al cerrar (`shift/route.ts:113`) pero **nunca se muestra** al que ficha entrada — el `ShiftHandover` modal (`ShiftHandover.tsx`) se calcula sobre `flights`, ignora `handoverNotes` del turno anterior. *Falta de modelo + UX.*

3. **Desvío (diversion) y cancelación mid-shift no tienen camino propio** — `CANCELLED` existe como `flightCategory` y se filtra (`page.tsx:469`), pero no hay estado "DIVERTED" ni baja del avión ya en tierra. Un vuelo desviado a otro aeropuerto que ya estaba en la cola solo se puede "ocultar" marcándolo cancelado a mano. *Falta de modelo.*

4. **Cambio de día por ETD que cruza medianoche Zulu** — la cola compara minutos del día (`minutesUntil_HHMM`, `shiftView.ts:52`), sin fecha. Un vuelo con ETD 23:50 y `now` 23:30 entra bien, pero a las 00:10 (ya otro `palmaDay`) `minutesUntil_HHMM("23:50", 10)` da -1420 (negativo enorme) → sale de ventana, aunque el avión siga en tierra esperando salir. Los pernocta cuya salida cae de madrugada del día siguiente pueden desaparecer de la cola del turno de noche. *Falta — el wrap de medianoche no está modelado en la ventana.*

5. **Cross-match Excel: una matrícula con DOS visitas el mismo día se colapsa** — *Confirmado* en `import/extras/route.ts:96-101`: `visitByReg` es un `Map` keyed por matrícula; si el avión tiene dos visitas (dos turnarounds) el mismo `palmaDay`, el segundo `set` pisa al primero y **todos** los extras se cuelgan de una sola visita. No hay desambiguación por hora ni aviso. *Falta.*

6. **Matrícula que no casa → crea visita huérfana sin avisar en la cola** — `import/extras/route.ts:122` crea Visit huérfana (sin movements). Esa visita no tiene ETA/ETD, así que `inWindow` (`shiftView.ts:66`) la deja fuera de toda cola de turno (no es `isActiveNow`, no tiene horas). El runner nunca la ve aunque tenga servicios pendientes hasta que el PDF la enriquezca. *Falta — visita huérfana invisible para el runner.*

7. **Conflicto de parking (dos aviones, mismo stand)** — existe `parkingConflicts.ts` y `parkingStands.ts` pero **no** se cruza con la cola de turno ni con la VisitCard del modo turno. El handler de rampa no recibe señal de conflicto en su cola. *Falta de integración.*

8. **Toggle "ver toda la jornada" no persiste** — `shiftQueueActive` (`page.tsx:108`) arranca siempre en `true` y no se guarda en localStorage (a diferencia de `mineOnly`, `pendingOnly`, `nextHours`, `hideCancelled`). Al recargar el móvil en pista, vuelve a "Mi cola". Menor pero real.

9. **Sin candado de escritura concurrente** — dos handlers tocando el mismo checklist/servicio: `ChecklistPanel` y `ServiceChipRow` son optimistas (`ChecklistPanel.tsx:116`), el PUT de tasks hace upsert idempotente (`tasks/route.ts:80`), pero no hay versión/`updatedAt` check: el último en escribir gana sin aviso. SSE solo refresca la lista de vuelos (`page.tsx:256`), no propaga cambios de checklist/crew-items a otras pantallas en abierto salvo por el polling de 10s.

### C. Qué hay que mejorar y cómo (accionable)

| Área | Problema | Tipo | Cómo |
|---|---|---|---|
| Ventana de cola | No envuelve medianoche Zulu (B4) | código | `minutesUntil_HHMM` debería aceptar fecha/instante y comparar contra `arrivalInstant`/`departureInstant` (ya existen en `FlightView`, `v2.ts:70`) en vez de solo `HH:MM`. |
| Auto-reparto | Dos en mismo puesto ven lo mismo (B1) | modelo | O bien partir cola por `assignedToId` por defecto, o resaltar "ya lo tiene X" cuando otro turno activo del mismo puesto está en ese vuelo. Mínimo: badge "sin asignar" prominente en pico. |
| Handover | `handoverNotes` no se muestra; asignación huérfana (B2) | modelo+UX | Mostrar `handoverNotes` del último turno cerrado al fichar; al cerrar turno, ofrecer reasignar/heredar los vuelos `assignedToId == yo`. |
| Runner | Acción primaria mira tasks, no servicios (A2) | modelo | En foco SERVICES, `derivePrimaryAction` debería resolver el próximo *servicio* (PENDING→ARRIVED→DELIVERED), priorizando `SERVICE_FROM_WAREHOUSE` (`types/index.ts:87`). |
| Arquitectura turno | Doble `useShift` (A1) | código | Un único `ShiftProvider` (contexto) que sirva `myShift` + `activeShifts`; SSE para cambios de turno. |
| Cross-match | Colapso de matrícula duplicada (B5) | código | Desambiguar por hora/leg o por número de visitas; reportar como `errors[]` cuando hay >1 visita para la misma matrícula/día. |
| Huérfanas | Invisibles al runner (B6) | modelo | Una visita con servicios pendientes y sin movements debería entrar en la cola del runner aunque no tenga horas. |

### D. Qué se va a usar de verdad vs aspiracional (ranking por uso real en pista)

1. **Cola por puesto + "Mi cola / Toda la jornada"** — núcleo, uso constante. Es lo primero que mira el handler.
2. **ServiceChipRow (ciclo PENDING→ARRIVED→DELIVERED, long-press cancelar)** — uso altísimo en runner y filtro; táctil, ≥56px (`ServiceChipRow.tsx:108`). Real.
3. **Acción primaria ("Siguiente: …" / avanzar estado)** — útil en rampa/coordinador (avance de estado). En runner está mal cableada (A2).
4. **StateStepper + countdown de urgencia** — muy usado: el anillo de urgencia (`VisitCard.tsx:262`) es la señal de "se me va el avión".
5. **Checklist adaptativo (mascotas/policía/pernocta/ferry)** — usado en filtro y rampa; policía es P0 operativo.
6. **Inventario crew** — uso medio: pernoctas NetJets/VistaJet. Bien modelado (STORED→RETURNED) pero su evento está mal etiquetado (A4).
7. **Asignación coordinador + "Mis vuelos"** — depende de que haya coordinador fichado y asignando; en turnos pequeños sin coordinador, no se usa. Semi-aspiracional.
8. **Traspaso de turno (ShiftHandover modal + handoverNotes)** — aspiracional: el modal existe pero ignora las notas del turno previo (B2). Hoy se usa poco.
9. **Edit-strip pesado de VisitCard** — casi nulo en pista (oculto en móvil). Aspiracional/legacy.

---

## Parte 2 — Catálogo priorizado de tests

Leyenda: **[GAP]** = ningún test actual lo cubre (verificado contra los `*.test.*` del repo). **[COVERED]** = ya existe. Capas: *pura* / *componente* / *API* / *integración*. Prioridad por riesgo operativo: **P0** = el handler se pierde un vuelo o una notificación obligatoria (policía); **P1** = trabajo mal mostrado/contado; **P2** = pulido.

> Cobertura actual relevante: `shift.test.ts`, `shiftView.test.ts`, `checklist.test.ts`, `postFocus.test.ts`, `flightView.test.ts`, `VisitCard.test.tsx`, `ShiftQueueToggle.test.tsx`, `FilterToggleStrip.test.tsx`. **Sin tests**: API `/api/shift`, `/tasks`, `/crew-items`; componentes `ShiftBar`, `ChecklistPanel`, `CrewInventory`, `ShiftHandover`; hook `useShift`; `page.tsx` (composición de filtros).

### 1. Filtrado de cola por puesto (`projectShiftQueues` / `visibleForPosts`)

| # | Situación de pista | Comportamiento esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|1.1|ETA a +30 min, fichado Llegadas|entra en `arrivals` y en `visibleForPosts(["ARRIVALS"])`|pura|P0|[COVERED]|
|1.2|ETD a +45 min, TURNAROUND, fichado Salidas|entra en `departures`|pura|P0|[COVERED]|
|1.3|ETA a +180 min|fuera de la ventana de 60 min|pura|P1|[COVERED]|
|1.4|OFF_BLOCKS con ETA/ETD en ventana|fuera de TODAS las colas (ya despegó)|pura|P1|[COVERED]|
|1.5|ON_BLOCKS con servicio PENDING, fichado Runner|entra en `runner`|pura|P1|[COVERED]|
|1.6|ARRIVALS+DEPARTURES, vuelo en ambas colas|no se duplica en `visibleForPosts`|pura|P1|[COVERED]|
|1.7|`windowMinutes` configurable: vuelo a +90 con window=120|entra; con window=60 no|pura|P1|[GAP]|
|1.8|Vuelo exactamente en `now+60` (borde inclusivo)|entra (`delta <= windowMinutes`, `shiftView.ts:56`)|pura|P0|[GAP]|
|1.9|Vuelo exactamente en `now` (delta 0)|entra (`delta >= 0`)|pura|P1|[GAP]|
|1.10|Vuelo con ETD ya pasado por 1 min, aún ON_BLOCKS|sigue en cola (es `isActiveNow`, no despegado)|pura|P0|[GAP]|
|1.11|ETD 23:50, `now` 00:10 del día siguiente (wrap medianoche Zulu)|**hoy desaparece** — documentar como bug; test rojo esperado o `arrivalInstant`-based|pura|P0|[GAP]|
|1.12|PARKED (pernocta en plataforma) sin ETD próxima, fichado Salidas|`isDepartureQueue` lo incluye por estado PARKED|pura|P1|[GAP]|
|1.13|BOARDING fichado Salidas|incluido (estado de preparación)|pura|P1|[GAP]|
|1.14|EXPECTED con ETA fuera de ventana pero servicio pendiente, fichado Runner|entra solo en `runner`, no en arrivals|pura|P1|[GAP]|
|1.15|Servicio CANCELLED como único servicio, fichado Runner|NO entra en runner (`s.state !== CANCELLED`, `shiftView.ts:76`)|pura|P1|[GAP]|
|1.16|Servicio DELIVERED como único servicio|NO entra en runner|pura|P2|[GAP]|
|1.17|COORDINATOR sobre lista mixta|ve la cola `ramp` (BOTH) + sus `mine`|pura|P1|[GAP]|
|1.18|Vuelo huérfano (sin ETA/ETD, sin estado activo) con servicio pendiente|hoy NO entra en runner — documentar gap B6|pura|P0|[GAP]|
|1.19|ATD fijado pero estado aún ON_BLOCKS|`hasDeparted` true por `atd` → fuera de colas (`shiftView.ts:46`)|pura|P1|[GAP]|

### 2. Adaptividad del checklist (`tasksForFlight` / `checklistProgress`)

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|2.1|Origen Schengen (LFPB), sin mascotas|sin POLICE_NOTIFIED ni PETS_*|pura|P0|[COVERED]|
|2.2|`petCount=2`|PETS_ARRIVAL + PETS_DEPARTURE|pura|P1|[COVERED]|
|2.3|Origen EGLL (UK, no-Schengen)|POLICE_NOTIFIED presente|pura|P0|[COVERED]|
|2.4|Filtro por puesto ARRIVALS|solo tareas dirección ARRIVAL y post ARRIVALS|pura|P1|[COVERED]|
|2.5|Fila DONE en `flight.tasks`|se refleja DONE|pura|P1|[COVERED]|
|2.6|Sin `departureMovementId` (solo llegada)|sin tareas de salida|pura|P1|[COVERED]|
|2.7|Ferry (`paxDeparture=0`)|solo PUSHBACK en salida, sin BAGS_ON/PAX_ON/SECURITY_PAX|pura|P0|[COVERED]|
|2.8|Llegada con pax|IN_POSITION + PAX_OFF + BAGS_OFF|pura|P1|[COVERED]|
|2.9|Pernocta|CREW_PICKUP presente; no-pernocta ausente|pura|P1|[COVERED]|
|2.10|`checklistProgress` cuenta DONE y NA como hechas|done correcto|pura|P1|[COVERED]|
|2.11|Origen no-EU (Marruecos GMxx)|`getRequiredAuthorities` → policia **y** guardaCivil → POLICE_NOTIFIED|pura|P0|[GAP]|
|2.12|Origen EI (Irlanda: EU pero no Schengen)|policia true, guardaCivil false → POLICE_NOTIFIED presente|pura|P0|[GAP]|
|2.13|Origen LB/LR (Bulgaria/Rumanía: EU no Schengen)|POLICE_NOTIFIED presente|pura|P1|[GAP]|
|2.14|Origen USA (prefijo 1 letra "K")|no-Schengen no-EU → POLICE_NOTIFIED|pura|P0|[GAP]|
|2.15|Origen desconocido / null|sin POLICE_NOTIFIED (`countries.ts:171`, no flaggea)|pura|P1|[GAP]|
|2.16|Sin `arrivalMovementId` (solo salida, ferry de posicionamiento que arranca en PMI)|sin tareas de llegada|pura|P1|[GAP]|
|2.17|`crewArrival=0` (vuelo solo-pax)|sin CREW_RECEIVED|pura|P1|[GAP]|
|2.18|`crewDeparture=0`|sin SECURITY_CREW|pura|P1|[GAP]|
|2.19|Servicio CATERING no-cancelado|CATERING_LOADED presente; sin catering o cancelado, ausente|pura|P1|[GAP]|
|2.20|Filtro multi-puesto RAMP+ARRIVALS|incluye tareas de ambos posts (no colapsa)|pura|P1|[GAP]|
|2.21|Pernocta con leg llegada hoy y salida mañana|CREW_PICKUP en llegada (depende de `isOvernight`)|pura|P1|[GAP]|

### 3. Display de vuelo / urgencia / foco (`postFocus`, `deriveFocus`, `getFlightClock`, VisitCard)

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|3.1|Sin turno / varios puestos / RAMP / COORDINATOR|`deriveFocus` → FULL|pura|P1|[COVERED]|
|3.2|Solo ARRIVALS / DEPARTURES / RUNNER|→ ARRIVAL / DEPARTURE / SERVICES|pura|P1|[COVERED]|
|3.3|"Filtro" = ARRIVALS+DEPARTURES|→ FULL|pura|P1|[COVERED]|
|3.4|`legOrder` por foco|DEPARTURE lidera en foco DEPARTURE; resto ARR→DEP|pura|P1|[COVERED]|
|3.5|`hasSecondaryLeg`|true en focos especializados, false en FULL|pura|P2|[COVERED]|
|3.6|`nextFlightState` avanza/termina/normaliza legacy|correcto|pura|P1|[COVERED]|
|3.7|`derivePrimaryAction` FULL → avanza estado|kind state|pura|P1|[COVERED]|
|3.8|ARRIVAL → primera tarea ARRIVAL pendiente|kind task|pura|P1|[COVERED]|
|3.9|DEPARTURE ignora tareas de llegada|elige tarea DEPARTURE|pura|P1|[COVERED]|
|3.10|Sin tarea pendiente en leg → cae a avance de estado|kind state|pura|P1|[COVERED]|
|3.11|OFF_BLOCKS sin tareas → null|null|pura|P1|[COVERED]|
|3.12|VisitCard FULL: CTA "Empezar preparación" PARKED→TURNAROUND|onUpdate con state|comp|P1|[COVERED]|
|3.13|VisitCard cancelado: sin acción primaria|null|comp|P1|[COVERED]|
|3.14|VisitCard readOnly: sin acción primaria|null|comp|P1|[COVERED]|
|3.15|VisitCard DEPARTURES: leg DEP primero|chips DEP,ARR|comp|P1|[COVERED]|
|3.16|VisitCard ARRIVALS: leg secundario atenuado|`.leg-secondary` presente|comp|P2|[COVERED]|
|3.17|`getFlightClock`: EXPECTED→ETA, TURNAROUND/BOARDING/PARKED→ETD, OFF_BLOCKS→null|reloj correcto|pura|P1|[GAP]|
|3.18|Urgencia: minutesLeft<0 → "past" (anillo rojo)|ring danger|comp|P0|[GAP]|
|3.19|Urgencia: 0–30 → "critical"; 31–60 → "warning"; >60 → null|clase correcta|comp|P0|[GAP]|
|3.20|VisitCard runner (foco SERVICES): banda de servicios va ANTES de los legs|`focus-services` y strip arriba|comp|P1|[GAP]|
|3.21|**Acción primaria de runner debería apuntar a un servicio, no a una task** (A2)|documentar mismatch; test del comportamiento deseado|pura|P1|[GAP]|

### 4. Asignación & "Mis vuelos"

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|4.1|Coordinador + assignableUsers|selector de asignación visible|comp|P1|[COVERED]|
|4.2|Coordinador asigna → onAssign(flightId,userId)|callback con args|comp|P1|[COVERED]|
|4.3|No-coordinador con vuelo asignado|nombre en solo-lectura|comp|P1|[COVERED]|
|4.4|`assignedToId == currentUserId`|insignia "Mío"|comp|P1|[COVERED]|
|4.5|Asignado a otro|sin "Mío"|comp|P1|[COVERED]|
|4.6|`projectShiftQueues` cola `mine` con `currentUserId`|el asignado entra en `mine`|pura|P1|[COVERED]|
|4.7|Asignado a otro usuario|no entra en `mine`|pura|P1|[COVERED]|
|4.8|Sin `currentUserId`|`mine` vacío|pura|P1|[COVERED]|
|4.9|`visibleForPosts(RAMP)` incluye `mine` aunque esté fuera de ventana|incluido|pura|P1|[COVERED]|
|4.10|PATCH `assignedToId` en API → `Visit.assignedToId` + eventLog "flight_assigned"|persistido y logueado (`flights/[id]/route.ts:167`)|API|P1|[GAP]|
|4.11|PATCH `assignedToId: null` → desasigna + log "flight_unassigned"|null persistido|API|P1|[GAP]|
|4.12|"Mis vuelos" en `page.tsx` solo aplica con cola activa + sesión + isToday|filtro condicional (`page.tsx:487`)|integración|P1|[GAP]|
|4.13|Handler asignado ficha salida → asignación huérfana, "Mío" no resuelve para nadie (B2)|documentar gap; comportamiento deseado = heredar/avisar|integración|P0|[GAP]|
|4.14|Asignación sobrevive a refetch SSE (`page.tsx:336` reemplaza con respuesta del backend)|`assignedToName` resuelto|integración|P1|[GAP]|

### 5. Inventario crew (`CrewInventory` + `/crew-items`)

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|5.1|POST crea item STORED con `storedById`|201 + item STORED (`crew-items/route.ts:48`)|API|P1|[GAP]|
|5.2|POST con `type` inválido|400 "Tipo no válido"|API|P1|[GAP]|
|5.3|POST CUSTOM sin customName en cliente|botón Añadir deshabilitado (`CrewInventory.tsx:338`)|comp|P2|[GAP]|
|5.4|PATCH state→RETURNED fija `returnedAt`+`returnedById`|fija timestamps (`crew-items/route.ts:120`)|API|P1|[GAP]|
|5.5|PATCH RETURNED→STORED limpia `returnedAt`|null timestamps|API|P1|[GAP]|
|5.6|PATCH con `itemId` de otra visita|404 (`crew-items/route.ts:105`)|API|P0|[GAP]|
|5.7|DELETE item|borrado + eventLog|API|P2|[GAP]|
|5.8|Toggle optimista revierte si PATCH falla|estado anterior restaurado (`CrewInventory.tsx:205`)|comp|P1|[GAP]|
|5.9|Crew guarda termo+vajilla en llegada (Llegadas), salida (Salidas) los devuelve — el puente entre puestos|item STORED visible en ambos focos; RETURNED desde salida|integración|P1|[GAP]|
|5.10|readOnly sin items|no renderiza nada (`CrewInventory.tsx:235`)|comp|P2|[GAP]|
|5.11|VisitCard resumen de trabajo cuenta `inv` = items no devueltos (`VisitCard.tsx:235`)|contador correcto|comp|P1|[GAP]|
|5.12|Evento de crew-items hoy se emite como `lost_item_updated` (A4) → toast engañoso|documentar; comportamiento deseado = tipo propio|API|P2|[GAP]|

### 6. Servicios / Runner (`serviceCycle`, `ServiceChipRow`, `overdue`)

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|6.1|`nextServiceState`: PENDING→ARRIVED→DELIVERED→PENDING; basura→PENDING|ciclo correcto|pura|P1|[COVERED]|
|6.2|VisitCard strip: 3 servicios, 1 DELIVERED|"1/3 servidos"|comp|P1|[COVERED]|
|6.3|Click cicla PENDING→ARRIVED→DELIVERED→PENDING|onServiceToggle correcto|comp|P1|[COVERED]|
|6.4|Click en servicio no selecciona la card|onSelect no llamado|comp|P2|[COVERED]|
|6.5|readOnly no dispara toggle|sin toggle|comp|P1|[COVERED]|
|6.6|Servicio overdue marca clase `overdue`|clase presente|comp|P1|[COVERED]|
|6.7|`isServiceOverdue` con `scheduledAt` "08:00" y reloj **peninsular** 08:20|overdue (umbral 15)|pura|P0|[GAP]|
|6.8|`isServiceOverdue` DELIVERED nunca overdue|false (`overdue.ts:16`)|pura|P1|[GAP]|
|6.9|Hora embebida en customName ("Catering 08:00") como fallback|detecta y evalúa|pura|P1|[GAP]|
|6.10|Long-press cancela servicio activo; long-press en CANCELLED restaura|CANCELLED / PENDING (`ServiceChipRow.tsx:76`)|comp|P1|[GAP]|
|6.11|Tap corto sobre CANCELLED es no-op|sin cambio|comp|P1|[GAP]|
|6.12|Runner: servicio de almacén (CATERING, `SERVICE_FROM_WAREHOUSE`) PENDING resaltado "mío"|highlight true (`ServiceChipRow.tsx:152`)|comp|P1|[GAP]|
|6.13|Filtro (ARRIVALS/DEPARTURES): servicio almacén ARRIVED resaltado para él|highlight true|comp|P1|[GAP]|
|6.14|Servicio in-situ (WATER/GPU, no almacén) NO resaltado para runner|highlight false|comp|P1|[GAP]|
|6.15|Umbral overdue distinto (thresholdMinutes=5)|respeta umbral|pura|P2|[GAP]|
|6.16|Servicio sin hora ni embebida|nunca overdue|pura|P2|[GAP]|

### 7. Ventana temporal & límite de día (`timeWindow`, `palmaDayUtc`, instantes)

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|7.1|`toFlightView` combina ARRIVAL scheduledDate + eta → instante UTC|correcto|pura|P1|[COVERED]|
|7.2|eta nula/malformada → arrivalInstant null|null|pura|P1|[COVERED]|
|7.3|departureInstant análogo|correcto|pura|P1|[COVERED]|
|7.4|Pernocta: cada instante anclado a su propio leg (días distintos)|ARR día N, DEP día N+1|pura|P0|[COVERED]|
|7.5|`flightWithinHours`/`isWithinHours` ±N h en ms absolutos|correcto|pura|P1|[GAP]|
|7.6|Instante a +8h con window 8 entra; con 4 no|frontera correcta|pura|P1|[GAP]|
|7.7|`palmaDayUtc("2026-03-29")` (cambio horario DST primavera)|medianoche UTC del día local Palma correcta|pura|P1|[GAP]|
|7.8|`palmaDayUtc(Date)` cerca de medianoche peninsular cae en el día Palma correcto|correcto (no día UTC)|pura|P0|[GAP]|
|7.9|"Próximas Xh" se reevalúa cada minuto (nowTick) cuando isToday|vuelo entra/sale sin refresco|integración|P2|[GAP]|
|7.10|Pernocta cuya salida cae de madrugada del día siguiente (cruce medianoche)|debe seguir en cola del turno nocturno (ligado a B4)|pura|P0|[GAP]|

### 8. Traspaso de turno (handover) — `/api/shift`, `useShift`, `ShiftHandover`

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|8.1|POST `/api/shift` con posts válidos cierra turno previo y abre nuevo|`updateMany endedAt` + create (`shift/route.ts:55`)|API|P1|[GAP]|
|8.2|POST sin posts → 400 "al menos un puesto"|400|API|P1|[GAP]|
|8.3|POST con posts inválidos ("FOO")|400 (filtrados a vacío)|API|P1|[GAP]|
|8.4|PATCH cambia puestos en caliente|puestos actualizados (`shift/route.ts:87`)|API|P1|[GAP]|
|8.5|PATCH sin turno abierto → 404|404|API|P1|[GAP]|
|8.6|DELETE cierra turno guardando `handoverNotes`|`endedAt` + notes (`shift/route.ts:113`)|API|P1|[GAP]|
|8.7|GET devuelve `myShift` + `activeShifts` ordenados por startedAt|orden asc|API|P1|[GAP]|
|8.8|GET sin sesión → 401|401|API|P0|[GAP]|
|8.9|`parsePosts`/`serializePosts` round-trip y orden canónico|correcto|pura|P1|[COVERED]|
|8.10|Handler A cierra a medio turnaround, B ficha entrada: checklist DONE/NA persiste y B lo ve|MovementTask persiste en DB|integración|P0|[GAP]|
|8.11|Crew items STORED por A siguen visibles para B|CrewItem persiste|integración|P1|[GAP]|
|8.12|`handoverNotes` de A se muestra a B al fichar|hoy NO se muestra — documentar gap B2|integración|P0|[GAP]|
|8.13|Asignaciones de A quedan; B las hereda o ve aviso (hoy huérfanas, B2)|gap|integración|P0|[GAP]|
|8.14|`ShiftHandover` modal lista vuelos en curso, fuel pendiente, policía necesaria, objetos abiertos|secciones correctas (`ShiftHandover.tsx:41`)|comp|P1|[GAP]|
|8.15|`ShiftHandover` usa estado legacy "DISPATCHED" en filtros (`ShiftHandover.tsx:26`) en vez de OFF_BLOCKS|posible bug: vuelos OFF_BLOCKS aparecen como "en curso"|comp|P1|[GAP]|
|8.16|`useShift.clockIn/setPosts/clockOut` hacen el método HTTP correcto y refrescan|POST/PATCH/DELETE + refresh|comp/hook|P1|[GAP]|

### 9. Multi-handler / fichaje concurrente

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|9.1|Un handler ficha varios puestos a la vez (RAMP+RUNNER)|`visibleForPosts` une ambas colas deduplicado|pura|P1|[GAP]|
|9.2|Cambio de puesto en caliente (ARRIVALS→DEPARTURES) sin cerrar turno|cola conmuta; foco de VisitCard cambia leg líder|integración|P1|[GAP]|
|9.3|Dos handlers fichan el MISMO puesto → ambos ven la misma cola (sin auto-split, B1)|colas idénticas — documentar gap|pura|P0|[GAP]|
|9.4|`activeShifts` alimenta `assignableUsers` (otros en turno)|lista correcta (`page.tsx:122`)|integración|P1|[GAP]|
|9.5|Dos handlers tocan el mismo checklist a la vez (optimista, último gana)|sin candado — documentar; PUT idempotente no falla|API|P1|[GAP]|
|9.6|`ShiftBar` muestra "+N en turno" / iniciales de otros|render correcto (`ShiftBar.tsx:235`)|comp|P2|[GAP]|
|9.7|POST de turno cuando ya hay uno abierto → cierra el anterior (un turno abierto por usuario)|invariante 1-abierto (`shift/route.ts:55`)|API|P1|[GAP]|

### 10. Import / cross-match (Excel extras ↔ matrícula)

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|10.1|Matrícula del Excel casa con Visit del día → crea servicios PENDING|servicios creados, `matched++`|API|P1|[GAP]|
|10.2|Matrícula con/sin guion ("EC-MIL"/"ECMIL") casa igual|normalización (`extras/route.ts:100`)|API|P1|[GAP]|
|10.3|Matrícula NO casa → crea Visit huérfana sin movements + eventLog|huérfana creada (`extras/route.ts:122`)|API|P1|[GAP]|
|10.4|**Matrícula con DOS visitas el mismo día → hoy todas las extras a una sola (B5)**|documentar colapso; deseado = desambiguar o avisar|API|P0|[GAP]|
|10.5|Excel llega ANTES del PDF (huérfana) y luego el PDF enriquece la misma matrícula|servicios se conservan al añadir movements|integración|P1|[GAP]|
|10.6|Pernocta: extras del día de salida casan con Visit de día anterior (`extras/route.ts:104`)|casa por `departureDate`|API|P1|[GAP]|
|10.7|`direction` del servicio según `SERVICE_TYPE_DEFAULT_PHASE` (CATERING→DEPARTURE, WATER→ARRIVAL)|fase correcta (`extras/route.ts:146`)|API|P1|[GAP]|
|10.8|Servicio CATERING importado → checklist CATERING_LOADED aparece|enlace import↔checklist|integración|P1|[GAP]|
|10.9|Valor en columna que no parece matrícula → `errors[]`, ignorado (`excelParser.ts:170`)|reportado, no crea servicio|API/pura|P2|[GAP]|
|10.10|Huérfana con servicios pendientes no aparece en cola runner (B6)|documentar gap|integración|P0|[GAP]|

### 11. Composición de filtros en `page.tsx` (integración)

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|11.1|Cola activa + isToday + posts → `visibleForPosts` aplicado y ordenado por hora del foco (`page.tsx:470`)|ARRIVAL ordena por ETA, DEPARTURE por ETD|integración|P1|[GAP]|
|11.2|"Toda la jornada" (shiftQueueActive=false) desactiva filtro de cola sin cerrar turno|todos los vuelos del día|integración|P1|[GAP]|
|11.3|`mineOnly` se persiste; `shiftQueueActive` NO (B8)|documentar inconsistencia|integración|P2|[GAP]|
|11.4|`pendingOnly` ∩ `nextHours` ∩ `hideCancelled` ∩ cola se aplican en AND|intersección correcta|integración|P1|[GAP]|
|11.5|`focusFlight` desde alerta limpia filtros si el vuelo no es visible (`page.tsx:539`)|filtros off + scroll|integración|P2|[GAP]|
|11.6|Turno termina → chip "Mis vuelos" desaparece y deja de filtrar (`page.tsx:487`)|no esconde la lista|integración|P1|[GAP]|
|11.7|FilterToggleStrip: chips, ciclo 0→4→8→0, counts, aria-pressed|render/interacción|comp|P1|[COVERED]|
|11.8|ShiftQueueToggle: dos segmentos, count, aria-pressed, onChange|render/interacción|comp|P1|[COVERED]|

### 12. Estados de vuelo mid-shift (delay / early / divert / cancel) — `suggestNextState`

| # | Situación | Esperado | Capa | P | Estado |
|---|---|---|---|---|---|
|12.1|ETA editada (delay) re-evalúa ventana de cola al minuto siguiente|entra/sale según nueva hora|integración|P1|[GAP]|
|12.2|Vuelo llega antes (ATA fijado) en EXPECTED → `suggestNextState`→ON_BLOCKS (`flightUrgency.ts:111`)|auto-transición|pura|P1|[GAP]|
|12.3|ON_BLOCKS con fase llegada completa, no pernocta → TURNAROUND; pernocta → PARKED|correcto (`flightUrgency.ts:114`)|pura|P1|[GAP]|
|12.4|PARKED con ETD a <90 min → TURNAROUND|auto-sugerencia|pura|P1|[GAP]|
|12.5|TURNAROUND con paxDepState BOARDED → BOARDING|correcto|pura|P1|[GAP]|
|12.6|ATD fijado en cualquier estado → OFF_BLOCKS|salta a despegado (`flightUrgency.ts:102`)|pura|P1|[GAP]|
|12.7|Cancelación mid-shift (`flightCategory=CANCELLED`) → sale de cola con "Ocultar cancelados"|filtrado|integración|P1|[GAP]|
|12.8|Desvío: no hay estado DIVERTED (B3) — documentar gap|gap|—|P1|[GAP]|
|12.9|API PATCH sin `state` explícito dispara auto-transición; con `state` no (`flights/[id]/route.ts:138`)|auto solo sin override|API|P1|[GAP]|

---

## Resumen de cobertura

- **Total de escenarios catalogados: 138**
  - **[COVERED]: 44** (todos en lógica pura `shiftView`/`checklist`/`postFocus`/`flightView`/`serviceCycle` y componentes `VisitCard`/`FilterToggleStrip`/`ShiftQueueToggle`).
  - **[GAP]: 94**.
- **Concentración de gaps P0**: límite de día/medianoche Zulu (1.11, 7.8, 7.10), policía/autoridades por origen (2.11–2.15), urgencia visual (3.18–3.19), handover/asignación huérfana (4.13, 8.10, 8.12, 8.13), cross-match de matrícula duplicada y huérfanas invisibles (10.4, 10.10, 1.18), API shift sin auth (8.8), crew-item de otra visita (5.6), auto-split inexistente (9.3).
- **Capas sin ningún test hoy** (máxima prioridad de backlog): `/api/shift`, `/api/flights/[id]/tasks`, `/api/flights/[id]/crew-items`, `/api/import/extras`, hook `useShift`, componentes `ShiftBar`/`ChecklistPanel`/`CrewInventory`/`ShiftHandover`, y la composición de filtros de `page.tsx`.
