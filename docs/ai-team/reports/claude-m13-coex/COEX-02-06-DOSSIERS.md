# COEX-02 à COEX-06 — dossiers de coexistence Atelier ↔ Studio

**Tâches :** COEX-02 à COEX-06, checklist lignes 194 à 198. Sources : Plan §3.3 et §8.2.
**Commit lu :** `main@817bd36e7d4b1ab60ab9c00309509c7cdfed0798`. Exécutant : Claude Code, hors équipe Codex.
Liens : `P` = `https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798`.

| ID | Nature de l'intitulé | Ce que livre ce dossier | Statut proposé |
|---|---|---|---|
| COEX-02 | « Prévoir » | Inventaire vérifié des accès historiques et contrat de non-suppression pour le lot I | **Vérifié (documentaire)** |
| COEX-03 | « Choisir » | Inventaire des jeux de données avec leurs écrivains actuels, et options | **En cours** — décision demandée |
| COEX-04 | « Décider » | Options, précédents dans le code et recommandation | **En cours** — décision demandée |
| COEX-05 | « Interdire » | Distinction entre les mécanismes actuels et une synchronisation artisanale ; règle proposée | **En cours** — ratification demandée |
| COEX-06 | « Conditionner » | Porte de retrait en trois conditions vérifiables, avec le précédent du lot 4 | **En cours** — ratification demandée |

---

## COEX-02 — Prévoir l'ajout de Studio sans suppression immédiate des accès historiques

### Accès historiques à l'Atelier relevés au `817bd36`

Le lot I devra les **laisser fonctionner tous**, avec leur comportement actuel.

