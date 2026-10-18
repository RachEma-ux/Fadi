# M03 — Annexe aux contrôles du candidat existant146/152

Complète le rulesetcandidat de #146/PR152 et GITHUB-SETTINGS, sans nouveauJSONruleset ni activation. Politique **D05solo** et ordre **D06revue154→152→142** conservés. Aucun rerun/admin/merge/DB. Horodatage précis et URLs de chaquecheck dans le JSON ; lectures GitHub des SHA ci-dessous réellement effectuées.

## Conclusions possibles sur les références exactes

| Référence | SHA | Checks actifs observés | validate/e2e/image |
|---|---|---|---|
|main|a4caaab0e6665480f09febe3914c960b424b6b47|Continuité, isolation et troisjobsapplicatifs réussis|success/success/success|
|165|fa9f0db232f49007c5a8bebded4ffce530a5bf8f|DocsPure, couvertureCodex, continuité, isolation etinventory réussis|skipped/skipped/skipped|
|169|a15d65044ca4454bf3159f4155e51465b2a70a2c|DB1/2simulé, continuité et isolation réussis|skipped/skipped/skipped|
|171|5e0285d37f23c7c539502664036f0a2ff0986409|Classificationpure, continuité et isolation réussis|skipped/skipped/skipped|

main toujours protected=false. Tous les checks lus appartiennent à GitHubActions15368. Ces résultats ne se transfèrent pas à un futurassemblage. « Actifréussi » et « skipped » sont deux conclusions distinctes : trois routespures ne constituent aucune validationDB/API/E2E/image.

## Noms exacts à conserver, deux niveaux distincts

**Base du candidatruleset152** : `validate`, `e2e`, `image`, `Continuité — docs, checkpoints et tests`, `no-foreign-app-reference`. Ils existent surmain et les troisPR au relevé. Conserver la conception PRobligatoire, conversationsrésolues, brancheàjour, interdictionforcepush/suppression et profilsolo0approbationsGitHubsupplémentaires avec acceptationhumainetracée ; aucuneconfigurationappliquéeici.

**Preuves supplémentaires selon le type exact dePR, à exiger dans la revue** :

- Documentation165 : `Mission 004 — documentation sans base (intégration non exécutée)` **success**, et `Codex — 31 missions et 630 tâches` **success**, avec contrôleearlydiffallowlist réussi ; continuité/isolation réussies. Les trois skips sont intentionnels pour cette phase documentaire, pas un succèsapplicatif.
- DB1/2169 : `DB1/2 — tests simulés sans base (DB3 non validée)` **success**, continuité/isolation réussies ; vérifier129testssimulés et fermeture du runtime avant touteconnexion. Les trois skips ne lèvent pas DB3.
- Classification171 : `Classification — modèle pur sans base (intégration non exécutée)` **success**, continuité/isolation réussies ; vérifier492testspursmodèle, types/build et revues A2/A5/A6. Aucun effet démontré sur donnéesréelles historiques par ces seuls tests.
- PRordinairehorsroutes : jobsapplicatifs réels non-skipped requis comme preuves d’intégration, en plus de continuité/isolation. Leur exécution devra elle-même être autorisée dans le contexte du lot ; ne pas pousser une branche conduisant à DBsousmandatzérobase.

**Ne pas ajouter simultanément les trois checkspurs aux exigencesglobales d’un rulesetmain** : ils sont conditionnels et peuvent être absents/skipped sur les autresPR. Un rulesetciblantmain ne choisit pas à lui seul cette matrice métier selon laheadPR. La matrice ci-dessus est une obligation de revue explicite, pas une configurationadminconditionnelle prétendumentexistante.

`inventory` est filtré par chemins, donc pas requirementglobal. `Architecture — frontières et isolation` existe sur152 mais pas surmainactuel ; son ajoutglobal attend intégrationautorisée et présence/déclenchementprouvés. Même précaution pour couvertureCodex de165 avant fusion. Aucun nouveaucheck hypothétique ou nom deworkflow n’est proposé comme exigenceréelle.

## Limite importante des skips

GitHub peut considérer un checkskipped comme satisfait pour la mécanique desrequiredchecks. Exiger les troisnomsapplicatifs existants n’assure donc pas leur **exécutionréelle** sur ces troisroutes. Ne ni retirer discrètement cescontrôles ni prétendre qu’un indicateurvert protège contre une fusionmétierprématurée. La revuehumanedoit lire conclusions, périmètres, preuvesetaccords auSHAexact. Aucun nouveaujobgate inexistant n’est inventé pour masquer cette limite.

## Condition distincte avant une éventuelle fusion / pushmain

Les conditions des jobspurs exigent pull_request + tuplehead/repo/base exact. **Un pushsurmain ne satisfait aucun de ces tuples** : les vraisjobsvalidate/e2e/image et leurs servicesPostgreSQL/migrations deviennent éligibles. Toute actiondefusiondéclenchantcepush nécessite donc **avant l’action** : accorddefusion distinct, accord sur les effetsDB/services/migrations concernés, ciblejetable vérifiée et protectionsM02/DB3 applicables, revue de la réconciliationci.yml165/169/171, compatibilité des jobs et méthode de preuve au nouveausHA. Une CIpurePR réussie ne donne pas cesaccords.

#169 garde son registreautoritésruntimevide : aucune cléfixture ne doit être enrôlée pour faire fonctionner la CI complète ; DB3/provisionnement/confiance doivent être traités et autorisés séparément. #165 est documentaire, mais sa fusiondéclencherait aussi pushmain : pas d’exception implicite au mandat0base. #171 ne modifie pas les donnéeshistoriques et ne les valide pas par sa suitepure.

## Prochaine action canonique

A0 joint cetteannexe au dossierexistant146/152 et conserve le rulesetproposé inactif. Lorsqu’une activationadminspécifique sera autorisée, relire les noms/couvertures réellement intégrés àmain et la faisabilitédesrequirements, sans imposer desjobsabsents. Recetteadministrative et fusionrestent deux accordsdistincts ; ne pas testerforcepush/suppression ni lancerDBpour vérifier unruleset.

AucunG1/G2/G3/G4, acceptationfonctionnelle ou disponibilité de production n’est déduit de ces contrôles.
