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
| `parsers.md` | Parsers de importación: PDF (fachada `pdfParser` → `pdfParserV2`), `excelParser`; `gendecParser` aparcado |
| `infraestructura.md` | Servidor (`sirvici`), Cloudflare Tunnel, dominio, microservicios |

## Historial de trabajo (`expediente/historial/`)

Una hoja por mes con lo que se hizo, decidió o rompió.

- `historial/2026-05-testeo-profundo.md` — plan de testeo profundo (FASES 0-3 completadas)
- `historial/2026-06.md` — mes actual

## Capacidades — skills invocables (`.claude/skills/`)

Qué sabe hacer el sistema. Invócalas con `/<nombre>`.

| Skill | Tipo | Para qué |
|---|---|---|
| `/verificar-expediente` | Mantener | Audita las hojas contra el código y reporta deriva por severidad |
| `/actualizar-expediente` | Mantener | Reescribe solo las hojas afectadas por un cambio (lee el git diff) |
| `/cerrar-dia` | Mantener | Ritual de cierre: actualiza `estado.md` y vuelca al historial mensual |
| `/nueva-feature` | Expandir | Vertical slice enrutado a los agentes `fbo-*` con las guardas anti-bug-silencioso |
| `/auditar-deuda` | Mantener | Barrido global: huérfanos, drift de whitelist, mutaciones sin emit, PII en claro |

Subagentes de dominio (no son skills, se invocan por tarea): `fbo-backend`, `fbo-frontend`, `fbo-parsers`, `fbo-reviewer`, `fbo-test`, `fbo-merge` en `.claude/agents/`.

## Decisiones arquitectónicas (`docs/adr/`)

Decisiones técnicas permanentes (no cambian con frecuencia, justifican el "por qué" del sistema).

- `docs/adr/0001-eventbus-single-container.md` — EventBus como singleton en memoria (deploy single-container)

## Dónde está cada cosa en el código

| Si buscas... | Ve a... |
|---|---|
| Schema de DB | `prisma/schema.prisma` |
| Tipos TS del modelo v2 | `src/types/v2.ts` |
| Tipos legacy (compat) | `src/types/compat.ts` |
| Parser PDF Cybermax | `src/lib/pdfParser.ts` (fachada pública + SAFE_MODE; importa todo de aquí) → motor `src/lib/pdfParserV2.ts` |
| Parser Excel Mallorcair | `src/lib/excelParser.ts` |
| Adapter Visit→FlightView | `src/lib/flightView.ts` |
| Bus de eventos SSE | `src/lib/events.ts` |
| Encriptación pasaportes | `src/lib/crypto.ts` |
| Dashboard principal | `src/app/page.tsx` |
| Tarjeta de vuelo (viva) | `src/components/VisitCard.tsx`. OJO: `FlightCard.tsx` está HUÉRFANO (0 imports), no es la tarjeta de producción |
| Parser Excel: detección de matrícula | `looksLikeRegistration` / `insertDash` en `src/lib/excelParser.ts` |
| Auto-transición de estado (duplicada) | `suggestNextState` en `src/lib/flightUrgency.ts`, aplicada en `flights/[id]/route.ts` y `services/[id]/route.ts` |
