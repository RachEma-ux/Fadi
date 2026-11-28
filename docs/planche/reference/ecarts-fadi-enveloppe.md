# Écarts Fadi — contrôle de l'enveloppe (cas 4 du catalogue des extensions, étape 7c)

Référence du panneau Enveloppe (fiche D6-F20b-004 du catalogue des extensions, lot C0 du cas 4 « Noyau ou hôte » ;
maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7c). Aucune règle ni aucun seuil n'est
fourni par Fadi (aucune donnée réglementaire dans le code) : l'enveloppe est un objet du modèle désigné par la personne,
chaque seuil de hauteur est saisi avec sa source. Une valeur absente rend la règle « non évaluée », motif dit. Rien
n'est modifié dans le modèle.

## § 1 — Enveloppe et règles

- **Panneau Enveloppe** (Ctrl+Alt+Maj+0, hors de la colonne, aussi dans Outils ▾) : en-tête avec l'état du contrôle
  (« contrôle actif » / « contrôle arrêté »), tableau Règle / Valeur / Seuil / Marge / État.
- **Définir l'enveloppe** (Ctrl+Alt+3) : l'objet choisi (un seul objet de la racine) devient l'enveloppe. Il peut ensuite
  être masqué : le contrôle lit sa géométrie quand même.
- **Contrôler** (Ctrl+Alt+4) : active ou arrête le contrôle (bouton plein quand il est actif). Le réglage est rangé dans
  le modèle (`annotations.enveloppe`) et relu à l'ouverture.
- **Ajouter une règle** (Ctrl+Alt+5) et **Supprimer la règle** (Ctrl+Alt+6) : règles de hauteur, chacune avec libellé,
  seuil (m, positif) et source (texte libre : article, document, date). Sans seuil : « Non évaluée — seuil non saisi ».
- Un clic sur une ligne cadre la vue sur son point le plus défavorable.

## § 2 — Méthode de contrôle (déclarée)

- Le calcul (`controlerEnveloppe`, `packages/sandbox-planche-model/src/enveloppe.ts`) tourne dans un travailleur
  (`enveloppe-planche.worker.ts`), relancé 150 ms après la fin de chaque opération tant que le contrôle est actif ; seul le
  dernier résultat est rendu.
- **Volume dans l'enveloppe** : contrôle aux **sommets** des objets visibles de la racine (sauf l'enveloppe et la géométrie
  libre). Un sommet est dedans s'il est dans le solide (parité d'un rayon oblique) ou sur sa surface (à 1 mm). Valeur :
  distance à la surface de l'enveloppe du sommet dehors le plus éloigné (point le plus défavorable) ; seuil 0 m ; marge
  signée. Non évaluée si aucune enveloppe, enveloppe supprimée, enveloppe non fermée ou rien à contrôler.
- **Hauteur** : point le plus haut des objets contrôlés, mesuré depuis z = 0 du modèle ; marge = seuil − valeur
  (négative = écart, tolérance 1 mm).
- Limite connue : un objet qui traverse l'enveloppe sans qu'aucun de ses sommets ne soit dehors (arête qui la perce)
  n'est pas détecté ; la méthode est écrite dans le pied du panneau.

## § 3 — Vue

- Faces hors enveloppe : **hachure et couleur** (jamais la couleur seule), au-dessus du rendu ; anneau et étiquette
  « x,xx m hors » au point le plus défavorable ; chaque seuil saisi est tracé en pointillé à son altitude autour de
  l'enveloppe, avec « enveloppe : libellé (saisi) ».

## § 4 — Écarts déclarés à la maquette

- La maquette ne montre que « Définir » et « Contrôler » : la fiche de la règle choisie (libellé, seuil, source) et les
  commandes Ajouter / Supprimer une règle (Ctrl+Alt+5 et 6) sont ajoutées, sans quoi aucun seuil ne pourrait être saisi.
  Le lien de consultation (étape 7d), dessiné avec Ctrl+Alt+5 et 6, prend donc Ctrl+Alt+7 et 8.
- « contrôle actif » est écrit sous le titre (comme le compte des réserves), aligné à droite.
- Coordonnées du point le plus défavorable dans les axes du modèle (la maquette dit « repère local »).
