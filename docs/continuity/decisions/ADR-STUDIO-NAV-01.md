# ADR-STUDIO-NAV-01 — Intégration de Studio dans la navigation de Fadi et coexistence avec l'Atelier

Statut : **Proposé** (Proposé / Accepté / Remplacé).
Date : 18 octobre 2026.
Chantier : `studio` (programme [#156](https://github.com/RachEma-ux/Fadi/issues/156)).
Issue / PR : questions et arbitrages dans [#166](https://github.com/RachEma-ux/Fadi/issues/166) ; ouverture annoncée dans [#166/6251022689](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6251022689).
Rédaction : Claude Code, hors équipe Codex. Les contenus repris citent leur auteur d'origine.

> **Portée.** Cette ADR remplit **ADR-01** (ouvrir la décision d'intégration distincte, Plan §10) et **ADR-02** (y documenter routes, contexte, droits, mobile et plein écran, coexistence avec l'Atelier, tests NAV). Elle **ne remplace aucune DEC** (DEC-01 à DEC-18 de REF-02), aucune décision Atelier (`docs/atelier/decisions.md`) ni aucune décision déléguée de #166 : elle s'y réfère. **Son arbitrage relève d'ADR-03.** Tant qu'elle reste « Proposé », elle n'autorise **aucun code Studio**, aucune route, aucune migration ni aucune fusion.

## Contexte

- Le Plan d'implémentation (§2 et §10) demande une entrée verticale « Studio » autonome. Studio ne doit être ni un raccourci vers l'Atelier, ni une iframe, ni un passage par le Parcours.
- La décision déléguée **D07** ([CODEX-DELEGATED-DECISIONS.md, ligne 27](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/docs/ai-team/CODEX-DELEGATED-DECISIONS.md#L27)) a retenu, **pour les spécifications** : Studio placé après Projets ; URL complètes et contexte vérifié par le serveur ; plein écran explicite ; protection des gestes ; approbation et publication distinctes.
- L'orientation **DEC-03** ([#166/6250110501](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250110501)) a retenu la hiérarchie Projet → Étude → Variante → Révision.
- La relecture du code au `817bd36` ([REP-02 à REP-08](../../ai-team/reports/claude-m13-rep/REP-02-08-CONSTATS.md)) montre que **rien de Studio n'existe** : aucune route, aucune entrée, aucun descripteur.

## 1. Routes

Le contrat de référence est celui d'A4, [`CONTRAT-NAV-M004.md` v0.2](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/docs/ai-team/reports/mission-004/A4/CONTRAT-NAV-M004.md) (blob `d8d95c16`). Il couvre ROUTE-01 à ROUTE-08, déjà « Vérifié » documentairement au registre. Il n'est pas recopié ici ; ses règles retenues pour cette décision sont :

| Route proposée | Rôle |
|---|---|
| `/studio` | Accueil Studio : projets et études autorisés. Aucune création par simple chargement. |
| `/studio/projets/:projectId` | Études du projet autorisé |
| `/studio/projets/:projectId/etudes/:studyId` | Cadrage, sources et variantes. Une étude sans variante est admise ; toute géométrie exige une variante. |
| `/studio/projets/:projectId/etudes/:studyId/variantes/:variantId` | Espace de conception |
| `…/variantes/:variantId/revisions/:revisionId` (chemin complet, jamais l'abréviation) | Consultation d'une révision immuable |

Paramètres : `?domaine=dessin|bim|visualisation|documentation`, et `planche=2d|3d` en `dessin` seulement. Une valeur inconnue donne l'état « URL non reconnue », sans mutation.

**I.4-03 : proposé, non livré, décision attendue du maître d'ouvrage.** La Checklist laisse ce contrat « À définir » (ROUTE-06) ; il n'est **pas** un contrat validé. Le code en porte une **proposition rétrocompatible** (une adresse antérieure n'est jamais réécrite), que la décision pourra changer ou retirer. Code : `apps/web/src/modules/studio/routes-studio.ts`, `domaines/domaines.ts` ; preuves : `routes-studio.test.ts`, `domaines/domaines.test.ts`, `apps/web/e2e/studio-domaines.mjs`. Proposition :

- Les quatre domaines et leurs noms sont ceux de REF-01 §02 (« Organisation fonctionnelle ») ; les identifiants d'adresse `dessin`, `bim`, `visualisation`, `documentation` sont ceux de ce §1.
- Paramètres de requête sur la route de variante seulement, facultatifs et additifs : `domaine` (une fois) ; `planche` (une fois), admise **uniquement avec `domaine=dessin`**. Ils se combinent avec `revision` et `commentaires`. Valeur inconnue, vide, répétée ou planche hors de `dessin` : adresse non reconnue (écran explicite, adresse conservée).
- Rétrocompatibilité : une adresse sans `domaine` s'ouvre comme avant (Dessin et modélisation, Planche 2D) et **n'est jamais réécrite**, même quand la vue 3D est basculée par Maj+D. L'adresse ne porte domaine et planche qu'après un choix explicite dans la navigation des domaines, ou quand elle les portait déjà ; elle suit alors chaque changement.
- Écriture par **remplacement** (aucune entrée d'historique), hors de la clé de montage de la planche : changer de domaine ou de planche ne recharge rien et n'abandonne ni geste, ni brouillon, ni sauvegarde en cours (NAV-007). L'adresse écrite reprend l'état réel du panneau des commentaires ; l'historique des révisions et « Revenir à la version courante » reprennent domaine et planche.
- Chaque lien de domaine a pour adresse celle de la variante avec ce domaine : seul le clic simple (sans Ctrl, Cmd, Maj ni Alt) est traité sur place ; un clic modifié l'ouvre ailleurs. Ces liens portent `data-studio-sans-garde` : la garde de navigation ne les traite pas comme une sortie de la variante.
- Profil standard : les quatre domaines restent présents l'un sous l'autre ; le domaine choisi devient actif et reçoit le focus (son titre). Aucun paramètre ne transmet de droit.
- Non retenu ici (choix plus engageant laissé au maître d'ouvrage) : segment de chemin (`…/variantes/:v/:domaine`), entrée d'historique par changement de domaine, masquage des domaines inactifs.

**Rattachement des fonctions aux domaines (I.4-01, I.4-02).** Une seule table par nature, dans `domaines/domaines.ts`, contrôlée par `domaines.test.ts` (exhaustivité) : `FONCTIONS_STUDIO` (blocs de l'espace d'une variante), `DOMAINES_COMMANDES` (une entrée par commande de `COMMANDES_EDITEUR`), `DOMAINES_FAMILLES_OUTILS` (une entrée par famille d'outils du registre, donc pour chaque entrée du catalogue). La mise en page des sections est **dérivée** de ces tables. Lecture de REF-01 §02 :

- Dessin et modélisation : les deux planches, la barre d'outils, la portée d'Annuler, la liste des éléments ; édition, vue (Vue 3D, navigation et coupe 3D), accrochage, repérage ; outils de dessin, modification, calques, volume, volume libre, architecture.
- BIM et coordination : exigences et écarts ; propriétés déclarées.
- Visualisation, rendu et immersion : **aperçu** des scènes enregistrées et des types de rendu ; l'édition des scènes et du rendu se fait dans la Planche 3D (outils Scènes et Apparence), que ce lot ne déplace pas.
- Documentation, métrés et collaboration : Feuille, Feuilles et dossier, publications de l'étude, commentaires et observations, historique des révisions, métré.

**Question au maître d'ouvrage — Domaine « à définir ».** REF-01 ne range dans aucun domaine les fonctions suivantes ; leur domaine n'est pas deviné (`A_DEFINIR`) et elles restent où elles sont aujourd'hui, dans la barre d'outils des planches : Importer DXF, Exporter SVG, Exporter DXF, Exporter IFC, Exporter le rendu PNG, Matrice d’échanges, ainsi que le système d'outils commun aux domaines (REF-01 §03) : Outils, Palette de commandes. Leur domaine est à fixer par décision.

**Navigation, hors règle d'or.** Les liens de domaine et les deux boutons Planche 2D / Planche 3D sont de la navigation, pas des commandes : ils n'ajoutent ni outil ni raccourci (le choix de planche exécute la bascule existante « Vue 3D », Maj+D, qui a son icône, sa barre et son raccourci). Cette exemption est déclarée et contrôlée dans `planche2d/regle-or.test.ts`.

**Ajouts tirés du code actuel :**

- **R-A.** Placer les routes sous `/studio`, et non sous `/projets`. Avec la règle `startsWith("/projets")` d'`AppShell` ([#L90](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L90)), l'entrée Projets ne s'allume ainsi pas à tort (NAV-006).
- **R-B.** Un lien Studio invalide ou refusé **ne doit pas** tomber dans le repli `*` → `/accueil`, qui ne donne aucun message ([App.tsx#L86-L87](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L86-L87)). Il faut un écran de refus neutre (NAV-004, NAV-R04).
- **R-C.** Chaque morceau Studio chargé à la demande doit avoir sa limite d'erreur récupérable. `App.tsx` n'en a aucune aujourd'hui (NAV-008, NAV-R05).

## 2. Contexte

La façade de contexte proposée par A4 ([`CONTRAT-NAV-M004.md`](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/docs/ai-team/reports/mission-004/A4/CONTRAT-NAV-M004.md), § « Façade de contexte ») contient `{ projectId, studyId?, variantId?, requestedRevisionId?, baseRevisionId?, effectivePermissions, accessState, freshness, writerAuthority, schemaVersion }`.

Elle est complétée par les constats suivants :

- **C-A.** `StudioShell` ne dépend pas de `ProjectShell`. Celui-ci lit **toujours** les étapes du Parcours ([ProjectShell.tsx#L39](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/ProjectShell.tsx#L39)). Les services dont Studio a besoin existent déjà hors de cette enveloppe : `useProjectAccess`, `SyncIndicator`, `EditingLockControl`, `ConflictPanel`, `rememberDossier` ([REP-04](../../ai-team/reports/claude-m13-rep/REP-02-08-CONSTATS.md)).
- **C-B.** `AppShell` ne déduit le contexte projet que de deux motifs `/projets` ([#L19-L21](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/AppShell.tsx#L19-L21)). Le bandeau doit recevoir le contexte Studio sans déclencher la lecture des étapes faite par `HomeTopbar`.
- **C-C.** Le dernier dossier personnel (`useLastDossier`) reste une **suggestion**, jamais une permission (UX-09).

## 3. Droits

On reprend le contrat A4 et D07 sans changement :

- les droits logiques sont : lire, créer une étude, modifier une variante, contrôler, commenter, soumettre, approuver, publier ;
- **approbation et publication sont deux permissions distinctes**, et leur cumul doit être configuré explicitement et tracé ;
- aucun paramètre d'URL ne transmet une permission ;
- toute relation entre projet, étude, variante et révision est vérifiée par le serveur ;
- `RequireAuth` reste un garde côté client seulement ([RequireAuth.tsx#L14-L16](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/routes/RequireAuth.tsx#L14-L16)) et ne prouve aucun droit.

Les commandes Studio passent par le **même service de commandes** que l'Atelier (R9, RISK-07).

## 4. Entrée de navigation, mobile et plein écran

- **E-A.** L'entrée « Studio » se place dans `<nav aria-label="Navigation principale">`, après Projets (D07), avec `title`, `aria-label` et un libellé déplié identiques. Le menu mobile est la même barre repliée ; il n'y a pas de menu séparé ([REP-03](../../ai-team/reports/claude-m13-rep/REP-02-08-CONSTATS.md)).
- **E-B. Mécanisme de l'entrée : à arbitrer.** Ajouter `studio` à `MODULES` ferait passer Studio par `ProjectShell` ([REP-06](../../ai-team/reports/claude-m13-rep/REP-02-08-CONSTATS.md)). Options :
  - (a) un descripteur global distinct, **recommandé** ;
  - (b) un champ `portee` ;
  - (c) un raccourci projet sous forme de lien.

  La règle d'or de la Planche (icône propre, barre, raccourci) s'applique à toute commande Studio que cette entrée ouvre.
- **E-C. Plein écran.** C'est une action explicite, avec un bouton de sortie visible, selon le contrat A4. Studio **ne réutilise pas** `atelier-immersive`, un drapeau global sans compteur qui masque la barre latérale ([REP-05](../../ai-team/reports/claude-m13-rep/REP-02-08-CONSTATS.md)). La PR [#142](https://github.com/RachEma-ux/Fadi/pull/142), ouverte, modifie ce drapeau. Si elle est fusionnée, ce point est à relire sur sa tête.
- **E-D. Langues.** Le texte source est en français, avec sa traduction dans `en.json` (AGENTS.md). Le nom « Studio » est identique dans les deux langues.

## 5. Coexistence avec l'Atelier

Dossiers : [COEX-01 à COEX-06](../../ai-team/reports/claude-m13-coex/README.md).

| Règle | Contenu | État |
|---|---|---|
| COEX-02 | Le lot I **ajoute** Studio et ne retire, ne renomme ni ne redirige aucun des 14 accès historiques à l'Atelier (H01 à H14). | Contrat documentaire préparé |
| COEX-03 | L'Atelier reste le seul client écrivain des jeux existants ; Studio, de ses nouveaux jeux. Les deux passent par le même service de commandes. Le transfert se fait par périmètre. | **À arbitrer** ([Q-CLAUDE-COEX-03](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250996328)) |
| COEX-04 | Pour une étude migrée, l'ancien accès passe en lecture seule (`readOnly` existe déjà). La redirection n'intervient qu'après transfert, avec un message. | **À arbitrer** ([Q-CLAUDE-COEX-04](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250997313)) |
| **COEX-05** | **Aucune synchronisation dans les deux sens entre l'Atelier et Studio.** Transferts admis : rejeu de commandes validées (R9), ou import à sens unique avec rapport (Plan §8.1). Ni seconde base métier, ni recopie périodique, ni écriture directe dans l'autre autorité. | **Règle accueillie ici, sous réserve de ratification** ([Q-CLAUDE-COEX-05-06](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250998834)) |
| **COEX-06** | **Porte de retrait** pour tout écran, route, table ou stockage de l'Atelier : R1 comparaison avant / après, R2 restauration testée sur cible jetable attestée, R3 acceptation explicite du propriétaire. Le retrait se fait toujours dans un lot distinct (MIG-COEX-07). | **Règle accueillie ici, sous réserve de ratification** (même question) ; R2 et R3 restent des accords du propriétaire |
| COEX-01 | 22 composants qualifiés : 0 retrait, 0 remplacement | **À arbitrer** ([Q-CLAUDE-COEX-01](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250995231)) |

Le contrôle d'architecture prévu pour COEX-05 : des règles de frontière Studio ↔ Atelier dans `check-module-deps`. Aujourd'hui, aucune frontière n'existe entre modules web, même avec la PR #152 (essais E3 et E7 de [REP-07](../../ai-team/reports/claude-m13-rep/REP-07-ESSAIS.json)).

## 6. Tests NAV

Les critères **NAV-001 à NAV-009** (Plan §2.4) restent les critères d'acceptation. Leurs scénarios, avec oracles et cas négatifs, sont ceux d'A4 dans [`NAV-DELTA-G1-v2.md`](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/docs/ai-team/reports/reprise-496dcfc/A4/NAV-DELTA-G1-v2.md) (blob `5cc211bf`). Correspondance avec les règles de cette ADR :

| NAV | Règles de cette ADR qu'il vérifie |
|---|---|
| NAV-001 | E-A, E-B |
| NAV-002 | C-A, E-B (pas de `ProjectShell` ni de Parcours) |
| NAV-003 | §1 (étude sans variante, aucune géométrie orpheline) |
| NAV-004 | R-B, §3 |
| NAV-005 | §1 (paramètres domaine / planche) |
| NAV-006 | R-A, C-B |
| NAV-007 | Contrat de transition A4 (« pending ») |
| NAV-008 | R-C, E-C |
| NAV-009 | COEX-02 (14 accès H01 à H14) ; recettes existantes `parcours-scenario.mjs`, `accueils-design.mjs` |

**Aucun NAV n'est exécuté** : il n'existe aucune interface Studio.

## 7. Risques rattachés

Registre source RISK-01 à RISK-10, risques de navigation NAV-R01 à NAV-R07 proposés : voir [ADR-04](../../ai-team/reports/claude-m13-coex/ADR-04-REGISTRE-RISQUES.md). Cette ADR traite en priorité :

| Risque | Règle qui le traite |
|---|---|
| NAV-R01 | E-B, C-A |
| NAV-R02 | E-C |
| NAV-R03 | C-B, §3 |
| NAV-R04 | R-B |
| NAV-R05 | R-C |
| NAV-R06 | COEX-02 |
| NAV-R07 | §5 |

Les priorités se confirment au cadrage du pilote (ADR-05).

## Options examinées

- **Option A (recommandée)** — adopter cette ADR telle quelle :
  - routes sous `/studio` ;
  - entrée par un descripteur global distinct de `MODULES` ;
  - `StudioShell` indépendant de `ProjectShell` ;
  - plein écran explicite, sans `atelier-immersive` ;
  - coexistence COEX-02 à COEX-06 selon les options recommandées.
- **Option B** — même ADR, mais entrée par un champ `portee` dans `MODULES` (E-B, option b). On garde un seul registre, mais les trois consommateurs actuels doivent filtrer (`ProjectShell`, `ProjectModuleNav`, `SearchDialog`), avec un risque de fuite vers `ProjectShell`.
- **Option C** — reporter la décision d'entrée et ne retenir que les routes et la coexistence. Le lot I.1 (barre et descripteur) reste alors bloqué.

## Décision et responsable

**Non décidé.** À compléter après arbitrage, au titre d'ADR-03 : décision déléguée dans #166 pour l'architecture, accord du propriétaire pour les points réservés (R2 et R3 de COEX-06, fusion, production). Jusque-là, le statut reste « Proposé ».

## Justification

Cette ADR rassemble en un seul document de décision des éléments aujourd'hui dispersés : D07, l'orientation DEC-03, le contrat A4 v0.2, NAV-DELTA-G1-v2 et les constats REP / COEX. Elle n'invente aucune règle sans source. Chaque ajout (R-A à R-C, C-A à C-C, E-A à E-C) cite le code au `817bd36` qui le motive.

## Conséquences et limites

- Si elle est acceptée, elle sert d'entrée au G3 du lot I (I.1 à I.5 du contrat A4).
- Elle n'en dispense pas : il faut encore G1, G2 et G3, la stabilisation du contrat de contexte M17 et une autorisation de code distincte.
- Aucun nouveau numéro de DEC n'est créé.
- Les identifiants R-A … E-D sont locaux à cette ADR.
- Les chemins de routes restent des propositions jusqu'à ROUTE-09.

## Vérifications / références

- Code relu : `main@817bd36e7d4b1ab60ab9c00309509c7cdfed0798`. Les blobs des 7 fichiers d'intégration sont identiques à ceux du REP-01 `5cf61d1`.
- Sources : Plan §2, §3.3, §8.2, §10 ; checklist lignes 107 à 152 et 193 à 198 ; REF-02 §21.3 (blob `ce7cf463`).
- Remises : [REP-02 à 09](../../ai-team/reports/claude-m13-rep/README.md), [COEX et ADR-04](../../ai-team/reports/claude-m13-coex/README.md), [vérification de #169 et #171](../../ai-team/reports/claude-verif-169-171/README.md).
- Aucun test applicatif n'a été exécuté pour rédiger cette ADR.
