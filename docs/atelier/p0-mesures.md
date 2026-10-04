# Lot 0 — Mesures (L0.4)

Date : 2026-10-03 · Auteur : équipier « mesures » · Scripts : `scripts/bench/` (README avec les commandes) ·
Statut : mesures publiées ; aucune valeur n'est un seuil (cahier §8 : « mesurée, jamais annoncée »).

Toutes les valeurs ci-dessous ont été **mesurées** sur le banc déclaré en section 1. Quand une mesure n'a pas pu
être faite, elle est reportée « non mesuré » avec le motif (section 11). Les décisions que ces mesures éclairent
sont listées en section 10 ; celles du cahier §10.1 restent au maître d'ouvrage.

## 1. Banc déclaré

| Élément | Valeur |
| --- | --- |
| Machine | bac à sable Linux de développement (conteneur), `Linux 6.18.44-fc-v64 x86_64` |
| CPU | Intel Xeon @ 2,80 GHz, **2 vCPU** (`hardwareConcurrency` = 2) |
| RAM | 8 031 Mo (`deviceMemory` = 8) |
| Node / npm | v22.22.2 / 10.9.7 |
| Navigateur | Chromium **141.0.7390.37** (Playwright 1.56.0, canal `chromium`, headless), fenêtre 1536 × 864, `devicePixelRatio` 1 |
| Rendu graphique | **logiciel** : `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)`, `WebGL 2.0 (OpenGL ES 3.0 Chromium)` ; aucun GPU |
| Drapeaux Chromium | `--enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist --disable-frame-rate-limit --disable-gpu-vsync --enable-precise-memory-info` (rAF non plafonné à 60 Hz) |
| Scène three.js | 6 niveaux, 220 murs (4 × 0,2 × 3 m), 210 ouvertures (1 × 0,3 × 2,1 m), 120 poteaux (0,3 × 0,3 × 3 m), 967 solides (0,5–2 m) : **1 517 objets**, boîtes, **18 204 triangles**, `MeshStandardMaterial`, 2 lumières, antialiasing activé ; placement pseudo-aléatoire déterministe (graine 118) sur 40 × 30 m |
| Caméra | orbite complète en 300 trames, rayon 70 m, une trame par `requestAnimationFrame` |
| Cache | froid : nouveau contexte navigateur par mesure, serveur HTTP local, pas de service worker, modules ES non minifiés de `node_modules` |
| Paquets mesurés | three 0.186.1 (MIT), web-ifc 0.0.78 (MPL-2.0), manifold-3d 3.5.4 (Apache-2.0), yjs 13.6.33 (MIT), occt-wasm 5.5.0 (MIT OR Apache-2.0), opencascade.js 1.1.1 (LGPL-2.1-only, archive seulement) — tous installés hors dépôt |

**Avertissement.** Le rendu headless est logiciel (SwiftShader sur 2 vCPU) : les temps de trame absolus ne sont
**pas représentatifs d'un GPU réel** (ils sont dominés par la rastérisation CPU). Ce banc sert de base de
comparaison entre variantes et entre lots, pas de seuil. Les mesures sur l'appareil de référence et un téléphone
Android restent à faire (cahier §8, `docs/architecture.md`).

## 2. three.js WebGL2 — scène équivalente P.118

Deux variantes de la même scène :

- **A** : murs et solides en `Mesh` individuels (une `BoxGeometry` chacun : 1 188 géométries), ouvertures et
  poteaux en `InstancedMesh` par niveau → **1 199 maillages, 1 199 draw calls** (dont 330 instances).
- **B** : `InstancedMesh` pour toute classe, par niveau (6 niveaux × 4 classes) → **24 maillages, 24 draw calls**,
  1 517 instances, 1 géométrie.

Synchronisation : dans Chromium, `gl.finish()` est volontairement un simple `flush` ; la fin de rendu est donc
attendue par un `readPixels` 1 × 1 après chaque `render()` (« avec sync »). La mesure « sans sync » donne le seul
coût CPU de `render()` (JS + tampon de commandes), sans attendre la rastérisation.

### 2.1 Première image (ms depuis le début de la navigation, cache froid)

