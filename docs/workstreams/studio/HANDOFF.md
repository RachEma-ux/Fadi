# Reprise — Studio

Mis à jour : 2026-10-18 (UTC).

## Point de reprise

Programme156 entier, reprise496dcfc. M08sept entrées achevé en lecture seule, revue indépendante reçue ; continuer les READY, aucune attente globale.

## Dernier état vérifié

Reprise du checkpoint `496dcfc7bf80868ef21216d667187087db32a738`. Branche documentaire canonique `docs/156-codex-missions-completes`, PR #165 ouverte. Main observée : `a4caaab0e6665480f09febe3914c960b424b6b47`. PR #169 reste draft à `a15d65044ca4454bf3159f4155e51465b2a70a2c` ; aucun rerun DB-1/2. Le SHA porteur de ce checkpoint se lit dans Git et dans #166.

Six nouvelles décisions déléguées et directive6250119063 effectivement lues ; [ACK de reprise](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250149589). [Rapport courant et preuves](../../ai-team/reports/reprise-496dcfc/README.md). Les anciens checkpoints Mission003/004 restent leurs états datés, sans réécriture de décision historique.

**G0 accepté pour le cadrage documentaire seulement**, décision6250109830 sur dossier7b0cca4 et ses trois revues. Quatre conditions documentaires ont été rapprochées individuellement : G0-01/02 Vérifié, G0-03 et CAD-DEC-01 Accepté dans cette portée. **G1–G4 non acceptés**, aucune fonctionnalité Studio acceptée. Personnes/disponibilités CAD-DEC-03, contrats physiques, droits finaux, corpus, budgets, POC et migration/rollback restent ouverts.

Registre unique630 : **203 À définir,186 En cours,207 Bloqué,32 Vérifié documentaire,2 Accepté cadrage documentaire**. P630=34/630≈5,4%, avec correspondance explicite des deux états documentaires ; **PDEV=N/D**, faute de DEV_SCOPE/baseline. Zéro case source/HTML cochée. Les31 missions restent ouvertes.

## Prochaine action

1. Lire AGENTS, continuité et les deux HANDOFF→STATUS→TASKS→CONTEXT ; vérifier les références et réponses récentes #166. Les six décisions sont reçues, ne pas les reposer.
2. Publier les preuves de M08-PATH-001..007 et poursuivre une cohorte réellement non traitée du mapping125, après exclusion des huit entrées déjà examinées en Mission004. A2 analyse, A5 revue ; aucun test requis pour cette lecture.
3. Terminer la preuve du routage CI, synchroniser165 sans DB et relire les jobs au SHA exact. Ne jamais présenter un skip comme un succès d’intégration.
4. Dès inventaires A2/A5 satisfaisants, A3 seul réalise CLASSIF-1 dans sa branche dédiée, A6 seul son workflow, A2/A5 revues. Si effet hors périmètre, suspendre uniquement ce code et demander une extension bornée ; poursuivre G1/M08.
5. G1 reste une étude documentaire sous les deux orientations retenues ; POC, codeStudio, migration et portes aval nécessitent leurs décisions distinctes.

## Tests et preuves

- M08-PATH-001..007 : lecture seule A2, revue indépendante A5 et consolidation A0.49sous-attendus, une préparation présente/24partiels/24absents ;39contextes non conclus.9sources,204citations/128uniques exactes. A5 conserve sa lecture indépendante48atomes et explique les différences de grain ; chaque verdict A2 est revu. Aucune équivalence d’oracle complet ni exécution de test applicatif.
- CI documentaire : décision6250109536 appliquée à `.github/workflows/ci.yml`. Repo+headrepo Fadi, eventPR, branche documentaire et base main exacts ;11contextes/6diffs/5bases invalides testés. Anciennes définitions validate/e2e/image inchangées sauf condition avant services. Job pur distinct, diff allowlist avant contrôles ; hors allowlist échoue sans DB. Aucun [skip ci] générique.
- Local :14tests du validateur,630affectations et continuité à exécuter au checkpoint avant push ; résultats consignés dans le rapport au SHA porteur. Aucun test API/E2E, DB réelle, migration, service ou production lancé. Les résultats CI historiques ne sont pas transférés.
- PR169/a15d650 : les mêmes runs39125959694/39125959914/39125959712 sont relus réussis, sans rerun ;129tests simulés historiques de ce SHA, validate/e2e/image skipped. DB-3 reste non validé.
- Runtime43 observé courant/running, politique enforced, aucun secret/variable runtime configuré déclaré ; pas une preuve de santé API/DB. Main reste non protégé, aucune administration activée.

## Risques et blocages

| Sous-tâche | Responsable / état | Preuve et prochaine action |
|---|---|---|
| M08-PATH-001..007 | A2/A5/A0 — Vérifié documentaire | Rapports sources et confrontation versés ; aucun test ou équivalence complète déduit |
| Synchronisation #165 | A6/A0 — En cours, autorisée | Contrôler diff final puis push avec CI pure, vérifier jobs/skips au SHA exact ; aucune fusion |
| A3-CLASSIF-1 | A2/A5 puis A3 — inventaire validé, code engagé | Autorisation6250110849 et inventaire conjoint42sources/216citations satisfaits ; A3 activé sur branche distincte de169, tests purs et revues à produire |
| G0 | A1/A4/A0 — Accepté cadrage documentaire | Acte6250109830 exact, réserves conservées ; aucune acceptation G1–G4 |
| DEC-01/03 et G1 | A1/A2/A4 — préparation prête | Orientations optionA retenues6250110124/0501, modèles physiques et preuves restent ouverts ; pas code/POC/SQL |
| CSP/KML | A4/A5 — préparation | OptionA retenue6250111226 ; aucune origine approuvée par inférence. Pas header/enforcement/scan réseau autorisés |
| DB-3, services, admin, migrations, fusion, production | Propriétaires missions.json — accord spécifique requis | Ne pas déduire d’autorisation depuis G0/CI/CLASSIF ; poursuivre les tâches indépendantes |

## Arrêt sûr

A0 est seul intégrateur des documents communs ; A6 seulworkflow, A3 seulcode autorisé. Avant interruption technique, publier `[CODEX-HANDOFF][NEXT-READY]` avec SHA, dernières preuves et opération exacte. Le programme ne se termine pas avec Mission004 ; aucune tâche ne disparaît si bloquée. Aucun travail en arrière-plan ou relancement automatique n’est prétendu.
