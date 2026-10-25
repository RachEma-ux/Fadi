# État — Studio

## Phase B de production livrée côté dépôt — 25 octobre 2026

Branche `ccr-187fd2e6-08dk6e`, base `main@44c6ef4`. Ordre demandé par le maître d'ouvrage : lots de fonctions (point 3), tests des preuves partielles (point 2), portes G1 puis G4 (point 4) ; en parallèle, phase B.

Ce qui a été fait :
- **`deploy/prod/fadi-prod-auto`**, ses unités systemd, son installateur à empreintes et 121 contrôles à doubles (`deploy/prod/tests/run.sh`, joués en CI). Parmi eux : l'échec simulé de chaque sonde, avec retour à l'image précédente sans restauration de la base, et la sauvegarde non vérifiée, qui bloque tout redémarrage. Recette sur le VPS : [`docs/deploiement-automatique-recette-phase-b.md`](../../deploiement-automatique-recette-phase-b.md).
- [DOSSIER-G4.md](DOSSIER-G4.md) §4 mis à jour : scripts livrés, installation et recette sur le VPS restantes (administrateur).

Compteurs recalculés du registre : **0 À définir / 92 À faire / 210 En cours / 11 Bloqué / 259 Vérifié / 58 Accepté**. **P630=317/630** (inchangés : les obligations R restent bloquées tant que le service n'est ni installé ni recetté sur le VPS).

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

Compteurs recalculés du registre : **0 À définir / 92 À faire / 210 En cours / 11 Bloqué / 259 Vérifié / 58 Accepté**. **P630=317/630**.

Ce qui reste, et pourquoi :
- 9 obligations R : G4 non franchie, phase B de production (`fadi-prod-auto`) absente du dépôt, Release réservée au maître d'ouvrage ;
- TEST-032 et TEST-033 : fonctions IA et MCP absentes ;
- les autres obligations ouvertes portent sur des fonctions absentes, des mesures sur appareil réel, des données réelles (exclues de la délégation) ou des portes G1 à G4.

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

## Décisions DEC ouvertes — 25 octobre 2026

Préparation documentaire sur `main@3e992b6` : [DEC-OUVERTES-PILOTE.md](DEC-OUVERTES-PILOTE.md). Le recalcul du registre confirme les compteurs du 21 octobre (47 Vérifié, 2 Accepté, 209 Bloqué, 292 En cours, 58 À faire, 22 À définir). Le document compare DEC-01 à DEC-18 à l'état du code et recommande une option par décision. Il rappelle que le pilote est déjà ratifié (CAD-DEC-01, parcours A/B/C). Aucun statut du registre n'est modifié, aucune décision n'est prise et aucun POC n'a été exécuté.

## Dépôt du plan Axes — 25 octobre 2026

Tâche documentaire [#294](https://github.com/RachEma-ux/Fadi/issues/294), branche `docs/294-axes-implementation-plan`, base `0ff0638c3f6781bb94fce9b22c82c69c7ed7083e`. Le [plan d’implémentation Axes v1.0](Fadi-Concept-Axes%20Pan.md) est ajouté avec le nom demandé et le contenu du fichier remis à l’utilisateur : 12 lots AXE-00 à AXE-11, quatre phases et 20 scénarios AX01–AX20. Il complète la paire de concepts sans la remplacer.

Vérifié documentairement : structure des lots et matrice AX01–AX20 ; fichier source de 43 030 octets, SHA-256 `4d804f883a33360d46b502911485cd72decab13837a4eb3e9296107a431ded21`. La vérification du blob publié et la CI de la branche sont consignées dans la PR liée à #294. Le plan reste proposé : aucun lot Axes exécuté, aucun changement du registre Studio, aucune recette applicative ni acceptation métier déduite de ce dépôt.

## Complément documentaire Axes — 23 octobre 2026

Tâche bornée [#260](https://github.com/RachEma-ux/Fadi/issues/260), branche `docs/260-axes-concept`, base vérifiée `516e2f747c15d84f8c589e5271c015e929dc37e4`. Le concept Axes v1.0 est proposé pour validation dans [la paire MD/DOCX](../../../Fadi%20Concept/README.md). Il formalise la barre d’outils, les repères et plans de travail, les origines de composants, la persistance, les limites de recherche et 20 scénarios de recette futurs.

Vérification documentaire : mêmes 356 blocs de contenu et 25 liens dans les deux formats ; titre et version concordants ; rendu Word de 13 pages contrôlé visuellement ; trois empreintes d’archives sources vérifiées. Ce contrôle ne constitue pas une recette de Fadi. L’accès navigateur au Sandbox a échoué ; les constats applicatifs reposent sur le code épinglé. Aucun test applicatif, changement de code, migration, déploiement ou modification du registre des 630 obligations dans ce lot.

État de ce complément : **Vérifié documentairement sur la branche**, proposition métier non acceptée. La publication est soumise à la PR liée à #260 ; fusion et CI ne sont pas déduites des contrôles locaux. Les checkpoints des autres lots ci-dessous conservent leur portée historique.

## Checkpoint courant — 21 octobre 2026

Référence examinée : `main@78e9f4a89e9634189c3bd4fb9ed82576eafe2a64` (#222), après consolidation #209. Le code porte les quatre domaines Studio et les lots Sandbox 1–6 ; les anciennes instructions de fusion #181 ci-dessous sont historiques, plus une action à exécuter. La branche corrective de cet audit traite sauvegarde locale, cohérence des compteurs et nettoyage de la branche d'exploitation.

Compteurs du registre au 21 octobre (historique, remplacés le 25 octobre) : 22 à définir, 58 à faire, 292 en cours, 209 bloquées, 47 vérifiées, 2 acceptées ; P630 valait alors 49 sur 630 ; ce compteur documentaire/cadrage n'est pas un pourcentage du logiciel livré. PDEV reste non défini. Aucune tâche du registre n'a été promue à partir de la seule présence de code.

Preuves actuelles : sources au SHA ci-dessus ; vérification locale de l'audit : types, frontières, isolation, structure de continuité et affectation 630/630 réussis. Le contrôle `tableau_registre.py --controle` est réparé et ajouté à la CI par ce correctif. Résultats finaux de la branche et liens vers les exécutions : PR du correctif, à vérifier au SHA exact.

Prochaine action : terminer la CI du correctif, contrôler les trois parcours de Studio selon `docs/continuity/AUDIT-REMEDIATION-2026-10-21.md`, puis valider les scénarios métier. L'activation des checks requis nécessite une connexion administrateur ; ni une proposition JSON ni une CI verte ne prouvent son activation. L'installation du minuteur VPS, la version réellement servie et une restauration réelle ne sont pas attestées par cet audit GitHub. Les fonctions IA annoncées indisponibles restent indisponibles ; aucune conformité complète G1–G4 n'est déduite.

## Archive — checkpoint du 18 octobre 2026

Les faits et restrictions ci-dessous sont conservés pour traçabilité de cette ancienne mission. Ils ne décrivent pas l'état courant de main et ne constituent pas une nouvelle instruction de fusion ou de déploiement.


Mis à jour : 2026-10-18 (UTC).

## État

Autorisation du propriétaire : fusionner #181. Le candidat reprend `main@050e1d46` (#172 documentaire fusionnée pendant les contrôles), conserve les registres et intègre les commits de garde DB déjà présents dans la tranche testée. Les PR #178–#180 ne sont pas fusionnées cumulativement ; leurs apports restent à raccorder à un seul socle. Aucune opération de production autorisée.

**STUDIO-V1 : Vérifié par recette automatique, acceptation utilisateur à obtenir.** [PR #181](https://github.com/RachEma-ux/Fadi/pull/181), `feat/156-studio-v1`, contenant les commits déjà testés de la garde DB [#169](https://github.com/RachEma-ux/Fadi/pull/169) / `9b34dca`. Le propriétaire a autorisé le code et le profil neuf/jetable ([ACK #166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6251787753)). Le propriétaire a autorisé la fusion en chat (« Vas y fusionne »). La production reste exclue.

La priorité est fonctionnelle : Fadi → Studio → projet autorisé → étude/variante → dessin 2D → modification → sauvegarde → fermeture/réouverture. Les préparations historiques restent dans [#172 / 149709e](https://github.com/RachEma-ux/Fadi/pull/172), sans nouvelle campagne documentaire ni clôture globale des missions/630 obligations.

## Faits vérifiés

- Recette réelle au [code 3b7fb25](https://github.com/RachEma-ux/Fadi/commit/3b7fb25d2ae8f78682c09cad5b935f0937dae4a5) : **44 contrôles initiaux + 5 après redémarrage API/PostgreSQL + 3 de non-régression réussis**. Même document et même révision après redémarrage sur le même volume ; refus 401/403/404/409/400, concurrence, rejeu idempotent et instantané historique vérifiés. Ce sont des contrôles de recette, pas 52 fonctionnalités acceptées.
- UI réellement exercée : tracé à deux clics, rectangle numérique, sélection clavier, édition/déplacement, confirmation serveur, nouvelle session, mobile FR/EN. Le niveau Atelier est réellement persisté et son interface synchronisée ; Parcours conserve ses 21 étapes. Revues indépendantes A2/A5 favorables, captures inspectées par A5.
- TypeScript et builds réussis ; suites pures/web **1 691 tests réussis, un ignoré**, garde DB/orchestrateur **138 tests simulés réussis**. La suite API historique avec remise à zéro de base n'a pas été exécutée ; DB3 reste distinct.
- Profil local : PostgreSQL16/PostGIS3.4 neuf, rôle applicatif non administrateur, Node24/Chromium154. Identité/labels/volume/repère/endpoint vérifiés avant connexion ; reprise après changement de port Docker contrôlée. Secrets et état des comptes de recette hors Git. Les artifacts CI sont limités aux rapports expurgés et captures synthétiques.
- Main revalidée `050e1d46` après fusion externe de #172 ; les ajouts documentaires et registres de #172 sont conservés. #169 est incluse comme dépendance de code de #181, pas comme nouvelle portée fonctionnelle. La CI du HEAD publié est à consulter dans [les contrôles #181](https://github.com/RachEma-ux/Fadi/pull/181/checks) ; une preuve locale ne vaut pas conclusion CI.

## Points ouverts

**Coordination d’intégration nouvelle :** #178/#179/#180 ont été créées en parallèle après le démarrage autorisé de ce lot. Elles proposent navigation/études/variantes avec tables et routes différentes de #181. Ne pas fusionner cumulativement deux hiérarchies Studio. A2 qualifie seulement le raccord de code ; [arbitrage Q-STUDIO-SINGLE-SOURCE-01](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6252110312), sans bloquer la CI ni les preuves #181.

La validation personnelle et l'accès distant à la démo ne sont pas acquis. L'application locale est conservée sur la boucle locale du Cloud ; aucun tunnel public n'a été ouvert. Le périmètre suivant (2D pilote complet, 3D, association, Tool Manager, approbation/publication) n'est pas livré par cette tranche. Les preuves de ce lot ne ratifient pas les portes globales G1–G4 ni le MVP complet.

## Liens de suivi

[Programme #156](https://github.com/RachEma-ux/Fadi/issues/156) · [Canal #166](https://github.com/RachEma-ux/Fadi/issues/166) · [PR de code #181](https://github.com/RachEma-ux/Fadi/pull/181). A0 intègre ; A2 modèle/contrats, A3 API, A4 interface, A5 recette indépendante, A6 profil/CI ont réellement travaillé. A1 n'a pas été mobilisé pour ce lot de code.

## Préconditions de clôture

Vérifier la CI au SHA exact, faire constater le parcours au propriétaire et recueillir son acceptation. Fusion de #181 autorisée explicitement par le propriétaire après vérification du candidat réconcilié ; cette autorisation ne vaut pas constat d’une recette personnelle ni clôture du MVP. Le SQL Studio est appliqué uniquement à la base neuve attestée ; aucun migrateur, schéma existant, sauvegarde, réglage GitHub ou déploiement de production n'est autorisé implicitement.

