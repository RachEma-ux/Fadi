# Mission 002 — A1 Produit et méthodologie

Date : 18 octobre 2026. Analyse statique et préparation uniquement. Référence locale examinée : `aadd083ca282ed7db8af31f0fb3724c861b5107f`. A0 revalide séparément le `main` distant et la CI. Aucun code, fichier de suivi du dépôt, Issue, PR ou réglage GitHub modifié. Aucun test applicatif/mutateur exécuté par A1.

## Résultat et limites

Studio est une cible produit autonome définie avec précision ; ce n'est pas encore un module déclaré dans le routage et le registre locaux. Fadi fournit des composants candidats substantiels : dessin, géométrie libre, objets architecturaux, commandes, variantes, versions, publications et moteurs. Leur présence permet d'éviter une reconstruction systématique, mais ne démontre pas les trois parcours Studio ni la hiérarchie Étude/Variante/Révision.

Les 630 cases ont été lues et recomptées : **630 identifiants uniques, 630 cases décochées**. Elles mélangent réalisation, instruction, contrôles récurrents, tests, jalons et traçabilité. Elles ne représentent ni 630 fonctions indépendantes ni 630 fonctions manquantes. Aucune case n'a été cochée. Les résultats historiques 1 757 tests / 47 scénarios / trois validations IFC ne deviennent pas des preuves de conformité Studio sur le SHA courant.

Fichiers de travail produits hors dépôt :

- `A1-630-taches.csv` : les 630 identifiants et libellés sources, groupe, responsable proposé, dépendances, état de préparation, limite de preuve et acceptation. **Qualification initiale par groupe**, pas audit fonctionnel individuel exhaustif ni décision d'avancement ; les valeurs À définir/Bloqué organisent la prochaine action, pas une mesure du code livré.
- `A1-exigences.csv` : les textes exacts des 104 exigences EX, extraits du référentiel technique. Complète les 141 tâches TR sans inventer de libellés ; les fiches individuelles restent à compléter en contrats, composants et preuves.

## Sources réellement lues

AGENTS.md, CLAUDE.md, docs/architecture.md, docs/continuity/README.md, docs/workstreams/README.md, HANDOFF puis STATUS/TASKS/CONTEXT de `architecture-webapp` et `purge-drawall`. Sources Studio : plan Markdown V1.0 complet, checklist complète disponible dans le scratch A0, texte et tableaux des deux DOCX extraits dans le scratch. Décisions D-174, D-177, D-182, D-193 et consignes Planche D-202/D-203 consultées. A0 centralise la lecture GitHub de la PR #154 ; A1 ne déclare pas avoir vérifié sa version distante.

Fichiers de code examinés : App.tsx, module-registry.ts, base des commandes Atelier, schéma SQL (versions/variantes/publications), registre JSON du Parcours, chemins des composants candidats. Pas d'audit d'exécution exhaustif des moteurs par A1.

## Préséance et conflits à porter à l'arbitrage

1. Les règles du dépôt et décisions acquises restent applicables. La charte Studio fixe la finalité ; le référentiel détaille les contrats ; le plan et la checklist proposent leur réalisation. Une observation historique de code ne réduit jamais la cible.
2. `docs/architecture.md` décrit sept modules et Planche dans Atelier. Studio ajoute une responsabilité autonome sans suppression de l'Atelier. La demande Mission 002 fixe cette direction ; l'architecture d'intégration et le propriétaire d'écriture restent à décider dans un ADR, pas à déduire d'une ancienne décision Planche.
3. La charte V2.1 porte encore « Texte de référence à adopter », le référentiel « proposée à validation » et le plan « proposé à validation ». La mission confirme les invariants essentiels Studio, mais ne ferme pas automatiquement G0 ni les DEC. Demander ratification explicite du dossier et du pilote ; ne pas réécrire les statuts historiques.
4. La fin de la charte renvoie à `Fadi_Studio_Concept_V2_Outils_Modulaires_Performance.md`, « 10 chapitres et 3 annexes », tandis que le référentiel détaillé V1.0 lu comporte 22 chapitres et quatre annexes et se présente comme seule spécification technique de travail. Le fichier Concept V2 n'est pas dans le dossier Studio local. **Conflit de référence à arbitrer** : confirmer V1.0 STUDIO-RT-001 comme source technique applicable et traiter l'ancienne référence par décision documentaire explicite.
5. La matrice d'échanges cible mentionne DWG sous condition ; D-179 antérieurement renonce à DWG/DGN. Aucune réouverture implicite de licence/format. Exclure DWG du pilote, proposer son éventuel réexamen seulement sur nouvelle décision.
6. Les acceptations Atelier/Planche D-174/D-193 conservent les limites déclarées ; elles ne certifient ni Studio, ni IFC paramétrique, ni mesure téléphone. La délégation historique de lots Planche n'autorise aucune réalisation Studio dans cette mission.

