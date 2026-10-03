# syntax=docker/dockerfile:1
# Fadi — image de production : l'API (bundle esbuild) sert aussi l'application construite (WEB_DIST).
# Un seul processus, un seul port (3001) ; la base PostgreSQL/PostGIS est un service à part (voir docker-compose.yml).

FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/domain-model/package.json packages/domain-model/
COPY packages/core-geometry/package.json packages/core-geometry/
COPY packages/atelier-model/package.json packages/atelier-model/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS deps
WORKDIR /src
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/domain-model/package.json packages/domain-model/
COPY packages/core-geometry/package.json packages/core-geometry/
COPY packages/atelier-model/package.json packages/atelier-model/
# Dépendances d'exécution de l'API seulement (le bundle garde les paquets npm externes ; @node-rs/argon2 est natif).
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3001 \
    WEB_DIST=/app/apps/web/dist \
    MIGRATE_ON_START=1 \
    TRUST_PROXY=1
WORKDIR /app
# Même disposition que le dépôt : certaines dépendances de l'API ne sont pas hissées (apps/api/node_modules).
COPY --from=deps /src/node_modules ./node_modules
COPY --from=deps /src/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /src/apps/api/package.json ./apps/api/package.json
COPY --from=build /src/apps/api/dist ./apps/api/dist
COPY --from=build /src/apps/web/dist ./apps/web/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://localhost:3001/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/api/dist/server.js"]
