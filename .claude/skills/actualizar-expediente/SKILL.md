---
name: actualizar-expediente
description: Updates the affected expediente/ sheets and estado.md to match recent code changes, reading the git diff. Use after finishing a feature, refactor, migration or bugfix, or when asked to sync the docs/expediente with the code. The preventive pair of verificar-expediente — write the doc delta as you cause it, so the docs never rot.
argument-hint: "[rango git opcional, p.ej. main...HEAD o un hash — vacío = cambios desde main]"
---

# Actualizar expediente

Cuando cambias código sin tocar el doc, el doc empieza a mentir. Esta skill cierra ese hueco: lee QUÉ cambió y reescribe **solo las secciones afectadas** de las hojas correspondientes.

## Principio rector

1. **El código es la fuente de verdad.** Documenta lo que el código hace AHORA, no lo que pretendías.
2. **Solo el delta.** No reescribas hojas enteras; toca únicamente las secciones que el cambio afecta. Para reconstrucción total, usa `verificar-expediente`.
3. **Refs por símbolo o fichero, nunca por número de línea.**
4. **No inventes.** Lo no derivable del repo se marca _(entorno)_.

## Procedimiento

1. **Ver qué cambió.** Ejecuta `git diff --stat <rango>` y `git diff <rango>` (rango por defecto: `main...HEAD`; si estás en `main`, usa los últimos commits relevantes con `git log --oneline -10` y `git show`). Lista los ficheros de código tocados.
2. **Mapear fichero → hoja.** Para cada fichero cambiado, identifica la hoja afectada:

   | Cambió… | Actualiza… |
   |---|---|
   | `prisma/schema.prisma`, `src/types/**`, `src/lib/crypto.ts` | `modelo-datos.md` |
   | `src/app/api/**/route.ts`, `src/lib/roles.ts` | `api.md` |
   | `src/lib/pdfParser*.ts`, `src/lib/excelParser.ts`, `src/lib/gendecParser.ts` | `parsers.md` |
   | `src/app/api/import/**`, `src/lib/v2/**`, `flightUrgency.ts`, `serviceCycle.ts`, `events.ts`, `time.ts`, `overdue.ts` | `flujos.md` |
   | `src/app/**/page.tsx`, `src/components/**`, `src/hooks/**` | `ui.md` |
   | `docker-compose.yml`, `Dockerfile`, `.github/workflows/**` | `infraestructura.md` |
   | Cualquier ruta/símbolo nuevo citado en `INDICE.md` | `INDICE.md` (verifica que los punteros siguen existiendo) |

3. **Reescribir el delta.** Para cada hoja afectada, lee la sección relevante, contrástala con el código nuevo, y corrige/añade. Si el cambio introdujo un endpoint, campo, enum, componente o flujo nuevo → documéntalo. Si eliminó algo → quítalo del doc.
4. **estado.md.** Si los tests cambiaron, actualiza las cifras ejecutando `npx vitest run` (ficheros/pasados/skipped) y confirma `npx tsc --noEmit` / `npx prisma validate`. Sella `_Última actualización:_` con la fecha de hoy (`date +%F`). NO toques los "pendientes" salvo que el cambio resuelva uno (entonces táchalo).
5. **Reportar.** Resume qué hojas tocaste y por qué. Los cambios de solo-docs no disparan deploy (`paths-ignore`), así que se pueden commitear y empujar sin coste.

## Cuándo NO usar esta skill

- Para detectar deriva sin haber cambiado nada → `verificar-expediente`.
- Para cerrar la sesión (pendientes/historial) → `cerrar-dia`.
