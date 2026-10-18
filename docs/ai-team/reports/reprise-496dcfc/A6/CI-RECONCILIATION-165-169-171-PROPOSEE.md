# A6 — Réconciliation future des CI165/169/171, proposition

Lecture seule des trois ci.yml **immuables**. Aucun assemblage appliqué, merge, rebase, changement workflow, push ou run. A0 garde la coordination ; cette proposition ne vaut aucune autorisation de fusion/DB3.

## Références et compatibilité démontrée

| PR | SHA relu | Job pur | Empreinte ci.yml SHA256 |
|---|---|---|---|
|165|b1023605b965b27ff56fabf179756592673c98d4|mission-docs-pure|9542a7ca056edcb50f3ecb1892b47e242dc45aa9589c3d7463a4f93a31e9f7ec|
|169|a15d65044ca4454bf3159f4155e51465b2a70a2c|db-guard-pure|dca3828656e941b090ad8f971e857f499a3ef31397d307ee4350d0b6f45070da|
|171|5e0285d37f23c7c539502664036f0a2ff0986409|classification-pure|cb3cc0beba7eb213a961056c7c3d58c6b4f64f409f385814568fc5680ab75819|

Dans les trois fichiers, **validate/e2e/image sont identiques à maina4caaab0e6665480f09febe3914c960b424b6b47 après retrait de leur seul ifjob ajouté**. Comparaison YAML indépendante des commentaires effectuée, preuves/blobs/conditions exactes dans JSON joint. TriggersCI identiques : pull_request et pushmain. Les trois jobspurs ont des identifiants distincts et aucun service, donc coexistent structurellement ; leurs conditions et actions ne doivent pas être écrasées l’une par l’autre.

## Tuples et différences à traiter

| Route candidate | Événement | Dépôt exécution | Dépôt head | Head exact | Base | Contrôle de diff / commandes |
|---|---|---|---|---|---|---|
|D165|pull_request|RachEma-ux/Fadi explicite|RachEma-ux/Fadi|docs/156-codex-missions-completes|main|Gardeearly allowlistdocs/Studio/AGENTS/CLAUDE/READMEdesmodules/ci+codex ; testsdocs/continuité/isolation, aucun npm|
|T169|pull_request|**absent du test actuel**|RachEma-ux/Fadi|fix/157-test-database-guard|main|npmciignore/typecheck/test:db-guard/build ; pas de garde de chemins|
|C171|pull_request|RachEma-ux/Fadi explicite|RachEma-ux/Fadi|fix/156-classification-no-ifc-inference|main|npmciignore/typecheck/suiteentièreatelier-model/build ; pas de garde de chemins|

Réserve précise169 : head.repo.full_name ne teste pas github.repository. Le workflow ne doit pas être décrit comme vérifiant déjà les deux dépôts. Pour un futur assemblage, proposer de normaliser les trois tuples sur github.repository ET head.repo.full_name exacts, plus événement/head/base ; cette correction future se soumet dans son lot, **aucune modification169 faite maintenant**. Une PR provenant du dépôtFadi vers un autre dépôt pourrait sinon satisfaire les quatre termes actuels ; aucun incident ni exploitation observé revendiqué.

