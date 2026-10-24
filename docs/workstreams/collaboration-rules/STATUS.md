# Règles communes de collaboration — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**Cadrage fusionné dans `main` (PR #273, `7083285`) ; décisions CR-D1 à CR-D10 répondues (CR-R1, CR-R2).**
**Écarts graves E1, E2, E3 (et E7) : corrigés, [PR #274](https://github.com/RachEma-ux/Fadi/pull/274) fusionnée dans `main`
(`2577e25`)** ([DECISIONS.md](DECISIONS.md) CR-C1).
**Écarts E5, E6, E9, E10 et report CR-1 : implémentés, vérifiés en local, [PR #282](https://github.com/RachEma-ux/Fadi/pull/282) vers `main` non fusionnée, aucun
déploiement** ([DECISIONS.md](DECISIONS.md) CR-R3, CR-C2). Restent ouverts : E4 et E8 (phase 3 d'Organisations).

## Faits vérifiés

- Audit documentaire de `main` = `034dbfb` le 2026-10-24 ([MATRICE.md](MATRICE.md)) : 36 énoncés — 9 en place,
  22 partiels, 2 manquants, 3 hors périmètre ; chaque état cite fichier:ligne, test ou route.
- Écarts relevés ([PLAN.md](PLAN.md) § 3) : 3 de gravité haute (audience intra-projet E1, export du lecteur E2, changements
  d'accès non journalisés E3), 4 moyens, 3 bas. E1, E2, E3 corrigés par la PR #274 (CR-C1) ; les autres restent ouverts.
- 2026-10-24 : réponses du maître d'ouvrage relayées par la session VPS ([DECISIONS.md](DECISIONS.md), CR-R1) : neuf
  recommandations adoptées ; puis CR-D4 tranchée en (b) modifiée (CR-R2) : aucun nouveau lecteur n'exporte sans droit
  accordé, mise en œuvre par la PR séparée de correction des écarts E1 à E3.
- `main` = `2cc038a` fusionné dans la branche sans conflit ; parmi les lignes citées, seule
  `routes/admin/index.ts:151` a bougé (désormais `:157`), corrigée.
- PR #265 (Organisations phase 1) ouverte : son PLAN n'est pas modifié ; ajouts proposés en annexe A du PLAN.
- Contrôle de continuité local : `node scripts/check-continuity.mjs` et `node --test scripts/check-continuity.test.mjs`
  (résultats dans la PR).

- PR #274 (branche `fix/collaboration-ecarts-e1-e3`) : preuves détaillées dans
  [`../users-management/STATUS.md`](../users-management/STATUS.md) (section UM-29) — typecheck, build, tests web et API
  sur base PostGIS jetable locale, recettes `collaboration-audience.mjs` (40 contrôles, axe-core compris),
  `studio-persistance.mjs`, `studio-observations.mjs`, `comptes-securite.mjs`, `project-layout.mjs` (593/593),
  `interface-anglais.mjs` ; CI du HEAD à relever.
- Limites levées (CR-C1 § 6) : E7 / CR-D5 (a) par `project-cache-guard.ts` et `localStore.oublierProjet` (tests
  unitaires, recette `collaboration-audience.mjs` : copie locale du lecteur retiré oubliée au rechargement) ; règle
  d'or des commandes Alt+Maj+1/2/3 (`commandes-collaboration.test.ts`, recette au clavier) ; `main` fusionné après
  #265. En local : web 966 tests, API `app.test.ts` + `lib` 356, recettes `collaboration-audience.mjs` (45),
  `studio-persistance.mjs` (293), `studio-observations.mjs` (71), `studio-hors-ligne.mjs` (35),
  `comptes-securite.mjs` (73), `parcours-scenario.mjs` (330), `interface-anglais.mjs` : vertes.

- 2026-10-24, CR-C2 (branche `ccr-e2b77568-r17oja`, depuis `main` = `2577e25`), vérifié en local sur PostgreSQL 16 +
  PostGIS 3 (base jetable, API construite servant `WEB_DIST` en `fadi_app`, transport de courriel `console`) :
  - `npm run typecheck`, `npm run build` : verts ; tests web des modules touchés (règle d'or
    `commandes-collaboration.test.ts`, `publication-ui.test.ts`, i18n) : verts ;
  - API, tests purs : `studio-publication-statuts.test.ts` (base d'autorité : 3 tests ajoutés), `participations.test.ts`
    (listes = contraintes SQL, `garder` compris), `studio-archive-manifest.test.ts` (colonne `authority` classée),
    `studio-permissions.test.ts` (matrice inchangée) : verts ; les 11 fichiers de suites DB-3 refusés par la garde
    seule, comme sur `main` ;
  - `participations-migration-check.mjs` : vert, dont « garder » admis et contrainte élargie au rejeu sur une base
    antérieure ; `users-migration-check.mjs` vert ; `db:migrate` rejoué deux fois ;
  - recette nouvelle `collaboration-affectations.mjs` : **40/40** (E5, E6, E10, règle d'or au clavier, axe-core, passes
    anglaises du propriétaire et du lecteur, journal relu en base ; après la revue Codex de `e24b694`) ; non-régression `collaboration-audience.mjs` 45/45, `studio-publication.mjs` 129 ✓ ;
  - CI de `2530144` (run 40132896654, DB-3 actif) : 627 tests API verts dont 132 dans les 12 suites DB-3 (« E5 » et « E10 »
    compris) ; « E6 » rouge sur une erreur du test (identifiant de la tâche lu dans la réponse, qui rend l'observation),
    corrigée ensuite (identifiant relu en base ; parcours de réattribution vérifié sur l'API locale) ;
  - **CI verte sur `e1b7511`** (run 40133674349, DB-3 actif, attestation `fadi-ci-db3`) : `validate` — **628 tests API, dont 133
    dans les 12 suites DB-3**, les 3 tests « E5 », « E6 », « E10 » compris ; e2e `parcours`, `complements`
    (`collaboration-affectations.mjs`), `atelier`, `planche`, `p2`, Studio V1, `image`, `project-layout`, Continuité,
    Architecture : verts ;
  - `app.test.ts` (3 tests ajoutés « E5 », « E10 », « E6 », attendus E3 mis à jour) : **non exécuté en local** — la
    préparation d'une base attestée exige d'enrôler une clé locale dans `approved-test-authorities.ts`, geste refusé
    dans cette session ; preuve opposable : DB-3 en CI.

## Points ouverts

- [PR #282](https://github.com/RachEma-ux/Fadi/pull/282) (CR-C2) : CI verte sur `e1b7511` ; fusion et déploiement sur décision du maître d'ouvrage.
- E7 traité par la PR #274 (CR-C1 § 6) ; reste la limite déclarée par CR-D5 : appareil resté hors ligne, fichiers
  déjà téléchargés.
- Chantiers COM et Temps réel non ouverts.

## Liens de suivi

- Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).
- Cadrage : PR #273 fusionnée. Correction des écarts graves : PR #274 fusionnée. Écarts E5, E6, E9, E10 et CR-1 : [PR #282](https://github.com/RachEma-ux/Fadi/pull/282),
  branche `ccr-e2b77568-r17oja`.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
