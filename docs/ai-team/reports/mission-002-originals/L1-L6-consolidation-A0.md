# Mission 002 — Consolidation A0 / L1–L6

Date : 18 octobre 2026, Europe/Zurich.

## Résultat

Analyses A1/A2/A4/A5/A6 réellement exécutées et consolidées. A3 inactif. Aucun fichier du dépôt, commit, Issue, PR, réglage GitHub, migration, sauvegarde ou déploiement modifié. Aucun test destructif exécuté. Les livrables sont des propositions hors dépôt ; aucune publication GitHub n'est autorisée par cette mission.

## L1 — Références et preuves

Main distant : 27c0c5a35e2f116752a83a9c66459484488a1975. Checkout local propre : work@aadd083ca282ed7db8af31f0fb3724c861b5107f. Comparaison GitHub officielle : trois fichiers ajoutés seulement (checklist Markdown/Word et archive d'audit), aucune différence applicative. work n'est pas un défaut par son nom ; contrôler SHA, arbre et provenance. Comparaison 5cf61d1… → 38c71f1… confirmée : deux commits, quatre documents Studio.

Relevé CI 04:11:50 UTC : run push main 39095745108, validate/image réussis, e2e en cours ; continuité39095745135 et isolation39095745118 réussies. Aucune CI entièrement verte revendiquée. API exacte : zéro run retourné pour aadd083… et38c71f1… ; aucune réussite inférée. PR152 tête f2777230… : CI39083291384 et garde-fous39083291440 réussis, PR ouverte non fusionnée. PR154 tête be0ac4c… : CI39092806498 réussie, PR ouverte. PR142 ouverte, tête0d960605…, mergeable=false ; résultats593/593 historiques sur autre SHA. PR143/150 ouvertes. PR148/155 fusionnées.

Contrôles locaux relancés Mission002 : dépendances, isolation761, continuité et test Node du validateur1/1 réussis. Types/build/API/E2E/IFC non réexécutés localement par Mission002. Les comptes1757+1/47/3 restent historiques ; le statut validate actuel ne fournit pas ces décomptes. Modèles, sept modules et21étapes/six phases requalifiés par lecture ; aucune certification BIM déduite des proxys IFC.

Constats P1 : Cloud révision10, réseau enforced ; ancienne réserve révision2 dépassée. DB arrêtée exit255, ports locaux refusés ; cause racine inconnue. main protected=false actuel. TRUNCATE sans garde dans12 suites API. P2 : v2/v3, frontières web, docs/statuts périmés, CSP désactivée, absence de scan dédié identifié, autonomie documentaire incomplète. Nouveaux constats : doublon echelle avec écrasement de lookup, hiérarchie Étude absente, chargement/précache et reprise worker à qualifier. P3 : Node/Chromium différents et mesures réelles manquantes. Voir rapports agents pour preuves, risques et critères.

## L2 — Sécurisation proposée

Cloud : relever les scripts réellement publiés, figer SHA/versions, puis après autorisation vérifier une session neuve et une base jetable attestée. Attendus : /health JSON db=ok, HTML accueil, /projects401 et SELECT des versions/extension PostGIS. Aucun redémarrage ici ; même environnementId ne prouve pas une recréation.

Tests : TEST_DATABASE_URL explicite sans fallback applicatif, identité endpoint/base/rôle exacte selon descripteur éphémère, refus fermé des cibles absentes/inconnues/production, parseur strict, attestation serveur avant reset, pool immuable/revalidation après reconnexion et reset centralisé pour tous les lanceurs. Base isolée/rôle limité ; suffixe test, localhost ou flag booléen ne suffisent pas. Tests négatifs purs/simulés avant toute connexion réelle ; succès uniquement sur base jetable autorisée. Aucune tentative contre une vraie production pour démontrer un refus.

GitHub : réutiliser proposition #152 après revue. PR obligatoire, validate/e2e/image, Continuité — docs, checkpoints et tests et no-foreign-app-reference requis ; pas de force-push/suppression ; conversations résolues. Check Architecture — frontières et isolation seulement après fusion autorisée et existence vérifiée. Politique solo0approbation GitHub supplémentaire + acceptation humaine explicite, ou1revue indépendante si disponible : décision humaine. Activation administrative séparée, puis relecture et test documentaire.

CSP/scan : inventorier origines/Workers/WASM/service worker, essais report-only autorisés et non-régression avant enforcement ; contrôler en-tête réellement servi. Scan dépendances/images avec triage, bases datées et exceptions expirables. Aucun réglage appliqué.

## L3 — Orchestration

Préparation indépendante A1/A2/A4/A5/A6 réellement réalisée en parallèle. A0 revoit et consolide ; A3 futur code seulement après accord. Un seul éditeur futur par fichier partagé : App/AppShell/ProjectShell/HomeTopbar/CSS/i18n, schema.ts, manifest/base, setup/client/workflows, STATUS/HANDOFF. Réutiliser PR152 et arbitrer PR142 avant lots recouvrants.

## L4 — Studio

Registre contrôlé : 630 identifiants uniques, aucune coche. Six seuls contrôles documentaires sont Vérifié,417tâches À définir et207Bloqué pour réalisation/preuves non autorisées ; ce ne sont pas des pourcentages de fonctionnalités implémentées. Qualification initiale par groupe, pas verdict exhaustif de conformité individuelle.104textesEX extraits ; compléter les141fiches EX/INV/IF/AC en contrats/tests/preuves.

Invariants fixés par mission : Studio autonome, entrée verticale, quatre domaines, deux planches indépendantes, hiérarchie Projet/Étude/Variante/Révision, services Fadi partagés, Atelier/21étapes/fonctions industrielles conservés. Renvoi de la charte à ancien ConceptV2 vs RT001V1.0 à arbitrer. DWG conditionnel cible vs D179 renoncé : exclusion pilote proposée, pas réouverture implicite.

G0 cadrage → G1 contrats → G2 POC limités autorisés → G3 arbitrages/architecture/retour arrière et autorisation → réalisation → G4 recette acceptée ; déploiement distinct. Aucun passage accepté implicitement.

Séquence : I+X+A.1, puis A.2/A.3 et B sur contrats stables, A.4/A.5, C/D nécessaires avant exposition de charges, E pour dossier publiable, R/G4. F conditionnel. E reste indispensable au MVP malgré sa priorité de lot P1.

MVP proposé : petit local/pavillon synthétique, données déclarées et autorisées. Parcours A : dessiner/coter/annoter/sauver/rouvrir/publier sans3D. B : créer/modifier spatialement/sauver/rouvrir/vue ou coupe sans esquisse préalable. C : même objet2D/3D, hôtes/métrés, undo/redo, conflits/observation/recontrôle puis approbation/publication à manifeste. Oracle simplifié mur6×3×0,2moins ouverture1×2,1×0,2 :3,180m³ ; largeur1,20m :3,096m³. Ce seul mur ne prouve pas l'utilité du pilote.

Les18DEC sont instruites individuellement dans A1/A2 :01dessin2D ;02associations ;03hiérarchie ;04profils ;05Registry ;06Manager ;07chunks/cache ;08renderer ;09index/snapping ;10invalidation ;11workers ;12historique ;13budgets ;14offline ;15extensions/MCP ;16manifeste ;17qualité adaptative ;18réutilisation. Priorité initiale :01/02/03/12/18 et ADRnavigation ;16à concevoir dèsG1. Les décisions optionnelles ne bloquent pas les lots qui les excluent explicitement.

## L5 — Missions et suivi

L5-missions-et-issues-proposees.md contient cinq instructions indépendantes, futurs lotsA3bornés et propositions d'Issues sans numéro inventé. Réutiliser #146/#147/#151/#153 plutôt que les dupliquer. Le dossier propositions-workstream-studio contient CONTEXT/TASKS/STATUS/HANDOFF proposés ; le dossier est absent de main au SHA vérifié. Aucun fichier n'est copié au dépôt et aucune Issue créée.

## L6 — Coordination

| Tâche | Agent | Priorité | Dépendances | Statut | Preuve | Prochaine action |
|---|---|---|---|---|---|---|
| Git/CI | A0/A6 | P1 | GET exact SHA | Vérifié diagnostic | compareAPI/run39095745108 | Relever avant tout lot |
| Cloud | A6 | P1 | Lecture config | Vérifié diagnostic ; reproduction Bloqué | révision10/DBExited | Autoriser reprise locale/session neuve |
| Garde DB | A5/A6/A2 puis A3 | P1 | Accord spécification/code | À faire ; réalisation Bloqué |12suites/contrat négatif | Autoriser lot borné |
| Protection main | A6/admin | P1 | Accord administratif | Bloqué activation | protected=false/#146 | Choisir politique revue |
| Registre630 | A1/A5 | P0 préparation | Sources | Vérifié registre initial | CSV630/104EX | Compléter contrats/preuves |
| Contrats/frontières | A2 | P2audit/P0Studio | PR152/DEC | À définir | v2/v3/graphe | Valider interfaces |
| Navigation | A4/A2 | P0Studio | ArbitragePR142 | À définir | NAV001–009 | Ratifier ADR |
| Corpus | A5 | P0transversal | Pilote/contrats | À faire exécution |38TEST/9NAV/S1–S7 | Approuver POC limités |
| Continuité | A0 | P2 | Accord publication | À faire publication |4propositions/PR154 | Autoriser lot documentaire |
| Réalisation | A3 | P0/P1lots | Gates+accord | Bloqué, inactif | Aucun lot ouvert | Autoriser un sous-ensemble aprèsG3 |

## Décisions à soumettre

1. Ratifier source RT001V1.0 et pilote synthétique A/B/C avec quatre domaines ; exclusions DWG/IA externe/MCP proposées, sans supprimer les capacités existantes.
2. Autoriser séparément lotP1gardeDB puis essais jetables et démarrage Cloud local ; aucune migration implicite.
3. Choisir revue solo/indépendante et autoriser ultérieurement administration #146.
4. Décider traitement PR142/152/154 et revue/CI avant toute fusion autorisée séparément.
5. Ratifier placement Studio après Projets, routes/transitions/plein écran/pending/langue, approbateur/publieur et appareils/budgetsDEC13.
6. Autoriser publication documentaire Mission002/quatre fichiers/Issues séparément ; POC G2 bornés ensuite ; code Studio aprèsG3.
