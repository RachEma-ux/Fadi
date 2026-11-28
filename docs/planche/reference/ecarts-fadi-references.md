# Écarts déclarés — références verrouillées et raccourcis en deux temps (cas 4, lot C4, étape 3)

Maquette : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-3-reference.png`. Catalogue : D10-F14-024,
D10-F23a-011. Décision du maître d'ouvrage du 27 novembre 2026 : « Raccourcis en deux temps ».

## Raccourcis en deux temps
- Touche d'entrée unique **Ctrl+Maj+Espace**, puis une touche (lettre, chiffre, éventuellement avec Maj) ; écrit
  « Ctrl+Maj+Espace, R » dans le registre, les barres, la liste Outils et les infobulles. Échap, une touche sans
  commande ou 5 s sans touche annulent.
- Le second temps se lit avec Maj si Maj est tenue : relâcher les touches de l'entrée avant la seconde.
- Secondes touches partagées entre fils : références R, C, Maj+C, L, M, K, S ; fil du cas 2 : N, V, O.
- Écart à la maquette : Recharger passe de N à Maj+C et Verrouiller de V à L (N et V laissés au fil du cas 2).

## Références verrouillées
- Formats : OBJ, STL, IFC triangulé (`IfcTriangulatedFaceSet`), lus par le lecteur d'import existant. L'unité d'un
  OBJ ou d'un STL est choisie dans le panneau (m, cm, mm), jamais devinée ; celle d'un IFC est lue.
- Le fichier est archivé tel quel en base (`sandbox_references_fichiers`, 60 Mo au plus) et relu à chaque ouverture ;
  le dessin ne garde que la fiche (nom, format, empreinte, unité, placement, version, tolérance).
- Jamais fusionnée : la référence n'est ni sélectionnable, ni accrochable, ni exportée avec le dessin ; elle est dessinée
  d'un bloc, sans le plafond de triangles du dessin. La lecture du fichier se fait dans la page : un très gros fichier
  peut la figer quelques secondes (pas encore de travailleur dédié).
- Placement : translation et rotation autour de la verticale seulement.
- Récolement : distance exacte de chaque sommet du dessin (géométrie libre et objets visibles) à la référence ; les
  sommets au-delà de la tolérance déclarée sont comptés, listés (12 premiers) et marqués en rouge ; sans tolérance,
  rien n'est jugé ; rien n'est corrigé. Le cadrage au clic sur un écart (bulle de la maquette) n'est pas fait.
