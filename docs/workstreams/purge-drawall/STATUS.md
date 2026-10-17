# Purge DrawAll dans Fadi — Statut

Mis à jour : 2026-10-17 (UTC).

## État

**En cours — la portée fonctionnelle est désormais décidée : conserver toutes les fonctions industrielles et toutes les règles normatives de dessin comme capacités natives Fadi.** Purge des seules références et artefacts propres au produit DrawAll.

## Faits vérifiés

- Sur `main`, l'arbre Git de `RachEma-ux/Fadi` compte 1538 éléments (fichiers et répertoires) au moment de l'audit ; 3 documents `docs/drawall/` et 269 fiches `docs/atelier/fiches/DA-*.md`.
- **Rapport exhaustif GitHub Actions validé** : 1261 fichiers texte scannés, 494 fichiers avec occurrence, 2267 lignes pertinentes ; détails téléchargeables dans l'artefact `fadi-drawall-inventory` du workflow `Audit isolation DrawAll (Fadi uniquement)`. Répartition : 3 documents de l'autre produit ; 1 contrat interproduits ; 269 fiches DA ; 37 docs Fadi ; 180 fichiers de code Fadi ; 4 métadonnées. Scanner basé sur des marqueurs : les hits ne sont pas tous des éléments à supprimer.
- Première purge sur branche uniquement : cinq fichiers avec occurrences nominales dans commentaires/doc/générateur, sans supprimer de routes, schémas, fonctions ou tables ; **quatre documents interproduits retirés du checkout Fadi** et références directes réécrites vers la documentation Fadi. Leur contenu reste dans l'historique Git de Fadi tant que cet historique n'est pas réécrit.
- Contrôle `Fadi — isolation des autres applications` : réussite observée sur le dernier commit contrôlé, à réexaminer après tout nouveau commit.
- Des références DrawAll apparaissent dans `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/atelier-cahier-des-charges.md`, `docs/atelier-cahier-p2.md`, `docs/atelier/README.md` et `docs/atelier-drawall.md`.
- Plusieurs fiches DA relient des commandes `atelier.*` à des tests Fadi et à des décisions historiques ; elles ne sont donc pas toutes des copies autonomes éliminables sans examen.
- Des fichiers actifs ont été observés dans `packages/atelier-model/src/ontologies/`, des routes `apps/api/src/routes/atelier-*.ts` et des panneaux `apps/web/src/modules/atelier/nouveau/panneaux/`.
- `main` reste source de production ; aucune modification n'a été effectuée sur le dépôt DrawAll.

## Points ouverts

- Classer le rapport automatique et les liens dépendants avant suppression des trois documents uniquement consacrés à l'autre produit ; l'audit est réalisé.
- Adapter et vérifier l'intégration **native Fadi** de toutes les fonctions industrielles et règles normatives de dessin P1/P2, avec traçabilité, cahiers, décisions et tests ; aucune suppression de ces fonctions.
- Éviter de confondre réécriture du nom DrawAll et suppression effective des dépendances.

## Décision métier validée

- Le 17 octobre 2026, conservation explicite des fonctionnalités industrielles et des règles normatives de dessin, quelle que soit leur provenance documentaire ; élimination uniquement des dépendances à l'autre application. Les normes externes officielles gardent leur identification et attribution.

## Liens de suivi

- [Issue #147](https://github.com/RachEma-ux/Fadi/issues/147) — mandat.
- Branche : `chore/147-remove-drawall-contamination`.
- PR : [#148](https://github.com/RachEma-ux/Fadi/pull/148) (brouillon), sans modification de production.

## Préconditions de clôture

- Inventaire exhaustif, choix de périmètre, suppression contrôlée et preuves de conformité.
- Tests et critères métier des fonctions Fadi restantes vérifiés.
