# Lot Planche L18 — Compléments des outils de modification — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-220 ; programme `docs/planche/analyses/programme-lots.md` (L18) ;
fiches PL-03-02, PL-03-03, PL-03-05 et PL-03-07 complétées.

## Livré

- **Décalage d'une face à trous** (`decaler`) : le contour et chaque trou avancent ensemble vers la matière. Quand le
  contour rentre, le trou s'agrandit.
  - Option **Chevauchement** (Alt frappé seul ou bouton de la barre d'options) : **Refusé** par défaut. Le décalage est
    alors refusé, en nommant les boucles en cause, quand une boucle se retourne, se recoupe, en croise une autre ou
    l'englobe.
  - **Autorisé** : les boucles sont insérées telles quelles et se coupent entre elles.
  - SketchUp élague les chevauchements. Le refus est un écart Fadi, déclaré.
- **Faire pivoter** :
  - Maj maintenue avant le 1ᵉʳ clic garde le plan du rapporteur.
  - Après le 1ᵉʳ clic, ← / → / ↑ verrouillent la branche sur l'axe vert / rouge / bleu projeté dans le plan de rotation.
    Si l'axe est la normale du plan, le verrou est refusé avec un motif. Un 2ᵉ appui libère.
  - Un glisser depuis le centre définit un axe de rotation quelconque.
- **Retourner** : option **Axes** (Alt), « du contexte » ou « de l'objet ». Pour un seul groupe ou composant, les trois
  plans suivent ses axes propres et passent par le centre de sa boîte orientée. Sans objet unique, la bascule est refusée
  avec un motif et l'option est grisée.
- **Déplacer** : un seul objet sélectionné montre 24 **poignées de rotation** sur sa boîte (4 par face). Un clic sur une
  poignée fait pivoter l'objet autour de la normale de sa face. L'angle vient du curseur (accroché à 15°) ou de la
  saisie ; Échap abandonne.
- **Instructeur** : chaque touche modificatrice affiche son statut de relevé (observé, texte de l'Instructeur, non
  vérifié, écart Fadi). Les statuts sont traduits en anglais.
- Les comportements connus seulement par l'Instructeur ou la documentation sont livrés comme écarts Fadi (statut `fadi`),
  révisables par un relevé.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `outils/modification-l18.test.ts` (11) : décalage à trous (faces 1, 3, 5, 7 m²), refus et chevauchement autorisé, option Alt ; Maj, flèches après le 1ᵉʳ clic, axe glissé ; axes de l'objet et refus ; poignées (24, visée, rotation de 90°, Échap) | verts |
| Suites existantes des outils de modification (`decalage`, `faire-pivoter`, `retourner`, `deplacer`) | vertes |
| Recette `planche-modification-l18.mjs` (nouvelle, ajoutée à la CI) | verte |
| Recettes Planche existantes, `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- L'élagage des chevauchements à la manière de SketchUp n'est pas fait : le chevauchement est soit refusé, soit autorisé.
- ↓ après le 1ᵉʳ clic de Faire pivoter (parallèle / perpendiculaire) et Maj + Alt (libérer le plan inféré) ne sont pas
  pris en charge.
- La place exacte des poignées de rotation de Déplacer n'est pas relevée ; la disposition retenue est un choix Fadi.