Chemins partagés : même `.github/workflows/ci.yml`, mêmes trois clésjobs et mêmes lignesif ; résolution par « prendre notre version » ou simple dernierfichier ferait perdre deux exceptions et pourrait redémarrer PostgreSQL sur leurs PR. Les types/build sont communs aux deux jobscode, leurs tests sont différents et doivent rester explicitement sélectionnés. Le jobdocs doit garder son contrôle de périmètre **avant les scripts du dépôt**, sans installer npm ; il ne doit pas être transformé en route « toute branche docs/* ».

## Principe d’assemblage candidat, pas code appliqué

Préserver trois prédicats exacts D/T/C mutuellement exclusifs, trois jobspurs conservés chacun sous son prédicat et les jobsapplicatifs sous la négation de l’union D∨T∨C. Toute variable absente, fork, autrebase/dépôt/branche/événement conserve le comportementcomplet. Ne pas utiliser wildcard, startsWith, label, skipci, continue-on-error ou désactivationglobale.

Le contrôle de diffdocs reste failclosed : si D exact mais sourceapp/package/SQL/autreworkflow nonallowlist, le jobdocs échoue ; les trois jobsDB restent skipped pour respecter zérobase. Cette défaillance de périmètre ne doit **pas** basculer automatiquement vers la CIavecDB. La politique finale de chemins des jobscode doit être décidée séparément à partir des diffsetautorisations deslots, pas inventée en élargissant l’allowlistdocumentaire.

Les résumés conservent distinction succeeded/skipped/nonexécuté. Un checkskipped peut satisfaire la mécaniqueGitHubdesrequiredchecks : aucune proposition ne doit prétendre que trois skips prouvent intégration ou DB3. Un éventuel jobreadinessbloquant est un lot futur explicite, pas un check inventé dans règlesadmin.

## Préconditions avant toute fusion autorisée

1. Accorddefusion séparé pour chaquePR, référencesmain/PR actuelles, revue des diffs et critèresmétier du lot. Aucunordredepriorité ne remplace cetaccord.
2. **Pushmain ne correspond à aucun tuplePR** : les vrais jobsDB/API/E2E/image seront éligibles après fusion. Tant que les essaisréels/migrations/services restent interdits, ne fusionner aucunePR pour « débloquer » unworkflow. DB3 et sécurité/provisionnement de la cible exigent leurs conditions et autorisations propres.
3. #169 ferme volontairement l’accèsréel via registreautoritésruntimevide ; en fusionnant ce code sans adaptationDB3 autorisée, les suitesAPIcourantes ne peuvent pas être déclarées opérationnelles. Interdiction de remplir ce registre par des clésfixtures juste pour obtenir un vert.
4. A6 uniquepropriétaire du futur assemblageci.yml, A0 réserve/contrôle toutes les autresmodificationspartagées. Matrice desjobspurs et assertions conservées, aucun npmtestglobal dans routespures.
5. Examiner **tous** lesworkflows après assemblage, y compris ceux d’autresPR : #152 ajoute Architecturegarde-fous ; ne pas considérer ci.ymlseul comme totalité des déclencheurs. Revoir lifecycleinstallations, filtres et éventuels services/run chaînés sans rien déclencher pendant la préparation.
6. Après autorisation de publication appropriée, constater lesruns et conclusions au nouveauSHAexact. Les succès14docs/129mock/492modèle de troisSHA distincts ne se transfèrent pas à l’assemblage futur. Restaurations/prod/rétention/admin restent séparées.

## Séquence de revue conservée154 →152 →142

D06 est un **ordre de revue**, pas une liste de fusionsautomatiques et pas une barrière aux préparationsindépendantes165/169/171. Références relues :154ouverte76e43d19645dc8a8ffd91282177e6a31d123f73a ;152draftouvertef2777230e3e9c3bd6a2a5f61e2147acd1fba4b38 ;142ouverte0d9606059f383e993b4bc69d57700ff411856919. Aucune fusionobservée dans ces lectures.

154 : conserver diagnostic de CI applicative documenté et requalifier tête/checks avant revue ; aucunrerun/correctif implicite.152 : réutiliser sesgarde-fous et candidatruleset, ne pas dupliquer, intégrer sestriggersdansl’inventaire futur ; aucuneactivationadmin.142 : préserver le traitement séparé navigation/CI ; ne pas l’introduire dans les exceptions de lotsdoc/DB/classification. CesPR ne sont ni fusionnées ni ordonnées de force par ce plan.

## Matrice de tests simulés requise pour le futur assemblage

| Cas | Attendu pur | Attendu jobsavecDB | Preuve nécessaire |
|---|---|---|---|
|Dexact+diffallowlist|Seulement docs|skipped sansétapes|Gardeparsing/paths, docs/continuité/isolation|
|Dexact+app/package/SQL/autreworkflow|docs échoueavantcontrôles|toujoursskipped|Aucunservicefallback, verdictglobaléchec|
|Renommagesource→docs / nommalformé / baseSHAabsent|refusfailclosed|skipped sousDexact|no-renames/NUL/40hex, aucuneexécution indue|
|Texact|Seulement guardmock|skipped|Commande test:db-guard, pasconfigAPIstandard|
|Cexact|Seulement modèleAtelier|skipped|Suiteentière, aucuneassertionaffaiblie|
|Chaquechampabsent/différent, fork et autredépôt|Aucun de D/T/C|comportementcompletpréservé|Testscontextuelseulement, nepaslancerdonnéesréelles|
|pushmain / autrePR / branchepréfixeproche|Aucun de D/T/C|complet éligible|Simulation, aucunpushmainpourtester|
|Troisprédicatstousévalués|Auplusunvrai|négationunioncorrecte|Nonchevauchement et résultat dechaqueif partagé|
|Échectype/build/testpur|Jobpurresteéchec|pasfallbackDB|Pascontinue-on-error/skipassertion|
|Workflowsadditionnels152etautres|Seulementcequemandaté|aucunserviceinattendu|Inventairecomplettriggers/services/lifecycle|

Il s’agit de **critères futurs proposés** ; seuls le parsing des trois immuables, leurscomparaisonsstructurelles et leslecturesGitHub indiquées ont été exécutés dans cette tâche. Aucun nouvel assemblage, testsd’assemblage, workflowrun, rebase ou fusion n’a été réalisé.
