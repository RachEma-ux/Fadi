# Studio — dossier du pilote

Rédigé le 25 octobre 2026 sous délégation du maître d'ouvrage ([ADR-STUDIO-PILOTE-01](../../continuity/decisions/ADR-STUDIO-PILOTE-01.md)).
Chaque section répond à une obligation du registre, citée par son identifiant. Elle ne contient que des faits présents dans le dépôt ; ce qui n'est pas mesuré est « non évalué ». Les états d'obligations cités sont ceux du registre au moment de la rédaction.

## Architecture et responsabilités

### ARC-01 — Définir l’enchaînement AppShell → StudioShell → accueil/contexte → quatre domaines → outils → commandes → modèles → projections/services.

Section « Chaîne de responsabilités » (CONTEXT.md ou ADR-STUDIO-NAV-01) : AppShell → StudioShell (`apps/web/src/modules/studio/StudioShell.tsx`, routes `/studio` de `routes-studio.ts`, sans ProjectShell, option A acceptée par P-03) → accueil et contexte projet → étude → variante → quatre domaines (`domaines/domaines.ts`) → outils (manifeste statique `manifeste-outils.ts`, DEC-05) → commandes (enveloppes envoyées par le seul `variante/useEnregistrement.ts`, appliquées par `applyStudioCommands` du modèle pur) → modèle canonique `studio-document/1` (DEC-01) → projections et services (scène 3D dérivée, API `apps/api/src/lib/studio-*`). L'autorité descend des commandes vers le modèle ; aucune projection n'écrit le modèle. Le sens des dépendances est contrôlé par `scripts/frontieres.json` (check-module-deps en CI).

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `apps/web/src/modules/studio/contrat-commandes.test.ts`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### ARC-02 — Définir le Registry comme fournisseur de métadonnées du Manager, sans appel réseau de résolution à chaque geste.

Section « Registry et Manager » : le Registry est le manifeste statique `manifeste-outils.ts`, versionné et validé au build (DEC-05) ; il ne fournit que des métadonnées au Manager et au catalogue unique `planche2d/catalogue.ts`, qui le lit sans le recopier. Aucun catalogue n'est servi par l'API dans le pilote : aucune résolution réseau n'a lieu à chaque geste. Seul le chargement à la demande des morceaux d'une famille d'outils (DEC-07) peut déclencher un téléchargement, à l'activation et non au geste ; le gestionnaire ne recalcule ni ne valide le métier (DEC-06).

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/DEC-OUVERTES-PILOTE.md`.*

### ARC-04 — Définir la frontière du module web candidat apps/web/src/modules/studio/ : écrans, planches, panneaux, état UI et adaptateurs.

Fichier `apps/web/src/modules/studio/README.md` (absent aujourd'hui, alors que docs/architecture.md prévoit un README par module) : responsabilité du module = StudioShell, `VariantWorkspace.tsx`, routes (`routes-studio.ts`), accueil, domaines, planches (`planche2d/`, `vue3d/`), panneaux (commentaires, observations, publication, dossier, feuille, quantites, exigences, echanges, comparaison), état UI et adaptateurs (chargement, hors-ligne, workers, taches, temps-reel, import, liens, console). Limites reprises du Plan §3.1 : aucune écriture directe en base, aucune dépendance à l'enveloppe Parcours, modèles purs hors du module (packages). Interdits d'import : ceux de la règle `modules/studio` de `scripts/frontieres.json`.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/architecture.md`, `scripts/frontieres.json`.*

### ARC-06 — Définir la responsabilité des loaders, projections, index, rendu, workers et ordonnanceur partagés côté web.

Tableau « Services techniques web » : loaders = `chargement/carte-morceaux.ts` et `chargement/gestionnaire-ressources.ts` (morceaux par famille, DEC-07) ; projections = `packages/atelier-model/src/studio/projections.ts` (pur) ; index = grille uniforme au-delà de 1 000 éléments, résultat identique au parcours linéaire (DEC-09) ; rendu = SVG/React en 2D (DEC-08) et scène 3D incrémentale `vue3d/scene-rendu.ts` avec repli complet (DEC-10) ; workers = `workers/hote-worker.ts` (DEC-11) ; ordonnanceur = `taches/ordonnanceur.ts`. Règle commune (Plan §3.1) : maillages et caches ne deviennent jamais source de vérité. Libération et quotas : non évalués.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### ARC-07 — Définir les services API pour droits, études, révisions, transactions, jobs, publications et reprise, sans seconde autorité métier.