| Quoi | A | B | Unité | Conditions |
| --- | --- | --- | --- | --- |
| Import de three (`three.module.js`, non minifié) | 185 | 135 | ms | 1536 × 864, avec sync |
| Construction de la scène | 98 | 9 | ms | idem |
| Création du `WebGLRenderer` | 28 | 85 | ms | idem |
| Premier `render()` (compilation des shaders incluse) | 414 | 258 | ms | idem |
| **Première image, total** | **834** | **528** | ms | idem |
| Première image, total | 637 | 463 | ms | 384 × 216, avec sync |
| Première image, total | 509 | 326 | ms | 1536 × 864, sans sync |

### 2.2 Budget de trame en orbite (300 trames, `render()` + synchronisation)

| Quoi | A | B | Unité | Conditions |
| --- | --- | --- | --- | --- |
| Trame p50 / p95 / max | 184,3 / 215,3 / 239,9 | 181,0 / 212,7 / 287,5 | ms | 1536 × 864, avec sync (rastérisation logicielle) |
| Intervalle entre rAF p50 / p95 | 186,0 / 220,2 | 184,1 / 223,7 | ms | idem |
| Trame p50 / p95 / max | 72,5 / 88,7 / 190,5 | 52,8 / 79,1 / 96,3 | ms | 384 × 216, avec sync |
| **Coût CPU de `render()` p50** | **15,0** | **0,17** | ms | 1536 × 864, sans sync |
| Coût CPU de `render()` p95 / max | 1 278,8 / 1 409,5 (¹) | 1,5 / 3,9 | ms | idem |
| Draw calls / triangles par trame | 1 199 / 18 204 | 24 / 18 204 | — | `renderer.info.render` |
| Programmes GLSL | 2 | 1 | — | `renderer.info.programs` |

(¹) Sans synchronisation, le processus de rendu finit par bloquer sur le processus GPU saturé (contre-pression du
tampon de commandes) : la queue à 1,3 s mesure cette saturation du rendu logiciel, pas le coût d'une trame.

**Lecture.** À 1536 × 864, la trame est entièrement dominée par la rastérisation logicielle (≈ 180 ms, identique
en A et B) : aucune conclusion sur un GPU réel. L'écart A − B apparaît dès que le remplissage baisse (384 × 216 :
≈ 20 ms) et directement dans le coût CPU de `render()` : **≈ 15 ms par trame pour 1 199 draw calls contre 0,17 ms
pour 24**, soit ≈ 13–17 µs par draw call sur ce CPU. Ce coût CPU existe tel quel sur un vrai GPU : avec un objet
par maillage, les draw calls seuls consomment presque tout le budget de 16,7 ms (D2) sur un processeur de cette
classe.

### 2.3 Sélection (100 lancers de rayon, `Raycaster.intersectObjects(scene.children, true)`, 1 517 objets)

| Quoi | A | B | Unité | Conditions |
| --- | --- | --- | --- | --- |
| Lancer de rayon p50 / p95 / max | 0,135 / 0,575 / 4,08 | 0,030 / 1,99 / 10,05 | ms | points d'écran aléatoires, 7 touches sur 100, 1536 × 864 |

### 2.4 Mémoire JS (`performance.memory`, précise)

| Quoi | A | B | Unité | Conditions |
| --- | --- | --- | --- | --- |
| `usedJSHeapSize` après l'orbite | 13,8 | 8,0 | Mo | 1536 × 864 ; 1 188 `BoxGeometry` en A contre 1 en B |
| `totalJSHeapSize` | 17,0 | 11,1 | Mo | idem |
| Mémoire GPU par onglet | non mesuré | non mesuré | — | rendu logiciel, pas de compteur exposé (D6) |

## 3. WebGPU

| Quoi | Valeur | Conditions |
| --- | --- | --- |
| `navigator.gpu` | **absent** | Chromium 141 headless, 4 jeux de drapeaux essayés : aucun ; `--enable-unsafe-webgpu` ; `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader` ; `--enable-unsafe-webgpu --enable-features=Vulkan --use-vulkan=swiftshader --use-webgpu-adapter=swiftshader` |
| Banc `WebGPURenderer` | **non mesuré : WebGPU indisponible dans Chromium headless du bac à sable** | le script lance la variante WebGPU automatiquement dès qu'un adaptateur existe (`three-bench.mjs`) |

## 4. web-ifc 0.0.78 (MPL-2.0)

