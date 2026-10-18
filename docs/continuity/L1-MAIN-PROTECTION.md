# Protection de main — configuration préparée, non appliquée

Issue administrative : #146. Lot de préparation : #151.

Au 18 octobre 2026, `GET /repos/RachEma-ux/Fadi/branches/main` renvoie `protected=false` sur `5cf61d1fed9ed523b331228af20bce93a4f2bf63`. La lecture de `/branches/main/protection` renvoie `403 Resource not accessible by integration`. Aucun accès administratif n’est créé ni contourné par cette PR.

## Fichier proposé

`main-ruleset.proposed.json` est une configuration à examiner puis importer dans Settings → Rules → Rulesets. Elle est volontairement `disabled` : son import ne signifie pas que main est protégée. Après disponibilité et succès des checks de L1, un administrateur doit la passer à `active`, enregistrer et vérifier la protection effective. Aucun token administratif ne doit être communiqué dans le dépôt ou dans une conversation.

Cible : main seulement ; PR obligatoire, aucun force-push ni suppression, conversations résolues et checks à jour. Aucun acteur de contournement préconfiguré. Le nombre minimal d’approbations est proposé à 0 pour ne pas bloquer un propriétaire seul ; cela ne supprime pas l’exigence d’acceptation humaine du projet. Avec un second mainteneur, réexaminer ce seuil et la revue des modifications des workflows/garde-fous.

## Checks à exiger

Noms des cinq checks existants observés via l’API du commit de base : `validate`, `e2e`, `image`, `Continuité — docs, checkpoints et tests`, `no-foreign-app-reference`. App source observée : GitHub Actions, ID 15368. Le sixième check ajouté par ce lot est `Architecture — frontières et isolation` ; vérifier son apparition réelle avant activation.

Ne pas exiger globalement `inventory` : le workflow d’inventaire historique possède des filtres de chemins et ne s’exécute pas sur chaque modification. Les noms de workflows ne sont pas les noms de checks requis.

## Preuve attendue pour clôturer #146

Règle active pour main, paramètres relus, succès d’une PR de contrôle et refus effectif d’une fusion sans checks satisfaits. Ne pas tester un force-push sur main de production. Documenter la vérification sans secrets. La présence du JSON, des tests ou d’une CI verte ne constitue pas cette preuve.
