# Règles communes de collaboration — Contexte

## Objectif

Le maître d'ouvrage a demandé le 2026-10-24 (« Oui lance le cadrage ») le cadrage de « Fadi Concept - Collaboration
Common Rules » v1.0 et de la « Collaboration Concept Map » v1.0 : rattacher chaque règle, chaque énoncé du vocabulaire,
de la propriété des modules, de l'audience et de la continuité, et chacun des 9 scénarios d'acceptation à son module
propriétaire, constater l'état de `main` avec preuve, et en tirer les critères à inscrire chez les propriétaires.

Livrables : [MATRICE.md](MATRICE.md), [PLAN.md](PLAN.md), [DECISIONS.md](DECISIONS.md).

## Périmètre

- **Inclus :**
  - audit documentaire de `apps/api`, `apps/web` et `packages` sur `main` ;
  - matrice, critères d'acceptation pour Organisations, COM et Temps réel, recette des 9 scénarios, écarts classés ;
  - décisions ouvertes CR-D1 à CR-D10.
- **Exclus :**
  - tout code, toute migration, tout déploiement ;
  - tout nouveau module, table partagée ou moteur de workflow (« No new module or universal workflow engine is
    required ») ;
  - la modification du PLAN d'Organisations tant que la PR #265 est ouverte ;
  - toute décision à la place du maître d'ouvrage.

## Sources canoniques

- `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md`, [protocole de continuité](../../continuity/README.md).
- Concepts : `Fadi Concept/Fadi Concept - Collaboration Common Rules.md` (v1.0), `… - Collaboration Concept Map.md`
  (v1.0) ; en appui `… - Users Management.md`, `… - Communication.md`, `… - Real-time Collaboration.md` (v1.2).
- Chantiers propriétaires : [users-management](../users-management/CONTEXT.md) (MATRICE comme modèle de forme),
  [organisations-participation](../organisations-participation/CONTEXT.md) (PLAN, PR #265).
- Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).

## Contraintes

- Les règles sont des contraintes appliquées par les modules propriétaires, jamais par un module nouveau.
- Rien n'est déclaré « en place » sans preuve (fichier:ligne, test, route) ; à défaut, « non vérifié ».
- Le concept prime ; les listes métier et les décisions restent au maître d'ouvrage.
- Dépôt public : aucun secret ni donnée personnelle.

## Hypothèses et questions ouvertes

- Décisions CR-D1 à CR-D10 ([DECISIONS.md](DECISIONS.md)).
- Les chantiers COM, Temps réel et (selon CR-D1) Collaboration partagée ne sont pas ouverts : leurs critères sont
  proposés, pas engagés.
