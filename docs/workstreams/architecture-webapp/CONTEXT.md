# Architecture WebApp Fadi — Contexte

## Objectif

Préparer un chantier documenté pour les **évolutions futures de l'architecture de la WebApp Fadi**, en garantissant la reprise entre sessions et intervenants. Le périmètre des modifications d'architecture **reste à définir par le responsable**.

## Périmètre

- Inclus : clarification future des besoins et contraintes, audit vérifiable de l'état actuel, analyse d'impact, proposition d'architecture cible après cadrage.
- Exclus : refonte décidée d'avance, correctifs UX Planche/mobile présumés prioritaires, modification du code ou déploiement en production avant décision.

## Sources canoniques

- [`AGENTS.md`](../../../AGENTS.md) : règles techniques et fonctionnelles du dépôt.
- [`CLAUDE.md`](../../../CLAUDE.md) : règles pour Claude Code.
- [`docs/architecture.md`](../../architecture.md) : architecture de référence documentée (« modular monolith », sept modules).
- [`README.md`](../../../README.md) : fonctionnement et structure du monorepo.
- [`docs/migration/matrix.md`](../../migration/matrix.md) : traçabilité des fonctions héritées du prototype.
- [`docs/atelier/decisions.md`](../../atelier/decisions.md), [`docs/atelier/README.md`](../../atelier/README.md), [`docs/planche/README.md`](../../planche/README.md) : décisions et suivi métier existants.
- [Issue #144](https://github.com/RachEma-ux/Fadi/issues/144) : mise en place de **la méthode de continuité uniquement** ; une Issue d'architecture distincte sera créée quand son périmètre sera précisé.

## Contraintes

- Conserver la WebApp Fadi modulaire et préserver les contrats métier existants : les 21 étapes Parcours, Planche dans Atelier, les repères explicites, les règles de langue, les données sources traçables.
- Ne pas remplacer tacitement `docs/architecture.md`. Un écart envisagé doit être documenté et arbitrable avant modification.
- Ne jamais qualifier une fonctionnalité « testée » sans nommer l'essai ou la CI et son commit.
- Conserver les données et services de production hors des tâches exploratoires.

## Hypothèses et questions ouvertes

- **À définir** : nature des changements architecturaux demandés, architecture cible, découpage en lots, priorité métier, dépendances.
- À vérifier après cadrage : état GitHub actuel des PR ouvertes, frontières des modules et impact des modifications proposées.
