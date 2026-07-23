# Estado — FBO Handler SaaS

_Última actualización: 2026-07-23_

> Este fichero se reescribe en cada sesión de trabajo. Refleja el momento presente, no el historial.

## Situación actual

Sistema en producción en `sirvici`, expuesto vía Cloudflare Tunnel en `fbo.randomite.space`. Modelo v2 estable.

**QA + fix run multi-agente (2026-06-11):** un bot QA navegó producción como un humano y una run
de agentes (sondas + causa raíz + verificación adversarial) confirmó **26 bugs**; el informe vive
en La Bestia: `workspace/coding/projects/fbo-handler-saas/references/_archivo/qa-run_11-06-2026.md`. El mismo día se
aplicó la fix run (26/26) y se **DESPLEGÓ**: commits `1557ee0` (fixes) + `159ab70` (cierre),
deploy verde (verify + Build&Deploy + healthcheck). Suite **1137 pass / 0 fail / 53 skip**.
Piezas nuevas: `src/lib/autoTransition.ts`, `noShowSweep.ts`, `movementCounts.ts`, tests de
regresión y 4 sondas `*.probe.test.ts` (todas en verde).
**OJO:** el sweep NO_SHOW limpia los 484 fantasmas históricos en el **primer import de PDF**
tras el deploy — hasta entonces el filtro del GET ya los oculta de la hoja viva.

**Live tracking caído:** el worker OpenSky arranca en cada boot pero corre en modo anónimo
(~400 créditos/día, agotados en la primera hora; OpenSky retiró el basic auth). Confirmable en
`/api/live/status` (logueado). Plan decidido: migrar `fetchStates()` a **adsb.lol** (gratis,
formato ADSBx) + polling adaptativo + estado `FINAL` (alerta de corta final) + push ntfy —
**después** de desplegar la fix run (la tubería ATA/ATD que el live tracking alimenta era parte
de los bugs). Medio plazo: receptor ADS-B propio en el FBO.

**Bugfix dobles rotaciones (2026-07-18):** `upsertVisit` keyeaba por avión+palmaDay y la 2ª
rotación del día pisaba a la 1ª (caso D-ASIM 18-07, detectado en el piloto escribano). Fix en dos
commits desplegados en verde: `06fdbb9` (matching por **callsign + hora ±90 min**, hint desde
import y quick-add, visitas ya reclamadas excluidas por pasada) y `75df350` (fuera el
`@@unique(aircraftId, palmaDay)` — chocaba con el create de la 2ª visita; migrado en schema,
`migrate-v2-schema.mjs` y `/api/db/migrate`, drift test invertido). Suite 1147 pass. D-ASIM
18-07 **reparado en producción vía API** (visita LUA379W con ATA 12:42Z / ATD 14:30Z; la de
LUA180Y intacta) — la reparación misma verificó el fix e2e. Reabre el race documentado de
imports concurrentes (riesgo aceptado: operador único).

**Auditoría ICM (2026-07-19, desde La Bestia):** repo documentalmente sano — el expediente se
queda como está. Higiene aplicada: borrados los 4 componentes huérfanos legacy (`FlightCard`,
`ServiceCheckbox`, `CrewInventory`, `LiveStatusBadge`, ~1.900 líneas, 0 imports), corregido el
drift "Vercel-hosted" de los READMEs de microservicios, nota de auto-transición de `flujos.md`
marcada resuelta, creado `historial/2026-07.md`. En La Bestia se montó el nodo ICM completo
(stages + KB de dominio con fichas matching-rotaciones y reglas-TZ); el `/design-sprints` se
corrió el mismo día (plan APROBADO: 3 sprints) y el sprint 01 se ejecutó a continuación (abajo).

