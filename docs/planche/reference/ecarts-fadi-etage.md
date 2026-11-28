# Écarts — sélecteur d'étage (cas 4, lot C1, étape 1a)

Entrées : D4-F5-002 (passer d'un étage à l'autre par un sélecteur qui isole le niveau et pose la coupe horizontale à la
hauteur de plan), D1-F19-036 (prendre un niveau nommé et son altitude comme plan de travail). Maquette
`analyses/catalogue-extensions/cas-4/maquettes/c1-etape-1a-selecteur-etage.png` ; découpage (1a seule d'abord) et
hauteur de plan par défaut (1,10 m, modifiable par niveau) décidés le 28.11.2026.

## Livré

- Commande « Sélecteur d'étage » : Ctrl+Maj+Espace, Maj+B, E (famille Bâtiment), icône `stack-middle`, entrée Outils.
- Sélecteur posé dans la vue : niveaux du plus haut au plus bas, « Tous les étages », hauteur de plan de l'étage choisi.
- Choisir un étage : les objets rattachés aux autres niveaux ne sont ni rendus ni accrochés ; l'étage devient le niveau de
  travail (plan de travail à son altitude) ; la coupe horizontale est posée à l'altitude du niveau plus sa hauteur de
  plan, matière coupée pochée.
- Hauteur de plan propre à chaque niveau (`Niveau.coupe`, absente = 1,10 m) : réglée dans le sélecteur ou dans la colonne
  « Coupe » du panneau Niveaux, un pas d'annulation, refusée au-delà de la hauteur d'étage.

## Écarts déclarés

- Les objets sans niveau (et la géométrie libre du dessin) restent affichés quand un étage est isolé : seul le
  rattachement à un niveau dit à quel étage appartient un objet ; rien n'est déduit de l'altitude.
- L'isolement et la coupe d'étage sont des réglages de la vue, jamais écrits au modèle ni partagés ; fermer le sélecteur
  (Échap ou relancer la commande) rend tous les étages et lève le niveau de travail.
- Tant qu'un étage est isolé, sa coupe prime sur les plans de coupe actifs du modèle ; ceux-ci reprennent ensuite.
- 1,10 m est une convention de dessin, pas une valeur réglementaire.
- D4-F5-054 (niveaux comme repères nommés qui posent le plan de travail) était déjà livré par l'étape 1 du lot C0
  (« Travailler sur ce niveau ») ; le sélecteur s'y appuie.