Tableau « Services API Studio » : études et variantes = `apps/api/src/lib/studio-variantes.ts` et tables `studio_studies` / `studio_variants` (DEC-03) ; révisions et transactions = `studio-commands.ts` (enveloppes, révisions en ajout seul) ; publications = `studio-publications.ts` (manifeste immuable, DEC-16) ; dossiers = `studio-dossiers.ts` ; reprise = `studio-archive.ts` (TEST-034 vérifié) ; droits = contrôles serveur des routes `apps/api/src/routes/studio*.ts`. Aucune seconde identité utilisateur : l'identité est celle de Fadi. Les jobs côté API ne sont pas identifiés : à déclarer « non évalué » ou hors pilote.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `scripts/frontieres.json`.*

### ARC-09 — Définir les interfaces publiques et la direction des dépendances partagées entre Atelier et Studio ; ne pas imposer un paquet par bouton.

Section « Interfaces Atelier ↔ Studio » : les modules web `modules/studio` et `modules/atelier` ne s'importent pas, dans aucun sens (règles de `scripts/frontieres.json`, contrôlées en CI) ; le partage passe uniquement par les paquets purs, dont `@parcours/atelier-model` (DEC-18). Aucune interface publique ne traverse aujourd'hui la frontière web (`interfacesPubliques.liste` vide) ; toute entrée s'y ajoute avec sa décision. Aucun paquet n'est créé par bouton (Plan §3.1).

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `scripts/frontieres.json`.*

## Données et commandes

### ARC-DATA-02 — Définir l’autorité propre de la géométrie 3D libre sur sa définition spatiale.

Section « Autorité de la 3D libre » : les solides libres (`packages/atelier-model/src/studio/objets-3d/`, façade `solides-libres.ts`) portent leur définition spatiale dans le document de la révision ; maillage, coupe plane et quantités en sont dérivés (`composition/coupe.ts`, `composition/quantites-solides.ts`) et n'ont aucune autorité. Le Plan §7.1 exige qu'aucune esquisse 2D ne soit imposée et que la géométrie libre n'acquière pas de propriétés BIM automatiquement.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/workstreams/studio/recettes/RECETTE-PILOTE-2026-10-25.md`, `packages/atelier-model/src/studio/solides-libres.ts`.*

### ARC-DATA-04 — Rattacher projections, cotes dérivées, scènes et index à leur provenance et à leur révision, sans autorité concurrente.

Section « Dérivés » : projections (`projections.ts`), cotes associatives, scène 3D (`vue3d/scene-rendu.ts`) et index sont recalculés depuis la révision affichée et ne sont jamais enregistrés comme source ; une lecture n'est appliquée que si la même révision et le même brouillon sont toujours affichés (test A.5-10) ; après engagement, les listes de révisions, l'étude et les ajustements de quantités sont relus (A.5-11) ; la scène 3D s'invalide par signature avec reconstruction complète en repli (DEC-10).

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `apps/web/src/modules/studio/contrat-commandes.test.ts`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### ARC-DATA-05 — Spécifier contexte, requestId, version de contrat, baseRevisionId, cibles et paramètres dans les commandes.

Section « Enveloppe de commandes » : une enveloppe porte `contractVersion` (littéral `STUDIO_CONTRACT`), `requestId` et `baseRevisionId` (identifiants 1–128 caractères `[A-Za-z0-9._:-]`), puis 1 à 500 commandes `{ toolId, params }` strictes ; le contexte (projectId, studyId, variantId) est porté par la route et relu par le serveur (`StudioScope`). Les cibles sont désignées dans `params` ; l'enveloppe est refusée en 400 `invalid_input` si elle s'écarte du schéma.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `apps/api/src/lib/studio-commands.ts`.*

### ARC-DATA-06 — Spécifier la restauration serveur de l’identité authentifiée et les contrôles d’appartenance, de droits et de version.

Section « Contrôles serveur » : l'identité est rétablie par la session Fadi côté serveur (401 sinon) ; le serveur vérifie l'appartenance projet → étude → variante → révision (404 `not_found` sans fuite), le droit sur le projet (403), la version (`baseRevisionId`, 409 `stale_revision`) et l'état archivé (409 `archived`, rien n'est écrit) avant tout effet. Aucun paramètre d'URL ne transmet de droit (ADR-STUDIO-NAV-01 §3).

