# Écarts déclarés — Redressement d'une photo sur quatre points (cas 4, lot C4, étape 7c)

Captures du panneau livré (accord de Roch « Vas non stop », 27.11.2026) :
`analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7c-redressement.png` et `c4-etape-7c-fond-vertical.png`.
Catalogue : D10-F23a-003.

## Ce qui est livré
- Panneau « Redresser une photo » (Ctrl+Maj+Espace, Z) : photo PNG ou JPEG choisie (réduite à 2 048 px pour le pointé),
  quatre coins d'un rectangle de dimensions connues pointés au clic (bas gauche, bas droit, haut droit, haut gauche),
  largeur et hauteur saisies, loupe ×4 qui suit le pointeur (souris, stylet ou doigt).
- Homographie calculée dans le modèle (`packages/sandbox-planche-model/src/redressement.ts`), photo rééchantillonnée
  (bilinéaire) et posée en fond dans un plan vertical : origine X, Y, altitude du pied et azimut saisis. Un seul pas,
  annulable ; le redressement (coins, dimensions, nombre de contrôles, écart) reste sur le fond pour le journal.
- Points de contrôle (E et suivants, 8 au plus) : position saisie sur la façade, résidu de chacun et écart quadratique
  moyen ; « non évalués » sans contrôle. Alerte de façade non plane au-delà de 1/500 de la diagonale du rectangle
  (seuil proposé par le catalogue comme hypothèse, à confirmer par le maître d'ouvrage), ou quand un contrôle tombe
  au-delà de la ligne de fuite.

## Écarts
- Le calage sur « deux cotes » évoqué par le catalogue n'est pas livré : seul le rectangle de dimensions connues l'est.
- La photo prise directement par la caméra de la tablette passe par le choix de fichier du système (qui propose
  l'appareil photo sur tablette) ; pas de prise de vue intégrée.
- Le cadre redressé est borné à une demi-largeur et une demi-hauteur du rectangle de chaque côté : une photo très
  oblique s'étire à l'infini près de sa ligne de fuite. Les zones hors photo restent transparentes (PNG), ou noires
  quand l'image dépasse la taille admise et passe en JPEG.
- Le pied du rectangle (t = 0) est posé à l'altitude saisie ; la position du plan est saisie, pas accrochée à une arête du
  modèle (accrochage prévu par D10-R-013, hors de cette étape).
- Un fond redressé ne se recale pas à la main (outil Calage, paires de points) : refus « vertical » ; il se refait par un
  nouveau redressement. Il n'a pas de fichier de calage d'image (world file) à l'export.

## Données
- La photo d'origine est archivée telle quelle en base (`/sandbox/fonds`, D-GD-29) avant la pose ; le fond garde sa
  référence et son empreinte.

## Raccourcis
En deux temps après Ctrl+Maj+Espace : Z (redresser une photo), Maj+R (poser), Maj+X (effacer les points).
