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

- La décision de conservation des fonctions et normes est prise. Restent à auditer : les dépendances implicites, les références historiques et les licences applicables, puis la migration non destructive des identifiants et cahiers.

## Décision de périmètre — maître d'ouvrage, 17 octobre 2026

- **Conserver intégralement les fonctionnalités industrielles présentes dans Fadi**, notamment mécanique, assemblages, structure, bois, tôlerie, réseaux/MEP, géométrie et outils CAO ; leur statut devient **natif Fadi** et non dépendant de l'application distincte.
- **Conserver toutes les règles normatives de dessin applicables à Fadi**, avec leurs exigences, unités, tolérances, représentations, symboles, vérifications et références normatives pertinentes. Ne pas confondre norme technique (p. ex. IFC, ISO, conventions de cotation) et produit DrawAll.
- Adapter les cahiers Atelier, Planche et P2, les décisions, les identifiants et les tests à une définition **autonome et documentée dans Fadi**, tout en conservant les faits historiques et les sources légitimes des normes ; aucune réattribution mensongère d'origine ou de licence.
- Purger toute référence ou dépendance *au produit DrawAll* dans la documentation opérationnelle et le code Fadi. Toute transformation des identifiants `DA-...` devra être précédée d'un inventaire de leurs usages dans les données, exports, API et tests, avec compatibilité de migration.
- Ne supprimer **aucune fonction industrielle ni règle de dessin** et ne modifier en aucun cas le dépôt DrawAll.