*Sources : `apps/api/src/lib/studio-commands.ts`, `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`, `docs/workstreams/studio/STATUS.md`.*

### ARC-DATA-07 — Spécifier les issues de commande : acceptation, refus, conflit, traitement différé ou doublon.

Tableau « Issues de commande » : acceptation = nouvelle révision en ajout seul ; refus = 400 (`invalid_input`, `invalid_commands`), 403, 404 `not_found`, 409 `archived`, sans effet ; conflit = 409 `stale_revision` avec `headRevisionId` ; doublon = même `requestId` rejoué, réponse d'origine relue, et 409 `request_conflict` si le contenu ou l'auteur diffère (TEST-013 vérifié) ; traitement différé : aucune issue de ce type relevée dans l'API Studio.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `apps/api/src/lib/studio-commands.ts`, `docs/workstreams/studio/recettes/RECETTE-PILOTE-2026-10-25.md`.*

### ARC-DATA-08 — Définir l’invalidation après engagement canonique et le rattachement des résultats anciens à leur source.

Section « Invalidation » : rien n'est invalidé tant que le serveur n'a pas confirmé un lot ; après engagement, révisions, étude et ajustements de quantités sont relus (A.5-11) ; une lecture tardive n'est appliquée que si la révision et le brouillon affichés sont inchangés (A.5-10). Les révisions sont immuables et une annulation ne réécrit jamais une révision ni une publication (DEC-12).

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `apps/web/src/modules/studio/contrat-commandes.test.ts`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

## Séquencement et portes

### SEQ-01 — Enregistrer G0 → G1 → G2 → G3 comme prérequis des lots dépendants.

Section « Portes » dans TASKS.md : G0 acceptée pour le cadrage documentaire ; G1 non acceptée (G1-01 à G1-04 « En cours ») ; G2-02, G3-01 et G3-04 acceptées sous délégation (P-05) ; G4 « À faire ». Chaque lot dépendant cite la porte qui le conditionne. L'acte P-05 et le code de main au 25 octobre (Justification de l'ADR) montrent que les lots ont été réalisés avant G1 : l'écart est consigné tel quel.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/CONTEXT.md`, `docs/workstreams/studio/STATUS.md`.*

### SEQ-02 — Planifier I et X avec les fondations A.1 après les décisions applicables.

Ligne de planning : lots I, X et A.1 autorisés le 25 octobre 2026 après arbitrage DEC-01 à DEC-18 (P-04, P-05) ; preuves : NAV-001 à NAV-009 vérifiés (lot I), contrôles de frontières en CI (X), DEC-01/DEC-03 réalisées par `studio-document/1` et les tables `studio_*` (A.1).

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/recettes/RECETTE-PILOTE-2026-10-25.md`.*

### SEQ-03 — Planifier B en parallèle uniquement sur des contrats stables et compatibles avec A.

Ligne de planning : lot B (Registry, Manager, profils, chargement) réalisé en parallèle de A sur le manifeste statique (DEC-05) et les adaptateurs par famille (DEC-06) ; REC-B-01 et REC-B-02 « À faire » ; TEST-016 « En cours ».

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/workstreams/studio/task-register.json`.*

### SEQ-04 — Planifier A.2/A.3 avant la démonstration associée A.4/A.5.

Ligne de planning : A.2 (planche 2D) et A.3 (planche 3D) précèdent la démonstration A.4/A.5 ; état au registre : A.4-01, 02, 05, 06, 08, 09 « À faire », A.4-03, 04, 07 « En cours » ; TEST-003, 011 et 012 « En cours ». Aucune conception associée n'est déclarée démontrée.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/workstreams/studio/task-register.json`.*

### SEQ-05 — Positionner C et D avant l’exposition des charges ou traitements qui les exigent.

