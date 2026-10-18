# Mission 002 — A2 Architecture

Analyse statique en lecture seule, 18 octobre 2026. Dépôt local `/workspace/Fadi`, HEAD `aadd083ca282ed7db8af31f0fb3724c861b5107f`. Les constats ci-dessous portent sur cette copie ; A0 doit rattacher le delta documentaire au `main` distant. Aucun code, test destructif, migration, commit ou appel administratif effectué. Rapport de préparation, aucune capacité Studio acceptée.

## Références et limites

Lecture des règles AGENTS/CLAUDE, architecture, continuité, chantiers architecture-webapp et purge-drawall (HANDOFF, STATUS, TASKS, CONTEXT), plan Studio et extraits des deux Word fournis dans `work/mission002`. Checklist exploitée comme obligations, non comme inventaire d'absences. Certaines sorties longues de lecture ont été tronquées par le terminal ; cette analyse ne revendique donc pas une vérification sémantique ligne par ligne de la totalité du corpus. A1/A0 consolident la lecture intégrale. Ni architecture de production ni exécution des parcours Studio observées.

La préséance de continuité distingue le constat du code de l'autorité métier. Les références documentaires proposées Studio ne valent pas autorisation d'implémentation. Le mandat de mission fixe déjà autonomie, quatre domaines, deux planches et conservation Atelier/Parcours ; les choix physiques demeurent ouverts.

## Constats requalifiés et preuves

| ID | Priorité | Constat local et preuve | Risque / acceptation future |
|---|---|---|---|
| A2-01 | P2 | `packages/atelier-model/manifest.json:6` déclare atelier-commands 2 ; `src/commandes/base.ts:9-10` courant /3 et /1,/2,/3 acceptés. | Métadonnée contradictoire, pas rupture démontrée du transport. Aligner et vérifier manifeste/constante/compatibilité des enveloppes historiques. |
| A2-02 | P2 | `scripts/check-module-deps.mjs` parse les imports par regex, autorise les chemins relatifs hors apps et n'impose pas les frontières des modules web. | Ne prouve ni résolution complète ni absence de cycles. PR #152 annoncée ouverte avec garde-fous AST et 52 tests : **revoir son diff et son SHA avant tout lot nouveau**, ne pas présenter son contenu comme fusionné. |
| A2-03 | P2 | Imports intermodules : `atelier/DesignReview.tsx` → parcours et programmation ; `parcours/ParcoursModule.tsx` → atelier, programmation, projets-sources, collaboration ; `projets-sources/ImportProjectButton.tsx` → parcours ; `ParcelleTool.tsx` → atelier. Accueil/pilotage ont aussi des dépendances réciproques. | Cycles entre responsabilités observés ; cela ne prouve pas un cycle runtime bloquant (imports type et composants inclus). Cartographier type/runtime, fixer façades publiques et règle d'intégration plutôt qu'interdire tous les imports arbitrairement. |
| A2-04 | P2 | `apps/web/src/modules/module-registry.ts:56` annonce droits/partage non disponibles ; API possède gestion des membres. `modules/README.md` décrit encore scaffold. | Statuts trompeurs. Matrice capacité → écran → route → permission → test, avec limite explicite et preuve au SHA. |
| A2-05 | P2 | `docs/atelier/README.md:1` titre encore DrawAll V4.1. Scanner `scripts/check-fadi-isolation.mjs` couvre apps/packages et certaines extensions seulement. Aucun package manifest/lock nominal DrawAll trouvé dans recherche ciblée. | Isolation nominale ≠ preuve exhaustive. Classer références opérationnelles/historiques/normes/licences/données persistées ; préserver provenance, fonctions et identifiants DA compatibles. Aucun accès au dépôt DrawAll. |
| A2-06 | P2 | `nouveau/outils.ts:84` outil échelle d'accès et `:120` transformation possèdent id `echelle`. `OUTILS_PAR_ID` à :150 construit par Object.fromEntries. | Écrasement certain de la première entrée du lookup par la seconde ; effet utilisateur précis non rejoué. DEC-05/18 : identités distinctes avec alias de migration et tests recherche, sélection, profils historiques. |
| A2-07 | P2 | `docs/architecture.md` laisse OCCT conditionné à une décision future ; D-177 et le code `packages/geometry-exact` montrent décision/intégration acquises. | Actualiser les points d'entrée avec référence aux décisions existantes sans réécrire l'histoire. |
| A2-08 | P2 Studio | `apps/api/src/db/schema.ts:499` variantes actuelles = projets bifurqués ; `:486` versions = snapshots par projet ; aucune entité studyId trouvée dans schema ni modele. | Ne pas assimiler les variantes actuelles à Projet→Étude→Variante→Révision. DEC-03 doit décider adaptation, compatibilité et correspondance d'identités avant migration. |
| A2-09 | P2 Studio | `packages/planche-model/src/outils/index.ts` importe statiquement six familles ; Vite `serviceWorkerBuildId` précache JS/CSS du bundle sauf WebGPU. | Catalogue réduit ne garantit pas chargement réduit. DEC-07 : analyser graphe/chunks/précache réseau et mémoire, cache froid/chaud, avant réécriture. |
| A2-10 | P2 Studio | `nouveau/exact/moteur-exact.ts:31-46` worker à la demande ; erreur rejette pending et fixe fil=null ; obtenirFil renvoie ensuite null (pas recréation). | Résilience existante partielle. DEC-11, crash/timeout/cancel/reprise et stale revisions à spécifier ; ne pas annoncer ordonnanceur livré. |

