# BD-9.2 (D-BD-9) : image à usage unique pour pg_upgrade 16 → 18 (docs/montee-postgresql-18.md). pg_upgrade a besoin des
# binaires des deux versions ET de la bibliothèque PostGIS dans chacune : on part de l'image cible et on ajoute
# PostgreSQL 16 + PostGIS 3 pour 16 depuis le dépôt PGDG que l'image officielle configure déjà (trixie-pgdg).
# La bibliothèque « postgis-3 » porte le même nom pour toutes les 3.x : le catalogue de l'ancienne base (PostGIS 3.4) se
# charge avec la 3.6, puis l'extension est mise à jour dans la nouvelle (étape 5 du guide). NON CONSTRUITE dans le
# chantier (ni Docker ni accès au dépôt PGDG dans la session) : à construire et éprouver en préproduction.
FROM postgis/postgis:18-3.6
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16 postgresql-16-postgis-3 \
 && rm -rf /var/lib/apt/lists/*
COPY ops/pg18/montee.sh /usr/local/bin/fadi-montee
USER postgres
WORKDIR /var/lib/postgresql
ENTRYPOINT ["sh", "/usr/local/bin/fadi-montee"]
