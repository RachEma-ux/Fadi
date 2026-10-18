# Orientation du propriétaire : outils Studio gérés par le Tool Registry, contrats compatibles agents, MCP facultatif

**Date :** 18 octobre 2026. **Périmètre :** Studio seulement ; l'Atelier et la Planche gardent leurs registres actuels pendant la coexistence (COEX-02).
**Rédaction :** Claude Code, hors équipe Codex. **Nature :** orientation relevée et rapprochée des sources. Ce document ne vaut ni décision DEC-05 ou DEC-06, ni autorisation de code.

## Historique de l'orientation, le 18 octobre 2026

1. « Les outils seront gérés par MCP. » Cette première lecture a été **retirée** (commit `12235b6`, historique Git).
2. « Confusion de ma part : c'est le Registry, le catalogue, dont je voulais parler. Abandonne le MCP. »
3. **Dernier mot du propriétaire.** Il a transmis une évaluation qu'il adopte comme position finale ; elle **remplace le point 2 pour ce qui concerne MCP** :

   > « MCP is anticipated correctly at the architectural level, but insufficiently committed at the implementation-planning level […]. I recommend keeping MCP optional as an external interface, while making agent-compatible tool contracts mandatory from the start. This preserves Studio's independence and prevents having to redesign the tools later for AI access. »

**Position retenue (finale) :**

- **(a) Registry.** Les outils Studio sont gérés par le Tool Registry, catalogue central, et par le Tool Manager. Détail ci-dessous.
- **(b) MCP n'est pas abandonné.** Il reste une **interface externe facultative** : REF-01 section 07, lot F.3 (P2), DEC-15 ouverte, TEST-033. Le report du pilote décidé par D02 est **confirmé** ; rien n'est supprimé ni coché.
- **(c) Exigence P0 nouvelle.** Les contrats d'outils du Registry sont **compatibles avec les agents dès l'origine**, pour chaque outil éligible. Cela n'impose **aucun** serveur MCP : il s'agit de ne pas avoir à reprendre les outils plus tard.
- **(d) Phasage P1 / P2.** Le premier adaptateur restreint après DEC-15, puis l'extension. C'est une **recommandation** de l'évaluation, pas une autorisation : chaque étape reste soumise à DEC-15, aux contrats de sécurité et à une autorisation de lot. Publication, approbation et opérations destructives restent sous autorisation explicite.

### Exigence P0 (c) rapprochée du contrat d'outil de REF-02 §5.2

| Élément exigé par l'évaluation | Déjà prévu par REF-02 | À ajouter ou préciser dans DEC-05 / B.1 |
|---|---|---|
| Identifiant stable et version de contrat | Oui : identité `toolId`, `contractVersion` (EX-027, §5.3) | — |
| Schéma d'entrée validé | Oui : entrées, `inputSchemaRef` | Format **lisible par machine**, par exemple JSON Schema, à fixer |
| Schéma de sortie et résultat lisible par machine | En partie : « Résultat » donne `commandType`, effets, dépendances à invalider | **Schéma de sortie déclaré** (`outputSchemaRef`) et forme stable des refus |
| Exigences de permission | Oui : « Permissions » (action métier, sujet, état, rôle) | — |
| Gestion des révisions | Oui : `baseRevisionId` du contrat de commandes (§8), « Historique » | Rappel explicite dans chaque fiche |
| Essai à blanc et estimation des objets touchés | En partie : C.6 « Prévisualisation » ; `POST /commands/essai` existe côté Atelier | Indicateur `supportsDryRun` dans la fiche |
| Éligibilité à l'exposition aux agents | En partie : C.6 « outil non exposable » → refus | Champ `agentExposure` (`none` / `read` / `propose` / `execute`), **`none` par défaut** ; confirmation requise par catégorie |
| Gestes continus exclus | Oui : REF-01 section 07 ; C.6 « pas d'aller-retour réseau par mouvement de pointeur » | Les machines d'outil interactives restent `agentExposure: none` |

**Où cela s'insère dans la checklist** : B.1-02 (`toolId`, propriétaire, contrat), B.1-03 (contextes, permissions, loaders, dépendances), B.1-06 (manifeste versionné) et l'instruction de DEC-05. Les identifiants des 630 tâches ne changent pas ; l'exigence s'ajoute comme critère de ces tâches.

## Ce que l'orientation retient

**Les outils Studio sont gérés par le Tool Registry, le catalogue central, et par le Tool Manager qui l'exploite.** C'est exactement le modèle des sources. Aucune divergence n'est donc à arbitrer.

