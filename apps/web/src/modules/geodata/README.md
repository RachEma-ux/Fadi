# GeoData — 9ᵉ module (ADR-GEODATA-01, ADR-GEODATA-02)

Espace cartographique **autonome des projets** : `/geodata` ouvre directement la carte (aucun sélecteur ni contexte de
projet). Organisation inspirée de Kharita, identité de Fadi.

| Fichier | Rôle |
| --- | --- |
| `PageGeoData.tsx` | Page : barre (recherche, fond, Mes cartes, Études, Importer, Exporter, Ma position, état d'enregistrement), panneau Catalogue / Couches / Légende, carte, volet (fiche, cartes, études, import, export), tiroir de la table. |
| `client.ts` | **Seul** fichier qui appelle le serveur, et seulement `/geodata/api` (test d'indépendance). |
| `composition-ops.ts` | Opérations pures sur la composition locale et état d'enregistrement. |
| `carte/moteur.ts` | Contrat du moteur, sans import du moteur ; détection de WebGL. |
| `carte/moteur-maplibre.ts` | Implantation MapLibre GL JS 6.12.0, chargée à la demande (famille `maplibre` interdite au démarrage, `carte-morceaux.ts`). |
| `panneaux/consultation.tsx` | Catalogue, fiche de version, Couches, Légende et seuils, fiche d'objet, table des attributs. |
| `panneaux/travail.tsx` | Mes cartes et collections, Études (mesures, zones, annotations, analyses), Import, Export. |
| `export-png.ts` | Image PNG de l'export (légende, échelle, attributions repliées, jamais tronquées). |
| `geodata.css` | Styles sous `.geodata-page` seulement. |

Règles tenues par les tests (`independance.test.ts`, `composition-ops.test.ts`, recette `apps/web/e2e/geodata.mjs`) : aucune
notion de projet ; une valeur absente n'est jamais zéro (grise **et** hachurée, libellée avec son motif) ; un déplacement de
la carte rend la composition « non enregistrée » mais ne l'écrit jamais ; conflit de révision → recharger ou enregistrer sa
version comme copie ; sans WebGL, recherche, table et fiches restent utilisables ; au téléphone, un seul panneau ouvert.

Serveur : `apps/api/src/routes/geodata/` (API `/geodata/api`), `apps/api/src/lib/geodata/`, schéma `geodata_*` dans
`apps/api/src/db/init.sql`. Logique partagée : `packages/geodata-model`. Exploitation : `docs/geodata/README.md`.
