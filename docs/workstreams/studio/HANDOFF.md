# Reprise — Studio

## Lots F3, F4 et F5 — échanges, collaboration, rendu — 25 octobre 2026

Branche `ccr-187fd2e6-08dk6e`, base `main@4377815` (lot F1 fusionné, PR #317).

Ce qui a été fait :
- **F3 — échanges.**
  - Import IFC avec rapport de pertes et état « non natif » explicite (l'import DXF garde aussi ses entités inconnues).
  - Modèle externe déclaré, comparé, puis accepté ou refusé par un rôle habilité.
- **F4 — collaboration.**
  - Délégation d'approbation auditée, revérifiée par le serveur à chaque emploi.
  - Rapprochement automatique des observations.
  - Journal de corrélation `commandId` / `jobId`, sans secret ni géométrie.
  - Contrôles de traçabilité EX-100 à 104 sur les données réelles. Leurs écarts sont publiés dans [TRACABILITE-EX.md](../../ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md).
- **F5 — rendu et index.**
  - Index spatial incrémental.
  - Dégradation sûre de la vue 3D sous charge.
  - Comparaison SVG / Canvas / GPU (DEC-08 confirmée).
  - Inventaire des types 3D avancés, annoncés « Non disponible ».
- **Recettes `studio-echanges`, `studio-publication`, `studio-observations` et `studio-rendu`** (nouvelle, en CI et en préproduction). Détail et limites : [lots de fonctions](recettes/LOTS-FONCTIONS-2026-10-25.md).
- **13 obligations vérifiées** : TEST-028, TR-EX-066, TR-EX-085, 086, 095, 100, 102, 103, 104, C.1-05, TR-EX-057, TEST-025, A.3-08.

Compteurs recalculés du registre : **0 À définir / 88 À faire / 194 En cours / 11 Bloqué / 279 Vérifié / 58 Accepté**. **P630=337/630**.

Prochaine action : PR de ces lots, CI verte, puis fusion. Ensuite F2 (noyau exact), le point 2 (tests des preuves partielles), puis G1 et G4.

## Lot F1 — géométrie 3D — 25 octobre 2026

Branche `ccr-187fd2e6-08dk6e`, base `main@cb9e4be` (phase B fusionnée, PR #316).

Ce qui a été fait :
- **Direction d'extrusion.** L'extrusion 2D va vers `+z` ou `-z` ; un prisme suit un vecteur saisi. La direction est demandée, jamais proposée d'office.
- **Relations explicites du prisme à sa polyligne source.** Trois relations : « référence liée » (recalcul dans la même révision, ou « à résoudre »), « associé » et « copie indépendante ».
- **Édition de faces.** Pousser ou tirer une face, pivoter un solide.
- **Division de face cotée**, avec réattachement prouvé des cotes, ou « à résoudre ».
- **Preuves.** Recette `studio-faces` (CI et préproduction) et tests `f1-geometrie.test.ts`. Détail : [lots de fonctions](recettes/LOTS-FONCTIONS-2026-10-25.md).
- **Vérifiés** : TEST-002, TEST-005, TEST-006, TEST-007, A.4-02, A.4-07, TR-EX-006.
- **Partiels** : A.3-03 (pas de rotation horizontale ni d'échelle 3D) et TR-EX-005 (pas d'édition de groupe).

Compteurs recalculés du registre : à cette date 266 Vérifié, 58 Accepté, 11 Bloqué, 204 En cours, 91 À faire, 0 À définir ; 324 obligations sur 630 closes.

Prochaine action : lots F3 (IFC, modèle externe), F4 (délégation, observations, traçabilité), F2 (noyau exact) et F5 (rendu, index), puis le point 2 (tests des preuves partielles), puis G1 et G4.

## Phase B de production livrée côté dépôt — 25 octobre 2026

Branche `ccr-187fd2e6-08dk6e`, base `main@44c6ef4`. Ordre demandé par le maître d'ouvrage : lots de fonctions (point 3), tests des preuves partielles (point 2), portes G1 puis G4 (point 4) ; en parallèle, phase B.

Ce qui a été fait :
- **`deploy/prod/fadi-prod-auto`**, ses unités systemd, son installateur à empreintes et 121 contrôles à doubles (`deploy/prod/tests/run.sh`, joués en CI). Parmi eux : l'échec simulé de chaque sonde, avec retour à l'image précédente sans restauration de la base, et la sauvegarde non vérifiée, qui bloque tout redémarrage. Recette sur le VPS : [`docs/deploiement-automatique-recette-phase-b.md`](../../deploiement-automatique-recette-phase-b.md).
- [DOSSIER-G4.md](DOSSIER-G4.md) §4 mis à jour : scripts livrés, installation et recette sur le VPS restantes (administrateur).

Compteurs recalculés du registre : à cette date 259 Vérifié, 58 Accepté, 11 Bloqué, 210 En cours, 92 À faire, 0 À définir ; 317 obligations sur 630 closes (inchangés : les obligations R restent bloquées tant que le service n'est ni installé ni recetté sur le VPS).

Prochaine action : lots F1 (géométrie 3D), F3 (import IFC, modèle externe) et F4 (délégation, observations, traçabilité) en cours ; puis F2 (noyau exact), F5 (rendu, index), point 2, et G1 puis G4.

## Rapprochement complet et compléments — 25 octobre 2026

Branche `ccr-187fd2e6-08dk6e`, base `main@4e026ac`. Le maître d'ouvrage délègue aussi ses propres tâches : « Exécute tout ce qui reste à faire ».

Ce qui a été fait :
- **Rapprochement des 523 obligations ouvertes**, en 10 lots, puis **contre-vérification indépendante** des 217 verdicts positifs : 153 confirmés, 64 réfutés. Seuls les confirmés sont promus. Chaque obligation restante porte dans sa `suite` le manque exact.
- **Décisions** P-08 (les 16 « À définir »), P-09 (COEX-01, ADR-05, OPS-03, SRC-06, ROUTE-09, COEX-03 à 06) et P-10 (premier usage du groupe de Workers) dans [ADR-STUDIO-PILOTE-01](../../continuity/decisions/ADR-STUDIO-PILOTE-01.md).
- **Défauts trouvés et corrigés** : deux fuites de mémoire de la vue 3D. three.js abonne chaque moteur de rendu à sa table DFG partagée sans le désabonner ; l'écouteur clavier des contrôles de caméra reste accroché au `document` après la fermeture. Recette `studio-memoire` (TEST-037) ajoutée à la CI.
- **Tests ajoutés** : TEST-003, 010, 012, 016, 018, 021, 022, 024 (vérifiés) ; TEST-002, 011, 027, 035 (partiels, le manque est noté).
- **Documents** : [DOSSIER-PILOTE.md](DOSSIER-PILOTE.md) (34 sections), [DOSSIER-G4.md](DOSSIER-G4.md) (G4 instruite, **non franchie**), [recette déléguée](recettes/RECETTE-DELEGUEE-2026-10-25.md) des trois parcours (A conforme ; B et C conformes au guide avec réserves).

Preuves d'exécution :
- les 22 recettes Studio passent sur une base jetable, dont `studio-memoire`. La navigation a échoué une fois, sous la charge des tests unitaires joués en parallèle, puis passé seule (278 contrôles) ;
- typecheck, tests des espaces de travail et garde-fou de base : tous réussis.

Compteurs recalculés du registre : à cette date 259 Vérifié, 58 Accepté, 11 Bloqué, 210 En cours, 92 À faire, 0 À définir ; 317 obligations sur 630 closes.

Ce qui reste, et pourquoi :
- 9 obligations R : G4 non franchie, phase B de production (`fadi-prod-auto`) absente du dépôt, Release réservée au maître d'ouvrage ;
- TEST-032 et TEST-033 : fonctions IA et MCP absentes ;
- les autres obligations ouvertes portent sur des fonctions absentes, des mesures sur appareil réel, des données réelles (exclues de la délégation) ou des portes G1 à G4.

Prochaine action : PR de ce lot, puis CI verte et fusion. Ensuite, par lots de produit, construire les fonctions absentes que le dossier G4 recense, prononcer G1, et livrer la phase B de production. Les tâches qui exigent des données réelles ou une Release restent au maître d'ouvrage.

## Pilote Studio — décisions déléguées et recette — 25 octobre 2026

Branche `ccr-187fd2e6-08dk6e`, base `main@3e992b6`. Le maître d'ouvrage a accordé la délégation totale pour ses décisions sur Studio. Elles sont consignées dans [ADR-STUDIO-PILOTE-01](../../continuity/decisions/ADR-STUDIO-PILOTE-01.md) :
- responsabilités RESP-01 à 05 et CAD-DEC-02/03 : une seule personne habilitée, le maître d'ouvrage ;
- ADR-STUDIO-NAV-01 acceptée, option A (ADR-03) ;
- DEC-01 à DEC-18 arbitrées selon [DEC-OUVERTES-PILOTE.md](DEC-OUVERTES-PILOTE.md), dont DEC-15 (extensions et MCP) exclue du pilote ;
- POC et sous-ensemble du pilote autorisés (G2-02, G3-01, G3-04).

Recette ([RECETTE-PILOTE-2026-10-25.md](recettes/RECETTE-PILOTE-2026-10-25.md)) : les 21 recettes Studio de la CI, rejouées sur une base PostGIS jetable, donnent 1 435 contrôles réussis et 0 échec. La CI de `main` est verte sur le même commit (exécution 40192137528).

Compteurs recalculés du registre : compteurs de ce point d'étape (historique) : 16 à définir, 205 à faire, 291 en cours, 11 bloquées, 74 vérifiées, 33 acceptées ; P630 valait alors 107 sur 630. Détail :
- 27 obligations vérifiées par recette : NAV-001 à 009, 15 scénarios TEST, REC-I-02, REC-A-03, REC-C-03. NAV-008 a été vérifié après correction d'un défaut : « Réessayer » ne relançait aucun téléchargement après une panne du moteur de la planche ;
- 31 acceptations par décision (P-06 ajoute F.2-03 et F.3-01) ;
- 189 obligations bloquées par les seules décisions requalifiées « À faire » ;
- 19 scénarios TEST « En cours » avec une preuve partielle ;
- 11 obligations restent bloquées :
  - 9 obligations R attendent la recette utilisateur du maître d'ouvrage ([guide](recettes/RECETTE-UTILISATEUR-PILOTE.md)), puis G4, puis sa Release (P-07) ;
  - TEST-032 et TEST-033 recettent des fonctions absentes (illustration IA, adaptateur MCP).

Ce compteur n'est pas un taux de développement. G1 à G4 ne sont pas acceptées, aucune case source n'est cochée, et les appareils physiques et le GPU réel restent non évalués.

Prochaine action : le maître d'ouvrage joue la recette utilisateur (guide). En parallèle, compléter les 19 scénarios TEST partiels, en commençant par les manques du parcours A (TEST-010, 011, 012), puis instruire G1 à partir des preuves jointes. La production reste réservée au maître d'ouvrage.

## Décisions DEC ouvertes — 25 octobre 2026

Branche `ccr-187fd2e6-08dk6e`, base `main@3e992b6`. [DEC-OUVERTES-PILOTE.md](DEC-OUVERTES-PILOTE.md) prépare l'arbitrage de DEC-01 à DEC-18 : options du dossier, état du code, recommandation et parcours pilote concerné. Ce sont des recommandations, pas des décisions.

Prochaine action : soumettre le document au maître d'ouvrage dans #166. Ordre proposé : (1) nommer RESP-01 à 05 ; (2) arbitrer DEC-03, 01, 16, 12, 08, 09 et le report DEC-15 ; (3) fixer les appareils de DEC-13 ; (4) autoriser POC-CONTEXTE, POC-2D et POC-PUBLICATION, puis jouer NAV-001 à 009 et TEST-001. Ne promouvoir aucune obligation sans preuve.

## Dépôt du plan Axes — 25 octobre 2026

Tâche documentaire [#294](https://github.com/RachEma-ux/Fadi/issues/294), branche `docs/294-axes-implementation-plan`, base `0ff0638c3f6781bb94fce9b22c82c69c7ed7083e`. Le [plan d’implémentation Axes v1.0](Fadi-Concept-Axes%20Pan.md) est ajouté avec le nom demandé et le contenu du fichier remis à l’utilisateur : 12 lots AXE-00 à AXE-11, quatre phases et 20 scénarios AX01–AX20. Il complète la paire de concepts sans la remplacer.

Prochaine action : ouvrir la PR liée à #294 et vérifier son HEAD, son diff et ses checks. La demande présente autorise le dépôt du fichier ; elle ne lance pas l’implémentation. Si celle-ci est ensuite demandée, commencer par AXE-00, rechercher le suivi existant et revalider le dépôt. Les checkpoints antérieurs ci-dessous restent historiques ; ne pas reprendre leurs anciennes instructions de fusion comme un mandat actuel.

## Complément documentaire Axes — 23 octobre 2026

Tâche bornée [#260](https://github.com/RachEma-ux/Fadi/issues/260), branche `docs/260-axes-concept`, base vérifiée `516e2f747c15d84f8c589e5271c015e929dc37e4`. Le concept Axes v1.0 est proposé pour validation dans [la paire MD/DOCX](../../../Fadi%20Concept/README.md). Il formalise la barre d’outils, les repères et plans de travail, les origines de composants, la persistance, les limites de recherche et 20 scénarios de recette futurs.

Vérification documentaire : mêmes 356 blocs de contenu et 25 liens dans les deux formats ; titre et version concordants ; rendu Word de 13 pages contrôlé visuellement ; trois empreintes d’archives sources vérifiées. Ce contrôle ne constitue pas une recette de Fadi. L’accès navigateur au Sandbox a échoué ; les constats applicatifs reposent sur le code épinglé. Aucun test applicatif, changement de code, migration, déploiement ou modification du registre des 630 obligations dans ce lot.

Prochaine action : retrouver la PR liée à #260, vérifier son HEAD, ses fichiers et ses checks actuels, puis revoir le concept. Ne pas relancer les anciennes instructions de fusion ci-dessous. Toute mise en œuvre devra faire l’objet d’un lot cadré et d’une recette propre ; aucune acceptation des scénarios Axes n’est acquise.

## Checkpoint courant — 21 octobre 2026

Référence examinée : `main@78e9f4a89e9634189c3bd4fb9ed82576eafe2a64` (#222), après consolidation #209. Le code porte les quatre domaines Studio et les lots Sandbox 1–6 ; les anciennes instructions de fusion #181 ci-dessous sont historiques, plus une action à exécuter. La branche corrective de cet audit traite sauvegarde locale, cohérence des compteurs et nettoyage de la branche d'exploitation.

Compteurs du registre au 21 octobre (historique, remplacés le 25 octobre) : 22 à définir, 58 à faire, 292 en cours, 209 bloquées, 47 vérifiées, 2 acceptées ; P630 valait alors 49 sur 630 ; ce compteur documentaire/cadrage n'est pas un pourcentage du logiciel livré. PDEV reste non défini. Aucune tâche du registre n'a été promue à partir de la seule présence de code.

Preuves actuelles : sources au SHA ci-dessus ; vérification locale de l'audit : types, frontières, isolation, structure de continuité et affectation 630/630 réussis. Le contrôle `tableau_registre.py --controle` est réparé et ajouté à la CI par ce correctif. Résultats finaux de la branche et liens vers les exécutions : PR du correctif, à vérifier au SHA exact.

Prochaine action : terminer la CI du correctif, contrôler les trois parcours de Studio selon `docs/continuity/AUDIT-REMEDIATION-2026-10-21.md`, puis valider les scénarios métier. L'activation des checks requis nécessite une connexion administrateur ; ni une proposition JSON ni une CI verte ne prouvent son activation. L'installation du minuteur VPS, la version réellement servie et une restauration réelle ne sont pas attestées par cet audit GitHub. Les fonctions IA annoncées indisponibles restent indisponibles ; aucune conformité complète G1–G4 n'est déduite.

## Archive — checkpoint du 18 octobre 2026

Les faits et restrictions ci-dessous sont conservés pour traçabilité de cette ancienne mission. Ils ne décrivent pas l'état courant de main et ne constituent pas une nouvelle instruction de fusion ou de déploiement.


Mis à jour : 2026-10-18 (UTC).

## Point de reprise

Autorisation du propriétaire : fusionner #181. Le candidat reprend `main@050e1d46` (#172 documentaire fusionnée pendant les contrôles), conserve les registres et intègre les commits de garde DB déjà présents dans la tranche testée. Les PR #178–#180 ne sont pas fusionnées cumulativement ; leurs apports restent à raccorder à un seul socle. Aucune opération de production autorisée.

Reprendre [PR #181](https://github.com/RachEma-ux/Fadi/pull/181), branche `feat/156-studio-v1`, cible `main`, garde DB `9b34dca` / #169 incluse dans son historique. Priorité : parcours réel Studio 2D ; ne pas recommencer les inventaires de #172/149709e. Le SHA de ce fichier porte le checkpoint courant.

## Dernier état vérifié

Au code `3b7fb25d2ae8f78682c09cad5b935f0937dae4a5`, recette sur PostGIS neuf : 44 contrôles initiaux, 5 après redémarrage API/DB sur le même volume et 3 de non-régression réussis. Révision et géométrie exactes conservées ; conflits, permissions et rejeux vérifiés. Le profil neuf corrigé a été exercé intégralement ; les changements suivants concernent ce checkpoint et une fin de fichier de recette, sans changement de comportement applicatif. Acceptation utilisateur non acquise.

## Prochaine action

1. Coordonner le socle unique avec les PR concurrentes #178/#179/#180 (créées pendant ce développement) : tables/routes différentes, aucune fusion cumulative ; réutiliser les composants retenus après arbitrage #166. Continuer les vérifications indépendantes.
2. Lire les nouvelles réponses #166 et contrôler HEAD/PR #181 et sa CI exacte ; fusion de #181 autorisée par le propriétaire, à effectuer après CI du candidat réconcilié.
3. Si une anomalie de cette tranche apparaît, reproduire sur son profil jetable, corriger le code concerné et rejouer la recette. A0 reste propriétaire des fichiers de continuité ; ne pas écrire concurremment navigation, schéma, commandes ou workflows.
4. Faire constater le parcours au propriétaire. Toute ouverture d'accès distant/public requiert un périmètre explicite ; aucun tunnel n'est configuré. Préparer le prochain incrément de code à partir des références existantes, sans nouveau rapport général.

## Tests et preuves

Commande pour une **nouvelle session** après installation et build : `python3 scripts/validation/studio-v1-functional.py --keep-running`. Le script crée sa propre base vide et son propre rôle, atteste la cible, applique le SQL Studio épinglé et exécute UI/API → redémarrage → réouverture → Parcours/Atelier. Les rapports `report-*.json` et captures sont publiés en artifacts CI ; les manifests, mots de passe et comptes de recette restent privés. Les preuves locales sont dans le dossier ignoré `work/studio-v1-proof/`, avec SHA et version du navigateur.

TypeScript/builds passent. Les tests purs/web et 138 tests simulés DB/orchestration passent. Ne pas lancer `npm test` global ni les tests API historiques : leur registre de confiance DB1/2 reste fermé ; ce profil de serveur réel autorisé ne prétend pas résoudre DB3. Ne jamais appeler le migrateur historique ou `MIGRATE_ON_START=1` pour cette recette.

## Risques et blocages

Le premier lancement a révélé un oracle SVG de hauteur nulle puis une icône manquante ; les coordonnées et le tracé visible sont désormais contrôlés et les erreurs navigateur absentes. Le port Docker éphémère changeait au restart : le préflight a refusé la connexion ; futurs profils à port fixe et réattestation du même conteneur/volume/DB ont permis la recette complète. Pas de blocage applicatif connu dans ce lot ; le reste du pilote Studio et la recette métier complète restent ouverts.

## Arrêt sûr

Seuls les processus/ressources créés et identifiés par le profil peuvent être arrêtés. La base locale et son volume ont été conservés pour inspection ; credentials en fichiers600 hors Git. Si l'état privé de session n'est plus accessible, le déclarer et recréer un profil neuf ; ne pas inventer une récupération. Conserver #169/#172/#181 et les décisions historiques ; aucun push direct main, administration, migration sur cible existante, suppression de données ou production. La fusion autorisée passe par #181 et les protections GitHub effectives.

