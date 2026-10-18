# A6 — Diagnostic et préparation DevOps, Mission 002

Relevé du 18 octobre 2026 vers 04:10 UTC (06:10 Europe/Zurich). Analyse réellement exécutée, aucune correction, installation, migration, activation de service ni modification GitHub. AGENTS, CLAUDE, protocole de continuité et skill Cloud lus. Preuves bornées dans A6-preuves.json ; il s’agit de données extraites des réponses, pas d’une sauvegarde brute intégrale des outils.

## Constats requalifiés

`environment_status` confirme le même identifiant d’environnement que lors de l’audit, version `cecfgver_6ad44033595c819397365ad72a44da2c`, révision voulue/observée **10**, observations actuelles, running/connected et politique réseau enforced. La réserve ancienne révision 2/brouillon 3 est dépassée. Ce même identifiant ne prouve ni une recréation à blanc ni la reproductibilité d’une nouvelle session. Le statut n’expose pas le contenu des scripts d’installation/démarrage ; leur configuration Cloud exacte reste à lire dans la configuration autorisée.

Sondes TCP read-only initialement bloquées par le sandbox (`EPERM`) ; répétées avec réseau additionnel autorisé, elles donnent **connection refused** sur 127.0.0.1:3001, :3002, :5173 et :5432. Proxy:8080 accepte la connexion et HTTPS github.com répond 200 via le chemin proxy hérité ; :8088 refuse. Ne pas qualifier le réseau HTTP de panne sur la seule erreur sandbox initiale. Politique TCP externe sans domaine/IP autorisé, VPN non configuré.

Docker est accessible en lecture avec le même périmètre réseau : aucun conteneur actif ; `fadi-onboarding-db` existe mais est arrêté (exit 255, pas OOM, champ Error vide), démarré à 02:44:34Z et terminé à 03:52:07Z. Image configurée **postgis/postgis:16-3.4**. Cela prouve la sélection d’image, pas les versions PostgreSQL/PostGIS effectivement démarrées ni la présence de l’extension dans une base. Cause racine de l’arrêt non déterminée ; aucun redémarrage ni lecture de données effectués.

Le script `/workspace/fadi-cloud-db.sh` est présent : démarrerait/créerait ce conteneur lié uniquement à 127.0.0.1:5432, image par digest, authentification trust locale, puis créerait fadi_test si absente. Il **n’a pas été exécuté** : il contient des mutations. Le conteneur existant conserve un tag d’image, alors que le script propose un digest ; la branche « conteneur existe » fait docker start sans vérifier son image. Prévoir contrôle explicite d’identité avant réemploi. Ce script ne lance ni API ni frontend. `npm run dev` lance seulement le web ; `dev:api` est distinct ; serveur API par défaut 3001 et relais Vite vers 3001. Aucun contrat courant n’impose 3002. Absence d’écoute cohérente avec services arrêtés/non lancés, sans démontrer une panne du code.

Node v24.19.0 et npm 11.9.0 observés ; CI déclare Node 22. DATABASE_URL non héritée du shell, ce qui ne prouve pas l’absence de fichiers dotenv (secrets non lus). Client pg_isready non installé dans l’exécuteur. Santé API, PostgreSQL et PostGIS non confirmée localement.

## GitHub actuel

GET read-only via `github_fetch` de `https://api.github.com/repos/RachEma-ux/Fadi/branches/main` : SHA **27c0c5a35e2f116752a83a9c66459484488a1975**, protected=false et enforcement checks off. Issue #146 ouverte. Aucune administration appliquée.

GET `https://api.github.com/repos/RachEma-ux/Fadi/actions/runs?head_sha=27c0c5a35e2f116752a83a9c66459484488a1975&per_page=100` puis `/actions/runs/39095745108/jobs?per_page=100` : runs **push main** Continuité 39095745135 et isolation 39095745118 réussis ; CI 39095745108 en cours, validate et image réussis, e2e en cours (Parcours terminé, recette Atelier en cours). Typecheck/tests/build et étape IFC de validate réussis sur ce SHA ; aucun décompte exact inféré du seul statut. **CI complète non verte à ce relevé**.

PR #152 est ouverte, brouillon, non fusionnée, mergeable=false observé ; HEAD f2777230e3e9c3bd6a2a5f61e2147acd1fba4b38. Elle contient déjà garde-fous, 52 tests, workflow et proposition de ruleset désactivé. Réutiliser/revoir ce travail plutôt que le recréer ou le présenter comme actif dans main.

## Spécification de sécurisation proposée — non implémentée

