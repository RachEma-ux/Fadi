# Continuité de développement — Fadi

## But et limite

Permettre de reprendre un chantier après la perte d'une session ChatGPT, Claude Code ou Codex, un changement d'agent, un changement d'appareil ou une interruption réseau. **Le dépôt GitHub conserve des faits et des décisions explicites, pas l'état interne ou le raisonnement caché de l'IA.** Aucune promesse de mémoire intégrale entre sessions.

Ce cadre complète les référentiels déjà présents ; il ne les remplace pas.

## Sources et préséance

1. **Code et tests du commit vérifié** : constat de l'implémentation réelle, jamais automatiquement une preuve de conformité métier.
2. **`AGENTS.md`** : règles communes non négociables (21 étapes, langues, géométrie, tests, secrets).
3. **`CLAUDE.md`** : consignes supplémentaires pour Claude Code ; il renvoie à `AGENTS.md`.
4. **`docs/architecture.md`** : architecture de référence actuellement documentée ; toute modification du cadre doit être décidée, pas présumée.
5. **Cahiers, décisions et comptes rendus métier existants** : notamment `docs/atelier/decisions.md`, `docs/atelier/`, `docs/planche/` et `docs/migration/matrix.md`. Ne pas dupliquer ni renuméroter leurs décisions.
6. **GitHub Issues / PR / commits / CI** : tâches et preuves de réalisation. Une PR ouverte n'est pas une modification fusionnée.
7. **`docs/workstreams/<chantier>/`** : contexte de travail, statut et point de reprise du chantier.

Si deux sources se contredisent, consigner la divergence comme `BLOQUÉ` dans le chantier et demander arbitrage. Ne pas résoudre implicitement la contradiction.

## Objets de travail et conventions

| Objet | Rôle | Durée |
| --- | --- | --- |
| Chantier (`docs/workstreams/<slug>`) | Sujet durable, contexte et progrès | Jusqu'à clôture du chantier |
| GitHub Issue | Une demande traçable, exigences et acceptation | Une unité de travail |
| Branche | Un changement cohérent issu de `main` à date vérifiée | Courte, jusqu'à fusion |
| Pull Request | Revue du diff, des preuves, des risques et décision de fusion | Jusqu'à revue/fusion |
| `CONTEXT.md` | But, périmètre, contraintes et sources | Relativement stable |
| `TASKS.md` | Travail découpé, état explicite, liens aux Issues | Mis à jour à chaque jalon |
| `STATUS.md` | Synthèse factuelle des vérifications et blocages | Mis à jour à chaque checkpoint |
| `HANDOFF.md` | Transfert de contrôle à la prochaine session/agent | Mis à jour avant chaque interruption |
| ADR | Justification des décisions structurantes non déjà consignées ailleurs | Immuable après acceptation ; nouvelle ADR pour révision |

Nommage conseillé : `feat/<issue>-<sujet>`, `fix/<issue>-<sujet>`, `chore/<issue>-<sujet>`, `docs/<issue>-<sujet>`. Si une branche historique ne respecte pas ce modèle, ne pas la renommer automatiquement. Une **Issue par tâche ou lot borné**, pas une branche permanente par module.

## Workflow obligatoire

