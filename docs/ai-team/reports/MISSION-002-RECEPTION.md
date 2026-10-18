# Mission 002 — compte rendu reçu, réserves et reprise

Date de réception et de rapprochement : 18 octobre 2026. Programme #156 ; livraison documentaire dans la PR #165, branche `docs/156-codex-missions-completes`.

## 1. Nature, provenance et autorisations

Ce document est une **synthèse du compte rendu Mission 002 transmis par l’utilisateur**, rapprochée de lectures GitHub effectuées lors de sa réception. Ce n’est ni une nouvelle exécution de l’audit, ni la copie des cinq rapports spécialisés, ni une acceptation produit.

- **Rapporté** : résultat annoncé par Codex dans le compte rendu reçu ; les journaux détaillés ou fichiers correspondants n’ont pas été transférés à cette session.
- **Vérifié GitHub** : fait relu par le connecteur pendant ce rapprochement, avec référence ci-dessous.
- **Proposé** : spécification, périmètre ou décision soumis à validation, non ratifié par son archivage.

Codex déclare A0 et cinq sous-agents réellement exécutés, A1/A2/A4/A5/A6 ; A3 inactif. Cette réception ne prétend ni les avoir lancés ni avoir consulté leurs traces d’exécution. Codex déclare une préparation sans modification applicative, commit, Issue, PR, configuration administrative, migration, sauvegarde, déploiement ou test destructif pendant Mission 002.

**L’enregistrement présent est une action documentaire ultérieure**, couverte par la demande de préparer/enregistrer les missions et leurs instructions dans GitHub, consignée dans #156 et [SOURCES-AND-AUTHORIZATIONS.md](../SOURCES-AND-AUTHORIZATIONS.md). Il ne contredit pas l’absence d’écriture pendant Mission 002. Les correctifs, POC, gates, fusions, redémarrages/migrations non couverts et opérations sensibles conservent leurs autorisations distinctes. L’archivage ne vaut pas ratification des huit décisions de la section 6.

## 2. Actualisation GitHub, séparée du rapport historique

