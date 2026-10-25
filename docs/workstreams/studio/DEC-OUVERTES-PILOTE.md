# Studio — décisions DEC ouvertes et recommandations pour le pilote

Préparé le 25 octobre 2026 sur `main@3e992b6`, pour arbitrage du maître d'ouvrage (canal [#166](https://github.com/RachEma-ux/Fadi/issues/166)).
> **Mise à jour du 25 octobre 2026** : sous la délégation totale du maître d'ouvrage, ces recommandations sont devenues des décisions, consignées dans [ADR-STUDIO-PILOTE-01](../../continuity/decisions/ADR-STUDIO-PILOTE-01.md). Le registre est mis à jour en conséquence.

**À sa rédaction, ce document recommandait sans rien décider.** Il ne change aucun statut du registre `task-register.json` : DEC-01 à DEC-18
restent « En cours » tant que le maître d'ouvrage n'a pas tranché, avec les preuves que chaque DEC exige.

Sources : registre `task-register.json` (630 obligations) ; dossier des options
`docs/ai-team/reports/mission-004/A1/studio-18-decisions-v2.json` ; décisions déléguées
`docs/ai-team/CODEX-DELEGATED-DECISIONS.md` (D01–D07) ; acte G0
`docs/ai-team/reports/reprise-496dcfc/A1/G0-ACTE-ACCEPTATION-DOCUMENTAIRE.json` ; code de `main`.

## 1. Compteurs contrôlés

Recalcul direct du registre au 25 octobre : **47 Vérifié, 2 Accepté (49/630), 209 Bloqué, 292 En cours, 58 À faire,
22 À définir**. Les chiffres du checkpoint du 21 octobre sont exacts et n'ont pas bougé.

## 2. Deux corrections à l'analyse précédente

