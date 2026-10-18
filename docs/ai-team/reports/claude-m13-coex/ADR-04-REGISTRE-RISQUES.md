# ADR-04 — registre source RISK-01 à RISK-10 et risques de navigation rattachés

**Tâche :** ADR-04, checklist ligne 924 : « Conserver RISK-01 à RISK-10 du référentiel comme registre source et rattacher les risques de navigation supplémentaires. » Source : Plan §10.
**Registre source :** REF-02 `Studio/Fadi_Studio_Referentiel_Technique_Detaille_V1_0.docx`, blob `ce7cf463e34c92c0178fa0c0b495569a13c7fe32`, §21.3 « Principaux risques de livraison ». Le texte a été extrait du Word (paragraphes `w:t`) et recopié **mot pour mot**.
**Traduction pour l'intégration :** Plan §10, tableau « Risque prioritaire / Mesure dans le plan » ([Plan#L332-L349](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/Studio/Fadi_Studio_Plan_Implementation_V1_0.md#L332-L349)).
Données structurées : [`ADR-04-REGISTRE-RISQUES.json`](ADR-04-REGISTRE-RISQUES.json).

## 1. Registre source — conservé à l'identique

Le registre source n'est **pas renuméroté** et ne reçoit **aucune nouvelle gravité**. Une gravité initiale n'est pas une priorité confirmée : la confirmation relève d'ADR-05, au cadrage du pilote.

| ID | Risque (REF-02 §21.3) | Gravité initiale | Mesure de maîtrise (REF-02) |
|---|---|---|---|
| RISK-01 | Double autorité 2D/3D | Critique | Protocole d’associations, objets canoniques, tests 001–010. |
| RISK-02 | Snapping différent après indexation | Critique | Oracle de géométrie + tests densité et ambiguïtés. |
| RISK-03 | Commande rejouée ou conflit perdu | Critique | Idempotence, transaction et E2E concurrent. |
| RISK-04 | Publication sur mauvais contenu | Critique | Manifeste immuable, empreintes, garde d’approbation. |
| RISK-05 | Profil personnalisable mais tous moteurs chargés | Élevée | Contrôle bundles/service worker et mesure cache froid. |
| RISK-06 | Memory leak OCCT/Three | Élevée | Bench fermeture/réouverture + limites/concurrence. |
| RISK-07 | Extension/MCP contournant les droits | Critique | Même bus de commandes et validation serveur. |
| RISK-08 | Migration détruisant références et historique | Critique | Corpus historique, dry-run, sauvegarde restaurable, rollback. |
| RISK-09 | Mesures GPU non transférables | Moyenne/élevée | Profils appareils réels + séparation CPU/GPU. |
| RISK-10 | Formats annoncés au-delà de la couverture | Élevée | Matrice par entité/sens, rapports de perte et tests aller-retour. |

## 2. Correspondance avec le tableau du Plan §10

| Ligne du Plan §10 | Rattachement | Commentaire |
|---|---|---|
| Studio réduit à un raccourci vers l'Atelier | **Navigation, sans équivalent REF-02** | voir NAV-R01 |
| Barre latérale supprimée par un ancien mode immersif | **Navigation, sans équivalent REF-02** | voir NAV-R02 |
| Mauvais projet dans le bandeau ou la commande | **Navigation**, partiellement RISK-07 (validation serveur) | voir NAV-R03 |
| Données ou historique dupliqués entre Atelier et Studio | RISK-01 et RISK-08 | Dossier COEX-03 et COEX-05 |
| Tous les moteurs téléchargés malgré une barre réduite | RISK-05 | OBS-06 et OBS-10 ([REP-09](../claude-m13-rep/REP-09-REQUALIFICATION.md)) |
| Snapping ou picking altéré par optimisation | RISK-02 | OBS-02 |
| Worker en échec ou résultat périmé | RISK-06 (partiel) | OBS-07 et OBS-08. RISK-06 parle de fuite mémoire, cette ligne de résilience ; le rattachement est partiel. |
| Dossier publié différent du contenu approuvé | RISK-04 | — |
| Format promis au-delà de la couverture | RISK-10 | — |
| Perte lors de migration ou changement de cache | RISK-08 | COEX-06 (porte de retrait), MIG-COEX-04 |

