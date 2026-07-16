# syntax=docker/dockerfile:1
# ============================================================
# Kinanti Web (Next.js) — multi-stage build → runtime standalone
# ============================================================

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
# whatsapp-web.js menarik puppeteer secara transitif; web TIDAK butuh Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN corepack enable
WORKDIR /app

# ---------- deps: install seluruh dependency (termasuk prisma generate) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# schema dibutuhkan oleh postinstall @prisma/client (prisma generate)
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------- build: next build (butuh devDependencies) ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder env agar build tidak gagal saat import modul yang membaca env.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm prisma generate && pnpm exec next build

# ---------- runner: image runtime ramping ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Prisma CLI global untuk menjalankan `prisma db push` dari setup.sh
RUN npm install -g prisma@6.4.1 && apt-get update \
    && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

# Output standalone Next.js: sudah memaket @prisma/client + query engine (via
# file-tracing) termasuk struktur .pnpm-nya, jadi runtime app tidak butuh copy prisma
# manual. Hanya schema yang ditambahkan untuk keperluan `prisma db push` (CLI global).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma

EXPOSE 3000
# Default: jalankan server. setup.sh dapat override → `prisma db push`.
CMD ["node", "server.js"]
