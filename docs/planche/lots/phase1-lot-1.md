# Phase 1, lot 1 — Composants dynamiques complets (Planche Sandbox) — compte rendu

**Statut : livré le 26 novembre 2026, en attente de la validation du maître d'ouvrage.** Plan en deux phases décidé par
le maître d'ouvrage le 26 novembre 2026 : pendant la phase 1, la Planche Sandbox est la référence du dessin ; tout se fait
dans `packages/sandbox-planche-model` et `apps/web/src/modules/sandbox`, rien dans `modules/studio` ni `atelier-model` ;
un lot à la fois, avec ses tests et sa validation. Référence des écarts : `docs/planche/reference/ecarts-fadi-dynamiques.md`.

## Livré

- **Moteur** (`composants-dynamiques.ts`, `geometrie-libre.ts`).
  - Règles `RotX` et `RotY` en plus de `RotZ`, appliquées dans l'ordre RotX, RotY, RotZ (R = Rz · Ry · Rx) ; un attribut
    de rotation sans règle garde l'angle actuel. Aides pures `axesRotation` et `anglesRotation`.
  - Références d'un objet à un autre dans une règle : `Porte!LenX`, `Pied!Z` (tous les attributs de règle sont
    lisibles). La valeur lue est celle que calcule la règle de l'objet visé, sinon sa valeur actuelle ; cycle détecté.
  - Action au clic `surClic` sur la définition du composant : `SET("Nom", v1, v2…)` et `ALTER(…)`, plusieurs actions
    séparées par « ; ». `lireSurClic`, `cliquerDynamique` (une erreur laisse le modèle intact), `definitionInteractive`
    (composant le plus profond qui porte une action). Relecture : `surClic` de 500 caractères au plus.
  - Refus nommés et traduits : référence inconnue, ambiguë, attribut inconnu, référence dans un paramètre, référence à
    une règle en erreur, action inconnue, action illisible, paramètre absent, composant sans action.
- **Outil Interagir** (`outils/interagir.ts`), dans l'extension « Composants dynamiques » (hors catalogue de base, comme
  les commandes de l'extension). Règle d'or : icône propre (main qui clique), barre Sélection · Créer, raccourci
  Ctrl + Maj + F. Les lettres avec Maj et avec Alt + Maj étant toutes prises, la couche de raccourcis Fadi admet
  désormais Ctrl + Maj + lettre, jamais une combinaison que garde le navigateur (test).
- **Panneau Composant dynamique** : nouveau bloc « Au clic » ; l'attribut de règle propose RotX et RotY.
- Textes en français dans le code, traduits en anglais (`messages.ts`, `en.json`) ; README du Sandbox à jour.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm run build` | verts |
| `npm test` : paquets et `apps/web` (1 477 tests) | verts |
| `npm test` : `apps/api` | non lancé ici (base de test PostgreSQL absente du conteneur : `TARGET_REQUIRED`) ; laissé à la CI |
| `composants-dynamiques.test.ts` (24) : RotX / RotY et ordre, références, SET / ALTER, refus, relecture | verts |
| `outils/interagir.test.ts` (4) : consigne, survol, un clic = un pas, refus nommés, action en erreur | verts |
| Règle d'or, barres, raccourcis, pictogrammes, curseur, extensions (`apps/web`) | verts |
| Recettes de bout en bout (Playwright) | laissées à la CI |

## Écarts déclarés avec SketchUp

- SET et ALTER passent tous deux à la valeur suivante, sans animation ; ANIMATE, REDRAW, GOTOSCENE ne sont pas repris.
- Interact n'a pas de raccourci par défaut dans SketchUp ; Ctrl + Maj + F est un choix Fadi.
- Comportements non relevés en direct : révisables par un relevé futur.
