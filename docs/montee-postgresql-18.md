# Montée de version PostgreSQL 16 → 18

Chantier `docs/workstreams/base-donnees/`, tâche **BD-9.2** (constat M10 « instance unique, PG16 »), décision du maître
d'ouvrage **D-BD-9 : PostgreSQL 18, fenêtre annoncée**. Objectifs de reprise D-BD-1 : RPO 15 min, RTO 2 h. Complète
`docs/deploiement.md` (restauration logique) et `docs/sauvegarde-pitr.md` (pgBackRest).

Rien ici n'est appliqué par le dépôt : la montée est faite par l'administrateur, **répétée d'abord sur une copie de la
préproduction**, puis en production pendant une fenêtre annoncée, sur accord explicite. Le fichier Compose de production
(`docker-compose.yml`) reste en 16 tant que la montée n'est pas faite et acceptée ; la bascule passe par une surcharge
explicite, puis par un changement séparé du fichier par défaut (étape 9).

## Livré dans le dépôt

| Élément | Rôle | État |
| --- | --- | --- |
| `ops/pg18/compose.pg18.yml` | Base en `postgis/postgis:18-3.6` sur un **nouveau** volume `fadi-db18` ; `fadi-db` (16) n'est plus monté | Rendu vérifié (`docker compose config`) ; non démarré |
| `ops/pg18/compose.pitr18.yml` | Image pgBackRest sur 18 (empilée après `ops/pgbackrest/compose.pitr.yml`) | Rendu vérifié ; image non construite |
| `ops/pgbackrest/postgres-pgbackrest.Dockerfile` | Image de base en argument `IMAGE_BASE` (16 par défaut, inchangé) | Non construite |
| `ops/pg18/pg-upgrade.Dockerfile`, `ops/pg18/compose.montee.yml`, `ops/pg18/montee.sh` | Conteneur à usage unique : binaires 16 et 18 + PostGIS, `pg_upgrade --check` puis réel | Script éprouvé en 16 → 16 (ci-dessous) ; image non construite |
| `ops/pg18/verifier.sh` | Relevé avant / après, comparaison, liste des `REINDEX` | Éprouvé sur le schéma Fadi (16) |

