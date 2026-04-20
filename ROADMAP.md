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

## HOTFIX urgente — Zona horaria y fechas (previo a v0.3 normal)

Bug triple detectado en apuntes del humano el 2026-04-20.
**Bloquea v0.3**: no se firma sprint nuevo con esto vivo —
viola P1 (cero vuelo perdido) en cada turno.

### Síntomas reportados

- **Día -1 al refrescar**: vuelo con ETA 00:15 UTC se muestra
  en el día anterior (porque `new Date("...Z").toISOString()`
  normaliza a UTC y el slice de fecha local retrocede).
- **Notificaciones 1h desfasadas desde el cambio de horario de
  verano**: los cálculos no respetan UTC+1 / UTC+2 según fecha
  (España cambió a CEST el 2026-03-29).
- **Vuelos desaparecidos**: los de madrugada no se listan en
  "hoy" — consecuencia directa de la normalización UTC.

### Tareas del hotfix

- [ ] Centralizar toda conversión de fecha/hora en
      `src/lib/time.ts` (nuevo). Usar `date-fns-tz` o
      equivalente con zona fija `Europe/Madrid`.
- [ ] Reemplazar usos directos de `new Date()` y
      `toISOString().slice(0,10)` sobre fechas de vuelo por
      helpers del nuevo módulo.
- [ ] Normalizar el cálculo de "fecha del día operativo" en
      `DaySheet`: la fecha que firma el día es la del calendario
      **local de Palma**, no la UTC.
- [ ] Revisar filtros de renderizado (`page.tsx`, hooks de
      selección de día) para que usen la fecha local.
- [ ] Revisar lógica de notificaciones / countdown ETD para
      que calcule deltas en hora local con DST dinámico.
- [ ] Test manual con reloj forzado en DevTools:
      - Vuelo ETA 00:15 del 20-abril debe aparecer en "hoy"
        cuando el reloj local marca 06:00 del 20-abril.
      - Countdown de un vuelo ETD 14:30 debe mostrar tiempo
        correcto tanto en CEST (hoy) como simulado en CET.

### Criterio de cierre

El mismo PDF importado a las 00:00 y a las 23:59 del mismo día
produce la misma lista de vuelos en el panel (§O1 aplicado a
fechas, no solo a parseo).

**Sin firma de producto**: es bug fix técnico, no decisión de
UX. El Director lo escolta pero no firma nada — el ingeniero
actúa de inmediato.

---

## v0.3 — Fase activa (tras el hotfix)

**Objetivo de versión**: vista `/dia` + control de equipaje
Dymo + pulido de tarjeta expandida. Con decisiones #1-#7, #9
firmadas el 2026-04-20, arranca implementación.

### Bloque A — Pulido tarjeta expandida (base para `/dia`)

Prerrequisito: hotfix TZ cerrado.

- [ ] **#6 · Reordenar sección equipaje LLEGADA**:
      En avión → Descargadas → Entregadas → Bodega (+/-) →
      Cabina (+/-). Mapeo a `paxArrBagsState`,
      `paxArrBagsChecked`, `paxArrBagsCabin`. Sin migración.
- [ ] **#6 caveat · Sección equipaje SALIDA**: orden paralelo
      adaptado al flujo físico inverso
      (`NOT_ARRIVED`/`TAGGED`/`SENT_TO_AIRCRAFT`). Si los
      labels en español generan duda, anotar #10 en
      `DECISIONS-PENDING.md` y esperar firma.
- [ ] **#7 · Render condicional LLEGADA/SALIDA en overnight**:
      si `linkedFlightId != null` y fechas difieren, ocultar
      columna SALIDA, expandir LLEGADA, añadir botón
      "Ver salida" inline (solo lectura, fetch en vivo del
      vuelo linkado).
- [ ] **#4 · Marcador icono € en callsign con `*`**: icono
      permanente + copy "Sin contrato — cobrar al despacho"
      al expandir.
- [ ] **#1 · Long-press 600ms en "Despachar"**: label
      secundario "Mantén pulsado" visible los primeros 7
      días de uso por usuario, luego oculto.

### Bloque B — Orden de renderizado

- [ ] **#5 · Orden por inmediatez operativa con toggle**:
      default = próximo evento ascendente, no-despachados
      primero, despachados al final. Toggle a "orden PDF" en
      cabecera. **Sin reordenamiento asíncrono** — el orden
      se congela al cargar día y se recalcula solo en refresh
      manual o cambio de fecha.

### Bloque C — Vista `/dia`

- [ ] **#2 · Ruta separada `/dia`**: dashboard actual sigue
      como vista por defecto. `/dia` es vista densa tipo
      "Orden del día digital", reutilizando la `FlightCard` ya
      pulida en Bloque A.

### Bloque D — Control de equipaje Dymo

- [ ] **#3 · Impresión `window.print()` + CSS `@page`** con
      preset 89×36 / 89×28. Spec en `specs/baggage-control.md`
      (verificar existencia).
- [ ] Componente `<LabelPrintButton />` en FlightCard.
- [ ] Playtest PMI 7 días. Si fricción, reabrir #3 con
      opción B (Dymo Connect local).

### Bloque E — Sección Ayuda

- [ ] Página `/ayuda` con Manual de Filtro 2026 (ya
      commiteado en `docs/`).

### Orden de ataque firmado

Hotfix TZ → Bloque A → Bloque B → Bloque C → Bloque D → Bloque E.
Razón: dolor del handler primero (A), luego estabilidad del
listado (B), luego nueva vista que reutiliza todo lo anterior
(C), luego features adicionales (D, E).

### Bloqueos abiertos

- **#8 · Nombre del producto "sirvici"**: espera firma humana
  directa (brand/naming no es Director call). No bloquea el
  sprint técnico pero bloquea cualquier comunicación a
  MALLORCAIR que implique marca.

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
