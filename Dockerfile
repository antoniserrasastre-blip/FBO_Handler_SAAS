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

# Prisma: cliente generado + schema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Directorio para la base de datos SQLite (si se usa local)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
