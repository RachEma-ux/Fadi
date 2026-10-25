# Recette du pilote Studio — 25 octobre 2026

Code recetté : `main@3e992b66a0e7b03d4bcdd4d7e49b4af65b333a30`. Décisions appliquées :
[ADR-STUDIO-PILOTE-01](../../../continuity/decisions/ADR-STUDIO-PILOTE-01.md).
Preuve durable : CI de `main` sur ce commit, [exécution 40192137528](https://github.com/RachEma-ux/Fadi/actions/runs/40192137528),
**verte**. Les recettes Studio tournent dans le job
[e2e (parcours)](https://github.com/RachEma-ux/Fadi/actions/runs/40192137528/job/121165189052) ; les tests unitaires
dans [validate](https://github.com/RachEma-ux/Fadi/actions/runs/40192137528/job/121165188997).

## Exécution locale (préproduction jetable)

Montage identique au job e2e de la CI :
- PostgreSQL 16 avec PostGIS 3, base jetable `fadi_e2e`, `npm run db:migrate` ;
- API en mode production servant le build (même origine, port 3001) et Mailpit 1.20.4 ;
- mêmes variables que `.github/workflows/ci.yml`, clés d'archive et de chiffrement tirées au hasard, jamais écrites.

Écart déclaré : le Playwright du dépôt (1.56) a été lancé avec le Chromium headless 1243 de la machine, pas son
navigateur 1194. Le rendu est logiciel, et aucun appareil physique n'a été utilisé.

| Recette (ordre de la CI) | Contrôles réussis | Échecs |
|---|---:|---:|
| `studio-persistance` | 293 | 0 |
| `studio-navigation` | 259 | 0 |
| `studio-exemple-p118` | 53 | 0 |
| `studio-domaines` | 71 | 0 |
| `studio-espace` | 44 | 0 |
| `studio-publication` | 129 | 0 |
| `studio-observations` | 71 | 0 |
| `studio-profils` | 30 | 0 |
| `studio-catalogue` | 36 | 0 |
| `studio-hors-ligne` | 35 | 0 |
| `studio-corpus-s6` | 57 | 0 |
| `studio-corpus-s7` | 11 | 0 |
| `studio-conflits` | 27 | 0 |
| `studio-chargement` (étape 8 NAV-008 ajoutée ensuite : 41 contrôles, 0 échec) | 35 | 0 |
| `studio-mesures-chargement` | mesure seule, sans verdict | 0 |
| `studio-accessibilite` | 49 | 0 |
| `studio-quantites` | 29 | 0 |
| `studio-dossier` | 55 | 0 |
| `studio-echanges` | 34 | 0 |
| `temps-reel-studio` | 26 | 0 |
| `studio-restauration` (avec `studio-compare-lib.test.mjs`) | 91 | 0 |
| **Total** | **1 435** | **0** |

## Rapprochement avec le registre

Une obligation passe à « Vérifié » seulement si une assertion exécutée contrôle son critère exact. Le libellé et le
fichier de chaque assertion sont dans la preuve de l'ID, au registre.

- **Vérifié — navigation** : NAV-001 à NAV-007 et NAV-009. NAV-005 et NAV-007 sont contrôlés par `studio-domaines`,
  les autres par `studio-navigation`. Pour NAV-009, la non-régression s'appuie aussi sur les cinq tranches e2e vertes de
  la CI.
- **Vérifié — NAV-008**, après complément. Une nouvelle étape de `studio-chargement` (étape 8) provoque la panne :
  - les fichiers du moteur de la planche sont refusés par le réseau ;
  - l'alerte « Réessayer » s'affiche, rien n'est écrit, et la barre de Fadi mène à l'Accueil ;
  - une fois le réseau rétabli, « Réessayer » rend la planche.

  Cette étape a révélé un défaut : après une panne, Chromium garde l'import de module raté et « Réessayer » ne relançait
  aucune requête. Correctif : `reessayerPlanche` recharge le document si le nouvel essai échoue encore
  (`chargement/DemarrageStudio.tsx`, tests dans `ouverture.test.ts`).
- **Vérifié — scénarios TEST** :

  | Scénarios | Recette ou test |
  |---|---|
  | TEST-001, TEST-009 | `studio-dossier` |
  | TEST-013 | `studio-conflits` |
  | TEST-020 | `studio-chargement` |
  | TEST-029 | `studio-observations` |
  | TEST-030, TEST-031, TEST-038 | `studio-publication` |
  | TEST-034 | `studio-restauration` |
  | TEST-004, TEST-008, TEST-017, TEST-019, TEST-023, TEST-026 | Tests automatisés du modèle, de l'API et de l'interface, exécutés en CI |

- **Vérifié — recette** : REC-A-03 (3,180 m³ dans `studio-dossier`, puis 3,096 m³ dans `studio-navigation`) et
  REC-C-03 (DEC-08). REC-I-02 (résultats NAV-001 à 009) est vérifié avec NAV-008.
- **Bloqué — livraison** : les 9 obligations R de bascule et de déploiement (R.2-01, R.3-01, R.3-02, R.4-01 à 03,
  R.5-01, R.5-03, R.5-04) attendent, dans l'ordre :
  - la recette utilisateur du maître d'ouvrage ([guide](RECETTE-UTILISATEUR-PILOTE.md)) ;
  - la porte G4 ;
  - sa Release.
- **En cours, preuve partielle** : TEST-002, 003, 005, 006, 007, 010, 011, 012, 014, 015, 016, 018, 021, 022, 024, 027,
  028, 035, 036. Ce qui manque est consigné dans la `suite` de chaque ID.
- **À faire, aucun test** : TEST-025 (comparaison SVG / Canvas / GPU), TEST-037 (50 cycles et courbe mémoire).
- **Décidés, hors pilote** : F.3-01 (instruit par DEC-15) et F.2-03 (aucun mode IA retenu) sont acceptés par P-06.
  TEST-032 et TEST-033 restent bloqués : ils recettent des fonctions absentes (illustration IA, adaptateur MCP).

## Limites

- Ces recettes sont automatisées : elles ne remplacent pas une recette utilisateur sur appareil réel. Les appareils
  physiques et le GPU réel restent « non évalués » (DEC-13).
- `studio-visualisation.mjs` et `studio-exigences.mjs` ne sont pas jouées en CI et ne servent de preuve à aucun ID.
- Aucune case source n'est cochée. G1 à G4 restent soumises à leurs critères.
