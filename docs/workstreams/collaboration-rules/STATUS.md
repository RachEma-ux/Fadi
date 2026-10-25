# Règles communes de collaboration — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**Cadrage fusionné dans `main` (PR #273, `7083285`) ; décisions CR-D1 à CR-D10 répondues (CR-R1, CR-R2).**
**Écarts graves E1, E2, E3 (et E7) : [PR #274](https://github.com/RachEma-ux/Fadi/pull/274) fusionnée dans `main`
(`2577e25`)** ([DECISIONS.md](DECISIONS.md) CR-C1). **COM ouvert et fusionné (PR #285, `173b9f1`) par dérogation à
CR-D9 (CR-R3).** Aucun déploiement consigné ici.

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

- 2026-10-24 : dans CR-R3, la réponse du maître d'ouvrage côté Communication est citée COM-A2 (renommée depuis COM-R2
  pour ne pas la confondre avec les critères COM-R1 à COM-R7 de ce chantier) ; aucun contenu de décision modifié.

## Points ouverts

- Déploiement des PR #274 et #285 : sur décision du maître d'ouvrage.
- E7 traité par la PR #274 (CR-C1 § 6) ; reste la limite déclarée par CR-D5 : appareil resté hors ligne, fichiers
  déjà téléchargés.
- COM : ouvert et fusionné (CR-R3) ; critères COM-R1 à COM-R7 couverts par `communication.mjs`. Temps réel : non ouvert.

## Liens de suivi

- Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).
- Cadrage : PR #273 fusionnée. Correction des écarts graves : PR #274, branche `fix/collaboration-ecarts-e1-e3`.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
