# Règles communes de collaboration — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**À définir — cadrage proposé, en attente de revue et des décisions CR-D1 à CR-D10.** Aucun code modifié.

## Faits vérifiés

- Audit documentaire de `main` = `034dbfb` le 2026-10-24 ([MATRICE.md](MATRICE.md)) : 36 énoncés — 9 en place,
  22 partiels, 2 manquants, 3 hors périmètre ; chaque état cite fichier:ligne, test ou route.
- Écarts relevés ([PLAN.md](PLAN.md) § 3) : 3 de gravité haute (audience intra-projet E1, export du lecteur E2, changements
  d'accès non journalisés E3), 4 moyens, 3 bas ; aucun corrigé.
- PR #265 (Organisations phase 1) ouverte : son PLAN n'est pas modifié ; ajouts proposés en annexe A du PLAN.
- Contrôle de continuité local : `node scripts/check-continuity.mjs` et `node --test scripts/check-continuity.test.mjs`
  (résultats dans la PR).

## Points ouverts

- Décisions CR-D1 à CR-D10 ([DECISIONS.md](DECISIONS.md)).
- Chantiers COM et Temps réel non ouverts.

## Liens de suivi

- Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).
- Branche : `docs/272-collaboration-rules` ; PR de cadrage vers `main`, non fusionnée.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
