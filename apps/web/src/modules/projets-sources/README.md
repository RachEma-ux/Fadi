# Module : Projets et sources

Responsabilité : projets, parcelles, fichiers, versions et provenance.

Gère la liste des projets (dont P.118, l'exemple pilote entièrement renseigné et duplicable), leurs parcelles,
les documents sources attachés (avec origine, date, unité et statut de vérification — voir `Donnée source`
dans `docs/architecture.md`), et l'historique de versions du projet.

## Statut

Porté (voir `docs/migration/matrix.md`) :

- `ParcelleTool.tsx` : l'outil Parcelle du prototype, document extrait tel quel (`public/parcelle/index.html`) et servi par Fadi au contrat natif de l'outil (`/projects/:id/parcels`, révision par fichier), transmission parcelle → modèle (`acceptParcel`) ;
- `StepSources.tsx` / `ProjectSources` : sources de chaque étape (import, liste, téléchargement en pièce jointe, suppression) ;
- `ImportProjectButton.tsx` : « Importer projet JSON » (archive Fadi ou export du logiciel existant) ; « Sauvegarder projet JSON » et « Essayer une autre répartition en copie » (`POST /projects/:id/copies`) côté API ;
- la liste des projets et les exemples importables (P.118), avec provenance (`sourceExampleId`) et mode (`exampleMode` : référence protégée ou copie de travail) conservés.

Reste : documents de base PDF, journal des événements de transmission, persistance hors-ligne.