1. **Cadrer** : identifier le chantier existant, lire ses documents, ouvrir/relier une Issue. Si la demande change l'architecture, distinguer « à définir » de « approuvé ».
2. **Préparer** : lire `AGENTS.md` et les sources métier concernées ; vérifier la branche, le HEAD, l'Issue, les autres PR ouvertes et l'état de la CI.
3. **Implémenter** : une branche par unité de travail cohérente, commits fréquents ; pas de changements non autorisés dans `main` ni sur le VPS de production.
4. **Contrôler** : tests pertinents (`npm run typecheck`, `npm test`, `npm run build` si code concerné), CI, scénarios métier ; distinguer « codé », « testé », « déployé » et « accepté ».
5. **Checkpoint** : actualiser `TASKS.md`, `STATUS.md` et `HANDOFF.md` ; pousser le commit et vérifier sa présence sur GitHub. Si l'on manque de temps, une note datée dans la PR est préférable à un progrès non enregistré.
6. **Revoir** : PR avec `Closes #...` lorsque pertinent, risques, preuves, conditions de retour arrière et approbation humaine si requis.
7. **Fusionner** : uniquement selon les protections/permissions effectivement configurées et les décisions d'acceptation ; la présence d'une CI verte ne vaut pas acceptation du métier.
8. **Reprendre** : lire `HANDOFF.md`, puis vérifier **à nouveau** GitHub, le code et les tests ; corriger tout état périmé avant d'agir.

Faire un checkpoint **avant** toute opération destructrice/migration ou déploiement, après un test significatif, lors d'un blocage, après un changement de décision, et avant la fin d'une session prolongée. Il n'existe pas de sauvegarde automatique magique de la conversation.

## États contrôlés

- `À définir` : périmètre ou décision non établi.
- `À faire` : tâche cadrée mais non commencée.
- `En cours` : modification commencée.
- `Implémenté` : code produit, sans preuve de succès suffisante.
- `Vérifié` : vérifications nommées et datées effectuées.
- `Bloqué` : obstacle explicite ; ne pas supposer qu'il est résolu.
- `Accepté` : validation explicite du responsable lorsqu'elle est requise.

Une preuve (commit, CI, journal, fichier, capture ou revue) doit accompagner `Vérifié`. Un résultat d'une ancienne session ne devient pas automatiquement un résultat actuel.

## Reprise après perte de session

1. Ouvrir le dépôt et la fiche du chantier à partir de [l'index](../workstreams/README.md).
2. Lire `HANDOFF.md`, `STATUS.md`, puis `TASKS.md` et `CONTEXT.md`.
3. Examiner l'Issue, la PR, le SHA du dernier commit cité, les checks GitHub **actuels** et les éventuelles modifications récentes de `main`.
4. Comparer les faits observés au journal ; marquer tout écart comme incertain, ne pas reproduire aveuglément une commande ancienne.
5. Poursuivre uniquement l'**action suivante autorisée**, vérifier puis enregistrer un checkpoint.

**Exemple de commande de reprise à un agent** :

> Reprends le chantier `architecture-webapp` dans `RachEma-ux/Fadi`. Lis `AGENTS.md`, `CLAUDE.md`, `docs/workstreams/architecture-webapp/{CONTEXT,TASKS,STATUS,HANDOFF}.md` et les Issues/PR citées. Vérifie HEAD et CI actuels, signale les divergences, puis propose ou exécute uniquement la prochaine action autorisée. N'invente aucune décision d'architecture.

## Contrôle et création des dossiers

- `node scripts/check-continuity.mjs` : validation structurelle des chantiers, sans accès réseau.
- `node --test scripts/check-continuity.test.mjs` : tests du validateur.
- `node scripts/continuity.mjs status architecture-webapp` : résumé local du point de reprise.
- `node scripts/continuity.mjs init <slug> <issue-number>` : dossier de nouveau chantier basé sur les modèles. **Ne crée aucune branche GitHub**, Issue ou PR : ces actions restent explicites.

Les contrôles structurels valident la présence et la forme ; ils **ne peuvent pas prouver** que les faits inscrits sont vrais ou à jour. La revue humaine de ces faits reste obligatoire.

## Sécurité et exploitation

Dépôt public : ne jamais inscrire dans les fichiers de chantier des clés SSH, URLs de ping secrètes, mots de passe, données personnelles de projets ou détails privés de clients. Préférer des références à des fichiers secrets protégés plutôt que leur contenu. Les sauvegardes Restic/Swiss Backup et la CI/CD ont leurs propres dossiers et PR ; les répliquer ici uniquement par lien et état vérifiable.
