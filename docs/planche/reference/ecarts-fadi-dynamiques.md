# Écarts Fadi — composants dynamiques (outil Interagir, rotations, références, action au clic)

Ces comportements s'inspirent des composants dynamiques de SketchUp (outil Interact, attributs RotX / RotY, références
« Objet!Attribut », fonctions SET et ALTER de l'attribut OnClick). Ils n'ont pas été relevés en direct : ils sont livrés
comme choix Fadi déclarés (statut « fadi » à l'Instructeur), révisables par un relevé futur. Ils vivent dans l'extension
« Composants dynamiques » de la Planche Sandbox (phase 1, lot 1, 26 novembre 2026).

## 1. Interagir

- **Rôle.** Déclencher l'action au clic d'un composant dynamique, sans passer par le panneau.
- **Geste.**
  1. Le survol désigne le composant visé le plus profond qui porte une action au clic (un composant imbriqué passe avant
     son parent).
  2. Le clic exécute l'action : chaque paramètre nommé passe à la valeur suivante de sa liste, puis le composant est
     redessiné. Un clic = un pas d'annulation.
  3. Une action en erreur ne change rien au modèle ; le message d'erreur est affiché.
- **Refus nommés** : aucun composant dynamique avec une action au clic sous le curseur ; modèle en lecture seule.
- **Raccourci** : Ctrl + Maj + F (couche Fadi). **Barre** : Sélection. **Icône** : main qui clique (`hand-click`).

## 2. Rotations RotX et RotY

- Une règle peut porter RotX, RotY et RotZ (degrés). Ordre d'application : RotX, puis RotY, puis RotZ (R = Rz · Ry · Rx),
  autour du centre de l'occurrence.
- Un attribut de rotation sans règle garde l'angle actuel de l'occurrence dès qu'un autre attribut de rotation a une
  règle.

## 3. Références « Objet!Attribut »

- Une formule de règle peut lire un attribut d'un autre enfant du même composant : `Porte!LenX`, `Pied!Z`. `Parent!` lit
  le composant lui-même, comme avant.
- Attributs lisibles : tous les attributs de règle (X, Y, Z, LenX, LenY, LenZ, RotX, RotY, RotZ, Hidden, Material,
  Copies). Une référence lit la valeur calculée par la
  règle de l'objet visé, sinon sa valeur actuelle.
- **Refus nommés** : aucun objet de ce nom, nom porté par plusieurs objets, attribut non lisible, référence circulaire,
  référence dans un paramètre (un paramètre ne lit pas les objets ; seule une règle le peut).

## 4. Action au clic (SET et ALTER)

- Champ « Au clic » du panneau Composant dynamique : une ou plusieurs actions séparées par « ; », par exemple
  `ALTER("Ouverture", 0, 90)` ou `SET("Tiroirs", 2, 3, 4)`.
- SET et ALTER font la même chose dans Fadi : le paramètre passe à la valeur suivante de la liste (ou à la première si sa
  valeur actuelle n'y figure pas). Les animations et les autres fonctions d'OnClick (ANIMATE, REDRAW, GOTOSCENE…) ne sont
  pas reprises.
- **Refus nommés** : fonction inconnue, forme invalide (nom de paramètre entre guillemets puis au moins une valeur),
  paramètre absent du composant, action de plus de 500 caractères (description refusée).
