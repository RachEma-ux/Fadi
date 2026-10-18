# L1 — Tâches

## À faire

- [ ] Relever les résultats de la CI complète sur le HEAD de la PR, puis soumettre à revue.
- [ ] Activer et vérifier les protections de main avec un accès administratif approprié (#146).

## En cours

- [ ] Confronter les garde-fous renforcés au dépôt réel en CI ; corriger tout problème prouvé sans exception silencieuse.

## Terminé

- [x] Cadrage #151, base main et protections relues via GitHub.
- [x] Analyse AST/résolution, frontières et cycles implémentés.
- [x] Isolation étendue aux lockfiles/configurations et ressources, sans renommer DA.
- [x] Suite de régression locale : 49 tests passés (fixtures, Node 22.16.0 et TypeScript 5.8.3).
- [x] Workflow dédié et configuration administrative proposée documentés.

## Bloqué

L’intégration renvoie 403 pour l’administration des protections. Un JSON versionné ne configure pas main. Les tests applicatifs complets locaux sont indisponibles : pas de copie complète du dépôt dans le conteneur ; la CI GitHub reste nécessaire.

## Critères de sortie

Sept régressions couvertes et témoins positifs, CI réelle réussie, revue du diff, aucun changement fonctionnel non autorisé. Distinguer la livraison de garde-fous de l’activation administrative ; ne pas clôturer #146 tant que celle-ci n’est pas prouvée.
