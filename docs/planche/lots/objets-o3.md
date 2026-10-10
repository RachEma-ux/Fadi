# Lot Planche « Objets O-3 » — Éclater sans perte, « #k », Diviser en segments — compte rendu

**Statut : livré le 10 octobre 2026.** Délégation D-203 ; décision D-205 ; programme `docs/planche/analyses/programme-lots.md`
(Objets O-3, avancé avant L9) ; rapport de recherche « Grouper et Éclater SketchUp vers Planche » (défauts « l'éclatement
perd ce que SketchUp transfère » et « #1#1 »).

## Livré

- **Éclater sans perte** (`eclater(m, occurrence, { dans })`). Les objets enfants gardent **nom, matière, balise,
  masquage et verrou** ; les faces gardent matière recto / verso et **masquage** (nouveau : `Source.masquee`) ; les arêtes
  gardent adoucissement, masquage et courbe. Éclater agit dans le **contexte réellement ouvert** (option `dans`) et non
  plus dans la première occurrence trouvée de la définition (la recherche reste en repli quand `dans` est absent).
- **Transfert annoncé** (écart Fadi déclaré, programme D-202). Comme SketchUp, la matière de l'objet est posée sur les
  faces sans matière propre (côté recto, celui qui l'affichait : l'apparence ne change pas) et, avec la balise, sur les
  objets enfants qui n'en ont pas ; un enfant déjà peint ou balisé garde le sien. Contrairement à SketchUp, rien n'est
  tu : le résultat compte les transferts (`TransfertsEclater`) et la barre d'état les annonce. La géométrie nue de la
  Planche ne porte pas de balise : quand l'objet en avait une, le message le dit (« la balise de l'objet ne la suit pas »).
- **Rendre unique « Nom#k »** (`Travail.nomUnique`) : premier suffixe libre ; un nom déjà suffixé n'empile pas (« #1#1 »
  devient « #3 » s'il le faut). Le nom de la copie est annoncé.
- **Diviser en segments** (Explode Curve, `diviserCourbes`) : chaque courbe touchée par la sélection cesse d'en être une ;
  arêtes et faces inchangées, chaque arête se sélectionne et s'efface seule. Refus nommé sans courbe.
- **Copier garde les attributs** de l'objet copié (nom, matière, balise) ; le verrou et le masquage restent à l'original.
- **Règle d'or** : Rendre unique (⎘, **Alt+Maj+U**), Diviser (⦙, **Alt+Maj+D**) et Diviser en segments (⌇, **Alt+Maj+C**)
  sont livrées : icône propre, place dans la barre d'actions et dans « Outils ▾ » (groupe renommé « Objets et arêtes »),
  raccourci sans collision lu sur la touche physique (macOS). Les deux commandes d'arête sont **contextuelles** : elles
  n'apparaissent dans la barre d'actions qu'avec une arête (ou une courbe) sélectionnée ; « Outils ▾ » les liste toujours,
  grisées avec leur motif. « rendre-unique » et « diviser » quittent la liste d'attente du test.

## Contrôles

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck`, `npm test`, `npm run build` | verts |
| Tests noyau `objets-o3.test.ts` (10) : attributs des enfants, apparence d'un groupe peint conservée, balise, face masquée, option `dans`, verrou, « #1 » / « #2 » / « #3 », Diviser en segments, copie | verts |
| `commandes-objets.test.ts` (disponibilités O-3), test de la règle d'or (commandes livrées, raccourcis, barre contextuelle) | verts |
| Recette `planche-objets.mjs` étendue à O-3 (bureau 1536 px) | verte |
| Recettes `atelier-barre.mjs` (barre : « …, eclater, rendre-unique, detacher »), `planche-lot-5.mjs`, `planche-barre-outils.mjs`, `interface-anglais.mjs` | vertes |

## Limites déclarées

- La balise n'est pas transférée à la géométrie nue : la Planche ne balise que des objets (P-9). Le message le dit ; une
  balise portée par les faces relèverait d'une décision du maître d'ouvrage.
- Diviser coupe toujours en deux (comportement existant) ; le choix du nombre de segments au survol reste à faire.
- Les raccourcis O-3 sont traités dans `Planche.tsx` ; ils passeront au registre unique au lot 9 comme les autres.
