# Orientation du propriétaire : « Les outils seront gérés par MCP » — lecture par le concept et les références

**Date :** 18 octobre 2026. **Source :** message du propriétaire en session Claude Code : « Pour info : Les outils seront gérés par MCP. »

**Précisions du propriétaire,** en réponse à deux questions :

- **Sens :** « Lis le concept et les références ».
- **Périmètre :** **Studio seulement**. L'Atelier et la Planche gardent leurs registres actuels pendant la coexistence (COEX-02).

**Rédaction :** Claude Code, hors équipe Codex. **Nature :** interprétation fondée sur les sources, **soumise à confirmation**. Ce document ne vaut ni décision DEC-15, ni autorisation de code.

## 1. Ce que disent les sources

| Source | Passage | Portée |
|---|---|---|
| REF-01 (Définition V2.1, blob `e1d61ca3`), section 03 | « Le Tool Registry est le catalogue central des capacités et de leurs contrats versionnés […]. Le Tool Manager assure leur découverte, leur recherche, leur activation, leur organisation et leur chargement progressif. Il n'est ni un moteur de géométrie ni l'autorité de validation des modifications. » | La « gestion » des outils, c'est le couple Registry + Manager. |
| REF-01, section 04 (« Moteurs mutualisés et qualité d'exécution ») | « **La gestion des outils est centralisée, pas leur exécution.** Les gestes interactifs et les aperçus courts peuvent être traités localement […] » | La gestion et l'exécution sont séparées. |
| REF-01, section 07 | « Un adaptateur MCP facultatif peut exposer certaines capacités du Studio à des agents IA. Il utilise les mêmes contrats de commandes, droits, confirmations et journaux que les actions humaines. Il ne transforme pas le déplacement du pointeur, l'accrochage ou le rendu image par image en appels réseau. » | MCP est un canal d'exposition, pas le moteur des gestes. |
| REF-02 (blob `ce7cf463`), §2.1 | Couche « Adaptateur MCP (facultatif) : traduction de demandes IA en intentions contrôlées. Pas d'aller-retour réseau par mouvement de pointeur. » | Même règle |
| REF-02, §5 (EX-026 à EX-031) et §6 (EX-032, IF-005) | Le Registry : contrat d'outil (`toolId`, `contractVersion`, `inputSchemaRef`, `permission`, `commandType`, `preview`…), consultable **hors ligne** sans charger les moteurs. Le Manager : barres, profils, activation, chargement. | Le Registry est la source des contrats. |
| REF-02, EX-027 | Identifiants globalement non ambigus, par exemple « `studio.transform.scale`, `studio.arch.ladder` ». | Ce sont exactement les deux outils de la collision corrigée par #176. |
| REF-02, annexe C.6 | `studio.agent.invoke` : entrée `toolId`, contrat et version, paramètres, source, révision et identité ; validation à blanc ; confirmation ; écriture par **le même bus métier** et les permissions serveur ; traçabilité humain / agent. | Contrat MCP déjà spécifié |
| REF-02 TEST-033, RISK-07, DEC-15 ; Plan lot F.3 ; checklist F.3-01 à 04 | Appel MCP simulé sur commande protégée ; « Extension / MCP contournant les droits » (**critique**) ; « Extensions et adaptateur MCP, **si retenus** » | Recette, risque et décision existants |
| Décision déléguée D02 (`docs/ai-team/CODEX-DELEGATED-DECISIONS.md`, ligne 22) | « RETENU pour MVP : reporter IA externe, **MCP**, extensions tierces… » | **À reconsidérer** : voir §3 |
| Précédent dans Fadi (CLAUDE.md, P2-8) | L'assistant et les graphes de génération passent par une « même boucle contrôlée » : proposition, essai, accord explicite, commandes ; aucune correction automatique. | Modèle existant à réutiliser |

## 2. Interprétation proposée (conforme aux sources)

**MCP devient le canal retenu, et non plus facultatif, par lequel les outils du Studio sont exposés et invoqués par des agents.** Le Tool Registry et le Tool Manager restent les composants de gestion décrits par REF-01 et REF-02, et le moteur des gestes reste local. Concrètement :

1. **Une seule source de vérité.** Le manifeste du Tool Registry (EX-026, REF-02 §5.2 et §5.3) produit la description MCP de chaque outil exposable : nom = `toolId` ; schéma d'entrée = `inputSchemaRef` ; description et synonymes ; permission ; besoin de confirmation. Il n'y a pas de second catalogue MCP maintenu à la main.
2. **Exposition sélective.** Seules les capacités marquées « exposables » dans leur contrat sont publiées par MCP (C.6 : « outil non exposable » → refus). L'exposition ne vaut jamais permission (EX-031, RISK-07).
3. **Invocation par MCP** (C.6) :
   - un appel d'outil devient une intention ;
   - la validation se fait à blanc ;
   - la confirmation est demandée si le contrat l'exige ;
   - la commande passe par le **même service de commandes** (R9, `atelier-commands`, idempotence `requestId`, `baseRevision`) ;
   - l'auteur est tracé comme humain ou agent.
4. **Ce qui ne passe pas par MCP** (REF-01, section 07) : les machines d'outil interactives, l'aperçu, l'accrochage et le rendu. Le Tool Manager garde le chargement progressif et le mode hors ligne. Rien de cela n'est remplacé par des appels réseau.
5. **Côté serveur.** L'adaptateur MCP vit côté services (`apps/api`), sous les droits serveur. Il ne contourne ni R9, ni les frontières de #177 : `modules/studio` ne lui donne aucun accès aux internes de l'Atelier.

Une lecture plus littérale (« le Tool Manager **est** un serveur MCP », ou « chaque geste passe par MCP ») **contredirait** REF-01 sections 03, 04 et 07, ainsi que REF-02 §2.1, EX-032 et EX-038 : gestion locale, hors ligne, pas de réseau par geste. Elle exigerait de réviser ces sources par décision explicite.

## 3. Conséquences sur les décisions et le registre

| Élément | Effet de l'orientation | Statut |
|---|---|---|
| **D02** (MCP « reporté » du MVP) | **Divergence** entre une décision déléguée et l'orientation du propriétaire. La parole du propriétaire prime, mais l'**échéance** (pilote ou plus tard) n'est pas dite. | **À trancher** par le propriétaire (voir §4) |
| **DEC-15** (« si retenus ») | La partie MCP passe à « retenue » ; les extensions tierces restent ouvertes. | À consigner par A0 après confirmation |
| **DEC-05 / DEC-06** (manifestes Registry, API du Manager) | Le schéma de manifeste doit être projetable en MCP : JSON Schema des entrées, exposabilité, confirmation, permission. | Contrainte d'entrée pour leur instruction |
| **RISK-07** (critique) | Sa priorité devient effective, et non plus conditionnelle (ADR-05). | Rattaché ([ADR-04](../claude-m13-coex/ADR-04-REGISTRE-RISQUES.md)) |
| **TEST-033** | Recette **obligatoire** pour tout lot qui expose MCP, et non plus seulement en lot F | À reclasser par A0 |
| Lot **F.3** | La partie « adaptateur MCP » n'est plus conditionnelle ; F.3-02 et F.3-03 deviennent des invariants de conception du Registry. | Suite de D02 |
| **EX-027** et #176 | Les identifiants Studio suivront `studio.<domaine>.<outil>`. `echelle-acces` / `echelle` dans l'Atelier ne seront pas repris tels quels : correspondance par alias (EX-027). | Information |

## 4. Points à confirmer par le propriétaire

1. **Interprétation §2 :** MCP comme canal d'exposition et d'invocation alimenté par le Registry ; gestes locaux.
2. **Échéance :** MCP dans le premier sous-ensemble pilote (ce qui annule le report D02 pour MCP), ou après le socle (I, A, B) ?
3. **Clients MCP visés :** agents internes à Fadi seulement, ou clients externes. Cela fixe l'authentification, le consentement et la confidentialité de DEC-15.

## Limites

- Ce document n'écrit aucun code, ne crée aucun serveur MCP et ne modifie ni le registre ni D02.
- Les citations portent sur les blobs indiqués.
