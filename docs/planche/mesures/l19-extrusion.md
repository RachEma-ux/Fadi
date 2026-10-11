# Mesures de la famille d'extrusion — lot L19 (cahier V1 EX-PERF-01)

**11 octobre 2026, D-221.** Script : `packages/planche-model/src/mesures-l19.test.ts`
(`MESURES=1 npx vitest run src/mesures-l19.test.ts`). Il est hors de la suite ordinaire, parce que les durées dépendent
de la machine.

## Conditions

| Élément | Valeur |
| --- | --- |
| Machine de bureau de référence | conteneur d'exécution du projet, Intel Xeon 2,8 GHz, 4 cœurs, Node.js 22.22.0 |
| Périmètre | noyau seul (`@parcours/planche-model`) : ni rendu WebGL, ni réseau, ni navigateur |
| Échantillons | 30 interactions par scénario (60 pour l'option), après 3 échauffements ; 5 seulement pour le scénario de 10 000 triangles (≈ 100 s chacun) |
| Scène | modèle vide, sauf la source mesurée : la scène de 50 000 faces du cahier n'a pas été construite, et les durées ci-dessous sont des minorants |
| Téléphone réel | **non mesuré** : aucun appareil Android n'est accessible depuis l'environnement d'exécution |

## Résultats (ms)

| Scénario | p50 | p95 | max | Budget bureau (p95) | Tenu ? |
| --- | ---: | ---: | ---: | ---: | --- |
| Changement d'option de Pousser/Tirer (configurer + vue) | 0,01 | 0,05 | 0,23 | 100 | oui |
| Extrusion d'une face de 100 sommets (modèle candidat = aperçu) | 50,8 | 74,5 | 88,7 | 50 | **non** |
| Application de la même extrusion (opération + delta + empreinte) | 46,6 | 58,1 | 67,2 | 1 000 | oui |
| Révolution 4 sommets × 48 segments (≈ 400 triangles) | 147,8 | 198,8 | 202,2 | 200 | à la limite |
| Révolution 26 sommets × 192 segments (≈ 10 000 triangles) | 101 754 | 116 442 | 116 442 | 200 (aperçu) / 1 000 (application) | **non** (×500) |

Sondes complémentaires de la révolution, une mesure chacune :

| Triangles | Durée |
| ---: | ---: |
| 768 | 0,6 s |
| 1 152 | 1,3 s |
| 1 920 | 3,3 s |
| 2 304 | 4,6 s |
| 4 608 | 20,1 s |

## Lecture

- Le coût du balayage croît **à peu près comme le carré** du nombre de triangles produits. L'insertion collante compare
  chaque nouvelle arête aux arêtes déjà posées. Les budgets de balayage du cahier ne sont pas tenus au-delà de quelques
  centaines de triangles.
- L'aperçu d'une extrusion simple de 100 sommets dépasse de 50 % son budget de bureau (74 ms au p95 pour 50 ms visés).
- Conséquence immédiate (EX-PERF-02) : le **plafond de complexité** est fixé à **2 000 triangles** au lieu des 200 000
  proposés. Au-delà, l'opération est refusée par `EX_COMPLEXITY_LIMIT`, sans géométrie partielle et sans gel prolongé
  (≈ 3 à 4 s au pire ici). Le plafond reste réglable par opération.
- Suite recommandée, à engager sur décision : optimiser l'insertion des balayages (index spatial des arêtes, ou
  insertion par anneau sans recherche globale) et mesurer de nouveau, puis relever le plafond. Faire aussi tourner les
  longues opérations hors du fil principal (travailleur), comme le cahier le prévoit si la mesure le montre — ce qui est
  le cas.
- Les mesures sur un **téléphone réel**, de préférence le Galaxy S23 Ultra du maître d'ouvrage, ou un équivalent
  déclaré, restent à faire. Le cahier précise que l'émulation ne suffit pas. Sans elles, I-10 reste ouvert.