Trois risques source **n'ont pas d'équivalent** dans le tableau du Plan : **RISK-03, RISK-07 et RISK-09**. Ils restent actifs dans le registre source. Leur absence du Plan §10 ne vaut pas levée.

## 3. Risques de navigation rattachés (supplémentaires)

Les identifiants `NAV-R0n` sont **proposés** par cette remise. Ils sont distincts de NAV-001 à NAV-009, qui sont des critères de recette. Ils ne remplacent aucun RISK.

| ID proposé | Risque | Source | Constat au `817bd36` | Mesure / recette | Gravité |
|---|---|---|---|---|---|
| NAV-R01 | Studio réduit à un raccourci vers l'Atelier, ou servi par `ProjectShell` | Plan §10 | Ajouter `studio` à `MODULES` ferait passer Studio par `ProjectShell` (REP-06) ; `ProjectShell` lit toujours les étapes du Parcours (REP-04) | Lot I, routes propres, NAV-002 ; mécanisme d'entrée globale distinct (ROUTE-09) | à confirmer (ADR-05) |
| NAV-R02 | Barre latérale masquée par le mode immersif | Plan §10 | `atelier-immersive` masque `.app-sidebar` ; drapeau global sans compteur (REP-05) ; PR #142 ouverte | NAV-008 ; ne pas réutiliser la classe ; recette mobile | à confirmer |
| NAV-R03 | Mauvais projet dans le bandeau ou dans la commande | Plan §10 | Contexte limité à deux `useMatch` sous `/projets` (REP-03) ; garde d'authentification côté client seulement (REP-02) | Résolution de contexte partagée ; appartenance vérifiée côté serveur ; NAV-006 | à confirmer |
| NAV-R04 | Lien Studio invalide ou refusé, redirigé silencieusement | **Ajout de cette remise** (REP-02) | Le repli `*` envoie vers `/accueil` sans message ([App.tsx#L86-L87](https://github.com/RachEma-ux/Fadi/blob/817bd36e7d4b1ab60ab9c00309509c7cdfed0798/apps/web/src/App.tsx#L86-L87)) | NAV-004 : écran de refus explicite, sans divulgation | à confirmer |
| NAV-R05 | Échec de chargement d'un morceau Studio qui bloque la navigation | **Ajout de cette remise** (REP-02) | Aucune `ErrorBoundary` dans `App.tsx` autour des `lazy`/`Suspense` | NAV-008 : erreur récupérable, barre conservée | à confirmer |
| NAV-R06 | Accès historiques à l'Atelier cassés par le lot I | **Ajout de cette remise** (COEX-02) | 14 accès H01 à H14, dont 10 émetteurs de liens profonds | NAV-009 et contrat COEX-02 | à confirmer |
| NAV-R07 | Frontière Studio ↔ Atelier non contrôlée par la CI | **Ajout de cette remise** (REP-07) | Aucune règle entre modules web, même avec la PR #152 (E3, E7) | Règles `check-module-deps` pour Studio, avec tests | à confirmer |

## 4. Pourquoi ADR-04 peut être « Vérifié (documentaire) »

- **« Conserver comme registre source ».** RISK-01 à RISK-10 sont recopiés à l'identique, avec la référence du blob. Les identifiants, gravités et mesures sont inchangés.
- **« Rattacher les risques de navigation supplémentaires ».** Les trois risques de navigation du Plan §10 sont rattachés, plus quatre autres tirés des constats REP et COEX, chacun avec sa preuve.
- **Ce qui n'est pas fait ici.** La confirmation des priorités relève d'ADR-05. L'ouverture d'ADR-STUDIO-NAV-01 relève d'ADR-01. Les identifiants NAV-R0n restent des propositions à adopter.
