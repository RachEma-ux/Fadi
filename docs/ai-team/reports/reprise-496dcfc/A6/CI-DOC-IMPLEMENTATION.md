# A6 — CI documentaire implémentée selon décision6250109536

Baseline locale496dcfc7bf80868ef21216d667187087db32a738, branchecanonique docs/156-codex-missions-completes. AGENTS, continuité, checkpoints et décisions166 réellement lus. Accord explicite Q-M004-CI-DOC-PURE optionA permet l’implémentation ; aucune activation administrative, DB, fusion ou publication par A6.

Fichier unique modifié par A6 dans le checkout : `.github/workflows/ci.yml` (+65lignes). Condition exacte : pull_request, **github.repository=RachEma-ux/Fadi**, head.repo.full_name identique, headdocs/156-codex-missions-completes, basemain. Toutes les autres valeurs ou absences conservent les trois jobs applicatifs inchangés. Sur ce tuple seulement, validate/e2e/image sont skipped au niveau job **avant services** ; job mission-docs-pure distinct, sans services ni npm ni lancement de codeAPI/E2E/migration. Le résumé ne présente pas les skips comme des succès.

Avant tout contrôle du projet, checkoutdepth0 puis contrôle du diff : SHA base40hex depuis métadonnéesPR, gitdiff--no-renames-z base...HEAD via Pythonstdlib sans shell, allowlist exactedocs/**,Studio/**,AGENTS,CLAUDE,READMEdesmodules et seulsci/codex-missionsworkflows. Sourceapp/package/SQL/autreworkflowhorsallowlist échouent le job pur, sans déclencher PostgreSQL. Déplacement d’un fichier sourceversdocs conserveanciencheminsupprimé via no-renames et échoue.

Preuves locales : YAML chargé, Python inline compilé ; **11 contextes événement/dépôts/branches et variables absentes**, six casdiff et cinqbases invalides/absentes, tous attendus réussis. Même étape de périmètre réellement exécutée en lecture seule sur basea4caaab...HEAD496 :208chemins admis. Ce nombre n’inclut pas les modifications encore noncommittéesA0/A6 ; A0 doit recontrôler le diff final avantpush.

14testsdocumentaires passés, couverture31missions/630affectations, testscontinuité1fichier passés/structureOK, isolation761fichiersOK et diffcheckworkflowclean. Ces résultats ne prouvent aucune fonctionnalitéStudio, aucunruntimeDB et ne sont pas une CI GitHub sur le prochainSHA.

Six workflows inspectés : CI et purs déclenchésPR/pushmain ; inventoryPRfiltré/dispatch ; builderdeploydispatchseul. Aucuncreate/workflow_run/repository_dispatch/pull_request_target. Sur synchronisation165ciblée, seulsjobsdocs/purs et inventorysi cheminsconcernés sont éligibles ; BuilderDeploy n’est pas déclenché. AucunworkflowGitHub lancé par A6. A0 vérifie aprèspublication lesjobs/skips au SHA exact.

Preuve détaillée/hachageduworkflow : CI-DOC-CONTEXT-PROOFS.json. Aucuncommit/push effectué. Conflit futuravecci.yml169resteàréconcilieravantfusionautorisée ; ne pas fusionner l’une desbranches pour débloquerl’autre. La CI future classificationsera préparéehorsdeceworkflowpartagé et n’altérerapas169.