**Sprint MCP 01 `mcp-lectura` (2026-07-19) — CERRADO y DESPLEGADO:** la app tiene superficie de
agente. `POST /api/mcp` (JSON-RPC 2.0 Streamable HTTP stateless, dispatcher propio, cero deps
nuevas) con auth por `AgentToken` (Bearer, hash sha256, revocable; user `agent-claude` rol
AGENT — el user `CLAUDE` HANDLER de cookies sigue intacto) y 3 tools de solo-lectura:
`get_day`, `find_flight` (ancla callsign+hora reusando `timeDelta`/tolerancia de upsert.ts;
matrícula ambigua devuelve TODOS los candidatos) y `get_event_log` (ventana por día CIVIL de
Palma vía `palmaMidnightUtc`, nuevo export de `time.ts` — la review adversarial cazó y cerró la
ventana UTC-naive, hallazgo M1). Commits `aacec17` (sprint, 15 tests nuevos) + `add173f`
(ajustes de playtest: el middleware NextAuth excluye `/api/mcp`; import perezoso del adapter
Turso en `agent-token.mjs`). Suite **1163 pass / 0 fail / 53 skip**, dos deploys verdes.
Token minteado en prod (`claude-code-la-bestia`, CLI `scripts/agent-token.mjs`); playtest real
OK (initialize/tools/list/get_day/find_flight D-ASIM 2 candidatas/event_log 166 entradas del
18-07 con filtro `usuario:"CLAUDE"` — el name va en MAYÚSCULAS; 401 sin/mal token). Deuda
menor de la review (no bloqueante): ~~find_flight acepta horas >23:59~~ (**m2 CERRADO en S2**),
substring numérico de matrícula genera candidatos-ruido, "LTM 604" con espacio no matchea el
callsign LTM604, AgentToken sin cobertura en el drift-test (`MODELS_TO_CHECK`), sin `orderBy`
determinista en las queries de visits. Dueño: sprint 03 del plan o endurecimiento suelto.
Proceso completo en La Bestia: `workspace/.../stages/03_sprint/output/01_mcp-lectura/`.

**Sprint MCP 02 `mcp-escritura-lote` (2026-07-19) — CERRADO y DESPLEGADO:** el agente ya
ESCRIBE. Commit `edab06a` (16 archivos, +1939), deploy verde (verify + Build&Deploy + db push +
healthcheck). Piezas: lib `src/lib/mcp/horas.ts` (`normalizarHora`: `{hora,tz}` o string,
**default LOCAL** — así dicta Toni —, todo vía Intl Europe/Madrid, bordes DST pineados:
local inexistente 29-03 02:xx → error, ambigua 25-10 02:xx → primera CEST; confirmación dual
"11:23Z / 13:23 local"); tool `update_movements` (lote, allowlist = EXACTAMENTE
`MOVEMENT_OPERATIONAL_FIELDS` de upsert.ts ahora exportado, fila ATÓMICA con validación
pre-BD — estructura/Int32/state/horas —, parcial explícito: fila mala → `{ok:false, motivo}`
en español sin internals y el lote sigue; EventLog "Actualizado por agente" + SSE por fila;
`applyAutoTransition` reusada solo sin `state` explícito); tool `log_incident` (modelo
`Incident` nuevo, append-only, `vuelo` opcional por visitId o texto libre vía findFlight —
ambiguo → candidatos, jamás adivina; EventLog "Incidencia registrada"); DDL de Incident en
ambos caminos de migración + drift-guard extendido (`MODELS_TO_CHECK` + `RELATION_FIELDS`);
endurecimiento m2 en find_flight (horas fuera de 00:00–23:59 = token de texto). Proceso:
35 tests rojos → verde → review adversarial **NO PASA** (MAYOR: el lote abortaba a mitad
comiteando el prefijo y filtrando errores Prisma en inglés; +2 MENORES) → 2 loops de
regresiones (17 tests robustez) → **PASA** (32/32 sondas propias, ~78k puntos TZ contra
oráculo Intl independiente, 0 desviaciones; E2E con Prisma real sobre BD scratch). Suite
**1223 pass / 0 fail / 53 skip**. Smoke en prod: tools/list = 5, escritura con rechazo
por-fila en español (cero datos tocados), get_day 18-07 = 40 rotaciones, m2 vivo, 401 OK,
tabla Incident aplicada. Rutina del escribano actualizada (escrituras por MCP; REST =
fallback + import). **Deuda nueva de la review (no bloqueante, dueño S3 o endurecimiento
suelto):** (1) sin `$transaction` por fila — si eventLog/autoTransition casca TRAS un update
exitoso, la fila se reporta ko con la escritura ya persistida (no alcanzable por input, solo
fallo de infra entre escrituras); (2) BD caída → motivo genérico "revisa los valores"
engañoso; (3) estados de servicio (`paxState`…) se aceptan verbatim sin validar enum
(contrato pineado, la UI tampoco valida). Playtest de uso real de Toni: próximo turno.
Proceso completo en La Bestia: `workspace/.../stages/03_sprint/output/02_mcp-escritura-lote/`.

