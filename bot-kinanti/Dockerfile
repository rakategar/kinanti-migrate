# syntax=docker/dockerfile:1
# ============================================================
# Kinanti Bot (WhatsApp) — Express + whatsapp-web.js + Chromium
# ============================================================
FROM node:20-bookworm-slim

# Chromium sistem untuk whatsapp-web.js (puppeteer TIDAK unduh chromium sendiri).
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
      openssl \
      curl \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Install dependency (schema untuk prisma generate di postinstall)
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --prod=false && pnpm prisma generate

# Sumber aplikasi
COPY . .

EXPOSE 4000
# dumb-init agar sinyal (SIGTERM) diteruskan ke node & chromium child.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
