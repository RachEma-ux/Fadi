# Traçabilité des fiches EX de Studio — écarts connus (EX-100, EX-102, EX-103, EX-104)

Instantané **calculé** par `apps/api/src/testing/studio-tracabilite-ex.test.ts` (`STUDIO_TRACABILITE_ECRIRE=1` le réécrit) à
partir des fiches M004 (`docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json`), de la matrice (`docs/ai-team/reports/mission-004/A1/matrice-141-exigences-composants-tests-preuves.csv`), du registre
(`docs/workstreams/studio/task-register.json`), des titres des tests du dépôt, de REF-01 et REF-02. Aucune valeur n'est
complétée : un champ absent est un écart. Le test vérifie les règles (bloquantes ci-dessous) ; cet instantané évolue
avec le registre et n'est pas comparé à l'octet.

Règles bloquantes vérifiées par le test : aucune conformité attribuée sur une preuve refusée (sans SHA, ou lien de CI
sans scénario) ; aucune fiche critique déclarée « conforme » avec un champ test / résultat / build / preuve / décision
manquant ; aucun test citant une exigence inconnue des fiches ; aucun lien de CI sans scénario au registre.

## EX-100 — critère de preuve (preuves d'exécution du registre)

Preuves d'exécution (`test_automatise`, `recette_e2e`) : 930 ; conformité attribuable : 0.

| Champ exigé | Preuves où il manque |
|---|---:|
| build | 902 |
| commit | 113 |
| contrat | 930 |
| corpus | 930 |
| environnement | 113 |
| executant | 930 |
| date | 113 |
| verdict | 930 |
| log | 578 |
| reference | 1 |
| scenario | 0 |

Refus « preuve sans SHA » : 113 preuves, 67 tâches. Refus « lien de CI sans scénario » : 0.
Tâches « Vérifié » ou « Accepté » dont aucune preuve d'exécution n'est attribuable : 283 (le statut documentaire du registre n'est pas une conformité ; aucune n'est déclarée conforme).

## EX-102 — lien bidirectionnel (104 fiches EX)

| Champ (REF-02 §20.1) | Fiches EX où il manque |
|---|---:|
| identifiant | 0 |
| sourceNiveau1 | 104 |
| proprietaire | 0 |
| contrat | 0 |
| composant | 0 |
| tests | 32 |
| preuves | 36 |
| etat | 0 |
| decision | 0 |

Composants candidats cités sans source dans le dépôt : 0.
Tests citant une exigence inconnue des fiches : 0.
Contrôles consignés au registre introuvables mot pour mot dans le fichier cité (libellé composé, déplacé ou reformulé) : 88.

Fiches EX avec au moins un test lié (registre ou titre de test) :

- EX-001 : 12 test(s), 4 preuve(s) d'exécution consignée(s)
- EX-002 : 4 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-003 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-004 : 5 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-006 : 2 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-007 : 5 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-008 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-009 : 4 test(s), 4 preuve(s) d'exécution consignée(s)
- EX-010 : 11 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-011 : 7 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-012 : 5 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-013 : 8 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-015 : 5 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-016 : 2 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-017 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-018 : 5 test(s), 5 preuve(s) d'exécution consignée(s)
- EX-019 : 8 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-020 : 4 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-021 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-022 : 4 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-024 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-025 : 4 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-026 : 5 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-031 : 5 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-032 : 1 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-035 : 4 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-036 : 15 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-037 : 2 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-038 : 3 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-039 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-043 : 6 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-045 : 8 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-046 : 18 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-047 : 2 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-048 : 5 test(s), 5 preuve(s) d'exécution consignée(s)
- EX-049 : 2 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-050 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-051 : 6 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-054 : 5 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-057 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-058 : 2 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-060 : 5 test(s), 5 preuve(s) d'exécution consignée(s)
- EX-061 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-064 : 4 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-066 : 7 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-067 : 8 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-069 : 5 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-070 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-071 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-072 : 7 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-073 : 4 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-078 : 2 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-081 : 4 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-082 : 9 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-083 : 5 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-085 : 17 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-086 : 12 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-087 : 7 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-088 : 3 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-089 : 4 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-090 : 6 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-091 : 9 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-092 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-093 : 4 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-094 : 14 test(s), 3 preuve(s) d'exécution consignée(s)
- EX-095 : 6 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-096 : 2 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-099 : 6 test(s), 2 preuve(s) d'exécution consignée(s)
- EX-100 : 6 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-102 : 6 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-103 : 6 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-104 : 6 test(s), 1 preuve(s) d'exécution consignée(s)

Sens inverse (test → exigence) : chaque fichier de test qui cite une exigence EX dans un titre.

