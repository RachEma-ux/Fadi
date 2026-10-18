# Reprise — équipe Codex Fadi

Mis à jour : 2026-10-18 (UTC).

## Point de reprise

Reprendre [PR #181](https://github.com/RachEma-ux/Fadi/pull/181), branche `feat/156-studio-v1`, base garde DB `9b34dca` / #169. Priorité : parcours réel Studio 2D ; ne pas recommencer les inventaires de #172/149709e. Le SHA de ce fichier porte le checkpoint courant.

## Dernier état vérifié

Au code `3b7fb25d2ae8f78682c09cad5b935f0937dae4a5`, recette sur PostGIS neuf : 44 contrôles initiaux, 5 après redémarrage API/DB sur le même volume et 3 de non-régression réussis. Révision et géométrie exactes conservées ; conflits, permissions et rejeux vérifiés. Le profil neuf corrigé a été exercé intégralement ; les changements suivants concernent ce checkpoint et une fin de fichier de recette, sans changement de comportement applicatif. Acceptation utilisateur non acquise.

## Prochaine action

1. Coordonner le socle unique avec les PR concurrentes #178/#179/#180 (créées pendant ce développement) : tables/routes différentes, aucune fusion cumulative ; réutiliser les composants retenus après arbitrage #166. Continuer les vérifications indépendantes.
2. Lire les nouvelles réponses #166 et contrôler HEAD/PR #181 et sa CI exacte ; aucune fusion autorisée.
3. Si une anomalie de cette tranche apparaît, reproduire sur son profil jetable, corriger le code concerné et rejouer la recette. A0 reste propriétaire des fichiers de continuité ; ne pas écrire concurremment navigation, schéma, commandes ou workflows.
4. Faire constater le parcours au propriétaire. Toute ouverture d'accès distant/public requiert un périmètre explicite ; aucun tunnel n'est configuré. Préparer le prochain incrément de code à partir des références existantes, sans nouveau rapport général.

## Tests et preuves

Commande pour une **nouvelle session** après installation et build : `python3 scripts/validation/studio-v1-functional.py --keep-running`. Le script crée sa propre base vide et son propre rôle, atteste la cible, applique le SQL Studio épinglé et exécute UI/API → redémarrage → réouverture → Parcours/Atelier. Les rapports `report-*.json` et captures sont publiés en artifacts CI ; les manifests, mots de passe et comptes de recette restent privés. Les preuves locales sont dans le dossier ignoré `work/studio-v1-proof/`, avec SHA et version du navigateur.

TypeScript/builds passent. Les tests purs/web et 138 tests simulés DB/orchestration passent. Ne pas lancer `npm test` global ni les tests API historiques : leur registre de confiance DB1/2 reste fermé ; ce profil de serveur réel autorisé ne prétend pas résoudre DB3. Ne jamais appeler le migrateur historique ou `MIGRATE_ON_START=1` pour cette recette.

## Risques et blocages

Le premier lancement a révélé un oracle SVG de hauteur nulle puis une icône manquante ; les coordonnées et le tracé visible sont désormais contrôlés et les erreurs navigateur absentes. Le port Docker éphémère changeait au restart : le préflight a refusé la connexion ; futurs profils à port fixe et réattestation du même conteneur/volume/DB ont permis la recette complète. Pas de blocage applicatif connu dans ce lot ; le reste du pilote Studio et la recette métier complète restent ouverts.

## Arrêt sûr

Seuls les processus/ressources créés et identifiés par le profil peuvent être arrêtés. La base locale et son volume ont été conservés pour inspection ; credentials en fichiers600 hors Git. Si l'état privé de session n'est plus accessible, le déclarer et recréer un profil neuf ; ne pas inventer une récupération. Conserver #169/#172/#181 et les décisions historiques ; aucune modification main, administration, migration existante, suppression de données, fusion ou production.