| # | Accès | Preuve |
|---|---|---|
| H01 | Module projet `?module=atelier` (bouton de `ProjectModuleNav`, validé contre `MODULES`) | [ProjectShell.tsx#L54](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L54), [#L150-L158](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L150-L158), [ProjectModuleNav.tsx#L25](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectModuleNav.tsx#L25) |
| H02 | Étapes 10 et 11 du Parcours (l'Atelier dans l'étape) | [ParcoursModule.tsx#L232-L234](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/parcours/ParcoursModule.tsx#L232-L234) |
| H03 | Recherche de projet (entrée « Atelier » du projet) | [SearchDialog.tsx#L21](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/accueil/SearchDialog.tsx#L21) |
| H04 | Tableau de bord du dossier (« Ouvrir l'Atelier », reprise du travail en cours) | [dossier-state.ts#L58](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/accueil/dossier-state.ts#L58), [DossierDashboard.tsx#L121](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/accueil/DossierDashboard.tsx#L121) |
| H05 | Historique (événements modèle et enregistrement → Atelier) | [history-view-model.ts#L65](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/accueil/history-view-model.ts#L65) |
| H06 | Notifications (modification, verrou) | [NotificationBell.tsx#L23](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/components/NotificationBell.tsx#L23) |
| H07 | Panneau des conflits (« ouvrir l'Atelier ») | [ConflictPanel.tsx#L180](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/components/ConflictPanel.tsx#L180) |
| H08 | Collaboration (lien vers une révision de l'Atelier) | [CollaborationModule.tsx#L74](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/collaboration/CollaborationModule.tsx#L74) |
| H09 | Programmation (« Comparer au modèle dessiné ») | [ProgrammeLinks.tsx#L59](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/programmation/ProgrammeLinks.tsx#L59) |
| H10 | Paramètres (« Ouvrir l'Atelier du projet ») | [ParametresPage.tsx#L150](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ParametresPage.tsx#L150) |
| H11 | Versions et variantes (ouverture d'une variante, qui est un projet, dans l'Atelier) | [Versions.tsx#L315](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/atelier/nouveau/panneaux/Versions.tsx#L315) |
| H12 | Pilotage (capacité `atelier-core` → module `atelier`) | [capabilities.ts#L19](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/modules/pilotage/capabilities.ts#L19) |
| H13 | API `/projects/:projectId/atelier/*` : modèle, commandes, journal, versions, publications, verrous, exports, solides exacts, graphes | [atelier-commands.ts#L1-L12](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/routes/atelier-commands.ts#L1-L12) et les routes `atelier-*.ts` |
| H14 | Liens profonds déjà diffusés (`/projets/:id?module=atelier`, `?etape=10`) | Forme d'URL de H01 et H02 ; un chemin inconnu est redirigé vers `/accueil` ([App.tsx#L86-L87](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L86-L87)) |

Méthode : `grep -rn "module=atelier|selectModule(\"atelier\")"` dans `apps/web/src`, hors tests, puis lecture de chaque occurrence. Les routes API sont relevées dans `apps/api/src/routes/atelier-*.ts`.

### Contrat proposé pour le lot I

Il découle du Plan §3.3, de MIG-COEX-07 et de NAV-009.

1. Le lot I **ajoute** des routes Studio et une entrée dans la barre verticale. Il ne retire, ne renomme ni ne redirige aucun des accès H01 à H14.
2. Les liens H03 à H12 continuent de viser l'Atelier tant qu'aucune décision COEX-04 ou MIG-COEX-05 ne s'applique à un périmètre donné.
3. NAV-009 couvre la non-régression : Accueil, Projets, Parcours, Atelier et Collaboration conservent leurs parcours testés (`apps/web/e2e/parcours-scenario.mjs`, `accueils-design.mjs`).
4. Toute suppression d'écran, de route ou de stockage est un lot ultérieur, autorisé explicitement (MIG-COEX-07), et soumis à la porte de COEX-06.

**Pourquoi COEX-02 peut être « Vérifié (documentaire) ».** L'intitulé demande de *prévoir* l'ajout sans suppression immédiate. La prévision est maintenant concrète : les 14 accès sont inventoriés avec leur preuve, et le contrat est rédigé. Ce statut ne vaut **ni recette NAV-009 exécutée, ni lot I réalisé**.

---

## COEX-03 — Choisir un propriétaire d'écriture unique pour chaque jeu de données pendant la coexistence

### Écrivains actuels côté serveur

Méthode : recherche de `insert(`, `update(` et `delete(` par table dans `apps/api/src`, hors tests.

| Jeu de données | Tables | Écrivain(s) au `817bd36` |
|---|---|---|
| Modèle typé de l'Atelier | `atelier_niveaux`, `_objets`, `_relations`, `_definitions`, `_calques`, `_groupes`, `_references`, `_problemes`, `atelier_site` | `lib/atelier-modele.ts` seul, appelé par le service de commandes et par les imports contrôlés (archive, exemples, bascule). Règle R9 ([cahier #L118](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/docs/atelier-cahier-des-charges.md#L118)). |
| Journal et boîte de sortie | `atelier_commands`, `atelier_outbox` | Validation des commandes (`lib/atelier-validation.ts`), archive, exemples, bascule ; `lib/atelier-events.ts` |
| Versions, volumes, variantes, publications, verrous | `atelier_versions`, `volumes`, `atelier_variants`, `atelier_publications`, `atelier_locks`, `atelier_lock_events` | `lib/atelier-versions.ts` et `routes/atelier-versions.ts` |
| Automatisation | `atelier_scripts`, `atelier_propositions` | `routes/atelier-automatisation.ts` |
| Documents | `produced_documents`, `drawing_exports` | `lib/documents.ts`, `routes/documents.ts` |
| Projet (dont `model_revision`) | `projects` | 12 fichiers. `model_revision + 1` n'est écrit que dans la transaction de commande ([atelier-commands.ts#L8](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/routes/atelier-commands.ts#L8)). |
| Côté navigateur | Dexie `fadi-local` : `lots`, `modelCache`, `keyValue` | Le bus client de l'Atelier ([local-store.ts#L58-L64](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/lib/local-store.ts#L58-L64)) |

Constat : **côté serveur, le principe d'un écrivain unique existe déjà pour le modèle.** C'est le service de commandes. La question de COEX-03 porte donc sur **quel client** (Atelier ou Studio) a le droit d'émettre des commandes **sur quel périmètre**, et sur l'écrivain des **nouveaux** jeux Studio.

### Options

**A — recommandée.**

- Pendant la coexistence, l'Atelier reste le seul client écrivain de tous les jeux existants.
- Studio est le seul client écrivain de ses nouveaux jeux : document 2D autonome (DEC-01), Étude / Variante / Révision (DEC-03).
- Les deux passent par le même service de commandes serveur (R9), sans seconde autorité.
- Le transfert d'un périmètre de l'Atelier vers Studio est une décision explicite par périmètre (MIG-COEX-05). Après transfert, l'ancien chemin passe en lecture seule (voir COEX-04).

**B.** Les deux clients peuvent écrire sur le même jeu, départagés par le verrou d'édition existant (`atelier_locks`) et par la révision de base (409). C'est techniquement possible, mais contraire au Plan §8.2 (« deux chaînes d'écriture incompatibles sur la même étude ») et aux risques RISK-01 et RISK-03. **Non recommandé.**

**Effet si aucune décision n'est prise.** Le lot A.1 ne peut pas engager l'écriture d'un jeu partagé. Les spécifications et les travaux en lecture seule continuent.

---

## COEX-04 — Pour les études migrées : redirection contrôlée ou accès historique en lecture seule

### Précédents dans le code

- **Un mode lecture seule existe déjà dans l'Atelier.** `AtelierNouveau` reçoit `readOnly={!access.canWrite}` et `protectedReference` ([ProjectShell.tsx#L155](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L155)). La bannière de lecture seule vient de `lib/access`.
- **Les liens profonds sont nombreux** (H03 à H12, 10 émetteurs). Une redirection devrait les intercepter tous de façon cohérente. Aujourd'hui, la seule redirection est le repli `*` → `/accueil`, sans message ([App.tsx#L86-L87](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L86-L87)).
- **Les variantes actuelles sont des projets** (`atelier_variants`). Une étude migrée peut donc correspondre à plusieurs projets historiques. C'est la correspondance explicite de DEC-03, sans migration silencieuse.

### Options

**A — recommandée.**

- Par défaut, l'accès historique passe en **lecture seule** pour une étude migrée, en réutilisant `readOnly`. Une bannière explicite pointe vers l'étude Studio correspondante.
- Une **redirection contrôlée** n'est activée, périmètre par périmètre, qu'après le transfert d'autorité (MIG-COEX-05), et avec un message visible : jamais le repli silencieux `*`.

**B.** Redirection immédiate de tous les liens. Ce serait plus simple pour l'utilisateur, mais cela casse la consultation historique (MIG-COEX-06), demande l'interception de 10 émetteurs et masque les écarts de correspondance.

**C.** Laisser les deux accès en écriture. Exclu par COEX-03, option A, et par le Plan §8.2.

Dépendances : DEC-03 (correspondance), MIG-COEX-02 et MIG-COEX-05, NAV-004 (un lien refusé ne divulgue pas le contenu).

---

## COEX-05 — Interdire une synchronisation artisanale entre deux bases métier concurrentes

### Mécanismes de transfert existants

Aucun n'est une synchronisation entre deux bases concurrentes : tous reposent sur le rejeu de commandes validées ou sur un import à sens unique.

| Mécanisme | Nature | Preuve |
|---|---|---|
| File hors ligne et rejeu (rebase) | Lots de commandes rejoués par les mêmes réducteurs purs, validés par le serveur | [packages/atelier-model/src/sync.ts#L1-L5](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/packages/atelier-model/src/sync.ts#L1-L5) |
| Mise à jour d'une variante depuis le tronc | Rejeu validé lot par lot, conflits refusés, `sync_revision` (D-136) | [decisions.md#L140](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/docs/atelier/decisions.md#L140) |
| Bascule du lot 4 (moteur V14 → modèle typé) | Import à sens unique, avec rapport, puis suppression de l'ancien magasin | [bascule.ts#L1-L10](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/db/bascule.ts#L1-L10) |

### Règle proposée, à ratifier et à inscrire dans ADR-STUDIO-NAV-01 ou dans une décision de coexistence dédiée

> Entre l'Atelier et Studio, aucune donnée métier n'est recopiée dans les deux sens. Le transfert se fait uniquement de deux façons : (1) le rejeu de commandes typées validées par le service de commandes (R9) ; (2) un import à sens unique, avec rapport de correspondance et de pertes (Plan §8.1). Il n'y a ni seconde base métier pour Studio, ni tâche périodique qui recopie des tables, ni écriture directe d'un client dans les tables de l'autre autorité.

Critères de vérification proposés pour les lots suivants :

- une revue d'architecture avant tout lot A.1 ou R ;
- une règle de frontière dans `check-module-deps`, qui empêche `modules/studio/**` d'importer les adaptateurs de persistance internes de l'Atelier ([REP-07](../claude-m13-rep/REP-02-08-CONSTATS.md), essais E3 et E7) ;
- un test serveur qui montre qu'une écriture Studio passe par le service de commandes.

---

## COEX-06 — Conditionner tout retrait définitif à la comparaison avant/après, à une restauration testée et à l'acceptation explicite

### Porte de retrait proposée

Elle s'applique à tout écran, route, table ou stockage de l'Atelier. Les trois conditions sont cumulatives, et chacune est prouvée par un artefact daté et lié à un SHA.

| Condition | Preuve exigée | Appui existant |
|---|---|---|
| R1 — Comparaison avant / après | Corpus du Plan §8.1 : quantités, identités, filiation, empreinte du modèle, comparées avant et après sur le même corpus. Aucun taux global ne masque une perte partielle. | `nativeHash` / empreinte du modèle ([ProjectShell.tsx#L97-L99](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L97-L99)) ; `GET …/atelier/comparer` (versions) |
| R2 — Restauration testée | Restauration réelle d'une sauvegarde de référence, données et pièces documentaires, sur une cible **jetable attestée** (garde M02 / PR #169), avec contrôle d'intégrité | Procédures de sauvegarde suivies hors de ce dépôt ; Plan §8.3 |
| R3 — Acceptation explicite | Décision du propriétaire consignée (Issue ou journal des décisions), qui cite R1 et R2 | AGENTS.md : fusion, production et données exigent un accord distinct |

**Précédent.** La bascule du lot 4 a supprimé les tables du moteur V14 après import à sens unique ([bascule.ts#L1-L10](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/api/src/db/bascule.ts#L1-L10)). C'est l'exemple qu'un retrait reste possible dans ce dépôt. Pour Studio, ce retrait est soumis à R1, R2 et R3, et à un lot distinct (MIG-COEX-07).

---

## Limites communes

- Ces dossiers sont une lecture statique. Ils n'exécutent aucun test, base, migration ou E2E.
- Les options recommandées ne sont **pas** des décisions.
- Les numéros de ligne valent pour `817bd36`.