Ligne de planning : C (index uniforme au-delà de 1 000 éléments, seuil mesuré sur le banc C.1, DEC-09) et D (workers paresseux, DEC-11) sont en place ; les mesures qui conditionnent l'exposition restent ouvertes : TEST-022, TEST-014 et TEST-015 « En cours », TEST-025 « À faire » ; TEST-037 est vérifié par `studio-memoire` (25 octobre 2026).

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/recettes/RECETTE-PILOTE-2026-10-25.md`.*

### SEQ-06 — Positionner E avant la déclaration d’un pilote métier complet, puis R avant généralisation.

Ligne de planning : E doit être achevé (REC-E-01 à REC-E-03 « À faire ») avant toute présentation du pilote comme version métier complète ; R vient ensuite, dans l'ordre fixé par P-07 : recette utilisateur du maître d'ouvrage (R.3-01), porte G4, Release du maître d'ouvrage.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/STATUS.md`.*

## Mesures

### MES-01 — Identifier pour chaque mesure appareil, navigateur, GPU, réseau et état des caches.

Section « Protocole de mesure — environnement » : appareil = runner Linux de la CI, Chromium Playwright en bureau ou en gabarit téléphone (DEC-13) ; navigateur = version relevée par `studio-mesures-chargement.mjs` ; GPU = « non évalué » (rendu logiciel SwiftShader) ; caches = froid (contexte neuf, sans service worker) puis chaud (service worker installé) ; réseau = non relevé aujourd'hui, donc « non évalué ».

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `apps/web/e2e/studio-mesures-chargement.mjs`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### MES-02 — Identifier pour chaque mesure build, commit, jeu de données, répétitions, distribution et seuil accepté.

Section « Protocole de mesure — identification » : chaque rapport cite le build lu par la recette, le commit, le jeu de données (étude d'exemple, profil de vingt outils), le nombre de cycles et la distribution des valeurs ; le seuil accepté est celui de DEC-13 (Core Web Vitals p75 pour l'interface) ou « aucun » ; sans seuil, aucun verdict.

*Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md`, `apps/web/e2e/studio-mesures-chargement.mjs`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

## Suivi

### SUIVI-03 — Créer ou compléter docs/workstreams/studio/CONTEXT.md : but, sources, DEM-01, périmètre accepté, responsabilités et limites.

Section « Pilote — 25 octobre 2026 » de CONTEXT.md : DEM-01 = module autonome intitulé exactement « Studio », dans la barre latérale verticale (SRC-04 vérifié) ; périmètre accepté = étude synthétique local/pavillon, parcours A, B, C (CAD-DEC-01) et lots A, B, C, D, E, I, R, X, F hors DEC-15 (P-05) ; responsabilités = RESP-01 à 05 tenus par le maître d'ouvrage, instruction par le chef de projet (P-02) ; limites = production, réglages GitHub, secrets et données réelles hors délégation (P-01).

*Sources : `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/CONTEXT.md`, `docs/workstreams/studio/task-register.json`.*

### SUIVI-04 — Créer ou compléter docs/workstreams/studio/TASKS.md : sous-lots, dépendances, Issues, PR, états et critères.

Tableau « Sous-lots » de TASKS.md : une ligne par lot I, A, B, X, C, D, E, F, R avec sa dépendance (Plan §6.1), l'Issue (#156, #166), les PR qui l'ont livré, son état au registre et son critère de recette (REC-*) ; F limité à ce qui ne dépend pas de DEC-15 ; R « Bloqué » sur recette utilisateur, G4 et Release (P-07).

*Sources : `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/TASKS.md`.*

## Risques

### RISQ-04 — Vérifier le traitement du risque « Données ou historique dupliqués entre Atelier et Studio » : A.1/A.5 et transfert explicite d’autorité lors de R.

Section « Duplication Atelier/Studio » : dans le pilote, aucun projet Atelier n'est migré (réserve de DEC-03) ; Studio n'écrit que ses tables `studio_*` par les enveloppes de commandes (tests A.5) ; aucun import entre modules web (frontières en CI) ; aucune synchronisation bidirectionnelle (COEX-05). Le transfert d'autorité prévu au lot R n'a donc pas lieu dans le pilote ; il exigera une décision par périmètre (Plan §8.2).

*Sources : `apps/web/src/modules/studio/contrat-commandes.test.ts`, `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

## Cadrage, routes et coexistence

### CAD-05 — Conserver les services généraux de Fadi : pas de seconde application, de second système de comptes ou de base métier concurrente.

