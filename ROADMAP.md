# ROADMAP.md — Mapa de fases del producto

> Fases firmadas por el Director. El ingeniero (`CLAUDE.md`)
> ejecuta y marca `[x]` al cerrar tarea. Nada entra a una fase
> sin pasar por aquí; lo que aparezca "de paso" en un commit
> sin estar listado se revierte a `DECISIONS-PENDING.md` y se
> discute al cerrar la fase activa.
>
> **Versión activa**: v0.3 (inicio 2026-04-20).
> **Versión anterior cerrada**: v0.2 (2026-04-20).

---

## Estado del `main` post-v0.2

El `main` lleva mejoras desplegadas después de cerrar v0.2 que
**no están narradas en `CHANGELOG.md`** todavía. Material visible
para el handler:

- Countdown en vivo del ETD en la tarjeta colapsada.
- Conflicto de parking con registro AIP oficial.
- Badges click-to-copy y click-to-filter.
- Página de métricas con KPIs operativos.
- Edición inline de ETA/ETD sin expandir tarjeta.
- Notas libres por vuelo.
- Atajo teclado `N` para vuelo nuevo.
- Botón "Todos entregados" para marcar servicios en bloque.
- Búsqueda con operadores booleanos.
- Toasts de éxito en crear/borrar vuelo.
- Vista imprimible con botón "Imprimir".

**Decisión del Director**: no se narra en CHANGELOG suelto. Se
consolida en la entrada del próximo release visible (sprint
`/dia` o primer sprint cerrado de v0.3). Razón: v0.2 cerró hace
horas, partir la historia en v0.2.1 añade ruido narrativo sin
ganar claridad para MALLORCAIR.

---

## v0.3 — Fase activa

**Objetivo de versión**: que el handler de mañana tenga, además
del panel de tarjetas, una vista densa de su turno y el primer
bloque de control de equipaje sobre etiquetas Dymo.

### Bloques de trabajo

- [ ] **Vista `/dia`** — ruta separada del dashboard. Spec
      pendiente de firma en `DECISIONS-PENDING.md` #2.
- [ ] **Control de equipaje con etiquetas Dymo** — spec en
      `specs/baggage-control.md`. Firma de técnica de impresión
      en `DECISIONS-PENDING.md` #3.
- [ ] **Marcador visual de callsign con `*`** (sin contrato).
      Spec en `DECISIONS-PENDING.md` #4.
- [ ] **Confirmación al "Despachar" vuelo** — método a firmar
      en `DECISIONS-PENDING.md` #1.
- [ ] **Sección Ayuda con Manual de Filtro 2026**. Referencia
      ya commiteada (`docs/MANUAL_FILTRO...`).

### Bloqueos activos sobre v0.3

Cuatro decisiones en `DECISIONS-PENDING.md` (#1, #2, #3, #4)
siguen `ABIERTA`. Sin firma humana no arranca el sprint
correspondiente. Prioridad de firma según Director:

1. #4 (marcador `*`) — tocar rampa activa, riesgo facturación.
2. #1 (confirmación despachar) — tocar rampa activa, riesgo tap
   accidental.
3. #3 (Dymo técnica) — bloquea sprint de equipaje.
4. #2 (`/dia` separada vs reemplazo) — bloquea sprint `/dia`.

---

## v0.4 — Próxima versión (borrador, sin firma)

**Objetivo tentativo**: escalar la sincronía real entre puestos
y cerrar timeline visual.

- [ ] **WebSocket + Redis** — sustituye SSE en memoria. Hoy no
      sincroniza con >1 instancia de Vercel (riesgo editorial
      vivo documentado en CHANGELOG v0.2).
- [ ] **Timeline Gantt** — visualización de turnos del día en
      eje temporal. Ubicación (página aparte vs tab) sin firmar.

No se abre trabajo hasta cerrar v0.3.

---

## Backlog sin versión asignada

Ideas que existen pero no tienen fase. No se tocan sin firma
explícita que las mueva a una versión concreta.

- Integración FlightRadar (datos reales de llegada/salida).
- Integración ESIA (slots y coordinación con ENAIRE).
- Exportaciones adicionales más allá de CSV (PDF, Excel).
- Facturación automática a partir del EventLog.
- Vista de turno de tarde — traspaso formal desde el turno de
  mañana (fricción citada en CHANGELOG v0.2).

---

## Regla de entrada al ROADMAP

Para que algo entre aquí:

1. Hay **entrada cerrada en `DECISIONS-PENDING.md`** con firma
   humana, o
2. Hay **TURNO-REPORT** que documenta la fricción que lo
   justifica, o
3. El Director lo añade con razón escrita al lado (ver
   comentarios en el propio ROADMAP si aparecen).

Sin alguna de las tres, no entra. Se queda en conversación
hasta que cumpla el filtro.
