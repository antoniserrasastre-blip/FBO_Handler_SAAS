# Plan Maestro — Testeo Profundo + Deuda de Diseño

> Objetivo: verificar mediante **tests de escenarios realistas** no solo que el sistema
> hace lo que se le pide, sino que está **bien diseñado**. Cada fase termina con la suite
> en **verde** y es committeable de forma independiente (modo quirúrgico).

## Parámetros del update (decididos con el dueño)
- **Alcance**: Tests + arreglar los bugs que destapen + deuda de diseño puntual.
- **Riesgo**: Quirúrgico. Suite verde en cada paso. Nada que pueda tumbar producción.
- **Fixtures**: usar los documentos reales del repo (`docs/`, `pdf-microservice/.../fixtures`).
- **AENA**: testear el cálculo standalone (consistencia); NO construir la integración
  app↔microservicio en este update; exactitud pendiente de factura real.
- **Filosofía**: cuando un test destapa un bug, primero se escribe el test que falla
  (rojo), luego se arregla el código (verde).

## Estado (live)
- **FASE 1 — ✅**: 9 tests skipped revividos → whitelists PATCH, guards de rol, asertos de EventBus. 0 skips.
- **FASE 2 — ✅**: +153 tests de cobertura (suggestNextState, flightView, crypto); doble conteo de pax corregido (dos cifras llegada/salida, backend+UI); TZ de `overdue` corregido (`madridWallMinutes` + `ENV TZ` Docker).
- **FASE 3 — ✅** (descubrimiento + arreglos):
  - A5: `requireWriter()` en los 4 endpoints de import/creación. 
  - pdfParserV2 golden tests (fixture real anonimizado) + **`findColumn` endurecido** (rangos sin solape; 3 fragilidades eliminadas).
  - excelParser: **BUG-2** (NJE `/1`,`/2` ya no se pierden) y **BUG-3** (dedup por leg) corregidos.
  - upsert/import: **política de reimport** ("plan del PDF, operativo intocable") → ediciones manuales protegidas; DEPARTURE de pernocta → `EXPECTED`; `resolveImportState()` puro extraído; `wasCreated` para etiqueta correcta; `aircraftType` se actualiza.
  - Bonus: test flaky `VisitCard > overdue pip` arreglado (reloj fijo).
- **FASE 0 — ✅**: 13 `ALTER TABLE` idempotentes (drift schema↔migración cerrado, incl. `DaySheet` y campos AENA); `@@unique(aircraftId, palmaDay)` en Visit; script V1 muerto reescrito a V2; test anti-drift en CI.
- **Suite global**: 259→**803 tests**, 40 ficheros, 0 skipped, tsc + prisma validate limpios.
- **Pendiente**: A6 (canal de errores del parser → preview), FASE 5 (PII fuera de EventLog, dedupe de auto-transición), FASE 4 (AENA calc), review final + merge.
- ⚠️ Sin commitear. El trabajo se asienta sobre WIP previo del dueño (campos AENA en `schema.prisma`, UI de `/lista`).
- ℹ️ Si la BD de prod tuviera Visits duplicadas, deduplicar antes de aplicar el unique index (snippet en `api/db/migrate`).

## Agentes y reparto
- `fbo-test` — escribe/repara tests (Vitest + Testing Library/happy-dom).
- `fbo-backend` — route handlers, Prisma/schema, EventBus, PII, modelo V2.
- `fbo-parsers` — pdfParser/pdfParserV2, excelParser, gendec, import routes.
- `fbo-reviewer` — pasada de revisión read-only antes de cada commit.
- `fbo-merge` — gate de verificación + commit convencional + push (auto-deploy).

---

## FASE 0 — Cimientos: desactivar la bomba de migración
**Por qué**: el deploy real corre `scripts/migrate-v2-schema.mjs` (CREATE TABLE IF NOT
EXISTS), no `prisma db push`. Las columnas nuevas del schema (`isStateAircraft`,
`Aircraft` AENA: `mtowKg/noiseChapter/cumulativeMarginEpndb/paxCapacityCertified/
aircraftDataConfirmed*`, `Movement.commercialFlag`) **no se crean** en una BD existente.
Bomba latente: explota cuando la app empiece a leer esas columnas (integración AENA).

- [ ] Añadir `ALTER TABLE ... ADD COLUMN` idempotentes al `migrate-v2-schema.mjs` y a
      `src/app/api/db/migrate/route.ts` (patrón ya presente en `push-turso-schema.ts:162`).
- [ ] Test/guard que verifique que tras correr el script existen TODAS las columnas de
      `schema.prisma` (detección de drift schema↔script).
- [ ] Borrar o reescribir el muerto `scripts/push-turso-schema.ts` (crea esquema V1 `Flight`).
- **Agentes**: `fbo-backend` (+ `fbo-test` para el guard). **Done**: script crea todas las
  columnas; sin esquema V1 activable; suite verde.

## FASE 1 — Recuperar conocimiento perdido (barato, alto valor)
**Por qué**: 9 tests en 3 ficheros están en `skip` con `TODO(v2)`. Protegían invariantes
clave que siguen vivas; solo cambió la forma del mock (Prisma `flight`→`visit`/`movement`).

