# CLAUDE.md — FBO Handler SaaS

**FBO Handler SaaS** es una plataforma de gestión operativa en tiempo real para un FBO (Fixed Base Operator) en Palma de Mallorca. Gestiona vuelos de aviación privada: importación de PDFs operacionales, seguimiento de servicios, checklist por puesto y exportación de tasas AENA.

## Lee el mapa primero

→ `expediente/INDICE.md` — qué hay en el expediente y dónde está cada cosa
→ `expediente/estado.md` — pendientes activos y alertas del momento presente

## Stack

Next.js 15 (App Router) + React 19 + TypeScript + SQLite (Prisma) + Tailwind + NextAuth + SSE

## Comandos rápidos

```bash
npm run dev          # Servidor de desarrollo (puerto 3001 en prod)
npm run build        # Build para producción
npx prisma db push   # Sincronizar esquema (idempotente)
npm run db:seed      # Poblar datos de prueba
```

## Reglas de Oro

1. **Zonas horarias** — `palmaDay`: medianoche UTC según fecha local Palma. Vuelos: **Zulu** (`getUTCHours()`). Extras/Catering: **Peninsular** (`getHours()`).
2. **Importación** — PDF Cybermax: fuente de vuelos (`pdfParserV2.ts`, V1 eliminado). Excel Mallorcair: fuente de servicios, cruce por **Matrícula**.
3. **UI** — Texto visible en Español, código en Inglés. Tipos nuevos en `src/types/v2.ts`; compat legacy en `src/types/compat.ts`.
4. **Commits** — Directos a `main`. Sin burocracia de ramas.
5. **PATCH whitelist** — Todo endpoint PUT/PATCH tiene whitelist explícita de campos permitidos. No hacer blind spread de body.
6. **EventBus** — Cada cambio de estado relevante emite evento SSE (`src/lib/events.ts`). No olvidar el emit.

## Filosofía de agente

Este proyecto sigue el sistema de carpetas lostandlucky. Ver `FILOSOFIA.md`.
