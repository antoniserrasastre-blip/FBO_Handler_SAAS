# ── Build stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

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
# Saltamos vercel-setup.sh (solo necesario para Turso en Vercel)
RUN npx prisma generate && npx next build

# ── Runtime stage ─────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copiar artefactos del build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma: cliente generado + schema para migraciones
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Directorio para la base de datos SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# SQLite local dentro del contenedor (volumen montado)
ENV DATABASE_URL="file:/app/data/fbo.db"

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
