# Reprise — équipe Codex Fadi

Mis à jour : 2026-10-18 (UTC).

## Point de reprise

Programme #156 entier ; continuer la prochaine sous-tâche READY autorisée.

## Dernier état vérifié

Reprise de `496dcfc7bf80868ef21216d667187087db32a738`, programme #156 entier. Branche documentaire `docs/156-codex-missions-completes`, PR #165 ouverte, dernier checkpoint publié `b1023605b965b27ff56fabf179756592673c98d4`. Main observée `a4caaab0e6665480f09febe3914c960b424b6b47`. PR #169 draft reste à `a15d65044ca4454bf3159f4155e51465b2a70a2c`, sans rerun DB-1/2. PR #171 draft, lot CLASSIF-1 / Issue #170, à `5e0285d37f23c7c539502664036f0a2ff0986409`. Aucune fusion.

Les six décisions et la directive6250119063 ont été lues ; [ACK](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250149589) puis [progrès publié](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250266800). [Rapport et pièces de cette reprise](../../ai-team/reports/reprise-496dcfc/README.md). La version courante est portée par le commit Git de ces fichiers ; les rapports agents sont des snapshots datés et peuvent décrire une étape antérieure.

G0 est **Accepté pour cadrage documentaire** uniquement, décision6250109830 sur dossier7b0cca4. G0-01/02 : Vérifié documentaire ; G0-03/CAD-DEC-01 : Accepté cadrage documentaire. Registre630 inchangé depuis ce delta : **203 À définir / 186 En cours / 207 Bloqué / 32 Vérifié documentaire / 2 Accepté cadrage documentaire**, P630=34/630=5,4%. **PDEV=N/D**, DEV_SCOPE/baseline non acceptés. Zéro case source/HTML cochée, toutes les31 missions restent ouvertes. G1–G4 non acceptés, décisions physiques DEC01/03 ouvertes, aucune capacité Studio acceptée.

## Prochaine action

1. Relire les nouvelles réponses #166 et revalider les SHA ; conserver les six décisions acquises sans les reposer.
2. Terminer les cohortes M08 : toutes les analyses A2/A4 sont remises ; revues A3/A1/A5 selon index. A3 revue indépendante017..039, A1 revue041..064, A5 E2E046..072 puis suivantes ; A5 contrôle les réserves A1/A3 avec attribution exacte.
3. A0 copie les remises stabilisées à octets identiques, valide citations/empreintes, actualise STATUS/HANDOFF ensemble, contrôles documentaires, commit/push165 et CI au SHA exact ; publier CODEX-PROGRESS.
4. Soumettre uniquement les nouveaux choix techniques G1/POC borné avec liens GitHub concrets après revue de l'annexe ; aucune exécution du POC sans décision. Les autres READY continuent pendant cette attente.
5. Parcourir toutes les31 missions ouvertes ; conserver propriétaire, cause, essais et prochaine action de chaque blocage. Aucun arrêt global causé par une PR ou question ouverte.

## Tests et preuves

- CLASSIF-1 : inventaire conjoint A2/A5 préalable, correction A3 limitée à la non-déduction IFC, 24 cas purs indépendants A5. Suite Atelier **492 tests / 107 fichiers réussis**, types et build réussis localement et au SHA5e0285d dans CI39130408506. Jobs validate/e2e/image skipped avant services ; aucune DB/API/E2E réelle exécutée. Revues A2/A5/A6 et A0 conservées. Main et données historiques non corrigées ; PR171 prête à revue, pas acceptée/fusionnée.
- CI documentaire165 : au SHAb102360, CI39129967610, couverture39129967587, continuité39129967590, isolation39129967601 et inventaire39129967593 réussis. Job documentaire sans base117682953687 réussi ; trois jobs intégration skipped, aucune réussite d'intégration déduite. Une nouvelle publication exige son propre constat CI.
- M08 : **125/125 analyses documentaires produites**, dont8 historiques conservées, **87/125 avec revue indépendante ou historique** à cet instant ;0 restent à analyser. Priorité001–007 terminée en lecture seule A2/A5/A0 ; suivantes009–015,016/018/020/022 et024–045 revues. Revues017–039 A3,041–064 A1 et046–072 A5 reçues ; dernières cohortes065..125 en revue indépendante. Index individuel dans le rapport ; zéro oracle complet déclaré équivalent, zéro scénario exécuté.
- G1 : compléments v2, schémas logiques et exemples documentaires sous orientations DEC01/03, revues A2/A4. Versions initiales conservées comme historique, v2 active. Index G1-01..04 et proposition de POC G2 prêts à instruction, sans passage de porte ni code/POC exécuté. DEC18 :12 groupes de moteurs candidats inventoriés A3, revue licences/frontières A6 reçue, droits et conformité de distribution encore ouverts ; interfaces publiques distinctes des modules internes UI.
- M09 : cinq workflowsmain lus, aucun scanner CVE dédié identifié. Métadonnée security_and_analysis absente, endpoints d'alertes refusés par le connecteur avec400 INVALID_ARGUMENT ; état et comptes **inconnus**, pas zéro alerte. Aucun scan, administration ou contournement.
- Runtime Cloud43 observé running/enforced/courant, sans secrets/variables configurés déclarés ; pas une preuve de santé API/DB. Main non protégé lors du dernier contrôle ; aucune activation administrative. Les14 tests documentaires/couverture630/continuité sont exécutés au checkpoint et leurs résultats consignés dans la preuve A0, sans test historique transféré.

## Risques et blocages

| Sous-tâche | Propriétaire / état | Suite exacte |
|---|---|---|
| M08,125 entrées | A2/A4 analyses, A1/A3/A5 revues, A0 consolidation — En cours | Terminer les revues restantes des125 analyses, conserver chaque ID et les limites |
| CLASSIF-1 / #170/#171 | A3 code, A2/A5 revues, A6 CI — Vérifié dans branche | Revue humaine et réconciliation future des workflows165/169/171 avant toute fusion autorisée |
| G1 / DEC01-03 / M17-M24 | A1/A2/A4 — préparations | Instruire les conditions G1 individuellement ; pas de porte passée par le dépôt des fichiers |
| POC G2 expérimental | A0/A2/A5/A6 — proposition, exécution bloquée | Soumettre annexe bornée, import public à attester et accord explicite après préconditions ; aucun code implicite |
| DEC18 moteurs | A3/A6 — inventaire et revue documentaires reçus | Confirmer frontières publiques/licences, coûts restent à mesurer, pas adaptation Studio autorisée |
| M09 sécurité | A6/A5 — état partiellement observable | Relayer au responsable l'accès de lecture manquant ; pas lancer de scan ni supposer absence de vulnérabilités |
| DB-3, services, admin, migrations, fusion, production | Propriétaires missions.json — accord spécifique requis | Conserver le blocage local et poursuivre tous les autres READY |

## Arrêt sûr

A0 seul propriétaire des documents communs, A6 des workflows autorisés, A3 du code autorisé. Les autres agents écrivent leurs remises séparées. Avant interruption technique, publier `[CODEX-HANDOFF][NEXT-READY]` avec SHA, preuves, tâches ouvertes et prochaine opération. Aucun travail en arrière-plan ou relancement automatique prétendu.
