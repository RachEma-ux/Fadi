# Purge DrawAll dans Fadi — Reprise de session

Mis à jour : 2026-10-18 (UTC).

## Actualisation Mission 003 — 18 octobre 2026

La PR #148 est fusionnée depuis le 17 octobre 2026 au commit `5cf61d1fed9ed523b331228af20bce93a4f2bf63` ; #147 reste ouverte. Les mentions de PR brouillon et fichiers externes présents dans les sections antérieures ci-dessous sont des observations historiques, pas l’état courant. Les quatre documents interproduits retirés ne sont pas restaurés.

Le titre opérationnel Atelier est maintenant Fadi ; normes, fonctions industrielles, identifiants historiques et décisions restent conservés. Inventaire Mission 003 :1 283 fichiers scannés,488 touchés,1 887 lignes ; ce périmètre diffère du relevé historique 494/2 267. Le triage mécanique et la revue ciblée ne prouvent pas une purge sémantique exhaustive, notamment des 269 fiches et 176 fichiers de code. Le scanner nominal de 761 fichiers est vert, avec ses limites.

Prochaine action autorisée M08 : qualifier les références opérationnelles restantes et leurs liens, conserver la justification par fichier ; aucune suppression/renommage applicatif ni migration d’identifiant sans lot autorisé. M00/M29 publient ces pièces dans #165. Les deux checkpoints STATUS/HANDOFF sont actualisés ensemble ; aucune clôture de #147 ni intervention DrawAll.

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
- Cinq occurrences nominales dans les sources ont été corrigées et un garde-fou CI vérifie les sources Fadi. **Les trois documents `docs/drawall/` et `docs/atelier-drawall.md` sont désormais supprimés de la branche Fadi uniquement**, avec mise à jour des principaux liens entrants. Le dépôt DrawAll est inchangé.
- La suppression d'une référence historique et celle d'une fonction actuellement utilisée sont deux opérations différentes.

## Prochaine action

1. Examiner le rapport `fadi-drawall-inventory`, notamment les 180 fichiers de code (majoritairement des identifiants `DA-...`) et les 269 fiches ; suivre l'audit dans l'Issue #147.
2. Établir la matrice `RETIRER / ADAPTER / CONSERVER (Fadi) / ARBITRER` à la granularité fichier/fonction et relever les liens entrants vers les trois documents purs DrawAll.
3. **Décision reçue** : toutes les fonctions industrielles et les règles normatives de dessin sont conservées comme natives à Fadi. Adapter les cahiers, décisions, tests et intégrations ; inventorier les identifiants avant toute migration compatible.
4. Effectuer la purge documentaire et fonctionnelle validée, réparer les consommateurs, lancer CI complète et ouvrir la revue de fusion.

## Décision de reprise

- 17 octobre 2026 : l'utilisateur confirme explicitement le maintien des fonctions industrielles **et** des règles normatives de dessin comme capacités natives Fadi ; aucun lien DrawAll et aucun changement au dépôt DrawAll. Ne pas rouvrir cette question comme une incertitude.

## Tests et preuves

- GitHub tree `main` et fichiers README/cahiers consultés directement le 17 octobre 2026.
- Workflow GitHub d'audit : réussi, inventaire seul sans suppression ; CI applicative de la PR #148 à vérifier sur son dernier commit.
- Tests de suppression fonctionnelle : non exécutés, aucun retrait de fonction encore effectué.

## Risques et blocages

- L'effacement global de `docs/atelier/` ou `packages/atelier-model/` casserait des composants Fadi et perdrait l'historique d'acceptation.
- Des imports, routes, modèles persistés et migrations pourraient encore dépendre des fonctionnalités industrielles ; non vérifié.
- Périmètre fonctionnel clarifié : interdiction de supprimer les fonctions industrielles ou règles normatives de dessin. Les éventuels changements d'identifiants exigent des tests de compatibilité.

## Arrêt sûr

Fadi-Serv et la branche `main` restent inchangés. Tout audit est en lecture seule dans le dépôt Fadi ; aucune opération sur DrawAll.

## Complément Mission003 — seconde cohorte

A2 a effectivement relu20 autres documents/méta et43 occurrences, sans reprendre les23 fichiers nominaux/90 occurrences. Total43 fichiers/133 occurrences ;445 autres fichiers (176 code,269 fiches historiques) non qualifiés sémantiquement. Dix-neuf documents à conserver comme contrats/traces historiques, une réserve OCCT couverte par M06. [Preuve de cohorte](../../ai-team/reports/mission-003/A2/isolation-extra-docs-review.json). Aucune conclusion d’isolation exhaustive ; prochaine action A2 :176 fichiers code en lecture seule.

## Reprise de la cohorte initiale complète

A2 a poursuivi les176 fichiers code (452 lignes),269 fiches (853 lignes) et449 lignes supplémentaires des documents nominaux. Union vérifiée A0 :1887/1887 paires fichier-ligne uniques, zéro manque/doublon ; [preuve](../../ai-team/reports/mission-003/validation-M08-A0.json). Les paragraphes précédents sont des étapes datées du tri. Aucune autonomie exhaustive ni conformité fonctionnelle déduite ;125 chemins absents dans69 fiches, un abrégé et DA-09-09 prospectif restent à qualifier/rapprocher. #147 reste ouverte, prochaine action A2 : mapping des références selon leur rôle sans réécriture historique.