1. **Le premier usage pilote est déjà choisi.** CAD-DEC-01 est « Accepté » (G0, décision déléguée
   [#166/6250109830](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250109830), D01) : c'est une petite
   étude synthétique local/pavillon en trois parcours. **A** : 2D autonome jusqu'à la publication. **B** : 3D directe
   jusqu'à vue et coupe. **C** : objets associés jusqu'à revue et publication. Il n'y a pas d'usage à choisir. Il reste à
   lever ce qui bloque ces trois parcours.
2. **Trois DEC ont déjà une orientation, mais aucune n'est arbitrée.** DEC-03 a une orientation : hiérarchie Projet → Étude → Variante → Révision, entités propres, révision immuable
   ([#166/6250110501](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250110501)). DEC-01 a une orientation
   rapprochée dans les revues A2, et DEC-15 a un report acquis par D02 (IA externe, MCP et extensions reportés du MVP).
   Une orientation n'est pas un arbitrage : le dossier des 18 décisions l'indique (« arbitrage non adopté par simple
   dossier »).

## 3. Les 18 décisions, ce que le code fait déjà, recommandation

Les « Options » reprennent mot pour mot le dossier `studio-18-decisions-v2.json`. La colonne « Code actuel » rapporte
des faits relevés dans le code de `main`. Elle ne vaut pas preuve de recette : c'est l'entrée du POC indiqué.

| DEC | Question | Options du dossier | Code actuel (`main`) | Recommandation | Parcours |
|---|---|---|---|---|---|
| **DEC-01** | Modèle physique du dessin 2D autonome et stockage | 1. Adapter le document existant en autorité 2D indépendante · 2. Nouveau document 2D pur + adaptateur Atelier | Document `studio-document/1` (`packages/atelier-model/src/studio/document-2d.ts`), stocké en `jsonb` dans `studio_revisions.document`, sans 3D requise | **Option 1** : le document existe et ne demande aucune 3D. Le POC-2D doit prouver création sans 3D → sauvegarde → reprise → migration | A |
| **DEC-02** | Associations et références topologiques 2D/3D | 1. Objet sémantique unique + mapping topologique prouvé · 2. Référence liée ou copie indépendante explicite si l'association n'est pas démontrable | Extrusion d'un profil 2D (`vue3d/extrusion.ts`), désignation par identifiant (`picking.ts`) | **Option 1, avec repli 2** : identité unique quand le rattachement est prouvé, sinon statut « à résoudre » explicite (TEST-007). Jamais d'approximation silencieuse | C |
| **DEC-03** | Étude / Variante / Révision, migration des projets | 1. Entités propres + révisions communes adaptées · 2. Couche d'étude sur l'existant | Tables `studio_studies`, `studio_variants`, `studio_revisions` (révisions en ajout seul, filiation des variantes dérivées) | **Option 1** : c'est l'orientation 6250110501, et le schéma la réalise. Arbitrer en l'état et faire tourner le POC-CONTEXTE | A, B, C |
| **DEC-04** | Profils standard, métier, personnels, équipe | 1. Profils standard/métier/personnel liés au compte · 2. Même socle + profil d'équipe versionné reporté | `studio_tool_preferences` par compte, profils métier dans `planche2d/profils.ts`, rien de partagé | **Option 2** : le socle par compte suffit au pilote ; profil d'équipe reporté explicitement | — |
| **DEC-05** | Manifests Registry | 1. Manifeste statique validé au build · 2. Catalogue servi par l'API + cache hors ligne | Manifeste versionné `STUDIO_MANIFESTE_OUTILS` (`manifeste-outils.ts`) et test | **Option 1** pour le pilote : le registre n'exécute rien et reste lisible hors ligne | — |
| **DEC-06** | API et limites du Tool Manager | 1. Orchestrateur central · 2. Adaptateurs par famille derrière une API commune | Catalogue unique (`planche2d/catalogue.ts`) qui lit le registre sans le recopier | **Option 2** : chaque famille garde sa validation, et le gestionnaire ne recalcule rien | — |
| **DEC-07** | Chunks, préchargement, cache | 1. Chunks par famille + cache de profil · 2. Découpage plus fin seulement sur mesure | Carte des morceaux et mesures (`chargement/carte-morceaux.ts`, `perf.ts`), Vue 3D chargée à la demande | **Option 1**, à confirmer par les mesures à froid et à chaud du POC-CHARGEMENT | — |
| **DEC-08** | Renderer 2D et seuil de bascule | 1. SVG/React sous oracle, optimiser après mesure · 2. Canvas/GPU si le gain est démontré | Rendu SVG (`planche2d/rendus/`), sans Canvas | **Option 1** : aucune bascule sans mesure. Le seuil reste « non évalué » tant que DEC-13 n'a pas fixé les budgets | A |
| **DEC-09** | Index spatial et snapping | 1. Balayage simple + index mesuré selon la densité · 2. R-tree/quadtree selon le corpus | Grille uniforme, seuil mesuré à 1 000 éléments (banc C.1), résultat identique au parcours linéaire (test de propriété) | **Option 1** : le mécanisme est en place et mesuré. Il reste à le rejouer sur le corpus autorisé (POC-INDEX) | A |
| **DEC-10** | Invalidation partielle de la scène 3D | 1. Invalidation conservatrice + reconstruction complète en repli · 2. Lots incrémentaux | Scène incrémentale par signature, lots stables avec table de désignation (`vue3d/scene-rendu.ts`) | **Option 1 pour l'arbitrage, garder le code de l'option 2** : le repli complet reste disponible, et les lots ne sont acceptés que si les tests de picking et d'hôtes passent | B |
| **DEC-11** | Workers, mémoire, OCCT | 1. Worker exact persistant mutualisé · 2. Service serveur ciblé | Hôte de Worker paresseux avec délai, annulation et renvoi (`workers/hote-worker.ts`) ; OCCT séparé (LGPL, D-177) | **Option 1** pour le pilote ; l'option 2 attend une comparaison droits/coûts/latence | B |
| **DEC-12** | Historique et undo/redo | 1. Historique hybride adapté de l'existant · 2. Nouvelle coordination entre sous-modèles | `studio/history.ts`, révisions immuables, contrôle de concurrence (`concurrence.ts`) | **Option 1** : une annulation reste locale et ne réécrit jamais une révision ni une publication | A, C |
| **DEC-13** | Appareils et budgets de performance | 1. Profil pilote bureau + mobile réels, seuils après mesure · 2. Profils multiples | Bancs Node seulement, aucun appareil réel attesté | **Option 1**, mais elle exige une décision humaine : quels appareils réels. Aucun seuil n'est inventé, et SwiftShader ne vaut pas un GPU | A, B |
| **DEC-14** | Outils hors ligne | 1. Profil pré-téléchargé + file locale versionnée · 2. Socle restreint, le reste déclaré indisponible | File locale versionnée avec migration déclarée (`hors-ligne/contrats.ts`) | **Option 2** pour le pilote : un outil absent du cache est affiché indisponible, et la file existante est gardée | — |
| **DEC-15** | Extensions et adaptateur MCP | 1. Exclure du pilote, garder l'option visible · 2. Adaptateur borné | Report acquis (D02) | **Option 1** : arbitrer simplement le report déjà acquis, ce qui retire F du chemin critique | — |
| **DEC-16** | Manifeste de publication multi-sources | 1. Étendre la publication existante en manifeste immuable · 2. Service de publication partagé | Manifeste figé, empreinte, refus 409 `manifest_mismatch`, approbation et diffusion distinctes (`studio-publications.ts`) | **Option 1** : le mécanisme existe. Le POC-PUBLICATION doit prouver que l'approbation couvre les fichiers réels | A, C |
| **DEC-17** | Qualité adaptative | 1. Qualité fixe tant que les budgets sont tenus · 2. Réduction mesurée des effets | Aucune qualité adaptative | **Option 1** : aucune concession graphique dans le pilote | — |
| **DEC-18** | Réutilisation des moteurs Fadi | 1. Réutiliser par interfaces publiques · 2. Remplacer seulement un composant non conforme, sur preuve | Studio réutilise `@parcours/atelier-model` et les conventions du noyau exact, sans en dépendre (ADR-STUDIO-NAV-01) | **Option 1**, à confirmer sous-ensemble par sous-ensemble (licences comprises) | A, B, C |

## 4. Ordre proposé pour débloquer les parcours A, B et C

1. **Nommer les personnes** : RESP-01 à 05 et CAD-DEC-02/03. Aucun nom n'est inventé ici. C'est la seule étape que
   personne d'autre que le maître d'ouvrage ne peut remplir.
2. **Arbitrer d'abord les DEC du parcours A**, celles dont le code existe déjà : DEC-03, DEC-01, DEC-16, DEC-12,
   DEC-08, DEC-09. Arbitrer en même temps le report DEC-15, qui ne coûte rien.
3. **Fixer DEC-13** : la liste des appareils réels de recette. Sans elle, aucun budget ni seuil ne peut être accepté.
4. **Autoriser les POC** POC-CONTEXTE, POC-2D et POC-PUBLICATION, puis jouer NAV-001 à 009 et TEST-001 en préproduction,
   et consigner les preuves au registre.
5. Ensuite, parcours B (DEC-10, DEC-11) et parcours C (DEC-02). DEC-04, 05, 06, 07, 14, 17 et 18 peuvent être arbitrées
   en bloc selon les recommandations ci-dessus, car elles ne bloquent aucun des trois parcours.

## 5. Ce qui reste inconnu

- Les personnes habilitées et leur disponibilité (CAD-DEC-03) ; les appareils de recette (DEC-13) ; le corpus intégral
  autorisé (famille X).
- Aucune des recommandations ci-dessus n'a été vérifiée par un POC. Les constats sur le code sont une lecture, pas une
  recette.