Le monolithe modulaire est cohérent comme cible. Cinq packages : core-geometry (pur), domain-model→core-geometry, planche-model (pur), atelier-model→ces trois, geometry-exact→occt-wasm. Les modèles et reducers partagés restent indépendants du rendu. Les ontologies mechanical/structure/timber/sheetmetal/mep, coordination et automatisation sont des fonctions Fadi à conserver ; les tests et commentaires DA ne sont pas des dépendances exécutables DrawAll. Les garanties géométriques ne constituent pas des certifications structurelles/normatives.

## Architecture proposée Studio / Atelier (à arbitrer)

AppShell → StudioShell autonome → domaine D1/D2/D3/D4 → Manager → machine outil → intention contrôlée → commandes/services Fadi → modèles canoniques → projections dérivées. Registry = métadonnées versionnées et loaders, pas objets ni géométrie. Aucun iframe, ProjectShell/étape Parcours préalable ou simple lien renommé Atelier. Aucun nouveau service comptes ni base concurrente.

| Contenu | Autorité proposée | Réutilisation candidate / preuve manquante |
|---|---|---|
| Projet, membres, sources, droits | Services Fadi existants | APIs projet et contrôles de rôle ; contrat contexte public à extraire, sans coupler Studio à l'UI Parcours. |
| Étude, variante, révision | Contexte persistant unique à définir DEC-03 | Révisions/versions existantes, variantes projet ; adaptation à spécifier, pas renommer un champ et annoncer conformité. |
| Dessin 2D autonome | Document/primitives 2D sérialisables, sans 3D fictif | Plan2D, cotations, contraintes, calques : candidats ; modèle indépendant et sauvegarde/publication sans niveau bâtiment à prouver (DEC-01). |
| Géométrie 3D libre | Modèle spatial propriétaire, sans sketch obligatoire | planche-model, machines, topologie, deltas, vue-planche ; persistance et coupe autonome à prouver. |
| Objet architectural associé | Une définition sémantique, mêmes objectId/hôtes | atelier-model et reducers ; adaptation 2D/3D, liens topo, correspondance ou à résoudre (DEC-02). |
| Vue, coupe, maillage, index | Dérivés reconstruisibles, sourceRevisionId | SVG/Three et projections ; pas second mur autoritaire, comparaison reconstruction complète. |
| Profils outils/caméra/sélection | Préférences/UI distinctes du modèle | Catalogues/barres actuels et etat-ui ; ne change ni droits ni révision. |
| Commandes/historique | Autorité transactionnelle serveur commune | `routes/atelier-commands.ts` schémas requestId/baseRevision, transactions, journal/outbox ; DEC-12 décide l'articulation avec deltas Planche. |
| Publications | Manifeste immuable approuvé sur sources coordonnées | `schema.ts:537` publications Atelier, volumes hashés et services documents ; approbation multi-sources n'est pas prouvée (DEC-16). |

Coexistence : conserver les anciens accès et leurs données. Réutiliser via interfaces publiques/purs packages, sans imports profonds Studio↔Atelier créant des dépendances circulaires. Pour chaque jeu de données, un seul propriétaire d'écriture. Le transfert d'autorité par étude est un lot R séparé : copie isolée, simulation, rapport identités/propriétés/historiques/commandes offline, restauration, validation ; lecture historique/redirection seulement après décision. Aucun dual-write artisanal.

## Décisions : ordre de traitement

