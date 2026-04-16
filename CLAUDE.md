# CLAUDE.md — Developer Guide

## Project Overview

**FBO Handler SAAS** — web platform replacing paper-based flight handling operations for MALLORCAIR S.L. at Palma de Mallorca airport (LEPA/PMI). Replaces the printed "Orden del dia" PDF and Excel extras sheets with a real-time collaborative panel.

See [PLAN.md](./PLAN.md) for the full product specification and roadmap.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React (SVG, no emojis) |
| Database | **Turso (libSQL)** via `@libsql/client` + Prisma ORM with `@prisma/adapter-libsql` |
| Auth | NextAuth.js v4 (credentials provider, JWT sessions) |
| Real-time | Server-Sent Events (in-memory event bus) |
| File parsing | `pdf-parse` (Cybermax PDFs), `xlsx` (Extras Excel) |
| Deployment | Vercel (serverless) |

## Quick Start

```bash
npm install
cp .env.example .env.local    # fill in values below

# Local dev (SQLite):
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev

# Against Turso:
npm run db:setup-turso         # creates tables + seeds users
npm run dev
```

### Environment Variables

```
# Turso (production)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token

# Local dev (SQLite) — only if not using Turso
DATABASE_URL=file:./prisma/dev.db

# Auth
NEXTAUTH_SECRET=<openssl rand -base64 48>
NEXTAUTH_URL=http://localhost:3000
```

### Default Test Users (from seed)

| Email | Password | Role |
|-------|----------|------|
| admin@mallorcair.com | admin123 | ADMIN |
| handler@mallorcair.com | handler123 | HANDLER |
| viewer@mallorcair.com | viewer123 | VIEWER |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Main operations dashboard
│   ├── layout.tsx
│   ├── login/              # Login page
│   ├── import/             # PDF + Excel import (dual tab)
│   ├── flights/new/        # Create flight form
│   ├── historico/          # Past days browser
│   ├── metrics/            # Analytics
│   ├── admin/              # User management (ADMIN only)
│   └── api/
│       ├── auth/[...nextauth]/
│       ├── flights/        # CRUD + [id]/services
│       ├── services/[id]/  # Update/delete services
│       ├── import/         # PDF parse (POST) + save (PUT) + extras/
│       ├── export/         # CSV export
│       ├── events/         # SSE stream
│       ├── users/          # User management
│       ├── daysheets/      # Day listing
│       ├── metrics/        # Metrics data
│       └── setup/          # DB initialization
├── components/
│   ├── FlightCard.tsx      # Core component: collapsible flight card
│   ├── DaySummary.tsx      # Date picker + day stats + connection status
│   ├── ServiceCheckbox.tsx # Service state selector
│   ├── TurnaroundAlert.tsx # Tight turnaround warnings
│   ├── Toast.tsx           # Realtime notifications
│   ├── Icons.tsx           # SVG icon library
│   └── Providers.tsx       # Session provider
├── hooks/
│   └── useEventStream.ts   # React hook for SSE consumption
├── lib/
│   ├── db.ts               # Prisma client with Turso adapter
│   ├── auth.ts             # NextAuth config
│   ├── roles.ts            # requireWriter(), requireAdmin() helpers
│   ├── events.ts           # In-memory SSE event bus
│   ├── pdfParser.ts        # Cybermax "Orden del dia" parser
│   └── excelParser.ts      # MALLORCAIR Extras Excel parser
├── types/
│   └── index.ts            # All state enums, labels, colors, constants
└── middleware.ts            # Auth redirect for protected routes

prisma/
├── schema.prisma           # Database schema (5 tables)
├── seed.ts                 # Test data seeder
└── dev.db                  # Local SQLite (gitignored)

scripts/
├── setup-turso.ts          # Initialize Turso + seed users
└── push-turso-schema.ts    # Push schema DDL to Turso
```

## Database Schema (5 tables)

- **User** — email, hashed password, role (ADMIN/HANDLER/VIEWER)
- **DaySheet** — one per operating date, owns flights
- **Flight** — callsign, registration, aircraft type, origin/destination, ETA/ETD, crew/pax counts (Est + Real), state machine (EXPECTED → ON_GROUND → BOARDING → DISPATCHED), fuel/toilet states, arrival/departure bag/transport states, optional `linkedFlightId` for overnight turnarounds
- **Service** — linked to flight, type (CATERING/DISHES/COOLER_BAG/STORAGE_BAG/LAUNDRY/THERMOS/NEWSPAPERS/CUSTOM), state (PENDING → ARRIVED → DELIVERED), auto-timestamps, NJE reference, target (CREW/PAX)
- **EventLog** — audit trail: action, details, timestamp, linked to flight + user

## Key Domain Concepts

- **Orden del dia**: Daily flight schedule PDF from Cybermax. Parsed via `pdfParser.ts`.
- **Hoja de Extras**: Excel with services per flight. Flights matched by **registration (matricula)**, not callsign. Parsed via `excelParser.ts`.
- **Callsign with asterisk** (`*`): Flight has no contract — must pay on departure.
- **Overnight flights**: Arrive one day, depart next. System creates a linked copy on the next DaySheet.
- **Policia Nacional**: Called for passport control on non-Schengen flights.
- **Guardia Civil**: Called for luggage screening on non-EU arrivals.

## Code Conventions

- Language: TypeScript strict mode
- Path alias: `@/*` maps to `src/*`
- UI text: **Spanish** (matching handlers' working language)
- Code/comments: English
- Components: PascalCase files (`FlightCard.tsx`)
- Database fields: camelCase (Prisma convention)
- All state constants, labels, and colors centralized in `src/types/index.ts`
- Icons: Lucide React SVGs only (no emojis in UI)
- API mutations create EventLog entries for audit trail
- Service state changes auto-set `arrivedAt`/`deliveredAt` timestamps

## Useful Commands

```bash
npm run dev              # Start dev server
npm run build            # Build (runs prisma generate first)
npm run db:push          # Push Prisma schema to local SQLite
npm run db:push-turso    # Push schema to Turso via raw SQL
npm run db:setup-turso   # Initialize Turso DB + seed users
npm run db:seed          # Seed local DB with test data
npm run db:reset         # Hard reset local DB + reseed
```

## Current Status

**Version 0.2** — Core operations panel is functional with:
- Flight CRUD with state machine
- PDF import (Cybermax) with overnight flight handling
- Excel import (Extras) with NJE reference parsing
- Service tracking (3-state: PENDING → ARRIVED → DELIVERED)
- Real-time SSE sync across clients
- Role-based auth (ADMIN/HANDLER/VIEWER)
- CSV export
- History browser and metrics
- PWA-ready

**Not yet implemented**: WebSocket upgrade (currently SSE, in-memory — doesn't scale across Vercel instances), external API integrations (FlightRadar, ESIA).
