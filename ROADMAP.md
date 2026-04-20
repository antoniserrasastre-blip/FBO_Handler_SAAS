# Roadmap — FBO Handler SAAS

## v0.2 — Core operations panel (DONE)

- [x] Flight CRUD with state machine (EXPECTED → ON_GROUND → BOARDING → DISPATCHED)
- [x] PDF import (Cybermax "Orden del dia") with overnight flight handling
- [x] Excel import (Hoja de Extras) with NJE reference parsing
- [x] Service tracking (PENDING → ARRIVED → DELIVERED)
- [x] Real-time SSE sync across clients
- [x] Role-based auth (ADMIN / HANDLER / VIEWER)
- [x] CSV export
- [x] History browser + metrics
- [x] PWA manifest
- [x] Parking stands registry from official AIP + conflict detection

## Help section — Manual de Filtro

- [x] Spec (`specs/filter-help-section.md`)
- [x] `src/lib/manualContent.ts` with 26 transcribed sections
- [x] `src/app/ayuda/page.tsx` (collapsible + search + highlighted "Apertura")
- [x] `Ayuda` button in `DaySummary.tsx` header
- [x] SOP Equipaje Controlado section
- [x] Aparcamiento PMI section
- [x] Manual callouts (danger/warning) for critical rules

## Baggage control + Dymo labels

- [x] Spec (`specs/baggage-control.md`)
- [ ] Vitest infra (unit + integration + component)
- [ ] `src/lib/baggage/summary.ts` + tests
- [ ] `src/lib/baggage/transitions.ts` + tests (SOP state machine)
- [ ] `src/lib/baggage/labels.ts` + tests (label payload builder)
- [ ] `<LabelSheet />` component + tests (Dymo 89×36 / 89×28)
- [ ] Prisma models `BaggageControl` + `BaggageLabelPrint` + migration
- [ ] API routes `/api/flights/[id]/baggage` (count + sign + labels) + tests
- [ ] `<BaggageControlPanel />` UI + tests
- [ ] `<LabelPrintButton />` with browser print + `@page` CSS
- [ ] Integration in `FlightCard` (botón "Control equipaje")

## Compact daily view ("Orden del dia" digital)

Inspiracion: export Excel-a-PDF que CyberMAX genera hoy. Tabla densa de un vistazo, una fila por vuelo con toda la info operativa. Pagina aparte (NO el dashboard principal).

- [ ] Ruta `/dia` con tabla densa: callsign, matricula, ruta, horas llegada/salida, parking, crew/pax, servicios resumidos, estado, notas
- [ ] Fila compacta optimizada para densidad (no tarjetas)
- [ ] Color de fondo por estado (alterno + acento segun state)
- [ ] Filtros: estado, compania, terminal, pendientes
- [ ] Ordenacion por columna
- [ ] CSS `@page landscape` para impresion A4/A3 directa
- [ ] Exportar a PDF (reusar `pdfkit`) y a Excel (`xlsx`)

## Gantt / Timeline view

Vista secundaria inspirada en CyberMAX. Barras horizontales por vuelo (llegada -> salida) con linea vertical "ahora". Pagina aparte.

- [ ] Ruta `/timeline` (NO dashboard principal)
- [ ] Barra por vuelo, ancho proporcional a permanencia en tierra
- [ ] Linea vertical roja sincronizada con hora actual
- [ ] Trama/fondo distinto por estado (EXPECTED rayado, ON_GROUND solido, DISPATCHED atenuado)
- [ ] Click en barra -> abrir ficha del vuelo
- [ ] Toggle agrupar por parking / compania
- [ ] Zoom horario (hora / 30min / 15min)

## Pago antes de salida ("* callsign")

Los callsigns con `*` marcan vuelos sin contrato que deben pagar antes de despacho. Hoy es solo convencion en el texto; convertirlo en workflow trackeable.

- [ ] Verificar que `pdfParser.ts` preserva el `*` en el callsign
- [ ] Campo `Flight.paymentRequired` derivado del `*` (migracion auto desde callsigns existentes)
- [ ] Campo `Flight.paymentState` (`N_A` | `PENDING` | `PAID`)
- [ ] Badge visual naranja en `FlightCard` si `paymentRequired && !PAID`
- [ ] Badge en fila de vista compacta
- [ ] Accion "Marcar pagado" con EventLog + timestamp + usuario
- [ ] Warning (no bloqueante) al transicionar a `DISPATCHED` sin pago
- [ ] Filtro "Pendientes de pago" en dashboard y vista compacta

## Import de Extras — idempotencia

Hoy re-subir el mismo Excel duplica los servicios. Prevenir con clave natural y resumen explicito post-import.

- [ ] Definir clave natural del servicio: `flightId + type + reference + target + customName`
- [ ] `POST /api/import/extras` comprueba existencia antes de insertar
- [ ] Estrategia: insertar si no existe, skip si identico, actualizar si mismo key pero distinto state/origin
- [ ] Response del import: `{ inserted, skipped, updated }` con lista detallada
- [ ] UI del import muestra el resumen en pantalla antes de confirmar guardar
- [ ] Hash SHA256 del fichero -> warning "ya importado el X por Y" si se repite
- [ ] Tests: subir mismo Excel 2 veces -> no duplica; subir Excel modificado -> actualiza sin duplicar
- [ ] Aplicar misma logica al import de PDF (orden del dia)

## Infrastructure

- [ ] WebSocket upgrade (SSE in-memory doesn't scale across Vercel instances)
- [ ] External API integrations (FlightRadar, ESIA)
- [ ] Dymo Connect SDK (direct print, no dialog)
- [ ] QR scan on ramp (PWA camera API)
