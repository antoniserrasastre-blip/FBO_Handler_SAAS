# Spec — Control de Equipaje + Etiquetas Dymo

## Objetivo

Sustituir la `Hoja de Control de Equipaje en Bodega` en papel por un flujo
digital dentro de la app que:

1. Implemente las 4 fases del SOP (Filtro parcial/final → Pista parcial/final)
   con detección de discrepancias y auditoría.
2. Imprima etiquetas personalizadas (Dymo LabelWriter 450/550, rollos 89×36mm
   y 89×28mm) para bodega/cabina/llegada, con matrícula y contador N/total.

Fuentes de verdad en `docs/`:

- `PROCEDIMIENTO OPERATIVO PASO A PASO SOP_EQUIPAJE CONTROLADO ESP.pdf`
- `Hoja_Control_Equipaje_Bodega_Mallorcair ESP.pdf` / `Hold_Baggage_Control_Sheet_Mallorcair ENG.pdf`
- `MANUAL FILTRO 2026.pdf` (sección "EQUIPAJE", p.6)

## Estrategia TDD

### Infra de tests

Añadir Vitest (no hay framework aún). Una sola config, 3 perfiles lógicos:

| Perfil | Qué prueba | Ubicación |
|--------|------------|-----------|
| **Unit** | Funciones puras: reglas SOP, cálculo de etiquetas, generación de payload Dymo | `src/lib/baggage/*.test.ts` |
| **Integration** | API routes con Prisma en modo SQLite in-memory | `src/app/api/flights/[id]/baggage/*.test.ts` |
| **Component** | Render de formularios y hojas de etiqueta (React Testing Library, sin navegador) | `src/components/baggage/*.test.tsx` |