| Source | Passage | Ce que cela fixe |
|---|---|---|
| REF-01 (blob `e1d61ca3`), section 03 | « Le Tool Registry est le catalogue central des capacités et de leurs contrats versionnés : identité, finalité, compatibilité 2D/3D, dépendances, conditions d'utilisation et qualité attendue. Le Tool Manager assure leur découverte, leur recherche, leur activation, leur organisation et leur chargement progressif. » | Un seul catalogue central pour tous les outils Studio |
| REF-01, section 04 | « La gestion des outils est centralisée, pas leur exécution. » | Le Registry gère ; les machines d'outil exécutent localement. |
| REF-02 (blob `ce7cf463`), §2.1 | Tool Registry : « Métadonnées, contrats, versions, dépendances. Ne contient pas les objets métier ni la géométrie courante. » | Frontière du Registry |
| REF-02, EX-026 | Le Registry est consultable **sans charger les moteurs** ; son manifeste léger sert à la recherche **hors ligne**. | Le Registry ne déclenche aucun chargement lourd. |
| REF-02, EX-027 | Identifiants globalement non ambigus, par exemple « `studio.draw.line2d`, `studio.transform.scale`, `studio.arch.ladder` », avec alias de migration documentés. | La convention de nommage des `toolId` Studio |
| REF-02, EX-028 | Validation à deux niveaux : le schéma au build, puis **chaque invocation contrôlée à l'exécution** (permission, contexte, paramètres, quotas, révision). | Le Registry ne vaut jamais permission. |
| REF-02, §5.2 et §5.3 | Contrat d'outil : identité, portée, visibilité, permissions, entrées, interaction, aperçu, chargement, exécution, résultat (`commandType`), historique, résilience, performance, vérification, gouvernance ; manifeste illustratif. | Le contenu de chaque fiche du catalogue |
| REF-02, EX-029 à EX-031 | Recherche sans lancer de moteur ; états affichés (découvert, interdit, prêt, erreur…) ; versions et dépréciation ; « trouvé dans le Registry » ≠ « autorisé à charger ou écrire ». | Gouvernance du catalogue |
| REF-02, §6 (EX-032 à EX-035, IF-005) | Le Manager construit les barres, réconcilie profils et contexte, résout les loaders, active ou désactive les machines ; cycle d'activation ; profils standard, métier, personnel et équipe. | Rôle du Manager au-dessus du catalogue |
| DEC-05, DEC-06 | « Support et gouvernance des manifests Registry » ; « API et limites du Tool Manager ». | **Les deux décisions à instruire** pour mettre cette orientation en œuvre |

## Conséquences pratiques

1. **Un seul catalogue pour Studio.** Chaque outil Studio a une fiche de contrat dans le Tool Registry (EX-026 à EX-031). Les barres, la palette, la recherche, les raccourcis et les profils lisent ce catalogue ; aucun n'en garde de copie (EX-032, EX-034).
2. **Identifiants `studio.<domaine>.<outil>`** (EX-027). La collision corrigée dans l'Atelier par la PR #176 (`echelle` / `echelle-acces`) illustre la règle. Côté Studio, les identifiants suivent la convention ; une éventuelle reprise des outils de l'Atelier passe par des alias documentés.
3. **Le catalogue ne donne aucun droit.** Chaque appel est contrôlé côté serveur et toute écriture passe par le service de commandes (R9, EX-028, EX-031).
4. **Contrôle automatique.** Le catalogue Studio devra avoir son test d'unicité des identifiants et de complétude des contrats, comme l'Atelier depuis #176. La règle d'or de la Planche (icône propre, barre, raccourci, `AGENTS.md`) en est le précédent.
5. **Frontières.** Le Registry et le Manager Studio vivront dans `modules/studio` ou dans un paquet pur, sans dépendre des internes de l'Atelier. C'est déjà contrôlé par #177.

## Points restant ouverts (non décidés ici)

- **DEC-05.** Format exact du manifeste, validation au build, mode hors ligne, compatibilité et confiance.
- **DEC-06.** API du Tool Manager : séquence d'activation, événements, tests.
- **DEC-18.** Réconciliation des catalogues existants (Planche : 52 outils, Atelier : 111 entrées) avec le Registry Studio.
- **DEC-15.** Sécurité, consentement, authentification, transport et déploiement d'un futur adaptateur MCP. C'est la condition de toute étape P1.
- **B.1-05.** La collision historique « echelle » est traitée par la PR #176, non fusionnée. Sa preuve sera à requalifier au commit de réalisation.

## Limites

- Aucun code, aucun catalogue créé.
- Le registre 630 et les décisions déléguées ne sont pas modifiés.