Services généraux partagés. Studio n'est pas une seconde application : ses routes `/studio` sont servies par la même application web et la même API (apps/api/src/routes/studio*.ts). Ses tables `studio_*` sont créées par le même `init.sql` que le reste de Fadi, dans la même base, et `studio_studies.project_id` référence `projects(id)`. Les recettes Studio de la CI s'authentifient par `/auth/register` et `/auth/login`, sans second système de comptes. Studio n'écrit que ses tables `studio_*` (P-08, MIG-COEX-05).

*Sources : `apps/api/src/db/init.sql`, `apps/web/e2e/studio-restauration.mjs`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/CONTEXT.md`.*

### ROUTE-09 — Faire arbitrer le contrat final des routes avant leur implémentation.

Contrat final des routes (ROUTE-09). Le contrat final des routes Studio est celui du tableau §1 d'ADR-STUDIO-NAV-01 : `/studio`, `/studio/projets/:projectId`, `…/etudes/:studyId`, `…/variantes/:variantId` et `…/revisions/:revisionId` en chemin complet. Il est accepté par P-03 (option A). Les paramètres de requête suivent P-08 I.4-03 : `?domaine=` et, en Dessin seulement, `planche=2d|3d|double`. Une valeur inconnue donne « URL non reconnue », sans mutation. La phrase « Les chemins de routes restent des propositions jusqu'à ROUTE-09 » est remplacée par un renvoi à cet arbitrage.

*Sources : `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### COEX-03 — Choisir un propriétaire d’écriture unique pour chaque jeu de données pendant la coexistence.

COEX-03 — propriétaire d'écriture (option A, acceptée avec l'option A d'ADR-STUDIO-NAV-01, l.156 et 162). Pendant la coexistence, l'Atelier reste le seul client écrivain des jeux existants. Studio est le seul écrivain de ses jeux `studio_*` (DEC-01, DEC-03). Les deux passent par le service de commandes serveur (R9), sans seconde autorité. Tout transfert de périmètre est une décision explicite (MIG-COEX-05). Le pilote n'en prévoit aucun (P-08).

*Sources : `docs/ai-team/reports/claude-m13-coex/COEX-02-06-DOSSIERS.md`, `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### COEX-04 — Décider, pour les études migrées, une redirection contrôlée ou un accès historique en lecture seule.

COEX-04 — études migrées (option A, acceptée avec l'option A d'ADR-STUDIO-NAV-01). Pour une étude migrée, l'accès historique de l'Atelier passe par défaut en lecture seule : il réutilise `readOnly` et une bannière renvoie à l'étude Studio. Une redirection contrôlée, avec message visible, n'est activée qu'après le transfert d'autorité du périmètre (MIG-COEX-05), jamais par le repli silencieux `*`. Le pilote ne migre aucune étude (P-08, MIG-COEX-05) : la règle s'applique au premier transfert.

*Sources : `docs/ai-team/reports/claude-m13-coex/COEX-02-06-DOSSIERS.md`, `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`.*

### COEX-05 — Interdire une synchronisation artisanale entre deux bases métier concurrentes.

COEX-05 — ratification. La règle de l'ADR-STUDIO-NAV-01 §5 est ratifiée avec l'option A (l.156 et 162) : aucune donnée métier n'est recopiée dans les deux sens entre l'Atelier et Studio. Deux transferts seulement sont admis : le rejeu de commandes validées (R9), ou un import à sens unique avec rapport. Contrôle automatique existant : la frontière `modules/studio` ↛ `modules/atelier` de `scripts/frontieres.json`, appliquée par `check-module-deps` dans `npm run typecheck` (CI).

*Sources : `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`, `scripts/frontieres.json`, `scripts/migration/migration-lib.test.mjs`.*

### COEX-06 — Conditionner tout retrait définitif à la comparaison avant/après, à une restauration testée et à l’acceptation explicite.

COEX-06 — porte de retrait ratifiée (option A d'ADR-STUDIO-NAV-01). Tout retrait définitif d'un écran, d'une route, d'une table ou d'un stockage de l'Atelier exige trois preuves cumulatives, datées et liées à un SHA : R1 une comparaison avant/après sur le même corpus, sans taux global ; R2 une restauration testée sur cible jetable attestée ; R3 une acceptation explicite du maître d'ouvrage qui cite R1 et R2. Le retrait se fait dans un lot distinct (MIG-COEX-07). Aucun retrait n'est engagé dans le pilote.

*Sources : `docs/ai-team/reports/claude-m13-coex/COEX-02-06-DOSSIERS.md`, `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`.*

### PIL-03 — Distinguer le profil d’essai de vingt outils du catalogue complet et d’un éventuel maximum du produit.

Profil d'essai et catalogue. Le profil de vingt outils est un profil d'essai : il sert aux mesures de chargement (TEST-016, AC-002 ; test `gestionnaire-ressources.test.ts`). Ce n'est pas un plafond. Le catalogue du pilote compte les 38 outils du manifeste `STUDIO_MANIFESTE_OUTILS` (P-08, PIL-02 et B.1-02). Aucun maximum du produit n'est fixé : il reste « non évalué ».

*Sources : `apps/web/src/modules/studio/chargement/gestionnaire-ressources.test.ts`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

## Portes, jalons, estimation et exploitation

### G1-01 — Rassembler les contrats de navigation et des outils retenus, les modèles de données, les droits, l’historique, les migrations et les risques.

Dossier contractuel G1 du pilote (index). Navigation et droits : ADR-STUDIO-NAV-01 §1 à §4 (acceptée, P-03). Outils retenus : `STUDIO_MANIFESTE_OUTILS`, 38 outils (P-08 B.1-02 et PIL-02). Modèles de données : `studio-document/1`, `STUDIO_CONTRACT` et `fadi-studio-archive/1` (A.1-04), tables `studio_*` d'`init.sql`. Historique : DEC-12, révisions immuables. Migrations : `init.sql` et `MIGRATIONS_BROUILLON` (A.1-05). Risques : RISK-01 à 10 et NAV-R01 à 07 (ADR-04), priorités non confirmées (ADR-05). La matrice `matrice-141-exigences-composants-tests-preuves.csv` est jointe avec ses manques.

*Sources : `docs/ai-team/reports/claude-m13-coex/ADR-04-REGISTRE-RISQUES.md`, `docs/continuity/decisions/ADR-STUDIO-NAV-01.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### J0 — Vérifier « Cible et décisions » : Périmètre, traçabilité et décisions nécessaires au premier lot. Ce jalon ne prouve pas : La faisabilité des moteurs.

