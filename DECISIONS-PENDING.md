# DECISIONS-PENDING.md

> Decisiones de producto abiertas. El Director las anota; el
> humano (Antoni / MALLORCAIR) las firma; el ingeniero (`CLAUDE.md`)
> implementa la firmada en el siguiente sprint.
>
> **Ciclo de vida**: `ABIERTA` → `FIRMADA` → `IMPLEMENTADA` (se
> archiva a `DECISIONS-ARCHIVE.md` al cerrar v+1).
>
> **Regla dura**: ningún PR del ingeniero merguea decisión de
> producto no firmada. Si aparece una, se revierte a esta lista.

---

## Abiertas

### #8 · Nombre del producto — ¿"sirvici" es rebrand oficial?

- **Contexto**: En sesión de apuntes del 2026-04-20 el humano
  se refiere al producto como "sirvici". El repo, la UI, la
  documentación interna y las referencias a MALLORCAIR S.L.
  usan "FBO Handler SAAS" como descriptor técnico y no hay
  brand visible para el handler.
- **Opciones**:
  - **A · "sirvici" es el nombre comercial oficial**. Hay que
    reflejarlo en PLAN.md, splash de login, PWA manifest,
    README, y comunicación a MALLORCAIR.
  - **B · "sirvici" es un codename interno** del equipo de
    producto. No toca la UI ni la comunicación con MALLORCAIR.
  - **C · "sirvici" fue un desliz / confusión**. Se mantiene
    sin cambios.
- **Recomendación Director**: no hay recomendación. Brand y
  naming son **autoridad humana** — el Director no firma
  nombre de producto. Pendiente de línea explícita de Antoni.
- **Firma**: `ABIERTA`.

---

## Firmadas (pendientes de implementación)

> Todas las firmadas a continuación llevan la misma etiqueta de
> firma: *"2026-04-20 por Antoni (delegación explícita al
> Director: 'hazlo tu todo como veas mejor')"*. Se conserva el
> razonamiento Director completo para auditoría.

### #1 · Confirmación al "Despachar" vuelo

- **Firmada**: 2026-04-20 por Antoni (delegación al Director).
- **Decisión**: opción **B** — long-press 600ms en el botón
  "Despachar".
- **Razón**: un solo gesto, respeta P3 (tres toques máx) y P4
  (velocidad), evita tap accidental. Label secundario "Mantén
  pulsado" bajo el botón los primeros 7 días de uso, luego se
  oculta. Descarta modal (viola P3) y clic directo (accidente
  posible).
- **Target**: v0.3, antes del sprint `/dia` porque el botón
  vive también ahí.

### #2 · Vista `/dia` — separada vs reemplazo del dashboard

- **Firmada**: 2026-04-20 por Antoni (delegación al Director).
- **Decisión**: opción **A** — ruta separada `/dia`. El
  dashboard actual sigue siendo la vista por defecto.
- **Razón**: sobre-entregar la preferencia por usuario antes
  de evidencia es sobre-ingeniería. Si un TURNO-REPORT muestra
  que handlers prefieren `/dia` como vista por defecto, se
  reabre y se firma opción B en v+1.
- **Target**: v0.3.

### #3 · Impresión de etiquetas Dymo

- **Firmada**: 2026-04-20 por Antoni (delegación al Director).
- **Decisión**: opción **A** — `window.print()` + CSS `@page`
  con preset de tamaño 89×36 / 89×28.
- **Razón**: menor fricción, sin dependencia local nueva, sin
  servicio intermediario que mantener. Playtest de una semana
  en PMI decide si se sube a opción B (Dymo Connect local).
  Opción C (PDF descargable) descartada por P3.
- **Target**: v0.3, sprint baggage-control.

### #4 · Callsign con asterisco — marcador visual

- **Firmada**: 2026-04-20 por Antoni (delegación al Director).
- **Decisión**: opción **C sin tooltip** — icono € permanente
  junto al callsign + copy "Sin contrato — cobrar al despacho"
  visible al expandir la tarjeta.
- **Razón**: icono € a 2m de distancia es reconocible (riesgo
  de facturación visible al primer vistazo). Tooltip viola P3
  (requiere hover en mobile/rampa). Copy explícito al expandir
  evita ambigüedad en formación de handlers nuevos.
- **Target**: v0.3, incluible en el mismo sprint que el
  hotfix TZ (cambio aislado y pequeño).

### #5 · Orden de renderizado de tarjetas

- **Contexto**: apuntes Fase 2 del humano. Dos órdenes posibles:
  orden literal del PDF origen (determinista, coteja con papel)
  u orden por inmediatez operativa (próximo evento ascendente).
- **Firmada**: 2026-04-20 por Antoni (delegación al Director).
- **Decisión**: **orden por inmediatez operativa por defecto,
  con toggle a "orden del PDF" en cabecera**.
  - **Función de orden (inmediatez)**:
    1. Vuelos no despachados primero.
    2. Dentro de no despachados: próximo evento ascendente —
       `EXPECTED` usa `eta`, `ON_GROUND`/`BOARDING` usa `etd`.
    3. `DISPATCHED` al final, en orden de despacho.
  - **Reordenamiento asíncrono**: no. El orden se congela al
    cargar el día y se recalcula en refresh manual o cambio de
    fecha. Si llega un evento SSE que cambia estado, la tarjeta
    **cambia visualmente** (color, badge) pero **no se mueve
    de posición** hasta el siguiente refresh del día.
