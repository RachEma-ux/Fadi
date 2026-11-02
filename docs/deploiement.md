# Déploiement durable de Fadi

Ce document décrit l'hébergement permanent de l'application (URL stable, base persistante, sauvegardes, restauration
vérifiée). Il complète `README.md` (développement) et `.github/workflows/builder-deploy.yml` (instance temporaire de
démonstration : 5 à 30 minutes, base jetable — à garder pour les démonstrations, jamais pour le travail courant).

## Ce qui est livré dans le dépôt

| Élément | Rôle |
|---|---|
| `Dockerfile` | Image de production : l'API (bundle esbuild) **sert aussi l'application construite** (`WEB_DIST`) — un seul processus, un seul port (3001), même origine. Plus de `vite preview` (outil de développement). Le schéma idempotent est appliqué par le service à usage unique `migrate` (`MIGRATE_ONLY=1`, D-7), jamais par l'API. |
| `docker-compose.yml` | Application + base PostgreSQL/PostGIS persistante (volume `fadi-db`) + relais HTTPS automatique (Caddy, Let's Encrypt) + service de **sauvegarde quotidienne** (`pg_dump` format custom, 14 jours conservés, volume `fadi-backups`). |
| `.env.deploy.example` | Les deux réglages à fournir : `FADI_DOMAIN`, `POSTGRES_PASSWORD`. |
| `scripts/backup.sh` | Sauvegarde horodatée + rotation. |
| `scripts/restore.sh` | Restauration d'une sauvegarde dans une base. |
| `scripts/verify-restore.sh` | **Procédure de restauration vérifiée** : sauvegarde → restauration dans une base neuve → comparaison du nombre de lignes de chaque table et des empreintes de contenu (étapes, magasin de l'Atelier). Exécutée par la CI à chaque commit sur la base remplie par le scénario de bout en bout. |
| `GET /health` | Sonde : `{"status":"ok","db":"ok"}` si l'API et sa base répondent, 503 sinon (orchestrateur, client). |
| CI, job `image` | Construit l'image, la démarre contre une base PostGIS et sonde `/health`, `/accueil` (repli SPA), `/projects` (401) et une inscription. |

## Ce qui reste à faire par vous (hors du dépôt)

L'hébergement permanent demande ce que ce dépôt ne peut pas contenir : **une machine ou un service d'hébergement, un nom
de domaine et leurs identifiants**. Trois voies, par ordre de simplicité :

1. **Une machine (VPS) avec Docker** — recommandé pour commencer : tout est dans `docker-compose.yml`.
2. **Un hébergeur de conteneurs** (Fly.io, Railway, Render, Scaleway Containers…) : construire l'image du `Dockerfile`,
   fournir `DATABASE_URL` d'une base PostgreSQL **avec PostGIS** gérée par l'hébergeur, `WEB_ORIGIN`, `TRUST_PROXY=1`,
   `NODE_ENV=production`. Les sauvegardes sont alors celles de la base gérée (vérifier qu'elles existent et tester une
   restauration avec `scripts/restore.sh`).
3. **Un serveur d'agence existant** avec PostgreSQL : `npm ci && npm run build`, puis
   `WEB_DIST=apps/web/dist DATABASE_URL=… WEB_ORIGIN=https://… NODE_ENV=production TRUST_PROXY=1 MIGRATE_ON_START=1 node apps/api/dist/server.js`
   derrière un relais TLS (Caddy, nginx), sous un gestionnaire de service (systemd).

## Mise en route (voie 1 : machine avec Docker)

```sh
git clone https://github.com/RachEma-ux/Fadi.git && cd Fadi
cp .env.deploy.example .env.deploy     # FADI_DOMAIN (le domaine pointe sur cette machine, ports 80/443 ouverts), POSTGRES_PASSWORD
docker compose --env-file .env.deploy up -d --build
docker compose --env-file .env.deploy ps          # db (healthy), app, proxy, backup
curl -s https://$FADI_DOMAIN/health                 # {"status":"ok","db":"ok"}
```

Première connexion : créer un compte (`/inscription`), importer l'exemple P.118 depuis l'accueil, ou importer une
archive JSON (« Importer ») exportée d'une instance précédente — y compris d'une instance temporaire Builder Deploy
avant sa fin (« Outils du projet » → « Sauvegarder projet JSON »).

Mise à jour : faire d'abord une sauvegarde à la demande (section suivante), puis
`git pull && docker compose --env-file .env.deploy up -d --build`. Le service `migrate` applique le schéma
(`apps/api/src/db/init.sql`, idempotent) avant le démarrage de `app`. Il échoue vite plutôt que de bloquer le trafic si une
transaction longue tient un verrou (`lock_timeout` de 3 s, quatre essais espacés : BD-1.1) ; dans ce cas, relancer la mise à
jour. Le déploiement automatique de la production (`deploy/prod/fadi-prod-auto`) fait lui-même ce dump préalable.

## Sauvegardes

- Le service `backup` écrit chaque jour `fadi-<horodatage>.dump` dans le volume `fadi-backups` et garde
  `BACKUP_KEEP_DAYS` jours (14 par défaut).
- **Copie hors machine** (obligatoire pour qu'une sauvegarde serve à quelque chose) : synchroniser le volume vers un
  stockage externe, par exemple chaque nuit :
  `docker run --rm -v fadi_fadi-backups:/backups -v $HOME/.config/rclone:/config/rclone rclone/rclone sync /backups remote:fadi-backups`
  (ou `rsync` vers une autre machine). Vérifier régulièrement que la copie contient le fichier du jour.
- Sauvegarde à la demande : `docker compose --env-file .env.deploy exec backup fadi-backup db fadi fadi /backups`.
- Les pièces jointes des étapes et les fichiers de l'outil Parcelle sont **dans la base** (`step_files`, `parcels`) :
  une sauvegarde de la base est complète — **tant que** `FADI_STOCKAGE` vaut `base` et qu'aucune reprise vers le stockage
  objet n'a été faite. Sinon, le compartiment S3 est sauvegardé à part (section « Stockage des fichiers » ci-dessous et
  `docs/sauvegarde-pitr.md`, § 6).

## Restauration (procédure)

La restauration se fait **d'abord dans une base de contrôle**, jamais directement dans la base courante, puis la migration
est rejouée : `pg_restore --no-privileges` recrée les tables sans les droits des rôles D-7, et l'application échouerait
sinon sur « permission denied » (`fadi_app`). Corrigé le 2026-11-02 (chantier base-donnees, BD-1.5).

1. **Garder l'état actuel**, même cassé (il peut servir à comprendre l'incident) :
   `docker compose --env-file .env.deploy exec backup fadi-backup db fadi fadi /backups`.
2. Choisir la sauvegarde : `docker compose --env-file .env.deploy exec backup ls -l /backups`.
3. **Restaurer dans une base de contrôle** `fadi_restore` :
   `docker compose --env-file .env.deploy exec backup sh -c 'PGPASSWORD=$PGPASSWORD dropdb -h db -U fadi --if-exists fadi_restore && PGPASSWORD=$PGPASSWORD createdb -h db -U fadi fadi_restore && PGPASSWORD=$PGPASSWORD pg_restore -h db -U fadi -d fadi_restore --no-owner --no-privileges --exit-on-error /backups/fadi-<horodatage>.dump'`
   (hors Docker : `PGPASSWORD=… sh scripts/restore.sh <hôte> fadi fadi_restore <fichier.dump>` ; le rôle doit pouvoir créer
   l'extension PostGIS, ou l'extension doit déjà exister dans la base cible).
4. **Contrôler** la base restaurée : nombre de projets et d'utilisateurs, date de la dernière révision Studio, par exemple
   `psql -h db -U fadi -d fadi_restore -c "SELECT count(*) FROM projects; SELECT max(created_at) FROM studio_revisions;"`.
5. **Basculer** : arrêter l'application (`docker compose --env-file .env.deploy stop app`), puis renommer les bases depuis
   la base `postgres` (aucune connexion ouverte sur `fadi`) :
   `psql -h db -U fadi -d postgres -c "ALTER DATABASE fadi RENAME TO fadi_avant_restauration; ALTER DATABASE fadi_restore RENAME TO fadi;"`.
6. **Rejouer la migration** (propriété `fadi_owner` et droits D-7 rétablis) :
   `docker compose --env-file .env.deploy run --rm migrate`.
7. Redémarrer : `docker compose --env-file .env.deploy start app`, puis `curl -s https://$FADI_DOMAIN/health`.
8. Vérifier : se connecter, ouvrir un projet, l'Atelier (révision du modèle, empreinte dans l'en-tête du projet).
   Supprimer `fadi_avant_restauration` seulement une fois la reprise acceptée.

