# Écarts déclarés — Lot d'échange daté (cas 4, lot C4, étape 7e)

Maquette validée par Roch (28.11.2026) : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-7e-lot-echange.png`
(panneau de la Planche et aperçu du manifeste). Catalogue : D10-F14-082.

## Ce qui est livré
- Panneau « Lot d'échange » (Ctrl+Maj+Espace, Maj+I, L : famille Échanges) : jeu enregistré ou nouveau, nom du jeu,
  sorties cochées (IFC structuré, DXF des feuilles, PDF des feuilles, CSV du débit, image PNG de la vue ; les quatre
  premières par défaut) avec ce que chacune contiendra, destinataire, registre des lots émis.
- Carte « Aperçu du manifeste » posée sur la vue à gauche du panneau : lot, date et heure suisses, Planche, empreinte du
  modèle, destinataire, noms des sorties et nom de l'archive. Elle se masque sous 1 100 px de large.
- « Émettre le lot » (Ctrl+Maj+Espace, Maj+I, Maj+L) produit toutes les sorties ensemble et les range dans une archive
  `<Planche>-<jeu>-AAAA-MM-JJ.zip` (« DCE lot 02 » donne « DCE02 ») : chaque sortie, un rapport par sortie
  (`rapports/<fichier>.txt` : contenu, taille, SHA-256) et `manifeste.txt` (SHA-256 entier de chaque fichier rangé).
  Une sortie impossible arrête l'émission avec son motif (feuille absente pour DXF ou PDF, IFC bloquant, hachures trop
  denses) : aucune archive partielle.
- Le lot est noté au registre de la Planche (registre des versions : date, jeu, destinataire, empreinte du manifeste)
  et le jeu y est enregistré avec ses sorties ; l'émission est notée au journal des échanges.

## Écarts
- L'archive est un ZIP stocké, sans compression (le choix de compression vaut pour la PR `.ifczip` qui suit).
- Les sorties reprennent les réglages courants des exports existants (IFC structuré, DXF et PDF des feuilles, débit sur
  tout le modèle, capture de la vue) ; un jeu ne mémorise que ses sorties, pas de réglages propres à chaque sortie.
- Le manifeste n'est pas signé : l'empreinte prouve l'intégrité du lot, pas son auteur.
- Le registre des lots vit dans la Planche (navigateur) ; il n'est pas partagé entre postes.

## Données
- L'archive est un document produit : elle n'est pas archivée en base ; son empreinte de manifeste reste au registre.
