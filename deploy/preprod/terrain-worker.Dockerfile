# Travailleur du terrain haute résolution (plan v1.0, lot TER-03, décision TER-D6) : l'image applicative du même commit,
# plus GDAL épinglé (Debian bookworm 3.6.2) et les grilles PROJ de la distribution. Lancé à la demande (profil « terrain »),
# jamais dans une requête interactive ; la version exacte de GDAL est relevée dans chaque traitement.
ARG APP_IMAGE
FROM ${APP_IMAGE}
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends "gdal-bin=3.6.2+dfsg-1*" proj-data \
 && rm -rf /var/lib/apt/lists/*
USER node
ENTRYPOINT ["node", "apps/api/dist/geodata-terrain.js"]
