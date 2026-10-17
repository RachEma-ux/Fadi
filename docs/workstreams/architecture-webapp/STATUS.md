# Architecture WebApp Fadi — Statut

Mis à jour : 2026-10-17 (UTC).

## État

**À définir.** Aucun lot de refonte de l'architecture n'a été autorisé dans le cadre de cette mise en place documentaire.

## Faits vérifiés

- Dépôt `RachEma-ux/Fadi`, branche principale `main` ; base vérifiée lors de l'audit documentaire le 17 octobre 2026 : `72c84cf731b2afe8c534a40ab8ddc720b36b7a55` (à revalider en reprise).
- `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/atelier/decisions.md` et les cahiers/lots Atelier/Planche existent déjà sur la branche `main`.
- Le dépôt documente sept modules métier et une architecture monorepo modulaire ; cela **ne vaut pas** validation d'une architecture cible future.
- Au moment de l'audit, deux PR étaient ouvertes : [#142](https://github.com/RachEma-ux/Fadi/pull/142) (gabarits), [#143](https://github.com/RachEma-ux/Fadi/pull/143) (infrastructure). Réexaminer leur état lors de la reprise.

## Points ouverts

- Préciser les modifications d'architecture jugées urgentes ; aucune priorité produit prédéfinie.
- Identifier l'Issue de chantier dédiée et la branche de travail **après cadrage**.
- Définir les critères d'acceptation d'une éventuelle refonte ; aucun test métier de cette refonte n'a encore été effectué.

## Liens de suivi

- Issue du dispositif de continuité (pas une Issue de refonte) : [#144](https://github.com/RachEma-ux/Fadi/issues/144).
- Branche de tâche d'architecture : aucune à ce stade.
- PR de refonte : aucune à ce stade.

## Préconditions de clôture

- Exigences approuvées et traçables dans des Issues propres aux lots.
- Implémentation, tests et revues vérifiés sur les commits adéquats.
- Reprise de session documentée et acceptation explicitement consignée.
