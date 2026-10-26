# Recette sur appareils physiques — rendu, GPU et téléphone (lot REND)

Ce que la CI ne peut pas prouver : le runner Linux n'a ni GPU ni téléphone, son Chromium rend en **logiciel**
(SwiftShader). Toutes les mesures de `apps/web/e2e/studio-rend.mjs` faites en CI sont étiquetées « Chromium logiciel (CI) »
et la règle des accélérations (F.1-01, `packages/atelier-model/src/studio/accelerations.ts`) refuse toute accélération GPU
mesurée en rendu logiciel (`appareil-reel-requis`). Cette recette, à jouer par une personne sur des appareils réels,
fournit les mesures manquantes. Elle ne décide rien : elle produit des rapports, que la règle juge.

Identifiants couverts : REC-C-02 (profils GPU séparés des mesures logicielles), TR-EX-056 (WebGPU optionnel, repli),
TR-EX-059 (fil principal pendant un calcul lourd), TR-EX-098 (gain p95 et équivalence), TR-EX-052 et C.1-01 (mesure
spatiale sur l'appareil désigné, DEC-13), TEST-025 (latence GPU réelle).

## 1. Appareils et relevé obligatoire

Au minimum deux appareils, chacun relevé avant toute mesure :

| Appareil | À relever |
|---|---|
| Ordinateur de bureau ou portable avec GPU (intégré ou dédié) | modèle, système, version de Chrome ou Chromium, `chrome://gpu` (moteur WebGL, état WebGPU), mémoire |
| Téléphone Android récent (Chrome) | modèle, version d'Android et de Chrome, moteur WebGL (relevé par la recette) |

Une mesure dont le moteur WebGL contient `SwiftShader`, `llvmpipe` ou `Software` est **une mesure logicielle** : elle ne
vaut pas pour cette recette (la recette l'étiquette d'elle-même, champ `etiquette` du rapport).

## 2. Préparer l'instance

1. Une instance Fadi joignable depuis l'appareil (poste local : `npm ci`, `npm run db:migrate`, `npm run build`, puis
   l'API avec `WEB_DIST=apps/web/dist`, comme la CI ; ou l'instance de recette du maître d'ouvrage).
2. Le commit mesuré : `git rev-parse HEAD` (à reporter dans le compte rendu ; `COMMIT=…` s'il n'y a pas de dépôt).

## 3. Ordinateur avec GPU

```sh
HEADED=1 BASE_URL=http://localhost:3001 OUT=atelier-captures/appareil-<nom> COMMIT=<sha> \
  node apps/web/e2e/studio-rend.mjs
```

- Le navigateur s'ouvre (GPU de la machine, `--ignore-gpu-blocklist`, `--enable-unsafe-webgpu`). Ne pas utiliser la machine
  pendant la recette (environ 5 à 10 minutes ; `TAILLES=100,10000` pour une passe courte).
- Contrôler dans `rend-rapport.json` : `moteurWebgl` est le GPU attendu, `etiquette` commence par « Appareil réel ».
- Jouer ensuite TEST-025 sur le même appareil (latence GPU réelle) : `CHROMIUM_PATH=<Chrome installé> BASE_URL=… OUT=…
  node apps/web/e2e/studio-rendu.mjs` ; son rapport Markdown nomme le moteur WebGL employé (ligne « GPU »), à reporter.

## 4. Téléphone Android

1. Activer le débogage USB, relier le téléphone, ouvrir Chrome sur le téléphone.
2. `adb forward tcp:9222 localabstract:chrome_devtools_remote`
3. L'instance doit être joignable depuis le téléphone (`BASE_URL` = adresse du poste sur le réseau local, ou
   `adb reverse tcp:3001 tcp:3001` et `BASE_URL=http://localhost:3001`).
4. `CDP_URL=http://localhost:9222 BASE_URL=… OUT=atelier-captures/telephone-<modele> COMMIT=<sha> TAILLES=100,10000 node apps/web/e2e/studio-rend.mjs`
5. Écran allumé, téléphone sur secteur, aucune autre application ouverte.

## 5. Ce qu'il faut rapporter (par appareil)

Le dossier `OUT` complet (`rend-rapport.json` et `.md`, `mesure-recherches-spatiales.json` et `.md`,
`rapport-acceleration-canvas.json`, `rapport-acceleration-index.json`), plus :

| Identifiant | Valeur à reporter (fichier, champ) | Lecture |
|---|---|---|
| REC-C-02 | `rend-rapport.json` : `moteurWebgl`, `etiquette` | profil GPU réel, séparé des mesures logicielles de la CI |
| TR-EX-056 | `resultats.repliWebgpu` (`navigateur.adaptateur`, `raison`) et `resultats.renduALaDemande` | avec un adaptateur WebGPU, la raison attendue est `regle-f101` (WebGPU non qualifié) ; aucune trame au repos |
| TR-EX-059 | `resultats.isolationCalcul.worker.trameMaxMs` contre `filPrincipal.tacheLongueMs` | la trame la plus longue pendant la lecture dans le Worker reste bien en deçà de la tâche longue de la même lecture sur le fil principal |
| TR-EX-098 | `rapport-acceleration-index.json` et `rapport-acceleration-canvas.json` : `verdict` | verdict de la règle (gain p95 ET équivalence) sur l'appareil |
| TR-EX-052, C.1-01 | `mesure-recherches-spatiales.md` : tableaux « Mesures » et « Cible DEC-13 » | p75 de chaque recherche face à INP ≤ 200 ms (DEC-13), sur l'appareil désigné |
| C.1-02 | `mesure-recherches-spatiales.md` : « Choix de l'index » | le seuil DEC-09 (1 000 éléments) est-il cohérent sur cet appareil ? |

## 6. Après la recette

- Une accélération GPU (WebGPU de la vue 3D) ne s'active que si un rapport `studio-rapport-acceleration/1` mesuré sur
  appareil réel la qualifie **et** qu'il est ajouté, avec sa provenance (appareil, commit, date), à
  `STUDIO_RAPPORTS_ACCELERATION` ; le test « moteur par défaut » (`accelerations.test.ts`) refuse tout changement de
  moteur par défaut sans ce rapport.
- Les mesures sont jointes au compte rendu du lot, avec l'appareil et le commit ; aucune valeur n'est recopiée à la main
  dans le code.
