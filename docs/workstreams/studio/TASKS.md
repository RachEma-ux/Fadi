# Tâches — Studio, programme #156

## À faire

1. Relire les nouvelles réponses #166 et revalider les SHA ; conserver les six décisions acquises sans les reposer.
2. Terminer les cohortes M08 : toutes les analyses A2/A4 sont remises ; revues A3/A1/A5 selon index. A3 revue indépendante017..039, A1 revue041..064, A5 E2E046..072 puis suivantes ; A5 contrôle les réserves A1/A3 avec attribution exacte.
3. A0 copie les remises stabilisées à octets identiques, valide citations/empreintes, actualise STATUS/HANDOFF ensemble, contrôles documentaires, commit/push165 et CI au SHA exact ; publier CODEX-PROGRESS.
4. Soumettre uniquement les nouveaux choix techniques G1/POC borné avec liens GitHub concrets après revue de l'annexe ; aucune exécution du POC sans décision. Les autres READY continuent pendant cette attente.
5. Parcourir toutes les31 missions ouvertes ; conserver propriétaire, cause, essais et prochaine action de chaque blocage. Aucun arrêt global causé par une PR ou question ouverte.

## En cours

| Sous-tâche | Propriétaire / état | Suite exacte |
|---|---|---|
| M08,125 entrées | A2/A4 analyses, A1/A3/A5 revues, A0 consolidation — En cours | Terminer les revues restantes des125 analyses, conserver chaque ID et les limites |
| CLASSIF-1 / #170/#171 | A3 code, A2/A5 revues, A6 CI — Vérifié dans branche | Revue humaine et réconciliation future des workflows165/169/171 avant toute fusion autorisée |
| G1 / DEC01-03 / M17-M24 | A1/A2/A4 — préparations | Instruire les conditions G1 individuellement ; pas de porte passée par le dépôt des fichiers |
| POC G2 expérimental | A0/A2/A5/A6 — proposition, exécution bloquée | Soumettre annexe bornée, import public à attester et accord explicite après préconditions ; aucun code implicite |
| DEC18 moteurs | A3/A6 — inventaire/revue | Confirmer frontières publiques/licences, coûts restent à mesurer, pas adaptation Studio autorisée |
| M09 sécurité | A6/A5 — état partiellement observable | Relayer au responsable l'accès de lecture manquant ; pas lancer de scan ni supposer absence de vulnérabilités |
| DB-3, services, admin, migrations, fusion, production | Propriétaires missions.json — accord spécifique requis | Conserver le blocage local et poursuivre tous les autres READY |

## Terminé

Sous-tâches uniquement : DB1/2 vérifié en simulation au SHAa15d650, CLASSIF1 vérifié en tests purs au SHA5e0285d, preuves documentaires G0/M08 nommées. Aucune mission entière, fonctionnalité Studio ou gate aval terminée.

## Bloqué

DB-3/services/admin/migrations/fusion/production et codeStudio sans leurs accords restent exclus. Cinq pièces originales Mission002 non récupérées restent manquantes, pas recréées comme originaux. POCG2 non autorisé. Aucun de ces blocages ne suspend M08 et les autres études READY.

## Critères de sortie

Reprise de `496dcfc7bf80868ef21216d667187087db32a738`, programme #156 entier. Branche documentaire `docs/156-codex-missions-completes`, PR #165 ouverte, dernier checkpoint publié `b1023605b965b27ff56fabf179756592673c98d4`. Main observée `a4caaab0e6665480f09febe3914c960b424b6b47`. PR #169 draft reste à `a15d65044ca4454bf3159f4155e51465b2a70a2c`, sans rerun DB-1/2. PR #171 draft, lot CLASSIF-1 / Issue #170, à `5e0285d37f23c7c539502664036f0a2ff0986409`. Aucune fusion.

Les six décisions et la directive6250119063 ont été lues ; [ACK](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250149589) puis [progrès publié](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250266800). [Rapport et pièces de cette reprise](../../ai-team/reports/reprise-496dcfc/README.md). La version courante est portée par le commit Git de ces fichiers ; les rapports agents sont des snapshots datés et peuvent décrire une étape antérieure.

G0 est **Accepté pour cadrage documentaire** uniquement, décision6250109830 sur dossier7b0cca4. G0-01/02 : Vérifié documentaire ; G0-03/CAD-DEC-01 : Accepté cadrage documentaire. Registre630 inchangé depuis ce delta : **203 À définir / 186 En cours / 207 Bloqué / 32 Vérifié documentaire / 2 Accepté cadrage documentaire**, P630=34/630=5,4%. **PDEV=N/D**, DEV_SCOPE/baseline non acceptés. Zéro case source/HTML cochée, toutes les31 missions restent ouvertes. G1–G4 non acceptés, décisions physiques DEC01/03 ouvertes, aucune capacité Studio acceptée.

Propriétaires uniques : A0 checkpoints, A6 workflows, A3 seul code autorisé. Routes/traductions/styles restent réservées à un futur lot explicitement attribué ; schémas/manifestes sous contrat A2 avant A3. Respecter le périmètre des PR142/152/154/168 existantes, pas de fusion automatique.
