# Lot 3b — Nouvel Atelier : 3D WebGL2, pousser / tirer, mobile, accessibilité : compte rendu

Branche du lot : `lot/3b-3d`, partie de `atelier/principal` après le lot 3a (PR #65), retour vers
`atelier/principal` (D-020). Cahier : §7 (lot 3b). **État : accepté avec réserves (D-051).**

## Organisation

Sans équipiers (D-046) : le chef de projet réalise chaque tâche sur sa branche `tache/L3b.x-…`, PR dans
`lot/3b-3d`, CI verte (validate, e2e, image). Contrôles lourds limités au poste (vitest des dossiers touchés,
typecheck d'`apps/web` borné) ; build et e2e dans la CI. Fusions en squash : chaque branche suivante est rebasée
sur `lot/3b-3d` après la fusion précédente.

## Avancement

| Tâche | Issue | Contenu | État |
| --- | --- | --- | --- |
| L3b.0 | #66 | Outil « Supprimer » (touche Suppr), panneau Métré monté, scénario 14 étendu (D-045, D-046) | fusionnée (PR #71) |
| L3b.1 | #67 | Rendu three.js, modes volume / éclaté / coupe, orbite, sélection, manipulateur (DA-02-17), WebGPU en option (D-047) | fusionnée (PR #72) |
| L3b.2 | #68 | Pousser / tirer (DA-04-07), extrusion d'esquisse (DA-04-01), aperçu avant validation (D-048) | fusionnée (PR #73) |
| L3b.3 | #69 | Toucher (orbite, pincer), cibles ≥ 44 px, mode immersif, mesures `⏱` imprimées (D-049) | fusionnée (PR #74) |
| L3b.4 | #70 | Vues techniques de travail en 2D depuis `core-geometry` : plan, coupes N–S / E–O / quelconque, façades (D-050) | fusionnée (PR #75) |
| L3b.5 | — | Clôture : fiches, ce compte rendu, acceptation (D-051) | cette PR |

## Acceptation (cahier §7, lot 3b)

Preuve : scénario `apps/web/e2e/scenarios/14-nouvel-atelier.mjs`, segments `vue3d`, `pousserTirer`, `mesures3d`
et `vuesTechniques` (CI de la PR #75, RUN_L3B4) ; total e2e 378 contrôles, conforme à `e2e/attendu.json`.

| Critère | Preuve (libellé du contrôle) |
| --- | --- |
| Chaque niveau × chaque mode rendu sans vue vide ni erreur JavaScript | « nouvel atelier 3D : 6 niveaux × 3 modes (volume, éclaté, coupe) rendus sans vue vide » ; « aucune erreur JavaScript pendant la vue 3D, retour au plan 2D » |
| Hauteur d'un mur modifiée par pousser / tirer et persistée | « pousser / tirer — glisser vers le haut augmente la hauteur du mur, persistée sur le serveur (nouvelle révision) » ; « hauteur tapée 3,20 m persistée exactement » |
| Budget de trame mesuré et publié | « mesures imprimées — ouverture, scène, sélection, déplacement, orbite p95 (images et rendu), enregistrement » ; valeurs ci-dessous |
| 3D utilisable au toucher | « téléphone tactile — un doigt fait tourner la vue, deux doigts écartés rapprochent la caméra, cibles de la barre ≥ 44 px » (azimut −45° → −128°, distance 143,55 → 39,15 m, aucune cible < 44 px) |
| Clavier | « orbite, panoramique et zoom au clavier sur la vue focalisée, rendu toujours non vide » |
| Vues techniques (L3b.4) | « 8 vues (plan, 3 coupes, 4 façades) calculées sur P.118, aucune vide » ; « position de coupe réglable » ; « un clic sur une forme sélectionne l'objet » ; accessibilité ordinateur et téléphone |

### Budget de trame publié (R14)

Mesures de la CI de la PR #74 ([run 37205527446](https://github.com/RachEma-ux/Fadi/actions/runs/37205527446)),
Chromium headless, rendu logiciel SwiftShader (sans GPU : valeurs pessimistes pour un poste réel), P.118, tous les
niveaux, 1280 × 900 :

| Mesure `⏱` | Valeur |
| --- | --- |
| Bascule en 3D et première image | 816 ms |
| Construction de la scène (prismes, fusion, arêtes) | 328 ms |
| Sélection au clic (jusqu'à la surbrillance) | 151 ms |
| Déplacement par le manipulateur (jusqu'à la révision serveur) | 1 774 ms |
| Enregistrement d'un pousser / tirer (jusqu'à la révision serveur) | 1 187 ms |
| Orbite : p95 du temps de rendu processeur (131 trames) | **1,6 ms** |
| Orbite : p95 de l'intervalle entre images (266 images) | 133 ms |

Lecture : le travail de rendu côté processeur tient largement dans une trame à 60 Hz (16,7 ms, objectif de travail
non contractuel du cahier §8) ; l'intervalle entre images de 133 ms reflète la rastérisation logicielle de la CI,
pas un GPU. Le budget est **publié, pas fixé** : aucun seuil n'est contrôlé (D-049). À remesurer sur un téléphone
et un poste réels (réserve).

Definition of Done (§11) : tâches faites, fiches du périmètre à « prototype » ou « vérifiée » (sauf celles listées
en réserve), CI verte (typecheck, tests, build, e2e, image), `decisions.md`, mesures à jour.

## Fiches du lot

- **Vérifiées** : DA-04-07 pousser / tirer et DA-04-01 extrusion (geste exercé de bout en bout par
  `#pousserTirer`, règle D-045).
- **Prototype** (code, vitest et scénario liés) : DA-18-04 rendu 3D, DA-18-03 vue éclatée, DA-03-01 solide
  (extrusion droite), DA-02-17 manipulateur (part 3b), DA-14-01 pour la part « vues techniques de travail ».
- **Spécifiées** : DA-03-12 multicorps (recouvrement signalé, quantités par corps : rien de propre au lot 3b),
  DA-14-01 part « export de la vue courante » (lot 5).
- Les fiches citant la suppression (19) ont leur ligne d'état mise à jour depuis L3b.0.

## Réserves et reports

- **Budget de trame sur matériel réel** : seules les mesures CI (SwiftShader) existent ; remesurer sur un téléphone
  et un poste avec GPU avant tout chiffre annoncé.
- **Vue éclatée** : écart fixe de 3 m par rang (D-047), pas la règle du prototype (0,95 × hauteur moyenne) ni
  d'écart réglable ; pas de portée « hors sol », pas d'animation (`prefers-reduced-motion`).
- **Rendu** : scène reconstruite pour la portée choisie (pas de chargement / déchargement par niveau) ; pas de
  visibilité par classe ou calque dans la 3D ; contexte du site (parcelle, recul, emprise) absent ; toitures en
  pente rendues plates et poteaux non rectangulaires en emprise, signalés (lot 5).
- **Pousser / tirer** : une grandeur par classe (hauteur, épaisseur) ; pousser une face quelconque : non.
- **WebGPU** : réglage présent avec repli WebGL2 ; non exercé en CI (pas de `navigator.gpu` en headless).
- **Vues techniques** : vues de travail sans export ni échelle ; les documents (vues nommées, feuilles, fraîcheur)
  viennent au lot 5.
- **Hors ligne** (`09-hors-ligne.mjs`) et scénarios de l'ancien Atelier (`05-atelier.mjs`, `11-accessibilite.mjs`)
  non repris pour la 3D : à la bascule (lot 4, L4.3).
- Report du lot 3a toujours ouvert : raccorder, chanfreiner, réseaux, jonctions, types de dalle (contrat figé).

## Ce que le maître d'ouvrage peut vérifier

Sur l'instance, ouvrir la copie de travail de P.118 avec `?module=atelier&version=nouveau`, onglet « 3D » :
tourner, zoomer, changer de mode (volume, éclaté, coupe) et de niveau ; sélectionner un mur, outil « Pousser /
tirer » (famille Modifier, affichage Complet), glisser vers le haut puis taper une hauteur ; bouton « Vues » :
plan, coupes, façades. Refaire au téléphone (un doigt pour tourner, deux pour zoomer).

## Ce qu'il doit décider

- Rien ne bloque le lot 4.
- La validation du lot (§10.1-1) est prononcée par délégation (D-028, D-051) ; le maître d'ouvrage peut la
  reprendre après avoir fait les gestes ci-dessus.