- `apps/api/src/lib/studio-journal-acces.test.ts` → EX-046
- `apps/api/src/routes/studio-cmd.test.ts` → EX-002, EX-010, EX-045, EX-088, EX-091, IF-001, IF-011
- `apps/api/src/routes/studio-delegations.test.ts` → EX-085
- `apps/api/src/routes/studio-derivation-copie.test.ts` → EX-013
- `apps/api/src/routes/studio-illustrations.test.ts` → EX-071, EX-072, EX-094
- `apps/api/src/routes/studio-journal-acces.test.ts` → EX-046
- `apps/api/src/routes/studio-observations-rapprochement.test.ts` → EX-086
- `apps/api/src/routes/studio.preuves-e.test.ts` → EX-082, EX-090, EX-093
- `apps/api/src/testing/studio-comptes.preuves-a.test.ts` → EX-001
- `apps/api/src/testing/studio-contrat-commandes.test.ts` → EX-003
- `apps/api/src/testing/studio-tracabilite-ex.test.ts` → EX-100, EX-102, EX-103, EX-104
- `apps/web/src/modules/collaboration/commandes-collaboration.test.ts` → EX-085, EX-086
- `apps/web/src/modules/studio/domaines/perimetre.preuves-a.test.ts` → EX-002
- `apps/web/src/modules/studio/frontieres.preuves-e.test.ts` → EX-073, EX-099
- `apps/web/src/modules/studio/hors-ligne/reprise.test.ts` → EX-049
- `apps/web/src/modules/studio/illustration/illustration.test.ts` → EX-094
- `apps/web/src/modules/studio/observations/suivi-ui.test.ts` → EX-086
- `apps/web/src/modules/studio/planche2d/alternatives-gestes.test.ts` → EX-036
- `apps/web/src/modules/studio/publication/publication-ui.test.ts` → EX-085
- `apps/web/src/modules/studio/taches/journal-correlation.test.ts` → EX-095
- `apps/web/src/modules/studio/taches/pool-studio.preuves-e.test.ts` → EX-061
- `apps/web/src/modules/studio/taches/trace-geste.test.ts` → EX-008
- `apps/web/src/modules/studio/vue3d/etat-projection.test.ts` → EX-051
- `apps/web/src/modules/studio/vue3d/scene-gpu.preuves-a.test.ts` → EX-008
- `packages/atelier-model/src/studio/agents/agents.test.ts` → AC-007, EX-031, EX-071, EX-072, EX-094
- `packages/atelier-model/src/studio/cmd/cmd.test.ts` → EX-002, EX-010, EX-016, EX-045, EX-051
- `packages/atelier-model/src/studio/cmd/migration.test.ts` → EX-019, EX-091
- `packages/atelier-model/src/studio/copie-independante.test.ts` → EX-013
- `packages/atelier-model/src/studio/delegation-approbation.test.ts` → EX-085
- `packages/atelier-model/src/studio/identite-bim.preuves-e.test.ts` → EX-064
- `packages/atelier-model/src/studio/projections.preuves-a.test.ts` → EX-011
- `packages/atelier-model/src/studio/quantites.preuves-e.test.ts` → EX-078
- `packages/atelier-model/src/studio/rapprochement-observations.test.ts` → EX-086

## EX-103 — couverture des preuves (141 fiches, critiques = priorité « P0 » du registre)

Fiches critiques : 141 ; déclarées conformes : 0 ; pouvant l'être aujourd'hui : 0.

| Champ | Fiches critiques où il manque |
|---|---:|
| test | 44 |
| resultat | 75 |
| build | 141 |
| preuve | 141 |
| decision | 0 |

## EX-104 — auditabilité

Principes de niveau 1 (REF-01, sections de la charte) et couverture inverse : aucune fiche ne déclare son ancrage de
niveau 1 (`level1Anchor` du modèle REF-02 §20.1) ; le rattachement n'est pas déduit ici.

| Principe (REF-01) | Exigences | Composants | Preuves | Complet |
|---|---:|---:|---:|---|
| 01 Mission et périmètre | 0 | 0 | 0 | non — auditabilité incomplète |
| 02 Organisation fonctionnelle | 0 | 0 | 0 | non — auditabilité incomplète |
| 03 Personnalisation et système d’outils | 0 | 0 | 0 | non — auditabilité incomplète |
| 04 Moteurs mutualisés et qualité d’exécution | 0 | 0 | 0 | non — auditabilité incomplète |
| 05 Invariants, sécurité et réversibilité | 0 | 0 | 0 | non — auditabilité incomplète |
| 06 Études, workflow et publications | 0 | 0 | 0 | non — auditabilité incomplète |
| 07 Intelligence artificielle et extensions | 0 | 0 | 0 | non — auditabilité incomplète |
| 08 Hiérarchie documentaire, décisions et traçabilité | 0 | 0 | 0 | non — auditabilité incomplète |

Défauts observés (Plan §7.3) remontés : test → exigence → composant → principe.

| Défaut | Tests | Exigences | Composants | Rupture |
|---|---:|---|---:|---|
| double autorité 2D/3D | 1 | INV-002 | 3 | principe |
| corruption de référence | 2 | INV-013 | 3 | principe |
| accès inter-projets non autorisé | 2 | — | 0 | exigence |
| commande appliquée deux fois | 4 | INV-014 | 3 | principe |
| écrasement de conflit | 4 | INV-014 | 3 | principe |
| résultat ancien engagé comme courant | 3 | INV-006 | 2 | principe |
| publication sous une approbation ne couvrant pas le contenu | 1 | INV-001 | 3 | principe |
