# P2-0 — Mesures (D-176 à D-178, D-181)

Date : 8 octobre 2026 · Auteur : chef de projet · Scripts : `scripts/bench/` (`occt-browser-bench.mjs` + `occt-browser.html`,
`solveur-bench.mjs`, `three-bench.mjs --variants B,M` + `three-scene.html` variante M) · Statut : mesures publiées ;
aucune valeur n'est un seuil (cahier Atelier §8 : « mesurée, jamais annoncée »).

Toutes les valeurs sont **mesurées** sur le banc déclaré en section 1 ; ce qui n'a pas pu être mesuré est en section 6.

## 1. Banc déclaré

| Élément | Valeur |
| --- | --- |
| Machine | bac à sable Linux (conteneur), `Linux 6.18.44-fc-v80 x64`, Intel(R) Xeon(R) Processor @ 2.80GHz, 4 vCPU, 16095 Mo |
| Node / navigateur | v22.22.0 · chromium 141.0.7390.37 (Playwright 1.56.0, headless) |
| Rendu graphique | logiciel (SwiftShader), mêmes drapeaux qu'au lot 0 (`p0-mesures.md` §1) ; aucun GPU |
| Paquets mesurés (hors dépôt) | occt-wasm 5.6.1 (dossier `BENCH_DIR`, jamais dans le dépôt), three 0.186.1 |
| Cache | froid : nouveau contexte navigateur par cas ; serveur HTTP local ; fichiers non minifiés |

## 2. Chaîne de licence occt-wasm (D-177)

