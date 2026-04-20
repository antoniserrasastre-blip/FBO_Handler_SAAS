# Cómo activar al Director en una sesión nueva

> Guía corta para el humano. No va en el repo necesariamente —
> es tu cheat sheet.

---

## Opción 1 · Chat nuevo en Claude.ai (recomendado para decisiones de producto)

1. Abre un chat nuevo.
2. Pega como primer mensaje:

   ```
   Eres el Director de Producto y Operaciones del repo FBO_
   (FBO Handler SAAS para MALLORCAIR en LEPA/PMI). Sigue
   estrictamente las reglas de CLAUDEDIRECTOR.md que te paso.
   No escribes código de producción — eso es del ingeniero
   (CLAUDE.md). Tu trabajo es custodiar el flujo del handler
   en turno.

   [pega aquí el contenido de CLAUDEDIRECTOR.md]

   Antes de contestar nada, dime qué ficheros de los rituales
   obligatorios (§5) tienes disponibles en este chat y qué te
   falta.
   ```

3. Adjunta al chat: `CHANGELOG.md`, `DECISIONS-PENDING.md`,
   `ROADMAP.md`, y el último `turnos/TURNO-REPORT-*.md` si
   existe.
4. El Director debería abrir diciendo qué le falta del ritual
   y proponiendo el primer paso.

---

## Opción 2 · Claude Code con file explicit

Si usas Claude Code en el repo:

```bash
claude --append-system-prompt "$(cat CLAUDEDIRECTOR.md)" \
       "Abre sesión de Director. Ejecuta ritual §5."
```

El ingeniero sigue siendo la invocación por defecto
(`claude` sin flags usa `CLAUDE.md`).

---

## Opción 3 · Proyecto dedicado "FBO_ Director" en Claude.ai

Crea un proyecto en Claude.ai con:

- **Instrucciones del proyecto**: el contenido de
  `CLAUDEDIRECTOR.md`.
- **Knowledge**: `PLAN.md`, `ROADMAP.md`, `CLAUDE.md`,
  `CHANGELOG.md`, `DECISIONS-PENDING.md`, los últimos 3-5
  `turnos/TURNO-REPORT-*.md`.

Así cada chat nuevo dentro del proyecto arranca con el
Director cargado, sin tener que pegar el fichero cada vez.

**Actualización del proyecto**: cada vez que el ingeniero cierre
una versión o subas un TURNO-REPORT nuevo, refresca la knowledge
del proyecto. Si no, el Director trabaja con estado viejo.

---

## Señales de que el Director está funcionando

- Abre la sesión diciendo qué leyó del ritual y qué no pudo leer.
- Sus reports siguen el esquema del §7 (Estado → Perspectiva del
  handler → Fricciones → Flags → Propuesta → Riesgo editorial).
- Flaguea 🛑 cuando el ingeniero se sale del ROADMAP o viola un
  Pilar — sin pedirte permiso.
- No te pregunta "¿qué prefieres?" sin antes recomendar. Si lo
  hace, recuérdale el §7 § Propuesta.
- No escribe código. Si le pides código, te redirige a
  `CLAUDE.md`.

## Señales de que NO está funcionando

- Pide permiso para todo ("¿puedo mirar X?"). El Director tiene
  autoridad sobre producto — no pide permiso, propone y firma.
- Usa emojis fuera de los flags.
- Responde en más de 1000 palabras un report de estado.
- Se pone de tu parte contra el ingeniero o al revés. El Director
  defiende el producto.
- Escribe código de producción.
- "Gran pregunta", "Me alegro de que", "Por supuesto". Recordarle
  el §8.

Cuando detectes cualquiera de estas señales, un mensaje corto:
*"Relee §N de CLAUDEDIRECTOR.md y rehaz."* Basta.
