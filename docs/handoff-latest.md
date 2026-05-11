# Handoff: post-merge de fixes diagnóstico → Sirvici local

**Repo:** `antoniserrasastre-blip/fbo_handler_saas`
**PR merged a main:** [#22](https://github.com/antoniserrasastre-blip/FBO_Handler_SAAS/pull/22)
**Branch de origen:** `claude/diagnose-repo-eNCxq` (mergeado directo, sin esperar CI)
**Deploy target:** Sirvici, self-hosted, `/home/randomite/FBO_Handler_SAAS` (ruta del runner)

## Qué se acaba de mergear

Fixes de 9 issues (#12–#20) + #21 cerrado como `not_planned`. Detalles en el cuerpo del PR #22 y en los 4 commits agrupados:

- `6a8c61f` test infra
- `bab6368` timezone fixes (#15, #16)
- `b120c8d` API hardening (#12, #13, #14, #17, #18)
- `54d7dd4` ESLint + CI + ADR (#19, #20)

ADR sobre EventBus: `docs/adr/0001-eventbus-single-container.md`.

## Lo que el próximo agente probablemente tiene que hacer

### 1. Verificar que el deploy a Sirvici pasó
- Workflow: `.github/workflows/deploy-sirvici.yml`
- Cambio relevante: ahora hay un job `verify` (lint+typecheck+test+build) que corre **antes** del job `deploy`. Si `verify` falla, el deploy no sale.
- Si el deploy quedó atascado en `verify`, leer los logs del workflow en GitHub Actions.

### 2. Configurar env vars en Sirvici (CRÍTICO antes del primer deploy)

El usuario quedó avisado pero conviene confirmar. En `/home/randomite/FBO_Handler_SAAS/.env`:

```
SETUP_SECRET=<algo random; openssl rand -hex 32>
# Opcional, sólo si se quiere re-sembrar usuarios:
SEED_ADMIN_PASSWORD=
SEED_HANDLER_PASSWORD=
SEED_VIEWER_PASSWORD=
```

Si `SETUP_SECRET` no está, `/api/setup` devuelve 500 — esto es intencional, no un bug.

### 3. Smoke tests post-deploy

```bash
# Debe devolver 401:
curl -i https://fbo.randomite.space/api/setup

# Debe devolver 401 (no la respuesta exitosa anterior):
curl -i -H "X-Setup-Secret: wrong" https://fbo.randomite.space/api/setup

# Login con un user real y comprobar:
# - DELETE /api/daysheets?all=true con SUPERVISOR → 403
# - POST /api/flights/<id>/services con VIEWER → 403
# - Subir un PDF >10 MB a /api/import → 413
```

### 4. Verificar fix de TurnaroundAlert en producción
Las alertas de llegada/salida ahora se calculan en UTC. En CEST había desfase de 2h. Confirmar con un vuelo real cuyo ETA esté cerca de la hora actual.

## Cosas que NO se hicieron

- **Issue #21 cerrado como `not_planned`**: la premisa era incorrecta, `pdfParser.ts` es fachada activa de V2, no dead code. Si en algún momento se quiere unificar, hay que rediseñar el contrato con los consumidores (`api/import/route.ts`, `app/import/page.tsx`).
- **29 warnings de ESLint** quedan pendientes (variables no usadas, algunos `any`). No bloquean CI. Limpieza para otra sesión.
- **No hay tests E2E ni del navegador**. Sólo unit + integration de rutas con mocks. Si se quiere Playwright, es trabajo aparte.
- **No me suscribí al PR** (el usuario mergeó directo, no había review loop).

## Reglas del repo que el próximo agente debe respetar

Resumen para no perder tiempo releyendo `CLAUDE.md`:

- **DaySheet date → siempre `palmaDayUtc()` de `src/lib/time.ts`**. No usar `setHours(0,0,0,0)`. Si algún PR nuevo lo introduce, ESLint **no** lo cazará — añade un test o un rule custom si pasa otra vez.
- **Flight ETA/ETD están en Zulu (UTC)**. Comparar con `getUTCHours()`.
- **Extras/catering en Peninsular (Madrid local)**. Comparar con `getHours()`. `src/lib/overdue.ts` es el patrón correcto.
- **PATCH de Flight/Service usan whitelist explícita**. Si añades un campo nuevo al schema y quieres que sea editable, hay que añadirlo a `ALLOWED_FLIGHT_PATCH_FIELDS` o `ALLOWED_SERVICE_PATCH_FIELDS`. Si no, se ignorará silenciosamente.

## Skills sugeridas para la próxima sesión

- **`/diagnose`** si el deploy peta o aparece un bug en prod tras estos cambios. Hay tests para reproducir muchos casos.
- **`/improve-codebase-architecture`** si se decide atacar los 29 warnings de ESLint sistemáticamente o reducir acoplamiento (p.ej. el componente `FlightCard.tsx` tiene 1100+ líneas).
- **`/to-prd`** si el usuario quiere planificar el siguiente bloque grande (p.ej. multi-instancia → cambiar EventBus, ver ADR 0001).

## Pista de contexto para el agente

El usuario es "LoneWolf" (su frase en CLAUDE.md): commits directos a `main`, sin burocracia. Suele decir "hazlo tu todo" y no quiere quizzes innecesarios. Para él, eficiencia > proceso. Acepta merge directo. **No** abrir PRs especulativos sin que los pida.
