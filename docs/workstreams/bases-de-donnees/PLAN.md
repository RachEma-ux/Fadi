# Bases de données — plan de remédiation et d'amélioration

Établi le 2 novembre 2026 à la demande du maître d'ouvrage (« Établis un plan pour résoudre tous les problèmes et
implémente les améliorations possibles »), à partir de l'analyse complète du même jour. Suivi :
[Issue #379](https://github.com/RachEma-ux/Fadi/issues/379).

Principes : mesurer avant d'optimiser ; l'intégrité vit dans la base ; aucune action irréversible en production sans
le maître d'ouvrage (une Release reste son autorisation de production) ; aucune valeur inventée (objectifs RPO / RTO,
limites mémoire du serveur) — une valeur non décidée reste « à définir ».

## Constats de départ (analyse du 2 novembre 2026)

PostgreSQL 16 + PostGIS 3.4 (`postgis/postgis:16-3.4`), une base, schémas `public` / `auth` / `admin`, 134 tables, 314
clés étrangères, 247 contraintes CHECK, ~40 déclencheurs d'immuabilité, rôles D-7. Volume dominé par `geodata_valeurs`
(5 M lignes, 945 Mo). Un serveur par environnement, sans réplique ni pooler.

## Lots

| Lot | Problème | Solution | Qui décide | PR |
|---|---|---|---|---|
| **BD-1** Connexions | Pool par défaut, aucune limite de durée de requête ni de transaction inactive, pas d'écouteur `error` (une connexion coupée arrêtait le processus), arrêt en 200 ms sans fermer les connexions | `db/pool-options.ts` : `statement_timeout` 120 s, `idle_in_transaction_session_timeout` 120 s, attente d'une connexion 10 s, `application_name`, tout réglable (`DB_*`) ; `pool.on("error")` ; arrêt : `server.close()`, connexions rendues, au plus 8 s | Technique | PR |
| **BD-2** Index | Fiche GeoData : `geodata_indicateurs` relue en entier ; notifications Atelier sans index `author_id` ; 10 requêtes `lower(email)` sans index ; clés des versions GeoData sans index ; deux index en double | `geodata_indicateurs (couche_id, ordre)`, `atelier_commands (author_id, project_id)`, `users (lower(email))`, `version_id` / `espace_id` des tables GeoData ; doublons de clés primaires retirés | Technique | PR |
| **BD-3** Écritures atomiques | Publication GeoData vérifiée puis mise à jour sans garde ; carte + collection + journal hors transaction ; rangs `max()+1` | Mise à jour conditionnée à l'état, transactions, rang calculé sous verrou de la collection ; ordre des catégories et journal des autres actions : BD-3b | Technique | PR |
| **BD-4** Requêtes répétées | Messagerie 1 + 2N, « lu » 500 écritures unitaires, études 200 requêtes parallèles, notifications sans borne | Reçus en une instruction, analyses par paquets de 4, notifications lues dans les seuls projets concernés ; boîte de la messagerie et accès par projet (logique d'accès) : BD-4b après mesure | Technique | PR |
| **BD-5** Migration sûre | `init.sql` (3 500+ lignes) rejoué en une transaction, sans délai de verrou : la migration pouvait figer l'application ; aucun historique ; 83 contraintes NOT VALID jamais contrôlées sur les lignes existantes | `db/appliquer-schema.ts` : verrou consultatif, `lock_timeout` 5 s et réessais (rien n'est appliqué tant qu'un verrou manque), journal `admin.schema_applications` ; `db:verifier-contraintes` (transactions annulées) en CI | Technique | PR |
| **BD-6** Observabilité | Aucune statistique de requêtes, aucun journal des requêtes lentes, journaux du conteneur de production non bornés | `pg_stat_statements` (bibliothèque chargée par les fichiers compose, extension créée par la migration), requêtes > 1 s journalisées sans paramètres, journaux 10 Mo × 3 | Technique ; prise d'effet en production au prochain redémarrage du conteneur `db` | PR |
| **BD-7** Sauvegardes | Copie logique quotidienne seulement (perte jusqu'à 24 h) ; aucun test de restauration depuis la vraie copie externe ; conservation externe jamais appliquée | Archivage du WAL (pgBackRest ou WAL-G vers Swiss Backup), restauration à un instant donné ; `restic forget --prune` réel ; test de restauration mensuel planifié avec mesure du RTO | **Maître d'ouvrage** : objectifs RPO / RTO (OPS-09), coût du stockage, accord pour supprimer d'anciennes copies | — |
| **BD-8** Rôle de migration | La production migre avec le superutilisateur `fadi`, pas `fadi_migrator` (D-7) ; sauvegardes en superutilisateur, pas `fadi_backup` | Mots de passe `FADI_MIGRATOR_DB_PASSWORD` / `FADI_BACKUP_DB_PASSWORD` dans `.env.deploy`, puis compose basculé | **Maître d'ouvrage** (secret sur le serveur) | — |
| **BD-9** Atelier | Chaque commande verrouille le projet et recharge le modèle (8 requêtes) ; l'import IFC le fait jusqu'à 60 fois dans une transaction | Validation incrémentale ou instantané en mémoire ; import par lots hors verrou | **Maître d'ouvrage** (section 10.1 du cahier Atelier) | — |
| **BD-10** Documentation | `exploitation-fadi-cloud.md` et `deploiement.md` contredisent l'état réel (sauvegarde externe active, migration à usage unique) | Passages corrigés | Technique | PR |
| **BD-11** Plus tard, sur mesure | Choix d'un outil de migrations versionnées ; index couvrant `geodata_valeurs (code) INCLUDE (…)` (~400 Mo) si la fiche est lente à froid en production ; recherche « contient » (`pg_trgm`) si les tables grandissent | Décider après mesures `pg_stat_statements` en production | À définir | — |

## Vérification

- PR : `npm run typecheck`, `npm test`, `npm run build` ; migration locale rejouée, réessai sur verrou occupé constaté
  (« essai 1/5 … 2 essai(s) »), échec franc après le dernier essai (55P03), `pg_stat_statements` « active » quand la
  bibliothèque est chargée ; `db:verifier-contraintes` : 83 contrôlées, 83 respectées (base locale avec les données
  GeoData réelles).
- Après déploiement en préproduction : `SELECT * FROM admin.schema_applications ORDER BY id DESC LIMIT 5`, puis
  `node apps/api/dist/verifier-contraintes.js` dans le conteneur de l'application (rôle propriétaire).

## Retour arrière

- BD-1 : variables `DB_STATEMENT_TIMEOUT_MS=0`, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=0` rétablissent l'absence de délai.
- BD-2 : `DROP INDEX CONCURRENTLY` des index ajoutés ; les doublons retirés n'ont aucun usage (clé primaire identique).
- BD-5 : `MIGRATION_LOCK_TIMEOUT=0` (attente illimitée, comportement antérieur) ; la table `admin.schema_applications` est
  un simple journal.
- BD-6 : retirer `command:` du service `db` et redémarrer le conteneur.

## Décisions du 3 novembre 2026 et mise en œuvre (BD-7, BD-8, BD-9)

Le maître d'ouvrage a accepté les recommandations (« Ok excut ») :

- **BD-7 Sauvegardes** : perte maximale 15 minutes, remise en service 4 heures, fenêtre de 14 jours, rétention réelle
  5 / 14 / 8 / 12, restauration de contrôle mensuelle. Mise en œuvre sans nouvel outil ni nouveau secret : archivage
  du journal dans le volume `fadi-pitr`, envoi restic toutes les 10 minutes vers le dépôt Swiss Backup existant, base
  nocturne `pg_basebackup`, `fadi-backup-retention` hebdomadaire. Détail : [sauvegarde continue](../../sauvegarde-continue.md).
  L'outil WAL-G envisagé dans la recommandation n'est pas retenu : restic, déjà installé et chiffré, atteint les mêmes
  objectifs sans binaire supplémentaire dans l'image de la base ni nouvelle clé.
- **BD-8 Rôles** : aucun mot de passe nouveau n'est nécessaire. La migration applique le schéma sous `fadi_migrator`
  (`SET ROLE`) et n'utilise l'administrateur que pour l'amorçage ; la sauvegarde passe par le socket de la base avec
  `fadi_backup`. Les outils du VPS (`fadi-prod-auto`, sauvegarde hors VPS) gardent l'administrateur local : ils
  tournent déjà en root sur le serveur, le changer n'apporterait aucune protection.
- **BD-9 Atelier** : mesure seulement (`lib/atelier-mesures.ts`, table `admin.atelier_mesures_verrou`, rapport
  `node apps/api/dist/atelier-mesures.js`). Critère proposé : agir si plus de 5 % des écritures tiennent le verrou plus
  de 250 ms ; décision au maître d'ouvrage après 2 à 4 semaines de mesure.

Correction d'une recommandation : « votre seule action : publier la Release » n'était pas exact pour BD-7. Les outils
du VPS ne s'installent que par l'administrateur (empreintes relues) et le déploiement automatique ne redémarre jamais la
base : un geste unique, `sudo bash installer-bases.sh <commit>`, est nécessaire après la Release.
