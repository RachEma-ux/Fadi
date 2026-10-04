# Lot 4 — Bascule : compte rendu

Branche du lot : `lot/4-bascule`, partie de `atelier/principal` après le lot 3b (PR #77), retour vers
`atelier/principal` (D-020). Cahier : §7 (lot 4), §5.5, §5.6, annexe D. **État : en cours.**

## Organisation

Sans équipiers (D-046) : le chef de projet réalise chaque tâche. L4.1, L4.2 et L4.3 sont couplées (les
consommateurs, le moteur et le scénario changent ensemble) et passent dans une seule PR de tâche, un commit par
tâche (D-052). Contrôles lourds limités au poste (vitest des dossiers touchés, typecheck par paquet) ; build et
e2e dans la CI.

## Matrice de propriété (cahier §9)

| Zone | Propriétaire |
| --- | --- |
| `apps/api/src/lib/*-context.ts`, `routes/parcels.ts`, `routes/examples.ts`, `lib/project-archive.ts`, `packages/domain-model/src/archive.ts` | chef de projet (rôle « API ») |
| `apps/web/src/modules/atelier/**`, `module-registry.ts`, `routes/ProjectShell.tsx`, `modules/parcours/ParcoursModule.tsx`, suppressions §5.5 | chef de projet |
| `apps/web/e2e/**`, `docs/migration/captures/webapp/` | chef de projet (rôle « e2e ») |
| `scripts/verify-restore.sh`, `Dockerfile`, `.github/workflows/**`, `docs/architecture.md` | chef de projet (rôle « base ») |

## Avancement

| Tâche | Issue | Contenu | État |
| --- | --- | --- | --- |
| L4.1 | #78 | Consommateurs (§5.6) sur la projection du modèle typé ; parcelle en commandes ; archive version 2 ; exemple importé dans le modèle typé | en cours |
| L4.2 | #79 | Le nouvel Atelier devient le module `atelier` et l'Atelier des étapes 10 / 11 ; suppressions §5.5 ; registre, README, matrice | à faire |
| L4.3 | #80 | Scénario d'acceptation réécrit pour le nouvel Atelier (annexe D), captures | à faire |
| L4.4 | #81 | Restauration vérifiée sur la nouvelle base, image sondée, `docs/architecture.md` | à faire |
| L4.5 | — | Clôture : fiches, ce compte rendu, acceptation | à faire |
