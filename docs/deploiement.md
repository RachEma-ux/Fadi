# Déploiement durable de Fadi

Ce document décrit l'hébergement permanent de l'application (URL stable, base persistante, sauvegardes, restauration
vérifiée). Il complète `README.md` (développement) et `.github/workflows/builder-deploy.yml` (instance temporaire de
démonstration : 5 à 30 minutes, base jetable — à garder pour les démonstrations, jamais pour le travail courant).

## Ce qui est livré dans le dépôt

| Élément | Rôle |
|---|---|
| `Dockerfile` | Image de production : l'API (bundle esbuild) **sert aussi l'application construite** (`WEB_DIST`) — un seul processus, un seul port (3001), même origine. Plus de `vite preview` (outil de développement). Le schéma idempotent est appliqué au démarrage (`MIGRATE_ON_START=1`). |
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

Mise à jour : `git pull && docker compose --env-file .env.deploy up -d --build` (le schéma est appliqué au démarrage ;
les migrations sont idempotentes, `apps/api/src/db/init.sql`).

## Sauvegardes

- Le service `backup` écrit chaque jour `fadi-<horodatage>.dump` dans le volume `fadi-backups` et garde
  `BACKUP_KEEP_DAYS` jours (14 par défaut).
- **Copie hors machine** (obligatoire pour qu'une sauvegarde serve à quelque chose) : synchroniser le volume vers un
  stockage externe, par exemple chaque nuit :
  `docker run --rm -v fadi_fadi-backups:/backups -v $HOME/.config/rclone:/config/rclone rclone/rclone sync /backups remote:fadi-backups`
  (ou `rsync` vers une autre machine). Vérifier régulièrement que la copie contient le fichier du jour.
- Sauvegarde à la demande : `docker compose --env-file .env.deploy exec backup fadi-backup db fadi fadi /backups`.
- Les pièces jointes des étapes et les fichiers de l'outil Parcelle sont **dans la base** (`step_files`, `parcels`) :
  une sauvegarde de la base est complète.

## Restauration (procédure)

1. Arrêter l'application : `docker compose --env-file .env.deploy stop app`.
2. Choisir la sauvegarde : `docker compose --env-file .env.deploy exec backup ls -l /backups`.
3. Restaurer dans la base courante (les tables sont recréées) :
   `docker compose --env-file .env.deploy exec backup sh -c 'PGPASSWORD=$PGPASSWORD pg_restore -h db -U fadi -d fadi --clean --if-exists --no-owner --no-privileges --exit-on-error /backups/fadi-<horodatage>.dump'`
   (ou, hors Docker : `PGPASSWORD=… sh scripts/restore.sh <hôte> fadi fadi <fichier.dump>` ; le rôle doit pouvoir créer
   l'extension PostGIS, ou l'extension doit déjà exister dans la base cible).
4. Redémarrer : `docker compose --env-file .env.deploy start app`, puis `curl -s https://$FADI_DOMAIN/health`.
5. Vérifier : se connecter, ouvrir un projet, l'Atelier (révision du modèle, empreinte dans l'en-tête du projet).

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
| `MIGRATE_ON_START` | `1` : applique `init.sql` au démarrage. |
| `TRUST_PROXY` | `1` derrière un relais TLS (adresse du client, cookie `secure`). |
| `NODE_ENV` | `production` : cookie de session `secure` (HTTPS obligatoire). |
| `PORT` | 3001 par défaut. |
| `AUTH_RATE_LIMIT`, `API_RATE_LIMIT` | Ne servent qu'aux tests ; ne pas définir en production (20 / 15 min et 300 / min). |

## Ce que l'instance temporaire ne fait pas

`Builder Deploy` démarre une base jetable, applique le schéma, sert l'application par l'API et publie une URL
`*.trycloudflare.com` pour la durée choisie ; rien n'est conservé ensuite. Elle sert aux démonstrations et aux revues ;
le travail de projet se fait sur l'instance durable.
