# Purge DrawAll dans Fadi — Reprise de session

Mis à jour : 2026-10-17 (UTC).

## Point de reprise

- Dépôt autorisé en écriture : **`RachEma-ux/Fadi` uniquement**.
- **Interdit** : écrire ou supprimer quoi que ce soit dans un dépôt `DrawAll`.
- Issue : [#147](https://github.com/RachEma-ux/Fadi/issues/147).
- Branche : `chore/147-remove-drawall-contamination` créée sur `main`.
- PR : à vérifier après création ; ne pas fusionner automatiquement avant l'analyse d'impact.

## Dernier état vérifié

- 3 documents produits DrawAll isolés sous `docs/drawall/`, et `docs/atelier-drawall.md` présente une proposition de reconstruction Fadi selon DrawAll.
- Environ 269 fiches `DA-` contiennent également des spécifications/recettes de fonctions Fadi ; des modules de code actifs reprennent certaines ontologies industrielles.
- Aucun fichier n'est supprimé à ce stade. La suppression d'une référence historique et celle d'une fonction actuellement utilisée sont deux opérations différentes.

## Prochaine action

1. Faire exécuter l'inventaire exhaustif par GitHub Actions ; lire le rapport généré.
2. Établir la matrice `RETIRER / ADAPTER / CONSERVER (Fadi) / ARBITRER` à la granularité fichier et fonction.
3. Supprimer les artefacts propres à DrawAll et réparer les références une fois tous les consommateurs identifiés ; demander arbitrage avant perte fonctionnelle de Fadi.

## Tests et preuves

- GitHub tree `main` et fichiers README/cahiers consultés directement le 17 octobre 2026.
- Tests de purge : non exécutés, car aucune suppression de code n'a encore eu lieu.

## Risques et blocages

- L'effacement global de `docs/atelier/` ou `packages/atelier-model/` casserait des composants Fadi et perdrait l'historique d'acceptation.
- Des imports, routes, modèles persistés et migrations pourraient encore dépendre des fonctionnalités industrielles ; non vérifié.
- Limite de périmètre fonctionnel à faire confirmer avant suppression destructrice.

## Arrêt sûr

Fadi-Serv et la branche `main` restent inchangés. Tout audit est en lecture seule dans le dépôt Fadi ; aucune opération sur DrawAll.
