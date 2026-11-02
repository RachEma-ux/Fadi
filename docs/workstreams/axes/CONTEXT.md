# Axes et repères — contexte

## Objectif

Mettre en œuvre le concept Axes 1.0 (`Fadi Concept/Fadi Concept - Axes.md`) dans le Sandbox : repère de travail
explicite et sûr, plan de travail et verrou, barre compacte « Axes et repères », repères enregistrés, origine de
composant, repères liés et exports avec choix des coordonnées — sans jamais déplacer la géométrie en changeant de repère.

## Périmètre

Sandbox seul (AX-D2) : `packages/sandbox-planche-model`, `apps/web/src/modules/sandbox`, recettes `apps/web/e2e/sandbox-*.mjs`.
Hors périmètre : Studio (aucun outil de dessin 3D ; dessin 2D indépendant), Planche de l'Atelier (chantier clos),
collaboration (AX-D9), référence géographique et trame structurelle (notions distinctes, non modifiées).

## Sources canoniques

- Concept : `Fadi Concept/Fadi Concept - Axes.md` / `.docx` 1.0 (Issue #260).
- Décisions : [`DECISIONS.md`](DECISIONS.md) (AX-D1 délégation totale, AX-D2 à AX-D10).
- Évaluation et plan : [`EVALUATION.md`](EVALUATION.md), [`PLAN.md`](PLAN.md) ; comptes rendus : [`lots/`](lots/).
- Code : `packages/sandbox-planche-model/src/reperes.ts`, `outils/axes.ts`, `outils/commun-formes.ts`, `inference.ts` ;
  `apps/web/src/modules/sandbox/planche/`.

## Contraintes

`AGENTS.md` : frontières (le Sandbox n'importe ni Studio ni Atelier), géométrie pure, bilinguisme (`messages.ts`),
règle d'or (icône, barre, raccourci contrôlés par test), aucune donnée inventée, typecheck / tests / build avant commit.

## Hypothèses et questions ouvertes

Aucune question ouverte : la délégation AX-D1 tranche les points ouverts du § 13 du concept (AX-D2 à AX-D10).
