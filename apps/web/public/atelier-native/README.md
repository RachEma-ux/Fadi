# Moteur de l'Atelier natif — extrait tel quel du prototype

Source : `Parcours_V8_19_Escalier_B_Mezzanine.html`, SHA-256 `e91492a0b382dd4ca11c20abe70f11ebe44d3bb48d2951b0b9eba9451171f0b9`
(voir docs/migration/reference.md). Généré par `apps/web/scripts/extract-native-atelier.mjs` —
ne pas modifier à la main : relancer le script.

| Fichier | Origine | Octets |
|---|---|---:|
| v14-viewer.js | script anonyme #1 (proj4 + viewer V14 : 3D, plan/coupe/façade, vues, exports, solaire) | 324555 |
| v14-tools.js | script anonyme #2 (géométrie partagée + outils de dessin natifs) | 94587 |
| v8-toolbar.js | barre d'outils V8.2–8.8 de l'app hôte (IIFE), `cur` remplacé par `window.AtelierHost.stage` | 23091 |

Chargés comme scripts classiques (portée globale, mode non strict), dans cet
ordre, après que `window.ParcoursSession.storage` (adaptateur Fadi) et le
markup `#nativeDesignerRoot` sont en place. Interfaces exposées par le moteur :
`window.V14Bridge`, `window.AtelierTools`, `window.initAtelierToolbar`,
événement `parcours-native-change` ({projectId, domain}).
