# UI — Páginas y Componentes — FBO Handler SaaS

## Páginas (Next.js App Router)

| Ruta | Fichero | Función |
|---|---|---|
| `/` | `src/app/page.tsx` | Dashboard principal. Vista en vivo de todos los vuelos del día. Filtros, búsqueda, SSE. |
| `/dia` | `src/app/dia/page.tsx` | Vista diaria organizada por horas (timeline compacto). |
| `/historico` | `src/app/historico/page.tsx` | Histórico de vuelos por fecha, acumulativo. |
| `/import` | `src/app/import/page.tsx` | UI para subir PDF (Cybermax) y Excel (Mallorcair). |
| `/flights/new` | `src/app/flights/new/page.tsx` | Crear vuelo manual (sin PDF). |
| `/timeline` | `src/app/timeline/page.tsx` | Vista temporal con live tracking. |
| `/metrics` | `src/app/metrics/page.tsx` | Dashboard de analítica (pax, crew, servicios). |
| `/admin` | `src/app/admin/page.tsx` | Panel administrativo (gestión usuarios, configuración). |
| `/login` | `src/app/login/page.tsx` | Auth (NextAuth Credentials). |

## Componentes clave

### Core de vuelo
- `FlightCard.tsx` — Tarjeta de vuelo legacy (shape v1). Componente más usado en producción.
- `VisitCard.tsx` — Tarjeta nueva (shape v2: Visit+Movement). Migración en curso.
- `SearchBar.tsx` — Búsqueda en tiempo real (matrícula, callsign, operador).
- `FilterToggleStrip.tsx` — Filtros: pending, hours, cancelled, mine (mis asignados).

### Operaciones
- `ChecklistPanel.tsx` — Tareas por movimiento según puesto activo.
- `ServiceCheckbox.tsx` — UI de estado de servicios (PENDING→ARRIVED→DELIVERED).
- `CrewInventory.tsx` — Almacén: registra STORED (llegada) → RETURNED (salida).
- `PendingServicesPanel.tsx` — Panel lateral de servicios pendientes.
- `TurnaroundAlert.tsx` — Alerta visual cuando hay turnaround urgente.

### Personas (datos sensibles)
- `PassengerCrewModal.tsx` — Modal que desencripta y muestra pax/crew bajo petición.

### Estado y turnos
- `ShiftBar.tsx` — Barra de turno activo (puesto, horas, handover).
- `ShiftHandover.tsx` — Formulario de entrega de turno con notas.
- `DaySummary.tsx` — Resumen del día (contadores vuelos, pax, crew).

### Acciones globales
- `HomeActionBar.tsx` — Botones de importar, ir a admin, exportar día.
- `QuickAddFlight.tsx` — Modal de creación rápida de vuelo manual.

### Primitivos
- `Modal.tsx` — Modal genérico reutilizable.
- `Toast.tsx` — Notificaciones temporales (éxito, error).

## Hooks

| Hook | Función |
|---|---|
| `useShift.ts` | Estado del turno actual (puesto, userId) |
| `useEventStream.ts` | SSE: suscripción al bus de eventos en tiempo real |
| `useLongPress.ts` | Detección long-press (mobile UX) |
| `useOverdueAlert.ts` | Alerta cuando hay servicios vencidos |

## Patrones UI

- **Idioma**: texto visible al usuario en **Español**, código y variables en **Inglés**.
- **Icono**: Lucide React exclusivamente (no heroicons, no fontawesome).
- **Estilos**: Tailwind CSS (sin CSS modules, sin styled-components).
- **Tiempo real**: SSE via `useEventStream` → re-fetch granular por evento, no polling.
- **Rol visible**: los componentes leen el puesto activo del turno (`useShift`) para mostrar/ocultar tareas relevantes.

## Vistas principales explicadas

### `/` (Dashboard)

Carga todos los vuelos del `palmaDay` actual. Muestra `VisitCard` por cada visita con sus dos movimientos (ARRIVAL + DEPARTURE). La barra superior (`HomeActionBar`) permite importar archivos. `FilterToggleStrip` filtra por estado. `SearchBar` filtra por texto. `ShiftBar` muestra el turno activo. SSE mantiene todo actualizado sin refresh.

### `/dia`

Vista alternativa organizada cronológicamente por hora de llegada/salida. Más compacta. Útil para el coordinador para ver la secuencia del día de un vistazo.

### `/historico`

Permite consultar días pasados. Los vuelos ya no son editables pero sí consultables (pax, crew, servicios entregados). Útil para facturación AENA y reports.