- **Razón**: P3 — si la lista se reordena mientras el handler
  toca una tarjeta, pierde el clic. El toggle a "orden PDF"
  cubre el caso de cotejo con el papel de Cybermax (§O1
  determinismo externo preservado).
- **Target**: v0.3, después del hotfix TZ y de Fase 3.

### #6 · Sección equipaje — orden de cabeceras

- **Contexto**: apuntes Fase 3.1 del humano. Orden físico real:
  En avión → Descargadas → Entregadas → Bodega (+/-) →
  Cabina (+/-).
- **Firmada**: 2026-04-20 por Antoni (delegación al Director).
- **Decisión**: aplicar el orden propuesto **en la sección de
  LLEGADA** de `FlightCard` expandida. Mapeo a schema Prisma
  (verificado — sin migración):
  1. **En avión / Descargadas / Entregadas**: representación
     visual de los tres estados de `paxArrBagsState`
     (`IN_AIRCRAFT` | `UNLOADED` | `DELIVERED`) como progresión
     de 3 pasos clicables.
  2. **Bodega (+/-)**: contador editable sobre
     `paxArrBagsChecked`.
  3. **Cabina (+/-)**: contador editable sobre
     `paxArrBagsCabin`.
- **Caveat para SALIDA**: el flujo físico en salida es inverso
  (cliente trae → se etiqueta → sale al avión) y el schema
  refleja estados distintos (`NOT_ARRIVED` | `TAGGED` |
  `SENT_TO_AIRCRAFT`). El ingeniero aplica orden paralelo
  **adaptado al flujo de salida**, con labels en español
  coherentes. Si hay duda sobre los labels exactos, anota en
  este fichero como #10 y espera firma.
- **Razón**: flujo de cabecera coincide con la operación física
  que el handler ejecuta. Schema ya soporta los 3 estados, no
  hay migración, no hay riesgo de rollback.
- **Target**: v0.3, bloque Fase 3.

### #7 · "Ver salida" en overnight flights

- **Contexto**: apuntes Fase 3.2 del humano. Si el vuelo llega
  hoy y sale un día posterior, ocultar la columna SALIDA por
  defecto y exponer un botón discreto "Ver salida" que
  expanda los datos inline.
- **Firmada**: 2026-04-20 por Antoni (delegación al Director).
- **Decisión**:
  1. **Detección**: vuelo es overnight si
     `linkedFlightId != null` **Y** la fecha del vuelo linkado
     difiere de la fecha del vuelo actual.
  2. **Render por defecto**: ocultar columna SALIDA, expandir
     la columna LLEGADA para ocupar el espacio (Grid/Flexbox
     adaptado). Badge visible: "Sale mañana" o "Sale [fecha]".
  3. **Botón "Ver salida"**: discreto, junto al badge. Al
     pulsar, expande un panel inline con los datos del vuelo
     linkado (no redirige).
  4. **Alcance del panel**: **solo lectura**. Muestra ETD,
     destino, pax/crew estimados, servicios pendientes del
     vuelo linkado. Editar esos campos requiere ir al DaySheet
     del día correspondiente (§O3 se respeta: una entrada por
     día, una edición por día).
  5. **Datos en vivo**: el panel fetcha el vuelo linkado en
     tiempo real (no datos congelados) para reflejar cambios
     que el turno de mañana haya hecho.
- **Razón**: respeta §O3 (no colapsa entradas), respeta P3
  (información en el contexto sin redirección), respeta P5
  (EventLog sigue ligado al DaySheet correcto porque no hay
  edición cruzada). Cuatro huecos vacíos en la tarjeta era
  ruido visual puro.
- **Target**: v0.3, bloque Fase 3, después de #6.

### #9 · Convención de comentarios en código

- **Contexto**: instrucción explícita del humano el 2026-04-20
  ("cuando generes o modifiques código, asegúrate de incluir
  anotaciones claras explicando qué hace cada bloque"). Choca
  con la convención base "default to no comments".
- **Firmada**: 2026-04-20 por Antoni (directa, no delegación).
- **Decisión**: este proyecto **sobrescribe** la política
  base. En todo código nuevo o modificado: incluir
  anotaciones a nivel de bloque explicando **qué hace** cada
  bloque (no solo el *por qué*). Aplica a funciones, hooks,
  componentes, handlers de API, lógica compleja.
- **Razón**: proyecto en fase de transferencia de conocimiento
  — el equipo de MALLORCAIR puede necesitar leer el código sin
  Claude al lado. Comentarios explicativos son documentación
  barata.
- **Target**: inmediato. Se añade línea a `CLAUDE.md` para
  que el ingeniero la vea al arrancar cada sesión.

---

### Plantilla

```
### #N · Título corto
- **Firmada**: YYYY-MM-DD por [Nombre].
- **Decisión**: opción [X] del bloque "Opciones".
- **Razón**: 1-2 líneas.
- **Target**: v0.X, sprint "nombre del sprint".
```

---

## Cómo firmar una decisión (humano)

1. Lee las opciones y la recomendación del Director.
2. Si aceptas la recomendación: responde al Director *"firmo #N,
   opción X"*. El Director mueve la entrada a "Firmadas" con la
   plantilla.
3. Si prefieres otra opción: *"firmo #N, opción Y, razón [...]"*.
4. Si no decides hoy: déjala abierta. No es urgente salvo que
   bloquee un sprint (se indica en la entrada).

No hace falta justificar extensamente. Una línea basta. El
Director y el ingeniero tiran del razonamiento implícito.
