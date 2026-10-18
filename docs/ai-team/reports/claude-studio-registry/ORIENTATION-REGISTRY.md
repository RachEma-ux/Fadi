# Orientation du propriétaire : les outils Studio sont gérés par le Tool Registry, catalogue central

**Date :** 18 octobre 2026. **Périmètre :** Studio seulement ; l'Atelier et la Planche gardent leurs registres actuels pendant la coexistence (COEX-02).
**Rédaction :** Claude Code, hors équipe Codex. **Nature :** orientation relevée et rapprochée des sources. Ce document ne vaut ni décision DEC-05 ou DEC-06, ni autorisation de code.

## Correction du 18 octobre 2026

Le propriétaire avait d'abord écrit : « Les outils seront gérés par MCP ». Il a ensuite corrigé :

> « Confusion de ma part : c'est le Registry, le catalogue, dont je voulais parler. Abandonne le MCP. »

La version précédente de ce document, qui interprétait l'orientation comme un MCP retenu, est **retirée**. Elle reste consultable dans l'historique Git : commit `12235b6`, chemin `docs/ai-team/reports/claude-studio-mcp/ORIENTATION-MCP.md`. Ses conséquences annoncées sont **annulées** :

- D02 n'est pas remis en cause ;
- DEC-15 n'est pas modifiée ;
- TEST-033 et le lot F.3 gardent leur statut d'origine.

La consigne « Abandonne le MCP » est consignée **mot pour mot**. Elle confirme que MCP n'est pas retenu. Les éléments MCP des sources (adaptateur facultatif de REF-01 section 07, C.6, TEST-033, DEC-15, F.3-01 à F.3-04) ne sont **pas supprimés** du registre : un report ou une exclusion reste visible et n'est jamais coché comme livré (CODEX-START-HERE §7). Leur qualification exacte, « reporté » (D02) ou « exclu », revient à A0 et à A1, qui citent cette consigne.

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

## Limites

- Aucun code, aucun catalogue créé.
- Le registre 630 et les décisions déléguées ne sont pas modifiés.
