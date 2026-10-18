> **Statut au 18/10/2026 (Lead Claude Code).** Le propriétaire a tranché D-0 : **Studio V1 (#181) est canonique**. Il a aussi tranché D-A : **schéma Studio dans `init.sql`**, idempotent et additif ([#166](https://github.com/RachEma-ux/Fadi/issues/166)). La pile #178 → #182 est gelée.
> - La cause e2e du §0.2 est **confirmée** par le journal du job 117739512838 (`parcours-scenario.mjs:380`).
> - Les étapes 1 et 2 du §6 sont livrées par la PR #184.
> - D-B, D-C, D-F, D-G et D-H restent ouvertes ; en attendant leur décision, le statu quo de `main` s'applique.

# Réconciliation Studio — `main` (#181) contre la pile #178 → #179 → #180 → #182

Revue d'architecture et d'intégration, en **lecture seule** (aucun checkout, commit, push ni commentaire). Réalisée le 18 octobre 2026.

Références relues après `git fetch` :

| Réf. | SHA | Auteur | Base | État de la PR |
|---|---|---|---|---|
| `origin/main` | `17a48b1` (fusion de #181) | Codex | — | #181 fusionnée |
| `feat/173-studio-lot-i` (#178) | `04c4cd1` | Claude | `main` | brouillon, `unstable` |
| `feat/173-studio-etudes` (#179) | `c8386bc` | Claude | lot-i | brouillon, `unstable` |
| `feat/173-studio-variantes` (#180) | `36d50df` | Claude | etudes | brouillon |
| `feat/173-studio-revisions` (#182) | `c38837a` | Claude | variantes | brouillon, `clean` |

Ancêtres communs : lot-i et etudes contiennent `main@17a48b1`. **variantes et revisions partent encore de `817bd36`** : elles ne contiennent ni #181, ni la garde des bases de tests, ni `ADR-STUDIO-NAV-01`, ni la fusion `c8386bc`.

---

## 0. Constats bloquants, à lire avant la matrice

1. **La pile supprime Studio V1.** Le commit de fusion `04c4cd1` (#178), intitulé « Merge main dans feat/173-studio-lot-i : Studio V1 retiré (décision du propriétaire) », efface de la branche tout ce que #181 a livré : `studio-v1.sql`, `lib/studio-commands.ts`, `routes/studio.ts`, les tables Drizzle V1, `StudioPage.tsx`, `atelier-model/src/studio/*`, `e2e/studio-v1*.mjs`, `scripts/validation/studio-v1-*` et le job CI `studio-v1-validation`. Le diff `main..lot-i` compte **1 604 suppressions** pour 399 ajouts. Fusionner #178 dans `main` retire donc Studio V1 de `main`.
   - La « décision du propriétaire (18 octobre 2026) » n'est citée que dans ce message de commit, écrit par Claude.
   - Je ne trouve **aucune trace écrite** de cette décision dans le dépôt : ni dans `docs/continuity/decisions`, ni dans `docs/workstreams/studio`, ni dans `AGENTS.md` ou `CLAUDE.md` (recherche `git grep` sur `main` et sur les quatre branches).
   - `ADR-STUDIO-NAV-01` reste « **Proposé** », avec la mention « Non décidé » (`docs/continuity/decisions/ADR-STUDIO-NAV-01.md:3` et `:134`).
   - **Il faut la confirmer explicitement auprès du propriétaire**, avec un lien vers Issue ou PR, avant toute fusion. COEX-06 (porte de retrait : comparaison avant / après, restauration testée, acceptation explicite, lot distinct) s'applique par analogie (ADR §5, l.82).
2. **La CI de `main` est rouge** sur `17a48b1` (run 39147415474).
   - `validate` échoue : 12 fichiers de tests API sont refusés par la garde des bases de tests de #181 (`TestDatabaseRefusal: TARGET_REQUIRED`, `apps/api/src/testing/test-target.ts:11`, appelée par `src/db/client.ts:8`). Le job `validate` ne fournit aucune cible attestée.
   - `e2e` échoue à l'étape « Scénario Playwright ». Cause **probable, non confirmée** (le journal n'était pas accessible) : `apps/web/e2e/parcours-scenario.mjs:380` attend toujours `Accueil|Projets|Collaboration`, alors que #181 ajoute l'entrée Studio (`AppShell.tsx:93`). La pile corrige déjà cette ligne.
   - Le job `studio-v1-validation`, qui porte la seule preuve de persistance, ne se déclenche que pour `head_ref == 'feat/156-studio-v1'` (`.github/workflows/ci.yml:16`). **Sur `main`, aucune recette Studio ne tourne plus.**
   - Même symptôme sur la pile : `validate` échoue sur `04c4cd1` (lot-i). variantes et revisions sont vertes **seulement parce qu'elles ignorent la garde** (base `817bd36`).
3. **Studio V1 n'a pas de tables dans les environnements normaux.**
   - `studio-v1.sql` n'est ni dans `init.sql` ni dans `db:migrate` (l.1–2 : « À appliquer seulement au profil jetable autorisé »).
   - Pourtant, l'entrée de barre `/studio` est en production sur `main` (`AppShell.tsx:93`, `App.tsx:57`). Dans tout environnement migré par `db:migrate`, `GET /projects/:id/studio/studies` touche une relation inexistante, ce qui donne une erreur 500.
4. **Même nom de table, deux schémas.** `studio_revisions` existe des deux côtés avec des colonnes incompatibles (§4). Si les deux sources de DDL coexistent, la création est muette (`CREATE TABLE IF NOT EXISTS`), puis `CREATE UNIQUE INDEX … (variante_id, numero)` échoue.

---

## 1. Ce que `main` contient (#181, Codex)

| Domaine | Fichier et lignes | Contenu |
|---|---|---|
| DDL | `apps/api/src/db/studio-v1.sql:1-55` | Trois tables en anglais. `studio_studies(id, project_id, name, initial_variant_id, created_at)` (l.4-10). `studio_variants(id, study_id, name, head_revision_id)` (l.12-18). `studio_revisions(id, variant_id, parent_revision_id, document jsonb CHECK schemaVersion='studio-document/1' ∧ units='m' ∧ frame='local-2d', envelope, request_id, payload_hash sha256, source ∈ {authenticated-session, study-initialization}, author_id RESTRICT, response jsonb)` (l.19-39). Clés étrangères composites différées : tête dans la même variante, parent dans la même variante, variante initiale dans la même étude (l.37-45). Déclencheur `studio_revisions_no_update` → `studio_v1_immutable_revision()` (l.48-54). **Hors `init.sql` et hors `db:migrate`.** |
| Drizzle | `apps/api/src/db/schema.ts:608-650` | Type `StudioContext` (l.609-614) ; `studioStudies` (l.616), `studioVariants` (l.625), `studioRevisions` (l.633, `uniqueIndex(variantId, requestId)` l.647). Importe `StudioDocument` et `StudioEnvelope` depuis `@parcours/atelier-model` (l.15). |
| Service de commandes | `apps/api/src/lib/studio-commands.ts:1-159` | Enveloppe zod `studio-commands/1` : `requestId`, `baseRevisionId`, 1 à 500 commandes, `toolId` parmi 4 outils (l.18-24). Empreinte canonique SHA-256 (l.34-46). `lockedAccess` verrouille le projet et le membre (`FOR SHARE`) (l.56-61). `readStudioContext` (l.63-80). `createStudioStudy` crée étude, variante initiale et révision 0 dans une transaction (l.89-107). `submitStudioCommands` passe par `orchestrerCommandesDansTransaction` (prepare → replay → execute, l.109-158) : la variante est verrouillée `FOR UPDATE` (l.123) ; un rejeu avec un autre auteur ou une autre empreinte donne 409 `request_conflict` (l.132-134) ; une base périmée donne 409 `stale_revision` avec `headRevisionId` (l.139-141) ; le réducteur pur `applyStudioCommands` (l.143) produit une révision append-only et fait avancer le `head` (l.153-154). |
| Orchestrateur commun (R9) | `apps/api/src/lib/atelier-validation.ts` (diff #181, +23 l. en tête) | `CommandExecutionScope` (atelier \| studio), `ScopedCommandHandler`, `orchestrerCommandesDansTransaction`. L'Atelier y passe aussi (`validerDansTransaction`). |
| Droits | `apps/api/src/lib/owned-project.ts` (diff #181) | `loadProjectAccess(…, executor)` est lisible dans la transaction. `projectAccessRefusal()` factorise 404, 403, `reference-protegee` et 423. Studio exige `read` pour lire et `modify` pour créer ou écrire (`studio-commands.ts:91`, `:125`), donc refus sur la référence protégée et sur un verrou d'édition d'un autre utilisateur. |
| Routes API (EN) | `apps/api/src/routes/studio.ts:25-41`, montées par `routes/projects.ts:203` | `GET` et `POST /projects/:projectId/studio/studies`. `GET …/studies/:studyId/variants/:variantId`. `GET …/variants/:variantId/revisions/:revisionId`. `POST …/variants/:variantId/commands`. JSON limité à 1 Mo (l.10). **Ni liste ni création de variantes, ni liste de révisions.** |
| Modèle pur | `packages/atelier-model/src/studio/document-2d.ts:1-178` | `StudioDocument { id, schemaVersion 'studio-document/1', units 'm', frame 'local-2d', objects: (line\|rectangle)[] }` (l.19-25). Commandes ligne, rectangle, déplacer, modifier (l.27-31). Validation stricte : champs inconnus refusés, prototypes vérifiés (l.51-80+). |
| Registre | `packages/atelier-model/src/studio/registry.ts:39-45` | 5 outils : sélection (Espace), ligne (L), rectangle (R), déplacer (M), modifier (E). `iconeSymbolique`, schémas d'entrée et de sortie, `agentExposure: "none"`. Contrats `studio-commands: 1` et `studio-document: 1` dans `manifest.json`. |
| Web | `apps/web/src/modules/studio/StudioPage.tsx:1-136`, `studio.css`, `App.tsx:57`, `AppShell.tsx:93`, `lib/api.ts` (`studioStudies`, `createStudioStudy`, `studioContext`, `studioCommands`) | Une seule page monolithique pour 3 routes : `/studio`, `/studio/projets/:projectId`, `/studio/projets/:projectId/etudes/:studyId/variantes/:variantId`. Barre d'outils construite depuis `STUDIO_TOOLS` (l.128), dessin SVG, enregistrement par enveloppe (`requestId: crypto.randomUUID()`, l.99), garde de navigation (`beforeunload`, clics, `popstate`, l.42-60), plein écran explicite (l.128). Icône de barre : `design`, partagée. **Pas de page d'étude sans variante, pas d'écran « adresse inconnue »** (un `/studio/x` retombe sur le repli `*`), pas de limite d'erreur. |
| i18n | `apps/web/src/lib/i18n/en.json` (+56 l.) | Traductions de StudioPage. |
| Tests | `packages/atelier-model/src/studio/document-2d.test.ts` (142 l.) ; `apps/api/src/testing/studio-orchestrator.test.ts` (5 cas, l.18-41) ; `testing/client-integration.test.ts`, `guarded-test-pool*.ts`, `test-target*.ts` (garde DB-1/2) ; `apps/web/e2e/studio-v1.mjs` (312 l., 39 contrôles) et `studio-v1-smoke.mjs` ; `scripts/validation/studio-v1-{profile,apply,functional}.py`, `studio_profile_guard.py` et son test | Preuve réelle de persistance et de réouverture, **sur un profil PostGIS jetable seulement** (job CI réservé à la branche `feat/156-studio-v1`). |

---

## 2. Ce que la pile contient, PR par PR (Claude)

### #178 — lot I : entrée et enveloppe (`64b2588` puis fusion `04c4cd1`)

| Fichier | Contenu |
|---|---|
| `apps/web/src/modules/studio/routes-studio.ts` (33 l.) | Contrat d'adresse pur : `lireRouteStudio` → accueil, projet ou inconnue ; identifiant `^[A-Za-z0-9_-]{1,128}$` ; `cheminProjetStudio`. |
| `routes-studio.test.ts` (28 l.) | Tests unitaires du contrat. |
| `StudioShell.tsx` (146 l.) | Enveloppe indépendante de `ProjectShell` (ADR C-A) : accueil (projets autorisés, suggestion du dernier dossier), page projet, écrans de refus et d'adresse inconnue (`data-studio-inconnue`, ADR R-B). |
| `App.tsx` | `/studio/*` → `StudioShell`, chargé à la demande. |
| `AppShell.tsx:93` | Même NavLink, mais avec l'icône **`studio`** et `data-nav-studio`. |
| `components/Icon.tsx` | Nouvelle icône `studio`. |
| `HomeTopbar.tsx:30` | Titre de page « Studio ». |
| `e2e/studio-navigation.mjs` (138 l.) | Recette NAV, ajoutée au job e2e de `ci.yml`. |
| `e2e/parcours-scenario.mjs:380` | Barre attendue : `Accueil\|Projets\|Studio\|Collaboration`. |
| `e2e/interface-anglais.mjs:114-115` | Écrans `/studio` et `/studio/projets/:pid` ajoutés. |
| `en.json` (+18) | Traductions. |
| **Suppressions** | Tout Studio V1 (voir §0.1), contrats retirés de `atelier-model/manifest.json` et job `studio-v1-validation` retiré de `ci.yml`. Garde des bases et orchestrateur commun **conservés**. |

### #179 — études (`01f010b`, fusion `c8386bc`)

| Fichier | Contenu |
|---|---|
| `apps/api/src/db/init.sql:466-478` | `studio_etudes(id, project_id, nom, description, author_id CASCADE, created_at, updated_at)`, unicité `lower(nom)` par projet. **Dans le migrateur historique.** |
| `schema.ts:608` | `studioEtudes`. |
| `routes/studio-etudes.ts` | `GET /` (l.28), `POST /` (l.35), `GET /:etudeId` (l.60), sous `/projects/:projectId/studio/etudes` (`projects.ts`). Droits `read` / **`write`** via `projectOr404`. Doublon → 409 `conflit` (pré-contrôle et code 23505). Identifiant `etu_…`. |
| `studio-etudes.test.ts` (75 l.) | Création, liste, nom unique, accès concurrents, droits. Passé à `resetTestDatabase` dans `c8386bc`. |
| `StudioShell.tsx` (+126), `routes-studio.ts` | Vue `etude`, page de cadrage, formulaire `CreerEtude`. |
| `lib/api.ts` | `listEtudesStudio`, `getEtudeStudio`, `creerEtudeStudio`. |
| `e2e/studio-navigation.mjs` (+43), `en.json` (+21) | Recette et traductions. |

### #180 — variantes (`36d50df`, base `01f010b`, **sans** la fusion `c8386bc`)

| Fichier | Contenu |
|---|---|
| `init.sql:480-491` | `studio_variantes(id, etude_id, project_id (dénormalisé), nom, author_id, created_at)`, unicité `lower(nom)` par étude. **Pas de `head_revision_id`.** |
| `schema.ts:619` | `studioVariantes`. |
| `studio-etudes.ts:80,92,122` | `GET` et `POST /:etudeId/variantes`, `GET /:etudeId/variantes/:variantId` ; `var_…` ; droits `read` / `write`. |
| `routes-studio.ts` | Vue `variante` avec `?domaine=dessin\|bim\|visualisation\|documentation` et `planche=2d\|3d` (dessin seulement). Paramètre inconnu ou répété → « inconnue » (ADR §1). |
| `StudioShell.tsx` (+144) | Liste et création des variantes, sélecteur de domaine et de planche. |
| Tests | `studio-etudes.test.ts` (+53 : variantes, accès concurrents, droits), `routes-studio.test.ts` (+25), `e2e/studio-navigation.mjs` (+50), `interface-anglais.mjs` (+8). |
| Bruit | Comparé à la tête actuelle d'etudes, le diff montre −114 k lignes de docs : ce n'est qu'un **décalage de base**, pas un apport. |

### #182 — révisions et Planche 2D (`c38837a`)

| Fichier | Contenu |
|---|---|
| `init.sql:493-518` | `studio_revisions(id, variante_id, project_id, numero > 0, parent_id, document_id, request_id, schema_version, contenu jsonb, empreinte, author_id CASCADE, created_at)`. Index uniques `(variante_id, numero)` et `(variante_id, request_id)`. Déclencheur `studio_revisions_immuables`. |
| `schema.ts:629` | `studioRevisions` (**même identifiant TS et même nom de table que `main`**). |
| `routes/studio-revisions.ts:1-127` | `GET /` (entêtes), `GET /:revisionId`, `POST /` (corps 2 Mo, exempté dans `app.ts:40`). Le corps porte `{ requestId ^[A-Za-z0-9_-]{8,128}$, baseRevisionId \| null, contenu }`, c'est-à-dire un **instantané complet**, pas des commandes. Validation `studio2d.validerDocument2D`, empreinte `sha256:` de la forme canonique. Rejeu : même empreinte et même parent → 200 `rejoue` ; sinon 409 `requete_reutilisee` (l.87-94). Tête = `max(numero)` (l.49) ; tête différente → 409 `conflit_revision` avec `teteRevisionId` et `teteNumero` (l.96-100). **Pas de transaction, pas de verrou** : la concurrence est tranchée a posteriori par l'index unique (l.119-126). **N'utilise pas `orchestrerCommandesDansTransaction`.** |
| `packages/domain-model/src/studio-document2d.ts` (272 l.), test (98 l.), export `studio2d` (`index.ts:19`) | `ContenuDocument2D { schemaVersion 'studio.document2d/1', unite 'm', calques[], primitives: (ligne\|cote)[] }` (l.42-47). Cotes associatives (`liens`, `aResoudre`) ; limites 200 calques et 20 000 primitives ; validation et forme canonique ; annuler et rétablir purs. **Aucun repère tagué** (le `frame` est absent). |
| `planche2d/Planche2D.tsx` (565 l.), `outils-2d.ts` (51 l.), `vue-2d.ts` (48 l.), tests, `planche2d.css` | Outils sélection (Espace), ligne (L), cote (Maj+C). Commandes annuler (Ctrl+Z), rétablir (Ctrl+Y), supprimer (Suppr), enregistrer (Ctrl+S), cadrer (Maj+Z). Chaque entrée a une icône, une barre et un raccourci, contrôlés par test (règle d'or). Lecture seule sur `?revision=`. Conflit sans écrasement ; réessai avec le même `requestId`. |
| `lib/api.ts:775-789`, `en.json` (+68), `e2e/studio-navigation.mjs` (+112), `routes-studio.ts` (`revision`) | Client, traductions, recette. |

---

## 3. Doublons

| # | Sujet | `main` (#181) | Pile | Verdict |
|---|---|---|---|---|
| D1 | Hiérarchie Étude / Variante | `studio_studies` / `studio_variants` (EN), variante initiale obligatoire | `studio_etudes` / `studio_variantes` (FR), étude sans variante admise (ADR §1, l.26) | Une seule doit survivre. |
| D2 | Révisions | `studio_revisions` : commandes appliquées, `envelope` + `response`, `head_revision_id` sur la variante | `studio_revisions` : instantané `contenu`, `numero`, tête = max | **Même nom de table**, schémas incompatibles. |
| D3 | Document 2D | `atelier-model/src/studio/document-2d.ts` : `studio-document/1`, `objects`, line et rectangle, `frame: local-2d` | `domain-model/src/studio-document2d.ts` : `studio.document2d/1`, `calques` + `primitives`, ligne et cote | Deux contrats, deux paquets. |
| D4 | Écriture | `POST …/commands` → orchestrateur commun (R9) | `POST …/revisions` → route ad hoc, hors orchestrateur | ADR §3 (l.58) : « même service de commandes ». |
| D5 | Registre d'outils | `STUDIO_TOOLS` (`atelier-model`, 5 outils, `agentExposure`) | `OUTILS_2D` / `COMMANDES_2D` (web, 3 outils et 5 commandes, barres) | Deux registres. |
| D6 | Routes web `/studio` | 3 `<Route>` explicites vers `StudioPage` (`App.tsx:57`) | `/studio/*` → `StudioShell` + `lireRouteStudio` | Mêmes chemins en français, deux implémentations. |
| D7 | Entrée de barre | NavLink, icône `design` | NavLink, icône `studio`, `data-nav-studio` | La fusion git les fond déjà en une entrée (conflit `AppShell.tsx`). |
| D8 | Client API | `studioStudies`, `studioContext`, `studioCommands` | `listEtudesStudio`, …, `enregistrerRevisionStudio` | Deux familles. |
| D9 | Recettes e2e | `studio-v1.mjs`, `studio-v1-smoke.mjs` (profil jetable) | `studio-navigation.mjs` (job e2e standard) | Complémentaires dans l'esprit ; à réconcilier sur un seul modèle. |
| D10 | CSS | `studio.css` (V1, minifié) | `studio.css` (fil d'Ariane, suggestion) + `planche2d.css` | Conflit add/add. |

---

## 4. Incompatibilités de données et d'API

| Aspect | `main` | Pile | Conséquence |
|---|---|---|---|
| Tables | `studio_studies`, `studio_variants`, `studio_revisions` | `studio_etudes`, `studio_variantes`, `studio_revisions` | Collision sur `studio_revisions`. Les noms d'export Drizzle `studioRevisions` entrent aussi en collision (conflit `schema.ts:608-689` dans le merge-tree). |
| Colonnes | `name`, `study_id`, `variant_id`, `parent_revision_id`, `document`, `payload_hash`, `envelope`, `response`, `source` | `nom`, `description`, `etude_id`, `variante_id`, `parent_id`, `numero`, `document_id`, `contenu`, `empreinte` (préfixe `sha256:`), `schema_version` | Aucune compatibilité de lecture. |
| Lieu du DDL | `studio-v1.sql`, hors migrateur | `init.sql`, migrateur historique | Décision de schéma (§7). |
| Identifiants | `studio_study_<uuid>`, `studio_variant_<uuid>`, `studio_revision_<uuid>` | `etu_<uuid>`, `var_<uuid>`, `rev_<uuid>` | Les deux passent la regex web `^[A-Za-z0-9_-]{1,128}$`. `requestId` : `main` admet `.` et `:` (`studio-commands.ts:17`), la pile exige 8 à 128 caractères `[A-Za-z0-9_-]`. |
| URL API | EN : `/studio/studies/:studyId/variants/:variantId/{commands,revisions/:id}` | FR : `/studio/etudes/:etudeId/variantes/:variantId/revisions[/:id]` | Montages parallèles sous `/projects/:projectId/studio`, sans collision de chemin. Il faut choisir un seul jeu. |
| URL web | FR : `/studio/projets/:p/etudes/:s/variantes/:v` | Idem, plus `/etudes/:s` seul et `?domaine&planche&revision` | Compatible. La pile est un sur-ensemble conforme à l'ADR §1. |
| Tête | `studio_variants.head_revision_id NOT NULL`, clé étrangère différée vers la même variante | Pas de colonne ; `max(numero)` | `main` garantit la tête en base ; la pile la déduit. |
| Parent | Clé étrangère composite `(variant_id, parent_revision_id)` : le parent est forcément dans la même variante | `parent_id` → `studio_revisions(id)` sans contrainte de variante | La pile admet en base un parent d'une autre variante (la route l'empêche, pas le schéma). |
| Immuabilité | Déclencheur `studio_revisions_no_update` | Déclencheur `studio_revisions_immuables` | Équivalents ; noms différents (les deux coexisteraient sur une même table). |
| Concurrence | Transaction, `lockProject`, membre `FOR SHARE`, variante `FOR UPDATE` | Sans transaction ; index unique `(variante_id, numero)` puis relecture | `main` est plus fort : une révocation concurrente ne traverse pas le commit (`studio-commands.ts:55-61`). |
| Idempotence | Unicité `(variant_id, request_id)` ; égalité d'auteur **et** d'empreinte, sinon 409 `request_conflict` ; réponse historique rejouée telle quelle | Même unicité ; égalité d'empreinte **et** de parent, sinon 409 `requete_reutilisee` ; **pas de contrôle d'auteur** | La pile rejoue la révision d'un autre auteur qui aurait le même `requestId`. |
| Codes d'erreur | `stale_revision` + `headRevisionId`, `invalid_commands`, `request_conflict` | `conflit_revision` + `teteRevisionId` / `teteNumero`, `document_invalide`, `requete_reutilisee`, `conflit` | Le client doit suivre un seul contrat. |
| Droits en écriture | `modify` (refus de la référence protégée et du verrou d'un tiers) | `write` (pas de refus de la référence protégée) | Divergence. Studio n'écrit pas le modèle Atelier, donc `write` se défend, mais l'exemple de référence devient alors modifiable par Studio. À trancher (§7). |
| Suppression d'un auteur | `author_id ON DELETE RESTRICT` (révisions) | `author_id ON DELETE CASCADE` | La pile efface l'historique quand un utilisateur est supprimé. |
| Contrat document | `units` + `frame: local-2d` | `unite`, sans repère | CLAUDE.md : « Repères … tagués ». Le modèle de la pile n'a pas de repère tagué. |
| Paquet | `atelier-model` (contrats dans `manifest.json`) | `domain-model` | Couplage différent : `check-module-deps` à contrôler. |

---

## 5. Ce que la pile apporte et qui manque à `main`

| Apport | Fichiers | Valeur | Adaptation au modèle de `main` |
|---|---|---|---|
| A1. `StudioShell` indépendant + contrat d'adresse pur | `StudioShell.tsx`, `routes-studio.ts` + test | Répond à l'ADR R-B (écran « adresse inconnue »), C-A et §1 (étude sans variante, `domaine`, `planche`, `revision`). | Remplacer les appels `*EtudeStudio`/`*VarianteStudio` par `studioStudies`/`studioContext`. Ajouter les lectures manquantes côté API (§6). Héberger le plan de dessin de `StudioPage` (ou `Planche2D`) dans la vue `variante`. |
| A2. Pages de liste projet / étude / variante, formulaires de création, lecture seule par rôle | `StudioShell.tsx` (`StudioAccueil`, `StudioProjet`, `StudioEtude`, `VariantesEtude`, `CreerEtude`, `CreerVariante`) | `main` n'a ni liste de variantes ni création de variante. | Il faut côté `main` : `GET /studies/:id` et `GET`/`POST /studies/:id/variants` (une nouvelle variante = révision initiale + `head`, même schéma de transaction que `createStudioStudy`). |
| A3. Icône `studio`, `data-nav-studio`, titre « Studio » dans `HomeTopbar` | `Icon.tsx`, `AppShell.tsx:93`, `HomeTopbar.tsx:30` | Règle d'or : icône propre. Lève la réutilisation de `design`. | Reprise directe. |
| A4. Correctifs e2e transverses | `parcours-scenario.mjs:380`, `interface-anglais.mjs:114-115+` | Corrige probablement le rouge e2e de `main`. | Reprise directe. |
| A5. Recette NAV | `e2e/studio-navigation.mjs` + étape `ci.yml` | NAV-001…009 dans le job e2e standard (pas seulement sur le profil jetable). | Réécrire les étapes de création et d'enregistrement sur les routes EN de `main`. Exige des tables Studio dans la base e2e (§7, décision D-A). |
| A6. Planche 2D : barres, raccourcis, annuler/rétablir, cotes associatives, calques, vue/cadrage | `planche2d/*`, `studio-document2d.ts` (logique de cotes, `annuler`/`retablir`) | Plus riche que l'éditeur V1 (cote, calques, Ctrl+Z/Y, Ctrl+S). Règle d'or testée (`outils-2d.test.ts`). | Pour rester sur le contrat `studio-commands/1` : (a) étendre `StudioDocument` (calques, `cote`, avec `frame` conservé) en `studio-document/2` et ajouter les `toolId` `studio.dessin.cote`, `studio.dessin.supprimer`, `studio.calque.*` à `STUDIO_TOOLS` et à l'enum de `studio-commands.ts:21` ; (b) faire émettre des **commandes** par `Planche2D` au lieu d'un instantané `contenu`. `outils-2d.ts` devient une vue de `STUDIO_TOOLS` (un seul registre). |
| A7. i18n | `en.json` (+18/+21/+27/+68) | Traductions des nouveaux écrans. | Union des clés ; retirer celles des écrans abandonnés. |
| A8. Tests API (droits, accès concurrents, doublons de nom) | `studio-etudes.test.ts`, `studio-revisions.test.ts` | Bons oracles (lecteur 403, inconnu 404, étude d'un autre projet 404, accès concurrents 201/409). | Réécrire sur les routes et le contrat de `main`, avec `resetTestDatabase` (garde DB-1/2). |
| A9. Unicité du nom (insensible à la casse) | index `lower(nom)` | `main` ne l'impose pas. | Facultatif : à ajouter à `studio-v1.sql` (ou à son successeur) seulement si le propriétaire le veut. |

---

## 6. Plan d'intégration recommandé : un seul Studio

### Modèle canonique recommandé : celui de `main` (#181)

Je le recommande pour cinq raisons :

1. Il est **fusionné**, avec une preuve de persistance et de réouverture sur PostGIS neuf (`scripts/validation/studio-v1-functional.py`, `e2e/studio-v1.mjs`).
2. Il passe par l'orchestrateur commun (R9, ADR §3 l.58).
3. Il a des transactions et des verrous, la tête en base, des clés étrangères composites, le contrôle d'auteur sur le rejeu, le droit `modify` et un `frame` tagué.
4. Son registre porte `agentExposure`.
5. La pile, au contraire, réécrit les révisions hors de l'orchestrateur et sans transaction.

**Réserve.** Si le propriétaire confirme par écrit la « décision du 18 octobre » citée dans `04c4cd1`, c'est lui qui tranche. Le présent plan reste valable comme liste de ce qu'il faudrait renforcer dans la pile (transaction, verrous, orchestrateur, auteur, `frame`, `head`, `RESTRICT`).

**Langue des noms.** Garder les noms SQL et API en anglais de `main` : ils sont fusionnés et prouvés, et les identifiants de code anglais suivent l'usage du schéma existant. Les URL web restent en français (identiques des deux côtés, ADR §1). La langue des URL API est à confirmer (§7, D-B).

### Étapes, une PR chacune, CI verte entre deux

0. **Geler la pile.** Ne fusionner ni #178 ni #179 en l'état, puisque #178 supprime V1. Laisser #180 et #182 en brouillon, comme sources.
1. **Remettre `main` au vert** (petite PR) :
   - donner à la CI `validate` une cible de test attestée, ou suivre le `testing/README.md` de #181, pour lever `TARGET_REQUIRED` ;
   - reprendre A4 (`parcours-scenario.mjs:380`, `interface-anglais.mjs`) ;
   - faire tourner `studio-v1-validation` sur `main` et les PR Studio, pas seulement sur `feat/156-studio-v1` (`ci.yml:16`).
2. **Décider où vit le DDL Studio** (D-A). Selon la décision, intégrer `studio-v1.sql` au migrateur (avec `IF NOT EXISTS` et un déclencheur idempotent), ou le garder hors migrateur et masquer l'entrée `/studio` quand les tables manquent (aujourd'hui l'entrée est visible et l'API répond 500).
3. **Compléter l'API de `main`** :
   - `GET /studies/:studyId` ;
   - `GET`/`POST /studies/:studyId/variants` (transaction, révision initiale, `head`) ;
   - `GET …/variants/:variantId/revisions` (liste des entêtes).
   
   Reprendre les oracles de A8.
4. **Porter l'enveloppe web** :
   - `routes-studio.ts` + test, `StudioShell.tsx` (A1, A2), branchés sur `api.studio*` ;
   - réduire `StudioPage.tsx` à un composant « espace de variante » monté par `StudioShell` ;
   - reprendre A3 (icône `studio`) et ajouter une limite d'erreur (ADR R-C).
5. **Porter la Planche 2D sur le contrat de commandes** (A6) :
   - étendre `atelier-model/src/studio` (calques, cote, `studio-document/2` avec migration de lecture de `/1`) et `STUDIO_TOOLS` ;
   - faire émettre des commandes par `Planche2D.tsx` et dériver `outils-2d.ts` du registre ;
   - **ne pas** porter `packages/domain-model/src/studio-document2d.ts` comme second contrat : en extraire seulement la logique utile (cotes associatives, annuler/rétablir purs) vers `atelier-model`.
6. **Recettes** :
   - réécrire `studio-navigation.mjs` sur le modèle de `main` et l'ajouter au job e2e ;
   - garder `studio-v1.mjs` / `studio-v1-smoke.mjs` (les renommer éventuellement `studio-*.mjs`).
7. **Fermer #178 à #182** avec renvoi vers les PR de portage. Supprimer `routes/studio-etudes.ts`, `routes/studio-revisions.ts`, les tables `studio_etudes`/`studio_variantes`/`studio_revisions` (variante FR) de `init.sql` et de `schema.ts`, `domain-model/studio-document2d.ts` et les fonctions `*EtudeStudio`/`*VarianteStudio`/`*RevisionStudio` de `api.ts`.

### Fichiers : garder, porter, abandonner

| Garder (`main`) | Porter depuis la pile (en l'adaptant) | Abandonner (pile) |
|---|---|---|
| `studio-v1.sql`, `schema.ts:608-650`, `lib/studio-commands.ts`, `routes/studio.ts`, `atelier-validation.ts` (orchestrateur), `owned-project.ts`, `atelier-model/src/studio/*`, `testing/*`, `e2e/studio-v1*.mjs`, `scripts/validation/studio-*` | `routes-studio.ts` (+test), `StudioShell.tsx`, `planche2d/{Planche2D.tsx,outils-2d.ts,vue-2d.ts,planche2d.css}` (+tests), `Icon.tsx` (`studio`), `AppShell.tsx` (`data-nav-studio`), `HomeTopbar.tsx`, `e2e/studio-navigation.mjs`, `parcours-scenario.mjs:380`, `interface-anglais.mjs`, `en.json` (union), étape `ci.yml`, oracles de `studio-etudes.test.ts`/`studio-revisions.test.ts`, logique de cotes de `studio-document2d.ts` | `init.sql` (tables `studio_etudes`/`studio_variantes`/`studio_revisions` FR et déclencheur), `schema.ts` (`studioEtudes`, `studioVariantes`, `studioRevisions` FR), `routes/studio-etudes.ts`, `routes/studio-revisions.ts`, exemption `app.ts:40`, montage `projects.ts` `/studio/etudes`, `domain-model/src/studio-document2d.ts` en tant que contrat, export `studio2d`, suppressions de V1 de `04c4cd1` |

### Tests à rejouer à chaque étape

- `npm run typecheck`, `npm test` (dont `atelier-model` `document-2d.test.ts`, `studio-orchestrator.test.ts`, la garde DB `test:db-guard`, `routes-studio.test.ts`, `outils-2d.test.ts`, `vue-2d.test.ts`) et `npm run build`.
- e2e : `studio-v1.mjs`, `studio-v1-smoke.mjs` (via `scripts/validation/studio-v1-functional.py`), `studio-navigation.mjs`, `parcours-scenario.mjs` (barre `Accueil|Projets|Studio|Collaboration`), `interface-anglais.mjs` (écrans Studio sans reste de français), `accueils-design.mjs` (NAV-009 / COEX-02 : les 14 accès Atelier H01 à H14 restent intacts).
- `check-module-deps` : aucun import Atelier ↔ Studio hors contrat (COEX-05).

---

## 7. Décisions qui reviennent au propriétaire

| # | Décision | Pourquoi elle lui revient |
|---|---|---|
| D-0 | **Quel Studio est canonique** : V1 (#181) ou la pile ? La « décision du 18 octobre » citée dans `04c4cd1` doit être confirmée par écrit (Issue ou PR), sinon la suppression de V1 est annulée. | Retrait d'un livrable fusionné, porte COEX-06 R3 par analogie. |
| D-A | Mettre les tables Studio dans `init.sql` / `db:migrate` (migrateur historique), ou les garder hors migrateur (`studio-v1.sql`) avec une procédure d'application. | Décision de schéma physique, sur la base de production. `studio-v1.sql:2` l'exclut explicitement. |
| D-B | Langue des URL API : EN (`studies/variants`, `main`) ou FR (`etudes/variantes`, pile). Les URL web en français sont déjà alignées. | Contrat public, ADR « ROUTE-09 » non tranché (`ADR-STUDIO-NAV-01.md:146`). |
| D-C | Droit d'écriture Studio : `modify` (refus sur la référence protégée D-016 / D-194) ou `write`. | Portée de D-194 au-delà de l'Atelier. |
| D-D | Modèle de révision : commandes rejouées (V1, R9) ou instantanés complets (pile). Une variante existe-t-elle sans révision ? Une étude sans variante est-elle admise (ADR §1 : oui) ? | DEC-01 / DEC-03 et ADR §3. |
| D-E | Contrat document : `studio-document/1` étendu à `/2` (calques, cotes), paquet `atelier-model` ou `domain-model`. Repère `frame` obligatoire. | Contrat versionné (`manifest.json`) et règle des repères tagués. |
| D-F | Unicité du nom (insensible à la casse) des études et des variantes ; `ON DELETE RESTRICT` ou `CASCADE` sur l'auteur des révisions. | Règles métier de conservation de l'historique. |
| D-G | Statut d'`ADR-STUDIO-NAV-01` (Proposé → Accepté) : mécanisme d'entrée E-B, plein écran E-C, COEX-01/03/04. | L'ADR dit elle-même (l.9) qu'elle « n'autorise aucun code Studio » tant qu'elle reste « Proposé ». Le code Studio est pourtant déjà fusionné. |
| D-H | Exécution de la CI Studio sur `main` (job `studio-v1-validation`, profil PostGIS jetable sur un runner GitHub). | Infrastructure et coût ; conditions d'un profil jetable attesté (A6). |

---

## 8. Essai de fusion de `origin/main` dans chaque branche (`git merge-tree --write-tree`)

| Branche | Résultat | Fichiers en conflit |
|---|---|---|
| `feat/173-studio-lot-i` (#178) | **propre** (rc=0) : `main` y est déjà fusionné | — |
| `feat/173-studio-etudes` (#179) | **propre** (rc=0) | — |
| `feat/173-studio-variantes` (#180) | **conflits** (rc=1) | `apps/api/src/db/schema.ts`, `apps/web/src/lib/i18n/en.json`, `apps/web/src/modules/studio/studio.css` (add/add), `apps/web/src/routes/AppShell.tsx` |
| `feat/173-studio-revisions` (#182) | **conflits** (rc=1) | les mêmes 4 fichiers. Dans `schema.ts:608-689`, les deux `studioRevisions` sont face à face. |

Compléments :

- Fusionner etudes (`c8386bc`) dans variantes ne bute que sur `en.json`. Fusionner etudes dans revisions, idem. C'est le chemin que la pile a suivi pour propager le retrait de V1.
- **Attention** : une fusion naïve de `main` dans variantes ou revisions, sans passer par `04c4cd1`, **réintroduit V1 à côté de la pile**. On obtient alors deux hiérarchies montées en parallèle, deux exports `studioRevisions` et deux DDL pour la table `studio_revisions`.

## 9. État CI constaté (API GitHub, 18 octobre 2026)

| Tête | validate | e2e |
|---|---|---|
| `main@17a48b1` | **échec** (`TARGET_REQUIRED`, 12 fichiers API) | **échec** (Scénario Playwright) |
| lot-i `04c4cd1` | **échec** | en cours |
| etudes `c8386bc` | en cours | en cours |
| variantes `36d50df` | succès (base `817bd36`, sans la garde) | succès |
| revisions `c38837a` | succès (idem) | succès |

Contrôles non exécutés pendant cette revue : je n'ai lancé ni `typecheck`, ni les tests, ni le build, ni les e2e, en local ou sur un arbre de travail (mission en lecture seule). La cause exacte de l'échec e2e de `main` n'a pas été lue (accès aux journaux complets refusé). L'hypothèse retenue est la ligne `parcours-scenario.mjs:380`.
