# syntax=docker/dockerfile:1
# Fadi — image de recette de la préproduction : dépôt complet, dépendances de développement, Chromium de Playwright
# (même version que package-lock.json), client PostgreSQL 16. Jamais déployée : sert à `fadi-preprod check|e2e|backup|restore-check`.
#
# Durée de construction : les builds (apps/api/dist, apps/web/dist) ne sont pas refaits ici, ils sont copiés de l'image
# applicative du même commit (contexte `app` = `service:app` dans compose.yml, seul contexte admis par la garde ; Compose
# la construit d'abord) ; tout est installé directement en pwuser (COPY --chown) : aucune couche `chown -R` ne recopie
# node_modules à chaque commit.
FROM mcr.microsoft.com/playwright:v1.56.0-noble
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-16 \
 && rm -rf /var/lib/apt/lists/*
# Points de montage des volumes fadi-preprod-out et fadi-preprod-backups : un volume neuf hérite de ce propriétaire et
# de ces droits (pwuser seul).
RUN install -d -o pwuser -g pwuser -m 0755 /work \
 && install -d -o pwuser -g pwuser -m 0700 /out /backups
WORKDIR /work
USER pwuser
COPY --chown=pwuser:pwuser package.json package-lock.json ./
COPY --chown=pwuser:pwuser apps/api/package.json apps/api/
COPY --chown=pwuser:pwuser apps/web/package.json apps/web/
COPY --chown=pwuser:pwuser packages/domain-model/package.json packages/domain-model/
COPY --chown=pwuser:pwuser packages/core-geometry/package.json packages/core-geometry/
COPY --chown=pwuser:pwuser packages/atelier-model/package.json packages/atelier-model/
COPY --chown=pwuser:pwuser packages/planche-model/package.json packages/planche-model/
COPY --chown=pwuser:pwuser packages/sandbox-planche-model/package.json packages/sandbox-planche-model/
COPY --chown=pwuser:pwuser packages/geodata-model/package.json packages/geodata-model/
COPY --chown=pwuser:pwuser packages/geometry-exact/package.json packages/geometry-exact/
RUN npm ci --no-audit --no-fund
COPY --chown=pwuser:pwuser . .
COPY --from=app --chown=pwuser:pwuser /app/apps/api/dist apps/api/dist
COPY --from=app --chown=pwuser:pwuser /app/apps/web/dist apps/web/dist
CMD ["node", "--version"]
