# Guía del Desarrollador (CLAUDE.md)

## Tech Stack
- **Next.js 15 (App Router)** + React 19 + TypeScript
- **SQLite local** (`file:/app/data/fbo.db`) + Prisma ORM
- **Tailwind CSS** + Lucide React
- **NextAuth.js** (Credentials)
- **SSE** (EventBus en memoria) para tiempo real

## Comandos Rápidos
```bash
npm install          # Instalar dependencias
npm run dev          # Servidor de desarrollo (puerto 3001 en prod)
npm run build        # Build para producción
npx prisma generate  # Generar cliente Prisma
npx prisma db push   # Sincronizar esquema (idempotente)
npm run db:seed      # Poblar datos de prueba
```

## Reglas de Oro (LoneWolf Mode)
1. **Zonas Horarias**:
   - Días operativos (`palmaDay`): Medianoche UTC calculada según fecha local de Palma.
   - Vuelos: Horas en **Zulu** (`getUTCHours()`).
   - Extras/Catering: Horas en **Peninsular** (`getHours()`).
2. **Importación**:
   - PDF (Cybermax): Fuente de vuelos. Parser real en `pdfParserV2.ts` (V1 eliminado).
   - Excel (Extras): Fuente de servicios, se cruza por **Matrícula**.
3. **UI**: Texto en Español, código en Inglés. Tipos nuevos en `src/types/v2.ts` (`FlightView`); compat antiguo en `src/types/compat.ts`.
4. **Commits**: Directos a `main`. Sin burocracia de ramas.

## Estructura
- `src/app/page.tsx`: Dashboard principal.
- `src/components/FlightCard.tsx`: Componente más importante.
- `src/lib/pdfParserV2.ts` y `excelParser.ts`: Cerebros de importación.
- `src/lib/flightView.ts`: Adapter Visit+Movements → FlightView.
- `src/lib/events.ts`: Bus de eventos SSE.
