---
name: auditar-deuda
description: Audits the whole FBO_Handler_SAAS codebase (not just the current diff) for accumulated technical debt — orphan components/exports with zero imports, PATCH-whitelist drift versus the Prisma schema, mutating routes missing an EventBus emit, and plaintext PII paths. Use for a periodic cleanup or when asked to find dead code, tech debt, or unused code. Complements fbo-reviewer, which only sees the diff.
argument-hint: "[categoría opcional: huerfanos|whitelist|emits|pii — vacío = todas]"
---

# Auditar deuda

`fbo-reviewer` mira el diff; esta skill barre **todo el codebase** buscando la deuda que se acumula entre reviews. Hoy ya encontramos 4 componentes huérfanos así. Es read-mostly: reporta, y solo borra/arregla lo seguro con confirmación.

## Las cuatro auditorías (recetas concretas)

### 1. Huérfanos — código muerto (`huerfanos`)
Componentes/módulos sin un solo import.
- Para cada `src/components/*.tsx`, extrae el nombre y `grep -rl "ComponentName" src --include=*.tsx --include=*.ts` excluyendo su propio fichero y tests. 0 resultados = **huérfano** (candidato a borrado).
- Igual para exports de `src/lib/*.ts` poco usados.
- Cuidado: un componente puede usarse vía export-barrel o lazy import — verifica antes de afirmar muerto. Reporta como "candidato", confirma leyendo.

### 2. Drift de whitelist PATCH (`whitelist`)
El bug silencioso de alta frecuencia: campo editable en el schema que falta en el `Set` de la ruta.
- Lista las columnas de cada modelo en `prisma/schema.prisma` que sean editables por usuario (state, counts, parking, fuel/toilet, notes…).
- Compara contra los `ALLOWED_*_PATCH_FIELDS` en `src/app/api/flights/[id]/route.ts`, `services/[id]/route.ts`, etc. (y contra `routeFieldToMovement` en `src/lib/flightView.ts`).
- Reporta campos del schema editables que NO están en ninguna whitelist → no se pueden guardar, sin error.

### 3. Mutaciones sin emit (`emits`)
- Encuentra rutas con handlers mutadores: `grep -rln "export async function \(POST\|PATCH\|DELETE\)" src/app/api`.
- Para cada una, comprueba que hay un `eventBus.emit(` en el fichero. Las que mutan estado relevante y no emiten → las otras pantallas no se enteran (vía SSE). Reporta (algunas mutaciones de sistema/admin legítimamente no emiten — usa criterio).

### 4. PII en claro (`pii`)
- `grep -rn "passportNumber\|fullName\|dateOfBirth\|dobEncrypted" src/app/api` y verifica que cada ESCRITURA pasa por `encrypt()`/`hashPII()` de `src/lib/crypto.ts` y cada lectura por `decrypt()`.
- `grep` de logging (`console.\|eventLog.*action\|details:`) que pueda incluir PII descifrada en claro. (Ver pendiente A3 en `estado.md`: gender/nationality aún se loguean con valor.)

## Salida

1. Informe por categoría, hallazgos rankeados por severidad (PII/whitelist > emit > código muerto).
2. **Cruza con `estado.md`**: si un hallazgo ya está anotado como deuda de diseño, márcalo; si es nuevo, ofrécelo para añadir a la sección de pendientes.
3. **Arreglar**: ofrece borrar los huérfanos confirmados (seguro, reversible por git) en un commit aparte. Los demás (whitelist, emit, PII) requieren cambio de lógica → enrútalos a `fbo-backend` o anótalos en `estado.md` para una sesión dedicada.

## Coste

Cada categoría es independiente. Para un chequeo rápido pasa la categoría (`/auditar-deuda whitelist`). El barrido completo puede paralelizarse con un subagente por categoría.
