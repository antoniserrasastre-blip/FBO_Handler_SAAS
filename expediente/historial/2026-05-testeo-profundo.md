# Mayo 2026 — Plan de Testeo Profundo + Deuda de Diseño

Registro histórico del plan de testeo ejecutado en mayo 2026. Las fases marcadas ✅ se completaron. Los pendientes vivos están en `expediente/estado.md`.

## Fases completadas

### FASE 0 — Cimientos de migración ✅
Cerrado drift entre schema y migration script. 13 `ALTER TABLE` idempotentes añadidos a `migrate-v2-schema.mjs` y `src/app/api/db/migrate/route.ts`. `@@unique(aircraftId, palmaDay)` en `Visit`. Script V1 muerto reescrito a V2. Test anti-drift en CI.

### FASE 1 — Recuperar conocimiento perdido ✅
9 tests skipped revividos en 3 ficheros (`flights/[id]/route.test.ts`, `services/[id]/route.test.ts`, `daysheets/route.test.ts`). Cubren whitelists PATCH, guards de rol, asertos de EventBus. 0 skips.

### FASE 2 — Escenarios de dominio ✅
+153 tests de cobertura. Bugs corregidos:
- **Doble conteo de pax** (turnaround llega 4 / sale 4 reportaba 8): ahora dos cifras separadas llegada/salida en backend + UI.
- **TZ bug `overdue.ts`**: contenedor corre en UTC pero el código usaba `getHours()` local → desfase de 2 h en verano. Fix: `madridWallMinutes` + `ENV TZ` en Dockerfile.
- Cobertura nueva: `suggestNextState`, `flightView`, `crypto`.

### FASE 3 — Cadena de importación con fixtures reales ✅
- A5: `requireWriter()` añadido en los 4 endpoints de import/creación (antes un VIEWER podía escribir).
- `pdfParserV2` golden tests con fixture real anonimizado.
- `findColumn` endurecido: rangos sin solape; 3 fragilidades eliminadas.
- `excelParser`:
  - **BUG-2** corregido: NJE legs `/1`,`/2` ya no se pierden (son versiones/añadidos del mismo catering, no llegada/salida).
  - **BUG-3** corregido: dedup ahora por leg, no global por avión.
- `upsert/import`:
  - Política de reimport: "plan del PDF, operativo intocable" — ediciones manuales protegidas.
  - DEPARTURE de pernocta → `EXPECTED` (antes nacía en `PARKED`).
  - `resolveImportState()` extraído como función pura testeable.
  - `wasCreated` para etiqueta correcta en EventLog.
  - `aircraftType` se actualiza correctamente.
- Bonus: test flaky `VisitCard > overdue pip` arreglado (reloj fijo).

## Bugs descartados

- **BUG-1** (matrícula con guion en sección principal, `excelParser.ts:101`): fantasma del fixture, 0/14 casos reales.

## Resultado global

- Suite: 259 → **803 tests**, 40 ficheros, 0 skipped.
- `tsc` y `prisma validate` limpios.

## Pendientes que quedaron vivos

Movidos a `expediente/estado.md`:
- A6 (canal de errores del parser → preview)
- FASE 4 (AENA calc tests)
- FASE 5 (PII fuera de EventLog, dedupe auto-transición)
- Política sistemática de propiedad de campos en reimport
- BUG-4 (falso positivo doble-prefijo `ZZ`)
- Time `0900/0930` descarta 2º horario
