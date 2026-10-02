# Module : Documents

Responsabilité : plans, tableaux, nomenclatures et rapports.

Produit les documents du projet à partir du modèle commun. Chaque document produit porte la révision du projet
utilisée pour le générer et un état d'actualisation (à jour / périmé) — voir `Document produit` dans
`docs/architecture.md`, « Domain model ». Deux documents produits à partir de la même révision doivent
toujours concorder (mêmes surfaces, mêmes quantités).

## Statut

`DocumentsModule.tsx` présente le catalogue servi par `GET /projects/:id/documents` : chaque document productible (rapports Harmonie, bilan du bâtiment conçu, plans de lecture SVG, tableaux CSV, fiches de l'exemple, archive JSON) avec la révision du modèle et l'empreinte des entrées dont il serait produit, sa dernière production (`produced_documents`) et son actualité « à jour / périmé » (`documentFreshness`, `packages/domain-model/src/documents.ts`). « Produire ↓ » appelle la route de production, qui régénère le fichier et enregistre la trace ; les téléchargements des autres modules passent par les mêmes routes.

Reste : les dessins techniques et exports PNG / SVG / DXF de l'Atelier (produits par le moteur natif, non catalogués), le rapport HTML d'un cas de la bibliothèque.
