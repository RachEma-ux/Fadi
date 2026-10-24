# Organisations, participation et revue externe — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : organisations-participation. Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche / PR : `ccr-266c1e83-7780ml`, PR de cadrage [#263](https://github.com/RachEma-ux/Fadi/pull/263), non fusionnée.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Plan validé (OP-1). Phase 1 **fusionnée** dans `main` (PR #265, `f59641c`) ; revue 🛑 1 du maître d'ouvrage attendue avant
  la phase 2.
- 2026-10-24 : critères des règles communes reportés dans PLAN.md (CR-1, accord CR-R3) ; une partie des tâches de
  phase 2 est déjà livrée hors de ce chantier : journal des changements d'accès (PR #274), fin de participation,
  Approbateur / Diffuseur et gardien du contenu sur les accès actuels ([PR #282](https://github.com/RachEma-ux/Fadi/pull/282), CR-C2) — voir l'état noté sous chaque
  tâche du PLAN.

## Prochaine action

- Phase 1 sur `feat/op-phase1-participations` (PR à suivre jusqu'au vert) ; attendre la revue 🛑 1 du maître d'ouvrage.
- Décisions OP-2 du 2026-10-24 consignées (OP-D9 conservation, OP-D12 révisée) ; l'envoi des courriels de préproduction
  relève de la PR distincte UM-28, pas de ce chantier.
- Ensuite, phase 2 : API et écran « Équipe et participants », bascule de l'accès vers les six rôles (OP-D3 c), journal des
  écritures de participation, effacement des contacts sans compte (OP-D9).

## Tests et preuves

- `DATABASE_URL=<base locale jetable> node scripts/validation/participations-migration-check.mjs` ;
  `npx --workspace=@fadi/api vitest run src/lib/participations.test.ts` ; `npm run typecheck` ; `npm test` ; `npm run build`.

## Risques et blocages

- Fin de l'ajout direct (OP-D2) : changement visible pour les propriétaires qui partagent un projet. Prévoir l'annonce et la recette.
- Accès externe : la moindre fuite par une route, un aperçu ou un export est un défaut bloquant. La phase 4 prévoit une
  recette dédiée, comme UM-20.
- Une nouvelle suite de tests DB-3 exige la révision relue de `DB3_PENDING_SUITES`.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
