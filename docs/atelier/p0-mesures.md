# Mesures du lot 0 (tâche L0.4)

Banc : `docs/atelier/banc/` (paquet isolé, hors workspaces ; ses dépendances n'entrent jamais dans le produit).
Commande : `cd docs/atelier/banc && npm ci && node --expose-gc run.mjs [--repetitions=3] [--trames=300]
[--rayons=200] [--sans-navigateur] [--sans-node]`. En CI : workflow « Atelier — banc de mesures (L0.4) »
(`.github/workflows/atelier-banc.yml`), JSON publié en artefact `mesures-banc`. Résultats bruts de ce document :
`docs/atelier/banc/resultats-publies/` (`poste-local-2026-10-03.json`, `ci-2026-10-03.json`).

Règle (cahier §8, T18) : une valeur n'apparaît ici que si elle a été mesurée ; sinon « non mesuré ». Aucun
chiffre n'est un engagement de performance du produit.

## 1. Modèle mesuré

Scène dérivée de `apps/api/src/data/examples/p118-native-model.json` (version 8.19.0, EPSG:26191, sha256
`590d8713f765…`), pas d'une génération aléatoire : 6 niveaux, 220 murs, 210 ouvertures (84 portes, 126
fenêtres), 120 poteaux, 32 escaliers, 967 tracés solides (843 avec hauteur), 95 textes, 64 cotations,
45 pièces. Ces effectifs correspondent à ceux du cahier (R7).

## 2. Bancs déclarés

| Banc | Machine | Navigateur / rendu | Mesures qui y ont tourné |
| --- | --- | --- | --- |
| **Poste local** | Téléphone Android, Linux 6.17 sous PRoot, arm64, 8 cœurs, 7 073 Mo (≈ 2 Go libres), Node 22.22.1 | aucun (Chromium indisponible) | Node : tailles WASM, initialisation WASM, manifold-3d, Yjs, écriture IFC (3 répétitions, `resultats/node-poste-local.json`, 2026-10-03 18:06 UTC) |
| **CI GitHub** | Exécuteur `ubuntu-latest` (x86-64) | Chromium headless (Playwright 1.56), WebGL2 par **SwiftShader : rendu logiciel sur CPU**, pas un GPU | rendu three.js, sélection, WASM dans la page, quotas — voir §4 |

Versions : three 0.186.1, web-ifc 0.0.78, manifold-3d 3.5.4, yjs 13.6.33, occt-wasm 5.5.0, opencascade.js 1.1.1.

## 3. Mesures Node (poste local, 3 répétitions)

### 3.1 Taille des WASM candidats

| Candidat | Licence | Brut | gzip | brotli | Initialisation Node p50 | Mémoire (RSS) p50 |
| --- | --- | --- | --- | --- | --- | --- |
| web-ifc 0.0.78 (mono-fil, navigateur) | MPL-2.0 | 7,50 Mo | 1,06 Mo | 0,65 Mo | 487 ms | + 115 Mo |
| manifold-3d 3.5.4 | Apache-2.0 | 0,62 Mo | 0,22 Mo | 0,18 Mo | 37 ms | + 8,7 Mo |
| occt-wasm 5.5.0 | enveloppe MIT / Apache-2.0, binaire OCCT LGPL-2.1 + exception (non arbitré, D-003) | 21,4 Mo | 6,77 Mo | 4,73 Mo | 184 ms | + 77 Mo |
| opencascade.js 1.1.1 | LGPL-2.1 (non arbitré, D-003) | 66,2 Mo | 13,8 Mo | 9,51 Mo | 1 532 ms | + 430 Mo |

web-ifc : schéma `IFC4X3` présent après initialisation (vérifié). OCCT n'est mesuré que dans le banc ; il reste
absent du produit tant que sa licence n'est pas arbitrée (D-003, lot optionnel).

### 3.2 Booléens de maillage manifold-3d (mur − ouvertures)

- P.118 complet (220 murs, 210 ouvertures, 93 murs percés) : **167 ms** au total sans marge de découpe,
  **74 ms** avec marges ; 6 504 triangles ; **0 résultat non conforme**.
- Robustesse : 12 cas limites × 2 (avec et sans marge) — porte à allège nulle (face coplanaire), découpe
  d'épaisseur exacte, quasi-coplanaire à 1·10⁻⁹ m, ouverture affleurante ou dépassant l'extrémité, ouvertures
  chevauchantes ou accolées, largeur nulle (ignorée), mur oblique 37°, mur en coordonnées cadastrales
  (≈ 3,2·10⁵ ; 3,47·10⁵ m), mur de 0,05 m à 20 ouvertures : **24 / 24 conformes** (statut `NoError`,
  volume attendu à 10⁻¹⁶ près en relatif, genre topologique attendu).

### 3.3 Yjs pour le texte d'annotation (D-005)

- 95 annotations de P.118 (281 octets de texte) → état Yjs encodé 4 405 octets ; création 8,7 ms,
  chargement 3,9 ms.
- Granularité d'une mise à jour : 19 octets (un caractère), 24 (un mot), 11 (suppression), 63 (remplacement
  complet), contre 159 à 180 octets pour la commande JSON équivalente.
- Session de 10 000 éditions à deux clients : 545 ms, convergence vérifiée, état final 66 482 octets, mise à
  jour p95 15 octets, synchronisation p95 0,63 ms ; tas supplémentaire ≈ 3,4 Mo pour deux clients.

### 3.4 Écriture IFC 4.3 du sous-ensemble P.118

