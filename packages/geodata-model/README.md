# @parcours/geodata-model

Logique pure de GeoData (9ᵉ module, [ADR-GEODATA-02](../../docs/continuity/decisions/ADR-GEODATA-02.md)), exécutée à
l'identique dans le navigateur et dans l'API : aucune dépendance, ni React, ni DOM, ni notion de projet.

| Fichier | Rôle |
| --- | --- |
| `coordonnees.ts` | Coordonnées saisies **étiquetées** (`lon … lat …`) ; une paire non étiquetée est refusée, jamais inversée (D-GD-06). |
| `mesures.ts` | Distances, longueurs et surfaces **indicatives** sur la sphère de rayon moyen ; les analyses du serveur mesurent sur l'ellipsoïde (PostGIS). |
| `composition.ts` | Format `geodata-composition/1` d'une carte enregistrée (caméra, fond, couches versionnées, styles, filtre) et sa validation. |
| `classification.ts` | Seuils (quantiles, intervalles égaux, manuels), classe d'une valeur, légende ; une valeur absente a sa propre classe, jamais zéro. |
| `geojson.ts` | Validation d'un GeoJSON importé : CRS, plages, structure, limites (taille, objets, sommets), attributs inertes. |
| `droits.ts` | Rôles GeoData, capacités, droits d'une version par usage (`autorise` / `refuse` / `inconnu`). |
| `valeurs.ts` | Motifs d'absence et lecture d'une valeur d'indicateur. |
