# Matrice d'acceptation — famille d'extrusion native de la Planche (cahier V1, § 15)

**Établie au lot L19 (D-221), 11 octobre 2026.** Contrat : « Fadi Planche — Extrusion Implementation Specification V1 »
(retenu par D-202). Chaque ligne nomme le cas, la preuve (test Vitest ou recette Playwright du dépôt), le lot qui l'a
livrée et son état. Le commit testé est celui de la branche du lot L19 et de la CI de sa PR.

États :
- **vert** : preuve automatique présente et verte ;
- **partiel** : comportement livré, mais la preuve ne couvre pas tout le scénario du cahier ;
- **ouvert** : non livré ou non prouvé.

## Verdict

**La famille d'extrusion n'est pas déclarée complète.** Le cahier ne permet de la déclarer complète qu'au lot L19 et
seulement si tous les cas requis sont verts. Ce n'est pas le cas :

- **P-05, P-06, P-07** (Étirement à plis) sont verts depuis le lot **L20** (D-222).
- **I-10** : les mesures sur un vrai téléphone Android n'ont pas pu être faites, faute d'appareil dans l'environnement
  d'exécution. Les mesures de bureau (noyau) sont consignées, et les budgets de balayage n'y sont pas tenus
  (`docs/planche/mesures/l19-extrusion.md`) : environ 100 s pour 10 000 triangles. Le plafond de complexité est donc
  ramené à 2 000 triangles.
- Quelques cas sont **partiels** : ils sont listés ci-dessous, avec ce qui manque.

## 15.1 Contrôles, clavier, état

