# Estado — FBO Handler SaaS

_Última actualización: 2026-06-11_

> Este fichero se reescribe en cada sesión de trabajo. Refleja el momento presente, no el historial.

## Situación actual

Sistema en producción en `sirvici`, expuesto vía Cloudflare Tunnel en `fbo.randomite.space`. Modelo v2 estable.

**QA + fix run multi-agente (2026-06-11):** un bot QA navegó producción como un humano y una run
de agentes (sondas + causa raíz + verificación adversarial) confirmó **26 bugs**; el informe vive
en La Bestia: `workspace/coding/projects/fbo-handler-saas/qa-run_11-06-2026.md`. El mismo día se
aplicó la fix run: **26/26 fixes en el working tree, SIN COMMITEAR**, sobre baseline `74ddad3`.
Suite **1137 pass / 0 fail / 53 skip**, `tsc` + lint + `npm run build` limpios. 28 ficheros
modificados + 13 nuevos (`src/lib/autoTransition.ts`, `noShowSweep.ts`, `movementCounts.ts`,
tests de regresión y 4 sondas `*.probe.test.ts`, todas en verde).

**Live tracking caído:** el worker OpenSky arranca en cada boot pero corre en modo anónimo
(~400 créditos/día, agotados en la primera hora; OpenSky retiró el basic auth). Confirmable en
`/api/live/status` (logueado). Plan decidido: migrar `fetchStates()` a **adsb.lol** (gratis,
formato ADSBx) + polling adaptativo + estado `FINAL` (alerta de corta final) + push ntfy —
**después** de desplegar la fix run (la tubería ATA/ATD que el live tracking alimenta era parte
de los bugs). Medio plazo: receptor ADS-B propio en el FBO.

## Decisiones de alcance (MVP)

- **GenDec aparcado (2026-06-02)** — sin cambios, código intacto y dormido.
- **NO_SHOW (2026-06-11)** — nuevo estado terminal. Sweep al cierre del import: ARRIVAL EXPECTED
  con scheduledDate < hoy-1 y sin evidencia de llegada (ata / livePhase) → NO_SHOW, con EventLog
  + SSE por transición. Limpiará los **484 no-shows históricos** en el primer import tras el deploy.

## Pendientes activos

- [ ] **REVISAR Y DESPLEGAR LA FIX RUN** ← el siguiente paso. Revisar `git diff`, trocear en
  commits lógicos si se quiere, push → deploy por runner. Detalle fix a fix en el informe de QA.
- [ ] **Migración live tracking a adsb.lol** (tras el deploy) — ver plan arriba.

### Del plan de testeo profundo (FASE 3-5)
- [ ] **A6** — canal de errores del parser: **parcial (2026-06-11)** — horas ilegibles ahora se
  descartan con `ParseWarning` (`normalizeTime` en `pdfParserV2.ts`); falta propagar el resto de
  filas descartadas a la preview.
- [ ] **FASE 4 — AENA calc** — sin cambios (tests de consistencia + flag de exactitud).
- **D2 — HECHO (2026-06-11).** `src/lib/autoTransition.ts` unifica la auto-transición de
  `flights/[id]` y `services/[id]`; eventos SSE idénticos en ambos caminos; el EventLog escribe
  el **código** de estado (los regex de `deriveATA/ATD` aceptan códigos y labels históricos).
- [ ] Test de paridad PATCH whitelist ↔ `routeFieldToMovement` — sigue pendiente (opcional).

### Persistencia del import
- **Gate de evidencia en reimport — HECHO (2026-06-11):** un visit pernocta del PDF no avanza a
  PARKED sin ata/livePhase; sin evidencia queda para el sweep NO_SHOW.
- [ ] Revisar el `Set` `MOVEMENT_OPERATIONAL_FIELDS` completo y decidir política sistemática.

### Equipaje de bodega — impresión
- [ ] Mini-agente ZPL local — sin cambios (bloqueado por IPs/IT).

### Otros bugs menores
- [ ] BUG-4 — doble-prefijo `ZZ` en `excelParser.ts`, sigue.
- [ ] Time `0900/0930` en `excelParser.ts` descarta el 2º horario — sigue (lo del 11-06 fue
  pdfParser + calcMinutes, no excelParser).
- Warning lint `isOvernight` — **HECHO** (renombrado `_isOvernight` por el integrador).

### Decisiones de producto pendientes (del informe QA)
- [ ] Cómo etiquetar rotaciones dobles del mismo avión el mismo día (caso EC-OGB, B2).
- [ ] Qué señal de urgencia quiere rampa en el FlightChip de `/` (B4 se arregló en alertas y
  orden; el chip sigue sin color de urgencia por decisión pendiente).
- [ ] Unificar `isArrivalToday/isDepartureToday` de `diaHelpers` con `movementCounts` (quedaron
  dos implementaciones compatibles pero separadas para no cruzar propiedad de ficheros).

## Alertas

- ⚠️ **Working tree con la fix run SIN commitear** (28 modificados + 13 nuevos). No pushear a
  ciegas: push = deploy. La suite está verde (1137/0), pero revisar el diff antes. Recordatorio
  del gotcha: si `verify` fallara, `/srv` se congela en el commit viejo.

## Cómo actualizar este fichero

Al inicio de cada sesión: revisar si hay cambios de estado desde la última vez.
Al cierre: actualizar pendientes (tachar lo hecho, añadir lo nuevo), añadir lo que se decidió o rompió.
