## Objet et traçabilité

- Issue liée : Refs #NN (remplacer NN ; utiliser `Closes #NN` uniquement si cette PR termine effectivement l'Issue).
- Chantier : `docs/workstreams/<slug>/` (ou expliquer pourquoi non applicable).
- Source de vérité / décisions : liens vers `AGENTS.md`, `docs/architecture.md` et cahiers/ADR pertinents.

## Unité de travail (protocole Studio, PR-01 à PR-09)

<!-- Obligatoire pour toute PR qui touche le chantier Studio (Studio/, docs/workstreams/studio/, docs/ai-team/, modules et
paquets Studio, recettes studio-*) : contrôlé par le workflow « PR — protocole Studio » (scripts/registre/controle-pr.mjs).
Branche : nommage conseillé feat|fix|chore|docs/<issue>-<sujet> (décision P-13 : un autre nom est signalé, l’Issue propre reste exigée). Renseigner chaque champ ; « Non » ou « Non applicable : raison » sont admis. -->

- **Issue de l’unité de travail** : Refs #NN
- **Besoin** :
- **Sources** :
- **Identifiants d’exigences** :
- **Périmètre inclus** :
- **Périmètre exclu** :
- **Composant** :
- **Contrats** :
- **Décisions** :
- **Migrations** :
- **Scénarios positifs** :
- **Scénarios négatifs** :
- **Preuves attendues** :
- **Retour arrière** :
- **Codé** :
- **Testé** : <!-- tests et recettes exécutés (fichier, commande, exécution de CI) ; une capture d’écran n’est pas une preuve métier -->
- **Déployé** :
- **Accepté** :
- **Revalidation à la reprise** : HEAD de main `<sha>` revalidé ; CI : <URL de l’exécution>

## Changements proposés

- Modifications réalisées :
- Comportements et données inchangés :
- Écarts ou limites connus :

## Vérifications et preuves

- [ ] `npm run typecheck` exécuté si code concerné (ou exception expliquée).
- [ ] `npm test` exécuté si code concerné (ou exception expliquée).
- [ ] `npm run build` exécuté si code concerné (ou exception expliquée).
- [ ] E2E / tests spécifiques pertinents exécutés (ou non-applicabilité expliquée).
- [ ] CI du **dernier commit** vérifiée ; échecs signalés.
- [ ] Aucun secret, identifiant, dump, capture privée ou artefact généré ajouté.

**Commandes, résultats, date, SHA du commit :**

## Checkpoint obligatoire pour tout chantier touché

- [ ] `TASKS.md` synchronisé avec le travail réel.
- [ ] `STATUS.md` mis à jour (faits vérifiés / points ouverts).
- [ ] `HANDOFF.md` mis à jour (branche, PR, dernière preuve et prochaine action).
- [ ] Éventuelle décision d'architecture renvoyée au journal canonique / ADR (pas de doublon).
- [ ] Le travail « implémenté » n'est pas déclaré « vérifié » sans preuve.

## Livraison et risques

- Impact API / base de données / modèle / interfaces :
- Stratégie de retour arrière :
- Approbation requise avant fusion ou déploiement :
- Déploiement réalisé ? **Non, tant qu'il n'est pas explicitement exécuté et vérifié**.

> Une PR n'est pas un déploiement ; une CI verte n'est pas une acceptation métier. À la reprise, relire l'Issue et le dernier `HANDOFF.md` puis vérifier l'état réel de GitHub.
