# Organisations, participation et revue externe — Reprise de session

Mis à jour : 2026-10-23 (UTC).

## Point de reprise

- Chantier : organisations-participation. Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche / PR : `ccr-266c1e83-7780ml`, PR de cadrage [#263](https://github.com/RachEma-ux/Fadi/pull/263), non fusionnée.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Cadrage et plan rédigés ([PLAN.md](PLAN.md)) ; aucune ligne de code modifiée par ce chantier.

## Prochaine action

- Attendre la validation du plan et les réponses OP-D1 à OP-D11 (🛑 0).
- Ensuite, ouvrir la phase 1 : personnes, organisations, participations et reprise de l'existant, avec ses tests DB-3.

## Tests et preuves

- Documentation seule : `node scripts/check-continuity.mjs` ; aucun test d'application à exécuter.

## Risques et blocages

- Fin de l'ajout direct (OP-D2) : changement visible pour les propriétaires qui partagent un projet. Prévoir l'annonce et la recette.
- Accès externe : la moindre fuite par une route, un aperçu ou un export est un défaut bloquant. La phase 4 prévoit une
  recette dédiée, comme UM-20.
- Une nouvelle suite de tests DB-3 exige la révision relue de `DB3_PENDING_SUITES`.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
