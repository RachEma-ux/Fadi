# Organisations, participation et revue externe — Statut

Mis à jour : 2026-10-23 (UTC).

## État

**À définir — plan proposé, en attente de validation (🛑 0).** Aucune implémentation n'est engagée.

## Faits vérifiés

- Ouverture du chantier confirmée par le maître d'ouvrage le 2026-10-23 (OP-0). Priorité : participants, invitations
  acceptées, revue externe.
- Audit de l'existant sur `main` = `516e2f7` ([PLAN.md](PLAN.md) § 1) :
  - `project_members` porte les rôles `lecteur` / `editeur`, et l'ajout direct d'un compte existant reste possible (UM-8) ;
  - `auth.invitations` gère deux finalités sur cinq, sans participation rattachée ;
  - les colonnes `organization_id` sont réservées, sans logique ;
  - les publications Studio ont un manifeste figé ;
  - les observations Studio ont une boucle de correction ;
  - l'approbation et la diffusion Studio sont réservées au propriétaire.
- Concept de référence : `docs/workstreams/users-management/concept.md` v2.2, protégé par le test anti-dérive existant.

## Points ouverts

- Validation du plan et décisions OP-D1 à OP-D11 ([PLAN.md](PLAN.md), annexe A).
- OP-D7 (approbation par un participant externe) et OP-D9 (données des contacts, RGPD) : décisions métier sans
  recommandation technique.

## Liens de suivi

- Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).
- Branche : `ccr-266c1e83-7780ml`, imposée par la session. PR de cadrage : [#263](https://github.com/RachEma-ux/Fadi/pull/263).
  Le commit était d'abord poussé sur la PR #259, fusionnée avec sa tête précédente sans lui : il est rebasé sur `main`.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
