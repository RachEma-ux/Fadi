# ADR-STUDIO-PILOTE-01 — Délégation totale et arbitrages du pilote Studio

Statut : **Accepté** (délégation du maître d'ouvrage) ; décisions prises par le chef de projet sous délégation.
Date : 2026-10-25.
Chantier : `studio` (programme [#156](https://github.com/RachEma-ux/Fadi/issues/156), canal [#166](https://github.com/RachEma-ux/Fadi/issues/166)).
Dossier préparatoire : [`DEC-OUVERTES-PILOTE.md`](../../workstreams/studio/DEC-OUVERTES-PILOTE.md) ; options des 18 DEC :
`docs/ai-team/reports/mission-004/A1/studio-18-decisions-v2.json`.

## Contexte

Le registre Studio (`docs/workstreams/studio/task-register.json`) bloque 209 obligations sur la même cause : responsables
non nommés, DEC non arbitrées, sous-lots non autorisés. Le pilote est ratifié depuis G0 (CAD-DEC-01, D01) : étude
synthétique local/pavillon, parcours A (2D autonome jusqu'à la publication), B (3D directe jusqu'à vue et coupe), C
(objets associés jusqu'à revue et publication). Le 25 octobre 2026, après lecture du dossier préparatoire, le maître
d'ouvrage écrit (session Claude Code) : « T'as une délégation totale pour les décisions qui me reviennent à faire.
Applique tes recommandations en lieu et place. Exécute de A à Z ».

## Décision et responsable

### P-01 — Délégation

Délégation totale pour le chantier Studio, de même forme que D-203 et ADR-GEODATA-02 : le chef de projet (Claude Code)
tranche les décisions qui reviennent au maître d'ouvrage, applique les recommandations du dossier préparatoire,
consigne chaque décision ici et au registre, et fusionne **seulement CI verte**. Le maître d'ouvrage peut reprendre la
main ou annuler une décision à tout moment.

**Exclusions maintenues** : publication en production (Release du maître d'ouvrage), paramètres et protections GitHub,
secrets, données réelles de projet, tests destructifs hors base jetable. La délégation ne crée aucune personne, aucune
mesure et aucun seuil : ce qui n'est pas mesuré reste « non évalué ».

### P-02 — Responsabilités (RESP-01 à RESP-05, CAD-DEC-02, CAD-DEC-03)

| Rôle | Responsable de l'acceptation | Instruction et réalisation |
|---|---|---|
| Produit : périmètre métier, navigation, recette (RESP-01) | Maître d'ouvrage (compte GitHub `RachEma-ux`) | Chef de projet |
| Architecture : instruction des DEC, frontières (RESP-02) | Maître d'ouvrage | Chef de projet |
| Sous-lots CAO, backend, frontend, BIM/documentation (RESP-03) | Maître d'ouvrage | Chef de projet |
| Qualité/sécurité : tests adverses, corpus, preuves (RESP-04) | Maître d'ouvrage | Chef de projet ; CI du dépôt |
| Exploitation : migration, sauvegarde, retour arrière (RESP-05) | Maître d'ouvrage, qui seul publie en production | Chef de projet (préparation, base jetable) |

- **Personnes** : une seule personne habilitée réelle, le maître d'ouvrage. Les agents (A0–A6, Claude Code) ne sont pas
  des habilitations humaines. Aucun autre nom n'est inventé.
- **Disponibilité** : à la demande du maître d'ouvrage, sans engagement de délai. Aucun réviseur humain indépendant n'est
  identifié : on garde le profil solo de D05 (PR, CI, acceptation tracée).
- **Cumul** : autorisé pour le maître d'ouvrage. Sous la présente délégation, le chef de projet consigne les
  acceptations en son nom. La séparation reste tracée : rédaction et réalisation par l'agent, acceptation par le maître
  d'ouvrage ou par cet acte, preuve par la CI.

### P-03 — Intégration de Studio (ADR-03)

[ADR-STUDIO-NAV-01](ADR-STUDIO-NAV-01.md) est **acceptée, option A** : routes sous `/studio`, entrée par un descripteur
global distinct de `MODULES`, `StudioShell` indépendant de `ProjectShell`, plein écran explicite, coexistence COEX-02 à
COEX-06. C'est ce que réalise le code de `main` (`apps/web/src/modules/studio/StudioShell.tsx`, `routes-studio.ts`).

### P-04 — Les 18 décisions DEC

| DEC | Option retenue | Réserve |
|---|---|---|
| DEC-01 | Document 2D existant (`studio-document/1`) comme autorité 2D indépendante, stocké dans `studio_revisions.document` | Une migration de format future est déclarée version par version |
| DEC-02 | Association vers un objet sémantique unique quand le rattachement est prouvé ; sinon référence liée, copie indépendante ou statut « à résoudre » explicite | Jamais d'approximation silencieuse |
| DEC-03 | Étude, variante et révision comme entités propres (`studio_studies`, `studio_variants`, `studio_revisions` en ajout seul) | Les projets existants ne sont pas migrés en études : l'étude s'ajoute au projet |
| DEC-04 | Profils standard, métier et personnel attachés au compte | Profil d'équipe partagé reporté |
| DEC-05 | Manifeste d'outils statique, versionné et validé au build (`manifeste-outils.ts`) | Pas de catalogue servi par l'API dans le pilote |
| DEC-06 | Adaptateurs par famille derrière l'API commune du catalogue | Le gestionnaire ne recalcule ni ne valide le métier |
| DEC-07 | Morceaux par famille, moteurs lourds (3D, noyau exact) chargés à la demande | Découpage plus fin seulement sur mesure |
| DEC-08 | Rendu SVG/React | Aucune bascule Canvas/GPU sans mesure comparée (TEST-025) |
| DEC-09 | Parcours linéaire sous 1 000 éléments, grille uniforme au-delà (seuil mesuré, banc C.1) | Résultat identique au parcours linéaire exigé (test de propriété) |
| DEC-10 | Invalidation par signature et lots stables, avec reconstruction complète en repli | Lots acceptés seulement si la désignation (picking) reste exacte |
| DEC-11 | Worker paresseux par moteur, avec délai, annulation et relance (`workers/hote-worker.ts`) ; noyau exact séparé (D-177) | Pas de service serveur de calcul dans le pilote |
| DEC-12 | Historique local par commandes (`studio/history.ts`) au-dessus de révisions immuables | Une annulation ne réécrit jamais une révision ni une publication |
| DEC-13 | Voir ci-dessous | — |
| DEC-14 | Socle hors ligne restreint : la file locale versionnée est conservée, un outil absent du cache est déclaré indisponible | Rien n'est publié hors ligne |
| DEC-15 | Extensions et MCP **exclus du pilote** (report D02), option conservée au backlog | Rouvrir par une décision propre |
| DEC-16 | Manifeste de publication immuable, avec empreintes, refus `manifest_mismatch`, approbation et diffusion distinctes | — |
| DEC-17 | Qualité graphique fixe : aucune concession adaptative dans le pilote | — |
| DEC-18 | Réemploi des moteurs Fadi par leurs interfaces publiques (`@parcours/atelier-model`, conventions du noyau exact) | Remplacement d'un sous-composant seulement sur preuve |

**DEC-13 — appareils et budgets.**
- Appareils de recette du pilote :
  - Chromium (Playwright) en bureau, sur le runner Linux de la CI ;
  - Chromium en gabarit téléphone, dans les recettes qui le prévoient.
- Ce qui reste **non évalué** : le rendu y est logiciel, donc les performances GPU réelles et les appareils physiques
  restent « non évalués » ; aucun n'est disponible.
- Budgets : on retient les seuils publiés des Core Web Vitals (web.dev, p75 : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1)
  comme cible d'interface. Pour la géométrie, on exige l'exactitude, pas la vitesse. Aucun autre seuil chiffré n'est
  fixé.

### P-05 — Autorisations (G2-02, G3-01, G3-04)

- **G3-01** : les DEC de l'annexe B sont arbitrées par P-04. L'option exclue (DEC-15 : extensions et MCP) ne
  conditionne pas la livraison du pilote.
- **G2-02 et G3-04** : le périmètre des POC (contexte, 2D, association, chargement, index, conflit, reprise,
  publication) et le sous-ensemble du pilote (lots A, B, C, D, E, I, R, X) sont **autorisés**. Le lot F n'est autorisé
  que pour ce qui ne dépend pas de DEC-15.
- Une autorisation n'est pas une preuve : les portes G1, G2, G3 et G4 restent soumises à leurs critères. Chaque obligation
  de recette reste « à faire » jusqu'à son exécution.

### P-06 — Modes IA et extensions du pilote (F.2-03, F.3-01) — complément du 25 octobre 2026

À la demande du maître d'ouvrage (« Règle ça aussi », même session) :
- **F.3-01** : les extensions et l'adaptateur MCP sont instruits par DEC-15 (P-04), qui les exclut du pilote. L'option
  reste au backlog.
- **F.2-03** : **aucun mode IA n'est retenu pour le pilote** (report D02). Il n'y a donc rien à implémenter dans ce
  périmètre. Studio annonce « Illustration IA » « Non disponible », sans bouton ni lien qui puisse la déclencher
  (test `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts`). Retenir un mode rouvre l'obligation.
- **TEST-032 et TEST-033** restent bloqués. Ils recettent des fonctions absentes (illustration IA, adaptateur MCP) :
  aucune décision ne peut tenir lieu de leur exécution. Les débloquer suppose de rouvrir DEC-15 et de construire ces
  fonctions. L'illustration IA demande en plus un fournisseur externe et sa clé.

### P-07 — Livraison (R.2-01 à R.5-04)

La délégation ne couvre pas la production : la Release GitHub reste le geste du maître d'ouvrage
(`docs/deploiement-automatique.md`, décision du 20 octobre 2026). Les 9 obligations R restent bloquées sur trois
conditions, dans cet ordre :
1. la recette utilisateur des trois parcours par le maître d'ouvrage (R.3-01), guidée par
   [`RECETTE-UTILISATEUR-PILOTE.md`](../../workstreams/studio/recettes/RECETTE-UTILISATEUR-PILOTE.md) ;
2. la porte G4 sur ses critères (dossier de livraison, absence de défaut éliminatoire) ;
3. la Release du maître d'ouvrage sur le commit validé en préproduction.

Le chef de projet prépare tout le reste et ne publie aucune Release.

### P-08 — Les 16 obligations « À définir » — complément du 25 octobre 2026

Le maître d'ouvrage délègue aussi ses propres tâches : « Exécute tout ce qui reste à faire. Je te délègue mes tâches
aussi. » Les choix ci-dessous retiennent l'existant du code de `main`, sauf mention contraire. Aucune valeur absente du
dépôt n'est inventée : ce qui n'est pas mesuré reste « non évalué ».

| ID | Décision |
|---|---|
| G3-02 | Composants retenus : ceux de DEC-18, réemployés par leurs interfaces publiques (`@parcours/atelier-model`, routes `/studio`, tables `studio_*`). Migrations : `init.sql`, idempotent. Retour arrière : revert de la PR et archive Studio restaurable (`studio-archive`, recette `studio-restauration`). |
| I.4-03 | Contrat d'URL : `?domaine=` et, en Dessin seulement, `planche=2d\|3d\|double`, tel que réalisé et recetté (`studio-domaines`). La « Double vue » est adoptée. |
| A.1-04 | Schémas versionnés retenus : document `studio-document/1`, contrat de commandes `STUDIO_CONTRACT`, archive `fadi-studio-archive/1`. |
| A.1-05 | Migrations : schéma par `init.sql` ; formats locaux migrés version par version (`MIGRATIONS_BROUILLON`). Aucune migration n'est nécessaire au pilote : le format 1 est le seul jamais écrit. |
| B.1-02 | `toolId`, propriétaire et contrat : le manifeste versionné `STUDIO_MANIFESTE_OUTILS` fait référence pour les 38 outils du registre. |
| B.1-04 | Alias : la table scopée `STUDIO_ALIAS_OUTILS` est conservée. Un alias ambigu n'est jamais résolu. |
| B.3-12 | Protocole de mesure approuvé : `apps/web/e2e/studio-mesures-chargement.mjs`, à froid et à chaud. Il relève les transferts et la mémoire sans verdict ; aucun gain n'est annoncé. |
| D.1-02 | Quotas : 2 emplacements de concurrence au total, dont 1 au plus pour les tâches de fond (défaut de `taches/ordonnanceur.ts`). Aucun worker par cœur logique. |
| D.3-03 | Mémoire en session longue : mesurée par une recette à cycles répétés (TEST-037), sans seuil tant qu'aucune mesure n'en fonde un. |
| E.6-02 | Données, vues et tableaux du pilote : document natif, feuilles composées, dossiers de conception, métrés brut / déductions / net, observations. |
| E.6-03 | Sous-ensemble d'échange : export SVG, DXF, IFC et PDF ; import DXF. Chaque export a son rapport de fidélité (`studio-rapport-fidelite/1`). Les entités non prises sont déclarées, jamais écartées en silence. |
| PIL-02 | Outils usuels du pilote : les 38 outils du registre, par fonction. A : dessin (9), modification (8), calques (3), annotation (cotes, texte). B : volume (2), volume libre (4). C : architecture (4), propriétés (2), visualisation (6). |
| PIL-04 | Outils non retenus : illustration IA et exploration libre sont « non disponibles » (D02). Extensions et MCP sont « futurs » (DEC-15). Aucun autre outil n'est déclaré indisponible par déduction. |
| MIG-COEX-02 | Identifiants : correspondance explicite, sans réemploi. Une étude installée depuis un projet existant porte sa provenance (`example_install` : convertisseur, version, empreinte). Les objets de l'Atelier gardent leurs identifiants. |
| MIG-COEX-05 | Écriture : aucun transfert de l'Atelier vers Studio dans le pilote. L'Atelier reste propriétaire de ses données ; Studio n'écrit que les tables `studio_*` (coexistence, ADR-STUDIO-NAV-01). |
| OPS-09 | Objectifs fondés sur l'existant : perte maximale d'un jour (sauvegarde quotidienne). Conservation : 14 jours en local ; hors VPS, 5 dernières, 14 quotidiennes, 8 hebdomadaires et 12 mensuelles (`scripts/audit-offsite-retention.sh`). Le temps de reprise et les coûts restent « non évalués » : aucune mesure ni aucun budget ne figurent au dépôt. |

**Tâches du maître d'ouvrage exécutées par délégation.** La recette des trois parcours (R.3-01) est jouée par le chef de
projet et consignée comme **recette déléguée**, non comme un constat du maître d'ouvrage en personne. La Release de
production reste hors de portée : aucun outil de cette session ne peut la publier, et la règle du dépôt la réserve au
compte du maître d'ouvrage.

### P-09 — Arbitrages complémentaires — 25 octobre 2026

| ID | Décision |
|---|---|
| COEX-01 | La qualification proposée des 22 composants de l'Atelier est adoptée telle quelle (`docs/ai-team/reports/claude-m13-coex/COEX-01-QUALIFICATION.md`) : 12 à conserver, 4 à compléter, 2 à corriger, 4 à isoler, aucun remplacement, aucun retrait. Toute reprise passe d'abord par une fiche par fonction. |
| ADR-05 | Les priorités des risques sont confirmées comme suit : le tableau « Risque prioritaire / Mesure » du Plan §10 et les risques de navigation NAV-R01 à R07 (ADR-STUDIO-NAV-01 §7). Aucune probabilité chiffrée n'est ajoutée. |
| OPS-03 | Écritures postérieures à une bascule. Le schéma Studio est additif (`init.sql` idempotent) : revenir à l'image précédente conserve les écritures. Une restauration de base, que seul le maître d'ouvrage décide, est précédée de l'export par l'archive Studio (`fadi-studio-archive/1`) des écritures postérieures, qui sont réimportées ou abandonnées sur décision explicite. Le retour arrière ne se réduit jamais au rétablissement de l'image. |
| SRC-06 | Contradictions restantes : (1) Importer DXF, les exports (SVG, DXF, IFC, PNG), la matrice d'échanges, Outils et la palette de commandes ne relèvent d'aucun domaine unique. Ils sont **communs aux quatre domaines**, tels que présentés aujourd'hui ; la valeur `A_DEFINIR` du code signifie désormais « commun », sans domaine propre. (2) Le workflow est déclaré **par étude**, comme réalisé. (3) ROUTE-09 : le contrat de routes d'ADR-STUDIO-NAV-01 §1 est final (P-03), avec les paramètres de P-08 (I.4-03). (4) R.3-01 : P-08 **remplace** le point 1 de P-07, puisque le maître d'ouvrage a délégué ses propres tâches. La recette est jouée par le chef de projet et consignée comme déléguée, jamais comme constat du maître d'ouvrage en personne. |

### P-10 — Démarrage du groupe de Workers (TEST-016) — 25 octobre 2026

La recette TEST-016 a montré que le moteur « calcul », le groupe de Workers, démarre dès l'ouverture d'une planche.
La cause : le panneau « Quantités », affiché par défaut, calcule aussitôt le métré hors du fil principal. Ce démarrage
est un **premier usage justifié**, pas un démarrage d'office : le métré est nécessaire au parcours C et visible à
l'ouverture. Le comportement est donc conservé, et la déclaration « premier usage » reste exacte. La recette exige que
toutes les tâches qui ont sollicité ce moteur à l'ouverture soient des calculs de quantités, et que le rendu 3D, lui, ne
soit pas initialisé.

## Justification

Chaque option retenue est celle du dossier préparatoire. Elle est réalisée par le code de `main` au 25 octobre 2026
(commit `3e992b6`) et couverte par ses tests et recettes. Arbitrer autrement obligerait à réécrire du code qui
fonctionne, sans gain démontré (DEC-18).

## Conséquences

- Au registre, RESP-01 à 05, CAD-DEC-02, CAD-DEC-03, ADR-03, DEC-01 à DEC-18, G2-02, G3-01 et G3-04 passent à « Accepté », avec cet acte
  comme preuve.
- Les obligations de recette (NAV, TEST, REC) ne passent à « Vérifié » que sur une recette exécutée qui contrôle
  leur critère exact (voir `STATUS.md`).
- Restent ouverts : appareils physiques et GPU réel (DEC-13), réviseur humain indépendant, corpus intégral (famille X),
  priorités des risques (ADR-05), et tout ce qui n'a pas de recette.
