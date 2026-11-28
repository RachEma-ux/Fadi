# Écarts déclarés — Visionneuse hors ligne (cas 4, lot C4, étape 7d)

Maquettes validées par Roch (28.11.2026) : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7d-visionneuse.png`
(panneau de la Planche) et `c4-etape-7d-visionneuse-ouverte.png` (fichier ouvert). Catalogue : D10-F14-085.

## Ce qui est livré
- Panneau « Visionneuse hors ligne » (Ctrl+Maj+Espace, Maj+I, V : famille Échanges, premières commandes en trois
  temps) : contenu (maquette en coordonnées locales et son nombre de triangles ; balises sur option), vues enregistrées
  à cocher, version (heure suisse), empreinte de la Planche, taille estimée du fichier.
- « Exporter la visionneuse » (Ctrl+Maj+Espace, Maj+I, Maj+V) écrit un seul fichier `.html` daté
  (`<planche>-visionneuse-AAAA-MM-JJ.html`) : feuille de partage sur téléphone ou tablette, téléchargement ailleurs ;
  l'émission est notée au journal des échanges.
- Le fichier (`packages/sandbox-planche-model/src/visionneuse.ts`, script `visionneuse-script.ts`) : WebGL 1 sans
  bibliothèque, orbite (glisser ; Maj ou bouton droit pour déplacer ; molette ou pincement pour le zoom), vues
  enregistrées, plan de coupe horizontal à altitude réglable, mesure entre deux points accrochés aux sommets à moins de
  12 px, balises affichées ou masquées une à une. « Lecture seule » : aucun champ de saisie, rien n'est écrit.
- Hors ligne prouvé : politique de sécurité `default-src 'none'` dans le fichier ; la recette l'ouvre sans réseau et
  vérifie qu'aucune requête ne part.

## Écarts
- Les vues rappellent la caméra seulement (position, cible, champ, projection) ; l'état mémorisé d'une scène (balises,
  plans actifs, style, soleil) n'est pas rejoué dans la visionneuse.
- Les faces sont rendues en gris éclairé, teinté par la couleur de la balise ; les matières et textures de la Planche ne
  sont pas portées. Pas d'ombres portées.
- Sans l'option Balises, les objets d'une balise masquée ne partent pas ; avec elle, ils partent masqués et la visionneuse
  peut les afficher.
- Les cotes, textes et guides ne sont pas portés (comme les exports OBJ et STL).
- Une très grande maquette (au-delà de quelques centaines de milliers de triangles) rend le fichier lourd : la taille
  est affichée avant l'export, sans plafond imposé.

## Données
- Le fichier est un document produit : il n'est pas archivé en base ; l'émission est notée au journal des échanges.
