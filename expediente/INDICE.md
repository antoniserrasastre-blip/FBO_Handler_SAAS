# INDICE — FBO Handler SaaS

Mapa completo del expediente. Leer después de `CLAUDE.md`, antes de actuar.

## Ficheros de dominio (`expediente/`)

| Fichero | Contenido |
|---|---|
| `estado.md` | Pendientes activos, alertas, punto actual del trabajo. **El único fichero vivo.** |
| `modelo-datos.md` | Schema v2: Operator→Aircraft→Visit→Movement. Tipos, enums, encriptación |
| `flujos.md` | Workflows principales: importación PDF, Excel, pasajeros, ciclo de servicio |
| `ui.md` | Páginas (App Router), componentes clave, hooks, patrones UI |
| `api.md` | Endpoints REST: rutas, métodos, guards de rol |
| `parsers.md` | Parsers de importación: pdfParserV2, excelParser, gendecParser |
| `infraestructura.md` | Servidor (`sirvici`), Cloudflare Tunnel, dominio, microservicios |

## Historial de trabajo (`expediente/historial/`)

Una hoja por mes con lo que se hizo, decidió o rompió.

- `historial/2026-05-testeo-profundo.md` — plan de testeo profundo (FASES 0-3 completadas)
- `historial/2026-06.md` — mes actual

## Decisiones arquitectónicas (`docs/adr/`)

Decisiones técnicas permanentes (no cambian con frecuencia, justifican el "por qué" del sistema).

- `docs/adr/0001-eventbus-single-container.md` — EventBus como singleton en memoria (deploy single-container)

## Dónde está cada cosa en el código

| Si buscas... | Ve a... |
|---|---|
| Schema de DB | `prisma/schema.prisma` |
| Tipos TS del modelo v2 | `src/types/v2.ts` |
| Tipos legacy (compat) | `src/types/compat.ts` |
| Parser PDF Cybermax | `src/lib/pdfParserV2.ts` |
| Parser Excel Mallorcair | `src/lib/excelParser.ts` |
| Adapter Visit→FlightView | `src/lib/flightView.ts` |
| Bus de eventos SSE | `src/lib/events.ts` |
| Encriptación pasaportes | `src/lib/crypto.ts` |
| Dashboard principal | `src/app/page.tsx` |
| Tarjeta de vuelo | `src/components/FlightCard.tsx` (legacy) / `VisitCard.tsx` (v2) |
| Roadmap (lo que viene) | `ROADMAP.md` |