| Quoi | Valeur | Unité | Conditions |
| --- | --- | --- | --- |
| `web-ifc.wasm` brut / brotli 11 / gzip 9 | 1 595 268 / **439 717** / 577 884 | octets | version mono-thread navigateur |
| `web-ifc-mt.wasm` brut / brotli / gzip | 1 558 039 / 424 250 / 572 769 | octets | version multi-thread (COOP/COEP requis) |
| `web-ifc-node.wasm` brut / brotli / gzip | 1 523 182 / 421 860 / 567 214 | octets | version Node |
| `web-ifc-api.js` brut / brotli / gzip | 5 909 050 / **209 592** / 487 161 | octets | API JS : contient les classes des trois schémas |
| `require()` de l'API (Node) | 228 | ms | API de 5,9 Mo |
| `IfcAPI.Init()` (Node) | **35,9** | ms | `web-ifc-node.wasm`, cache froid |
| `GetVersion()` | 0.0.78 | — | |
| Schémas exposés (`Schemas`) | `IFC2X3`, `IFC4`, **`IFC4X3`** | — | espace de noms `IFC4X3` présent ; en lecture, `IFC4X3_ADD1/ADD2/RC1–RC4` reconnus (`IFC4X3_ADD2` traité comme compatible avec `IFC4X3`) |
| Écriture : `CreateModel({ schema: 'IFC4X3' })` + `IfcProject` + `IfcWall` + `SaveModel` | **16,1** | ms | 706 octets ; en-tête émis `FILE_SCHEMA(('IFC4X3'));` ; lignes `#1=IFCPROJECT('1cB3_Tiyf28geiHAOdlzFs',$,'Projet banc',…);` et `#2=IFCWALL('3kSQxO9cT7KRm13asR$o5g',$,'Mur 01',$,$,$,$,$,$);` |
| Relecture du fichier produit (`OpenModel`) | 2,4 | ms | schéma relu `IFC4X3`, 2 lignes, 1 `IfcProject`, 1 `IfcWall` nommé « Mur 01 » |

