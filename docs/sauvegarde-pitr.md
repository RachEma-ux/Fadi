# Sauvegardes, restauration à un instant précis et supervision de la base

Chantier `docs/workstreams/base-donnees/` (BD-5, constats M9 à M17). Complète `docs/deploiement.md` (procédure de
restauration logique) et `docs/sauvegarde-externe.md` (copie restic vers Swiss Backup). Rien ici n'est appliqué sur le
VPS par le dépôt : chaque étape est faite par l'administrateur, **d'abord en préproduction**, sur accord du maître
d'ouvrage pour la production.

## Où en est-on

| Élément | Avant (audit du 2026-11-02) | Livré dans le dépôt | Reste à faire sur l'hôte |
| --- | --- | --- | --- |
| Perte maximale (RPO) | ≈ 24 h (dump quotidien) | Objectif **15 min** (D-BD-1, 2 novembre 2026) : archivage WAL continu avec pgBackRest (`archive_timeout=60`), sonde à 900 s | Installer, régler, consigner le RPO mesuré |
| Restauration | Procédure de production incomplète | Objectif **RTO 2 h** (D-BD-1) : `docs/deploiement.md` corrigée (BD-1.5) ; exercice `ops/restore-drill.sh` (échec au-delà de 2 h) et timer mensuel `ops/systemd/fadi-restore-drill.*` | Activer le timer, consigner le RTO mesuré |
| Rétention distante | Illimitée | 14 quotidiennes, 8 hebdomadaires, 12 mensuelles (D-BD-2) ; `ops/backup/restic-retention.sh` et timer hebdomadaire distinct `ops/systemd/fadi-backup-retention.*` (D-BD-3) | Inventaire et essai à blanc manuels, puis activer le timer |
| Supervision | Contradictoire, aucune sonde de la base | `ops/surveillance/sonde-base.sh`, sonde du conteneur `backup` (BD-1.6) | Brancher sur Healthchecks |
| Rôles | Super-utilisateur pour migrer et sauvegarder | — | BD-5.4 ci-dessous |

## 1. Restauration à un instant précis (PITR) — pgBackRest

Prouvé dans le chantier par `scripts/validation/pitr-essai.sh` (cluster jetable) : sauvegarde complète, deux écritures,
restauration à l'instant situé entre les deux ; la seconde écriture n'est pas restaurée, en 2 s sur une petite base.

Mise en place (préproduction d'abord) :

1. Version : pgBackRest **2.59.3 au minimum** (dépôt PGDG) — les versions antérieures ont une faiblesse des sous-clés
   de chiffrement (avis du 2026-10-04). Le paquet Ubuntu (2.50) ne convient pas.
2. Configuration : `/etc/pgbackrest/pgbackrest.conf` d'après `ops/pgbackrest/pgbackrest.conf.example` (dépôt S3 en
   Suisse, chiffrement, rétention selon D-BD-2). Identifiants et phrase de passe hors dépôt.
