# ── Build stage: install all deps, build the Vite SPA ────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Runtime stage: prod deps only + built SPA + API routes + adapter ─────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY api ./api
COPY server.js ./

EXPOSE 3000
# Coolify sets PORT; server.js reads it (default 3000)
CMD ["node", "server.js"]
