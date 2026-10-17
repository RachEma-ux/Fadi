# Rétention Restic sur Swiss Backup — politique proposée

**État au 17 octobre 2026 : proposition documentée ; simulation seule, aucune purge autorisée ni programmée.**

## Contexte confirmé

- `Fadi-Serv` : VPS Infomaniak Ubuntu, sauvegarde PostgreSQL vers Swift via Restic 0.16.4.
- `Fadi-Serv-Backup` : 1 To Swiss Backup ; dépôt `swift:…:/fadi-backups`.
- Timer quotidien `fadi-backup-offsite.timer` actif et activé, surveillance `Fadi-SwissBackup` UP sur Healthchecks.io.
- Première sauvegarde planifiée du 17 octobre : snapshot `544462d7`, Restic check réussi sur 5 snapshots.
- Restauration PostgreSQL/PostGIS isolée d'un snapshot précédent réussie (7 projets, 147 étapes).

## Politique de conservation proposée

| Option Restic | Valeur | Rôle |
| --- | --- | --- |
| `--keep-last` | `5` | Préserver les cinq plus récents snapshots de chaque groupe, même si plusieurs tombent le même jour. |
| `--keep-daily` | `14` | Dernier snapshot de chacun des 14 derniers jours **ayant une sauvegarde**. |
| `--keep-weekly` | `8` | Dernier snapshot de chaque semaine avec sauvegarde, jusqu'à 8 semaines. |
| `--keep-monthly` | `12` | Dernier snapshot des 12 mois ayant une sauvegarde. |

Restic additionne les règles de conservation. Les règles calendaires s'appliquent aux périodes avec une sauvegarde, et non à des intervalles glissants exacts. **14 quotidiennes ne garantit pas 14 journées calendaires complètes si un jour échoue.**

Le filtre `--tag fadi,postgres` limite la simulation aux snapshots sauvegardés avec **les deux tags**. La séparation par `--group-by host,paths` protège les jeux de données dont la liste des chemins de sauvegarde a changé entre les exécutions manuelles et le service. Nous éviterons de fusionner ces groupes tant que leur couverture n'est pas auditée.

Documentation de la version installée : https://restic.readthedocs.io/en/v0.16.4/060_forget.html

## Phase A — Audit sans suppression (seule étape autorisée)

Le script `scripts/audit-offsite-retention.sh` :

1. Vérifie les permissions de `/etc/fadi/restic.env`, `swift-password` et `restic-password`, et le dépôt Swift.
2. Liste tous les snapshots et affiche l'occupation logique dédupliquée via `restic stats --mode raw-data` (ce n'est pas nécessairement l'occupation facturée totale par Infomaniak).
3. Confirme la présence des snapshots avec les tags `fadi,postgres`.
4. Exécute **uniquement** `restic forget --dry-run`, sans `--prune` ni autre commande de suppression.
5. N'active aucune minuterie de nettoyage, ne modifie ni le service de sauvegarde ni la base de production.

### Installation et utilisation sur Fadi-Serv

Depuis un terminal **déjà connecté** au VPS :

```bash
cd /mnt/data/fadi/app
git fetch origin ops/fadi-cloud-environment
set -o pipefail
git show FETCH_HEAD:scripts/audit-offsite-retention.sh | sudo install -m 0700 /dev/stdin /usr/local/sbin/fadi-restic-retention-audit
sudo bash -n /usr/local/sbin/fadi-restic-retention-audit
sudo /usr/local/sbin/fadi-restic-retention-audit
```

Ne pas passer `RESTIC_PASSWORD` ni `OS_PASSWORD` en arguments. Ne pas publier les fichiers de configuration ni les secrets. Le script affiche seulement des métadonnées et des statistiques, pas les secrets.

**Pour l'instant :** vérifier l'affichage final `FADI_RETENTION_DRY_RUN_OK` et recopier les tableaux `keep` / `remove` de la simulation. Vérifier en particulier que les snapshots de restauration testés et les sauvegardes les plus récentes sont conservés.

## Phase B — Décision après audit

Décider de la purge future uniquement après avoir évalué :

- Le nombre de snapshots avec et sans les tags `fadi,postgres` et les changements de chemins ;
- Le nombre et les ID des snapshots que le simulateur prévoit de retirer ;
- L'occupation du dépôt (comparée au quota Swiss Backup de 1 To), son rythme de croissance et le RPO/RTO désirés ;
- La disponibilité des secrets et une restauration depuis le dépôt distant ;
- Les besoins de conservation légale et métier (projets/clients) avant tout effacement.

Si l'audit est acceptable, préparer **séparément** une tâche de rétention (jamais modifier le timer quotidien en place tant que non approuvé). L'action réelle `restic forget` supprimerait les références aux snapshots ; `restic prune` retirerait ensuite les blocs inutilisés, avec verrouillage du dépôt pendant l'opération. La simulation ne remplace pas un test de restauration après purge.

**Aucun `forget` réel, aucun `prune` et aucun timer de rétention ne sont mis en œuvre par cette PR.**