3. Image et réglages : `ops/pgbackrest/postgres-pgbackrest.Dockerfile` et la surcharge `ops/pgbackrest/compose.pitr.yml`
   (`wal_level=replica`, `archive_mode=on`, `archive_command`, `archive_timeout=60` → RPO de l'ordre de la minute).
   Changer `archive_mode` exige un redémarrage de la base : fenêtre annoncée.
4. `pgbackrest --stanza=fadi stanza-create`, puis `check`.
5. Planification (timers de l'hôte) : complète hebdomadaire (`--type=full backup`), différentielle quotidienne
   (`--type=diff backup`). `pgbackrest info` donne l'état.
6. Restaurer à un instant : arrêter `app` et `db`, puis
   `pgbackrest --stanza=fadi --delta --type=time "--target=AAAA-MM-JJ HH:MM:SS+01" --target-action=promote restore`,
   démarrer `db`, contrôler, `docker compose run --rm migrate`, démarrer `app` (même suite que `docs/deploiement.md`).

Les dumps logiques quotidiens et restic restent en place : ils couvrent la conservation longue et une restauration sur
une autre version de PostgreSQL.

## 2. Exercice de restauration mensuel — `ops/restore-drill.sh`

Restaure la dernière sauvegarde (fichier, ou dernier snapshot restic) dans une base `fadi_exercice_*` d'un serveur
**jetable**, rejoue la migration, compte les lignes principales, mesure la durée et appelle Healthchecks (succès ou
`/fail`). La base d'exercice est toujours supprimée. Essayé dans le chantier sur un dump de base de test (5 s).

```sh
DRILL_ADMIN_URL=postgresql://postgres@<serveur-d-exercice>/postgres \
DRILL_HEALTHCHECKS_FICHIER=/etc/fadi/healthchecks-exercice \
sh ops/restore-drill.sh            # dernier snapshot restic (restic.env chargé)
```

Consigner chaque mois la durée affichée : c'est le RTO de la restauration logique (objectif D-BD-1).

## 3. Rétention du dépôt restic — `ops/backup/restic-retention.sh`

Décisions du maître d'ouvrage du 2 novembre 2026 : **D-BD-2** — 14 sauvegardes quotidiennes, 8 hebdomadaires,
12 mensuelles, soit 12 mois au plus (à reporter au registre RGPD) ; **D-BD-3** — `restic forget` / `prune` autorisés
après inventaire et essai à blanc, par un timer distinct de la sauvegarde.

Sans `--appliquer`, le script fait un essai à blanc (`restic forget --dry-run`) : rien n'est supprimé. L'application
exige `--appliquer` **et** `FADI_RETENTION_VALIDEE=oui`, puis lance `prune` et `check`. Politique par défaut 14 / 8 / 12,
modifiable par `RESTIC_KEEP_DAILY`, `RESTIC_KEEP_WEEKLY`, `RESTIC_KEEP_MONTHLY`. Purge des dumps de déploiement :
`FADI_DUMPS_DEPLOIEMENT_DOSSIER` et `FADI_DUMPS_DEPLOIEMENT_JOURS`. Essayé sur un dépôt restic local (politique invalide
refusée, essai à blanc, refus sans validation, application).

Mise en service (administrateur) :

1. Inventaire : `restic snapshots` ; essai à blanc à la main : `sh ops/backup/restic-retention.sh` ; vérifier la liste.
2. Copier `ops/systemd/fadi-backup-retention.service` et `.timer` dans `/etc/systemd/system/`, puis
   `systemctl daemon-reload && systemctl enable --now fadi-backup-retention.timer` (dimanche 05 h 15, heure du VPS).
   Chaque passage rejoue l'essai à blanc avant d'appliquer ; les deux restent dans `journalctl -u fadi-backup-retention`.
3. Exercice de restauration : `/etc/fadi/exercice.env` (`DRILL_ADMIN_URL` d'un serveur jetable,
   `DRILL_HEALTHCHECKS_FICHIER`), puis `systemctl enable --now fadi-restore-drill.timer` (premier dimanche du mois).

Les secrets de `.env.deploy` sont à sauvegarder dans un dépôt séparé, chiffré (age ou sops).

## 4. Supervision — `ops/surveillance/sonde-base.sh`

Lecture seule ; une ligne JSON ; code 0 (sain), 1 (seuil dépassé : connexions, transaction longue, verrous en attente,
archivage en retard, index invalides), 2 (base injoignable). À lancer toutes les 5 minutes par un timer qui transmet le
code à Healthchecks. Le conteneur `backup` passe « unhealthy » sans dump depuis 26 h (BD-1.6).
Depuis BD-9.3, la sonde reconnaît aussi un standby et surveille la réplication (`replication-en-retard` à 600 s,
`standby-absent` avec `SONDE_STANDBYS`, `reception-wal-arretee`, `slot-inactif`) : `docs/haute-disponibilite.md`.
Montée en PostgreSQL 18 (BD-9.2) : `docs/montee-postgresql-18.md`.

## 5. Rôles et réglages (BD-5.4, BD-5.6)

- Migration en `fadi_migrator` et sauvegarde en `fadi_backup` : mots de passe des rôles fournis hors dépôt
  (`docs/workstreams/users-management/RUNBOOK.md`), puis `DATABASE_MIGRATION_URL` et `PGPASSWORD` du service `backup`
  sur ces rôles ; le super-utilisateur `fadi` ne sert plus qu'à l'amorçage. À faire en préproduction d'abord.
- Réglages mémoire (`shared_buffers`, `effective_cache_size`, `work_mem`) : dimensionnés sur la RAM réellement allouée
  au conteneur, mesurée sur l'hôte ; repère usuel : `shared_buffers` ≈ 25 % de cette RAM. Limites de ressources et
  rotation des journaux Docker comme en préproduction. Sauvegardes locales sur un autre disque que les données.

## 6. Fichiers dans le stockage objet (BD-9.1, D-BD-8)

Avec `FADI_STOCKAGE=s3`, ou après la reprise `npm run db:fichiers-vers-objet -- --appliquer`, le contenu des pièces des
étapes (`step_files`), des exports de l'Atelier (`drawing_exports`), des volumes figés (`volumes`) et des photos de la
messagerie (`com_pieces`) n'est **plus dans la base** : la base ne garde que la clé de l'objet, son empreinte SHA-256 et
sa taille. `geodata_fichiers` (et les grilles `geodata_rasters`) restent en base.

Conséquences pour les sauvegardes :

- un dump (`pg_dump`, service `backup`) ou une restauration pgBackRest **ne contient plus ces fichiers** : sans le
  compartiment, une base restaurée cite des objets introuvables ;
- le compartiment doit donc avoir **sa propre protection**, réglée chez l'hébergeur choisi (non choisi à ce jour : rien
  n'est fixé ici) : versionnement des objets, copie (réplication) vers un second site ou un second compartiment, et
  durée de conservation des versions **au moins égale** à celle des sauvegardes de la base (D-BD-2), pour qu'une base
  restaurée à un instant donné retrouve les objets qu'elle cite ;
- les objets sont adressés par leur contenu (`<table>/<2 caractères>/<sha256>`) et jamais réécrits avec un autre
  contenu : une version d'objet correspond toujours à la même empreinte ;
- le balayage des orphelins (`npm run db:fichiers-vers-objet -- --orphelins --appliquer`) supprime des objets que la
  base ne cite plus : avec le versionnement, la suppression laisse une version récupérable pendant la durée de
  conservation ; sans versionnement, ne pas lancer le balayage avec un âge minimal inférieur à la fenêtre de PITR ;
- contrôle après restauration : pour chaque ligne restaurée qui a une `objet_cle`, l'objet doit exister avec la même
  taille (`size`) ; un échantillon peut être relu et comparé à son empreinte (`empreinte`, ou `id` pour `volumes`).