| Cas | Preuve | Lot | État |
| --- | --- | --- | --- |
| A-01 | `planche-barre-outils.mjs`, `planche-outils.mjs` (outils de Volumes dans la barre et le rail) | L8, L9 | vert |
| A-02 | `pousser-tirer.test.ts` (options incompatibles indisponibles) | L8 | vert |
| A-03 | `pousser-tirer.test.ts`, `planche-pousser-modes.mjs` (même option par bouton, touche, toucher) | L8, L9 | vert |
| A-04 | `modificateurs.test.ts`, `planche-clavier.mjs` (Maj + F active Suivez-moi sans bascule) | L9 | vert |
| A-05 | `modificateurs.test.ts` (Maj + chiffre, clavier français) | L9 | vert |
| A-06 | `modificateurs.test.ts`, `planche-clavier.mjs` (Ctrl + Z, Ctrl + Maj + Z, Maj + Tab, AltGr) | L9 | vert |
| A-07 | `planche-clavier.mjs` (une halte, flèches, aucun verrou d'axe) | L9 | vert |
| A-08 | `planche-clavier.mjs` (Maj + flèche sur la poignée) | L9 | vert |
| A-09 | `planche-lots-4-6.mjs`, `planche-boutons.mjs` (téléphone 390 px) — sans clavier virtuel réel | L8 | partiel |
| A-10 | `pousser-tirer-l10a.test.ts`, `planche-pousser-l10a.mjs` | L10a | vert |
| A-11 | `planche-pousser-l10a.mjs` (aperçu périmé annoncé) | L10a | vert |
| A-12 | correction par recette (`pousser-tirer-l10a.test.ts`, `revolution-outil.test.ts`) ; contrôle de compatibilité à la répétition non couvert | L10a, L10d | partiel |

## 15.2 Pousser/Tirer et opérations Fadi

| Cas | Preuve | Lot | État |
| --- | --- | --- | --- |
| P-01, P-02, P-03 | `fixtures-extrusion.test.ts` | L8 | vert |
| P-04 | `pousser-tirer-l10a.test.ts`, `planche-pousser-l10a.mjs` | L10a | vert |
| P-05, P-06, P-07 | `etirement-plis-l20.test.ts` (tronc de pyramide, voisine concave percée, voisine percée, refus du recoupement), `etirer-face.test.ts`, `planche-etirement-plis.mjs` | L20 | vert |
| P-08 | `fixtures-extrusion.test.ts`, `integration-l19.test.ts` (Surface ouverte : aucun volume, export non étanche) | L8, L19 | vert |
| P-09 | `pousser-tirer-l10a.test.ts`, `planche-pousser-l10a.mjs` | L10a | vert |
| P-10, P-11, P-12 | `fixtures-extrusion.test.ts`, `liens-l10b.test.ts` | L8, L10b | vert |
| P-13 | `pousser-tirer-l10a.test.ts` (refus nommé des segments) | L10a | vert |
| P-14, P-15 | `fixtures-extrusion.test.ts` | L8 | vert |
| P-16, P-17 | `pousser-tirer-l10a.test.ts`, `planche-pousser-l10a.mjs`, `integration-l19.test.ts` (code `EX_DISTANCE_INVALID`) | L10a, L19 | vert |

## 15.3 Suivez-moi et Révolution

| Cas | Preuve | Lot | État |
| --- | --- | --- | --- |
| F-01 | `suivez-moi.test.ts`, `planche-suivez-moi.mjs` | L10c | vert |
| F-02 | chemin construit arête par arête, retrait de la dernière, inversion : non livré (chemin présélectionné ou face) | — | **ouvert** |
| F-03 | `suivez-moi.test.ts` (chaîne ramifiée ou discontinue refusée : `EX_PATH_BRANCH`, `EX_PATH_DISCONNECTED`) | L10c, L19 | partiel |
| F-04 à F-08 | `suivez-moi-l10c.test.ts`, `planche-suivez-moi.mjs` | L10c | vert |
| R-01 à R-04 | `revolution-l10d.test.ts`, `revolution-outil.test.ts`, `planche-revolution.mjs` | L10d | vert |

## 15.4 Texte, liens, intégration

| Cas | Preuve | Lot | État |
| --- | --- | --- | --- |
| T-01, T-03 | `texte-3d-l16.test.ts`, `planche-texte-3d.mjs` | L16 | vert |
| T-02 | `planche-lots-4-6.mjs` (CA-T3D) — les quatre combinaisons plein / profondeur ne sont pas toutes vérifiées | lot 5, L16 | partiel |
| T-04 | caractères ignorés annoncés (`texte-3d.ts`) ; pose dans le groupe actif sans recette dédiée | L16 | partiel |
| L-01 à L-06 | `liens-l10b.test.ts`, `planche-liens.mjs`, `fixtures-extrusion.test.ts` | L10b | vert |
| I-01, I-02 | `integration-l19.test.ts` (contextes translaté, tourné, à l'échelle, en miroir ; échelle non uniforme refusée par `EX_CONTEXT_TRANSFORM_UNSUPPORTED`) | L19 | vert |
| I-03 | matières et objets voisins préservés (suites des lots 8 à 10) ; lissage et balises sans test dédié | L8–L10 | partiel |
| I-04 | `integration-l19.test.ts` (application, correction, annulation, relecture : empreintes égales) ; `atelier-planches.test.ts` | L7, L19 | vert |
| I-05, I-06 | `atelier-planches.test.ts` (idempotence, 409, delta forgé non fini ou pendant, non-membre) ; rejeu hors ligne prouvé par les recettes de l'Atelier, pas par une recette Planche dédiée | L7, L19 | partiel |
| I-07 | `integration-l19.test.ts` (solide étanche avec volume ; surface ouverte déclarée non étanche, sans volume), `atelier-planches.test.ts` (IFC relu) | L7, L19 | vert |
| I-08 | `interface-anglais.mjs`, `planche-detachee-documents.mjs`, `planche-clavier.mjs` ; aucun essai au lecteur d'écran | — | partiel |
| I-09 | `planche-pousser-l10a.mjs`, `suivez-moi.test.ts` (aperçu sur modèle candidat, jamais écrit) | L10a, L10c | vert |
| I-10 | `mesures-l19.test.ts` (bureau, noyau) ; plafond refusé sans géométrie partielle (`integration-l19.test.ts`) ; **aucune mesure sur téléphone réel** | L19 | **ouvert** |

## Pour clore la famille

1. ~~Lot L20 : P-05 à P-07~~ — fait (D-222).
2. Mesures sur un téléphone Android réel, de préférence le Galaxy S23 Ultra du maître d'ouvrage, ou un équivalent
   déclaré : le scénario de `mesures-l19.test.ts`, joué dans le navigateur. Seul le maître d'ouvrage peut les fournir.
3. Optimisation du balayage, une fois les mesures faites (EX-PERF-01 : mesurer avant d'optimiser). L'insertion des
   anneaux croît plus vite que linéairement.
4. Compléter les preuves des cas partiels : F-02 (chemin construit au clic), T-02, T-04, I-03, I-05, I-08 et A-12.
