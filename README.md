# FBO Handler SaaS

Plataforma web para gestión de operaciones de handling en aviación general (FBO). Centraliza la importación y seguimiento de vuelos, servicios extra y reporting operativo para un FBO en el aeropuerto de Palma de Mallorca (LEPA/PMI).

## Funcionalidad principal

- **Importación de vuelos** desde PDFs operacionales (Cybermax) y hojas Excel de extras
- **Dashboard de vuelos**: vista diaria de llegadas/salidas con estado en tiempo real (SSE)
- **Gestión de extras y catering** cruzados por matrícula de aeronave
- **Microservicio AENA** para cálculo de tasas aeroportuarias (aterrizaje, estacionamiento, pasajeros, ruido)
- **Autenticación** con NextAuth.js y gestión de usuarios

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| Backend | SQLite + Prisma ORM, NextAuth.js, SSE (EventBus) |
| Microservicio tasas | Node.js + Express (AENA 2026) |
| Deploy | Railway + Docker |

## Desarrollo

```bash
npm install
npx prisma db push        # Inicializar base de datos
npm run db:seed           # Datos de prueba
npm run dev               # Puerto 3001
```

## Estructura

```
src/
├── app/page.tsx              # Dashboard principal
├── components/FlightCard.tsx # Componente central de vuelo
├── lib/pdfParserV2.ts        # Parser de PDFs operacionales
├── lib/excelParser.ts        # Parser de extras Excel
├── lib/flightView.ts         # Adapter Visit+Movements → FlightView
└── lib/events.ts             # Bus de eventos SSE
aena-microservice/            # Cálculo de tasas AENA 2026
docs/                         # Documentación técnica (ADRs, handoffs)
```

## Notas de zona horaria

- Días operativos (`palmaDay`): medianoche UTC según hora local de Palma
- Vuelos: horas en **Zulu** (`getUTCHours()`)
- Extras/Catering: horas en **Peninsular** (`getHours()`)
