# ── Build stage ───────────────────────────────────────────────
# Usamos slim (Debian) en lugar de Alpine para mayor compatibilidad con binarios nativos (@libsql)
FROM node:20-slim AS builder

# Instalar dependencias necesarias para Prisma y node-canvas (si fuera necesario)
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias primero (cache de capas)
COPY package.json package-lock.json ./
RUN npm ci

# Prisma: generar cliente antes del build
COPY prisma ./prisma
RUN npx prisma generate

# Copiar el resto del código y construir
COPY . .

# Desactivar telemetría de Next.js
ENV NEXT_TELEMETRY_DISABLED=1

# Build de producción (standalone output)
RUN npx next build

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Instalar openssl para Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar artefactos del build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Schema Prisma (necesario en runtime para `prisma db push`)
COPY --from=builder /app/prisma ./prisma

# Script de migracion V2 ejecutado en el CMD antes del arranque
COPY --from=builder /app/scripts/migrate-v2-schema.mjs ./scripts/migrate-v2-schema.mjs

# Cliente Prisma generado (lo usa la app)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# CLI Prisma en subdirectorio aislado — Next standalone omite las deps no
# importadas en código (@prisma/config, effect, etc.). Instalado aparte para
# no duplicar las prod deps que ya trae el standalone.
RUN mkdir -p /app/_cli && cd /app/_cli && \
    npm init -y >/dev/null && \
    npm install --no-audit --no-fund --silent prisma@6.5.0 && \
    rm -rf /root/.npm

# Directorio para la base de datos SQLite (si se usa local)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs

EXPOSE 3000

# Ejecuta la migracion V2 (idempotente) antes de arrancar Next.js.
# Si falla, el contenedor arranca igualmente — los errores se ven en logs.
# Ejecuta la migracion V2 antes de arrancar Next.js. Logueamos exit code y
# arrancamos el server pase lo que pase — los errores quedan visibles en logs.
CMD ["sh", "-c", "echo '[startup] running migration script...'; node scripts/migrate-v2-schema.mjs; echo \"[startup] migration exit code: $?\"; echo '[startup] starting Next.js server...'; exec node server.js"]