## Conservation du Parcours

Vérification statique actuelle de `apps/api/src/data/parcours-steps.json` : version 8.19.0, **21 numéros exactement 1 à 21, six phases**, dans l'ordre ci-dessous. Cette lecture ne prouve pas l'affichage mobile ni toute la correspondance avec le prototype HTML absent ; ces recettes restent à exécuter sur le build autorisé.

| Phase | Numéros et libellés source |
|---|---|
| Comprendre le site | 01 Parcelle / Site existant ; 02 Réglementation & constructibilité ; 03 Marché & demande |
| Programmer | 04 Idée & stratégie ; 05 Besoins & concertation ; 06 PMO — Programme du maître d’ouvrage ; 07 Préprogramme fonctionnel ; 08 Exigences techniques & environnementales |
| Concevoir / Tester | 09 Compatibilité Parcelle ↔ Programme ; 10 Étude de capacité architecturale ; 11 Esquisse architecturale — Esquisser ; 12 Scénarios de développement |
| Prouver la faisabilité | 13 Faisabilité technique ; 14 Faisabilité économique & financière ; 15 Coût global & sensibilités ; 16 Vérifications / Due diligence |
| Arbitrer | 17 Évaluation multicritère ; 18 Bilan du potentiel de la parcelle ; 19 Décision — GO / GO sous conditions / À reprendre / NO GO |
| Engager | 20 Organisation des études — uniquement si GO ; 21 Transfert vers développement / conception |

Acceptation de non-régression proposée : mêmes numéros/ordre/phases/libellés français et traductions, cartes mobiles, données existantes et liens Harmonie ; Studio ne crée ni ne valide d'étape. Une capture d'entrée Studio ne suffit pas.

## Qualification des groupes couvrant les 630 cases

| Groupe | Nombre | Réutilisable / écart constaté ou à qualifier | Responsable / dépendances / acceptation |
|---|---:|---|---|
| 1 Sources, cadrage | 18 | Documents disponibles ; adoption/pilote/attribution restant à décider. | A0/A1 ; ratification G0 et sources empreintées, inclus/exclus et responsables nommés. |
| 2 Insertion | 36 | AppShell/auth/lazy existants ; aucune route Studio dans App.tsx, aucun descripteur Studio. Contrat navigation à spécifier. | A4/A2 ; ADR navigation + DEC-03 ; NAV-001–009 sur build, mobile/clavier/permissions. |
| 3 Architecture | 24 | Monolithe et packages purs réutilisables ; trois autorités 2D/3D/associée et interfaces Studio à décider. | A2 ; DEC-01/02/03/12/18 ; un propriétaire par donnée, pas de dépendance Parcours. |
| 4 Portes | 19 | Leurs critères sont documentés ; aucun passage G0–G4 n'est démontré par ce rapport. | A0 ; preuves puis décisions enregistrées pour chaque sous-ensemble. |
| 5 Lots | 214 | Socles Atelier présents, intégration Studio absente du routage ; détails ci-dessous. | A1/A2/A4/A5/A6 préparent, A3 inactif ; code après G3 explicite. |
| 6 Séquence/jalons/pilote | 25 | Séquence déjà proposée ; chiffrage/disponibilité/appareils inconnus. | A0/A1 ; J0–J8 ne ferment pas des capacités non prouvées ; pas de date arbitraire. |
| 7 Validation | 19 | Scénarios prescrits ; aucun nouveau parcours Studio exécuté. | A5/A1 ; trois résultats métier complets, défauts éliminatoires absents. |
| 8 Migration/exploitation | 26 | Schémas et sauvegardes Fadi candidats ; migration Studio non réalisée. | A6/A2/A5 ; corpus avant/après, identité, restauration ; autorisations séparées. |
| 9 GitHub/continuité | 24 | Protocole existe ; dossier studio absent de l'inventaire local. | A0 ; proposer quatre fichiers + registre, sans publication avant accord. |
| 10 Décisions/risques | 15 | Risques source et besoin ADR navigation explicites. | A2/A0 ; risques rattachés aux DEC et preuves, aucun arbitrage tacite. |
| 11 Passage/clôture | 8 | Contrôles de consolidation futurs. | A0/A1 ; pas de pilote livré avant E/R/recette. |
| Annexe A scénarios | 38 | Prescriptions distinctes ; pas 38 tests déjà réussis. | A5 ; preuve par build/corpus/environnement/verdict ; options exclues justifiées. |
| Annexe B décisions | 18 | Toutes ouvertes dans les documents ; instruction ci-dessous. | A2 + décideur humain ; décision inscrite avec alternatives et preuves. |
| Annexe C traçabilité | 141 | 104 EX + 15 INV + 11 IF + 11 AC ; fiches non réputées conformes. | A1/A2/A5 ; texte exact, contrat, composant, positif/négatif, preuve, DEC, état. |
| Annexe D provenance | 5 | Blobs déclarés par le plan ; A0 vérifie empreintes. | A0 ; préserver références historiques et changements de découpage. |
| Total | **630** | Aucune estimation de pourcentage implémenté fiable tirée des cases. | Ne pas sommer tests répétés et réalisation comme fonctions distinctes. |