- [ ] `flights/[id]/route.test.ts` — whitelist PATCH (ignora `daySheetId/id/createdAt`,
      preserva editables) + routing de campo a Movement ARRIVAL/DEPARTURE correcta.
- [ ] `services/[id]/route.test.ts` — whitelist PATCH (ignora `flightId/id`) + auto-transición.
- [ ] `daysheets/route.test.ts` — DELETE admin-only (401 anon / 403 supervisor / 200 admin).
- [ ] **Asertar los emits del EventBus** (hoy se mockean pero nunca se comprueban): exactamente
      un evento, con el `flightId` correcto, tras cada PATCH.
- **Agente**: `fbo-test`. **Done**: 0 tests en skip; emits cubiertos; suite verde.

## FASE 2 — Escenarios de dominio que exponen bugs (el corazón)
Funciones puras o casi puras → test primero (rojo), luego fix.

- [ ] **Doble conteo de pax** (BUG): turnaround llega 4 / sale 4 → `daysheets` y `metrics`
      reportan 8. Test rojo → fix con una **única** función de dominio `visitPaxTotal(visit)`
      usada en ambos sitios; usar `paxCountReal` cuando exista.
- [ ] **`suggestNextState`** (sin test directo): EXPECTED→ON_BLOCKS, PARKED→TURNAROUND a
      ≤90 min del ETD comparando hora **Zulu** (`getUTCHours`), BOARDING, etc.
- [ ] **`routeFieldToMovement` / `toFlightView`**: `paxArrival`→Movement ARRIVAL,
      `paxDeparture`→DEPARTURE (que no se inviertan las piernas).
- [ ] **TZ bug `overdue.ts`** (BUG): usa `getHours()` (local) pero el contenedor corre en
      **UTC** (Dockerfile sin `ENV TZ`) → desfase de 2 h en verano. Test rojo simulando
      `TZ=UTC` → fix (calcular hora de Madrid explícita con `Intl`, o fijar `TZ` en Dockerfile).
- [ ] **`crypto.ts`** directo: round-trip con no-ASCII, payload corrupto ("too short"),
      estabilidad de `hashPII` normalizado (dedupe de pasaportes).
- **Agentes**: `fbo-test` (rojos) + `fbo-backend` (fixes). **Done**: cada escenario con test;
  bugs arreglados; suite verde.

## FASE 3 — Cadena de importación con fixtures reales (lo más frágil)
**Fixtures disponibles**: `docs/*.PDF` (Cybermax diarios, `LLEGADAS/SALIDAS 13 ABRIL`),
`docs/1 - copia (N).xlsx` (Extras), `pdf-microservice/.../netjets_sample.pdf`.
> ⚠️ Antes de commitear fixtures: confirmar con el dueño que se pueden usar/anonimizar
> (posible PII de tripulación/pax en los PDFs).

- [ ] **`pdfParserV2`** golden tests: parsear PDFs reales → snapshot del output esperado.
      Detecta desplazamiento de columnas (parser por coordenadas X/Y absolutas, muy frágil).
- [ ] **`excelParser`** cruce por matrícula: con/sin guion (`CS-DXX` vs `CSDXX`), prefijos
      ambiguos de 2 chars; el servicio se cruza al avión correcto o no se pierde.
- [ ] **`v2/upsert.ts` idempotencia**: reimportar el mismo PDF no duplica Visits/Movements;
      backfill de `operatorId/aircraftType` sin pisar ediciones manuales.
- [ ] **Pernocta**: avión que llegó ayer y sale hoy → arrival `PARKED` y Visit en el día de
      llegada, no en el sheet importado (`import/route.ts:106`).
- [ ] **`requireWriter()` en imports** (BUG A5): `import`, `import/extras`,
      `import/netjets-pax`, `POST /flights` solo comprueban sesión → un VIEWER puede escribir.
      Test rojo (403 VIEWER) → fix.
- [ ] **Canal de errores del parser** (A6): filas descartadas → warnings propagados a la
      preview, en vez de desaparecer en silencio.
- **Agentes**: `fbo-parsers` + `fbo-test` + `fbo-backend`. **Done**: parsers con golden tests;
  idempotencia y pernocta probadas; imports con guard; suite verde.

## FASE 4 — Microservicio AENA (dinero real; solo cálculo standalone)
**Por qué**: `aena-microservice/src/calc/*` (landing, noise, transit, pax, parking) calcula
tasas reales. Funciones puras → ideales para test. La integración con la app NO entra.

- [ ] Tests de cada módulo de `src/calc` (consistencia: provisional vs final según
      `ata/atd`+pax reales; surcharges; tarifa LEPA Marzo 2026).
- [ ] Tests de `routes/aircraft` y `routes/calculate`: `409 AIRCRAFT_UNKNOWN/UNCONFIRMED`,
      `defaultForType` desde EASA, confirmación.
- [ ] **FLAG exactitud**: marcar TODO — sin factura real de AENA, los tests prueban
      consistencia, no exactitud. Pedir al dueño 2-3 cálculos verificados.
