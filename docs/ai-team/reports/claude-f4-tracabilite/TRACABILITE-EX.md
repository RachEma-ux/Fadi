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

Preuves d'exécution (`test_automatise`, `recette_e2e`) : 627 ; conformité attribuable : 0.

| Champ exigé | Preuves où il manque |
|---|---:|
| build | 599 |
| commit | 599 |
| contrat | 627 |
| corpus | 627 |
| environnement | 627 |
| executant | 627 |
| date | 627 |
| verdict | 627 |
| log | 578 |
| reference | 1 |
| scenario | 0 |

Refus « preuve sans SHA » : 599 preuves, 150 tâches. Refus « lien de CI sans scénario » : 0.
Tâches « Vérifié » ou « Accepté » dont aucune preuve d'exécution n'est attribuable : 174 (le statut documentaire du registre n'est pas une conformité ; aucune n'est déclarée conforme).

## EX-102 — lien bidirectionnel (104 fiches EX)

| Champ (REF-02 §20.1) | Fiches EX où il manque |
|---|---:|
| identifiant | 0 |
| sourceNiveau1 | 104 |
| proprietaire | 0 |
| contrat | 0 |
| composant | 0 |
| tests | 87 |
| preuves | 94 |
| etat | 0 |
| decision | 0 |

Composants candidats cités sans source dans le dépôt : 0.
Tests citant une exigence inconnue des fiches : 0.
Contrôles consignés au registre introuvables mot pour mot dans le fichier cité (libellé composé, déplacé ou reformulé) : 56.

Fiches EX avec au moins un test lié (registre ou titre de test) :

- EX-006 : 2 test(s), 1 preuve(s) d'exécution consignée(s)
- EX-009 : 4 test(s), 4 preuve(s) d'exécution consignée(s)
- EX-017 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-018 : 5 test(s), 5 preuve(s) d'exécution consignée(s)
- EX-024 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-039 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-048 : 5 test(s), 5 preuve(s) d'exécution consignée(s)
- EX-050 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-060 : 5 test(s), 5 preuve(s) d'exécution consignée(s)
- EX-085 : 13 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-086 : 8 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-092 : 6 test(s), 6 preuve(s) d'exécution consignée(s)
- EX-095 : 3 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-100 : 3 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-102 : 3 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-103 : 3 test(s), 0 preuve(s) d'exécution consignée(s)
- EX-104 : 3 test(s), 0 preuve(s) d'exécution consignée(s)

Sens inverse (test → exigence) : chaque fichier de test qui cite une exigence EX dans un titre.

- `apps/api/src/routes/studio-delegations.test.ts` → EX-085
- `apps/api/src/routes/studio-observations-rapprochement.test.ts` → EX-086
- `apps/api/src/testing/studio-tracabilite-ex.test.ts` → EX-100, EX-102, EX-103, EX-104
- `apps/web/src/modules/collaboration/commandes-collaboration.test.ts` → EX-085, EX-086
- `apps/web/src/modules/studio/observations/suivi-ui.test.ts` → EX-086
- `apps/web/src/modules/studio/publication/publication-ui.test.ts` → EX-085
- `apps/web/src/modules/studio/taches/journal-correlation.test.ts` → EX-095
- `packages/atelier-model/src/studio/delegation-approbation.test.ts` → EX-085
- `packages/atelier-model/src/studio/rapprochement-observations.test.ts` → EX-086

## EX-103 — couverture des preuves (141 fiches, critiques = priorité « P0 » du registre)

Fiches critiques : 141 ; déclarées conformes : 0 ; pouvant l'être aujourd'hui : 0.

| Champ | Fiches critiques où il manque |
|---|---:|
| test | 118 |
| resultat | 126 |
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
