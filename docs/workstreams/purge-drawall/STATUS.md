# Purge DrawAll dans Fadi — Statut

Mis à jour : 2026-10-17 (UTC).

## État

**En cours — audit initial et séparation des risques.** Purge de code non encore autorisée au niveau de ses impacts fonctionnels.

## Faits vérifiés

- Sur `main`, l'arbre Git de `RachEma-ux/Fadi` compte 1538 éléments (fichiers et répertoires) au moment de l'audit ; 3 documents `docs/drawall/` et 269 fiches `docs/atelier/fiches/DA-*.md`.
- Des références DrawAll apparaissent dans `README.md`, `CLAUDE.md`, `docs/architecture.md`, `docs/atelier-cahier-des-charges.md`, `docs/atelier-cahier-p2.md`, `docs/atelier/README.md` et `docs/atelier-drawall.md`.
- Plusieurs fiches DA relient des commandes `atelier.*` à des tests Fadi et à des décisions historiques ; elles ne sont donc pas toutes des copies autonomes éliminables sans examen.
- Des fichiers actifs ont été observés dans `packages/atelier-model/src/ontologies/`, des routes `apps/api/src/routes/atelier-*.ts` et des panneaux `apps/web/src/modules/atelier/nouveau/panneaux/`.
- `main` reste source de production ; aucune modification n'a été effectuée sur le dépôt DrawAll.

## Points ouverts

- Audit automatique exhaustif des références textuelles et du code non encore produit.
- Décider du retrait des fonctions industrielles introduites dans Fadi lors des phases P2 : mécanique, tôlerie, MEP, etc., après cartographie.
- Éviter de confondre réécriture du nom DrawAll et suppression effective des dépendances.

## Liens de suivi

- [Issue #147](https://github.com/RachEma-ux/Fadi/issues/147) — mandat.
- Branche : `chore/147-remove-drawall-contamination`.
- PR : à créer, sans modification de production.

## Préconditions de clôture

- Inventaire exhaustif, choix de périmètre, suppression contrôlée et preuves de conformité.
- Tests et critères métier des fonctions Fadi restantes vérifiés.
