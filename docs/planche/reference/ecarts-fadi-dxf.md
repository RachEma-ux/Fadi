# Écarts déclarés — Feuilles en DXF et statut des travaux (cas 4, lot C4, étape 5)

Maquette : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-5-dxf.png`. Catalogue : D10-F14-005, D10-F14-143,
D10-F14-123.

## Statut des travaux
- Statut porté par l'occurrence (groupe ou composant) : `existant`, `a-demolir`, `projete` ; hérité par son contenu, le
  statut le plus proche l'emporte. Les arêtes et faces posées hors de tout objet n'ont pas de statut (toujours
  affichées). Un second appui sur le statut commun de la sélection le retire.
- Couleurs par défaut : existant noir, à démolir jaune (tirets), projeté rouge. Elles suivent la convention SIA 400
  **telle que connue de mémoire** : le texte de la norme n'a pas été consulté (aucune fiche de source). Elles sont
  réglables dans le panneau et restent des options d'affichage, hors du document.
- Filtre d'état : « Existant » montre existant + à démolir, « Projeté » montre existant + projeté ; il agit sur la vue,
  pas sur l'export DXF (qui contient tout, séparé par calques).
- Dans la vue, seules les arêtes prennent la couleur du statut ; les faces gardent leur matière.

## Feuilles en DXF
- Écrivain DXF R2000 (AC1015) écrit pour Fadi (`packages/sandbox-planche-model/src/dxf-feuilles.ts`), sans bibliothèque :
  LINE, TEXT, HATCH (aplat ou motif de la matière), tables et objets requis par AutoCAD. Contrôlé localement avec ezdxf
  1.4.5 (`audit` : 0 erreur, 0 correction ; lecture stricte), contrôle qui ne tourne pas en CI ; en CI, le fichier émis
  est relu par Fadi (version, calques) avant chaque téléchargement.
- Deux contenus : feuille entière en millimètres papier (cadre, cartouche, vues) ou chaque vue en mètres à l'échelle
  réelle (un fichier par vue). Un fichier par feuille (ou par vue), téléchargés un à un : le navigateur peut demander
  d'autoriser plusieurs téléchargements. Pas d'archive ZIP (aucune dépendance ajoutée).
- Calques : FADI_COUPE (0,50 mm), FADI_VU (0,18 mm), FADI_CACHE (0,13 mm, tirets), FADI_HACHURES, FADI_TEXTES,
  FADI_COTES, FADI_CADRE ; suffixe `_EXISTANT`, `_A_DEMOLIR`, `_PROJETE` selon le statut. Couleurs ACI par statut
  (7, 2, 1).
- Textes en police STANDARD (txt) ; les caractères non ASCII sont écrits en `\U+XXXX`.
- Une vue vide n'écrit rien (signalée) ; si rien n'est à écrire, l'export est refusé avec motif.

## Ajouts
- Les cotes du modèle visibles dans une vue (non coupées par le plan de coupe) sont maintenant projetées sur les
  feuilles : dans le DXF (calque FADI_COTES) et aussi dans le PDF et l'aperçu des feuilles, ce que l'étape 6 du cas 4
  ne faisait pas.
- Les feuilles PDF ne portent pas les couleurs de statut (traits noirs) ; seul le DXF sépare les statuts.
- L'import DXF et l'export DXF du modèle restent à l'extension « Échanges DXF » (cas 3).
- Raccourcis en deux temps après Ctrl+Maj+Espace : D (feuilles en DXF), Maj+D (exporter), T (statut), X, A, J.
