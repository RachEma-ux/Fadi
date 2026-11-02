# BD-5.1 (chantier base-donnees) : image de la base avec pgBackRest (archivage WAL continu, PITR). Même PostgreSQL /
# PostGIS que docker-compose.yml ; pgBackRest depuis le dépôt PGDG (>= 2.59.3). NON CONSTRUITE NI ÉPROUVÉE dans le
# chantier (pas de Docker dans la session) : à construire et essayer en préproduction (docs/sauvegarde-pitr.md).
FROM postgis/postgis:16-3.4
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends pgbackrest \
 && rm -rf /var/lib/apt/lists/* \
 && install -d -o postgres -g postgres /var/spool/pgbackrest /var/log/pgbackrest
