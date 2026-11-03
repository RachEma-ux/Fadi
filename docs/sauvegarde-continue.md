# Sauvegarde continue de la base de production (PITR)

Chantier [bases-de-donnees](workstreams/bases-de-donnees/PLAN.md), lots BD-7 et BD-8. Décision du maître d'ouvrage du
3 novembre 2026 sur les objectifs proposés :

| Objectif | Valeur retenue | Avant |
|---|---|---|
| Perte de données maximale (RPO) | **15 minutes** | jusqu'à 24 heures (copie quotidienne seulement) |
| Remise en service (RTO) | **4 heures**, serveur reconstruit compris | non mesurée |
| Fenêtre de restauration à un instant donné | **14 jours** | aucune |
| Copies quotidiennes conservées hors du VPS | 5 dernières, 14 quotidiennes, 8 hebdomadaires, 12 mensuelles | tout conservé, sans fin |
| Restauration de contrôle | **chaque mois**, automatique, durée mesurée | manuelle, ponctuelle |

Le coût de stockage réel (taille de la base et volume quotidien du journal) n'est pas encore connu : il est mesuré le
premier mois (`restic stats`), avant de revoir, si besoin, la conservation.

## Fonctionnement

1. **Journal des transactions archivé en continu.** Le conteneur `db` (docker-compose.yml) copie chaque segment du
   journal dans le volume `fadi-pitr` (`ops/pitr/archiver-wal.sh`, au plus 5 minutes d'attente : `archive_timeout`).
2. **Envoi hors du VPS toutes les 10 minutes** (`fadi-pitr envoi`, minuteur `fadi-pitr-envoi.timer`) : copie chiffrée
   restic (étiquette `pitr`) dans le dépôt Swiss Backup déjà utilisé par la sauvegarde quotidienne. L'envoi échoue
   (unité systemd en échec) si l'archivage est bloqué.
3. **Sauvegarde de base chaque nuit** (`fadi-pitr base`, 02:40 heure du serveur) : `pg_basebackup` par le rôle
   `fadi_backup` (lecture et réplication, aucun droit d'écriture) ; deux bases gardées sur le VPS, 14 jours hors du VPS.
4. **Restauration de contrôle le 1ᵉʳ de chaque mois** (`fadi-pitr verifier`) : le dernier instantané hors VPS est
   restauré dans un conteneur jetable, sans réseau, jusqu'à la fin du journal ; durée totale relevée dans
   `/mnt/data/fadi/pitr/derniere-verification.json`. La base en service n'est jamais touchée.
5. **Rétention réelle chaque dimanche** (`fadi-backup-retention`) : politique ci-dessus, puis `restic prune` et
   `restic check` ; suspendue si aucune copie quotidienne de moins de 48 heures n'existe.
6. **Moindre privilège (D-7, BD-8)** : la migration applique le schéma sous `fadi_migrator` (`SET ROLE`) et ne garde
   l'administrateur que pour l'amorçage (extension de statistiques, droits de `fadi_backup`) ; le service `backup`
   sauvegarde par le socket de la base avec `fadi_backup`, sans mot de passe du super-utilisateur. Aucun nouveau secret.

La copie quotidienne existante (`fadi-backup-offsite`, `pg_dump`) continue à l'identique : c'est la seconde copie,
indépendante de la première.

## Mise en service (une fois, administrateur du VPS)

Après la Release qui contient ces fichiers, sur le VPS, avec le commit complet de cette Release :

```sh
curl -fsSLO https://raw.githubusercontent.com/RachEma-ux/Fadi/<commit>/deploy/prod/installation/installer-bases.sh
sudo bash installer-bases.sh <commit>
```

Le script vérifie le commit et l'empreinte de chaque fichier, installe les outils et les minuteurs, recrée **les seuls**
conteneurs `db` et `backup` (quelques secondes d'indisponibilité de la base ; l'application se reconnecte seule ; les
données ne sont pas touchées), contrôle l'archivage, fait la première sauvegarde de base et la première restauration de
contrôle, puis active les minuteurs. Il s'arrête à la première anomalie.

Pourquoi un geste de l'administrateur : les outils du VPS (`/usr/local/sbin`, unités systemd) ne sont installés que par
lui, avec des empreintes relues (même règle que `fadi-prod-auto`), et la mise en production automatique ne redémarre
jamais la base (`--no-deps`).

Contrôles : `sudo /usr/local/sbin/fadi-pitr etat` ; `systemctl list-timers 'fadi-pitr-*' fadi-backup-retention.timer` ;
`journalctl -u fadi-pitr-envoi -n 20`.

## Restauration réelle (incident) — accord explicite du maître d'ouvrage

Jamais automatique. Principe : l'ancienne base est **mise de côté, jamais effacée** ; la base est reconstruite depuis une
sauvegarde de base et le journal, jusqu'à l'instant choisi.

1. Choisir l'instant à retrouver (heure suisse → UTC) et arrêter l'application : `docker compose -p app stop app`.
2. Restaurer l'instantané `pitr` postérieur à cet instant : `restic snapshots --tag pitr`, puis
   `restic restore <id> --tag pitr --target /mnt/data/fadi/restauration`.
3. Essayer d'abord sur une copie : `fadi-pitr verifier` fait la même opération dans un conteneur jetable ; le script
   `ops/pitr/verifier-restauration.sh <base> <journal> <travail> '<instant UTC>'` accepte un instant.
4. Arrêter `db`, déplacer le contenu du volume `fadi-db` dans un dossier daté, extraire `base.tar.gz` de la base choisie
   dans le volume, créer `recovery.signal` et ajouter à `postgresql.auto.conf` :
   `restore_command = 'cp /pitr-restauree/wal/%f %p'`, `recovery_target_time = '<instant UTC>'`,
   `recovery_target_action = 'promote'` (le dossier restauré monté en lecture seule dans `db`).
5. Démarrer `db`, attendre la fin de la reprise (`SELECT pg_is_in_recovery()` → `f`), contrôler, puis démarrer `app`.
6. Retirer les deux réglages de reprise et consigner l'incident.

## Essais

`ops/pitr/tests/run.sh` (CI : *Consolidated deployment tooling*, dans l'image `postgis/postgis:16-3.4`) : syntaxe et
empreintes de l'installeur, politique de rétention, archivage (copie, reprise identique, refus d'un contenu différent),
sauvegarde de base par `fadi_backup` et rétention locale, restauration jusqu'à la fin du journal et à un instant donné.
Non essayé hors du VPS : l'envoi vers Swiss Backup et la restauration depuis ce dépôt (première exécution par
l'installeur).
