# Sauvegardes, restauration à un instant précis et supervision de la base

Chantier `docs/workstreams/base-donnees/` (BD-5, constats M9 à M17). Complète `docs/deploiement.md` (procédure de
restauration logique) et `docs/sauvegarde-externe.md` (copie restic vers Swiss Backup). Rien ici n'est appliqué sur le
VPS par le dépôt : chaque étape est faite par l'administrateur, **d'abord en préproduction**, sur accord du maître
d'ouvrage pour la production.

## Où en est-on

| Élément | Avant (audit du 2026-11-02) | Livré dans le dépôt | Reste à faire sur l'hôte |
| --- | --- | --- | --- |
| Perte maximale (RPO) | ≈ 24 h (dump quotidien) | Archivage WAL continu avec pgBackRest : modèles et essai | Installer, régler, consigner le RPO mesuré (D-BD-1) |
| Restauration | Procédure de production incomplète | `docs/deploiement.md` corrigée (BD-1.5) ; exercice `ops/restore-drill.sh` | Timer mensuel, RTO consigné |
| Rétention distante | Illimitée | `ops/backup/restic-retention.sh` (essai à blanc par défaut) | Décisions D-BD-2 / D-BD-3, puis timer |
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

Sans `--appliquer`, essai à blanc (`restic forget --dry-run`) : rien n'est supprimé. L'application exige
`--appliquer` **et** `FADI_RETENTION_VALIDEE=oui`, après les décisions D-BD-2 (politique, durée au registre RGPD) et
D-BD-3 (autorisation). Politique sans valeur par défaut : `RESTIC_KEEP_DAILY`, `RESTIC_KEEP_WEEKLY`,
`RESTIC_KEEP_MONTHLY` (proposition : 14, 8, 12). Purge des dumps de déploiement : `FADI_DUMPS_DEPLOIEMENT_DOSSIER` et
`FADI_DUMPS_DEPLOIEMENT_JOURS`. Essayé sur un dépôt restic local (refus sans politique, essai à blanc, refus sans
validation, application). Les secrets de `.env.deploy` sont à sauvegarder dans un dépôt séparé, chiffré (age ou sops).

## 4. Supervision — `ops/surveillance/sonde-base.sh`

Lecture seule ; une ligne JSON ; code 0 (sain), 1 (seuil dépassé : connexions, transaction longue, verrous en attente,
archivage en retard, index invalides), 2 (base injoignable). À lancer toutes les 5 minutes par un timer qui transmet le
code à Healthchecks. Le conteneur `backup` passe « unhealthy » sans dump depuis 26 h (BD-1.6).

## 5. Rôles et réglages (BD-5.4, BD-5.6)

- Migration en `fadi_migrator` et sauvegarde en `fadi_backup` : mots de passe des rôles fournis hors dépôt
  (`docs/workstreams/users-management/RUNBOOK.md`), puis `DATABASE_MIGRATION_URL` et `PGPASSWORD` du service `backup`
  sur ces rôles ; le super-utilisateur `fadi` ne sert plus qu'à l'amorçage. À faire en préproduction d'abord.
- Réglages mémoire (`shared_buffers`, `effective_cache_size`, `work_mem`) : dimensionnés sur la RAM réellement allouée
  au conteneur, mesurée sur l'hôte ; repère usuel : `shared_buffers` ≈ 25 % de cette RAM. Limites de ressources et
  rotation des journaux Docker comme en préproduction. Sauvegardes locales sur un autre disque que les données.
