# Écarts Fadi — réserves de chantier (cas 4 du catalogue des extensions, étape 7b)

Référence de l'outil Réserve et du panneau Réserves (fiche D11-F18-037 du catalogue des extensions, lot C0 du cas 4
« Noyau ou hôte » ; maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7b). SketchUp n'a pas
d'outil de réserve : l'outil est **déclaré** au catalogue avec le statut `fadi`. Aucune valeur n'est fournie par Fadi :
lot, entreprise, description, échéance et photo sont saisis ; une échéance vide reste vide.

## § 1 — Réserve

- **Outil Réserve** (Ctrl+Maj+V) : « Cliquez l'objet ou le point où épingler la réserve ; la fiche se remplit dans le
  panneau Réserves. » Un clic (ou un toucher) épingle une réserve **ouverte**, datée du jour, numérotée à la suite, au point
  visé (accrochages ordinaires), sur l'objet de la racine touché s'il y en a un. Un pas d'historique « Réserve ».
- **Panneau Réserves** (Ctrl+Alt+Maj+8, hors de la colonne) : liste filtrée par lot et par statut, fiche de la réserve
  choisie (lot, entreprise, échéance, objet, description, photo). « Prendre une photo » ouvre l'appareil photo arrière sur
  tablette (`capture="environment"`), ailleurs le choix d'un fichier ; l'image est réduite à 1 280 px (JPEG) et rangée
  avec la réserve.
- **Lever la réserve** (Ctrl+Alt+1) : la levée est datée du jour ; sur une réserve levée, la même commande la rouvre.
- **Supprimer** (Ctrl+Alt+2) : retire la réserve ; son numéro n'est pas redonné tant qu'un numéro plus grand existe.
- **Repères dans la vue** : une épingle numérotée par réserve (bleue ouverte, verte levée, le numéro toujours écrit :
  jamais la couleur seule).
- Une réserve ouverte dont l'échéance saisie est passée est marquée « en retard » dans la liste.
