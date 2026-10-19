# syntax=docker/dockerfile:1
# Fadi — image de recette de la préproduction : dépôt complet, dépendances de développement, build, Chromium de Playwright
# (même version que package-lock.json), client PostgreSQL 16. Jamais déployée : sert à `fadi-preprod check|e2e|backup|restore-check`.
FROM mcr.microsoft.com/playwright:v1.56.0-noble
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/domain-model/package.json packages/domain-model/
COPY packages/core-geometry/package.json packages/core-geometry/
COPY packages/atelier-model/package.json packages/atelier-model/
COPY packages/planche-model/package.json packages/planche-model/
COPY packages/geometry-exact/package.json packages/geometry-exact/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && chown -R pwuser:pwuser /work
USER pwuser
CMD ["node", "--version"]
