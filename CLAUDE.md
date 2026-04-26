# Guía del Desarrollador (CLAUDE.md)

## Tech Stack
- **Next.js 15 (App Router)** + React 19 + TypeScript
- **Turso (libSQL)** + Prisma ORM
- **Tailwind CSS** + Lucide React
- **NextAuth.js** (Credentials)
- **SSE** (EventBus en memoria) para tiempo real.

## Comandos Rápidos
```bash
npm install          # Instalar dependencias
npm run dev          # Servidor de desarrollo
npm run build        # Build para producción
npx prisma generate  # Generar cliente Prisma
npx prisma db push   # Sincronizar esquema (local)
npm run db:seed      # Poblar datos de prueba
```

## Reglas de Oro (LoneWolf Mode)
1. **Zonas Horarias**: 
   - Días operativos (`DaySheet`): Siempre medianoche UTC (`00:00:00.000Z`) calculada según la fecha local de Palma.
   - Vuelos: Horas en **Zulu** (comparar con `getUTCHours()`).
   - Extras/Catering: Horas en **Peninsular** (comparar con `getHours()`).
2. **Importación**: 
   - PDF (Cybermax): Fuente de vuelos.
   - Excel (Extras): Fuente de servicios, se cruza por **Matrícula**.
3. **UI**: Texto en Español, código en Inglés. Centralizar tipos en `src/types/index.ts`.
4. **Commits**: Directos a `main`. Sin burocracia de ramas.

## Estructura
- `src/app/page.tsx`: Dashboard principal.
- `src/components/FlightCard.tsx`: El componente más importante.
- `src/lib/pdfParser.ts` y `excelParser.ts`: Cerebros de importación.
- `src/lib/events.ts`: Bus de eventos para el tiempo real.
