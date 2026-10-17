# Purge des éléments DrawAll dans Fadi — Contexte

## Objectif

Séparer définitivement **Fadi** de **DrawAll**, autre application possédant son propre dépôt. N'effectuer **aucune modification du dépôt DrawAll**. Purger les artefacts DrawAll introduits dans Fadi, sans supprimer par simple association de nom les fonctionnalités Fadi actives avant examen de leur impact et du mandat fonctionnel.

## Périmètre

- Inclus : audits de dépôts, origine documentaire, liens normatifs à DrawAll dans Fadi, composants potentiellement transférés et dépendances ; changements uniquement sur `RachEma-ux/Fadi` en branche de travail.
- Exclus : opérations dans le dépôt DrawAll ; réécriture d'historique Git, suppression sur `main` sans tests et revue, changement de base de données de production, suppression d'un composant Atelier/Planche utilisé sans analyse ni décision.

## Sources canoniques

- `AGENTS.md` ; `CLAUDE.md` ; `docs/architecture.md`.
- [Issue #147](https://github.com/RachEma-ux/Fadi/issues/147) : mandat de décontamination.
- `docs/atelier/decisions.md`, `docs/atelier-cahier-des-charges.md`, `docs/atelier-cahier-p2.md`, `docs/atelier-drawall.md`, `docs/drawall/` : références actuellement présentes à examiner, **pas** une nouvelle autorisation de livrer leurs fonctions.
- `docs/planche/`, `apps/web/src/modules/atelier/`, `packages/atelier-model/`, `apps/api/src/routes/atelier-*.ts` : composants Fadi actifs à cartographier.

## Contraintes

- Dans les messages de fin de travail, distinguer : « copie externe retirée », « citation réécrite », « fonction Fadi maintenue », « fonction Fadi proposée à supprimer ».
- Préserver les preuves et décisions historiques comme faits datés jusqu'à décision explicite d'archivage ou de correction ; ne pas attribuer rétroactivement une autre origine à une capacité déjà implémentée.
- Aucune action GitHub sur `DrawAll` : ni appel de modification, ni commit, ni PR.
- Pas de déploiement sur Fadi-Serv avant validation et sauvegardes.

## Hypothèses et questions ouvertes

- « Élément relatif à DrawAll » recouvre-t-il également les **fonctionnalités Fadi déjà exposées** (mécanique, tôlerie, réseaux, ontologies P2), ou seulement les documents, noms et liaisons à l'autre dépôt ? La frontière métier doit être arbitrée sur une matrice de fonctionnalités, sans déduire qu'une fonctionnalité est étrangère à Fadi du seul préfixe `DA-`.
- La provenance et la licence des fichiers repris doivent être confirmées avant d'affirmer leur appartenance exclusive à l'autre application.
