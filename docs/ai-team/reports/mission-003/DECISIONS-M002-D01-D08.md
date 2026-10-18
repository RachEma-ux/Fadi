# Dossiers de décision M002-D01 à M002-D08

Programme #156, PR #165, préparation Mission 003. Les identifiants sont ceux de la réception Mission 002 ; aucun registre concurrent ni renumérotation des DEC-01 à DEC-18. Ce dossier précise les décisions, il ne les signe pas. Les [18 décisions techniques](A1/studio-18-decisions.json) et le [dossier G0–G3/pilote](A1/M11-M12-M14-preparation.md) sont leurs pièces d’instruction.

## M002-D01 — Référence technique et pilote

**État : À définir. Décideur : responsable produit/utilisateur.** Déjà imposés : Studio natif autonome, quatre domaines, deux planches indépendantes, hiérarchie Projet → Étude → Variante → Révision, services Fadi partagés, Atelier et les 21 étapes conservés. Ne pas demander de ratifier à nouveau ces invariants.

Choix à consigner : STUDIO-RT-001 V1.0 comme référence technique applicable en traitant le renvoi historique de la charte à Concept V2 ; pilote synthétique local/pavillon, utilisateurs et données autorisées. Alternative : autre étude petite mais réellement terminable, conservant A/B/C. Preuves : sources/empreintes, trois résultats métier, rôles et formats nécessaires. Sortie : décision G0 datée et périmètre inclus/exclu ; aucun passage automatique de G1–G4. Sans décision : continuer les contrats et qualifications, sans annoncer le pilote accepté.

## M002-D02 — Options et reports

**État : À définir pour les nouvelles options. Décideur : produit/utilisateur.** D-179 a déjà renoncé à DWG/DGN : cet état reste applicable ; l’éventuel élargissement exige une nouvelle décision, pas une ratification répétée du renoncement.

Proposition du pilote : IA externe, extensions tierces, MCP, immersion et rendu avancés reportés, tout en conservant les fonctions Fadi existantes et le domaine Visualisation utile. Alternative : retenir une option avec contrat, licence/coût/confidentialité, responsable et essais propres. Preuves : impact du report sur les parcours, dépendances absentes du socle, risque et provenance. Chaque option reste dans M25/#163 avec sa décision ; aucune réalisation cochée par son exclusion. L’absence de décision d’une option indépendante ne bloque pas la préparation des lots qui n’en dépendent pas.

## M002-D03 — Lot garde DB

**État : Bloqué pour le code, préparation documentée. Décideur : utilisateur.** Pièce : [M02/A3 borné](A5/A5-M02-M09-M15-M26.md). Proposition D03a : autoriser A3-DB-1/2, garde et intégration aux lanceurs avec tests purs simulés, sans base réelle. Entrées : revue A2/A5, contrat d’attestation A6, un propriétaire des fichiers setup/client/tests. Acceptation : seize refus simulés et cas positifs proposés, aucun fallback DATABASE_URL, aucune mutation avant attestation, erreurs expurgées, production inchangée.

D03b est distinct : essais sur base jetable provisionnée et attestée après preuve des gardes. Les E2E, migrations et restauration de test demandent leur périmètre explicite. Aucun essai de refus contre une vraie production. Risques : imports ESM trop précoces, différence parseur/driver, NAT, connexion substituée, CASCADE, rôle excessif et faux descripteur. Retour arrière sûr : arrêter les suites, ne jamais désactiver la garde pour les faire passer. Sans accord : conserver M02 ouvert et poursuivre les préparations indépendantes.

## M002-D04 — Reproduction Cloud locale

**État : Bloqué pour les opérations mutatrices. Décideur : utilisateur.** Pièce : [procédure A6](A6/RAPPORT-A6-M01-M03-M04-M10.md). D04a proposé : lecture/export expurgé des scripts publiés et démarrage local sur une cible déjà provisionnée et attestée. D04b proposé séparément : création d’un conteneur/base/rôle jetables, initialisation du schéma si nécessaire et destruction finale de ces seules ressources.

Forcer `MIGRATE_ON_START=0` ; ne pas réutiliser aveuglément le conteneur arrêté, aucune production, aucun volume historique supprimé. Si schéma absent sans accord d’initialisation, arrêter proprement. Acceptation : session réellement neuve, révision/scripts/SHA/version de chaque outil, identité de cible, santé DB/PostGIS, HTML et refus 401 observés ; aucune recette mutatrice avant M02. Risque résiduel : cause de l’arrêt ancien non démontrée, scripts Cloud non exposés par le seul statut. Sans accord : lecture et diagnostic restent possibles, pas de restart/migration.