**4.3 en écriture : oui pour les entités, partiel pour l'usage.** Preuve : fichier `IFC4X3` écrit puis relu par
web-ifc avec le bon type et le bon nom. Limites constatées : (a) l'écriture est ligne à ligne (`CreateIfcEntity` /
`WriteLine`), sans générateur de représentation — placements, `IfcExtrudedAreaSolid`, relations hôte / ouverture,
unités et contexte restent à produire entité par entité par Fadi ; (b) l'en-tête émis est `IFC4X3`, alors que
ISO 16739-1:2024 correspond à `IFC4X3_ADD2` : à vérifier au lot 6 contre le service de validation (post-traitement
de l'en-tête possible) ; (c) l'API JS pèse 5,9 Mo brut (0,21 Mo brotli) parce qu'elle embarque les classes des
trois schémas.

## 5. OCCT WASM (lot optionnel, aucune dépendance ajoutée au dépôt)

Sources : `npm view`, `npm pack` (archives extraites hors dépôt), `occt-bench.mjs` en Node. Les deux booléens
`cut` ci-dessous sont le mur 4 × 0,2 × 3 m moins l'ouverture 1 × 0,3 × 2,1 m (allège 0,45 m), 20 répétitions.

| Quoi | opencascade.js 1.1.1 | occt-wasm 5.5.0 | Unité / conditions |
| --- | --- | --- | --- |
| Licence (`npm view … license`) | **LGPL-2.1-only** | **MIT OR Apache-2.0** | |
| Dernière publication | 2023-03-23 (`latest` 1.1.1 ; `beta` 2.0.0-beta.b5ff984, 64,3 Mo décompressés, même licence) | **2026-10-01** (deux jours avant ce banc) | `time.modified` |
| Taille décompressée annoncée | 66 689 968 | 21 759 873 | octets, `dist.unpackedSize` |
| Archive npm | 14 040 577 | 6 902 564 | octets, `npm pack` (< 1 s chacun) |
| `.wasm` brut / **brotli 11** / gzip 9 | 65 864 037 / **9 465 008** / 13 834 575 | 21 173 108 / **4 686 832** / 6 770 967 | octets, mesurés sur les archives |
| Initialisation en Node | **1 260–1 340** | **147–236** | ms, deux exécutions chacune ; wasm fourni en mémoire |
| RSS après initialisation | + 369–372 | + 59–60 | Mo |
| `cut` médian (min–max) | 97,7 (90–199) | 42,3 (12–96) | ms, 20 répétitions, variance élevée sur 2 vCPU |
| Résultat | 10 faces, 1,98 m³, 32 triangles (maillage 19,9 ms) | 10 faces, 1,98 m³, 32 triangles (maillage 22,2 ms) | identique à manifold-3d |
| Observations | chargeur Emscripten 2021 : en Node 22 il faut fournir `require`, `__dirname` et le binaire (`wasmBinary`, sinon `fetch()` sur un chemin local) ; API par surcharges numérotées (`BRepPrimAPI_MakeBox_3`) | API TypeScript ; un `Vec3` passé en tableau au lieu de `{x,y,z}` est accepté **sans erreur** et produit une forme de volume nul (vérification d'entrée à prévoir) | |

Autres paquets vus par `npm search occt wasm` (métadonnées seulement) : `@bitbybit-dev/occt` 1.4.1 (MIT,
98,3 Mo décompressés), `occt-import-js` 0.0.23 (LGPL-2.1, 11,6 Mo, import seul).

## 6. manifold-3d 3.5.4 (Apache-2.0)

| Quoi | Valeur | Unité | Conditions |
| --- | --- | --- | --- |
| `manifold.wasm` brut / brotli 11 / gzip 9 | 541 470 / **158 724** / 205 699 | octets | |
| `manifold.js` brut / brotli | 82 371 / 17 223 | octets | |
| Initialisation (`Module()` + `setup()`) | **15,4** (19,4 à la première exécution) | ms | Node |
| Différence mur 4 × 0,2 × 3 m − ouverture 1 × 0,3 × 2,1 m, **médiane sur 100** | **0,44** | ms | p95 0,59 ; min 0,27 ; max 5,45 |
| Résultat | **32 triangles**, 16 sommets, volume 1,980 m³ (attendu 1,980), surface 23,84 m², genre 1, `NoError` | | percement complet (allège 0,45 m) |
| Mur moins 20 ouvertures (union puis différence) | 5,8 | ms | 412 triangles |
| RSS du processus | 85 | Mo | |

## 7. Yjs 13.6.33 (MIT)

Charge : 1 000 annotations de 80 caractères (82 000 octets UTF-8 ; 91 891 octets en JSON) dans une `Y.Map`.
Deux formes : (a) valeurs chaînes ; (b) une `Y.Text` par annotation (co-édition caractère par caractère).

| Quoi | (a) `Y.Map` de chaînes | (b) `Y.Map` de `Y.Text` | Unité | Conditions |
| --- | --- | --- | --- | --- |
| `dist/yjs.mjs` brut / brotli / gzip | 300 059 / 50 708 / 62 729 | idem | octets | |
| Construction (1 transaction) | 4,1 | 9,7 | ms | Node |
| Tas JS du document | + 651 | + 669 | Ko | `heapUsed` après GC forcé |
| `encodeStateAsUpdate` : taille | **103 899** (+ 27 % vs texte brut) | **112 695** (+ 37 %) | octets | brotli 2 515 / 4 513 (texte de test répétitif : non représentatif) |
| `encodeStateAsUpdate` : temps | 8,5 | 12,6 | ms | |
| `applyUpdate` complet dans un `Y.Doc` vierge | **7,5** | **12,0** | ms | médiane de 5 |
| Mise à jour incrémentale (1 annotation modifiée) : taille / encodage / application | 107 octets / 0,9 ms / 5,3 ms | 40 octets / 4,0 ms / 0,19 ms | | depuis le vecteur d'état du pair (7–9 octets) |
| Granularité observée | `map.observe` → `keysChanged = ['a7']` | une édition dans une `Y.Text` **n'est pas vue** par `map.observe` (il faut `observeDeep`) | | |
| Tas JS total (deux documents) | 1,48 | 1,27 | Mo | |

## 8. Quotas navigateur (Chromium headless, page locale `http://127.0.0.1`, contexte sécurisé)

| Quoi | Valeur | Conditions |
| --- | --- | --- |
| `navigator.storage` | présent | |
| `navigator.storage.estimate()` | quota **547 056 928** octets (≈ 522 Mio), usage 0 (`usageDetails` vide) | profil temporaire headless ; le quota dépend du disque libre et du profil, valeur propre au bac à sable (538 Mo à une exécution précédente) |
| `navigator.storage.persist` | fonction disponible | |
| `persist()` / `persisted()` | **false / false** | headless sans engagement utilisateur : refus attendu ; à remesurer sur appareil réel |

## 9. Référence antérieure : démarrage de l'Atelier actuel

Chiffres déjà publiés dans `docs/architecture.md` (« Acceptance target », « First indicative measurements »),
cités comme référence antérieure et **non remesurés** ici (le scénario e2e complet n'a pas été relancé) : headless
Chromium, bac à sable de développement, API et PostgreSQL sur la même machine (l'exécuteur GitHub est plus
rapide) — import de l'exemple P.118 jusqu'à la vue d'ensemble ≈ 2,3 s ; ouverture de l'étape 02 ≈ 0,7 s ;
**ouverture de l'Atelier (moteur, modèle P.118, géométrie dessinée) ≈ 3,2 s** ; annulation d'un mur jusqu'à
confirmation serveur (anti-rebond 350 ms inclus) ≈ 1,6 s ; rechargement de la page Atelier ≈ 3,2 s.

## 10. Conclusions pour les décisions déléguées (cahier §10.2) et D6

Ces conclusions sont des recommandations fondées sur les mesures ; la décision et sa consignation dans
`decisions.md` reviennent au chef de projet (§10.2) ; la licence OCCT et l'ouverture du lot optionnel restent au
maître d'ouvrage (§10.1).

1. **IFC 4.3 : web-ifc ou écriture directe.** web-ifc écrit bien un fichier `IFC4X3` relu correctement (section 4),
   mais son écriture est ligne à ligne et sans générateur de représentation : le travail de production des
   entités géométriques revient à Fadi dans les deux cas. Recommandation : **écriture directe** pour l'export
   (générateur STEP typé dans `packages/`, testable sans WASM, en-tête `IFC4X3_ADD2` maîtrisé) ; **web-ifc retenu
   pour l'import** (lot 6) et comme **relecture de contrôle** de nos exports en CI (0,44 Mo brotli, `Init()` 36 ms).
   Licence MPL-2.0 admise.
2. **manifold-3d pour les booléens de maillage (hors chemin critique) : utilisable.** 0,16 Mo brotli, 15 ms
   d'initialisation, 0,44 ms par différence mur − ouverture, résultat exact (volume, genre), Apache-2.0. Convient
   aux dérivations (percements, volumes nets, quantités) dans un Web Worker ; la géométrie canonique reste
   paramétrique (D1).
3. **Yjs pour les annotations : non retenu au lot 7, sauf besoin de co-édition de texte en temps réel.** Les
   mesures ne montrent aucun obstacle (51 Ko brotli, 104 Ko pour 1 000 annotations, application 7,5 ms,
   incréments de 40–107 octets), mais rien n'exige un CRDT pour des annotations modifiées par commande réversible ;
   le surcoût de + 27 à 37 % et la seconde source de vérité ne se justifient que pour l'édition simultanée d'un
   même texte (D3).
4. **Taille d'OCCT et budget de démarrage (D6-a).** Le plus léger des candidats (occt-wasm) pèse 4,7 Mo brotli
   (21 Mo brut) pour 0,15–0,24 s d'initialisation ; opencascade.js 9,5 Mo brotli (66 Mo brut), 1,3 s et + 370 Mo
   de mémoire. Face à une ouverture de l'Atelier ≈ 3,2 s, OCCT ne peut être que **chargé à la demande dans un
   Web Worker, après une action explicite**, jamais dans le chemin d'ouverture (D1). occt-wasm a une licence
   admissible mais est publié depuis deux jours (maturité à établir) ; opencascade.js est LGPL, non maintenu
   depuis 2023 et son chargeur exige des rustines en Node 22. Éléments pour l'arbitrage du maître d'ouvrage.
5. **LOD / instanciation (D6-b).** Passer de 1 199 à 24 draw calls ramène le coût CPU de `render()` de 15 ms à
   0,17 ms par trame, le tas JS de 13,8 à 8,0 Mo et la première image de 834 à 528 ms, à triangles constants.
   L'instanciation par classe et par niveau prévue dès le lot 3 est **confirmée comme exigence** (un objet par
   maillage consommerait à lui seul presque tout le budget de 16,7 ms sur un CPU de cette classe). Le niveau de
   détail n'est pas tranché par ce banc (18 204 triangles de boîtes) : à mesurer au lot 3 sur la géométrie
   réelle, par niveau et par distance.

## 11. Non mesuré et pourquoi

- **WebGPU** : `navigator.gpu` absent dans Chromium 141 headless du bac à sable, quels que soient les drapeaux
  (section 3).
- **Trame sur GPU réel, appareil de référence et téléphone Android** : aucun GPU dans le bac à sable ; les temps
  de trame absolus de la section 2 sont ceux d'un rendu logiciel.
- **Mémoire GPU par onglet** (D6) : aucun compteur exposé en rendu logiciel headless.
- **OCCT dans le navigateur** : mesuré en Node seulement (initialisation, booléen) ; le temps de téléchargement
  et de compilation dans Chromium reste à mesurer si le lot optionnel est ouvert.
- **opencascade.js 2.0.0-beta et @bitbybit-dev/occt** : métadonnées npm seulement (taille, licence).
- **web-ifc : écriture de représentations géométriques** : seuls `IfcProject` et `IfcWall` attributaires ont été
  écrits et relus ; la fidélité géométrique sera l'objet du rapport d'échange du lot 6 (T13).
- **Démarrage de l'Atelier actuel** : non remesuré (scénario e2e non relancé) ; référence antérieure citée en
  section 9.

## 12. Reproduction

Voir `scripts/bench/README.md`. Résultats bruts de ce banc (JSON) conservés hors dépôt dans le dossier de travail
(`…/scratchpad/bench/out/`).

## Lots 3a et 3b — nouvel Atelier (recette `apps/web/e2e/atelier-nouveau.mjs`)

Banc : Chromium headless de Playwright, rendu WebGL logiciel (SwiftShader), API construite servant l'application,
PostgreSQL local, compte neuf, exemple P.118 importé (1 753 objets). Trois passages consécutifs ; fourchettes.

| Mesure | Valeur |
| --- | --- |
| Ouverture du nouvel Atelier → plan 2D affiché | 1,1 – 2,2 s |
| Tracer un mur (clic, saisie 4, Entrée) → affiché | 93 – 193 ms |
| Sélection d'un mur au clic → inspecteur | 43 – 62 ms |
| Glisser un mur d'un mètre → enregistré par le serveur | 340 – 390 ms |
| Passage en 3D (chargement de three.js, maillage du P.118) → première image | 1,7 – 2,0 s |
| Orbite P.118 complet : temps CPU de rendu par image | médiane 2,8 – 3,2 ms ; p95 4,5 – 6,5 ms |
| Appels de dessin, P.118 complet | < 400 (tampons groupés par niveau et matériau) |
| Pousser / tirer d'un mur (geste de 10 pas compris) → enregistré | 1,8 – 2,0 s |
| WebGPU | non mesuré : aucun adaptateur dans ce Chromium |

## Lot 6 — échanges (corpus `apps/api/test-corpus/ifc/`, recette `apps/web/e2e/atelier-echanges.mjs`)

Banc : Node 22 (corpus) ; Chromium headless de Playwright et API construite servant l'application (recette).
Deux à trois passages ; fourchettes.

| Mesure | Valeur |
| --- | --- |
| Export IFC du P.118 en mémoire (`exporterIfc`, 1 753 objets) | 200 – 217 ms ; 3,4 Mo |
| Lecture du même fichier par web-ifc 0.0.78 (maillages, étages, conversion) | 0,7 s |
| Lecture + import en représentations + application des 4 lots (Node, sans base) | 1,2 s ; 1 539 représentations |
| Export IFC depuis l'Atelier (serveur, téléchargement, rapport) | 0,9 – 1,1 s |
| Import IFC du P.118 depuis l'Atelier (envoi, lecture, 4 lots en transaction, relecture du modèle) | 3,4 – 3,9 s |
| Validation IfcOpenShell 0.9.0 du P.118 (schéma, règles EXPRESS, échantillon géométrique) | quelques secondes en local ; 0 erreur |
