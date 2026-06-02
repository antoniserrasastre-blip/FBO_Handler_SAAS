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
| Deploy | Servidor propio `sirvici` + Cloudflare Tunnel (`fbo.randomite.space`) |

## Desarrollo

```bash
npm install
npx prisma db push        # Inicializar base de datos
npm run db:seed           # Datos de prueba
npm run dev               # Puerto 3001
```

## Documentación para agentes

Este proyecto sigue el sistema de carpetas lostandlucky (ver `FILOSOFIA.md`). Los cambios y prioridades los marca el usuario en cada sesión; el estado vivo se recoge en `expediente/estado.md` (no hay roadmap especulativo).

→ Empieza por `CLAUDE.md` (router)
→ Mapa del expediente en `expediente/INDICE.md`
→ Estado actual en `expediente/estado.md`

## Notas de zona horaria

- Días operativos (`palmaDay`): medianoche UTC según hora local de Palma
- Vuelos: horas en **Zulu** (`getUTCHours()`)
- Extras/Catering: horas en **Peninsular** (`getHours()`)
