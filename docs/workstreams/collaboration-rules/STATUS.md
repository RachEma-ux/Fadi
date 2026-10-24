# Règles communes de collaboration — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**À définir — cadrage proposé ; décisions CR-D1 à CR-D10 répondues sauf CR-D4 (CR-R1, relayé par la session VPS) ;
PR en attente de revue.** Aucun code modifié.

## Faits vérifiés

- Audit documentaire de `main` = `034dbfb` le 2026-10-24 ([MATRICE.md](MATRICE.md)) : 36 énoncés — 9 en place,
  22 partiels, 2 manquants, 3 hors périmètre ; chaque état cite fichier:ligne, test ou route.
- Écarts relevés ([PLAN.md](PLAN.md) § 3) : 3 de gravité haute (audience intra-projet E1, export du lecteur E2, changements
  d'accès non journalisés E3), 4 moyens, 3 bas ; aucun corrigé.
- 2026-10-24 : réponses du maître d'ouvrage relayées par la session VPS ([DECISIONS.md](DECISIONS.md), CR-R1) : neuf
  recommandations adoptées ; CR-D4 en attente de précision, en conflit avec la correction de E2 demandée dans une PR
  séparée.
- `main` = `2cc038a` fusionné dans la branche sans conflit ; parmi les lignes citées, seule
  `routes/admin/index.ts:151` a bougé (désormais `:157`), corrigée.
- PR #265 (Organisations phase 1) ouverte : son PLAN n'est pas modifié ; ajouts proposés en annexe A du PLAN.
- Contrôle de continuité local : `node scripts/check-continuity.mjs` et `node --test scripts/check-continuity.test.mjs`
  (résultats dans la PR).

## Points ouverts

- CR-D4 : précision attendue du maître d'ouvrage (export par défaut des nouveaux lecteurs internes).
- Revue de la PR ; aucune fusion sans l'accord écrit du maître d'ouvrage.
- Chantiers COM et Temps réel non ouverts.

## Liens de suivi

- Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).
- Branche : `docs/272-collaboration-rules` ; PR de cadrage vers `main`, non fusionnée.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
