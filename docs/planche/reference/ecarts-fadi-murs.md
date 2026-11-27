# Écarts Fadi — murs à épaisseur (cas 4 du catalogue des extensions, étape 4)

Référence de l'outil Mur et de la commande « Murs depuis les arêtes » (fiche D4-F5-003 du catalogue des extensions,
lot C0 du cas 4 « Noyau ou hôte »). SketchUp n'a pas d'outil Mur : il ne le propose que par des extensions de tiers. L'outil
est donc **déclaré** au catalogue avec le statut `fadi`. Aucune épaisseur ni hauteur n'est fournie comme donnée du
projet : elles se saisissent dans la barre d'options (valeurs de départ de l'outil, modifiables avant chaque tracé).

## § 1 — Mur

- **Barre d'options** : épaisseur (m), hauteur (m), côté de référence (axe, nu intérieur, nu extérieur) et bouton
  « Murs depuis les arêtes ». Une épaisseur ou une hauteur non positive bloque l'outil, avec son motif.
- **Étape 1** : « Cliquez le début de l'axe du mur. »
- **Étape 2** : « Cliquez le point suivant ou tapez une longueur ; Entrée ou double-clic termine, Échap annule le segment
  en cours. » Un clic sur le premier point ferme le tracé. L'empreinte du mur suit le curseur en aperçu.
- **Flèches** : verrou d'axe. **Maj** : verrou d'inférence. **Ctrl** frappé seul fait défiler le côté de référence.
- **Nu intérieur** : le tracé est la face gauche du mur, dans le sens du tracé ; **nu extérieur** : la face droite.
- **Résultat** : un groupe ordinaire de la racine, extrudé de la hauteur, sélectionné ; un pas d'historique « Mur ».
  Le mur reste modifiable directement (pousser-tirer…).
- **Jonctions**, calculées à chaque pose : angle en L (tracé continu ou deux murs joints par leurs extrémités) en coupe
  d'onglet, le voisin intact étant régénéré ; jonction en T arrêtée contre la face du mur traversant. Un croisement, un
  angle trop aigu (moins de 10°) ou un voisin modifié à la main sont **signalés**, jamais corrigés en silence. Un mur
  modifié à la main n'est jamais régénéré.
- **Info entité** : épaisseur, hauteur, référence, longueur d'axe, jonctions (en L, en T, croisements non raccordés).
- **Raccourci Fadi** : Ctrl+Maj+M. La maquette prévoyait Maj+W, qui est le Zoom fenêtre ; Maj+X, la seule lettre libre
  avec Maj, commencerait une saisie au champ Mesures.

## § 2 — Murs depuis les arêtes

- **Présélection** : des arêtes horizontales de la racine. Elles sont ordonnées en chaînes continues ; chaque chaîne
  devient un mur (fermé si elle boucle), avec l'épaisseur, la hauteur et la référence de la barre d'options.
- **Résultat** : tous les murs posés en un seul pas ; les arêtes d'origine restent.
- **Raccourci Fadi** : Ctrl+Maj+H (Ctrl+Maj+M, prévu par la maquette, passe à l'outil Mur).
