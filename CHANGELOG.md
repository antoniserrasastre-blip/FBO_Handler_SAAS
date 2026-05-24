# CHANGELOG.md

> Registro de versiones entregadas, escrito por el Director en
> voz operativa — lo lee MALLORCAIR, no lo lee un ingeniero.
> Una entrada por versión (no por commit). Fecha de release,
> no de empiece.
>
> Para el detalle técnico, `git log` y `ROADMAP.md`.

---

## v0.3 — Modo turno y métricas (2026-05-24)

**Qué ve distinto el handler**: al entrar ficha eligiendo su puesto
(Rampa, Llegadas, Salidas, Runner o Coordinador) y la pantalla se le
reduce a su cola — solo los vuelos y las tareas que le tocan en la
próxima hora. Cada tarjeta lleva su checklist adaptado al vuelo y la
lista se centra sola en el "ahora".

**Qué se puede hacer que antes no**:

- Fichar turno por puesto y ver solo tu cola. Con un toggle vuelves a la
  jornada completa sin cerrar turno.
- Checklist por puesto que se adapta al vuelo (mascotas, policía si viene
  de fuera de Schengen, embarque, pushback...) agrupado por fase
  Llegada / Salida.
- Guardar objetos de la tripulación en la llegada y marcarlos devueltos
  en la salida.
- El coordinador asigna cada vuelo a un pistero; el pistero ve los suyos
  con la marca "Mío" y puede filtrar "Mis vuelos".
- Pantalla de métricas: puntualidad real, pasaje, servicios entregados y
  previsión de los próximos 7 días.
- Buscar origen y destino por ciudad sin saberte el código (escribes
  "parís" y aparece Le Bourget); ya reconoce casi cualquier aeropuerto.
- Servicios de limpieza, escalera y ASU, con la cola de cada puesto
  resaltada.

**Qué no hace todavía, y cuándo llega**:

- Control de equipaje con etiquetas Dymo y estados de bodega/cabina. En v0.4.
- Marcador * para vuelos sin contrato. En v0.4.
- Sección Ayuda con el Manual de Filtro. En v0.4.
- Vista temporal tipo Gantt de los vuelos en tierra. En v0.4.

**Riesgo editorial vivo**: la cola de cada puesto es compartida — si dos
personas fichan el mismo puesto ven la misma lista; el reparto fino entre
ellas lo hace el coordinador a mano, no hay reparto automático todavía.
La sincronía sigue siendo de una sola instancia (mismo límite que v0.2).

**Decisiones firmadas que impactan esta versión**:

- #47 · Fundación del modo turno — fichaje y vista por cola.
- #54 · Dashboard de métricas con previsión a 7 días.
- #56 · Asignación de vuelos coordinador → pistero.

---

## v0.2 — Panel de operaciones (2026-04-20)

**Qué ve distinto el handler**: abre el panel, ve la lista de
vuelos del día como tarjetas de colores, y puede cambiar estado
(esperado → en rampa → embarque → despachado) con un clic.
Cuando llega un PDF de Cybermax, lo sube y aparecen los vuelos
en la lista — deja de haber transcripción a mano.

**Qué se puede hacer que antes no**:

- Subir el PDF del día y tener los vuelos en el panel en
  < 30 segundos. Overnight flights aparecen en los dos días
  correctos.
- Subir la Hoja de Extras (Excel) y ver los servicios asociados
  a cada vuelo por matrícula.
- Marcar servicios (catering, hielo, thermos...) como pendiente
  / llegado / entregado. Cada cambio queda con timestamp.
- Cambiar el estado del vuelo con un clic. El cambio lo ve el
  resto del equipo sin refrescar.
- Tres roles: admin (Antoni), handler (turno), viewer (lectura).
- Exportar el día a CSV.
- Consultar días anteriores en el histórico.
- Instalar la página como app en el móvil (PWA).
- Ver conflicto de parking si dos vuelos coinciden en el mismo
  stand (registro oficial del AIP).

**Qué no hace todavía, y cuándo llega**:

- Vista densa tipo "Orden del día digital" (`/dia`). Próxima.
- Control de equipaje con etiquetas Dymo. En v0.3.
- Timeline Gantt. En v0.3 o v0.4.
- Sección Ayuda con el Manual de Filtro. Spec firmada, próxima.

**Riesgo editorial vivo**: la sincronía real es SSE en memoria —
funciona con una instancia de Vercel. Con dos instancias no
sincroniza. El salto a WebSocket + Redis queda en el ROADMAP.
Si el equipo crece a >5 conexiones simultáneas antes de ese
salto, vemos fricción.

---

## Plantilla para próximas entradas

```
## vX.Y — Titulo corto (YYYY-MM-DD)

**Qué ve distinto el handler**: 2-3 líneas en primera persona.

**Qué se puede hacer que antes no**: lista de capacidades
nuevas con una línea cada una.

**Qué no hace todavía, y cuándo llega**: lista de ausencias
conocidas con fase de ROADMAP que las cubre.

**Riesgo editorial vivo**: 1-2 líneas sobre el mayor riesgo
abierto y cuándo toca mitigarlo.

**Decisiones firmadas que impactan esta versión**:
- #N · Título — efecto en una línea.
```

---

## Reglas de escritura de CHANGELOG (para el Director)

1. **Una versión, una entrada**. Commits van en `git log`.
2. **"Qué ve distinto el handler" primero**. Si no ve nada
   distinto (sprint estructural), decirlo literal:
   *"v0.X.Y — refactor interno. El handler no ve diferencia
   hoy; habilita el v0.X+1 que entrega [...]"*. No disimular.
3. **Sin lenguaje técnico en la sección del handler**. Nada de
   "Prisma", "SSE", "TypeScript" en esa sección. Ese vocabulario
   vive en "Riesgo editorial vivo" si hace falta.
4. **Fecha de release**, no de sprint.
5. **Las decisiones firmadas que impactaron la versión se
   enlazan al final** con su número de `DECISIONS-PENDING.md`.
6. **Máx 400 palabras por entrada**. Si no cabe, la versión era
   demasiado grande y toca retrospectiva.
