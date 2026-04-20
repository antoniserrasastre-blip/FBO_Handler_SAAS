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
- [ ] `src/lib/manualContent.ts` with 23 transcribed sections
- [ ] `src/app/ayuda/page.tsx` (collapsible + search + highlighted "Apertura")
- [ ] `Ayuda` button in `DaySummary.tsx` header
- [ ] SOP Equipaje Controlado section
- [ ] Aparcamiento PMI section
- [ ] Manual callouts (danger/warning) for critical rules

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

## Infrastructure

- [ ] WebSocket upgrade (SSE in-memory doesn't scale across Vercel instances)
- [ ] External API integrations (FlightRadar, ESIA)
- [ ] Dymo Connect SDK (direct print, no dialog)
- [ ] QR scan on ramp (PWA camera API)
