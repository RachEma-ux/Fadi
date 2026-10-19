# Contrôles réellement exécutés par la CI — et ce qu'ils ne couvrent pas (X.4-03)

Relevé établi le 19 octobre 2026 par l'équipe X4 (Architecture / DevOps), sur la branche `teamx4-frontieres` (base `lead-vague4`, `b7305a5`), par lecture des fichiers `.github/workflows/*.yml` et des scripts qu'ils appellent. Il ne s'appuie sur aucun run distant : chaque ligne dit ce que le fichier de workflow **déclare exécuter**, et à quelle condition.

**Règle de lecture : « CI verte » ne veut pas dire « tout est couvert ».** Un job sauté (`skipped`) ou qui réussit sans rien exécuter n'est pas une preuve. Les suites DB-3 refusées par la garde ne sont **pas** des suites réussies. La partie B énumère ce que la CI n'exécute pas.

---

## A. Contrôles exécutés

### A.1 Sur chaque PR et chaque push sur `main`

| Workflow / job | Ce qui tourne | Ce que le succès prouve |
|---|---|---|
| `architecture-guards.yml` / **Architecture — frontières et isolation** | `node --test scripts/architecture-guards*.test.mjs scripts/check-module-deps.test.mjs` ; **`node --test scripts/check-frontieres.test.mjs`** (ajouté par X.4) ; `node scripts/check-module-deps.mjs` ; `node scripts/check-fadi-isolation.mjs` | Les imports **littéraux** du dépôt respectent la table `scripts/frontieres.json` et les manifestes des paquets (frontières, couches Studio, modèle pur, Studio de l'API, cycles). Les témoins prouvent sur des arbres de test qu'un mauvais import fait échouer le contrôle. |
| `continuity.yml` / Continuité | `node --test scripts/check-continuity.test.mjs` ; `node scripts/check-continuity.mjs` ; checkpoints des chantiers modifiés (PR seulement) | Structure des dossiers de reprise ; pas l'exactitude de leur contenu. |
| `fadi-isolation.yml` | Contrôle des références nominales externes | Absence des références nominales recherchées, rien d'autre. |
| `codex-missions.yml` / Codex — 31 missions et 630 tâches | Tests unitaires Python du validateur ; `check_missions.py --check` | Couverture **documentaire** des affectations ; aucune fonctionnalité n'est validée par ce job. |
| `ci.yml` / **validate** (service PostGIS) | `npm ci` ; `npm run typecheck` (lance aussi `check-module-deps.mjs`, donc la table des frontières) ; `npm run db:migrate` ; tests Vitest de `core-geometry`, `domain-model`, `atelier-model`, `planche-model`, `geometry-exact` et `web` ; `npm run test:db-guard` (suites `apps/api/src/testing/**`, dont la nouvelle `studio-validation-runtime.test.ts`, voir A.3) ; tests API **hors base** avec `check-api-tests-db3.mjs` ; `npm run build` ; corpus IFC (`petit`, `p118`, `p118-reimporte`, `studio`) validé par IfcOpenShell 0.9.0 | Types, tests unitaires, build et validité IFC du corpus. **Les 12 suites DB-3 ne tournent pas** (B.1). |
| `ci.yml` / **e2e-shard** ×5 (`parcours`, `complements`, `atelier`, `planche`, `p2`) + agrégat **e2e** | Par tranche : PostGIS, migration, build, API servant le build ; recettes Playwright (Chromium) `apps/web/e2e/*.mjs` nommées dans `ci.yml` ; tranche `parcours` : `scripts/verify-restore.sh` (sauvegarde puis restauration) | Les parcours scénarisés passent sur Chromium contre une base neuve. Pas de couverture des chemins non scénarisés. |
| `ci.yml` / **image** | `docker build` ; démarrage du conteneur ; sondes `/health`, `/accueil`, `/projects` | L'image se construit et répond sur trois routes. |

Exceptions bornées dans `ci.yml` : `validate`, `e2e-shard`, `e2e` et `image` sont **sautés** pour trois branches exactes (`docs/156-codex-missions-completes`, `fix/157-test-database-guard`, `feat/156-studio-v1` vers les bases listées). Sur ces branches, leur statut `skipped` ne prouve rien.

### A.2 Contrôles conditionnels

| Workflow / job | Condition | Remarque |
|---|---|---|
| `ci.yml` / **Studio V1 — API, navigateur et réouverture sur PostGIS neuf** | Dépôt `RachEma-ux/Fadi` seulement ; sur PR, seulement si le diff touche `apps/api/src/lib/studio-*`, `apps/api/src/routes/studio.ts`, `apps/api/src/db/init.sql`, `apps/web/src/modules/studio/**`, `packages/atelier-model/src/studio/**`, `scripts/validation/**`, `apps/web/e2e/studio-v1*.mjs` ou `ci.yml` ; toujours sur push `main` | Hors périmètre, le job **réussit sans exécuter la recette** et l'écrit dans son résumé. Sur une fourche, il est sauté. |
| `ci.yml` / Mission 004 — documentation sans base | Branche `docs/156-codex-missions-completes` seulement | Documentaire. |
| `ci.yml` / DB1/2 — tests simulés sans base | Branche `fix/157-test-database-guard` seulement | Typecheck, garde DB, build ; aucune base. |
| `project-layout.yml` | Filtre de chemins (PR et push `main`) | Pages projet, largeurs, navigation : ne tourne pas si les chemins filtrés ne changent pas. |
| `audit-drawall.yml` | Filtre de chemins, ou lancement manuel | Inventaire seulement (aucune suppression, aucun verdict). |
| `backup-monitoring.yml` | Filtre de chemins, ou lancement manuel | États du service et mode **simulé** de Restic ; aucune sauvegarde distante réelle. |
| `builder-deploy.yml` | **Manuel seulement** (`workflow_dispatch`) | Jamais déclenché par une PR. |

### A.3 Contrôles ajoutés par le lot X.4 / X.2-03

- **Table des frontières** `scripts/frontieres.json`, appliquée par `scripts/check-module-deps.mjs` (dans `typecheck`, donc dans `validate`, et dans le job d'architecture) :
  - couches du modèle Studio (`packages/atelier-model/src/studio`) : noyau, exporteurs, objets, objets-3d, architecture, registre, commandes, échanges, avec des exceptions explicites et motivées ; une exception qui ne sert plus fait échouer le contrôle (`EXCEPTION_PERIMEE`) ;
  - modèle pur (`packages/*`) : ni `react`, `react-dom`, `three`, `@react-three/*`, ni `@fadi/web` / `@fadi/api`, même déclarés dans un manifeste ; `lib` DOM interdite dans le tsconfig, sauf trois exceptions listées ;
  - Studio de l'API (`apps/api/src/lib/studio-*`, `routes/studio*`) : aucun code web, ni React, ni three ;
  - Studio ↔ Atelier (Planche comprise) dans `apps/web/src` : règles existantes déplacées dans la table, sans doublon.
- **Témoins** `scripts/check-frontieres.test.mjs` (26 tests) : arbres de test temporaires, hors du dépôt. Chaque règle a un cas qui doit échouer.
- **X.2-03** `apps/api/src/testing/studio-validation-runtime.test.ts` (11 tests, transport simulé, aucune base) : `submitStudioCommands` refuse à l'exécution, sans aucune écriture :
  - un `toolId` absent du registre, même typé par forçage (400 `invalid_input`, avant toute transaction) ;
  - un outil de lecture ;
  - des paramètres typés qui violent le schéma du registre : nom de calque au-delà de `maxLength`, type erroné, champ requis absent, propriété en trop, nom vide, identifiant vide ou contenant NUL (400 `invalid_commands`).

  Le noyau refuse aussi un outil inconnu sans passer par l'API. Ces tests tournent dans `test:db-guard` (`validate`) et dans les tests API hors base.

---

## B. Scénarios non couverts par la CI

### B.1 Les 12 suites DB-3 — NON EXÉCUTÉES

La garde de base de tests (#157) refuse ces suites au chargement (`Test database refused: TARGET_REQUIRED`), car le registre d'autorités est vide et DB-3 n'est pas autorisé. `scripts/check-api-tests-db3.mjs` vérifie seulement que **ces 12 suites, et elles seules, sont refusées, et par la garde seule**. Il ne déclare aucune d'elles réussie. Aucun de leurs tests ne s'exécute :

1. `apps/api/src/app.test.ts`
2. `apps/api/src/routes/atelier-automatisation-p2.test.ts`
3. `apps/api/src/routes/atelier-bois-tolerie.test.ts`
4. `apps/api/src/routes/atelier-commands.test.ts`
5. `apps/api/src/routes/atelier-coordination.test.ts`
6. `apps/api/src/routes/atelier-documentation.test.ts`
7. `apps/api/src/routes/atelier-exact.test.ts`
8. `apps/api/src/routes/atelier-mecanique.test.ts`
9. `apps/api/src/routes/atelier-planches.test.ts`
10. `apps/api/src/routes/atelier-reseaux.test.ts`
11. `apps/api/src/routes/atelier-structure.test.ts`
12. `apps/api/src/routes/history.test.ts`

Conséquence : l'autorisation, le rate limiting, les routes de commandes Atelier, le noyau exact côté serveur, les planches, les ontologies P2 et l'historique **n'ont aucun test d'intégration API exécuté**. Les recettes e2e en traversent une partie par HTTP, sur leurs scénarios seulement ; elles ne remplacent pas ces suites.

### B.2 Autres trous connus

- **Recette Studio V1 sur PR hors périmètre** : elle n'est pas exécutée, et le job passe au vert quand même. Exemple : une PR qui ne touche que `scripts/check-*`, `.github/workflows/architecture-guards.yml` ou `apps/api/src/testing/**` ne la lance pas. C'est le cas de ce lot.
- **`apps/web/e2e/studio-v1-smoke.mjs`** : aucun workflow ne l'appelle. Les fichiers `lib-*.mjs` sont des aides, pas des recettes.
- **Bancs de mesure `scripts/bench/*`** (OCCT, three, manifold, web-ifc, yjs, solveur, brotli) : jamais exécutés en CI.
- **Navigateurs** : Chromium seul. Ni Firefox ni WebKit, ni appareil mobile réel ; le « téléphone » des recettes est une fenêtre émulée.
- **Aucune mesure de couverture** de code, aucun lint ni contrôle de formatage, aucun `npm audit` (`npm ci --no-audit`). Le workflow ne contient aucune étape d'analyse de secrets ; un éventuel réglage côté GitHub n'est pas vérifié ici.
- **Sauvegardes hors site réelles** (Restic, Healthchecks) : seul le mode simulé tourne. Le déploiement `builder-deploy.yml` est manuel.
- **Contrôle de frontières, limites connues** : il analyse les imports **littéraux**. Une cible calculée est refusée (`NON_LITERAL_IMPORT`), donc elle ne passe pas en silence. Il n'analyse pas le contenu des paquets tiers. Les règles de couches Studio portent **11 exceptions explicites** dans `scripts/frontieres.json` :
  - 5 sont de type seulement ;
  - 6 sont de vraies violations de valeur, dans `noyau/etat.ts`, `noyau/document.ts` et `noyau/commandes.ts`.

  La règle « le noyau n'importe aucune couche supérieure » **n'est donc pas tenue** pour ces trois fichiers : elle est seulement figée, et rien de nouveau ne peut s'ajouter. Trois paquets purs déclarent encore `lib: DOM` (`core-geometry`, `geometry-exact`, `planche-model`), en exception déclarée.
- **Écart registre / noyau relevé par X.2-03, sans incidence de sécurité** : le schéma `id` du registre (`registre/schemas-base.ts`) n'a pas de `maxLength`, alors que le noyau refuse au-delà de 128 caractères. Le noyau est plus strict que le registre ; le schéma publié ne le dit pas.
- **IFC** : le corpus est validé par IfcOpenShell (schéma, règles EXPRESS, effectifs, échantillon géométrique). C'est une conformité testée sur quatre fichiers, pas une certification (D-006).
- **Branches d'exception** (A.1) et **fourches** : sur celles-ci, `validate`, `e2e`, `image` ou la recette Studio sont sautés.
