# Despliegue en Railway

Configuración para desplegar **dos services** desde este repo, conectados por la
red privada de Railway. Pensado como entorno de emergencia mientras Sirvici
(self-hosted runner) está caído.

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

### 1. Apuntar Railway a la rama correcta

El proyecto `resplendent-warmth` ya existe en Railway, vinculado al repo
`antoniserrasastre-blip/fbo_handler_saas`. Antes de redesplegar:

1. Railway dashboard → service `FBO_Handler_SAAS` → Settings → Source.
2. **Branch** debe ser `main` (o la rama actual de desarrollo si se cambió).
3. Save.

### 2. Service A — `FBO_Handler_SAAS` (Next.js, ya existe)

- **Root Directory**: `/` (raíz del repo)
- **Config**: detecta automáticamente `railway.json` → `Dockerfile`.
- **Healthcheck**: `/api/health` (endpoint público sin auth).
- **Variables** (Settings → Variables): copiar bloque "Service: fbo-handler"
  de `.env.railway.example`. Las críticas son:
  - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
  - `DATABASE_URL="file:./dev.db"` (placeholder para Prisma CLI durante el build)
  - `NEXTAUTH_SECRET` (genera con `openssl rand -base64 48`)
  - `NEXTAUTH_URL="https://${{RAILWAY_PUBLIC_DOMAIN}}"`
  - `PASSPORT_ENCRYPTION_KEY` (genera con `openssl rand -base64 32`).
    **Si ya hay PII cifrada en otra instancia, usa la MISMA clave**.
  - `OPENSKY_DISABLED="true"` (poller en stub durante v2)
  - `PDF_MICROSERVICE_URL="http://pdf-microservice.railway.internal:3001"`
    (añadir tras crear el service B)
- **Networking**:
  - Generar dominio público (`Settings → Networking → Generate Domain`).
  - Habilitar Private Networking.

### 3. Service B — `pdf-microservice` (nuevo)

- **+ New Service** → **GitHub Repo** (mismo repo).
- **Root Directory**: `pdf-microservice`
- **Config**: detecta `pdf-microservice/railway.json` → Nixpacks.
- **Variables**: ninguna obligatoria (Railway inyecta `PORT`).
- **Networking**:
  - **NO** generar dominio público (es interno).
  - Habilitar Private Networking.
  - Nombre del service: `pdf-microservice` (exacto — debe coincidir con el host
    en `PDF_MICROSERVICE_URL`).

### 4. Redesplegar

Tras configurar todas las variables, en el service `FBO_Handler_SAAS`:
Deployments → Redeploy latest.

## Verificación

```bash
# Healthcheck público (sin auth):
curl https://<dominio-railway>/api/health
# → {"ok":true}

# Login: abrir https://<dominio-railway>/ en navegador → redirige a /login.

# Microservicio PDF (desde shell del service Next.js):
curl http://pdf-microservice.railway.internal:3001/health
# → {"ok":true}
```

## Primer admin

Tras el primer deploy con Turso conectado, la BD existirá pero estará vacía.
Para crear el admin inicial:

1. Asegúrate de tener `SETUP_SECRET` y `SEED_*_PASSWORD` en las variables.
2. Llama al endpoint protegido:

   ```bash
   curl -H "X-Setup-Secret: $SETUP_SECRET" https://<dominio-railway>/api/setup
   ```

3. Login en la UI con `admin@example.com` y el password seedeado.

## Notas

- El `Dockerfile` usa `output: standalone` de Next.js, ideal para Railway.
- Turso sigue siendo la BD; Railway no provisiona libSQL.
- `instrumentation.ts` ejecuta una migración idempotente de estados al boot,
  con try/catch — si Turso no responde, log error y la app sigue arrancando.
- El worker de OpenSky live tracking se desactiva con `OPENSKY_DISABLED=true`
  para no ensuciar logs ni gastar cuota mientras está en stub.
- Sirvici (self-hosted runner) sigue intacto. Si vuelve online, su deploy
  job continuará disparándose en cada push a `main`; mientras esté caído,
  falla en segundos sin tocar la BD.
