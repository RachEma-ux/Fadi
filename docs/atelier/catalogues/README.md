# Catalogues de l'Atelier — gabarits sourcés (D-180)

Les catalogues des ontologies P2 (profilés acier, tubes et raccords, sections bois, tables de pliage) sont **livrés
vides**. Aucune valeur n'est écrite par le chef de projet : chaque ligne vient d'un document que le maître d'ouvrage
fournit, et porte sa référence (R3 : rien d'inventé ; exigence, hypothèse et recommandation distinctes).

## Forme des fichiers

- CSV, séparateur `;`, virgule décimale (point admis), encodage UTF-8, première ligne = en-tête (ce dossier).
- Trois colonnes **obligatoires** sur chaque ligne : `source` (titre du document), `edition` (édition, date ou version),
  `page` (page, tableau ou référence interne). Une ligne qui en manque une est **refusée** à l'import, nommée par son
  numéro ; rien n'est importé partiellement.
- Les colonnes numériques (`*_mm`, `*_kg_m`, `facteur_k`, `angle_deg`) doivent être des nombres ; une cellule vide est
  admise et devient « non évaluée », jamais zéro.
- Validateur pur : `packages/atelier-model/src/catalogues/csv-source.ts` (`validerCatalogueCsv`), testé.

## Gabarits

| Fichier | Ontologie | Document attendu du maître d'ouvrage |
| --- | --- | --- |
| `gabarits/profils-acier.csv` | `building.structure` (P2-3) | Catalogue public d'un producteur de profilés (dimensions des IPE, HEA, HEB, UPN…). Les normes EN 10365 et Eurocodes sont payantes et ne sont pas recopiées. |
| `gabarits/tubes-raccords.csv` | `mep` (P2-5) | Catalogue fabricant de tubes et raccords (diamètres nominaux, épaisseurs). EN 10220 / ISO 4200 payantes. |
| `gabarits/sections-bois.csv` | `timber` (P2-4) | Sections commerciales d'un fournisseur ; fiche technique d'un fabricant pour le CLT. |
| `gabarits/table-pliage.csv` | `sheetmetal` (P2-4) | Table de pliage de l'atelier partenaire (matériau, rayon, facteur K) ; propre à chaque atelier, sinon le catalogue reste vide. |

Un catalogue importé est une donnée **du projet** (versionnée, journalisée), pas du produit : deux projets peuvent
porter deux catalogues différents du même fournisseur.