| DEC | Responsable | Traitement / porte bloquée |
|---|---|---|
| 01 | A2+A1 | Schéma/stockage dessin 2D indépendant ; bloque A.1/A.2 au G3. |
| 02 | A2+A5 | Association/référence/copie, références topo et ambiguïtés ; bloque A.4, publication liée. |
| 03 | A2+A6 | Étude/variante/révision et correspondance existante ; bloque A.1 et R. |
| 04 | A1+A4 | Profils standard/métier/personnel, partage optionnel ; bloque B.2, pas I exploratoire. |
| 05 | A2+A5 | Manifeste validé, confiance, IDs/alias ; bloque B.1. |
| 06 | A2+A4 | API Manager, lifecycle/dispatch, gestes interrompus ; bloque B.2. |
| 07 | A2+A6 | Chunks, précharge, cache, mesures froid/chaud ; bloque B.3. |
| 08 | A2+A4+A5 | Conserver SVG initial candidat, renderer alternatif après comparaison ; bloque changement renderer, pas études. |
| 09 | A2+A5 | Oracle snapping, index et départages ; bloque C.1. |
| 10 | A2+A5 | Dirty effects, picking, invalidation correcte ; bloque C.2. |
| 11 | A2+A6+A5 | Workers/OCCT, annulation, mémoire, stale results, reprise ; bloque D et opérations lourdes exposées. |
| 12 | A2+A5 | Historique hybride, undo concurrent, commandes/deltas ; bloque A.5. |
| 13 | A1+A5 | S1–S7, matériel/budgets à ratifier, pas de chiffres inventés ; bloque verdict performance. |
| 14 | A2+A6 | Offline véridique, versions, quotas, pending queue ; bloque B.3/R. |
| 15 | A2+A5 | Extensions/MCP optionnels, droits et confiance ; bloque F seulement. |
| 16 | A1+A2+A5 | Approbation/publication multi-sources, empreintes ; bloque E.4/MVP terminable. |
| 17 | A4+A5 | Adaptativité graphique sans changer métrés/snaps ; bloque C/F concernés. |
| 18 | A2 | Inventaire fonction par fonction : conserver/compléter/corriger/isoler/remplacer/retirer ; bloque chaque réutilisation du lot concerné, pas tout le chantier d'un coup. |

Ajouter décision d'intégration NAV (identifiant proposé ADR-STUDIO-NAV-01, pas nouvelle numérotation DEC) : façade contexte, routes, entrée globale/projet, focus/mobile/plein écran et coexistence. La charte V2.1 cite encore Concept V2/10 chapitres/3 annexes tandis que STUDIO-RT-001 se déclare spécification unique/22 chapitres/4 annexes : demander confirmation que le détaillé V1.0 est le niveau 2 canonique, garder anciennes synthèses historiques. Le mandat impose déjà la cible fonctionnelle ; cette ambiguïté ne permet pas de la réduire.

## Premiers lots proposés et critères

1. A2-ARCH-01, P1 préparation, sans code : graphe AST actuel et PR #152, classify imports type/runtime, contrats publics et matrices des cycles ; accepté quand chaque arête a propriétaire et justification, et duplication évitée. A0 fournit SHA et état PR ; rapport A2 relu A5.
2. A2-STUDIO-01, P0 Studio préparation : DEC-01/02/03/12/18 et navigation, schémas logiques, alternatives, migration/rollback ; accepté à G1 quand trois autorités et contexte sont sans ambiguïté. A1 fixe usages, A4 navigation, A5 corpus.
3. Faisabilités G2 séparément autorisées : save/reopen 2D seule, 3D seule, mur associé/net 3.180 puis 3.096 m³, copie sans propagation, stale job refusé, idempotence/conflits et manifeste. Pas d'autorisation implicite de POC applicatif dans cette mission.
4. Après G3 et autorisation de réalisation : I+X+A.1, puis A.2/A.3 et B sur contrats stables, A.4/A.5 ; C/D selon charges ; E pour étude terminable ; R avant généralisation ; F conditionnel. Pas accepter MVP à la seule navigation ou géométrie affichée.

A2 ne doit pas modifier fichiers communs AppShell, App, schema, manifest ou workstream pendant la préparation. A0 gère propriétaire d'édition et checkpoint unique lors d'un futur lot. A3 reste inactif.

## Consolidation A0 reçue après analyse

A0 a vérifié `main` GitHub `27c0c5a35e2f116752a83a9c66459484488a1975` : comparaison officielle avec aadd083, trois fichiers documentaires ajoutés seulement (checklist md/docx et audit), trois commits. Les constats de code locaux ci-dessus s'appliquent donc au code main pour apps/packages/scripts/.github, sans prétendre que des tests furent exécutés sur ce SHA. PR #152 toujours ouverte au HEAD `f2777230e3e9c3bd6a2a5f61e2147acd1fba4b38`, treize fichiers, non fusionnée. A0 conserve les preuves GitHub primaires ; A2 n'a pas relu individuellement les treize diffs.
