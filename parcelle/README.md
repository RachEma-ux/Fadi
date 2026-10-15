# Outil Parcelle — extrait tel quel du prototype

Source : `EMB.parcel` de `Parcours_V8_19_Escalier_B_Mezzanine.html` (SHA-256 `e91492a0b382dd4ca11c20abe70f11ebe44d3bb48d2951b0b9eba9451171f0b9`),
document « Parcelle — Atelier satellite » (964627 octets après adaptation). Généré par
`apps/web/scripts/extract-parcelle.mjs` — ne pas modifier `index.html` à la main.

Modules du document (attribut `data-source`) : vendor/leaflet.js, vendor/proj4.js, geometry.js,
satellite.js, vendor/jszip.min.js, google-earth.js, design-parcel.js, file-data.js, project-files.js,
map-format.js, parcel-annotations.js, earth-layer.js, vendor/roads-mvt.js, roads.js, roads-view.js,
road-width.js, frontage.js, dossier-panels.js, parcel-list.js, panel-folds.js, design-panel.js,
atelier-export.js, app.js — plus `parcelle-bridge.js` (Fadi) à la place de `local-files.js`.

Contrat serveur attendu par `project-files.js`, servi par `apps/api/src/routes/parcels.ts` :
`GET /projects/:id/parcels`, `GET|PUT|DELETE /projects/:id/parcels/:parcelId` (révision par fichier, 409 en cas d'écriture périmée).
