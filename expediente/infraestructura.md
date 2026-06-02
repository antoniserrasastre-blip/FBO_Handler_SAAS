# Infraestructura — FBO Handler SaaS

> Fuentes verificadas: `docker-compose.yml`, `Dockerfile`, `.github/workflows/deploy-sirvici.yml`.
> Lo marcado como _(entorno)_ no vive en el repo (servidor, túnel, runner); el resto se deriva del código.

## Producción

| Pieza | Detalle |
|---|---|
| **Servidor** _(entorno)_ | `sirvici` — servidor propio. Deploy en `/srv/fbo-handler-saas` |
| **Dominio público** _(entorno)_ | `fbo.randomite.space` |
| **Exposición** _(entorno)_ | Cloudflare Tunnel (`cloudflared`) — sin IP pública, sin abrir puertos; TLS lo termina Cloudflare |
| **Contenedor** | `fbo-handler` (servicio `fbo` en compose), `restart: unless-stopped` |
| **Puertos** | `3001:3000` (host:contenedor). Next.js corre en 3000 dentro del contenedor |
| **Imagen** | Build multi-stage desde `node:20-slim` (Debian, no Alpine, por `@libsql`/binarios nativos). `prisma generate` en el build |
| **Base de datos** | SQLite en `/app/data/fbo.db`, sobre volumen Docker `fbo_handler_saas_fbo-data` (nombre pineado en compose para sobrevivir renames) |
| **Healthcheck** | `node -e` HTTP a `localhost:3000`; `statusCode < 500` = sano (incluye el 307→/login de NextAuth). No usa wget/curl (ausentes en la imagen runtime) |
| **Config** | `env_file: .env` pasa todas las variables al contenedor; `NODE_ENV=production` |

## Deploy — automático en push a `main`

Workflow `.github/workflows/deploy-sirvici.yml`, dispara en **cada push a `main`** (sin filtro de rutas). Dos jobs:

1. **`verify`** (GitHub-hosted, ubuntu): `npm ci` → `prisma generate` → `tsc --noEmit` → `lint` → `npm test` → tests de `pdf-microservice`. Es la puerta: si falla, el deploy NO corre.
2. **`deploy`** (self-hosted `[self-hosted, sirvici]`, `needs: verify`):
   - `git fetch origin main` + `git reset --hard origin/main` en `/srv/fbo-handler-saas`
   - `docker compose build --no-cache` + `docker compose up -d`
   - **Sync de esquema**: `prisma db push` dentro del contenedor (CLI aislado en `/app/_cli/`), idempotente, en CADA deploy → aplica columnas nuevas sin migración manual. Luego `docker compose restart fbo`
   - `curl` a `localhost:3001` durante 60s como healthcheck

> **Gotcha conocido:** si `verify` falla, el job `deploy` no corre y `/srv` se queda congelado en el commit viejo. Síntoma: código viejo / 404 en prod sin error visible. Confirmar siempre que el deploy verde llegó hasta `/srv`.
>
> **Coste:** al no haber filtro de rutas, un commit de solo-docs también dispara `build --no-cache` (rebuild completo). Por eso conviene agrupar notas de docs con cambios de código.

## Runner self-hosted aislado _(entorno)_

El runner de `sirvici` corre como usuario dedicado `gha-runner` (no como el usuario principal del servidor) para aislar `npm install`/builds del home del usuario. `/srv/fbo-handler-saas` y `/srv/...//.env` son propiedad de `gha-runner`. Cualquier `docker compose` manual hay que correrlo como ese usuario. (Detalle operativo completo fuera del repo.)

## Microservicios auxiliares

| Servicio | Propósito | Notas |
|---|---|---|
| `pdf-microservice/` | Parseo de PDFs NetJets (ALS) → JSON de pasajeros | Sus tests corren en el job `verify`. Consumido por `POST /api/import/netjets-pax` |
| `aena-microservice/` | Cálculo de tasas AENA 2026 | Tests de exactitud pendientes (ver `estado.md`) |

## Acceso y auth

- Usuarios: `https://fbo.randomite.space`.
- Auth: NextAuth Credentials (login/password), sin SSO. Config en `src/lib/auth.ts`, ruta `/api/auth/[...nextauth]`.
- Variables críticas en `.env` del servidor: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SETUP_SECRET`, `PASSPORT_ENCRYPTION_KEY` (perderla = perder el PII cifrado), `SEED_*_PASSWORD`.

## Por qué servidor propio + Cloudflare Tunnel (y no Railway/Vercel)

- PII sensible (pasaportes, fecha de nacimiento) en infraestructura controlada.
- Sin coste por egress ni minutos de CPU.
- Cloudflare Tunnel evita exponer IP pública y simplifica TLS.
