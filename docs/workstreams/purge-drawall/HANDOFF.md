# Purge DrawAll dans Fadi — Reprise de session

Mis à jour : 2026-10-17 (UTC).

## Point de reprise

- Dépôt autorisé en écriture : **`RachEma-ux/Fadi` uniquement**.
- **Interdit** : écrire ou supprimer quoi que ce soit dans un dépôt `DrawAll`.
- Issue : [#147](https://github.com/RachEma-ux/Fadi/issues/147).
- Branche : `chore/147-remove-drawall-contamination` créée sur `main`.
- PR : [#148](https://github.com/RachEma-ux/Fadi/pull/148) (brouillon) ; ne pas fusionner automatiquement avant l'analyse d'impact.

## Dernier état vérifié

- 3 documents produits DrawAll isolés sous `docs/drawall/`, et `docs/atelier-drawall.md` présente une proposition de reconstruction Fadi selon DrawAll.
- Environ 269 fiches `DA-` contiennent également des spécifications/recettes de fonctions Fadi ; des modules de code actifs reprennent certaines ontologies industrielles.
- Un inventaire automatique a été exécuté sur GitHub (1261 fichiers scannés, 494 touchés, 2267 lignes) ; artefact `fadi-drawall-inventory` du workflow de la PR #148.
- Cinq occurrences de nom « DrawAll » dans des commentaires/générateur/README de code actif ont été retirées sur la branche, sans suppression de fonctionnalités. Les trois documents autonomes `docs/drawall/` sont encore présents tant que les liens entrants n'ont pas été traités.
- La suppression d'une référence historique et celle d'une fonction actuellement utilisée sont deux opérations différentes.

## Prochaine action

1. Examiner le rapport `fadi-drawall-inventory`, notamment les 180 fichiers de code (majoritairement des identifiants `DA-...`) et les 269 fiches ; suivre l'audit dans l'Issue #147.
2. Établir la matrice `RETIRER / ADAPTER / CONSERVER (Fadi) / ARBITRER` à la granularité fichier/fonction et relever les liens entrants vers les trois documents purs DrawAll.
3. Faire confirmer si la purge doit également retirer les fonctionnalités industrielles déjà intégrées à Fadi (P2 mécanique/bois/tôlerie/MEP), malgré leur présence active dans l'Atelier.
4. Effectuer la purge documentaire et fonctionnelle validée, réparer les consommateurs, lancer CI complète et ouvrir la revue de fusion.

## Tests et preuves

- GitHub tree `main` et fichiers README/cahiers consultés directement le 17 octobre 2026.
- Workflow GitHub d'audit : réussi, inventaire seul sans suppression ; CI applicative de la PR #148 à vérifier sur son dernier commit.
- Tests de suppression fonctionnelle : non exécutés, aucun retrait de fonction encore effectué.

## Risques et blocages

- L'effacement global de `docs/atelier/` ou `packages/atelier-model/` casserait des composants Fadi et perdrait l'historique d'acceptation.
- Des imports, routes, modèles persistés et migrations pourraient encore dépendre des fonctionnalités industrielles ; non vérifié.
- Limite de périmètre fonctionnel à faire confirmer avant suppression destructrice.

## Arrêt sûr

Fadi-Serv et la branche `main` restent inchangés. Tout audit est en lecture seule dans le dépôt Fadi ; aucune opération sur DrawAll.