**Sprint MCP 03 `mcp-ciclo-completo` (2026-07-19) — CERRADO y DESPLEGADO. EL SPIKE ESTÁ
COMPLETO (3/3 sprints del plan, los tres el mismo día):** el agente opera el ciclo de vida
entero del turno. Commit `1e3ea85` (9 archivos, +2452), deploy verde (verify + Build&Deploy;
sin migración de schema). Piezas: `cancel_movement`/`uncancel_movement` (soft-cancel
`flightCategory→CANCELLED` por movement con **guardia de evidencia** — ATA/ATD exige
`confirmar:true` estricto, sin él error con los datos del vuelo, caso EC-NGX/CS-LTO — y
**conservación exacta**: el cancel guarda `{motivo, previo}` en EventLog JSON y el uncancel
restaura ese previo; cancel sobre cancelado / uncancel sin cancel del agente → error sin
efectos); `create_flight` (rotación fuera del daily vía `upsertVisit` con hint callsign+hora
— hereda el fix D-ASIM; ≥1 pierna `{hora, origen?/destino?}`, cierra el caso 9H-YOU; horas
ancladas al día civil de la `fecha`, state EXPECTED solo-create; `operador` solo contra
Operators existentes); `fix_plan` (allowlist `FIX_PLAN_FIELDS` de campos de PLAN,
COMPLEMENTARIO al de S2 — disjunción testeada —, atómico pre-BD, direccionalidad eta/origin
ARRIVAL y etd/destination DEPARTURE, `registration` re-apunta la Visit entera sin tocar
visitId); `import_daily` (PDF base64 con guardas %PDF+tamaño, **dry-run por defecto** con la
reconciliación toCancel del POST y CERO escrituras; persistir = `confirmar:true` por el
camino del PUT atribuido al agente, **SIN cancelIds jamás** — los toCancel vuelven con sus
movementIds para confirmarlos uno a uno con `cancel_movement`); **pipeline de import
extraído a `src/lib/v2/import-core.ts`** — el route REST queda como wrapper con
comportamiento **byte-idéntico verificado** (sonda NEW vs HEAD: bytes+status+efectos).
`tools/list` = **10**. Proceso: 48 tests rojos (44 por razón correcta) → verde suite
**1271 pass / 0 fail / 53 skip** sin tocar un test → review adversarial **PASA a la
primera** (44/44 sondas en `/tmp/probes-s3/`: conservación 500 secuencias, fuzz de guardia,
dry-run = diff 0 filas en todas las tablas, D-ASIM en umbral/wrap, 112 horas vs oráculo DST,
33 args malformados → español sin internals). Smoke en prod 7/7 (tools/list=10, get_day
18-07 = 40 rotaciones, guardias vivas, 401). Rutina del escribano: TODO el ciclo por MCP,
REST solo emergencia. **Deuda nueva de la review (MENOR, dueño endurecimiento suelto):**
(1) fechas de calendario imposibles pasan el regex y ruedan ("31-02"→03-03) en
`create_flight.fecha`/`fix_plan.scheduledDate`; (2) divergencia REST teórica e inalcanzable
si `file.arrayBuffer()` fallara. **Gate abierto (el único): playtest-demo de Toni** — turno
completo por MCP (próximo turno con daily real o día histórico si pasa el PDF); su veredicto
= criterio de éxito y cierre de la ficha `fbo-mcp-spike-demo`. Proceso completo en La
Bestia: `workspace/.../stages/03_sprint/output/03_mcp-ciclo-completo/`.


