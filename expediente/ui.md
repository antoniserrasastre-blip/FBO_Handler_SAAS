# UI — Páginas y Componentes — FBO Handler SaaS

Next.js 15 (App Router) + React 19. Texto visible en español, código en inglés.
Esta hoja cubre solo la capa de UI (páginas, componentes de dominio, chrome y
hooks). El código es la fuente de verdad.

## Páginas (App Router)

Todas en `src/app/**/page.tsx`. La navegación principal vive en el chrome
(`helix/AppShell`); las etiquetas de las pestañas no siempre coinciden con la
ruta (ver columna "Tab").

| Ruta | Fichero | Tab | Propósito |
|---|---|---|---|
| `/` | `app/page.tsx` | Lista | Dashboard operativo del día. Lista vuelos como `VisitCard`; cabecera con `DaySummary`, `SearchBar`, `FilterToggleStrip`, `HomeActionBar`, `ShiftBar`. Alterna a densidad compacta vía `CompactFlightGrid`. SSE en vivo. |
| `/dia` | `app/dia/page.tsx` | Tablón | Vista tablón/rejilla por filas con pips de servicio por columna; abre `FlightDetailPanel` (edición pesada) al seleccionar. Pensada para coordinador. SSE. |
| `/timeline` | `app/timeline/page.tsx` | Timeline | Línea temporal por stands (barras llegada/salida, zoom por turno, marca "ahora"). Abre `FlightDetailPanel`. SSE. |
| `/metrics` | `app/metrics/page.tsx` | Métricas | Analítica (pax, servicios, puntualidad, turnaround, operadores, etc.) con charts de `components/metrics/charts` y rango temporal. |
| `/historico` | `app/historico/page.tsx` | Histórico | Lista de day-sheets cerradas (`/api/daysheets`); consulta de días pasados y creación de día manual. |
| `/import` | `app/import/page.tsx` | — | Importar: pestaña PDF (orden del día) y pestaña Extras (Excel). No está en la barra de pestañas; se llega desde `HomeActionBar`. |
| `/flights/new` | `app/flights/new/page.tsx` | — | Alta manual de un vuelo (formulario simple). |
| `/admin` | `app/admin/page.tsx` | — | Gestión de usuarios (alta/edición/rol). Solo ADMIN/SUPERVISOR; chromeless. |
| `/login` | `app/login/page.tsx` | — | Auth NextAuth (Credentials). Chromeless. Redirige a `/dia`. |
| `/prototype/compact-grid` | `app/prototype/compact-grid/page.tsx` | — | ⚠️ PROTOTIPO DESECHABLE, no producción. Explora una rejilla ultra-compacta de chips; tres variantes `?variant=A\|B\|C`. Borrar cuando se decida. |

## Chrome de navegación (`src/components/helix`)

- `AppShell.tsx` — Envoltorio de toda la app (montado en `app/layout.tsx`). Define las pestañas, fecha activa (`useDate`), usuario/logout. Oculta el chrome en `/login` y `/admin`.
- `AppHeader.tsx` — Cabecera desktop: pestañas, navegador de fecha (prev/next/hoy), menú de usuario y acceso a admin.
- `BottomTabBar.tsx` — Barra de pestañas inferior en móvil (un target por pestaña).
- `AppFooter.tsx` — Pie del shell.
- `Logo.tsx` — Logo Helix.

## Componentes de dominio

### Tarjetas de vuelo
- `VisitCard.tsx` — Tarjeta central de producción (shape v2: Visit + dos Movements ARRIVAL/DEPARTURE). Usada en `/` y en el prototipo. Compone `MovementRow`, badges helix, `ServiceChipRow`, `StateStepper`, `OpsToggleStrip`, `ChecklistPanel`, `AddServicePicker`, `TurnaroundCountdown`. Delega la edición pesada en `FlightDetailPanel` vía `onOpenDetail`.
- `CompactFlightGrid.tsx` — Densidad compacta de la Lista: reparte movimientos en zonas 🛬 Llegadas / 🛫 Salidas (clasificación por movimiento, no por estado). Cada tarjeta abre la `VisitCard`.
- `FlightDetailPanel.tsx` (`app/dia/`) — Panel lateral de detalle/edición completa de un vuelo. Reutilizado por `/dia` y `/timeline`. Aloja inline-edits, servicios, lost items, pax/crew y la sección GenDec (en pausa).
- `FlightCard.tsx` — Tarjeta legacy v1. **Huérfana: ya no se importa en ningún sitio** (candidata a borrado).