Noter l'heure de début et de fin de la procédure : c'est le temps de remise en service (RTO) réellement mesuré.

Pour **répéter la vérification** sans toucher à la base courante (restauration dans une base de contrôle, comparaison
ligne à ligne et par empreintes) :
`PGPASSWORD=… sh scripts/verify-restore.sh <hôte> fadi fadi fadi_restore_check` — c'est ce que la CI exécute à chaque
commit sur la base remplie par le scénario (projets, étapes, modèle de l'Atelier, pièces jointes, commentaires).

## Variables d'environnement de l'API

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | PostgreSQL avec PostGIS. |
| `WEB_ORIGIN` | Origine(s) autorisée(s) (CORS) — l'URL publique ; sans effet quand l'application est servie par l'API elle-même. |
| `WEB_DIST` | Dossier du build de l'application à servir (`apps/web/dist`) ; absent = API seule (développement avec `vite`). |
| `MIGRATE_ON_START` | `1` : applique `init.sql` au démarrage. `docker-compose.yml` le met à `0` pour `app` : la migration passe par le service à usage unique `migrate` (`MIGRATE_ONLY=1`), seul à recevoir `DATABASE_MIGRATION_URL` (D-7). |
| `TRUST_PROXY` | `1` derrière un relais TLS (adresse du client, cookie `secure`). |
| `NODE_ENV` | `production` : cookie de session `secure` (HTTPS obligatoire). |
| `PORT` | 3001 par défaut. |
| `PG_POOL_MAX`, `PG_CONNECTION_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS`, `PG_IDLE_IN_TRANSACTION_MS`, `PG_POOL_IDLE_MS`, `PG_APP_NAME` | Pool PostgreSQL de l'API (BD-1.2) : 10 connexions, 10 s pour obtenir une connexion, 60 s par instruction, 60 s pour une transaction inactive, nom `fadi-api` dans `pg_stat_activity`. `0` = pas de délai (retour arrière sans nouvelle image). |
| `CONTACT_RETENTION_ENABLED` | Effacement des contacts sans compte 2 ans après la clôture de leurs projets (OP-2). Activé en production par `docker-compose.yml` (D-BD-4) ; `0` le coupe. |
| `FADI_RETENTION_SESSIONS_JOURS`, `FADI_RETENTION_JETONS_JOURS`, `FADI_RETENTION_COURRIELS_JOURS` | Purge horaire des sessions expirées ou révoquées, des jetons de compte expirés ou utilisés et des courriels traités (BD-6.1). Vide : 30 jours (D-BD-11) ; un entier change la durée (2 jours au moins pour les courriels) ; `desactive` coupe la catégorie. |
| `FADI_STOCKAGE` | Où sont écrits les nouveaux fichiers (pièces des étapes, exports de l'Atelier, volumes figés, photos de la messagerie) : `base` (défaut, colonne bytea) ou `s3` (stockage objet). Toute autre valeur : refus de démarrer. |
| `FADI_S3_ENDPOINT`, `FADI_S3_REGION`, `FADI_S3_BUCKET`, `FADI_S3_ACCESS_KEY_ID`, `FADI_S3_SECRET_ACCESS_KEY` | Service compatible S3 (BD-9.1, D-BD-8 : hébergé en Suisse ; hébergeur non choisi, aucune valeur dans le dépôt). Tout ou rien : obligatoires avec `FADI_STOCKAGE=s3`, et à garder renseignées tant que des fichiers sont dans le compartiment, même revenu à `base`. `https://` exigé en production. |
| `FADI_S3_FORCE_PATH_STYLE` | `1` (défaut) : adressage `https://hote/compartiment/cle` ; `0` : sous-domaine du compartiment, si l'hébergeur l'exige. |
| `AUTH_RATE_LIMIT`, `API_RATE_LIMIT` | Ne servent qu'aux tests ; ne pas définir en production (20 / 15 min et 300 / min). |

## Stockage des fichiers (BD-9.1, D-BD-8)

Par défaut, les fichiers restent dans la base (`bytea`). La décision D-BD-8 du maître d'ouvrage prévoit un stockage
objet compatible S3 hébergé en Suisse ; le dépôt fournit le mécanisme, pas l'hébergeur ni ses identifiants.

Tables concernées : `step_files`, `drawing_exports`, `volumes`, `com_pieces`. **Jamais** `geodata_fichiers` (archivage
en base exigé, D-GD-29) ni `geodata_rasters`. Une ligne porte soit son contenu, soit une clé d'objet
(`objet_cle`, adressée par le contenu : `<table>/<2 caractères>/<sha256>`), avec l'empreinte SHA-256 et la taille en
base (migration `0011_fichiers_stockage_objet.sql`). La lecture suit l'emplacement réel : l'API sert un objet en flux
(sans le garder en mémoire), vérifié contre la taille et l'empreinte de la base ; un écart interrompt la réponse.

Mise en service, d'abord en préproduction avec un compartiment qui lui est propre :

1. Créer le compartiment chez l'hébergeur retenu, avec **versionnement et réplication** (`docs/sauvegarde-pitr.md`, § 6),
   et une clé d'accès limitée à ce compartiment (lecture, écriture, liste, suppression).
2. Renseigner les cinq variables `FADI_S3_*` (et `FADI_S3_FORCE_PATH_STYLE` si besoin) dans `.env.deploy`
   (préproduction : `PREPROD_FADI_S3_*` dans le fichier d'environnement de l'hôte), laisser `FADI_STOCKAGE=base`, redéployer :
   l'API valide la configuration au démarrage (message explicite et refus de démarrer sinon) et l'affiche dans son journal.
3. Essai de la reprise (rien n'est écrit ; vérifie aussi l'accès au compartiment) :
   `docker compose --env-file .env.deploy exec app node apps/api/dist/fichiers-vers-objet.js`
   (développement : `npm run db:fichiers-vers-objet`).
4. Passer `FADI_STOCKAGE=s3` et redéployer : les nouveaux fichiers vont dans le compartiment.
5. Reprise des fichiers existants, hors pic, par lots : `… fichiers-vers-objet.js --appliquer [--lot 50] [--max N]
   [--table step_files]`. Chaque objet déposé est relu en entier (taille et SHA-256) avant que le bytea soit vidé, par un
   `UPDATE` conditionné au même contenu ; une ligne incohérente est signalée et laissée en base. Relançable à volonté.
6. Valider les contraintes posées `NOT VALID` par la migration : `npm run db:validate-constraints`.
7. Périodiquement : `… fichiers-vers-objet.js --orphelins` (essai), puis `--orphelins --appliquer` pour supprimer les
   objets qu'aucune ligne ne cite plus (fichiers supprimés, projets effacés, volumes nettoyés) et plus anciens que
   `--age-heures` (24 par défaut). Les objets ne sont jamais supprimés avec leur ligne, car deux lignes au même contenu
   partagent un objet. Tant que ce balayage n'a pas tourné, un fichier effacé dans l'application reste dans le compartiment.

Retour arrière :

- Revenir à `FADI_STOCKAGE=base` (sans nouvelle image) : les nouveaux fichiers retournent en base ; les fichiers déjà
  déplacés restent lus dans le compartiment, d'où l'obligation de garder les variables `FADI_S3_*`.
- Revenir à une **image antérieure à BD-9.1** n'est possible que si aucune ligne n'a de clé d'objet
  (`SELECT count(*) FROM step_files WHERE objet_cle IS NOT NULL`, idem pour les trois autres tables) : l'ancien code
  attend `content` partout. Il n'existe pas encore d'outil de rapatriement (objet → bytea) : à écrire avant d'en avoir
  besoin si ce retour doit rester possible.

Limites connues : l'export d'archive d'un projet (pièces des étapes, volumes Studio) relit les objets et les intègre à
l'archive (format inchangé, toujours en mémoire, constat Q6 non traité ici) ; à l'import, ces fichiers sont écrits selon
`FADI_STOCKAGE` (volumes Studio : toujours en base, la reprise les déplace ensuite). Les outils de comparaison
`scripts/migration/migration-lib.mjs` et `scripts/validation/studio-compare-restore.mjs` lisent `content` et ne
connaissent pas encore les fichiers déplacés.

## Ce que l'instance temporaire ne fait pas

`Builder Deploy` démarre une base jetable, applique le schéma, sert l'application par l'API et publie une URL
`*.trycloudflare.com` pour la durée choisie ; rien n'est conservé ensuite. Elle sert aux démonstrations et aux revues ;
le travail de projet se fait sur l'instance durable.