### Lots et capacités candidates

| Lot | Candidat existant | Écart et preuve à obtenir | Critère mesurable / agent |
|---|---|---|---|
| I, P0 | Auth, AppShell, routes différées | Ajouter une enveloppe autonome, contexte et quatre domaines ; absence Studio dans App.tsx/module-registry.ts examinés. | NAV-001–009 ; ouverture directe sans Parcours/Atelier, refus sans fuite ; A4/A2 puis A3 autorisé. |
| A.1, P0 | `schema.ts:486` versions, `:499` variantes, `:538` publications ; commandes `base.ts:9–24` v3/requestId/baseRevision | Les variantes existantes sont des projets bifurqués. Ce n'est pas le modèle Étude → Variante spécifié ; pas d'identifiant studyId trouvé dans les zones examinées. | Création étude avant géométrie, sauvegarde/réouverture, deux variantes isolées, révision immuable, droits transverses ; A2/A1. |
| A.2, P0 | `nouveau/plan2d`, primitives/annotations/calques existants | Rendre le document 2D réellement indépendant et publiable ; une projection de bâtiment n'est pas ce document. | TEST-001 intégral, aucun 3D de substitution ; A1/A2/A5. |
| A.3, P0 | `packages/planche-model`, vue Planche, outils faces/volumes | Qualifier entrée/spatial direct, identité/sauvegarde et vue/coupe sans esquisse imposée. | TEST-002 et export/réouverture dans le contexte Studio ; A2/A5. |
| A.4/A.5, P0 | Objets/hôtes, bus de commandes, deltas/historique, versions Atelier | Contrat associations/références/copies et topologie Studio ; association ne se déduit pas de deux affichages. | TEST-003–014 ; 3,180 puis 3,096 m³, même mur, atomicité, conflit, déduplication ; A2/A5. |
| B, P0 | Catalogues/outils/barres et machines Planche | Registry léger, gouvernance, profils et Manager sans moteur propre ; vérifier coût réel imports/précache. | TEST-016–021/036 ; pas de chargement de moteurs rares par simple barre de vingt outils ; A2/A4/A5. |
| X, P0 transversal | Tests, CI, benchmarks historiques, protocole continuité | Corpus autorisés S1–S7, oracles et matrice versionnée actuelle. | 15 invariants avec positif/négatif/preuve ; EX/IF/AC reliés ; A5 avec A1/A2/A6. |
| C, P1 | accrochage.ts, scene3d.ts, picking | Choix index/rendu après mesure, pas réécriture imposée. | TEST-022–025, même cible/point/priorité/identité, métriques avant/après ; A2/A5. |
| D, P1 | OCCT worker persistant à la demande, worker documentaire | Cycle erreur/recréation/jobs périmés/quotas/mémoire à qualifier. | TEST-014/015/037, attente résolue et modèle intact ; A2/A6/A5. |
| E, P1 requis MVP | `atelier-model/src/documents`, versions/publications, contrôles/observations | Approbation exacte multi-sources, permissions distinctes, étude complète. La publication Atelier ne prouve pas automatiquement ce contrat. | TEST-001/009/010/026–031/038 et 018/035 selon périmètre ; A1/A2/A5. |
| F, P2 conditionnel | Capacités avancées candidates | IA/extensions/MCP/fournisseurs non autorisés ; ni condition artificielle d'I/A ni disponibles par catalogue. | Contrat/droits/confidentialité/coûts + tests propres ; A2/A5. |
| R | Sauvegarde et historique Fadi | Migration Studio/rollback non exécutés ; aucune bascule autorisée. | TEST-034–036, corpus avant/après, recette A/B/C et décision de déploiement séparée ; A6/A5. |

