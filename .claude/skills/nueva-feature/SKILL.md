---
name: nueva-feature
description: Plans and implements a new feature in FBO_Handler_SAAS as a vertical slice, routing each layer to the right fbo-* subagent and enforcing the project's silent-bug guards (role guards, PATCH whitelist, EventBus emit, PII encryption, Zulu-vs-Madrid timezones). Use when adding a feature, a new endpoint, or a new screen end-to-end — "nueva feature", "add a feature", "implement X end to end".
argument-hint: "<descripción breve de la feature>"
---

# Nueva feature (vertical slice)

Una feature se entrega de punta a punta en una rebanada vertical, no en fragmentos. Cada capa tiene una **trampa de bug silencioso** propia de este proyecto; esta skill las hornea en el flujo para que no se olviden (commit directo a `main` = no hay red de PR).

## Paso 0 — Plan antes de tocar código

Diseña el slice mínimo que entrega valor: qué dato, qué endpoint, qué UI, qué test. Si el alcance es ambiguo o tiene trade-offs, usa plan mode / la skill de grilling antes de implementar. Escribe el plan en una frase por capa.

## Las capas (en orden) y su guarda

| # | Capa | Agente | Trampa a vigilar |
|---|---|---|---|
| 1 | **Schema** `prisma/schema.prisma` | `fbo-backend` | El deploy corre `prisma db push` idempotente; no hace falta migración manual, pero el campo debe tener default o ser opcional para no romper filas existentes |
| 2 | **Ruta API** `src/app/api/**/route.ts` | `fbo-backend` | (a) Empieza POST/PATCH/DELETE con `requireWriter()`/`requireSupervisor()`/`requireAdmin()` y retorna su `error`. (b) Si añadiste columna editable, **añádela al `ALLOWED_*_PATCH_FIELDS`** o se ignora en silencio |
| 3 | **EventBus** `src/lib/events.ts` | `fbo-backend` | Toda mutación hace `eventBus.emit(...)` con el tipo correcto y `flightId` = Visit id, o las pantallas de los otros operarios no se actualizan |
| 4 | **PII** (si aplica) `src/lib/crypto.ts` | `fbo-backend` | Pasaporte/nombre/DOB se cifran al escribir, se descifran al leer, con el `*Hash` SHA-256 puesto. Nunca loguear PII en claro |
| 5 | **Tipos** `src/types/index.ts` / `v2.ts` | `fbo-backend` | Centraliza los tipos ahí; no los disperses. Tipos v2 en `v2.ts`, compat en `compat.ts` |
| 6 | **Parsers** (si la feature importa datos) | `fbo-parsers` | Importar de la fachada `pdfParser.ts`, no de `pdfParserV2.ts`. Cruce por matrícula |
| 7 | **UI** `src/components/**`, `src/app/**/page.tsx` | `fbo-frontend` | Respeta el split `/lista` (ejecución hoy) vs `/dia` (panorámica). Consume el evento SSE que emitiste en el paso 3. Texto en español, código en inglés |
| 8 | **Tests** `*.test.ts(x)` | `fbo-test` | El setup fuerza `TZ=Europe/Madrid` a propósito. Cubre zona horaria, rol, whitelist y parser. Un test que pasa solo por la TZ del host es un bug |

## Paso final — Revisar y enviar

1. **Revisar**: invoca `fbo-reviewer` (read-only) sobre el diff. Corrige lo que marque.
2. **Enviar**: invoca `fbo-merge` para correr el gate de verify local (lint+tsc+test) y empujar. Empujar a `main` auto-despliega a producción.
3. **Documentar**: corre `actualizar-expediente` para reflejar la feature en las hojas afectadas, y `cerrar-dia` si terminas la sesión.

## Regla

No saltes capas "para luego". Una mutación sin su emit, o un campo sin su entrada en la whitelist, no falla en tests obvios — falla en silencio en producción con operarios reales delante.
