# Passage de relais ChatGPT ↔ Codex — Fadi

> **Statut :** document de coordination, à valider en Pull Request.  
> **Dernière synthèse :** 18 octobre 2026.  
> **Dépôt :** [RachEma-ux/Fadi](https://github.com/RachEma-ux/Fadi) (public).  
> **Suivi de création :** [Issue #153](https://github.com/RachEma-ux/Fadi/issues/153).

## 1. Objet et limites

Ce document transmet un **contexte de travail explicite** entre ChatGPT, Codex et les intervenants autorisés : objectifs, décisions connues, actions permises, états, preuves et prochaines étapes. Il évite de dépendre de l'ouverture automatisée d'un lien de conversation ChatGPT, qui peut renvoyer HTTP 403.

- **Ce n'est pas** une copie intégrale des conversations, une mémoire complète, une autorisation d'exécuter des modifications, ni une source de vérité supérieure aux référentiels Fadi.
- La présence de ce fichier **ne synchronise pas automatiquement** les conversations ChatGPT et Codex. Sa mise à jour est volontaire, versionnée et revue.
- Les observations rapportées dans une conversation (y compris des captures d'écran) restent **à revérifier** contre GitHub, les journaux et l'environnement courant avant d'être déclarées « Vérifié ».
- **Dépôt public :** ne jamais placer ici de secrets, clés, jetons, URLs de supervision privées, informations personnelles, données clients, journaux sensibles ou liens de conversation privés.

## 2. Références canoniques à consulter en premier

1. [`AGENTS.md`](../../AGENTS.md) — règles de développement Fadi et permissions.
2. [`docs/continuity/README.md`](../continuity/README.md) — protocole de reprise, statuts et hiérarchie des sources.
3. [`docs/architecture.md`](../architecture.md) — architecture métier et technique de référence ; toute modification exige un arbitrage.
4. [`docs/workstreams/README.md`](../workstreams/README.md), puis le `CONTEXT.md`, `TASKS.md`, `STATUS.md` et `HANDOFF.md` du chantier concerné.
5. Issues, PR, commits, contrôles CI et cahiers/décisions métier existants — preuves et états réels.

**En cas de divergence :** ne pas trancher silencieusement. Marquer le point « Bloqué », citer les sources contradictoires et demander une décision. Les documents `STATUS.md` et `HANDOFF.md` d'un chantier restent les points de reprise canoniques ; ce fichier sert uniquement de **passerelle transversale**.

## 3. Cadre du produit à préserver

- Fadi est une application **modulaire**, suivant l'architecture de référence documentée ; ne pas introduire une refonte monolithique ou des microservices sans décision.
- Préserver les **21 étapes Parcours (01–21)**, leurs libellés et l'intégration d'Harmonie dans les étapes concernées.
- Préserver la séparation du modèle de géométrie et de React, la traçabilité des données et les invariants métiers.
- Préserver les sept modules métier : Projets et sources, Parcours, Programmation, Atelier architectural, Analyses métier, Documents, Collaboration.
- **DrawAll reste un autre dépôt et une autre application.** Ne pas le modifier ni créer de dépendance de Fadi vers DrawAll. Conserver dans Fadi les fonctions industrielles et règles normatives légitimes comme capacités **natives Fadi**, conformément aux arbitrages documentés.
- Pour les changements applicatifs, appliquer les vérifications pertinentes : `npm run check:deps`, `npm run typecheck`, `npm test`, `npm run build`, ainsi que les recettes métier/E2E concernées.
- Respecter le français comme langue source des textes d'interface et les traductions prévues par `AGENTS.md`.

## 4. Organisation cible de l'équipe IA (proposition, non déploiement constaté)

| Rôle | Mission | Activation |
| --- | --- | --- |
| A0 — Coordinateur | Planifier, affecter, consolider, contrôler preuves et dépendances | À chaque mission coordonnée |
| A1 — Produit / Méthodologie | Besoins, spécifications, critères d'acceptation | Si le besoin doit être cadré |
| A2 — Architecture | Limites des modules, contrats, dépendances, décisions techniques | Si une architecture est concernée |
| A3 — Développement | Implémentation, corrections et proposition de PR | Si un changement de code est autorisé |
| A4 — UX/UI | Maquettes, ergonomie, navigation, cohérence de présentation | Si l'interface est concernée |
| A5 — Qualité / Tests | Non-régression, qualité, sécurité, résultats CI | Si une vérification est requise |
| A6 — DevOps | Environnements, CI/CD, exploitation, sauvegardes | Si l'infrastructure est concernée |

**Principe :** n'activer que les rôles nécessaires. ChatGPT peut cadrer et superviser ; Codex peut exécuter des tâches de code isolées. Le coordinateur automatique persistant et les délégations interagents constituent une **architecture envisagée**, pas une fonctionnalité dont l'installation est ici attestée.

## 5. Point de situation transmis depuis ChatGPT

### 5.1 Environnement Codex Cloud Fadi

- **Cible :** environnement `Fadi` associé exclusivement à `RachEma-ux/Fadi`, branche `main`.
- **Résultats rapportés par Codex dans une capture partagée le 18/10/2026 :** dépendances et PostgreSQL/PostGIS préparés ; contrôles TypeScript et build réussis ; **1 757 tests passés et 1 ignoré** ; démarrage, santé de base et protections d'authentification vérifiés.
- **Limites signalées dans la même capture :** recettes navigateur complètes et IFC non exécutées ; instructions réutilisables annoncées ; fichier de préparation `fadi-cloud-db.sh` présenté comme modifié dans la session.
- **État de publication :** **non confirmé** dans les informations transmises. Un rapport de configuration réussi **n'est pas** une preuve de publication Cloud.
- **Portée de la preuve :** informations issues de la conversation et de captures ; **pas encore recontrôlées ici** sur une session Cloud publiée ou sur l'état CI du dernier commit.

### 5.2 Liens et dépendances de suivi

- [Issue #144](https://github.com/RachEma-ux/Fadi/issues/144) : protocole de continuité existant (ne pas le remplacer).
- [Issue #146](https://github.com/RachEma-ux/Fadi/issues/146) : vérification/configuration des protections de `main`, hors de la portée de ce document.
- [Issue #147](https://github.com/RachEma-ux/Fadi/issues/147) : séparation des éléments DrawAll et Fadi ; revérifier l'état actuel.
- [Issue #149](https://github.com/RachEma-ux/Fadi/issues/149) : ordre de validation décontamination → production approuvée et recette utilisateur → sauvegarde → audit d'architecture → lots suivants. Ne pas considérer ces jalons comme réalisés sans preuves et acceptation.
- [Issue #153](https://github.com/RachEma-ux/Fadi/issues/153) : création du présent passage de relais.

**Distinction essentielle :** un diagnostic initial **en lecture seule**, destiné à préparer l'environnement Codex, ne vaut ni autorisation de correction ni acceptation anticipée d'un jalon de l'Issue #149.

## 6. Prochaines actions autorisées / à confirmer

| Étape | Action | État à la rédaction | Autorisation |
| --- | --- | --- | --- |
| 1 | Examiner les éventuelles alertes de configuration Codex et le script `fadi-cloud-db.sh` sans publier de code | À vérifier | Lecture et diagnostic |
| 2 | Vérifier l'enregistrement puis la **publication réelle** de l'environnement `Fadi` | Non confirmé | Configuration Cloud, sans accès à la production |
| 3 | Réaliser un **audit initial en lecture seule** de Fadi (architecture, isolation, tests, CI, continuité) | À faire | Lecture, tests locaux non destructifs et rapport |
| 4 | Produire un plan priorisé P0–P3, preuves, dépendances et tâches potentiellement parallélisables | À faire | Proposition uniquement |
| 5 | Modifier le code, ouvrir des PR de correction, fusionner, ou déployer | Non autorisé par ce document | Accord distinct selon l'action |

Une fois un état confirmé, le reporter dans l'Issue ou le chantier correspondant avec **date, SHA, lien de CI/PR, résultat et limites**. Ne pas promouvoir un constat « rapporté » au rang de « Vérifié » sans sa preuve.

## 7. Workflow de transmission et de reprise

1. **ChatGPT / responsable :** formuler la mission, son périmètre, les permissions et les critères d'acceptation ; ne transmettre dans GitHub que le résumé non sensible nécessaire.
2. **Codex :** lire les sources de la section 2, vérifier `main`, le chantier, les Issues/PR ouvertes et les contrôles CI ; signaler les écarts entre le présent document et l'état actuel.
3. **Exécution autorisée :** utiliser le cycle **Issue → branche courte → PR → preuves → revue** ; ne jamais pousser directement dans `main`.
4. **Checkpoint :** actualiser les documents du chantier, spécialement `STATUS.md` et `HANDOFF.md` dans la même PR en cas de modification de `docs/workstreams/<chantier>/`.
5. **Relais :** mettre à jour ce fichier **seulement** lorsqu'un changement transverse ChatGPT–Codex le justifie, sans recopier les cahiers, décisions ou journaux existants.
6. **Approbation :** la CI verte prouve une vérification technique, **pas** l'acceptation métier. Toute fusion exige les autorisations prévues ; production, migrations sensibles et changements de sauvegardes exigent une validation explicite.

### Fiche minimale à inclure dans un prochain relais

```text
Mission / Issue :
Chantier :
Date et source :
Objectif et périmètre :
Autorisation reçue / opérations interdites :
État : À définir | À faire | En cours | Implémenté | Vérifié | Bloqué | Accepté
Branche / PR / SHA :
Tests et preuves (liens, résultats, limites) :
Décisions actées (référence canonique) :
Blocages / divergences :
Prochaine action autorisée :
Responsable de validation :
```

## 8. Instruction de démarrage à transmettre à Codex

> Lis `AGENTS.md`, `docs/continuity/README.md` et `docs/ai-team/CHATGPT-CODEX-HANDOFF.md`, puis consulte les fiches canoniques du chantier et les Issues/PR citées. Contrôle l'état réel du dépôt et de la CI. Signale tout fait non vérifié. Dans un premier temps, établis l'état de publication de l'environnement Cloud Fadi, puis prépare un audit initial **en lecture seule**. Ne modifie ni le dépôt DrawAll, ni `main`, ni la production ; n'entreprends aucune correction ou fusion sans autorisation.

---

*Document de transfert transversal. Maintenu par PR. La source de vérité du travail accompli demeure le code et les preuves datées du dépôt.*
