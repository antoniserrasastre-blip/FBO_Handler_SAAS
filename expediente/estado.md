# Estado — FBO Handler SaaS

_Última actualización: 2026-06-02_

> Este fichero se reescribe en cada sesión de trabajo. Refleja el momento presente, no el historial.

## Situación actual

Sistema en producción en `sirvici` (servidor propio), expuesto vía Cloudflare Tunnel en `fbo.randomite.space`. Modelo v2 estable (Operator→Aircraft→Visit→Movement). La migración v1→v2 está completada.

**Equipaje de bodega** (nuevo, 2026-06-02) en producción: hojas de control imprimibles (`/api/export/baggage-sheets`, A4 4-up) + etiquetas por bulto para impresoras Brother TD-46/4750 (`/api/export/baggage-labels`, 62×29 mm). Ver `historial/2026-06.md` sesión 5 y memoria global `project_fbo_baggage`.

Suite de tests: 1008 tests en verde, 53 skipped, 68 ficheros (`vitest run`, 2026-06-02). `tsc --noEmit` y lint limpios.

## Decisiones de alcance (MVP)

- **GenDec aparcado (2026-06-02)** — no se usa actualmente. No invertir más en el flujo de importación GenDec hasta nueva orden. Código intacto y dormido: parser `src/lib/gendecParser.ts`, ruta `POST /api/flights/[id]/gendec/extract`, UI `GenDecPasteSection` (en `PassengerCrewModal` y dos secciones en `/dia`), enum `GENDEC_PASTE`. La exportación de declaración en blanco (`/api/export/blank-declaration`) es independiente y no se toca. Prioridad: simplificar el MVP.

## Pendientes activos

### Del plan de testeo profundo (FASE 3-5)
- [ ] **A6** — Canal de errores del parser: filas descartadas en `pdfParser*.ts` deben propagarse como warnings a la preview en vez de desaparecer en silencio.
- [ ] **FASE 4 — AENA calc** — Tests de consistencia de `aena-microservice/src/calc/*` (landing, noise, transit, pax, parking). Pendiente además de **flag de exactitud**: pedir al dueño 2-3 cálculos verificados contra factura real.
- [ ] **FASE 5 — Deuda de diseño** (analizada 2026-06-02, ver detalle):
  - **A3 (PII en `EventLog.action`) — ~70% hecho.** En `passengers/[id]/route.ts` el `fullName`/`passportNumber`/`dateOfBirth` ya se loguean como "cambió/actualizado" sin valor. **Falta:** `gender` y `nationality` aún escriben el valor literal en `action` → cambiar a "gender/nationality actualizada" (fix de minutos, categoría sensible RGPD).
  - **D2 (auto-transición duplicada) — prioritario.** Misma lógica copiada en `flights/[id]/route.ts` y `services/[id]/route.ts`, y **ya divergió**: services loguea el EventLog con `movementId` y emite un `flight_updated` extra; flights no. Extraer a helper `applyAutoTransition(visitId, session)` no es solo DRY, corrige la inconsistencia de eventos SSE.
  - (Opcional) Generar whitelist PATCH desde `routeFieldToMovement`. **Decisión:** NO en runtime (el `Set` es frontera de seguridad auditable); mejor un **test de paridad** que falle si hay claves en `routeFieldToMovement` ausentes del `Set` (excluyendo casos especiales como `assignedToId`).

### Persistencia del import (pendiente de decisión)
- [ ] Política de propiedad de campos cuando se reimporta el mismo PDF. **Ya protegido:** `upsertMovement()` en `src/lib/v2/upsert.ts` separa campos "plan" (callsign, scheduledDate, origin, destination, eta, etd, crewCount → se actualizan en cada reimport) de los operativos del `Set` `MOVEMENT_OPERATIONAL_FIELDS` (state, paxCount, parking, paxState, fuel/toilet/transport… → create-only, nunca se pisan). **Lo que falta:** revisar el `Set` por si falta algún campo editable en UI, y decidir la política sistemática (¿generar el `Set` desde el esquema en vez de mantenerlo a mano?).

### Equipaje de bodega — impresión
- [ ] **Mini-agente ZPL local** para impresión de etiquetas de un clic, sin diálogo. Bloqueado por infra: el server está fuera de la LAN de las impresoras, no alcanza su IP. Requiere un PC de oficina siempre encendido + las IPs de las Brother (pedir a IT). Estado actual: PDF 62×29 + driver Brother (funciona ya). Las TD-46/4750 hablan ZPL II; el generador ZPL aún no está escrito (se decidió esperar a tener IPs).
- [ ] Pendiente confirmar con el dueño si quiere generar también el generador ZPL ya (dejándolo listo) o esperar.

### Otros bugs menores
- [ ] BUG-4 — falso positivo doble-prefijo `ZZ` en `looksLikeRegistration()` / `insertDash()` (`src/lib/excelParser.ts`), baja prioridad.
- [ ] Time `0900/0930` en `excelParser.ts` descarta el 2º horario (cosmético).
- [ ] Warning lint: `isOvernight` asignado y nunca usado en `src/app/api/import/route.ts` (no bloquea, anótalo al tocar ese fichero — prefijar `_` o eliminar).

## Alertas

_(Ninguna activa)_

## Cómo actualizar este fichero

Al inicio de cada sesión: revisar si hay cambios de estado desde la última vez.
Al cierre: actualizar pendientes (tachar lo hecho, añadir lo nuevo), añadir lo que se decidió o rompió.
