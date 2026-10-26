# Rapprochements d'agrégation des recettes Studio

> Document **généré** par `node scripts/registre/etat-studio.mjs --ecrire` (module `scripts/registre/rattachements-studio.mjs`) ;
> la CI le recalcule à chaque commit. Registre SHA-256 `85e54791265aeb2d71d8ba47729ac00417c683396503a2e65736599fb6fb24b3`.

Pour chaque agrégat (A.2-09, REC-A-02, REC-B-01, REC-C-02, REC-E-01, REC-E-02, F.3-04, J6), chaque TEST-xxx / AC-xxx cité
(relu dans la description du registre ; facettes déclarées pour REC-B-01 et J6, qui n'en citent pas) est rapproché de
son obligation : preuves « scénario exécuté » du registre (libellés contrôlés mot pour mot en CI par
`registre-libelles.test.ts`), preuves livrées au code par les huit lots d'achèvement et pas encore reportées au registre
(libellés relus dans leurs fichiers à chaque génération), et ce qui manque réellement. Ce rapport ne modifie pas le registre
et ne déclare aucun agrégat clos : le report des preuves et la clôture restent à faire au registre.

### A.2-09

- **Agrégat** : Maintenir TEST-001 ouvert jusqu’à la composition et à la publication du dessin par le lot E.
- **Statut au registre** : Vérifié · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées**
- **Garde A.2-09** (`gardeTest001`) : TEST-001 n'a été clos qu'à l'entrée d'historique qui cite la recette de publication, et sa preuve exécutée porte le contrôle E.3-07 (composition et publication du dessin).

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| cité par la description | TEST-001 | TEST-001 | Vérifié / Exécuté | `apps/web/e2e/studio-dossier.mjs` (5) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |

### REC-A-02

- **Agrégat** : Joindre les preuves des scénarios TEST-001 à TEST-014, TEST-027 et TEST-034/035 applicables, selon leurs dépendances.
- **Statut au registre** : Vérifié · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées**

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| cités par la description | TEST-001 | TEST-001 | Vérifié / Exécuté | `apps/web/e2e/studio-dossier.mjs` (5) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-002 | TEST-002 | Vérifié / Exécuté | `apps/web/e2e/studio-faces.mjs` (4) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-003 | TEST-003 | Vérifié / Exécuté | `apps/web/e2e/studio-navigation.mjs` (3) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-004 | TEST-004 | Vérifié / Exécuté | `packages/atelier-model/src/studio/studio-invariants.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-005 | TEST-005 | Vérifié / Exécuté | `apps/web/e2e/studio-faces.mjs` (4), `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-006 | TEST-006 | Vérifié / Exécuté | `apps/web/e2e/studio-faces.mjs` (2), `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-007 | TEST-007 | Vérifié / Exécuté | `apps/web/e2e/studio-faces.mjs` (2), `packages/atelier-model/src/studio/composition/f1-geometrie.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-008 | TEST-008 | Vérifié / Exécuté | `packages/atelier-model/src/studio/architecture/architecture.test.ts` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-009 | TEST-009 | Vérifié / Exécuté | `apps/web/e2e/studio-dossier.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-010 | TEST-010 | Vérifié / Exécuté | `apps/web/e2e/studio-navigation.mjs` (3) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-011 | TEST-011 | Vérifié / Exécuté | `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/api/src/routes/studio-pub.preuves-pub.test.ts` (1), `apps/web/e2e/studio-pub.mjs` (1) | lot PUB : `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/api/src/routes/studio-pub.preuves-pub.test.ts` (1), `apps/web/e2e/studio-pub.mjs` (1) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-012 | TEST-012 | Vérifié / Exécuté | `apps/web/e2e/studio-conflits.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-013 | TEST-013 | Vérifié / Exécuté | `apps/web/e2e/studio-conflits.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-014 | TEST-014 | Vérifié / Exécuté | `apps/web/e2e/studio-exact.mjs` (1), `packages/atelier-model/src/studio/f2-booleen.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-027 | TEST-027 | Vérifié / Exécuté | `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/web/e2e/studio-exigences.mjs` (3) | lot PUB : `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/web/e2e/studio-exigences.mjs` (3) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-034 | TEST-034 | Vérifié / Exécuté | `apps/web/e2e/studio-restauration.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-035 | TEST-035 | Vérifié / Exécuté | `apps/api/src/routes/studio-taches-projets.preuves-bloc02.test.ts` (4) | — | rien au dépôt ; reste hors dépôt : Rejouer sur le build candidat figé (R.1-01) au moment de G4. |

### REC-B-01

- **Agrégat** : Livrer manifeste, loaders, Manager, profils persistants, politique de cache et rapport réseau/mémoire.
- **Statut au registre** : À faire · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées**

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| manifeste et chargeurs | TEST-016 | TEST-016 | Vérifié / Exécuté | `apps/web/e2e/studio-profils.mjs` (3) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| manifeste et chargeurs | TEST-017 | TEST-017 | Vérifié / Exécuté | `apps/web/src/modules/studio/studio-invariants.test.ts` (1), `apps/web/e2e/studio-catalogue.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| Manager et profils persistants | TEST-018 | TEST-018 | Vérifié / Exécuté | `apps/api/src/routes/studio-invariants.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| Manager et profils persistants | TEST-019 | TEST-019 | Vérifié / Exécuté | `apps/api/src/routes/studio-invariants.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| politique de cache et hors connexion | TEST-020 | TEST-020 | Vérifié / Exécuté | `apps/web/e2e/studio-chargement.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| politique de cache et hors connexion | TEST-021 | TEST-021 | Vérifié / Exécuté | `apps/web/e2e/studio-hors-ligne.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| politique de cache et hors connexion | TEST-036 | TEST-036 | Vérifié / Exécuté | `apps/web/e2e/studio-preuves-a.mjs` (6) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| rapport réseau / mémoire | AC-002 | TR-AC-002 | Vérifié / Exécuté | `packages/atelier-model/src/studio/mesures/mesures.test.ts` (6), `apps/web/e2e/studio-g4.mjs` (4) | partielles : `apps/web/src/modules/studio/chargement/gestionnaire-ressources.test.ts` (1) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |

### REC-C-02

- **Agrégat** : Joindre TEST-022 à TEST-025 et AC-004/005 selon le périmètre retenu.
- **Statut au registre** : À faire · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées** ; **hors dépôt (EXTERNE)** : évaluation des profils GPU sur appareil réel : aucun GPU physique ni téléphone dans cet environnement (runner Linux, rendu logiciel SwiftShader) — DEC-13 ; recette `docs/workstreams/studio/recettes/RECETTE-APPAREILS.md`

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| cités par la description | TEST-022 | TEST-022 | Vérifié / Exécuté | `apps/web/src/modules/studio/planche2d/mesure-spatiale.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-023 | TEST-023 | Vérifié / Exécuté | `apps/web/src/modules/studio/vue3d/picking.test.ts` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-024 | TEST-024 | Vérifié / Exécuté | `apps/web/e2e/studio-navigation.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-025 | TEST-025 | Vérifié / Exécuté | `apps/web/src/modules/studio/planche2d/rendus/comparaison-moteurs.test.ts` (2), `apps/web/e2e/studio-rendu.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md. |
| cités par la description | AC-004 | TR-AC-004 | Vérifié / Exécuté | `apps/web/src/modules/studio/planche2d/ambiguites.preuves-g2.test.ts` (3), `apps/web/e2e/studio-g2.mjs` (4) | partielles : `apps/web/src/modules/studio/planche2d/accrochage.preuves-b.test.ts` (2) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | AC-005 | TR-AC-005 | Vérifié / Exécuté | `apps/web/src/modules/studio/vue3d/comparaison-optimisation.test.ts` (4), `packages/atelier-model/src/studio/mesures/mesures.test.ts` (4), `apps/web/e2e/studio-g4.mjs` (1) | partielles : `packages/atelier-model/src/studio/preuves-b.test.ts` (1) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |

### REC-E-01

- **Agrégat** : Achever TEST-001 et joindre TEST-009/010, TEST-026 à TEST-032, TEST-038 et TEST-018/035 selon le périmètre.
- **Statut au registre** : Vérifié · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées**

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| cités par la description | TEST-001 | TEST-001 | Vérifié / Exécuté | `apps/web/e2e/studio-dossier.mjs` (5) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-009 | TEST-009 | Vérifié / Exécuté | `apps/web/e2e/studio-dossier.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-010 | TEST-010 | Vérifié / Exécuté | `apps/web/e2e/studio-navigation.mjs` (3) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-026 | TEST-026 | Vérifié / Exécuté | `packages/atelier-model/src/studio/scenes/scenes.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-027 | TEST-027 | Vérifié / Exécuté | `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/web/e2e/studio-exigences.mjs` (3) | lot PUB : `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/web/e2e/studio-exigences.mjs` (3) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-028 | TEST-028 | Vérifié / Exécuté | `apps/web/e2e/studio-echanges.mjs` (4), `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts` (4) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md. |
| cités par la description | TEST-029 | TEST-029 | Vérifié / Exécuté | `apps/web/e2e/studio-observations.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-030 | TEST-030 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-031 | TEST-031 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-032 | TEST-032 | Vérifié / Exécuté | `apps/api/src/routes/studio-illustrations.test.ts` (3), `apps/web/e2e/studio-lot-f.mjs` (3) | lot F : `apps/api/src/routes/studio-illustrations.test.ts` (2), `apps/web/e2e/studio-lot-f.mjs` (2) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-038 | TEST-038 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-018 | TEST-018 | Vérifié / Exécuté | `apps/api/src/routes/studio-invariants.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-035 | TEST-035 | Vérifié / Exécuté | `apps/api/src/routes/studio-taches-projets.preuves-bloc02.test.ts` (4) | — | rien au dépôt ; reste hors dépôt : Rejouer sur le build candidat figé (R.1-01) au moment de G4. |

### REC-E-02

- **Agrégat** : Joindre les preuves AC-007 à AC-010 applicables.
- **Statut au registre** : Vérifié · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées**

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| cités par la description | AC-007 | TR-AC-007 | Vérifié / Exécuté | `packages/atelier-model/src/studio/agents/agents.test.ts` (1), `apps/api/src/routes/studio-illustrations.test.ts` (1), `apps/web/e2e/studio-lot-f.mjs` (1) | lot F : `packages/atelier-model/src/studio/agents/agents.test.ts` (1), `apps/web/e2e/studio-lot-f.mjs` (1) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | AC-008 | TR-AC-008 | Vérifié / Exécuté | `packages/atelier-model/src/studio/studio-invariants.preuves-d2.test.ts` (1), `packages/atelier-model/src/studio/architecture/architecture.test.ts` (1), `apps/web/e2e/studio-navigation.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | AC-009 | TR-AC-009 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (1), `apps/web/e2e/studio-publication.mjs` (1), `apps/web/e2e/studio-publication.mjs` (1), `apps/api/src/routes/studio-invariants.test.ts` (1), `apps/api/src/routes/studio-invariants.test.ts` (1), `apps/web/src/modules/studio/publication/publication-ui.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | AC-010 | TR-AC-010 | Vérifié / Exécuté | `apps/api/src/routes/studio-g2.preuves-g2.test.ts` (2), `apps/web/src/modules/studio/publication/approbation-commande.test.ts` (2), `apps/web/e2e/studio-g2.mjs` (3) | partielles : `apps/api/src/routes/studio-invariants.preuves-d2.test.ts` (1), `apps/api/src/routes/studio-profils-import.test.ts` (1) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |

### F.3-04

- **Agrégat** : Joindre TEST-025/026/032/033/035 applicables ; ne déclarer livrées que les options disposant de preuves.
- **Statut au registre** : Vérifié · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées**

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| cités par la description | TEST-025 | TEST-025 | Vérifié / Exécuté | `apps/web/src/modules/studio/planche2d/rendus/comparaison-moteurs.test.ts` (2), `apps/web/e2e/studio-rendu.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md. |
| cités par la description | TEST-026 | TEST-026 | Vérifié / Exécuté | `packages/atelier-model/src/studio/scenes/scenes.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-032 | TEST-032 | Vérifié / Exécuté | `apps/api/src/routes/studio-illustrations.test.ts` (3), `apps/web/e2e/studio-lot-f.mjs` (3) | lot F : `apps/api/src/routes/studio-illustrations.test.ts` (2), `apps/web/e2e/studio-lot-f.mjs` (2) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-033 | TEST-033 | Vérifié / Exécuté | `apps/api/src/routes/studio-agents.test.ts` (5), `apps/web/e2e/studio-lot-f.mjs` (4) | lot F : `apps/api/src/routes/studio-agents.test.ts` (2), `apps/web/e2e/studio-lot-f.mjs` (2) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| cités par la description | TEST-035 | TEST-035 | Vérifié / Exécuté | `apps/api/src/routes/studio-taches-projets.preuves-bloc02.test.ts` (4) | — | rien au dépôt ; reste hors dépôt : Rejouer sur le build candidat figé (R.1-01) au moment de G4. |

### J6

- **Agrégat** : Vérifier « Dossier métier » : BIM, visualisation de base, métrés, observations, revue et publication cohérents. Ce jalon ne prouve pas : La couverture de tous les formats et extensions.
- **Statut au registre** : Vérifié · **Verdict du rapprochement** : **preuves au dépôt pour toutes les obligations citées**

| Groupe | Cité | Obligation | Statut / tests | Preuves exécutées au registre | Preuves au code hors registre (lots à reporter, ou partielles) | Ce qui manque réellement |
|---|---|---|---|---|---|---|
| BIM | TEST-027 | TEST-027 | Vérifié / Exécuté | `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/web/e2e/studio-exigences.mjs` (3) | lot PUB : `packages/atelier-model/src/studio/studio-invariants.test.ts` (1), `apps/web/e2e/studio-exigences.mjs` (3) | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| BIM | TEST-028 | TEST-028 | Vérifié / Exécuté | `apps/web/e2e/studio-echanges.mjs` (4), `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts` (4) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. Pour TR-EX-100 à 104, les écarts réels relevés sont publiés dans docs/ai-team/reports/claude-f4-tracabilite/TRACABILITE-EX.md. |
| visualisation de base | TEST-026 | TEST-026 | Vérifié / Exécuté | `packages/atelier-model/src/studio/scenes/scenes.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| métrés | TEST-009 | TEST-009 | Vérifié / Exécuté | `apps/web/e2e/studio-dossier.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| métrés | TEST-010 | TEST-010 | Vérifié / Exécuté | `apps/web/e2e/studio-navigation.mjs` (3) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| métrés | AC-008 | TR-AC-008 | Vérifié / Exécuté | `packages/atelier-model/src/studio/studio-invariants.preuves-d2.test.ts` (1), `packages/atelier-model/src/studio/architecture/architecture.test.ts` (1), `apps/web/e2e/studio-navigation.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| observations | TEST-029 | TEST-029 | Vérifié / Exécuté | `apps/web/e2e/studio-observations.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| revue et publication | TEST-030 | TEST-030 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| revue et publication | TEST-031 | TEST-031 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| revue et publication | TEST-038 | TEST-038 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (2) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
| revue et publication | AC-009 | TR-AC-009 | Vérifié / Exécuté | `apps/web/e2e/studio-publication.mjs` (1), `apps/web/e2e/studio-publication.mjs` (1), `apps/web/e2e/studio-publication.mjs` (1), `apps/api/src/routes/studio-invariants.test.ts` (1), `apps/api/src/routes/studio-invariants.test.ts` (1), `apps/web/src/modules/studio/publication/publication-ui.test.ts` (1) | — | rien au dépôt ; reste hors dépôt : Conserver la preuve ; recette utilisateur sur appareil réel non évaluée. |
