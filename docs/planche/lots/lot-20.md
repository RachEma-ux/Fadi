# Lot Planche L20 — Étirement à plis — compte rendu

**Statut : livré le 11 octobre 2026.** Délégation D-203 ; décision D-222 ; programme `docs/planche/analyses/programme-lots.md` (L20) ;
cahier V1 EX-PT-03 complet (cas P-05, P-06, P-07).

## Livré

- **Pli des faces voisines** (`etirerFace`, `plisDeFace`). Une voisine qui resterait plane suit l'étirement comme avant.
  Une voisine qui ne le resterait pas est désormais **pliée** au lieu d'être refusée :
  1. Elle est triangulée dans sa forme d'origine, par découpe en oreilles avec des ponts vers les trous. Les concavités
     et les trous sont gardés ; il n'y a jamais d'éventail. La triangulation doit recouvrir exactement la face, sinon le
     refus `EX_PROFILE_INVALID` est levé.
  2. Chaque triangle est porté aux nouvelles positions et contrôlé : ni nul, ni retourné par rapport à la face d'origine,
     ni recoupé par un autre triangle (test segment–triangle strict). Sinon le refus `EX_SELF_INTERSECTION` est levé.
  3. Les triangles coplanaires adjacents sont regroupés en facettes, dont les contours et les trous sont recalculés. Les
     arêtes de pli sont créées et la matière de la face est reprise sur chaque facette.
  4. Tout refus laisse le modèle **inchangé** : l'opération est atomique.
- **Contexte.** Le pli ne touche que le contexte d'édition. Dans un **composant partagé**, l'étirement vaut pour toutes
  ses occurrences (sémantique existante des composants), et la barre d'état l'annonce : « Composant partagé :
  l'étirement s'applique à ses N occurrences. »
- Le test du lot 8 qui attendait un refus pour une « voisine qui deviendrait gauche » attend désormais le pli en
  facettes planes. C'est voulu par EX-PT-03.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| `etirement-plis-l20.test.ts` (5) : P-07 voisine percée (facettes planes, emprise 15 m², trou gardé, arêtes de pli) ; P-06 voisine concave percée (emprise 11 m², aucun débord d'éventail) ; P-05 tronc de pyramide (6 faces, flancs plus raides, aucune ceinture) ; détecteur de recoupement ; composant partagé annoncé, racine intacte | verts |
| Recette `planche-etirement-plis.mjs` (nouvelle, ajoutée à la CI) : pli au doigt de la souris, un pas, Ctrl + Z | verte |
| Recettes Planche existantes (dont `planche-pousser-modes.mjs`), `atelier-barre.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- Une facette regroupée garde la matière de la face d'origine. Elle n'hérite pas d'une matière voisine.
- Le coût du pli croît avec le carré du nombre de triangles de la voisine. Les faces voisines ordinaires en ont peu ;
  voir `docs/planche/mesures/l19-extrusion.md` pour l'insertion en général.