### Matrice exigences → composants → tests → preuves

Toutes les cellules de preuve métier Studio ci-dessous restent **à produire sur un build identifié**. Les chemins désignent des candidats ; leur existence est une preuve statique limitée.

| Exigences | Candidats | Scénarios prescrits / décision |
|---|---|---|
| EX-001–007 | AppShell/App.tsx, Atelier/Planche ; enveloppe Studio manquante | TEST-001–003 + NAV ; DEC-01/02/03 et ADR navigation |
| EX-008–019 | Commandes, effets, modèle et schema.ts | 008/011–014/034/035 ; DEC-03/12/18 |
| EX-020–025 | plan2d et planche-model | 001–010/022 ; DEC-01/02/09 |
| EX-026–044 | Catalogues, préférences, machines, Vite/service worker/Dexie | 016–021/036 ; DEC-04/05/06/07/14 |
| EX-045–049 | Enveloppe, historique/deltas, synchronisation | 011–015/021 ; DEC-12 |
| EX-050–063 | scene3d, vue-planche, accrochage, exact worker | 014/015/022–025/037 ; DEC-08/09/10/11/13/17 |
| EX-064–070 | Atelier, programmation/analyses, coordination | 009/010/027–029 ; DEC-02/16 |
| EX-071–073 | Scènes/caméras, présentation | 026/032 si option ; DEC-15/17 |
| EX-074–086 | Documents, publications, collaboration | 001/009/010/018/028–031/038 ; DEC-16 |
| EX-087–096 | API/schémas/contrôles de droits, CI et sauvegardes | 013/018/033 si option/034–036 ; DEC-03/18 |
| EX-097–104 | Corpus/bench/tests/registre à constituer | 022–025/037 + preuves par exigence ; DEC-13 |

## Instruction individuelle des DEC-01 à DEC-18

Libellés ci-dessous repris exactement de l'annexe B du référentiel. **État : À définir pour chaque décision** ; aucune clôture ni choix technologique imposé par A1.

| ID | Question exacte | Instruction et preuves / responsable / moment bloquant |
|---|---|---|
| DEC-01 | Modèle physique du dessin 2D autonome et son stockage. | Comparer adaptation du dessin existant et document 2D dédié sans double autorité ; schéma, création sans 3D, sauvegarde/reprise/migration ; A2+A1 ; G3 A. |
| DEC-02 | Sémantique des associations et références topologiques 2D/3D. | Contrat trois relations, correspondance face/cote ambiguë, hôtes et propagation ; TEST-003–010 ; A2+A5 ; G3 A.4. |
| DEC-03 | Définition Étude / Variante / Révision et migration des projets. | Comparer hiérarchie cible au projet bifurqué existant ; identités, isolation et restauration ; A2+A1+A6 ; G3 A.1 et contexte I. |
| DEC-04 | Profils standard, métier, personnels et partage d’équipe. | Définir propriétaire/version/conflits/raccourcis sans droit induit ; A1+A4 ; G3 B, partage équipe optionnel. |
| DEC-05 | Support et gouvernance des manifests Registry. | Schéma léger, contrôle build/runtime, provenance et compatibilité ; A2+A5 ; G3 B. |
| DEC-06 | API et limites du Tool Manager. | Cycle découverte→chargement→activation/désactivation, erreurs et geste pendant changement ; A2+A4 ; G3 B. |
| DEC-07 | Granularité des chunks, préchargement et cache. | Mesurer froid/chaud réseau/exécution/mémoire ; ne pas imposer un chunk par outil ; A2+A6+A5 ; G3 B. |
| DEC-08 | Renderer 2D cible et seuil d’optimisation/bascule. | Garder renderer candidat pour étude de faisabilité ; décider tout remplacement après fidélité/export/accessibilité/GPU réel ; A2+A4+A5 ; décision du rendu retenu avant G3 périmètre, optimisation ultérieure non bloquante sans charge l'exigeant. |
| DEC-09 | Structure de l’index spatial et algorithme de snapping. | Oracle exact et densités S1–S3, insertion/suppression, p95 ; A2+A5 ; G3 C, ne bloque pas cadrage I/A. |
| DEC-10 | Invalidation partielle de la scène 3D. | Rebuild de référence vs lots, picking et dépendants/hôtes ; A2+A5 ; G3 C. |
| DEC-11 | Gestion des workers, mémoire et OCCT. | Crash, attente, recréation, quotas et ancien résultat ; A2+A6+A5 ; protections minimales avant toute opération lourde exposée, ordonnanceur complet D ensuite. |
| DEC-12 | Historique et undo/redo entre sous-modèles. | Adapter commandes/deltas/snapshots sur cas concurrent réel ; A2+A5 ; G3 A.5, pas de promesse O(1). |
| DEC-13 | Appareils, profils de charge et budgets de performance. | Choisir appareils réels, scènes S1–S7 et méthode ; mesurer avant seuils ; A1+A5+A6 ; protocole X dès début, budgets avant acceptation performance. |
| DEC-14 | Profil et stratégie des outils utilisables hors ligne. | Contrat cache présent/absent, files pendantes, quota/upgrade/reconnexion ; A2+A4+A6 ; G3 B/R. |
| DEC-15 | Extensions et adaptateur MCP, si retenus. | Option exclue du MVP proposé ; instruction sécurité/confidentialité/consentement si rouverte ; A2+A5 ; G3 F seulement. |
| DEC-16 | Manifeste de publication multi-sources. | Liste versions/empreintes/contrôles/approbation, permissions distinctes et retrait journalisé ; A1+A2+A5 ; G3 E, conception du contrat dès G1 car MVP terminable en dépend. |
| DEC-17 | Qualité adaptative et concessions graphiques admises. | Comparaison visuelle sans modification données/snapping/cotes ; A1+A2+A4+A5 ; G3 C/F selon options. |
| DEC-18 | Réutilisation effective des moteurs et services Fadi. | Inventaire conserver/compléter/corriger/isoler/remplacer/retirer, tests/coûts/licences sur SHA cible ; A2+A6+A5 ; G3 de chaque lot, pas une clôture globale fictive. |

