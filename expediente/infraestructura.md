# Infraestructura — FBO Handler SaaS

## Producción

| Pieza | Detalle |
|---|---|
| **Servidor** | `sirvici` — servidor propio (self-hosted) |
| **Dominio público** | `fbo.randomite.space` |
| **Exposición** | Cloudflare Tunnel (`cloudflared`) — sin IP pública, sin abrir puertos |
| **Puerto local** | 3001 (Next.js en modo prod) |
| **Base de datos** | SQLite local, fichero en `/app/data/fbo.db` (en el servidor) |

## Microservicios auxiliares

| Servicio | Propósito | Ubicación |
|---|---|---|
| `pdf-microservice/` | Parser PDFs NetJets (ALS) | Mismo servidor `sirvici`, también vía Cloudflare Tunnel |
| `aena-microservice/` | Cálculo tasas AENA 2026 | Mismo servidor `sirvici` |

## Deploy

- Commits directos a `main` (Regla de Oro #4).
- En `sirvici`: `git pull` + `npm run build` + restart del proceso (PM2 / systemd según convenga).
- No hay CI/CD de Railway/Vercel. El servidor es propio y el push no auto-despliega.

## Acceso

- Usuarios externos: `https://fbo.randomite.space` (TLS lo termina Cloudflare).
- Auth: NextAuth Credentials (login/password) — no SSO.

## Decisión

**Por qué servidor propio + Cloudflare Tunnel y no Railway/Vercel:**
- Datos sensibles (pasaportes, DoB) en infraestructura controlada.
- Sin coste por egress ni por minutos de CPU.
- Cloudflare Tunnel evita exponer IP pública y simplifica TLS.
