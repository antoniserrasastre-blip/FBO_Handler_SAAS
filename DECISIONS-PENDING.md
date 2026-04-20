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

### #1 · Confirmación al "Despachar" vuelo — ¿modal o un clic?

- **Contexto**: marcar un vuelo como `DISPATCHED` es irreversible
  sin permiso ADMIN. En pista, un tap accidental es posible.
- **Opciones**:
  - **A · Un clic directo** (actual). Pro: respeta P3, P4.
    Contra: un tap fantasma = vuelo despachado por error, con
    EventLog pero sin confirmación.
  - **B · Long-press 600ms**. Pro: un solo gesto, respeta P3/P4,
    evita accidente. Contra: no-discoverable, requiere explicar
    al onboarding del turno.
  - **C · Modal de confirmación**. Pro: sin sorpresas. Contra:
    viola P3 (un clic más). Además de no encajar en rampa con
    guantes.
- **Recomendación Director**: **B**. Long-press en el botón
  "Despachar" + label secundario "Mantén pulsado". Texto
  "Mantén pulsado para despachar" bajo el botón los primeros 7
  días; luego se oculta.
- **Bloquea**: sprint `/dia` si el botón vive también ahí.
- **Firma**: `ABIERTA`.

### #2 · Vista `/dia` — ¿separada del dashboard o reemplazo?

- **Contexto**: ROADMAP pide "pagina aparte, NO el dashboard
  principal". Validar que es eso y no "la vista por defecto
  para el turno de mañana".
- **Opciones**:
  - **A · Ruta separada `/dia`** (lo que dice ROADMAP).
  - **B · Ruta `/dia` + preferencia por usuario** ("qué vista
    abro al loguearme").
- **Recomendación Director**: **A** primero, **B** cuando haya
  TURNO-REPORT que diga que los handlers la prefieren.
  Sobreentrega si se hace ahora.
- **Firma**: `ABIERTA`.

### #3 · Impresión de etiquetas Dymo — ¿desde navegador o servicio local?

- **Contexto**: especificación en `specs/baggage-control.md`.
  Las impresoras Dymo (89×36 / 89×28) exigen drivers o
  intermediario. Browser print CSS `@page` funciona pero
  depende de que el sistema tenga el driver configurado.
- **Opciones**:
  - **A · `window.print()` + CSS `@page`** (navegador).
  - **B · Servicio local Dymo Connect + API**.
  - **C · PDF descargable** que el usuario imprime a mano.
- **Recomendación Director**: **A** en v0.3, **B** si playtest
  de una semana en PMI muestra fricción reproducible. **C** se
  descarta — viola P3 (clic extra).
- **Bloquea**: implementación del `<LabelPrintButton />`.
- **Firma**: `ABIERTA`.

### #4 · Callsign con asterisco — marcador visual

- **Contexto**: CLAUDE.md dice callsign con `*` = vuelo sin
  contrato, cobra al despacho. Hoy no está marcado visualmente
  en `FlightCard`.
- **Opciones**:
  - **A · Icono € junto al callsign**. Pro: reconocible.
  - **B · Borde amarillo en la tarjeta**. Pro: visible a 2m.
    Contra: colisiona con el código de color por estado.
  - **C · Ambos** (icono + tooltip "Sin contrato — cobrar al
    despacho").
- **Recomendación Director**: **C** sin tooltip (P3), solo
  icono € permanente. El copy "Sin contrato" aparece al
  expandir la tarjeta.
- **Firma**: `ABIERTA`.

---

## Firmadas (pendientes de implementación)

*Vacío por ahora. Las decisiones firmadas por el humano se
mueven aquí con fecha y breve razonamiento antes de que el
ingeniero las implemente.*

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
