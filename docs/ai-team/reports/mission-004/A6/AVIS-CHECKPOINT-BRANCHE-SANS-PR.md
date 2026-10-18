# A6 — Avis borné : sauvegarde documentaire sur branche courte sans PR

Analyse lecture seule du18octobre2026. Proposition : publier un descendant documentaire du SHA63e804be7b8e8935913514bd57937053c7402474 sur `docs/156-m004-checkpoint-sans-db`, sans ouvrir de PR, sans mettre à jour la branche #165, sans modifier de workflow. A6 n’a rien poussé/créé.

## Conclusion technique

**Dans les six workflows versionnés inspectés, ce push sur une nouvelle branche non-main sans PR n’est éligible à aucun workflow.** Il ne provoque donc pas les services PostgreSQL/migrations ni Builder Deploy via ces définitions. Cet avis est conditionné au commit final conservant exactement ces déclencheurs et à l’absence de PR existante associée à cette branche. Il ne certifie pas des intégrations externes opaques ou l’absence de réaction humaine ultérieure.

## Déclencheurs tous examinés

Répertoire GitHub `.github/workflows` lu au SHA63e804… : exactement six fichiers, concordants avec checkout local désormais au même SHA.

| Workflow | Déclencheurs observés | Push nouvelle branche sans PR |
|---|---|---|
| ci.yml | push branches[main], pull_request | Non éligible |
| codex-missions.yml | pull_request, push branches[main], workflow_dispatch | Non éligible |
| continuity.yml | pull_request, push branches[main], workflow_dispatch | Non éligible |
| fadi-isolation.yml | pull_request, push branches[main], workflow_dispatch | Non éligible |
| audit-drawall.yml | pull_request filtré chemins, workflow_dispatch | Non éligible |
| builder-deploy.yml | workflow_dispatch uniquement | Non éligible |

Aucun create/delete/repository_dispatch/workflow_run/pull_request_target dans ces définitions. Aucune action dispatch, création PR ou mise à jour #165 ne doit accompagner le push. Ouvrir ensuite une PR sur cette branche déclencherait la CI applicative existante et serait incompatible avec zéro DB tant que le problème d’orchestration n’est pas traité ; un simple changement de nom de branche ne neutralise pas pull_request.

## Collision et hooks

GET GitHub `git/ref/heads/docs/156-m004-checkpoint-sans-db` retourne404. GET pulls stateall filtré headRachEma-ux:docs/156-m004-checkpoint-sans-db retourne listevide. Nom disponible au relevé, à recontrôler immédiatement avant création/push ; aucun force-push si collision. Le premier essai encoded branches/docs%2F… a été rejeté par le wrapper, d’où lecture réussie par git/ref ; ce rejet n’était pas une preuve d’absence.

Checkout local : core.hooksPath absent, .git/hooks ne contient que des .sample, aucun hook actif détecté ; pas de .husky, pre-commit config ou sous-module racine. Vérification équivalente /workspace/Fadi : aucun hook non-sample détecté. Les lifecycle npm ne s’exécutent pas par un push Git ; ne lancer aucune installation ou commande applicative. Attention opérationnelle : origin du checkout local pointe actuellement vers `/workspace/Fadi`, pas directement GitHub ; A0 doit employer son chemin de publication GitHub explicite déjà autorisé et vérifier la référence distante obtenue, sans changer de credentials ou exposer une URL sensible.

L’endpoint hooks n’est pas exposé par github_fetch (rejet allowed-endpoint) : aucune affirmation d’absence de webhooks externes ou GitHub Apps. Les workflows versionnés ont été inspectés exhaustivement dans le périmètre accessible ; aucune administration tentée pour découvrir davantage.

## Conditions de publication proposées à A0

1. Avant publication, contrôle du diff descendant63e804… : seulement documents/registre autorisés et STATUS/HANDOFF ensemble, aucun workflow modifié, aucun code/secret/dump et aucun artefact interdit. Le document canonique garde le même dossier/IDs ; il ne s’agit pas d’un nouveau programme concurrent.
2. Revalider branche inexistante et aucune PR source correspondant au nom. Publication fast-forward/création uniquement sur ce nom court, pas de pushmain, pas de mise à jour docs/156-codex-missions-completes.
3. Référencer dans #166 le SHA exact et le chemin de reprise ; dire explicitement sauvegarde documentaire sans PR et intégration canonique différée jusqu’à la décision CI-doc. Ne pas déclarer CI verte : aucun run attendu pour cette nouvelle référence.
4. Vérifier après publication référence distante/commit et l’absence de nouveaux runs associés (sans déclencher de run). Une réaction inattendue impose stop et signalement, pas relance ou suppression.
5. Garder les deux branches en filiation ; après décision applicable, reporter les mêmes commits/documents vers #165 de façon contrôlée, sans double registre, sans modifier silencieusement la CI ou fusionner.

La contrainte zéro base demeure satisfaite par les déclencheurs examinés si ces conditions sont maintenues. Publication documentaire, création PR et intégration sont trois opérations distinctes ; cet avis ne donne aucun accord de fusion, déploiement ou administration.