| Élément | Constat |
| --- | --- |
| `package.json` → `license` | `MIT OR Apache-2.0` |
| README, section « License » | « Compiled WASM output: LGPL-2.1-only (inherits from [OCCT](https://dev.opencascade.org/resources/download)) » ; tooling (TypeScript) MIT OR Apache-2.0 |
| Binaire `occt-wasm.wasm` | chaînes « Open CASCADE … (c) Open Cascade » présentes (`strings`) : c'est bien OCCT compilé, donc **LGPL-2.1** pour le `.wasm` |
| Mode de chargement LGPL | le README lui-même : « The LGPL requires that end users can replace the LGPL component. For web applications, this is satisfied by loading the `.wasm` file from a URL (which users can override via `OcctKernel.init({ wasm: '...' })`) » |
| Dépôt source | `git+https://github.com/andymai/occt-wasm.git` |

Conclusion : le champ npm ne porte que sur l'outillage ; le composant exact est LGPL et doit être servi comme fichier
séparé remplaçable, exactement le mode retenu en D-177. Vérification à refaire à chaque montée de version (le README
peut changer). Version 5.5.0 mesurée au lot 0, 5.6.1 publiée le 7 octobre 2026 mesurée ici.

## 3. OCCT dans Chromium (D-177) — `occt-browser-bench.mjs`

### 3.1 Chargement

| Quoi | Fil principal | Web Worker (module écrit dans la page) |
| --- | --- | --- |
| `.wasm` servi | 21177576 octets bruts (4,7 Mo brotli, lot 0) | idem |
| `import` du module TypeScript | 39,6 ms | — |
| `fetch` du `.wasm` (local) | 107,4 ms | 82,9 ms |
| `OcctKernel.init` | **111,1 ms** | **125,8 ms** |
| Tas JS avant / après init | 22,02 → 171,51 Mo (mémoire WASM comptée dans le tas) | — |
| `cut` mur − ouverture (médiane de 5) | 27,7 ms | 18 ms |
| Spawn + fetch + init + 5 `cut` + tessellation + transfert | — | **449,8 ms** au total ; maillage transféré (576 octets) sans copie |

Constat de chargement : l'API `occt-wasm/worker` (Comlink) importe « comlink » par spécificateur nu **dans le Worker** ;
les import maps ne s'appliquent pas aux Workers, donc hors bundler elle ne se charge pas (« Failed to fetch dynamically
imported module … worker.js »). Sous Vite (le bundler de `apps/web`) le spécificateur est résolu : non bloquant, mais
le lot P2-1 écrira son propre Worker (comme ici) plutôt que de dépendre de ce point d'entrée.

### 3.2 Vingt cas de géométrie difficiles (5 répétitions, cache froid par cas, délai 30 s par cas)

| Cas | médiane ms | max ms | faces / solides | volume m³ | attendu | triangles (tessellation) | statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. mur − ouverture (référence lot 0) | 27,7 | 160,8 | 10 / 1 | 1,98 | 1,98 | 32 (43,4 ms) | ✔ |
| 2. faces coplanaires : cube − cube affleurant | 12,3 | 111,4 | 8 / 1 | 0,75 | 0,75 | 20 (33,4 ms) | ✔ |
| 3. cylindres tangents fusionnés | 20,4 | 188,7 | 7 / 2 | 1,57079633 | 1,57079633 | 200 (46,4 ms) | ✔ |
| 4. plaque à 25 trous (cutAll) | 165,6 | 373,4 | 31 / 1 | 0,01858628 | 0,01858628 | 2712 (124,8 ms) | ✔ |
| 5. lame mince 1 mm dans un bloc | 18,3 | 131 | 12 / 2 | 0,999 | 0,999 | 24 (29,6 ms) | ✔ |
| 6. intersection (common) sphère ∩ cube | 34,4 | 211,4 | 7 / 1 | 0,79796455 | — | 510 (65,4 ms) | ✔ |
| 7. cube − sphère tangente à une face | 8,8 | 147,3 | 7 / 1 | 0,9434513299999999 | 0,9434513299999999 | 219 (38,1 ms) | ✔ |
| 8. révolution d'un rectangle décalé (tube, volume 2π·0,5·0,2·1) | 3,1 | 30,1 | 4 / 1 | 0,62831853 | 0,62831853 | 208 (23,6 ms) | ✔ |
| 9. balayage d'un cercle le long d'une ligne coudée | 2,1 | 51,4 | 4 / 1 | 0,00785398 | — | 3998 (61,3 ms) | ✔ |
| 10. lissage carré → cercle (solide) | 7,7 | 62,8 | 7 / 1 | 0,74096929 | — | 208 (44,6 ms) | ✔ |
| 11. congé sur les 12 arêtes d'un cube | 55,5 | 188,8 | 26 / 1 | 0,97558701 | — | 628 (36 ms) | ✔ |
| 12. coque (shell) d'un cube, paroi 20 mm | 23 | 142,5 | 23 / 1 | 0,10253003 | — | 356 (85,9 ms) | ✔ |
| 13. fuseAll de 50 boîtes alignées | 142,6 | 398,7 | 202 / 1 | 6,25 | 6,25 | 404 (110,2 ms) | ✔ |
| 14. cube − cylindre traversant (trou) | 10,9 | 173 | 7 / 1 | 0,87433629 | 0,87433629 | 120 (57,3 ms) | ✔ |
| 15. cube − cube identique (résultat vide) | 8,3 | 85,5 | 0 / 0 | 0 | 0 | 0 (1,6 ms) | ✔ |
| 16. fusion de deux cubes disjoints (compound) | 4,1 | 54,4 | 12 / 2 | 2 | 2 | 24 (35,4 ms) | ✔ |
| 17. cube − cylindre tangent intérieur (arête de contact) | 20,5 | 205,7 | 20 / 4 | 0,21460184 | 0,21460184 | 128 (41,3 ms) | ✔ |
| 18. tore ∩ cube | 17,9 | 167 | 1 / 1 | 0,07895684 | 0,07895684 | 1456 (53,2 ms) | ✔ |
| 19. section plane d'un cube à 45° (plan z = y ; attendu : 4 arêtes, périmètre 2 (1 + √2) = 4,828 m) | 4,6 | 69,7 | 0 / 0 · 4 arêtes, 4,82842712 m | 0 | — | 0 (3,9 ms) | ✔ |
| 20. chaîne : (cube − trou) ∪ cylindre, congé, tessellation | 31,9 | 240,9 | 13 / 1 | 1,01562694 | — | 976 (68,4 ms) | ✔ |

**20 / 20 valides** (`isValid` vrai et volume à 1e-4 m³ de la valeur attendue quand elle est calculable à la
main ; le cas 19, sans volume, est jugé sur sa topologie : 4 arêtes et un périmètre à 1e-4 m de 2 (1 + √2) — la
première version du banc posait les quatre sommets du plan de coupe à z = 0,5, une section horizontale rapportée comme
valide avec un résultat vide ; corrigé à la relecture de la PR #93 et remesuré, seule la ligne 19 change), 0 erreur, 0
délai dépassé. Le « max » est la première exécution (compilation JIT des
fonctions touchées) : la médiane est la valeur de régime. Trois constats à retenir pour P2-1 :

1. `fuse` de deux solides rend un **compound** même quand le résultat est connexe ; `fillet` exige un solide : il faut
   extraire le solide (`getSubShapes(…, 'solid')`) ou appeler `unifySameDomain` avant les opérations suivantes (cas 20).
2. Les faces coplanaires, tangentes (cylindres, sphère sur face, tore) et minces (1 mm) passent toutes ; aucun cas
   n'a bouclé une fois les signatures d'API respectées (`translate(shape, dx, dy, dz)`, `revolve(…, angleRad)`).
3. Un `Vec3` passé sous forme de tableau est accepté sans erreur et produit une forme nulle (déjà vu au lot 0) : la
   couche `geometry-exact` de P2-1 validera ses entrées avant tout appel.

## 4. Solveur de contraintes écrit (D-178) — `solveur-bench.mjs`

Méthode : Gauss-Newton amorti (Levenberg-Marquardt), jacobienne par différences finies, rang par élimination de Gauss (pivot partiel) ; tolérance 5e-06 m (5 µm, comme le solveur 2D) ; pose rigide par pièce
= translation + rotation de Rodrigues (6 inconnues) ; contraintes : coïncidence, distance, parallélisme, angle,
concentricité, plan.

| Cas de référence | pièces | inconnues | équations | rang | itérations | ms | diagnostic |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. deux pièces coïncidentes + parallèles | 2 | 6 | 9 | 6 | 2 | 3,08 | résolu, redondant (compatible) |
| 2. trois pièces empilées | 3 | 12 | 18 | 12 | 2 | 6,36 | résolu, redondant (compatible) |
| 3. pivot (concentrique + plan + angle 30°) | 2 | 6 | 8 | 6 | 7 | 2,27 | résolu, redondant (compatible) |
| 4. glissière (2 parallèles + 2 plans + distance) | 2 | 6 | 9 | 6 | 3 | 0,48 | résolu, redondant (compatible) |
| 5. cinq pièces empilées | 5 | 24 | 36 | 24 | 3 | 7,09 | résolu, redondant (compatible) |
| 6. dix pièces empilées | 10 | 54 | 81 | 54 | 5 | 38,3 | résolu, redondant (compatible) |
| 7. CTA : socle + caisson + ventilateur (pivot) + panneau (glissière) | 4 | 18 | 26 | 18 | 6 | 8,68 | résolu, redondant (compatible) |
| 8. quinze pièces empilées | 15 | 84 | 126 | 84 | 6 | 46,11 | résolu, redondant (compatible) |
| 9. vingt pièces empilées | 20 | 114 | 171 | 114 | 7 | 43,35 | résolu, redondant (compatible) |
| 10. deux pivots en série | 3 | 12 | 16 | 12 | 8 | 0,7 | résolu, redondant (compatible) |
| 11. distance seule (sous-contraint attendu, 5 ddl) | 2 | 6 | 1 | 1 | 2 | 0,02 | résolu, sous-contraint |
| 12. pivot à 90° depuis un départ éloigné | 2 | 6 | 8 | 6 | 8 | 0,15 | résolu, redondant (compatible) |

| Cas dégénéré | attendu | obtenu | ms |
| --- | --- | --- | --- |
| D0. angle 0° écrit en produit scalaire (gradient nul à la solution) : le rang ne le compte pas | résolu, sous-contraint et redondant | résolu, sous-contraint et redondant | 0,08 |
| D1. deux distances incompatibles (1 m et 2 m entre les mêmes points) | sur-contraint incompatible | sur-contraint incompatible | 1,91 |
| D2. coïncidence + distance non nulle des mêmes points | sur-contraint incompatible | sur-contraint incompatible | 1,74 |
| D3. parallèle + angle 90° des mêmes directions | sur-contraint incompatible | sur-contraint incompatible | 7,7 |
| D4. pièce libre (aucune contrainte) : 6 ddl | résolu, sous-contraint | résolu, sous-contraint | 0,01 |
| D5. coïncidence seule : 3 ddl de rotation | résolu, sous-contraint | résolu, sous-contraint | 0,03 |
| D6. parallèle posée deux fois (redondante compatible, sous-contrainte) | résolu, sous-contraint et redondant | résolu, sous-contraint et redondant | 0,01 |

**Critère D-178 : 12 / 12 cas résolus en moins de 100 ms (le banc met désormais la limite dans le verdict de chaque cas et sort en échec si un cas de référence la dépasse — relecture de la PR #93 ; sur cette machine partagée le maximum varie de 46 à 78 ms d'une exécution à l'autre, le cas 6 ou 8 selon le moment), 7 / 7 diagnostics
corrects.** Leçon à inscrire dans le solveur produit : une contrainte d'angle à 0° ou 180° écrite avec le produit
scalaire a un gradient nul à la solution (le rang ne la compte pas, cas D0) ; elle doit être posée comme un
parallélisme (produit vectoriel). Les « redondances compatibles » viennent de ce même parallélisme (3 équations de
rang 2) : attendu, et diagnostiqué comme tel. La jacobienne par différences finies suffit à cette taille ; le solveur
produit l'écrira analytiquement.

## 5. Scène mixte bâtiment + machine + gaines (D-181) — `three-bench.mjs --variants B,M`

Variante B = scène P.118 du lot 0 (instanciée) ; variante M = B + une CTA (231 maillages : caisson, moyeu 48 segments,
24 pales, virole, moteur, panneau, 200 fixations) + 2 gaines (tubes 64 × 40 segments) au niveau 0. Rendu logiciel.

| Mesure | B (bâtiment) | M (mixte) |
| --- | --- | --- |
| Objets / géométries | 1517 / 1 | 1748 / 232 |
| Draw calls / triangles par trame | 24 / 18204 | 255 / 39764 |
| Construction de la scène | 30 ms | 50 ms |
| Première image depuis la navigation | 874 ms | 612 ms |
| Trame p50 / p95 (rendu + readPixels, logiciel) | 160,6 / 262,8 ms | 187,3 / 237,7 ms |
| Sélection (lancer de rayon) p95 | 1 ms | 1,6 ms |
| Tas JS | 8 Mo | 9 Mo |

Mesures reprises après correction de la scène M à la relecture de la PR #93 : la translation `base` du local technique
était appliquée deux fois aux gaines (points de la courbe puis maillage), qui partaient de (12, …, 12) au lieu de se
raccorder à la CTA en (6, …, 6) ; corrigé, les gaines partent du caisson, et les chiffres ci-dessus sont ceux de la
scène corrigée (même nombre d'objets, de draw calls et de triangles ; trame et sélection remesurées).

Lecture : la machine double les triangles et multiplie les draw calls par 10 (maillages fins non instanciés) pour
+ 15 % de temps de trame médian en rendu logiciel (p95 dans le bruit de SwiftShader) ; la sélection coûte 1,5 fois plus. Le coût est dans le nombre de maillages, pas dans les
triangles : P2-2 instanciera les pièces répétées (fixations) par définition, comme le bâtiment l'est par classe.
Comme au lot 0, ces chiffres valent pour SwiftShader ; sur GPU réel ils restent à mesurer (section 6).

## 6. Non mesuré et pourquoi

- GPU réel, appareil de référence, téléphone : hors de portée du bac à sable (comme au lot 0).
- OCCT sur un corpus de pièces réelles (STEP d'un fournisseur) : aucun fichier fourni ; les 20 cas sont synthétiques.
- opencascade.js dans le navigateur : non remesuré (repli seulement, chiffres du lot 0 en Node).
- Solveur sur plus de 20 pièces : non mesuré ; la jacobienne par différences finies est O(n²) et sera remplacée.

## 7. Reproduction

```sh
BENCH=/chemin/hors/depot/bench && mkdir -p "$BENCH" && cd "$BENCH" && npm init -y >/dev/null && npm i occt-wasm@5.6.1 three@0.186.1
cd <racine du dépôt>
BENCH_DIR="$BENCH" node scripts/bench/occt-browser-bench.mjs --repetitions 5 --limite 30000 --out "$BENCH/occt-browser.json"
node scripts/bench/solveur-bench.mjs --out "$BENCH/solveur.json"
BENCH_DIR="$BENCH" node scripts/bench/three-bench.mjs --frames 300 --variants B,M --no-webgpu --out "$BENCH/three-mixte.json"
```