Image cible : `postgis/postgis:18-3.6` — Debian trixie, PostGIS 3.6.4 d'après
[github.com/postgis/docker-postgis](https://github.com/postgis/docker-postgis) ; Docker Hub publie les étiquettes
`18-3.6` et `18-3.6-alpine` (relevé du 2026-11-02), sans étiquette de version corrective. Empreinte amd64 relevée ce jour
pour `18-3.6` : `sha256:530bb81ad6c5993ae870ea66095d9dc758ef5866007186833f31fb2bebdd5791` (elle change à chaque
reconstruction de l'image). En répétition, relever l'empreinte effectivement tirée
(`docker inspect --format '{{index .RepoDigests 0}}' postgis/postgis:18-3.6`) et l'épingler (`image: postgis/postgis@sha256:…`)
pour que la production reçoive exactement l'image répétée.

## Compatibilité du code avec PostgreSQL 18

Relevé sur le dépôt au 2026-11-02 d'après les notes de version 18.0 (section « Migration to Version 18 ») et les
changements de 17 franchis au passage :

| Changement | Effet sur Fadi | Action |
| --- | --- | --- |
| `initdb` active les sommes de contrôle par défaut ; `pg_upgrade` exige le même réglage | Les volumes créés par l'image 16 n'en ont pas (cluster de répétition : version 0) | `montee.sh` lit `pg_controldata` et passe `--no-data-checksums` ; activer les sommes plus tard = `pg_checksums --enable`, base arrêtée, fenêtre à part |
| Image 18 : volume `/var/lib/postgresql`, données dans `/var/lib/postgresql/18/docker` | Le montage `fadi-db:/var/lib/postgresql/data` ne convient plus | `compose.pg18.yml` (`!override`, Docker Compose ≥ 2.24.4) ; `pg1-path` de pgBackRest à changer |
| Authentification MD5 dépréciée (avertissements) | Les mots de passe des rôles sont posés en clair par `ALTER ROLE … PASSWORD` (`apps/api/src/db/role-passwords.ts`) et chiffrés selon `password_encryption` (SCRAM par défaut). `md5()` de `init.sql` (identifiants) est la fonction de hachage, non concernée | `verifier.sh` compte les mots de passe `md5…` (`roles.md5`, 0 sur la base de répétition) ; vérifier sur l'hôte qu'aucune ligne `md5` n'est dans `pg_hba.conf` |
| Recherche plein texte et `pg_trgm` suivent le fournisseur de collation par défaut | La base est en fournisseur libc (image Docker) : comportement inchangé ; un index trigramme : `geodata_objets_nom_trgm_idx` (BD-8.5) ; aucun `tsvector` | Réindexer quand même l'index trigramme (recommandation des notes de version après `pg_upgrade`) |
| Image Debian bookworm (16-3.4) → trixie (18-3.6) : autre glibc | L'ordre des chaînes de la collation `en_US.utf8` peut changer : avec `pg_upgrade`, les index sur du texte gardent l'ancien ordre | Comparer `datcollversion` et la version de la glibc (`verifier.sh`) ; si elles diffèrent, `REINDEX` des index dépendants (liste : `verifier.sh reindex`, 371 index sur le schéma actuel quand la collation n'est pas C) puis `ALTER DATABASE … REFRESH COLLATION VERSION`. Un export / import reconstruit tout de lui-même |
| `VACUUM` / `ANALYZE` traitent les tables enfants d'un héritage | Aucune table partitionnée ni héritée dans `init.sql` | Aucune |
| `COPY FROM` CSV ne traite plus `\.` comme fin de fichier | Aucun `COPY` dans l'API (recherche `COPY … FROM`, `pg-copy-streams`) | Aucune |
| Tables partitionnées `UNLOGGED` interdites ; droit `RULE` retiré de `GRANT` | Aucune occurrence | Aucune |
| Déclencheurs `AFTER` exécutés avec le rôle actif à la mise en file | `organization_memberships_ended` et clés étrangères différées ; l'API ne change pas de rôle dans une transaction ; la migration fait `SET ROLE fadi_owner` (`schema-migrations.ts`), propriétaire des tables | Aucune attendue ; couvert par les tests d'API sur 18 (étape 9) |
| 17 : opérations de maintenance avec `search_path = pg_catalog, pg_temp` | Index d'expression : `lower()` (catalogue), cast `geography` résolu à la création ; fonctions à `search_path` fixé (migration 0004) | Le `REINDEX` de la répétition le confirme |
| 17 / 18 : colonnes déplacées de `pg_stat_bgwriter`, `pg_stat_wal` | La sonde lit `pg_stat_activity`, `pg_stat_archiver`, `pg_stat_replication`, `pg_stat_wal_receiver`, `pg_replication_slots` | Aucune |
| `pg_upgrade` conserve les statistiques de l'optimiseur (pas les statistiques étendues) | Aucune `CREATE STATISTICS` | `vacuumdb --analyze-in-stages --missing-stats-only` suffit, puis `ANALYZE` complet à froid |
| pgBackRest | 18 pris en charge depuis la 2.55 ; le minimum exigé reste 2.59.3 (`docs/sauvegarde-pitr.md`) | `stanza-upgrade` après la montée |
| Outils clients de l'hôte | Une sauvegarde `pg_dump` 18 ne se relit pas avec `pg_restore` 16 (`ops/restore-drill.sh`, `scripts/verify-restore.sh` lancés sur l'hôte) | Clients 18 du dépôt PGDG sur l'hôte et sur le serveur d'exercice avant la première sauvegarde en 18 |
| Pilote `pg` 8.16 (API) | SCRAM pris en charge ; protocole inchangé | Tests d'API contre 18 (étape 9) |
| E/S asynchrones (`io_method`) | Défaut `worker` ; `io_uring` demanderait de changer le profil seccomp | Laisser le défaut |

## Choix de la méthode

| Méthode | Arrêt d'écriture | Retour arrière | Remarques |
| --- | --- | --- | --- |
| **`pg_upgrade --copy`** (défaut de `montee.sh`) | Copie des fichiers, proportionnelle à la taille | Immédiat : `fadi-db` n'est pas modifié | Deux volumes Docker distincts : seul le mode copie fonctionne (`--link`, `--clone`, `--swap` exigent le même montage). Disque libre ≥ taille de la base |
| `pg_upgrade --link` / `--swap` | Quelques secondes à minutes | Plus de retour sur l'ancien cluster dès que le nouveau a démarré : restauration de la sauvegarde complète | Exige les deux répertoires dans un même volume ; seulement si le disque manque |
| Export / import (`pg_dump` 18 → `pg_restore` dans une base 18 neuve) | Export + import + index, le plus long | Immédiat (ancien volume intact) | Reconstruit tous les index (collation, trigrammes) ; repli si `pg_upgrade --check` échoue |

La répétition mesure la durée de la méthode choisie sur une copie de taille réelle : la fenêtre annoncée est cette
durée, plus les contrôles, plus une marge, et doit rester sous le RTO de 2 h si le retour arrière devient nécessaire.

## Procédure

Notations : `F="-f docker-compose.yml"`, `F18="$F -f ops/pg18/compose.pg18.yml"` (avec l'archivage :
`F18="$F -f ops/pg18/compose.pg18.yml -f ops/pgbackrest/compose.pitr.yml -f ops/pg18/compose.pitr18.yml"`), toujours
`docker compose --env-file .env.deploy …`. Heures annoncées au maître d'ouvrage en heure suisse.

### 0. Répétition (obligatoire, sur une copie)

La préproduction se pilote par `deploy/preprod/fadi-preprod`, dont la garde n'autorise que `postgis/postgis:16-3.4`
(`allowed_images`, testée par `deploy/preprod/tests/run.sh`) : la répétition se fait donc sur un **projet Compose jetable**
(`-p fadi-pg18-essai`), sans port public, alimenté par une copie du volume de préproduction ou par la dernière sauvegarde
restaurée en 16. Dérouler les étapes 1 à 8 à l'identique, chronométrer chacune, et consigner : taille de la base, durée
de `pg_upgrade`, résultat de `verifier.sh comparer`, nombre d'index à reconstruire, durée des `REINDEX`, scénario de bout
en bout passé. Le passage durable de la préproduction en 18 demande ensuite une modification de la garde et de ses
tests (changement séparé, revu).

### 1. Préparer (avant la fenêtre)

- Annoncer la fenêtre (date, heure suisse, durée mesurée en répétition, service interrompu).
- Construire les images : `docker compose $F18 -f ops/pg18/compose.montee.yml build montee` (et `db` si pgBackRest).
- Installer les clients PostgreSQL 18 sur l'hôte (dépôt PGDG) pour les scripts de restauration.
- Vérifier le disque libre (≥ taille de `fadi-db` en mode copie) et la version de Docker Compose (≥ 2.24.4).
- Relever la locale : `docker compose $F exec db psql -U fadi -d fadi -XtAc "SELECT datcollate FROM pg_database WHERE datname = 'template0'"`
  → `MONTEE_LOCALE`.

### 2. Ouvrir la fenêtre et figer

```sh
docker compose --env-file .env.deploy $F stop app proxy            # plus aucune écriture
docker compose --env-file .env.deploy $F run --rm --entrypoint fadi-backup backup db fadi fadi /backups   # dump de départ
SONDE_URL=postgresql://fadi_backup:…@127.0.0.1:…/fadi sh ops/surveillance/sonde-base.sh     # état sain, aucun index invalide
sh ops/pg18/verifier.sh releve "postgresql://fadi:…@…/fadi" /root/fadi-pg18/avant.tsv
```

Avec pgBackRest : `pgbackrest --stanza=fadi --type=full backup` puis `pgbackrest info`. (Accès à la base depuis
l'hôte : `docker compose exec db …` ou un port publié sur 127.0.0.1 le temps de la fenêtre.)

### 3. Arrêter la base 16

`docker compose --env-file .env.deploy $F stop db backup` — arrêt propre (le contrôle de `pg_upgrade` le vérifie).

### 4. `pg_upgrade`

```sh
MONTEE_LOCALE=<relevée> docker compose --env-file .env.deploy $F18 -f ops/pg18/compose.montee.yml run --rm montee controle
MONTEE_LOCALE=<relevée> docker compose --env-file .env.deploy $F18 -f ops/pg18/compose.montee.yml run --rm montee executer
```

`controle` initialise le cluster 18 dans `fadi-db18` (même locale, même réglage des sommes de contrôle, `pg_hba.conf` et
`postgresql.auto.conf` repris), affiche les réglages actifs de `postgresql.conf` qui diffèrent, puis lance
`pg_upgrade --check` : « *Clusters are compatible* » attendu. `executer` affiche la durée. Ne **pas** lancer
`delete_old_cluster.sh` proposé par `pg_upgrade`.

### 5. Démarrer la 18, extensions, statistiques

```sh
docker compose --env-file .env.deploy $F18 up -d db
docker compose --env-file .env.deploy $F18 exec db psql -U fadi -d fadi -v ON_ERROR_STOP=1 \
  -c "ALTER EXTENSION postgis UPDATE" -c "SELECT postgis_extensions_upgrade()" -c "ALTER EXTENSION pg_trgm UPDATE" \
  -c "SELECT postgis_full_version()"
docker compose --env-file .env.deploy $F18 exec db vacuumdb -U fadi --all --analyze-in-stages --missing-stats-only
```

### 6. Index

```sh
sh ops/pg18/verifier.sh releve  "postgresql://fadi:…@…/fadi" /root/fadi-pg18/apres.tsv
sh ops/pg18/verifier.sh comparer /root/fadi-pg18/avant.tsv /root/fadi-pg18/apres.tsv
```

- Toujours : `REINDEX INDEX CONCURRENTLY public.geodata_objets_nom_trgm_idx;`
- Si la comparaison signale « version de collation différente » : exécuter la liste
  `sh ops/pg18/verifier.sh reindex <url>` (un `REINDEX … CONCURRENTLY` par index, hors transaction), puis
  `ALTER DATABASE fadi REFRESH COLLATION VERSION;` (et pour `postgres`, `template1`). Un `REINDEX CONCURRENTLY`
  interrompu laisse un index invalide : la sonde le signale (`index-invalides`), le relancer.
- `COMPARAISON_OK` exigé (comptes de lignes, tables, index, contraintes, fonctions, déclencheurs, migrations identiques ;
  extensions à jour ; aucun index invalide).

### 7. Sauvegardes

- pgBackRest : `pg1-path=/var/lib/postgresql/18/docker` dans `/etc/pgbackrest/pgbackrest.conf`, puis
  `pgbackrest --stanza=fadi stanza-upgrade`, `pgbackrest --stanza=fadi check`, `pgbackrest --stanza=fadi --type=full backup`.
  Les sauvegardes 16 restent dans le dépôt (ancienne version de la base) et ne se restaurent qu'avec des binaires 16.
- Service `backup` (dumps logiques) : image 18 par la surcharge ; premier dump contrôlé, puis `ops/restore-drill.sh` avec
  les clients 18.

### 8. Rouvrir et contrôler

```sh
docker compose --env-file .env.deploy $F18 run --rm migrate      # « Base de départ inchangée ; 0 migration(s) » attendu
docker compose --env-file .env.deploy $F18 up -d
SONDE_URL=… sh ops/surveillance/sonde-base.sh                     # code 0
```

Scénario de bout en bout (README) sur le domaine, `GET /version`, connexion, ouverture d'un projet, recherche GeoData par
nom (index trigramme). Puis `vacuumdb --all --analyze-only` hors pointe. **Point de non-retour** : dès que l'API a écrit
dans la 18, revenir en 16 ferait perdre ces écritures ; la décision de rouvrir se prend sur les contrôles des étapes 6 à 8.

### 9. Après acceptation (changement séparé, revu)

Passer `docker-compose.yml`, `docker-compose.dev.yml`, `deploy/preprod/compose.yml` (et la garde `allowed_images` de
`deploy/preprod/fadi-preprod` avec ses tests), les services PostGIS de `.github/workflows/ci.yml` et l'image par défaut de
`ops/pgbackrest/postgres-pgbackrest.Dockerfile` à `postgis/postgis:18-3.6` (épinglée), avec le volume
`/var/lib/postgresql`. La CI fait alors tourner tous les tests d'API sur 18. Garder le volume `fadi-db` (16) jusqu'à la
première restauration réussie depuis une sauvegarde 18, puis le supprimer sur accord.

## Retour arrière

| Moment | Retour |
| --- | --- |
| Avant l'étape 8 (API fermée) | `docker compose $F18 stop db` puis `docker compose $F up -d` : la 16 repart sur `fadi-db`, intact en mode copie. Aucune perte |
| Après réouverture | Pas de retour simple : export logique de la 18 et import dans une 16 non garanti (syntaxe plus récente). Préférer corriger en avant ; à défaut, restaurer le dump de l'étape 2 et accepter la perte des écritures faites depuis (décision du maître d'ouvrage) |
| Mode `--link` / `--swap` | Restauration de la sauvegarde complète de l'étape 2 (pgBackRest ou dump), durée mesurée par l'exercice mensuel |

Si un standby existe déjà (BD-9.3, `docs/haute-disponibilite.md`), il ne suit pas une montée de version : le reconstruire
par `pg_basebackup` depuis la 18 après l'étape 8 (le plan fait la montée **avant** le standby).

## Répétition dans le chantier (2026-11-02)

- **PostgreSQL 18 non disponible dans la session** : le dépôt PGDG (`apt.postgresql.org`, `www.postgresql.org`) et Docker
  Hub sont refusés par le mandataire réseau, et aucun démon Docker ne tourne. La montée 16 → 18 elle-même n'a donc **pas**
  été répétée : c'est l'objet de l'étape 0.
- Répété avec les binaires 16 locaux : cluster 16 (super-utilisateur `fadi`, sommes de contrôle désactivées), schéma
  Fadi par `migrate.ts` (154 tables, 400 index, 889 contraintes, 10 migrations), puis `montee.sh controle` et `executer`
  en **16 → 16** (`MONTEE_BIN_NOUVEAU` pointé sur les binaires 16) : « *Clusters are compatible* », copie en 17 s,
  `pg_hba.conf` et `postgresql.auto.conf` repris, extensions mises à jour, `vacuumdb --analyze-in-stages`,
  `verifier.sh comparer` → `COMPARAISON_OK`, et l'ancien cluster redémarre intact (mode copie). Ce qui est éprouvé : la
  mécanique des scripts, pas la compatibilité 18.
- `verifier.sh` : relevé de 173 lignes (dont 154 comptes de lignes), comparaison qui détecte une ligne de différence,
  liste `reindex` (371 index dépendants de la collation et l'index trigramme quand la collation n'est pas C).
- Compose : les quatre combinaisons de surcharges rendent la configuration attendue (`docker compose config`) — volume
  `fadi-db18` seul sur `/var/lib/postgresql`, image 18, arguments de construction.
