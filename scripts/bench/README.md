# Banc de mesures du lot 0 (L0.4)

Scripts reproductibles des mesures publiées dans `docs/atelier/p0-mesures.md`. Les paquets mesurés sont
installés **hors du dépôt** (aucune dépendance ajoutée à `package.json`) ; Playwright et Chromium sont ceux du
dépôt (`npm ci`, `PLAYWRIGHT_BROWSERS_PATH`).

## Préparation (hors dépôt)

```sh
BENCH=/chemin/hors/depot/bench            # dossier de travail, jamais dans le dépôt
mkdir -p "$BENCH/out" && cd "$BENCH" && npm init -y >/dev/null
npm i three@0.186.1 web-ifc@0.0.78 manifold-3d@3.5.4 yjs@13.6.33 occt-wasm@5.5.0
# opencascade.js (LGPL, candidat du lot optionnel) : archive seulement, jamais installée
mkdir -p "$BENCH/../occt/ocjs" && cd "$BENCH/../occt" && npm pack opencascade.js@1.1.1 && tar xzf opencascade.js-1.1.1.tgz -C ocjs
```

## Mesures (depuis la racine du dépôt)

```sh
export BENCH_DIR="$BENCH"
# 1–2. three.js WebGL2 (variantes A et B), sonde WebGPU, quotas navigateur (navigator.storage)
node scripts/bench/three-bench.mjs --frames 300 --out "$BENCH/out/three.json"
node scripts/bench/three-bench.mjs --frames 300 --viewport 384x216 --out "$BENCH/out/three-384.json"
node scripts/bench/three-bench.mjs --frames 300 --sync none --out "$BENCH/out/three-nosync.json"
# 3. web-ifc : tailles, initialisation, schémas, écriture IFC4X3 + relecture
node scripts/bench/web-ifc-bench.mjs --out "$BENCH/out/web-ifc.json"
# 4. OCCT WASM : initialisation bornée et booléen (occt-wasm, opencascade.js 1.1.1) ; tailles compressées
OCJS_DIR="$BENCH/../occt/ocjs/package" node --no-warnings scripts/bench/occt-bench.mjs --out "$BENCH/out/occt.json"
node scripts/bench/brotli-size.mjs "$BENCH/node_modules/occt-wasm/dist/occt-wasm.wasm"
node scripts/bench/brotli-size.mjs "$BENCH/../occt/ocjs/package/dist/opencascade.wasm.wasm"
npm view opencascade.js version license dist.unpackedSize dist-tags time.modified
# 5. manifold-3d : booléen mur − ouverture ×100
node scripts/bench/manifold-bench.mjs --out "$BENCH/out/manifold.json"
# 6. Yjs : 1 000 annotations
node --expose-gc scripts/bench/yjs-bench.mjs --out "$BENCH/out/yjs.json"
```

Chaque script imprime un JSON (et l'écrit avec `--out`). `three-scene.html` est la page de scène servie par
`three-bench.mjs` (paramètres d'URL : `variant`, `backend`, `frames`, `picks`, `sync`).

Notes : dans Chromium, `gl.finish()` est un simple `flush` ; la synchronisation de trame se fait par un
`readPixels` 1×1 (`--sync readpixels`, défaut) ; `--sync none` mesure le seul coût CPU de `render()`. Le rendu
headless est logiciel (SwiftShader) : base de comparaison, pas seuil.

## Banc P2-0 (D-177, D-178, D-181) — `docs/atelier/p2-mesures.md`

```sh
cd "$BENCH" && npm i occt-wasm@5.6.1          # hors dépôt, comme ci-dessus
cd <racine du dépôt>
# OCCT dans Chromium : chaîne de licence, init (fil principal et Worker), 20 cas difficiles (un cas par page, délai par cas)
BENCH_DIR="$BENCH" node scripts/bench/occt-browser-bench.mjs --repetitions 5 --limite 30000 --out "$BENCH/out/occt-browser.json"
# Solveur de contraintes écrit (Levenberg-Marquardt) : 12 cas de référence + 7 cas dégénérés
node scripts/bench/solveur-bench.mjs --out "$BENCH/out/solveur.json"
# Scène mixte bâtiment + machine + gaines (variante M) comparée à la scène bâtiment (B)
BENCH_DIR="$BENCH" node scripts/bench/three-bench.mjs --frames 300 --variants B,M --no-webgpu --out "$BENCH/out/three-mixte.json"
```