## M002-D05 — Protections et politique de revue

**État : Bloqué pour l’activation. Décideur : administrateur/utilisateur.** `main.protected=false` est vérifié ; le JSON désactivé de #152 reste la proposition à réutiliser. Option solo : PR et checks obligatoires, aucune approbation GitHub additionnelle impossible mais acceptation humaine tracée. Option équipe : une revue indépendante réellement disponible. Pas de bypass permanent proposé ; les bypass effectifs restent à examiner avec l’accès administratif autorisé.

Checks existants et ceux propres aux PR sont distingués dans A6. Ajouter les nouveaux checks seulement après leur intégration autorisée et déclenchement vérifié sur toutes les PR. Sortie : accord administratif, règle effective relue et essai documentaire autorisé ; un JSON ou ce dossier n’active rien. Sans accord : M03 garde son blocage, aucune hausse de permission ni collecte de secret.

## M002-D06 — Ordre des PR recouvrantes

**État : À définir pour l’intégration. Décideur : utilisateur après consolidation A0.** Proposition : traiter #154 documentaire après ses remarques ; revoir #152 garde-fous sur sa tête exacte ; traiter #142 navigation après diagnostic/correction autorisée de sa CI. Ce séquencement est une proposition, aucune fusion autorisée par Mission 003.

Preuves : #152 a des CI réussies sur sa tête relue ; #154 a été corrigée au commit76e43d1 (continuité/isolation réussies, CI encore en cours au relevé). #142 est mergeable au relevé mais sa CI applicative exacte échoue à `planche-boutons`, tandis que son layout réussit. Ne pas affaiblir les assertions ni confondre mergeable et prêt. La base de tout futur lot I doit être décidée puis requalifiée. A0 réserve AppShell/ProjectShell/HomeTopbar/CSS et workflows. Sans décision : les spécifications indépendantes continuent ; aucune reprise silencieuse du code d’une PR.

## M002-D07 — Navigation et responsabilités Studio

**État : À définir pour les choix nouveaux. Décideur : produit/utilisateur.** Pièces : [contrat candidat](A4/CONTRAT-NAV-CANDIDAT.md), [neuf NAV](A4/NAV-FICHES.md), [modèle/autorités](A2/LOT-A.1.md). Entrée exacte Studio et autonomie déjà imposées. Proposition : après Projets ; routes candidates complètes, contexte partagé et planches dans D1, plein écran explicite avec sortie visible ; transitions route/langue/fermeture protègent preview, file et conflit.

Choisir approbateur/publieur et éventuel cumul, états de publication, appareils et protocole DEC-13. Alternative de placement/URL admise si les invariants et NAV restent satisfaits. Preuves : maquette d’interaction, contrat d’appartenance serveur, états et oracles ; un mock ne valide pas les permissions ou la durabilité. Sans décision : contrat candidat et scénarios restent proposés, aucune G1 acceptée ni M16 implémentée.

## M002-D08 — Enregistrement documentaire

**État : Accepté dans ce seul périmètre. Autorité : mandat utilisateur Mission 003, phases 2 et 8, programme #156.** Autorisés : récupération, rapprochement, rapports, registres, suivi et checkpoints documentaires sur branche/PR. Premier checkpoint `3f0dc63cd3a713417970d9c42cfc7ceee3d2a759`, contrôle couverture/continuité/isolation réussi ; CI applicative propre à cette tête relevée séparément.

Cette autorisation est déjà acquise : ne pas la redemander pour poursuivre ces écritures. Elle n’autorise ni code applicatif, POC, restart, migration, administration, fusion ou production. A0 maintient STATUS/HANDOFF ensemble et conserve les blocages ; #156 et les groupes restent ouverts.

## Portes G0–G4 et demandes par sous-lot

Le dossier A1 décrit les entrées/sorties et le pilote ; les douze [dossiers de lots](README.md) précisent contrats, tests, risques et retour arrière. G0/G1 restent en instruction ; les preuves G2 et autorisations G3 restent absentes pour le code, G4 dépend des parcours réellement livrés. Les décisions facultatives ne créent pas de verrou global circulaire. Toute réponse humaine future doit conserver auteur habilité, date, sous-lot, opérations admises/exclues et preuve dans le suivi canonique.