1. A6 prépare une base jetable isolée par tâche/worker, rôle non superuser à privilèges limités, endpoint local/éphémère attesté et marqueur d’identité généré par le provisionnement. Jamais de copie production ni d’identifiants production dans le job.
2. A3, après autorisation, sépare explicitement TEST_DATABASE_URL de DATABASE_URL ; pas de repli implicite. Garde fail-closed avant imports connectants et avant chaque chemin destructif : mode test explicite, tuple endpoint/port/base/rôle exact dans liste autorisée, protocole valide et absence d’options capables de changer la cible effective.
3. Vérifier côté serveur current_database/current_user et marqueur de base jetable ; nom *_test seul, NODE_ENV=test seul ou variable booléenne seule insuffisants. En cas d’absence, cible inconnue/prod, ambiguïté, métadonnées indisponibles ou mismatch : refus avant TRUNCATE. Pool/connection vérifié non remplaçable après garde.
4. A5 tests négatifs d’abord avec doublures sans connexion : URL absente, malformée, prod, hôte non autorisé, nom ressemblant, override dotenv/env, utilisateur différent, options de connexion ambiguës, marqueur absent/périmé et erreur metadata. Puis seulement sur base jetable dédiée pour prouver refus avec zéro mutation et succès autorisé. Aucun test contre cible réelle inconnue.
5. Inventorier tests API, scénarios e2e, scripts restauration et générateurs IFC qui écrivent ; appliquer même contrat à tous les lanceurs destructifs, migrations comprises. Sauvegardes/rétention et production hors périmètre.

## Cloud reproductible proposé

Avant exécution autorisée : figer version publiée et scripts, Node/npm/Chromium/image PostGIS/digest et lockfile ; consigner SHA cible et propre checkout. Ne pas considérer `work` comme anomalie par son seul nom : branche de tâche légitime si arbre/SHA/provenance correspondent. Le nom seul n’établit pas davantage le contrat de la plateforme.

Validation future : session réellement neuve ; installation reproductible ; base éphémère attestée ; démarrage sans migration implicite non autorisée (`MIGRATE_ON_START` à traiter explicitement), journaux expurgés ; /health doit confirmer db ok, SELECT read-only des versions et extension PostGIS, /accueil HTML, /projects sans session 401. Vérifier arrêt/reprise et conservation des sorties prévues. Les scripts ne doivent pas réutiliser aveuglément un ancien conteneur/base.

## Protections GitHub proposées

Réutiliser la proposition de #152 après revue et validation administrative séparée : PR obligatoire, conversations résolues, branches à jour, interdiction suppression et force-push, aucun bypass permanent. Checks exacts existants : `validate`, `e2e`, `image`, `Continuité — docs, checkpoints et tests`, `no-foreign-app-reference`. `Architecture — frontières et isolation` seulement après fusion autorisée de #152 et apparition vérifiée sur les PR. Ne pas exiger `inventory` filtré par chemins. Prévoir migration atomique des checks si renommés, jamais sélection par nom de workflow.

Politique solo proposée : 0 approbation GitHub supplémentaire évite auto-blocage, tout en imposant acceptation humaine explicite et PR. Avec second mainteneur disponible : soumettre seuil 1 et revue workflows/garde-fous. Choix humain requis. Activation `active`, relecture des règles effectives et test sur PR documentaire ; vérifier impossibilité fusion sans checks, sans tenter force-push réel sur main. JSON committé != règle active.

## Missions prêtes à lancer après validation

| Tâche | Responsable | Priorité | Dépendance | Acceptation |
|---|---|---|---|---|
| Relever scripts Cloud publiés et diagnostiquer arrêt sans mutation | A6 | P1 | Accès lecture configuration | Version, script et cause/limite tracés |
| Reproduction en session réellement neuve | A6 + A5 | P1 | Autorisation provisionnement/start local | SHA et sondes API/DB/PostGIS documentés |
| Contrat base jetable et cas négatifs | A2/A5/A6, puis A3 | P1 | Approbation spécification puis code | Refus systématique avant mutation, cible positive éphémère |
| Revue #152 et résolution de sa divergence | A2/A5/A0 | P2 | Validation de périmètre | Aucun doublon, CI exacte et revue avant fusion séparée |
| Activer protection #146 | Administrateur + A6 | P1 | Validation administrative explicite | Règle relue et PR de contrôle |

Blocages : application locale arrêtée, cause arrêt conteneur non établie, scripts Cloud non exposés par statut, nouvelle session non prouvée, CI e2e en cours au relevé, règles GitHub désactivées, aucune autorisation d’implémentation ou administration. Aucune de ces limites ne justifie une intervention production.
