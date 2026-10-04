# Lot 3a — Nouvel Atelier : socle d'interface, dessin 2D, objets d'architecture : compte rendu

Branche du lot : `lot/3a-atelier`, partie de `atelier/principal` après le lot 2 (PR #50), retour vers
`atelier/principal` (D-020). Cahier : §5.7, §5.8, §7 (lot 3a), maquette validée (D-022).
**État : en cours.**

## Organisation

Phase 0 — interfaces figées par le chef de projet, commitées sur `lot/3a-atelier` avant toute distribution (§9) :
`apps/web/src/modules/atelier/socle/` (`contrats.ts` : outil, session, évènement de plan, aperçu, sélection,
contexte, inspecteur ; `selection.ts`, `registre.ts`, `contexte.ts`). Un manque se signale au chef de projet, qui
étend le contrat (ajout seulement) et le consigne.

Vague A, en parallèle : L3a.1 « interface » et L3a.2 « 2D ». Vague B, en parallèle : L3a.3 « architecture » et
L3a.5 « documents simples », qui enregistrent leurs outils dans le registre et dessinent leur aperçu par le
contrat. L3a.4 (intégration) : chef de projet, en continu. Deux équipiers au plus à la fois (mémoire du poste) ;
les contrôles lourds (typecheck d'`apps/web`, build, e2e, axe-core) tournent dans la CI.

## Matrice de propriété

| Zone | Propriétaire |
| --- | --- |
| `apps/web/src/modules/atelier/socle/**` | chef de projet (interfaces figées) |
| `apps/web/src/modules/atelier/ui/**` | équipier « interface » (L3a.1) |
| `apps/web/src/modules/atelier/plan2d/**` | équipier « 2D » (L3a.2) |
| `apps/web/src/modules/atelier/objets/**` | équipier « architecture » (L3a.3) |
| `apps/web/src/modules/atelier/documents/**` | équipier « documents simples » (L3a.5) |
| `apps/web/src/modules/atelier/NouvelAtelier.tsx`, montage dans `routes/ProjectShell.tsx`, `module-registry.ts`, import de P.118 dans le nouveau modèle | chef de projet (L3a.4) |
| `apps/web/e2e/scenarios/14-nouvel-atelier-*.mjs` | un fichier par équipier, le sien |
| `docs/atelier/lots/lot-3a.md`, `docs/atelier/decisions.md`, `docs/migration/matrix.md` | chef de projet |

`packages/atelier-model`, `packages/core-geometry`, `apps/api` et `modules/atelier/bus/**` sont figés pour ce
lot : un manque (commande, calcul géométrique) se signale au chef de projet. L'ancien Atelier
(`NativeAtelier.tsx`, `native/**`) reste intact jusqu'au lot 4.

## Avancement

| Tâche | Issue | État |
| --- | --- | --- |
| Phase 0 — socle et contrats figés | — | sur `lot/3a-atelier` ; tests du socle verts |
| L3a.1 socle d'interface | | vague A |
| L3a.2 éditeur de plan 2D | | vague A |
| L3a.3 objets d'architecture | | vague B |
| L3a.4 intégration | | chef de projet |
| L3a.5 continuité des outils (documents simples) | | vague B |