**Sprint MCP 04 `board-del-turno` (2026-07-23) — CERRADO y DESPLEGADO. PRIMER SPRINT
POST-SPIKE (bloque agente embebido + feeds):** el board (web Y MCP) enseña el turno REAL. 3
commits desplegados en verde (`bfccf66`→`049c148`→`7f64ea7`, `Deploy to Sirvici` success cada
vez, `/srv` nunca congelado). Cierra las 8 grietas del playtest MCP-nativo del 23-07 (C1-C4 +
C11-C14):
- **C1 universo del día compartido** (`src/lib/v2/dayUniverse.ts`, fuente única para
  `get_day`/`find_flight`/`/api/flights`): `dayUniverseWhere(D)` = `palmaDay==D` ∪
  `movements.some(scheduledDate==D)` ∪ **arrastre** [D−14,D) — las salidas de aviones llegados
  días atrás aparecen en el board de hoy (fricción UAG202/JCO007). Arrastre marcado
  (`arrastre:true`+`palmaDay`). El predicado de arrastre poda **salidas terminales** (OFF_BLOCKS/
  NO_SHOW en la DEPARTURE) y **rotaciones muertas por no-show** (`movements.none({state:NO_SHOW})`
  — turnarounds cuya llegada nunca ocurrió no son salidas pendientes).
- **C2/C3** `estadoRotacion` compuesto (`mostAdvancedState` sobre piernas vivas, reusado de
  `flightView`); seed del import intacto (DEPARTURE nunca nace >EXPECTED ni con atd).
- **C4** guardias del matcher (`registrationMatches`): registration vacía/`<3` → solo igualdad
  exacta (mata el falso ZJONES candidato de cualquier callsign).
- **C11** `McpMovement+=flightCategory`; `get_day` excluye CANCELLED por defecto + `summary
  {vivos,cancelados}`; `incluirCancelados` estricto; `find_flight` los marca sin excluir.
- **C12** `POST /api/mcp/upload` (multipart, token AGENT, guardas %PDF+tamaño, `<uuid>.pdf` TTL
  1h) → `import_daily` acepta `upload_id` XOR `pdf_base64` (adiós base64 inline). El `upload_id`
  se valida como UUID ANTES del FS (fix path traversal MAJOR-1 de la review).
- **C13** kill-switch `LIVE_SEED_TIMES` (default OFF): el feed ya NO siembra ata/atd fantasma;
  `canSeedTime` puro (guardia para cuando se reactive tras adsb.lol/C9). Snapshot `live*` y
  EventLog de transición siguen en ambos modos.
- **C14** huérfanas de EXTRAS (Visits sin movimientos) invisibles en las 3 superficies; siguen
  en BD para enriquecerse con el PDF.
Proceso: rojo 65 tests → verde → **review adversarial NO PASA (MAJOR-1 path traversal
`upload_id`)** → loop (test-writer +6 regresiones → validación UUID) → PASA (0 fugas/15
vectores). **El smoke prod destapó 2 grietas de C1** que las fixtures no modelaban (arrastre
inundaba `get_day(hoy)` a 224 vuelos con 103 NO_SHOW + 12 OFF_BLOCKS fantasmas): 2 loops
rojo→verde→re-review → **board final 109** (40 del día + 69 pernoctas reales PARKED/ON_BLOCKS/
TURNAROUND/EXPECTED). Suite **1355 pass / 0 fail / 53 skip** · tsc 0 · eslint 0 · build OK.
**Deuda nueva (MENOR, dueño endurecimiento suelto):** `canSeedTime` no comprueba `atd>=ata`
(seguro por seenAt monótono + kill-switch OFF); `summary` cuenta piernas de arrastre históricas;
2-3 salidas de arrastre con pierna NO_SHOW visibles por la rama `scheduledDate==hoy` (artefactos
de ATD fantasma del feed viejo, C13 los frena). **Gate abierto (el único): playtest-demo de
Toni** — ahora con el board YA veraz, el siguiente turno MCP-nativo juzga la ficha
`fbo-mcp-spike-demo`. **Siguiente candidato de la fábrica: S5 `acciones-en-el-board`**
(cards/Proposal, gate D3). Proceso en La Bestia:
`workspace/.../stages/03_sprint/output/04_board-del-turno/`.

