# Projet mixte de référence « P.118-M » — scénario à valider (D-181)

**Statut : scénario validé par délégation (D-183) ; machine construite au lot P2-2 (recette `apps/web/e2e/porte-p1-p2.mjs`), réseau au lot P2-5. Correction D-184 : le « Local technique » de P.118 est au R+1 (pièce E09), pas au rez-de-chaussée ; la CTA y est posée. En attendant les gaines (P2-5), la gaine G1 est représentée par une pièce provisoire qui traverse un mur (collision attendue).**

## 1. Pourquoi un projet mixte

Le Concept V4 §12 fixe la condition de passage P1 → P2 : « premier parcours bâtiment–mécanique complet et cohérent ».
P.118 est un bâtiment seul. Il faut un projet qui contienne, dans la même version, la même feuille et le même IFC, un
bâtiment, une machine et un réseau, pour prouver T01 (une application, aucun changement d'édition), T02 (identités et
représentations liées), T07 (documents périmés) et la coordination (collision signalée, jamais corrigée).

## 2. Contenu

Géométrie **d'exemple déclarée**, au même titre que P.118 (`exampleMode`) ; aucune valeur de performance, aucune
valeur normative ; les dimensions sont des choix de dessin.

| Élément | Ontologie | Contenu | Lot |
| --- | --- | --- | --- |
| Bâtiment | `building.architecture` | P.118 **inchangé** (6 niveaux, 220 murs, 210 ouvertures, 120 poteaux, 967 solides, 74 pièces). Un local technique existant du rez-de-chaussée est désigné comme hôte de la machine. | P1 (livré) |
| Machine | `mechanical` | Centrale de traitement d'air simplifiée : **4 pièces** (socle fixe, caisson 2,4 × 1,6 × 1,2 m, ventilateur Ø 1,0 m à 24 pales, panneau coulissant 1,0 × 1,2 m) et **2 liaisons** (pivot ventilateur / caisson, angle piloté ; glissière panneau / caisson, course pilotée). Assemblage posé dans le local technique, repère local du niveau (R5). | P2-2 |
| Réseau | `mep` | **2 gaines** rectangulaires de section 300 × 250 mm : G1 de la machine vers le bureau 1.12 **en traversant un mur sans réservation** (collision attendue) ; G2 vers la salle 1.04 avec une **réservation** posée dans le mur (pas de collision). Raccords aux extrémités, connectivité vérifiée. | P2-5 |
| Documents | `M11` | Plan du rez-de-chaussée (bâtiment + machine + gaines), coupe par la machine, feuille A1 (plan + éclaté de la CTA avec bulles), nomenclature de la CTA, tableau des pièces du bâtiment inchangé. | P2-2, P2-5, P2-7 |

## 3. Scénario de la porte P1 → P2 (recette `apps/web/e2e/porte-p1-p2.mjs`, à écrire en P2-2)

1. Ouvrir P.118-M : étapes 10 / 11, module Atelier, **un seul écran**, modes Plan / 3D / Documents / Planche.
2. Activer l'ontologie `mechanical` (déjà active dans l'exemple) : les outils Pièce, Assemblage, Liaison apparaissent dans
   la palette et la barre à leur famille ; aucun écran, aucun ruban nouveau (T01).
3. Dessiner un mur dans le local technique, puis déplacer le ventilateur (angle piloté 45° → 90°) : deux commandes, deux
   révisions, même journal, même annuler / rétablir.
4. Créer la version « Avant modification », modifier le panneau (course), comparer : la différence nomme la pièce.
5. Feuille A1 : plan + éclaté ; après la modification du panneau, la feuille est **périmée** puis régénérée (T07).
6. Export IFC : un seul fichier, `IfcWall` et `IfcElementAssembly` + proxys de pièces et `IfcDuctSegment` ; rapport de
   fidélité ; réimport : objets importés en lecture (R16).
7. Panneau des problèmes : collision G1 × mur signalée avec objet, cause, action ; G2 sans collision (réservation).
8. Téléphone 390 px et clavier ; axe-core sans violation critique ou sérieuse.
9. Constat du maître d'ouvrage sur l'instance (fichier IFC ouvert dans un visualiseur tiers, déjà exigé au lot 6).

Critère de passage : les neuf points verts ; T01 à T20 rejouées sur ce projet (`docs/atelier/recette.md` §3, colonne P2).

## 4. Ce que le maître d'ouvrage valide ici

- Le choix de la machine (CTA) et du réseau (gaines) comme représentants de la mécanique et des réseaux ; une alternative
  (ascenseur + chemins de câbles, par exemple) est possible, à dire avant P2-2.
- Le local technique hôte et les deux pièces desservies (désignés par leur code P.118 au moment de la construction).
- Le fait que la géométrie soit un exemple déclaré, sans valeur de performance ni de catalogue.

## 5. Porte P1 réduite (P2-0, livrée)

En attendant la mécanique, la recette `apps/web/e2e/porte-p1-reduite.mjs` joue la partie de la porte possible avec les
ontologies existantes : dans **un seul projet et un seul écran**, un mur (bâtiment), une esquisse (dessin), un solide de
Planche (géométrie libre), une feuille (documents) et une version nommée ; résultat déclaré **« porte partielle :
mécanique absente »** (cahier P2 §5, P2-0).