| Objet | Résultat vérifié à réception | Preuve |
|---|---|---|
| Référence `main` | `27c0c5a35e2f116752a83a9c66459484488a1975` ; `protected: false` | API `/repos/RachEma-ux/Fadi/branches/main` |
| CI de cette référence | **Terminée, success** ; jobs `validate`, `e2e` et `image` réussis | [Run 39095745108](https://github.com/RachEma-ux/Fadi/actions/runs/39095745108) et ses jobs |
| Évolution de la CI | Le rapport indiquait E2E en cours à 06:11:50 heure suisse ; le run est ensuite terminé avec succès, mise à jour GitHub à `2026-10-18T04:34:11Z` | Même run, même SHA ; ne pas réécrire le constat historique |
| Programme des missions | #156 existe ; 31 missions et groupes #157–#164 déjà enregistrés | [Issue #156](https://github.com/RachEma-ux/Fadi/issues/156) |
| Livraison des missions | PR #165 ouverte et non fusionnée ; tête avant ce checkpoint `c1c0f7f3ad3a1720e8c64252eea89823351f0b88` | [PR #165](https://github.com/RachEma-ux/Fadi/pull/165) |
| Continuité Studio | `docs/workstreams/studio/` absent de `main` ci-dessus, mais ses quatre fichiers existent déjà sur la branche de #165 | Lecture du répertoire sur `main` et des quatre fichiers sur la branche |
| Couverture du plan initial | Job `Codex — 31 missions et 630 tâches` réussi sur la tête initiale de #165 | [Run 39097792250](https://github.com/RachEma-ux/Fadi/actions/runs/39097792250) ; contrôle des affectations, pas de la réalisation |

Les succès du job image et de la restauration en CI ne prouvent pas le démarrage du runtime personnel Codex ni une restauration de production. Les nombres historiques 1 757/47/3 ne sont pas déduits de la conclusion courante d’un workflow. Ce rapprochement n’a relancé aucune suite applicative.

## 3. L1–L3 : consolidation, sécurisation et équipe

### L1 — Faits et limites du compte rendu reçu

Référence locale rapportée : branche `work`, HEAD `aadd083ca282ed7db8af31f0fb3724c861b5107f`, dépôt propre. La comparaison vers `main@27c0c5a…` est rapportée comme documentaire. Le nom `work` n’est pas traité comme une anomalie ; les SHA, arbres et provenances sont déterminants.

Les contrôles locaux dépendances, isolation nominale (761 fichiers), continuité et tests Node du validateur sont déclarés relancés avec succès. Les 1 757 tests et un ignoré, 47 scénarios et trois validations IFC sont historiques, non rejoués localement pendant Mission 002. Les références PR #148/#155 fusionnées et #142/#143/#150/#152/#154 ouvertes sont celles du relevé Codex ; requalifier chaque PR avant intervention, sans transférer son ancien succès à une nouvelle tête.

| Réserve rapportée | Statut et portée à conserver | Missions / suivi |
|---|---|---|
| Cloud révision voulue/observée 10, réseau enforced | Ancienne révision 2 dépassée dans ce relevé ; contenu exact des scripts publiés non exposé | M01, #157 |
| Ports 3001/3002/5173/5432 sans service ; base arrêtée | Santé applicative non établie ; 3002 est lié à l’ancienne recette, pas une exigence courante | M01, #157 |
| Tests API destructifs dans 12 fichiers, URL héritée et pool sans garde | Risque de mauvaise cible confirmé dans le compte rendu, correctif non exécuté | M02, #157 |
| `main` non protégé | Confirmé de nouveau par GitHub lors de la réception ; aucune règle activée | M03, #146 |
| Manifeste Atelier v2 / commandes v3 | Aligner après autorisation ; maintenir la compatibilité v1/v2 | M05, #158 |
| Frontières modules insuffisamment contrôlées | Imports réciproques observés, pas preuve automatique d’un cycle runtime bloquant | M07, #151/PR #152 |
| Statuts, décisions et checkpoints périmés | Modules, OCCT, Planche, purge, relais #154 ; conserver histoire et provenance | M06/M08, #158/#147/#153 |
| CSP désactivée, aucun scan dédié identifié | Durcissement proposé ; aucune exploitation démontrée | M09, #157 |
| Versions Node/Chromium différentes de CI et bancs réels manquants | Reproductibilité à qualifier, pas défaut produit déduit d’une différence de version | M04, #157 |
| Deux entrées `echelle` dans `outils.ts`, écrasement dans `OUTILS_PAR_ID` | Collision rapportée ; effet utilisateur à reproduire, sans supprimer une fonction ou renommer sans compatibilité | M05/M21, #158/#160 |
| Variantes existantes sous forme de projets bifurqués | Ne démontre pas Projet → Étude → Variante → Révision pour Studio | M13/M17, #159/#160 |

Aucun P0 critique n’est démontré dans le périmètre rapporté. Les priorités P0 des lots Studio indiquent les fondations à réaliser, pas des incidents constatés. Le scan nominal ne prouve pas l’isolation exhaustive indirecte/documentaire ; un IFC valide ne prouve pas une conservation paramétrique intégrale.

### L2 — Spécifications préparées, non implémentées

**Cloud.** Le compte rendu indique un proxy répondant ; les premiers EPERM ne suffisaient pas à conclure à une panne réseau. Le conteneur `fadi-onboarding-db` était arrêté avec code 255, sans signalement OOM, à 05:52:07 heure suisse ; cause racine inconnue. `fadi-cloud-db.sh` peut préparer/démarrer la base, pas API/frontend. Aucun service n’a été redémarré pendant la mission.

Préparer la reprise locale bornée : identifier les scripts applicables et la base ; ne pas provoquer de migration implicite. Une fois l’exécution autorisée, exiger `/health` avec `db: "ok"`, HTML applicatif, 401 pour `/projects` sans session, lectures SQL de l’identité PostgreSQL/PostGIS, dépôt propre et preuve d’une session neuve. Un même identifiant d’environnement n’atteste pas une recréation à blanc.

**Garde DB.** La proposition impose `TEST_DATABASE_URL` explicite sans repli applicatif ; descripteur de base jetable (endpoint/base/rôle/identité/expiration), parsing strict, lecture de l’identité et du marqueur de provisionnement, refus en cas d’erreur ou de divergence, configuration validée immuable, revalidation après reconnexion, reset central couvrant les 12 suites et autres lanceurs mutateurs, rôle limité et journaux sans secret. Nom contenant test, localhost, NODE_ENV ou drapeau seul insuffisants.

Cas négatifs à préparer d’abord avec doubles sans base réelle : URL absente, production, hôte inconnu, override, ambiguïté, identité différente, marqueur absent/expiré, timeout et reconnexion. Chaque refus doit démontrer zéro SQL destructif. Aucune connexion à une vraie production pour « tester son refus ». A3 n’implémente qu’après autorisation du lot ; les essais mutateurs exigent en plus une base jetable attestée et leur accord.

**GitHub.** Réutiliser la proposition désactivée de #152 plutôt que la recréer. Checks proposés à revalider par leur nom effectif : validate, e2e, image, Continuité — docs, checkpoints et tests, no-foreign-app-reference ; contrôle d’architecture après disponibilité et décision. PR obligatoire, conversations résolues, branche à jour, force-push/suppression interdits, pas de bypass permanent. Décision ouverte entre revue indépendante réellement disponible et organisation solo avec acceptation humaine explicite, sans approbation GitHub impossible. Aucun changement administratif exécuté.

**CSP et dépendances.** Deux unités proposées : inventaire CSP (Workers/WASM, ressources, hors-ligne), puis essais/application contrôlés ; scans dépendances/images avec bases datées, triage et exceptions motivées à expiration. Aucun résultat de scan ni vulnérabilité inventés.

### L3 — Mobilisation rapportée et conflits de fichiers

A0 déclare avoir consolidé A1 (produit/registre), A2 (architecture/contrats), A4 (navigation/UX), A5 (garde/tests), A6 (Cloud/CI/administration). A3 n’a effectué aucune correction.

Les fichiers communs exigent un propriétaire d’écriture unique à la fois : App.tsx, AppShell.tsx, ProjectShell.tsx, HomeTopbar.tsx, styles/traductions, schéma, manifestes/commandes, setup tests/client DB/workflows et checkpoints. La PR #142 recouvre déjà navigation/mode immersif ; son ordre d’intégration reste à décider. Sa recette historique 593/593 n’est pas une preuve sur une nouvelle tête.

## 4. L4–L6 : Studio, livrables disponibles et affectation

### L4 — Qualification initiale, pas recette Studio

Le compte rendu annonce 630 identifiants uniques, aucune case cochée, qualification par groupe, extraction des 104 EX et instruction des 18 DEC. Les 141 fiches couvrent 104 EX, 15 INV, 11 IF et 11 AC. Six vérifications documentaires sont distinguées des réalisations. **Le registre détaillé, l’extraction et les cinq rapports originaux ne sont pas joints à ce message et ne sont pas enregistrés par ce seul résumé.** Codex doit récupérer ses fichiers, les vérifier et les verser sans secret dans le suivi existant, ou signaler leur indisponibilité sans les inventer.

Réutilisables selon le rapport : commandes, modèles, géométrie libre, cotes/annotations, rendu, versions, documents et publications. Cela ne valide ni autonomie 2D sans 3D, ni Étude/Variante/Révision, ni Registry/Manager sélectif, ni approbation multi-sources, ni les trois parcours Studio complets.

Conflits à arbitrer : renvoi de la charte V2.1 à l’ancien Concept V2 versus STUDIO-RT-001 V1.0 ; formats conditionnels versus D-179 sur DWG/DGN. Exclusion DWG du pilote proposée, sans réouverture implicite d’une décision antérieure. L’autonomie Studio, quatre domaines, deux planches, conservation Atelier/Parcours restent les obligations de la mission.

Les DEC-01–18 gardent leurs sujets : dessin 2D/stockage ; associations ; Étude/Variante/Révision ; profils ; manifests Registry ; API Manager ; chunks/cache ; renderer 2D ; index/snapping ; invalidation 3D ; workers/OCCT ; historique ; appareils/budgets ; hors-ligne ; extensions/MCP ; publication multi-sources ; qualité adaptative ; réutilisation moteurs/services. Leurs responsables, preuves et conditions demeurent à documenter dans les fiches exactes, pas à remplacer par ce résumé. DEC-15 n’est pas un verrou global du socle ; DEC-16 est à concevoir dès G1. La décision navigation est distincte des DEC existantes.

Séquence rapportée : G0 → G1 → G2 → G3 → sous-ensemble autorisé → G4. I/X/A.1 ; autonomies A.2/A.3 et B sur contrats stables ; A.4/A.5 ; C/D selon charge avec protections minimales avant exposition ; E indispensable au pilote terminable ; R ; F conditionnel. Aucun gate n’est accepté par cette réception.

Pilote proposé, non ratifié : petite étude synthétique de local/pavillon, parcours A dessin 2D jusqu’à publication sans 3D, B création spatiale directe jusqu’à vue/coupe sans esquisse préalable, C objets associés avec quantités/hôtes, historique/conflit, observation, approbation et publication. L’oracle mur/ouverture 3,180 puis 3,096 m³ teste l’intégrité, pas à lui seul l’utilité métier.

### L5/L6 — Raccorder aux missions existantes, ne pas recommencer

**Mission 002 désigne la vague de préparation reçue ; elle n’est pas la mission M02 (garde DB) du catalogue M00–M30.** Aucun de ces intitulés ne doit être utilisé pour clore l’autre.

| Catalogue existant | Contribution reçue | Suite autorisée / condition |
|---|---|---|
| M00, M29 | Coordination, propositions de registres et quatre checkpoints Studio | Récupérer/rapprocher les livrables originaux ; enrichir les fichiers déjà présents dans #165, sans nouveau programme |
| M01, M04 | Diagnostic Cloud et CI par SHA | Compléter preuves et procédure ; reprise locale réelle selon autorisation |
| M02 | Spécification DB et cas négatifs | Finaliser contrat/test plan ; code et essais mutateurs après accord |
| M03, M07 | Politique de revue et frontières | Examiner #152/#146/#151 ; activation admin et correctifs distincts |
| M05/M06/M08/M09 | Contrats, documentation, isolation, sécurité | Qualifier les constats ; poursuivre documentation autorisée ; aucun correctif applicatif implicite |
| M11–M14 | Sources/pilote, fiches, navigation, DEC et G0/G1 préparés | Récupérer 104 EX et compléter les 141 fiches exactes ; décisions/G2/G3 non acceptées |
| M15, M26 | Corpus/tests/NAV prescrits | Compléter oracles et protocoles ; pas de recette Studio réputée exécutée |
| M16–M25, M27–M28 | Lots et dépendances proposés | Réalisation, options, migrations et mise en service selon gates et accords |
| M10, M30 | Jalons de production et clôture | Vérifier les preuves #149, ne pas refaire production/sauvegardes ni clore le programme |

Les Issues #157–#164 et les quatre documents `docs/workstreams/studio/` existent **sur la branche de #165**, même s’ils sont absents de main. Les propositions Mission 002 doivent les enrichir, pas les remplacer ni créer des suivis concurrents. Le registre 630 lignes annoncé hors dépôt doit être rapproché de `missions.json` et de l’export 630/630 existants par identifiant ; conserver les preuves et états déjà renseignés. Qualification initiale par groupe ne vaut pas audit individuel complet.

## 5. Instruction de continuation à Codex

Appliquer [CODEX-START-HERE.md](../CODEX-START-HERE.md) et reprendre #156, sans relancer toute Mission 002.

1. Vérifier tête/état de #165 et lire la branche du plan tant qu’elle n’est pas fusionnée. Conserver séparément SHA du code analysé et SHA documentaire.
2. Récupérer les cinq rapports, registres et fiches annoncés dans la session Mission 002. Lister les fichiers réellement retrouvés, leurs versions, empreintes et limites. Une pièce introuvable reçoit un blocage précis ; aucun rapport fictif ni reconstitution présentée comme original.
3. Publier les documents non sensibles récupérés dans une branche/PR autorisée, de préférence le suivi documentaire existant si les modifications sont compatibles ; réserver les fichiers partagés. L’autorisation de préparation et d’enregistrement documentaire figure déjà dans #156 : ne pas redemander une confirmation de principe pour ces opérations seules.
4. Compléter M11/M12/M13/M15/M26/M29 et les préparations M01/M02/M03/M05–M09 dont les entrées sont disponibles. Conserver les identifiants, aucune case métier cochée sans preuve. Les missions transversales ne sont pas closes par la remise L1–L6.
5. Préparer des demandes d’autorisation **bornées et séparées**, en priorité garde DB M02 et reprise locale Cloud M01, avec fichiers, tests purs puis jetables, critères, exclusions et risques. Ne pas commencer le code ou redémarrer des services depuis ce seul checkpoint.
6. Enregistrer les décisions ouvertes de la section 6. Continuer les analyses/documentations indépendantes pendant l’attente ; ne pas arrêter globalement le programme sur une autorisation partielle.
7. Avant interruption, mettre à jour STATUS et HANDOFF ensemble, noter la prochaine action exacte et les livrables encore locaux. Ne pas prétendre poursuivre sans session/processus actif.

## 6. Registre des décisions demandées — aucune ratification ici

| ID de réception | Décision issue du rapport | Responsable / état | Suite sans décision |
|---|---|---|---|
| M002-D01 | Confirmer STUDIO-RT-001 V1.0, traiter l’ancien renvoi et ratifier le pilote A/B/C | Produit/utilisateur ; À définir | Préparer divergence, alternatives et critères G0 |
| M002-D02 | Exclusions initiales proposées DWG, IA externe, MCP, extensions tierces | Produit/utilisateur ; À définir | Respecter D-179 existante ; ne pas exclure silencieusement ni supprimer une capacité Fadi |
| M002-D03 | Autoriser le lot garde DB puis ses essais jetables | Utilisateur ; Autorisation requise | Spécification et tests négatifs proposés, sans implémentation applicative |
| M002-D04 | Autoriser une reprise locale Cloud bornée | Utilisateur ; Autorisation requise | Diagnostic/lecture des scripts et procédure sans production ni migration implicite |
| M002-D05 | Choisir politique de revue et autoriser activation des protections | Administrateur/utilisateur ; Autorisation requise | Relire #146/#152 et préparer la configuration |
| M002-D06 | Ordre de traitement #142/#152/#154 et travaux recouvrants | Coordinateur prépare, utilisateur arbitre ; À définir | Cartographier diffs/contrats, réserver fichiers, aucune fusion |
| M002-D07 | Placement Studio après Projets, routes, transitions, rôles et appareils | Produit/utilisateur ; À définir | Spécifier options et NAV sans les présenter comme retenues |
| M002-D08 | Enregistrement documentaire dans GitHub | Couvert pour missions/instructions/suivi par le mandat #156 | Enregistrer résumé/checkpoints maintenant ; récupérer les originaux avant de prétendre les avoir versés |

A0 prépare ces décisions ; il ne signe pas à la place du responsable. Ne pas utiliser la réception du rapport ou la fusion de son archive comme acceptation de l’audit ou autorisation de réalisation.

## 7. Blocages à conserver

| Blocage | Responsable | Action de déblocage et preuve attendue |
|---|---|---|
| Rapports originaux, registre enrichi et 104 EX encore hors dépôt | A0 avec A1/A2/A4/A5/A6 | Retrouver/exporter, vérifier, rapprocher et publier les fichiers non sensibles ; sinon chemin de reprise et pièce manquante explicites |
| Démarrage/identité de base et cause d’arrêt non établis | A6 | Scripts exacts, autorisation bornée puis sondes/diagnostic datés |
| Garde DB non implémentée | A5/A2 puis A3 autorisé | Accord du lot, refus purs prouvés, cible attestée avant toute suite mutatrice |
| Protections GitHub inactives | A6/administrateur | Décision solo/indépendante et accord d’activation, preuve GitHub |
| G0–G3 et options non ratifiés | A0/A1/A2 et responsable produit | Décisions ciblées et preuves requises, sans bloquer les qualifications indépendantes |

Aucune tâche, réserve ou option n’est supprimée ; aucune tâche applicative ni case Studio n’est déclarée terminée par ce checkpoint. Aucun correctif, fusion, administration, service Cloud, base ou production n’est modifié lors de cet enregistrement documentaire.