Fiche J0 — Cible et décisions. Prérequis : G0 accepté pour le cadrage documentaire, et pilote ratifié (CAD-DEC-01 : parcours A, B et C). Preuves : le périmètre du premier lot est autorisé (P-05 : lots A, B, C, D, E, I, R, X) ; DEC-01 à 18 sont arbitrées (P-04) ; ADR-STUDIO-NAV-01 est acceptée (P-03) ; la traçabilité tient en 141 entrées TR au registre. Ce jalon ne prouve pas la faisabilité des moteurs. Points ouverts : ADR-05, DEC-13 (appareils réels), G1 non passée.

*Sources : `docs/ai-team/reports/mission-004/A1/G0-DOSSIER-FINALISE-M004.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/workstreams/studio/CONTEXT.md`.*

### EST-03 — Distinguer charge de travail et délai calendaire lors de l’établissement du calendrier à G3.

Charge et délai (G3). Le calendrier distingue la charge de travail, exprimée par sous-lot (EST-02), et le délai calendaire. Ce délai se déduit de la charge, de la capacité engagée et des dépendances. La seule capacité documentée est la disponibilité du maître d'ouvrage « à la demande, sans engagement de délai » (P-02). Le délai reste donc « non évalué » tant qu'une charge estimée et une capacité engagée ne sont pas fournies.

*Sources : `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`.*

### OPS-02 — Définir les déclencheurs de retour arrière et le responsable de la décision.

Retour arrière de Studio. Déclencheurs automatiques : l'échec d'une sonde après déploiement (`/health` avec `db: ok`, accueil, `/projects` en 401) ramène l'application à l'image précédente (deploiement-automatique.md, phase B). Déclencheurs sur décision : la constatation en production d'un défaut éliminatoire du pilote (G0 : double autorité, corruption de référence, accès interprojets, doublon de commande, écrasement de conflit, publication sous approbation d'un autre contenu). Responsable de la décision : le maître d'ouvrage (RESP-05, P-02). Il est seul à autoriser une restauration de base.

*Sources : `docs/ai-team/reports/mission-004/A1/G0-DOSSIER-FINALISE-M004.md`, `docs/continuity/decisions/ADR-STUDIO-PILOTE-01.md`, `docs/deploiement-automatique.md`.*