Ajouter **une ADR de navigation distincte** couvrant position proposée après Projets, routes candidates, droits, contexte, mobile, plein écran et coexistence. Elle ne remplace aucune DEC existante.

## Portes et ordre d'exécution proposés

| Porte | Dossier attendu | État et autorisation |
|---|---|---|
| G0 | Sources applicables, pilote terminable, responsables et exclusions | Préparé ici en proposition ; ratification humaine encore requise. |
| G1 | Contrats navigation/données/outils, droits/historique/manifeste, matrice EX/INV/IF/AC et risques | Préparation autorisée ; contrats complets à instruire avant fermeture. |
| G2 | POC ciblés autonomies/association/chargement/conflits/reprise/publication avec corpus S1–S7 | Définir maintenant ; exécution de POC avec code à autoriser séparément. Aucune exécution A1. |
| G3 | DEC critiques du sous-ensemble, interfaces, migration/rollback, lot borné/chiffrage | Bloqué sur preuves/arbitrages ; autorisation explicite de réalisation. |
| Réalisation | I + X + A.1 ; B parallèle sur contrats stables ; A.2/A.3 ; A.4/A.5 ; C/D nécessaires ; E ; R | A3 reste inactif ; aucun lot ouvert par ce rapport. |
| G4 | Build identifié, recette des trois parcours, sécurité/non-régression/mesures/restauration et décision utilisateur | Acceptation métier puis déploiement autorisé séparément ; F reste conditionnel. |

Chemin critique : **DEC navigation/03 → I/X/A.1 → deux autonomies → association/concurrence → E publication → R/G4**. Des contrats et corpus de E peuvent être préparés en parallèle ; son étiquette P1 ne permet pas d'omettre E du MVP terminable. C/D ne bloquent pas artificiellement toute étude mais leurs protections nécessaires précèdent les fonctions exposées.

## Proposition de MVP métier à ratifier

Pilote suggéré : étude synthétique d'un petit local/pavillon sur projet de test autorisé, avec un plan d'aménagement 2D indépendant, une variante volumétrique 3D libre, puis une variante architecturale associée contrôlée et documentée. Dimensions, programme et règles sont des **données de corpus déclarées**, pas des prescriptions réglementaires inventées. Jeu distinct du test mur/ouverture, trop petit pour prouver seul l'utilité métier.

Quatre domaines visibles et utiles ; outils usuels à sélectionner par les tâches du pilote, pas par un quota marketing de vingt outils. Exclure initialement IA externe, MCP, extensions tierces, immersion/rendu avancés et DWG ; conserver au catalogue les autres capacités avec état réel, sans les supprimer.

