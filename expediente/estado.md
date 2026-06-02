# Estado — FBO Handler SaaS

_Última actualización: 2026-06-02_

> Este fichero se reescribe en cada sesión de trabajo. Refleja el momento presente, no el historial.

## Situación actual

Sistema en producción en `sirvici` (servidor propio), expuesto vía Cloudflare Tunnel en `fbo.randomite.space`. Modelo v2 estable (Operator→Aircraft→Visit→Movement). La migración v1→v2 está completada.

Suite de tests: 1004 tests en verde, 53 skipped, 68 ficheros (`vitest run`, 2026-06-02). `tsc --noEmit` y `prisma validate` limpios.

## Pendientes activos

### Del plan de testeo profundo (FASE 3-5)
- [ ] **A6** — Canal de errores del parser: filas descartadas en `pdfParser*.ts` deben propagarse como warnings a la preview en vez de desaparecer en silencio.
- [ ] **FASE 4 — AENA calc** — Tests de consistencia de `aena-microservice/src/calc/*` (landing, noise, transit, pax, parking). Pendiente además de **flag de exactitud**: pedir al dueño 2-3 cálculos verificados contra factura real.
- [ ] **FASE 5 — Deuda de diseño**:
  - PII fuera de `EventLog.action` (A3): loguear id, no `fullName` literal (passengers/crew routes).
  - Auto-transición duplicada (D2): extraer a helper único compartido por PATCH flights y services.
  - (Opcional) Generar whitelist PATCH desde `routeFieldToMovement` en vez de mantener `Set` a mano.

### Persistencia del import (pendiente de decisión)
- [ ] Política de propiedad de campos cuando se reimporta el mismo PDF. **Ya protegido:** `upsertMovement()` en `src/lib/v2/upsert.ts` separa campos "plan" (callsign, scheduledDate, origin, destination, eta, etd, crewCount → se actualizan en cada reimport) de los operativos del `Set` `MOVEMENT_OPERATIONAL_FIELDS` (state, paxCount, parking, paxState, fuel/toilet/transport… → create-only, nunca se pisan). **Lo que falta:** revisar el `Set` por si falta algún campo editable en UI, y decidir la política sistemática (¿generar el `Set` desde el esquema en vez de mantenerlo a mano?).

### Otros bugs menores
- [ ] BUG-4 — falso positivo doble-prefijo `ZZ` en `looksLikeRegistration()` / `insertDash()` (`src/lib/excelParser.ts`), baja prioridad.
- [ ] Time `0900/0930` en `excelParser.ts` descarta el 2º horario (cosmético).

## Alertas

_(Ninguna activa)_

## Cómo actualizar este fichero

Al inicio de cada sesión: revisar si hay cambios de estado desde la última vez.
Al cierre: actualizar pendientes (tachar lo hecho, añadir lo nuevo), añadir lo que se decidió o rompió.
