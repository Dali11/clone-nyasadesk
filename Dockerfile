# ── Build stage: install all deps, build the Vite SPA ────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Vite bakes VITE_* into the SPA at build time; Coolify passes these as build args
ARG VITE_APP_URL
ARG VITE_FACEBOOK_APP_ID
ARG VITE_NOTIF_REPLY_SECRET
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_URL
ARG VITE_VAPID_PUBLIC_KEY
ENV VITE_APP_URL=$VITE_APP_URL VITE_FACEBOOK_APP_ID=$VITE_FACEBOOK_APP_ID VITE_NOTF_REPLY_SECRET=$VITE_NOTF_REPLY_SECRET VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY

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