- **Agente**: `general-purpose` (JS plano, fuera de `src/`; su propio `vitest.config.js`).
  **Done**: calc cubierto por consistencia; documentado qué falta validar contra factura real.

## FASE 5 — Deuda de diseño puntual (lo que permite el alcance medio)
- [ ] **PII fuera de `EventLog.action`** (A3): loguear id del pasajero/tripulante, no el
      `fullName` literal (passengers/crew routes). Test que verifique que no se loguea PII.
- [ ] **Auto-transición duplicada** (D2): extraer a un helper compartido único usado por
      ambos PATCH (flights y services).
- [ ] (Opcional según tiempo) Generar la whitelist PATCH desde `routeFieldToMovement`
      (una sola fuente) en vez del `Set` mantenido a mano.
- **Agentes**: `fbo-backend` + `fbo-reviewer`.

## CIERRE
- [ ] `fbo-reviewer` pasada final sobre todo el diff.
- [ ] `fbo-merge`: gate de verificación (tsc + lint + test verdes) → commit convencional → push.

---

## Backlog de bugs REALES a arreglar en bloque (decididos con el dueño)
> Modo descubrimiento: los tests fijan el comportamiento ACTUAL en verde; aquí se listan
> los que hay que CORREGIR después (se voltean los tests a comportamiento correcto + fix).

| Bug | Fichero | Real? | Decisión / fix acordado |
|-----|---------|-------|--------------------------|
| **BUG-2** NJE leg `/1`,`/2` silencia la fila | `excelParser.ts:239` | ✅ 2/14 (DIEFD/1, OEHCY/1,2, DIEFD/2) | `/1`,`/2` = versiones/añadidos del MISMO catering (añadidos, crew), NO llegada/salida. Fix: extraer matrícula base, **conservar cada entrada** (no perderla), sin asumir dirección. |
| **BUG-3** dedup turnaround suprime caterings | `excelParser.ts:292-311` | ✅ (aviones multi-leg existen) | Uno por leg: deduplicar solo a nivel de la MISMA leg, no globalmente por avión. |
| **3 solapamientos** de columna en `findColumn` | `pdfParserV2.ts:63-68` | ⚠️ latente (1-2px) | Endurecer `findColumn` (sin solapes / nearest-match). Golden tests como red. Decisión final pendiente. |
| BUG-1 matrícula con guion en sección principal | `excelParser.ts:101` | 👻 0/14 | **Descartado** (fantasma del fixture). |
| BUG-4 falso positivo doble-prefijo (`ZZ`) | `excelParser.ts:87` | bajo | Opcional, baja prioridad. |
| Time `0900/0930` descarta el 2º horario | `excelParser.ts` | cosmético | Opcional. |

### Persistencia del import (descubierto en Fase 3)
| Bug | Fichero | Sev | Decisión / fix |
|-----|---------|-----|----------------|
| **Reimport pisa ediciones manuales** (state, paxCount, parking) | `upsert.ts:114-118` | ALTA | ⏳ Depende de la política de propiedad de campos (decisión del dueño). |
| `visit.update` incondicional pisa type/fechas | `import/route.ts:107-114` | MED | Igual: respetar ediciones manuales / `isUpdate`. |
| DEPARTURE de pernocta nace en `PARKED` | `import/route.ts:143-146` | MED | Fix claro: ARRIVAL=PARKED, DEPARTURE=EXPECTED. |
| `aircraftType`/`operatorId` solo backfill (ignora cambio real) | `upsert.ts:22-27,75` | BAJA | Revisar con política de campos. |
| `operator.name` siempre sobreescrito | `upsert.ts:54` | BAJA | Coherencia con backfill-only. |
| `isUpdate` falso positivo (mala etiqueta EventLog) | `import/route.ts:105` | BAJA | Corregir cálculo. |
| Sin `@@unique(aircraftId, palmaDay)` en Visit → duplicados | `upsert.ts:71` + schema | MED-RIESGO | Añadir unique + usar `upsert` (liga con Fase 0). |
| Lógica de pernocta embebida en el handler | `import/route.ts` | diseño | Extraer `resolveImportState()` puro y testeable. |
| Parser traga filas no parseables (A6) | `pdfParser*.ts` | MED | Añadir canal de warnings → preview. |

## Tabla de bugs confirmados (de las auditorías)
| # | Bug | Sitio | Fase |
|---|-----|-------|------|
| A1 | Columnas nuevas no se crean en prod (migrate script) | `scripts/migrate-v2-schema.mjs` | 0 |
| A2 | Script V1 muerto activable en Vercel | `scripts/push-turso-schema.ts` | 0 |
| D3 | Doble conteo de pax en turnaround | `daysheets/route.ts`, `metrics/route.ts` | 2 |
| A4 | TZ: `overdue` usa hora local, contenedor en UTC | `src/lib/overdue.ts` | 2 |
| A5 | Imports sin `requireWriter()` (VIEWER escribe) | `import*`, `POST /flights` | 3 |
| A6 | Parser traga errores en silencio | `pdfParser*.ts` | 3 |
| A3 | PII (nombres) en texto plano en EventLog | passengers/crew routes | 5 |
