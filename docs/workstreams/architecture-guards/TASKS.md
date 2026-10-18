# L1 — Tâches

## À faire

- [ ] Relever la CI complète du dernier HEAD de la PR #152, puis soumettre à revue.
- [ ] Activer et vérifier les protections de main avec un accès administratif approprié (#146).

## En cours

- [ ] Rejouer le dépôt réel après les tests complémentaires sur dépendances non hissées et alias # ; ne pas réutiliser la CI du commit précédent comme preuve du nouveau HEAD.

## Terminé

- [x] Cadrage #151, base main et protections relues via GitHub.
- [x] Analyse AST/résolution, frontières et cycles implémentés.
- [x] Isolation étendue aux lockfiles/configurations et ressources, sans renommer DA.
- [x] Suite locale complétée : 52 tests passés (fixtures, Node 22.16.0 et TypeScript 5.8.3).
- [x] Premier run L1 réel 39082923421 réussi sur 14f040731e8421fa578d3a42eb504f8824690ffd : 49 tests initiaux, 654 fichiers / 3706 imports, isolation 772 fichiers.
- [x] Workflow dédié épinglé et configuration administrative proposée documentés.

## Bloqué

L’intégration renvoie 403 pour l’administration des protections. Un JSON versionné ne configure pas main. Tests applicatifs complets locaux non exécutés : pas de copie complète du dépôt dans le conteneur ; utiliser la CI GitHub du dernier HEAD.

## Critères de sortie

Sept régressions couvertes et témoins positifs, CI réelle réussie, revue du diff, aucun changement fonctionnel non autorisé. Distinguer la livraison de garde-fous de l’activation administrative ; ne pas clôturer #146 tant que celle-ci n’est pas prouvée.