### Servicios y operativa (subcomponentes de VisitCard)
- `ServiceChipRow.tsx` — Fila de chips de servicio con su estado.
- `ServiceCheckbox.tsx` — UI de estado de servicio (PENDING→ARRIVED→DELIVERED). Solo lo consume el legacy `FlightCard` (huérfano de facto).
- `AddServicePicker.tsx` — Selector para añadir servicios a un vuelo.
- `ChecklistPanel.tsx` — Tareas por movimiento según el puesto activo.
- `OpsToggleStrip.tsx` — Tira de toggles operativos.
- `StateStepper.tsx` — Avance del estado del vuelo paso a paso.
- `PendingServicesPanel.tsx` — Panel de servicios pendientes (en `/` y `/dia`).
- `TurnaroundAlert.tsx` / `TurnaroundCountdown.tsx` — Alerta y cuenta atrás de turnarounds ajustados.

### Personas (PII)
- `PassengerCrewModal.tsx` — Modal que carga y muestra pax/crew (datos sensibles) bajo petición. Componente más reutilizado (`/`, `/dia`, `/timeline`, prototipo). Incluye la sección GenDec (en pausa).
- `CrewInventory.tsx` — Almacén de tripulación (STORED→RETURNED). **Huérfano: no se importa en ningún sitio.**

### Turno y resumen
- `ShiftBar.tsx` — Barra del turno activo (puesto, horas). Solo en `/`.
- `ShiftHandover.tsx` — Entrega de turno con notas. Solo en `/`.
- `ShiftQueueToggle.tsx` — Toggle de cola/vista por turno. Solo en `/`.
- `DaySummary.tsx` — Resumen/contadores del día. Solo en `/`.
- `HomeActionBar.tsx` — Acciones globales (importar, etc.). Solo en `/`.
- `QuickAddFlight.tsx` — Alta rápida de vuelo (modal) en `/` y `/dia`.

### Búsqueda y filtros
- `SearchBar.tsx` — Búsqueda en vivo (matrícula, callsign, operador).
- `FilterToggleStrip.tsx` — Filtros: pendientes, ventana de horas, cancelados, míos.
- `ShortcutsHelp.tsx` — Overlay de atajos de teclado.

### Edición inline y primitivos
- `InlineTextEdit.tsx`, `InlineNumber.tsx`, `InlineSelect.tsx`, `QuickTimeEdit.tsx` — Edición in situ de campos.
- `Modal.tsx` — Modal genérico. `Toast.tsx` — Notificaciones. `Icons.tsx` — Iconos locales.
- `LastModifiedBadge.tsx`; `LiveStatusBadge.tsx` (este último huérfano).
- Familia `helix/*`: badges y pills de dominio (`OperatorBadge`, `AircraftBadge`, `CategoryPill`, `RqstChip`, `PetCount`, `PassportField`, `Pill`/`StatePill`, `MovementRow`, `ServicePip`, `Stat`/`StatBand`, `SegmentedControl`, `Button`/`HelixButton`).

### GenDec — APARCADO
- `GenDecPasteSection.tsx` — Pegar/parsear declaración general (crew + pax). **Funcionalidad en pausa.** Sigue montada en `PassengerCrewModal` y en `FlightDetailPanel` (visible en `/dia` y en el modal de pax), pero queda en segundo plano y no es prioridad de producto.

## Hooks (`src/hooks`)

| Hook | Función |
|---|---|
| `useEventStream.ts` | SSE: suscripción al bus de eventos, re-fetch granular por evento. |
| `useShift.ts` | Estado del turno actual (puesto, userId). |
| `useDate.ts` (en `helix/`) | Fecha/turno activos compartidos por el chrome y las vistas. |
| `useMediaQuery.ts` (`useIsMobile`) | Conmutación desktop/móvil. |
| `useLiveCountdown.ts` | Cuenta atrás en vivo (turnaround). |
| `useOverdueAlert.ts` | Alerta de servicios vencidos. |
| `useLongPress.ts` | Long-press para UX móvil. |
| `useServicePresets.ts` | Presets de servicios. |

## Patrones UI

- **Tiempo real**: SSE vía `useEventStream` (no polling); re-fetch granular por evento. Presente en `/`, `/dia`, `/timeline`.
- **Responsive**: chrome desktop (`AppHeader`) vs móvil (`BottomTabBar`), conmutado por `useIsMobile`.
- **Estilos**: Tailwind CSS con tokens propios (`bg`, `ink-*`, `brand`, `line`…); sin CSS modules. Iconos Lucide React + `Icons.tsx` local.
- **Densidades de la Lista**: `VisitCard` (detalle) ↔ `CompactFlightGrid` (compacto); el prototipo explora una tercera densidad.
- **Rol/puesto visible**: los componentes leen el puesto del turno (`useShift`) para mostrar tareas relevantes (`ChecklistPanel`, focus de acciones).
- **Edición pesada centralizada**: tarjetas y vistas delegan la edición completa en `FlightDetailPanel` para no duplicar lógica.
