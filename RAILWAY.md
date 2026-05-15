# Despliegue en Railway

Este branch (`claude/init-railway-servers-DcxAI`) está dedicado a Railway. Despliega **dos services** desde el mismo repo, conectados por la red privada de Railway.

## Arquitectura

```
┌─────────────────────────────┐        ┌─────────────────────────────┐
│  fbo-handler (Next.js)      │  HTTP  │  pdf-microservice (Express) │
│  Dockerfile, raíz           │ ─────► │  Nixpacks, ./pdf-microservice│
│  Pública: dominio Railway   │ (priv) │  Privada: *.railway.internal│
└─────────────────────────────┘        └─────────────────────────────┘
            │
            └──► Turso (libSQL, externo)
```

## Pasos

### 1. Crear proyecto

1. https://railway.app/new → **Deploy from GitHub repo** → seleccionar `antoniserrasastre-blip/fbo_handler_saas`.
2. Branch: `claude/init-railway-servers-DcxAI` (o el que uses para Railway).

### 2. Service A — `fbo-handler` (Next.js)

- **Root Directory**: `/` (raíz del repo)
- **Config**: detecta automáticamente `railway.json` → `Dockerfile`.
- **Variables**: copiar bloque "Service: fbo-handler" de `.env.railway.example`.
- **Networking**:
  - Generar dominio público (`Settings → Networking → Generate Domain`).
  - Habilitar Private Networking.

### 3. Service B — `pdf-microservice`

- **+ New** → **GitHub Repo** (mismo repo).
- **Root Directory**: `pdf-microservice`
- **Config**: detecta `railway.json` → Nixpacks.
- **Variables**: ninguna obligatoria (Railway inyecta `PORT`).
- **Networking**:
  - **NO** generar dominio público (es interno).
  - Habilitar Private Networking.
  - Nombre del service: `pdf-microservice` (debe coincidir con el host en `PDF_MICROSERVICE_URL`).

### 4. Verificar

```bash
# Desde el dashboard, abre logs de cada service.
# fbo-handler debe escuchar en 3000 y responder en su dominio.
# pdf-microservice expone /health en su URL interna.
```

Test rápido del microservicio desde un shell del service Next.js:

```bash
curl http://pdf-microservice.railway.internal:3001/health
# → {"ok":true}
```

## Notas

- El `Dockerfile` actual ya usa `output: standalone` de Next.js, ideal para Railway.
- Turso sigue siendo la BD; Railway no provisiona libSQL.
- El cliente HTTP en Next.js hacia el microservicio aún no existe en `src/`; se añadirá cuando se conecte el flujo de importación.