| Méthode | Construction | Sérialisation | Taille | Relecture (web-ifc) |
| --- | --- | --- | --- | --- |
| web-ifc (API d'écriture) | 376 ms | 25 ms | 407 176 o | `IFC4X3_ADD2` ; 220 murs, 210 ouvertures + 210 `IfcRelVoidsElement`, 120 poteaux, 6 niveaux, `IfcMapConversion` + `IfcProjectedCRS` ; 340 maillages, 7 944 triangles |
| Écriture directe (STEP) | 19 ms | 1 ms | 406 825 o | identique (mêmes effectifs, mêmes maillages) |

`IfcMapConversion` porte des valeurs de test (0 ; 0 ; 0), pas une donnée de projet. Validation IfcOpenShell :
non exécutée (prévue en CI au lot 6).

## 4. Mesures navigateur (CI, rendu logiciel)

Passage du 2026-10-03 (run GitHub Actions 37145845850, artefact `mesures-banc`). **Banc déclaré :** Linux
6.17 Azure, x64, 4 cœurs AMD EPYC 9V45, 16 Go ; Chromium 141.0.7390.37 headless (Playwright 1.56) ; WebGL2 par
ANGLE / Vulkan **SwiftShader — rendu logiciel, pas un GPU réel** ; fenêtre 1536 × 864, facteur 1 ; scène P.118
de 60 176 triangles ; 3 répétitions par mesure, 60 trames d'orbite et 100 rayons par rendu ; froid = contexte
navigateur neuf (cache HTTP vide, shaders non compilés), chaud = 2ᵉ ouverture dans la même page.

### 4.1 Rendu three.js WebGL2 (médianes de 3 répétitions)

| Variante | Cache | Ouverture totale | dont construction | 1ʳᵉ trame | Trame synchronisée p50 / p95 | Intervalle rAF p95 | Sélection (raycast) p95 | Appels de dessin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| un objet par élément | froid | 238 ms | 72 ms | 156 ms | 63 / 68 ms | 100 ms | 0,5 ms | 1 098 |
| un objet par élément | chaud | 144 ms | 53 ms | 81 ms | 62 / 70 ms | 67 ms | 0,2 ms | 1 098 |
| géométries fusionnées par matériau | froid | 217 ms | 69 ms | 137 ms | 58 / 67 ms | 67 ms | 0,5 ms | 120 |
| géométries fusionnées par matériau | chaud | 116 ms | 43 ms | 63 ms | 58 / 66 ms | 67 ms | 0,3 ms | 120 |

Lecture : en rendu **logiciel**, la trame coûte ≈ 60–70 ms quelle que soit la variante (le coût est le
remplissage des pixels sur CPU, pas le nombre d'appels) ; ce chiffre **ne dit rien** du budget de 16,7 ms sur
un vrai GPU (§8) — il reste **non mesuré** faute de banc GPU. Ce qui est établi : l'ouverture de la scène P.118
complète tient sous 250 ms hors réseau, la sélection par rayon sous 1 ms, et la fusion par matériau divise
les appels de dessin par 9 (1 098 → 120).

### 4.2 WASM chargés dans la page (contexte neuf, médiane de 3)

| Candidat | Initialisation navigateur | Vérification |
| --- | --- | --- |
| web-ifc 0.0.78 | 143 ms | modèle IFC créé |
| manifold-3d 3.5.4 | 17 ms | volume d'un cube 1 × 2 × 3 = 6 |
| occt-wasm 5.5.0 | 94 ms | volume d'une boîte 1 × 2 × 3 = 6 |
| opencascade.js 1.1.1 | 575 ms | `gp_Pnt(1, 2, 3)` |

Hors temps de téléchargement (fichiers servis en local) : sur le réseau, ajouter le transfert des tailles du §3.1.

### 4.3 Quotas navigateur (Chromium headless)

- Contexte éphémère : quota annoncé 990 Mo ; profil persistant : 92,9 Go ; `navigator.storage.persist()`
  non accordé dans les deux cas (headless).
- Scène P.118 (664 Ko) écrite puis relue dans IndexedDB en ≈ 3 à 5 ms, contenu identique ; 50 blocs de 1 Mo
  écrits sans erreur (≈ 2 ms par bloc).
- Firefox et Safari (autres quotas, éviction) : **non mesurés**.

### 4.4 Non mesuré

Budget de trame sur un GPU réel (ordinateur, téléphone) ; ouverture de l'Atelier P.118 dans le produit à
comparer aux ≈ 3,2 s de l'existant (§8 : mesurée par les lignes `⏱` du scénario quand l'Atelier existera,
lot 3b) ; Firefox et Safari ; mémoire GPU par onglet. Le passage local du banc de rendu demande un Chromium
utilisable, absent du poste de travail.

## 5. Recommandations pour les décisions déléguées (§10.2)

- **IFC : écriture directe** depuis `atelier-model` pour l'export du sous-ensemble spécifié — même fichier
  relu à l'identique, ≈ 20 fois plus rapide à construire, aucune dépendance de 7,5 Mo dans le chemin
  d'export ; **web-ifc conservé pour l'import et la validation** (lecture, maillages, schéma 4.3 confirmé),
  chargé à la demande. Décision D-016.
- **Yjs : non retenu au lot 0** pour les annotations. Les mesures sont bonnes (mises à jour de 11 à 63 octets,
  convergence), mais le besoin d'édition simultanée d'un même texte n'est pas établi ; les annotations restent
  des commandes (D-005) et la question est rouverte au lot 7 si la collaboration le demande. Décision D-017.
- **manifold-3d** (Apache-2.0) convient pour les percements dérivés (0 non-conformité sur P.118 et sur 24 cas
  limites) ; il reste un moteur de représentation dérivée, jamais la géométrie canonique (D1).
