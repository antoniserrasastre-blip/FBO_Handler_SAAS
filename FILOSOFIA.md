# Sistema de carpetas para agentes (lostandlucky / Jake Van Clief)

> "Stop building AI agents — use this folder system instead."

## Por qué existe este sistema

El problema fundamental de los agentes de IA es doble: **consumen contexto** (tokens) y **no tienen memoria** entre sesiones.

La solución: **las carpetas son la memoria, no el agente**. El agente es efímero — se abre, trabaja, se cierra. Las carpetas persisten.

## Los 6 principios

1. **Markdown es la base de datos** — ficheros `.md` planos, legibles por humanos y LLMs.
2. **Convenciones de nombres sustituyen queries** — rutas predecibles `dominio/AAAA-MM.md`, el agente sabe la ruta antes de abrir.
3. **Routing por capas** — `CLAUDE.md` → `INDICE.md` → hoja concreta. Carga mínima.
4. **Un fichero = una preocupación** — si el agente solo necesita una parte, el fichero es demasiado grande.
5. **Los comandos/skills son ficheros** — `.claude/skills/<skill>/SKILL.md`, invocables con `/skill`. (En Claude Code 2026 commands y skills se fusionaron; usamos la forma `skills/`.)
6. **El agente lee primero el mapa** — `CLAUDE.md` → `INDICE.md` → `estado.md` antes de actuar.

## Los tres tipos de ficheros

| Tipo | Ejemplo | Para qué |
|---|---|---|
| **Datos** | `expediente/flujos.md` | La información en sí |
| **Mapa** | `INDICE.md`, `estado.md` | Orientar al agente |
| **Capacidades** | `.claude/skills/verificar-expediente/SKILL.md` | Qué sabe hacer el sistema |

## El `estado.md` — el único fichero vivo

Se reescribe constantemente. Es una foto del momento presente: pendientes activos, alertas, punto actual del trabajo. Todos los demás ficheros crecen; este cambia.

## Scripts vs. agentes

**Los números los ponen los scripts, nunca el agente.**

- Script = aritmética, comparación, transformación → determinista, siempre correcto
- Agente = interpretación, cruce de fuentes, veredicto, narrativa → nunca inventa cifras

## Estructura de este proyecto

```
FBO_Handler_SAAS/
├── CLAUDE.md                    ← router (léeme primero)
├── FILOSOFIA.md                 ← este fichero
├── expediente/
│   ├── INDICE.md                ← mapa de todo el expediente
│   ├── estado.md                ← alertas vivas, pendientes activos
│   ├── modelo-datos.md          ← schema v2 (Operator→Aircraft→Visit→Movement)
│   ├── flujos.md                ← workflows principales
│   ├── ui.md                    ← páginas y componentes clave
│   ├── api.md                   ← endpoints REST
│   ├── parsers.md               ← importación (PDF/Excel/GENDEC)
│   └── historial/
│       └── AAAA-MM.md           ← hoja de trabajo mensual
└── .claude/
    ├── agents/
    │   └── fbo-*.md             ← subagentes de dominio (backend/frontend/…)
    └── skills/
        └── <skill>/SKILL.md     ← skills invocables con /skill
```
