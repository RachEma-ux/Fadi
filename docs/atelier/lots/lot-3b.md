# Lot 3b — Nouvel Atelier : 3D WebGL2, pousser / tirer, mobile, accessibilité : compte rendu

Branche du lot : `lot/3b-3d`, partie de `atelier/principal` après le lot 3a (PR #65), retour vers
`atelier/principal` (D-020). Cahier : §7 (lot 3b). **État : en cours.**

## Organisation

Sans équipiers (D-046) : le chef de projet réalise chaque tâche sur sa branche `tache/L3b.x-…`, PR dans
`lot/3b-3d`, CI verte (validate, e2e, image). Contrôles lourds limités au poste (vitest des dossiers touchés,
typecheck d'`apps/web` borné) ; build et e2e dans la CI.

## Avancement

| Tâche | Contenu | État |
| --- | --- | --- |
| L3b.0 | Outil « Supprimer » (touche Suppr), panneau Métré monté, scénario 14 étendu (D-045, D-046) | fusionnée (PR #71) |
| L3b.1 | Rendu three.js, modes volume / éclaté / coupe, orbite, sélection, manipulateur (DA-02-17), WebGPU en option (D-047) | en revue |
| L3b.2 | Pousser / tirer (DA-04-07), extrusion d'esquisse (DA-04-01) | à faire |
| L3b.3 | Toucher, cibles, mode immersif, mesures `⏱` | à faire |
| L3b.4 | Vues techniques de travail en 2D depuis `core-geometry` | à faire |
