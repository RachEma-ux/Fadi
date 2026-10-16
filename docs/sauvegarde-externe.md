# Fadi — sauvegarde hors VPS avec Restic

**État : préparation uniquement.** Les fichiers de cette branche ne modifient pas le VPS tant qu'ils ne sont pas déployés, que les identifiants n'ont pas été installés et que le service n'a pas été activé.

## Sources et décisions

Le dépôt existant possède déjà un service `backup` qui crée un `pg_dump -Fc` quotidien dans le volume Docker `fadi-backups`, conservé 14 jours. Le script `scripts/backup-offsite-restic.sh` déclenche un nouveau dump cohérent et sauvegarde le volume local **ainsi que `.env.deploy`** dans un dépôt externe chiffré Restic. Le mot de passe Restic est distinct du mot de passe PostgreSQL ; le dépôt distant ne doit jamais être publiquement partagé.

Au 16 octobre 2026, **kDrive 1,0 To** et **Swiss Backup Swift 1,0 To** ont été confirmés séparément. L'espace `Fadi-Serv-Backup` (Swift Keystone v3) est opérationnel : authentification 201, dépôt Restic initialisé, un snapshot reçu, téléchargement et déchiffrement de l'archive validés, puis **restauration PostgreSQL/PostGIS isolée réussie** (`RESTAURATION POSTGRESQL ISOLEE OK`, après attente complète d'initialisation PostGIS). **Le service automatique a passé son test manuel le 16 octobre 2026** (`Result=success`, `ExecMainStatus=0`, snapshot `322f0e6c`, deux snapshots vérifiés par `restic check`). **Le timer systemd est maintenant actif et activé au démarrage (`active`, `enabled`)**, d'après les commandes exécutées sur Fadi-Serv. Première exécution prévue le 17 octobre 2026 à 03:26:55 UTC. **Alertes externes et rétention distante non encore configurées.**

Pour Swiss Backup, Infomaniak documente **Restic + OpenStack Swift** ; des espaces Cloud S3 existent également. Choisir le protocole **au moment de la création de l'appareil** et ne jamais inventer un endpoint.

Références :
- https://www.infomaniak.com/fr/support/faq/1019/sauvegarder-un-hebergement-web-avec-restic-sur-swiss-backup-swift
- https://www.infomaniak.com/fr/support/faq/2543/guide-de-demarrage-swiss-backup-sauvegarde-cloud
- https://www.infomaniak.com/fr/support/faq/2409/se-connecter-a-kdrive-par-webdav

## Préparation sur Fadi-Serv (après validation du produit de sauvegarde)

1. Vérifier le produit, la capacité, la destination géographique, les limitations, les coûts, les versions et les droits. Obtenir un compte/jeton **dédié uniquement aux sauvegardes de Fadi**.
2. Installer Restic depuis une source vérifiée (par exemple le paquet Ubuntu) sur le VPS ; **ne pas mettre de clés dans GitHub**.
3. Créer `/etc/fadi/restic.env` (`root:root`, `0600`) avec **uniquement les paramètres non secrets** (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE`, `OS_AUTH_URL`, `OS_USERNAME`, `OS_PROJECT_NAME`, région, domaines). Stocker **séparément** le mot de passe Swift dans `/etc/fadi/swift-password` (`root:root`, `0600`) et référencer `FADI_SWIFT_PASSWORD_FILE=/etc/fadi/swift-password`. Le script exporte le mot de passe seulement durant l'exécution de Restic. Ne jamais le publier dans les logs ou dans ChatGPT.
4. Créer un fichier `/etc/fadi/restic-password` appartenant à root avec permissions `0600`. Conserver **au moins deux copies chiffrées indépendantes** de ce mot de passe **hors du VPS** : sa perte rend les archives illisibles.
5. Initialiser **explicitement** le dépôt Restic externe avec ces paramètres. **Ne jamais réinitialiser un dépôt déjà existant.**
6. Tester une exécution manuelle et vérifier les snapshots, le journal, ainsi qu'une **restauration de contrôle dans un emplacement isolé**. Vérifier `pg_restore --list` puis restaurer dans une base de contrôle, jamais dans la base `fadi` en production.
7. Après un premier test réussi, installer les unités `ops/systemd/fadi-backup-offsite.service` et `ops/systemd/fadi-backup-offsite.timer` dans `/etc/systemd/system/`, puis activer le timer. Les journaux doivent être surveillés et une alerte doit être déclenchée en cas d'échec.
8. Définir une politique de rétention distante, testée avant toute suppression : sauvegardes quotidiennes, hebdomadaires et mensuelles, avec verrouillage/immutabilité si le fournisseur le permet. **Le script ne lance volontairement aucun `forget` ni `prune` automatique avant validation.**

## Installation et premier essai sur Fadi-Serv (sans modifier l'application)

Le script et les unités systemd sont conservés dans la branche de préparation `ops/fadi-cloud-environment`. La branche de production n'est pas modifiée : seuls les fichiers d'exploitation sont copiés après inspection.

```bash
set -euo pipefail
cd /mnt/data/fadi/app
git fetch origin ops/fadi-cloud-environment

git show FETCH_HEAD:scripts/backup-offsite-restic.sh |
  sudo install -m 0700 /dev/stdin /usr/local/sbin/fadi-backup-offsite
git show FETCH_HEAD:ops/systemd/fadi-backup-offsite.service |
  sudo install -m 0644 /dev/stdin /etc/systemd/system/fadi-backup-offsite.service
git show FETCH_HEAD:ops/systemd/fadi-backup-offsite.timer |
  sudo install -m 0644 /dev/stdin /etc/systemd/system/fadi-backup-offsite.timer

sudo bash -n /usr/local/sbin/fadi-backup-offsite
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/fadi-backup-offsite.service /etc/systemd/system/fadi-backup-offsite.timer
```

**Ne pas activer le timer directement.** Tester d'abord manuellement le service :

```bash
sudo systemctl start fadi-backup-offsite.service
sudo systemctl show fadi-backup-offsite.service -p Result -p ExecMainStatus
sudo journalctl -u fadi-backup-offsite.service -n 45 --no-pager
```

Vérifier un nouveau snapshot dans le dépôt Swift et effectuer une récupération de contrôle. Si le test réussit, activer la minuterie :

```bash
sudo systemctl enable --now fadi-backup-offsite.timer
sudo systemctl list-timers fadi-backup-offsite.timer --all
```

En cas d'échec, ne pas activer le timer ; conserver les dumps locaux, analyser les journaux et corriger. La tâche systemd fonctionne indépendamment du téléphone Android. Vérifier la zone horaire du VPS via `timedatectl`.

**Important :** le journal systemd ne constitue pas une alerte externe. La supervision de l'absence de snapshot et des échecs doit être configurée avant de déclarer le système entièrement prêt.

## Surveillance externe : conception retenue, activation à autoriser

Un timer `systemd` `active` et `enabled` garantit uniquement sa programmation, pas la réussite des sauvegardes futures. Il reste à disposer d'une **alerte hors VPS** quand :

- une sauvegarde échoue ;
- une exécution attendue n'a pas lieu ;
- une sauvegarde se termine mais le snapshot externe n'est pas mis à jour.

Option suggérée : un service de contrôle de tâches planifiées compatible avec un **ping HTTPS de fin d'exécution**, une échéance quotidienne et un délai de grâce. À titre d'exemple, Healthchecks.io peut notifier par courriel en cas de `/fail` ou d'absence de ping : https://healthchecks.io/docs/monitoring_cron_jobs/

**Validation indispensable avant activation** : choix et accord du responsable sur le fournisseur des alertes, canal de réception et conservation d'une URL de ping privée dans un fichier `root:root 0600` sur le VPS. Ne jamais publier l'URL, l'identifiant ni un mot de passe dans GitHub. Aucun ping externe n'est installé dans la configuration actuelle.

Tester la supervision avec un échec volontaire d'une **tâche de test**, distincte des sauvegardes réelles, puis vérifier qu'un signal est effectivement reçu. Ne jamais provoquer une erreur sur la base de production pour tester les alertes.

## Politique de conservation distante à valider

Proposition initiale (à dimensionner par les statistiques de croissance du dépôt et le quota de 1 To) : **14 sauvegardes quotidiennes, 8 hebdomadaires et 12 mensuelles**, avec contrôle mensuel de récupération. Restic applique la déduplication ; un quota de 1 To reste néanmoins fini. Ne pas exécuter `restic forget` ni `restic prune` automatiquement avant un inventaire des snapshots, un essai `--dry-run` et l'approbation du responsable. Le volume local reste sur une rétention indépendante de 14 jours.

## Contrôles d'exploitation

- `sudo systemctl status fadi-backup-offsite.timer` : calendrier activé et dernière/ prochaine exécution.
- `sudo journalctl -u fadi-backup-offsite.service --since yesterday --no-pager` : journal du transfert et de `restic check` (sans secret).
- Santé applicative : `curl -fsS https://www.fadimmo.com/health` ; cette sonde ne démontre pas qu'une sauvegarde est récupérable.
- Régulièrement : restaurer un dump distant **sur un espace et une base temporaires** puis vérifier le nombre de tables et quelques données. Supprimer l'environnement de test après validation.
- Prévoir un scénario de perte complète du VPS : identifiants fournisseurs et clé de déchiffrement doivent être récupérables sans accès à `/mnt/data`.

## Limites

- Le script proposé concerne **la base PostgreSQL, les pièces stockées en base et `.env.deploy`** ; il ne remplace pas une sauvegarde complète du système Ubuntu, des clés SSH ou de tous les paramètres d'Infomaniak.
- Son chiffrement et sa destination doivent être testés sur le VPS réel ; les tests locaux ne prouvent pas la compatibilité du compte externe.
- `restic check` valide la structure du dépôt, **pas** le résultat fonctionnel d'une restauration.
- La rotation locale de 14 jours n'est pas une politique de rétention externe.
- Toute restauration de production et toute modification de credentials restent soumises à une approbation explicite.
