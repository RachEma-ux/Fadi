# Purge DrawAll dans Fadi — Statut

Mis à jour : 2026-10-18 (UTC).

## Actualisation Mission 003 — 18 octobre 2026

La PR #148 est fusionnée depuis le 17 octobre 2026 au commit `5cf61d1fed9ed523b331228af20bce93a4f2bf63` ; #147 reste ouverte. Les mentions de PR brouillon et fichiers externes présents dans les sections antérieures ci-dessous sont des observations historiques, pas l’état courant. Les quatre documents interproduits retirés ne sont pas restaurés.

Le titre opérationnel Atelier est maintenant Fadi ; normes, fonctions industrielles, identifiants historiques et décisions restent conservés. Inventaire Mission 003 :1 283 fichiers scannés,488 touchés,1 887 lignes ; ce périmètre diffère du relevé historique 494/2 267. Le triage mécanique et la revue ciblée ne prouvent pas une purge sémantique exhaustive, notamment des 269 fiches et 176 fichiers de code. Le scanner nominal de 761 fichiers est vert, avec ses limites.

Prochaine action autorisée M08 : qualifier les références opérationnelles restantes et leurs liens, conserver la justification par fichier ; aucune suppression/renommage applicatif ni migration d’identifiant sans lot autorisé. M00/M29 publient ces pièces dans #165. Les deux checkpoints STATUS/HANDOFF sont actualisés ensemble ; aucune clôture de #147 ni intervention DrawAll.

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

## Vérification ciblée avant fusion — commit 4199f4f3ef94141117182bf7f4682648667b3995

- CI GitHub Actions : jobs validate, e2e et image terminés avec succès ; continuité de développement, inventaire DrawAll et isolation nominale également réussis. Les recettes P2 structure, mécanique, bois, tôlerie, réseaux, documentation et coordination ont été exécutées dans le job E2E.
- `apps/web/src/modules/atelier/nouveau/outils.ts` : `OUTILS[].id` est l'identifiant fonctionnel de l'outil, `fiche: "DA-…"` renvoie à une fiche de capacité historique. Exemples : `piece-mecanique` / `DA-10-01`, `assemblage` / `DA-10-06`, `poutre` / `DA-08-01`, `ossature` / `DA-09-07`, `tole` / `DA-11-01`, `segment-reseau` / `DA-12-04`. Les noms de fiches sont conservés pour la traçabilité ; ils ne doivent jamais servir de motif de suppression du code.
- `packages/atelier-model/src/modele.ts` : les mentions `DA-…` examinées dans les sections structure, bois, tôlerie et réseaux sont des commentaires de traçabilité ; elles n'établissent pas un import exécutable externe.
- `scripts/check-module-deps.mjs` vérifie les manifestes des packages et les imports transversaux entre les applications web et API. `scripts/check-fadi-isolation.mjs` recherche des références nominales dans certains fichiers sources. **Limite** : ces contrôles ne prouvent pas l'absence de toute dépendance indirecte ou de tout actif binaire externe.
- **Politique de compatibilité** : ne pas renommer les `DA-…` ni les noms de fiches, commandes, routes ou champs persistés lors de cette PR ; une migration future devra fournir une table de correspondance, des tests sur données historiques, import/export et rollback. Aucun changement de schéma fonctionnel dans le lot documentaire observé.
- **Réserve** : l'inventaire des 494 fichiers reste à qualifier individuellement ; aucune affirmation de purge exhaustive ne doit être déduite du succès du scanner.

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

## Complément Mission003 — seconde cohorte

A2 a effectivement relu20 autres documents/méta et43 occurrences, sans reprendre les23 fichiers nominaux/90 occurrences. Total43 fichiers/133 occurrences ;445 autres fichiers (176 code,269 fiches historiques) non qualifiés sémantiquement. Dix-neuf documents à conserver comme contrats/traces historiques, une réserve OCCT couverte par M06. [Preuve de cohorte](../../ai-team/reports/mission-003/A2/isolation-extra-docs-review.json). Aucune conclusion d’isolation exhaustive ; prochaine action A2 :176 fichiers code en lecture seule.