```bash
npm i -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

Añadir a `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
}
```

### Orden de implementación (red → green → refactor)

Por iteración, **siempre** escribir el test primero, verlo fallar, implementar
lo mínimo, refactorizar. Una entrega por iteración, cada una deja el código
verde y desplegable.

| # | Iteración | Test primero | Implementación mínima |
|---|-----------|--------------|----------------------|
| 1 | Modelo dominio | `countSummary.test.ts`: dado un recuento parcial/final por fase, devuelve estado (`OK` / `DISCREPANCY` / `INCOMPLETE`) | Función pura `summarizeCounts()` en `src/lib/baggage/summary.ts` |
| 2 | Reglas SOP | `canTransition.test.ts`: sin pista final no se puede cargar; con discrepancia se bloquea salida | `canAdvancePhase(state, action) → { ok, reason? }` |
| 3 | Etiquetas: payload | `labelPayload.test.ts`: para un vuelo con 5 maletas genera 5 payloads `1/5 … 5/5`, más 1 etiqueta por carro en bodega abierta | `buildLabels(flight, kind, count)` devuelve `LabelPayload[]` |
| 4 | Etiquetas: render | `LabelSheet.test.tsx`: renderiza grid de etiquetas con `@page` correcto para cada tamaño | Componente `<LabelSheet size="89x36" items={...} />` |
| 5 | Schema + migración | `schema.test.ts`: un `BaggageControl` se crea vacío para un vuelo de salida con pax > 0 | Modelo Prisma + migración + seed helper |
| 6 | API `POST /baggage/count` | test de integración: actualizar filtroParcial dispara evento y recalcula estado | Route handler + EventLog |
| 7 | API `POST /baggage/sign` | test: 3 firmas requeridas (filtro, pista, comandante); flujo incompleto no permite cerrar | Route handler |
| 8 | UI formulario | `BaggageControlPanel.test.tsx`: incrementos/decrementos, validación visible, firma con nombre | Componente |
| 9 | UI impresión | test de snapshot del markup de etiquetas | `<LabelPrintButton />` que abre `window.print()` con hoja dedicada |
| 10 | Integración Flight | UI del `FlightCard` expone botón "Control equipaje" solo si `paxDepBagsChecked > 0` | Integración |

Cada iteración corresponde a un commit con mensaje `test: …` seguido de
`feat: …` (o uno solo `feat(baggage): phase N — X` con tests incluidos si
es trivial).

## Modelo de dominio

### Nuevas tablas (Prisma)

```prisma
model BaggageControl {
  id             String   @id @default(cuid())
  flightId       String   @unique
  flight         Flight   @relation(fields: [flightId], references: [id], onDelete: Cascade)

  totalBags      Int?                        // declarado por tripulación/pax
  filterPartial  Int?                        // FASE 1 paso 1 (recepción)
  filterFinal    Int?                        // FASE 1 paso 2 (antes de rayos X)
  rampPartial    Int?                        // FASE 2 paso 1 (recepción desde filtro)
  rampFinal      Int?                        // FASE 2 paso 2 (pie de avión)

  filterSignedBy String?
  filterSignedAt DateTime?
  rampSignedBy   String?
  rampSignedAt   DateTime?
  captainSigned  Boolean  @default(false)
  captainName    String?
  captainSignedAt DateTime?

  status         String   @default("OPEN")    // OPEN | READY_TO_LOAD | LOADED | BLOCKED | CLOSED
  blockReason    String?                      // p.ej. "Filtro final 8 != Pista final 7"

  sheetScanUrl   String?                      // opcional: URL del escaneo en Cyber
  cartPhotoUrl   String?                      // opcional: foto del carro cargado

  lastMinuteChanges Json?                     // [{ from: "HOLD", to: "CABIN", count: 1, noteToCaptain }]

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model BaggageLabelPrint {
  id           String   @id @default(cuid())
  flightId     String
  flight       Flight   @relation(fields: [flightId], references: [id], onDelete: Cascade)
  kind         String   // HOLD_CLOSED | HOLD_OPEN_CART | CABIN | ARRIVAL
  count        Int      // cuántas se emitieron
  printedAt    DateTime @default(now())
  printedBy    String?
  @@index([flightId])
}
```

El `Flight` existente **no se modifica**; la relación se añade como campo
`baggageControl BaggageControl?`. `paxDepBagsChecked` sigue siendo la
estimación inicial; `totalBags` en `BaggageControl` es la cifra operativa.

### Máquina de estados

```
OPEN ──(filtro parcial+final OK)──▶ OPEN
OPEN ──(pista parcial+final OK, 3 firmas)──▶ READY_TO_LOAD
OPEN ──(discrepancia en cualquier fase)──▶ BLOCKED
BLOCKED ──(reconteo OK)──▶ OPEN
READY_TO_LOAD ──(confirmar carga)──▶ LOADED
LOADED ──(flight DISPATCHED)──▶ CLOSED
```

Transiciones forzadas por ADMIN registran motivo en EventLog.

### Reglas (probadas en unit tests)

1. No se puede marcar `rampFinal` sin `rampPartial`.
2. `filterFinal != rampFinal` ⇒ `BLOCKED` con `blockReason`.
3. `READY_TO_LOAD` requiere las 3 firmas y ambas fases cerradas.
4. Cambio última hora (HOLD→CABIN) resta del `totalBags`, genera nota al
   comandante, nunca baja `rampFinal` por debajo de `rampPartial` sin
   justificación.
5. Si `Flight.state` pasa a `DISPATCHED` con `BaggageControl` != `LOADED`
   ni `CLOSED` ⇒ warning no bloqueante (hay vuelos sin pax).

## Etiquetas Dymo

### Tipos

| kind | Contenido | Tamaño | Cuándo |
|------|-----------|--------|--------|
| `HOLD_CLOSED` | `MATRÍCULA · HOLD BODEGA · N/TOTAL · Nº VUELO` | 89×36mm | Bodega estándar, 1 por bulto |
| `HOLD_OPEN_CART` | `MATRÍCULA · SALIDA · (no etiquetar bultos)` | 89×36mm | Bodega abierta (PC12/BE20/B350/TBM), 1 por carro |
| `CABIN` | `MATRÍCULA · CABINA / CABIN` | 89×28mm | Blanca, va con el pax |
| `ARRIVAL` | `MATRÍCULA · LLEGADA · FECHA · HORA` | 89×28mm | Carro de llegada que espera transporte |

### Impresión

**v1 — print del navegador (sin SDK):**

- Hoja dedicada con `@page { size: 89mm 36mm; margin: 0 }`.
- `window.print()` desde `<LabelPrintButton />`.
- El usuario selecciona la Dymo en el diálogo del SO una vez; el navegador
  recuerda la preferencia.
- Tipografía grande, alto contraste, sin bordes.
- Opción de incluir QR (`qrcode` npm, ~15KB) que codifica
  `{flightId}:{kind}:{seq}/{total}` — para escaneo futuro en pista final.

**v2 — out of scope**: integración Dymo Connect SDK (`https://localhost:41951/`)
para impresión directa sin diálogo.

### Archivos a crear

```
src/
├── lib/
│   └── baggage/
│       ├── summary.ts             # summarizeCounts()
│       ├── summary.test.ts
│       ├── transitions.ts         # canAdvancePhase(), applyAction()
│       ├── transitions.test.ts
│       ├── labels.ts              # buildLabels(flight, kind, count)
│       └── labels.test.ts
├── components/
│   └── baggage/
│       ├── BaggageControlPanel.tsx         # formulario de conteo + firmas
│       ├── BaggageControlPanel.test.tsx
│       ├── LabelSheet.tsx                  # grid imprimible
│       ├── LabelSheet.test.tsx
│       └── LabelPrintButton.tsx
├── app/
│   ├── api/
│   │   └── flights/[id]/baggage/
│   │       ├── route.ts                    # GET / PATCH count+status
│   │       ├── route.test.ts
│   │       ├── sign/route.ts               # POST firma
│   │       ├── sign/route.test.ts
│   │       ├── labels/route.ts             # POST registra impresión
│   │       └── labels/route.test.ts
│   └── flights/[id]/equipaje/page.tsx     # ruta dedicada o modal desde FlightCard
└── types/baggage.ts                        # enums/consts (PHASES, STATUS, LABEL_KINDS)

prisma/
├── schema.prisma                           # + BaggageControl, BaggageLabelPrint
└── migrations/NNNN_baggage_control/...
```

Mods:

- `src/components/FlightCard.tsx` → botón "Control equipaje" si el vuelo tiene
  pax salida > 0.
- `vitest.config.ts` (nuevo) + `src/test/setup.ts`.

## Criterios de aceptación

- [ ] `npm test` pasa con al menos 25 tests (≥10 unit, ≥8 integration, ≥5 component).
- [ ] Cobertura mínima en `src/lib/baggage/` del 90%.
- [ ] Se puede registrar filtro parcial/final, pista parcial/final y las 3 firmas
      desde la UI; los cambios se propagan por SSE a otros clientes.
- [ ] Una discrepancia marca el estado como `BLOCKED` visualmente (rojo) y
      bloquea el botón "Listo para cargar".
- [ ] Al pulsar "Imprimir etiquetas" con N=5 bultos HOLD_CLOSED se abre el
      diálogo de impresión con 5 etiquetas 1/5…5/5 en tamaño Dymo.
- [ ] Cambio última hora HOLD→CABIN resta del total y registra nota + EventLog.
- [ ] El flujo funciona sin Dymo Connect instalado; basta con que la Dymo sea
      una impresora del sistema.
- [ ] `Flight.state = DISPATCHED` con equipaje incompleto genera warning en UI
      pero no bloquea (hay vuelos sin pax).

## Fuera de alcance (v1)

- Escaneo de QR en pista final con cámara (app móvil / PWA camera API).
- Dymo Connect SDK y mapeo directo a impresora concreta.
- Subida real de escaneo/foto a Cyber (solo se guarda URL a mano).
- Hoja imprimible PDF A4 como respaldo (si la Dymo falla).
- Multi-idioma de etiquetas (v1 solo ES/EN fijo por tipo).

## Convenciones

- TDD estricto: ningún `feat` sin su `test:` previo o en el mismo commit.
- Funciones puras separadas de React — testable sin DOM.
- Componentes cliente solo cuando hacen falta hooks o eventos del navegador.
- Icons Lucide, UI Tailwind, textos en español, código inglés.
- Prisma: no breaking changes sobre tablas existentes — solo nueva tabla +
  relación 1-a-1 opcional.