| Parcours | Début → fin exigée | Preuves d'acceptation |
|---|---|---|
| A — 2D indépendante | Studio → projet/étude/variante → créer/modifier/calques/précision/cotes/annotations → sauvegarder/fermer/rouvrir → vue/feuille → publication approuvée | TEST-001 intégral ; aucun 3D créé implicitement ; contenu restitué et dossier immuable. |
| B — 3D indépendante | Studio → étude/variante → créer spatialement/arêtes/faces/volume → modifier/transformer → sauvegarder/rouvrir → vue ou coupe plane | TEST-002 ; aucune esquisse 2D imposée ni sémantique BIM implicite ; sauvegarde et provenance contrôlées. |
| C — associée | Même objet mur/ouverture depuis 2D/3D → métrés/contraintes/hôtes → annuler/rétablir → conflit deux sessions → observation/correction/recontrôle → approbation/publication | TEST-003–014/027/029–031/038 ; indépendance d'une copie ; volumes simplifiés 3,180 puis 3,096 m³ et historique conservé ; accès interprojets refusé. |

La sortie doit être un dossier utilisable et retrouvable, pas un rendu ni une rangée de boutons. Le build doit conserver Parcours/Atelier et les fonctions industrielles ; les imports IFC en représentations/proxys ne démontrent ni round-trip paramétrique ni certification BIM.

## Mission A1 suivante prête à lancer

« Sur le SHA main revalidé par A0, lire AGENTS/CLAUDE, continuité et les quatre fichiers du chantier s'ils existent ; rapprocher la charte V2.1, STUDIO-RT-001 et la checklist sans cocher de réalisation. Compléter les 104 fiches EX et les critères des trois parcours avec A2/A5, proposer le pilote synthétique et les outils usuels, confirmer les six phases/21 étapes, enregistrer les divergences documentaires et les exclusions. Livrer matrice exigences→contrat→composant→test positif/négatif→preuve→DEC, et dossier G0/G1 arbitrable. Aucune modification applicative/GitHub ni recette mutatrice sans mandat ultérieur. Acceptation : 104 EX uniques, quatre domaines/trois parcours terminables, aucune obligation critique non affectée ni résultat historique présenté actuel. »

Décisions humaines demandées : (1) ratification des références applicables et correction future du renvoi Concept V2 ; (2) choix du pilote et données autorisées ; (3) responsabilités et approbateur/publieur ; (4) emplacement/routage Studio ; (5) priorisation des DEC critiques et autorisation de POC G2 bornés ; (6) validation des exclusions MVP, notamment DWG/IA/MCP ; (7) aucune ouverture A3 avant G3 du sous-ensemble.

## Complément de preuve de provenance et requalification des seules tâches accomplies

`git hash-object` exécuté par A1 le 18 octobre 2026 donne :

| Document | Blob local réellement calculé |
|---|---|
| Définition officielle V2.1 DOCX | `e1d61ca38809e1faac6111c5ffb0881619b9a6dc` |
| Référentiel détaillé V1.0 DOCX | `ce7cf463e34c92c0178fa0c0b495569a13c7fe32` |
| Plan V1.0 Markdown | `db5588eca8980efcd7276c1cc2182b9070c6eb38` |

`git rev-parse HEAD` donne `aadd083ca282ed7db8af31f0fb3724c861b5107f`, et `git status --porcelain=v1` est vide au terme du travail A1. A0 communique la référence main `27c0c5a` et le rapprochement de code identique ; c'est une preuve A0 à joindre, pas une consultation distante faite par A1.

Dans le CSV, **six tâches seulement** sont marquées Vérifié avec une portée documentaire exacte : SRC-01/02/03, PROV-01/02 et REP-01. Ce sont des contrôles sources/version/empreinte ou relevé HEAD effectivement réalisés et enregistrés dans les artefacts de Mission 002 ; aucune ne déclare une capacité Studio conforme. Les autres états restent une proposition initiale par groupe, à préciser lors du prochain lot. Aucune case source n'est cochée et aucune tâche n'est déclarée Accepté.

Les invariants autonomie Studio, quatre domaines, deux planches indépendantes et préservation du Parcours sont **déjà fixés par la Mission 002** ; il ne faut pas demander de les décider à nouveau. L'arbitrage proposé concerne le renvoi documentaire ancien, le pilote, les routes et les choix techniques encore ouverts, ainsi que le passage des portes. G0 ne doit donc pas être utilisé pour rouvrir ces invariants.