## Decisiones de alcance (MVP)

- **GenDec aparcado (2026-06-02)** — sin cambios, código intacto y dormido.
- **NO_SHOW (2026-06-11)** — nuevo estado terminal. Sweep al cierre del import: ARRIVAL EXPECTED
  con scheduledDate < hoy-1 y sin evidencia de llegada (ata / livePhase) → NO_SHOW, con EventLog
  + SSE por transición. Limpiará los **484 no-shows históricos** en el primer import tras el deploy.

## Pendientes activos

- **Target Vercel/Turso — RETIRADO (decisión de Toni 19-07-2026)**: target único sirvici; el
  Turso no se migra (se quedó con el unique viejo y sin AgentToken, da igual: nadie lo sirve
  como canon). El código tolerante a Turso (`db.ts`, `db:push-turso`, `/api/db/migrate`)
  queda dormido en el repo, no se extiende ni se testea.
- [ ] **Apagar el proyecto Vercel** (Toni, dashboard suyo; sin límite de sprint): que el
  deploy viejo no siga sirviendo código desactualizado en público. Borrar/pausar proyecto y,
  si se quiere, la BD Turso.
- [ ] **Migración live tracking a adsb.lol** ← el siguiente bloque — ver plan arriba.
- [ ] Verificar tras el primer import post-deploy: sweep NO_SHOW ejecutado (484 históricos),
  fantasmas fuera de la hoja, contadores cabecera=banner, y re-pasar el bot QA para confirmar.

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

### Deuda de estructura (auditoría ICM 19-07-2026)
- [ ] God-component `src/app/page.tsx` (998 l.): extraer `useHomeFilters()` (estado de filtros +
  persistencia localStorage + migración de clave vieja) y aislar la barra de filtros. No urgente;
  no mezclar con el sprint MCP.

### Otros bugs menores
- [ ] BUG-4 — doble-prefijo `ZZ` en `excelParser.ts`, sigue.
- [ ] Time `0900/0930` en `excelParser.ts` descarta el 2º horario — sigue (lo del 11-06 fue
  pdfParser + calcMinutes, no excelParser).
- Warning lint `isOvernight` — **HECHO** (renombrado `_isOvernight` por el integrador).

### Decisiones de producto pendientes (del informe QA)
- [ ] Cómo etiquetar rotaciones dobles del mismo avión el mismo día (caso EC-OGB, B2) —
  la **capa de datos quedó resuelta el 18-07** (cada rotación su propia Visit); pendiente solo
  si la UI quiere distinguirlas visualmente (badge "2ª rotación" o similar).
- [ ] Qué señal de urgencia quiere rampa en el FlightChip de `/` (B4 se arregló en alertas y
  orden; el chip sigue sin color de urgencia por decisión pendiente).
- [ ] Unificar `isArrivalToday/isDepartureToday` de `diaHelpers` con `movementCounts` (quedaron
  dos implementaciones compatibles pero separadas para no cruzar propiedad de ficheros).

## Alertas

_(Ninguna activa — fix run desplegada y verde el 2026-06-11; los 484 NO_SHOW históricos se
limpian solos en el primer import de PDF.)_

## Cómo actualizar este fichero

Al inicio de cada sesión: revisar si hay cambios de estado desde la última vez.
Al cierre: actualizar pendientes (tachar lo hecho, añadir lo nuevo), añadir lo que se decidió o rompió.
