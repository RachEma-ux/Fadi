# Écarts Fadi — famille d'extrusion (outils et comportements propres à Fadi)

Ces comportements n'ont pas d'équivalent relevé dans SketchUp, ou le relevé ne les décrit pas. Ils sont livrés comme
choix Fadi déclarés (statut « fadi » à l'Instructeur), révisables par un relevé futur.

## 1. Épaissir (lot L21, D-223)

- **Rôle.** Changer une surface en volume fermé. La surface peut être une face, ou plusieurs faces formant une surface
  ouverte (les parois d'une Surface ouverte, par exemple).
- **Geste.**
  1. Clic sur une face. Si elle fait partie d'une présélection de faces, toute la présélection est prise.
  2. L'épaisseur suit le curseur le long de la normale de la face cliquée, ou se tape au champ Mesures (côté du curseur ;
     une valeur négative passe de l'autre côté).
  3. Une épaisseur retapée juste après corrige la même opération : un seul pas.
- **Géométrie.**
  - Chaque sommet est décalé pour que **chacune** de ses faces avance exactement de l'épaisseur le long de sa normale.
    Les faces décalées restent planes et les coins sont en onglet.
  - Des parois ferment les arêtes de bord. Les faces d'origine (ou les faces décalées si l'épaisseur est négative) sont
    retournées pour que la coque regarde vers l'extérieur.
- **Refus nommés.**
  - surface non variété (une arête partagée par plus de deux faces choisies) ;
  - sommet où l'épaisseur ne peut pas être tenue (faces opposées, ou plus de trois plans non concourants) ;
  - épaisseur nulle ou non finie.
- **Raccourci** : Alt + Maj + J (couche Fadi). **Barre** : Volumes · Créer. **Icône** : ▥.

## 2. Pousser/Tirer de plusieurs faces (lot L21, D-223)

- Une face cliquée qui fait partie d'une présélection de plusieurs faces les entraîne toutes, en mode Normal ou en mode
  Conserver la face de départ.
- Chaque face suit sa propre normale, de la même distance, dans une seule opération (un pas d'annulation). Une
  correction tapée juste après vaut pour toutes.
- Surface ouverte, Étirement et « Jusqu'à une face » restent des opérations sur une seule face.

## 3. Effilement, torsion et loft (lot L22, D-224)

- **Rôle.** Balayer à section variable, sans outil de plus : ce sont deux méthodes de Suivez-moi (Alt seul fait le tour
  Chemin → Révolution → Effilement → Loft).
- **Effilement.** Le profil (trous compris) est balayé le long de sa normale sur une longueur. Sa section passe de
  l'échelle 1 à l'échelle d'arrivée et tourne de l'angle de torsion autour du centre du profil. Le champ Mesures prend
  « longueur ; échelle ; torsion » ; un champ vide garde sa valeur.
- **Loft.** Deux faces sans trou, de même nombre de sommets, sont reliées. Les sommets sont appariés dans le même sens de
  parcours, en partant du couple le plus proche. Le champ Mesures prend les tronçons « Ns ».
- **Correction.** Une valeur retapée juste après recalcule depuis le profil d'origine : un seul pas.
- **Refus nommés** : longueur nulle, échelle ≤ 0, tronçons hors de 1 à 512, profils identiques ou incompatibles,
  complexité au-delà du plafond.
