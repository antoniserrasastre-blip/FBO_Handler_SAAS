---
name: verificar-expediente
description: Audits the expediente/ documentation against the actual source code (the single source of truth) to detect drift, then reports discrepancies by severity. Use before an important work session, after a refactor/migration/feature, or whenever the docs in expediente/ may be stale — e.g. "verifica el expediente", "check the docs against the code", "are the docs still accurate".
argument-hint: "[hoja opcional: modelo-datos|api|parsers|flujos|ui|infraestructura — vacío = todas]"
---

# Verificar expediente

El `expediente/` se pudre: cada cambio de código que no toca el doc lo deja mintiendo, y un doc equivocado es peor que ninguno (te hace actuar mal con confianza). Esta skill **vuelve a derivar cada hoja desde el código** y reporta la deriva.

## Principio rector (no negociable)

1. **El código es la única fuente de verdad.** El contenido actual de cada hoja es SOSPECHOSO hasta verificarlo. No arrastres lo que dice el doc; compruébalo contra el código.
2. **Referencias por símbolo o fichero, NUNCA por número de línea** (los números se pudren en el primer refactor).
3. **No inventes.** Si algo no se puede verificar contra el código (p. ej. el servidor físico, el túnel Cloudflare), márcalo como _(entorno)_, no lo des por hecho.
4. Por defecto esta skill **AUDITA y reporta**. Solo reescribe las hojas si el usuario lo confirma tras ver el informe de deriva.

## Mapa hoja → fuentes de verdad

Si `$ARGUMENTS` nombra una hoja, verifica solo esa. Si está vacío, todas.

| Hoja | Fuentes de verdad a leer | Qué verificar |
|---|---|---|
| `modelo-datos.md` | `prisma/schema.prisma`, `src/types/v2.ts`, `src/types/compat.ts`, `src/types/index.ts`, `src/lib/crypto.ts` | Modelos/campos/FKs/uniques reales, valores de enum (son `String` validados por constantes `as const`), qué se cifra y el formato |
| `api.md` | todos los `src/app/api/**/route.ts`, `src/lib/roles.ts` | Cada path, métodos HTTP exportados, guard real (`requireWriter`/`requireSupervisor`/`requireAdmin`/`SETUP_SECRET`/sesión). Endpoints 503/deprecados |
| `parsers.md` | `src/lib/pdfParser.ts` (fachada pública + SAFE_MODE), `src/lib/pdfParserV2.ts` (motor), `src/lib/excelParser.ts`, `src/lib/gendecParser.ts` | Entrada/salida real, símbolos exportados, heurísticas. GenDec está APARCADO: documentar pero no como flujo activo |
| `flujos.md` | `src/app/api/import/**/route.ts`, `src/lib/v2/upsert.ts`, `src/lib/v2/resolveImportState.ts`, `src/lib/flightUrgency.ts`, `src/lib/serviceCycle.ts`, `src/lib/events.ts`, `src/lib/time.ts`, `src/lib/overdue.ts` | Import two-phase (POST preview / PUT persist), `MOVEMENT_OPERATIONAL_FIELDS` create-only, auto-transición (duplicada en flights y services), zonas horarias (Zulu vs peninsular) |
| `ui.md` | `src/app/**/page.tsx`, `src/components/**`, `src/hooks/**` | Páginas reales y su propósito, componentes VIVOS vs HUÉRFANOS (grep de imports: 0 imports = huérfano, no documentar como producción), chrome `helix/*` |
| `infraestructura.md` | `docker-compose.yml`, `Dockerfile`, `.github/workflows/deploy-sirvici.yml` | Deploy real (Docker vía GitHub Actions self-hosted, auto-deploy en push), contenedor/puertos/volumen/healthcheck. Marcar _(entorno)_ lo no derivable del repo |
| `INDICE.md` | el propio INDICE + `ls` de las rutas que cita | Que cada puntero "dónde está cada cosa" apunte a un fichero/símbolo que EXISTE |
| `estado.md` | `npx vitest run`, `npx tsc --noEmit`, `npx prisma validate` | Cifras de test reales (ficheros/pasados/skipped), tsc/prisma limpios. NO reescribas los "pendientes" (son juicio, no derivables del código) |

## Procedimiento

1. **Fan-out de verificación.** Lanza en paralelo un subagente por hoja en alcance (Agent tool, `general-purpose`), cada uno con el prompt-plantilla de abajo. Cada agente toca una sola hoja → sin conflictos. Para `estado.md`, ejecuta tú mismo `vitest run`/`tsc`/`prisma validate` y compara las cifras.
2. **Agregar.** Junta los informes de deriva. Clasifica cada discrepancia por severidad:
   - 🔴 **Falsa**: el doc afirma algo que el código contradice (enum inexistente, guard equivocado, "X eliminado" cuando vive). Lo más peligroso.
   - 🟡 **Obsoleta**: era cierto, ya no (cifras, rutas movidas, componente ahora huérfano).
   - 🟢 **Incompleta**: cierto pero falta (endpoints sin documentar, campos omitidos).
3. **Sellar la fecha.** Actualiza `_Última actualización:_` en `estado.md` a la fecha de hoy si tocas algo.
4. **Reportar y ofrecer fix.** Presenta una tabla de deriva por hoja+severidad. Pregunta si reescribir las hojas con deriva 🔴/🟡 (el fix es el mismo fan-out pero con instrucción de sobrescribir). No reescribas sin confirmación.

## Prompt-plantilla por agente verificador

> Trabajas en /home/randomite/FBO_Handler_SAAS. Verifica si `expediente/<HOJA>.md` CASA con el código real. REGLA: el código es la única fuente de verdad; el doc es sospechoso. Lee estas fuentes: `<FUENTES de la tabla>`. Para cada afirmación del doc, confírmala o refútala contra el código. Devuelve SOLO un informe de deriva: lista de discrepancias clasificadas en FALSA / OBSOLETA / INCOMPLETA, cada una con el fichero/símbolo real (nunca nº de línea). No reescribas el fichero todavía. Mensaje final = datos crudos para el orquestador.

## Nota de coste

El fan-out completo gasta varios subagentes. Para un chequeo rápido tras un cambio acotado, pasa la hoja concreta como argumento (`/verificar-expediente api`) en vez de auditar todo.
