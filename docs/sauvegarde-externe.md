# Fadi — sauvegarde hors VPS avec Restic

**État : préparation uniquement.** Les fichiers de cette branche ne modifient pas le VPS tant qu'ils ne sont pas déployés, que les identifiants n'ont pas été installés et que le service n'a pas été activé.

## Sources et décisions

Le dépôt existant possède déjà un service `backup` qui crée un `pg_dump -Fc` quotidien dans le volume Docker `fadi-backups`, conservé 14 jours. Le script `scripts/backup-offsite-restic.sh` déclenche un nouveau dump cohérent et sauvegarde le volume local **ainsi que `.env.deploy`** dans un dépôt externe chiffré Restic. Le mot de passe Restic est distinct du mot de passe PostgreSQL ; le dépôt distant ne doit jamais être publiquement partagé.

Au 16 octobre 2026, une capture d'écran confirme **1,0 To de kDrive**, mais ne démontre **ni un stockage Swiss Backup**, ni l'autorisation d'automatiser les transferts via WebDAV. La documentation Infomaniak exclut WebDAV pour my kSuite/my kSuite+ (ik.me), kSuite Free et kSuite Standard. **Ne pas activer `rclone` pour kDrive tant que l'offre précise n'est pas confirmée.**

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
