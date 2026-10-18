# Mission 003 — A6 DevOps

Relevé du 18 octobre 2026, vers 09:45 UTC / 11:45 Europe/Zurich. Référence locale et PR #165 : **a09c11d397c8527987c3d1c4410ebb2eb240a819**. Analyse réellement exécutée par A6. Dépôt de travail inchangé ; aucune copie des originaux Mission 002 modifiée. Seules sorties : ce dossier A6. Consignes AGENTS/CLAUDE, continuité, programme et checkpoints ai-team/studio lus.

## M01 — Cloud et démarrage

Statut actuel recontrôlé : même environnement `ccarenv_b64_Y2NhcmVudl8zMThjZDQ3ODMzZDA4MTkxOGMyMWVmMTI0ZmI5M2M3Mw`, révision voulue et observée **18**, observations actuelles, running, connected, politique enforced. La révision **10 est un constat historique Mission 002**, pas la révision actuelle. Même identifiant et workspace persistant : aucune preuve de recréation à blanc ni de nouvelle session indépendante. Le seul outil Cloud exposé est environment_status ; il ne fournit pas les scripts install/start ni le dernier brouillon. Ne pas demander de secret pour combler cette limite ; demander une lecture/export expurgé de la version publiée dans l’interface Cloud.

Sondes réseau non destructives, avec permission réseau additionnelle : refus de connexion sur 127.0.0.1:3001/3002/5173/5432 ; proxy:8080 accepte, proxy:8088 refuse. Les erreurs EPERM du sandbox de Mission 002 ne décrivent pas la santé réseau actuelle. Aucun contournement proxy ni destination de production sondée. API et santé DB/PostGIS non vérifiées : pas de service joignable.

Docker inspect confirme `fadi-onboarding-db` arrêté : exit255, OOMKilled=false, Error vide, RestartPolicy=no, StartedAt02:44:34Z, FinishedAt03:52:07Z. Image configurée `postgis/postgis:16-3.4` ; cela n’établit ni version binaire exacte ni extension installée. Logs lus avec borne : dernières lignes finissent à03:24:08Z sur checkpoint terminé, sans arrêt ordonné ni crash explicite. Des erreurs de relation `volumes`/`projects` absente à02:45 accompagnaient d’anciens TRUNCATE ; elles ne prouvent pas la cause de l’arrêt ultérieur. Aucune commande de test/SQL n’a été exécutée. **Cause racine non démontrée** ; ne pas transformer exit255 en diagnostic de panne du code ou de manque mémoire.

Le script local `/workspace/fadi-cloud-db.sh`, toujours présent et lu sans exécution, propose une image PostGIS par digest, démarre aveuglément le conteneur s’il existe et crée `fadi_test` sinon. La branche de réutilisation n’atteste ni image attendue ni identité de base ; le conteneur existant a été créé avec un tag. `POSTGRES_HOST_AUTH_METHOD=trust` est un dispositif de développement lié à loopback, à ne pas réutiliser comme politique de sécurité. Le script est mutateur et ne démarre ni API ni web. Existence de ce fichier ≠ script de démarrage effectivement sauvegardé dans Cloud révision18.

Sources code : README84–85, npm dev lance seulement web5173 ; dev:api distinct lance API3001 ; `apps/api/src/server.ts` ne migre que si MIGRATE_ON_START vaut1 ; Dockerfile36 fixe cette variable à1 par défaut. Port3002 n’est pas une obligation du contrat courant. Absence de serveur et base arrêtée expliquent les refus sans prouver pourquoi les processus ont cessé.

## M04 — Versions et CI propre à chaque SHA

| Composant | Exécuteur Cloud réellement lu | CI PR165 réellement lue | Source / limite |
|---|---|---|---|
| Node | 24.19.0 | 22.23.3 | --version ; job117637164835/setup-node ; engines>=22.12 |
| npm | 11.9.0 | 10.9.9 | --version et même job |
| Python | 3.12.14 | 3.11.17 | global et venv ; setup-python du job |
| Chromium | système154.0.8037.57 | 141.0.7390.37, build1194 | --version et installation job117637165006 ; pas une recette Cloud exécutée |
| Playwright | 1.56.0 dans lockfile et dépendances existantes /workspace/Fadi | 1.56.0 lockfile ; Chromium1194 installé | Pas d’installation nouvelle ni assimilation copie dépendances à preuve d’exécution PR |
| IfcOpenShell | 0.9.0 dans /workspace/fadi-ifc-venv ; absent Python global | 0.9.0 installé | Import/version venv et logs CI ; utiliser explicitement le bon interpréteur |
| PostgreSQL/PostGIS | image16-3.4 configurée ; conteneur arrêté | image16-3.4 déclarée dans workflow | Versions SQL exactes non interrogées |

GET `/actions/runs?head_sha=<sha>&per_page=100` et `/commits/<sha>/check-runs?per_page=100`, via connecteur GitHub read-only :

| SHA | Runs | Verdict à ce relevé |
|---|---|---|
| main27c0c5a35e2f116752a83a9c66459484488a1975 | CI39095745108 ; continuité39095745135 ; isolation39095745118 | Tous success ; CI validate/e2e/image success. Ancien e2e « en cours » dépassé |
| PR165 a09c11d397c8527987c3d1c4410ebb2eb240a819 | CI39114417812 ; couverture39114417819 ; continuité39114417840 ; isolation39114417883 | Tous completed/success ; CI jobs117637164835 validate,117637164976 image,117637165006 e2e réussis |
| PR152 f2777230e3e9c3bd6a2a5f61e2147acd1fba4b38 | check-runs relus | validate/e2e/image/continuité/isolation et Architecture—frontières et isolation success ; PR ouverte non fusionnée |

Logs actuels PR165 lus : 47+95+468+744+22+108+273 = **1 757 tests passés**, 1 ignoré (`mesures-l19`, activable par MESURES=1). Trois IFC validés par IfcOpenShell0.9.0. Ce sont des preuves nouvelles du job CI sur a09c11d, **pas une relance locale A6**. Réimport : 0 IfcWall et1539 IfcBuildingElementProxy ; aucune conservation paramétrique intégrale ou certification déduite. Des extraits sélectionnés, sans variables ou données de connexion, sont conservés dans extraits-ci.txt ; journaux entiers non republiés.

Job e2e réussi prouve les étapes de son workflow ; A6 ne reconstruit pas un nombre de «47 scénarios» depuis ce seul succès. A5 rapproche individuellement les scénarios. Build/typecheck/tests/IFC et restauration CI sont des commandes mutatrices dans services CI dédiés déjà exécutées par GitHub ; aucune réplication dans la base Cloud. Banc L19 et appareils réels non exécutés : `docs/planche/mesures/l19-extrusion.md` conserve mesures du11octobre, budgets non tenus, téléphone réel non mesuré. Une CI verte ne clôt pas ce risque performance ni une recette métier Studio.

## M03 — Protection GitHub

Branche main relue : SHA27c0c5a…, protected=false, required checks off. #146 ouverte. PR152 ouverte en brouillon à f2777230… ; proposition existante `docs/continuity/main-ruleset.proposed.json` enforcement=disabled. **Aucun second JSON créé**. Son texte et ses limites ont été relus via `/pulls/152/files?per_page=100`. Le bypass administratif effectif n’est pas visible dans la réponse branche ; ne pas affirmer qu’il est absent parce que proposition bypass_actors=[].

Noms exacts des checks observés (app GitHub Actions15368) : `validate`, `e2e`, `image`, `Continuité — docs, checkpoints et tests`, `no-foreign-app-reference`. #165 ajoute `Codex — 31 missions et 630 tâches` ; disponible sur sa tête, pas encore dans main. #152 ajoute `Architecture — frontières et isolation`, disponible sur sa tête mais non fusionné. Ne rendre ces deux derniers requis qu’après intégration explicitement autorisée et vérification de déclenchement sur toute PR. `inventory`, filtré par chemins, reste exclu des checks globaux. Appellation de workflow ≠ nom de check.

Préparation administrative réutilise #152 : Settings→Rules→Rulesets, main uniquement, PR obligatoire, interdiction suppression/force-push, conversations résolues, checks à jour, aucun bypass permanent proposé. Choix explicite requis : 0 approbation supplémentaire si propriétaire solo avec acceptation humaine tracée ; sinon1 revue indépendante avec second mainteneur réellement habilité. Activer seulement après accord administratif distinct et outil habilité ; relire configuration et prouver blocage fusion sans checks sur PR documentaire autorisée, sans force-push réel. Préparation terminée ne signifie ni règle active ni #146 close.

## Contrat de reprise et décision M002-D04 prête à soumettre

**Objet précis à autoriser** : essai local jetable de reproductibilité, sans production, sans réutilisation de fadi-onboarding-db et sans migration automatique. Identifier configuration Cloud publiée révision18, scripts exacts et SHA cible. Figer versions/lockfile/digest. A6 provisionne seulement après accord un nouveau conteneur/base/rôle dédiés au run, identité/label/nonce attestés, réseau loopback, aucun volume de production. Pas de rôle superuser pour l’application. Tout coût ou changement de configuration Cloud reste explicitement décrit séparément.

**Deux étapes d’autorisation** : D04a permet lecture des scripts exportés et démarrage de services locaux sur cible déjà provisionnée/identifiée ; D04b doit mentionner explicitement création de conteneur/base, initialisation de schéma si nécessaire et destruction finale de ces seules ressources. Si schéma absent, arrêter ; aucune migration depuis ce simple accord de démarrage. La garde M02 et sa preuve sont préconditions pour tout test API/E2E/nettoyage.

Procédure proposée : contrôler SHA/arbre ; conserver identité cible sans secret ; **forcer MIGRATE_ON_START=0**, y compris au lancement image (Dockerfile le fixe à1) ; démarrer API3001 et frontend5173 ou build WEB_DIST déjà disponible, ne pas installer/reconstruire implicitement ; relever processus et logs expurgés ; SELECT metadata/version/extension read-only sur cible attestée ; GET/health db=ok ; GET/accueil HTML ; GET/projects sans session401 ; arrêter uniquement ressources de cette tentative selon accord, jamais supprimer l’ancien conteneur/volume. Une base vierge nécessite un accord distinct d’initialisation, sinon cette séquence doit s’arrêter proprement.

Acceptation mesurable : nouvelle session réellement identifiée, révision/scripts/SHA reproductibles, cible et migrations désactivées attestées, sondes réussies et absence de mutation inattendue ; échec conservé avec cause/trace et prochaine action. Pas de refus « simulé » sur vraie base interdite. D04 ne donne ni droit d’administrer GitHub, de corriger M02 ni d’exploiter Fadi-Serv.

## M10 — Jalons #149 relus, sans opération externe

Issue149 et ses trois commentaires ont été réellement lus. Corps ancien à cases non cochées n’est pas un verdict actuel. Commentaire6243033659 rapporte déploiement technique du SHA5cf61d1… à23:14:15UTC le17octobre et acceptation utilisateur « C est bon. La suite ? », sur captures transmises ; pas nouvel accès SSH. Commentaire6243082764 rapporte sauvegarde POST-validation : dump horodaté23:27:50UTC, snapshotd2107ead, résultat service success et contrôle métadonnées7/7 sans erreurs. Prévalidation6df3cf5c distincte. Ne pas redéployer ou refaire ces opérations par hypothèse.

Limites conservées : aucune restauration du nouveau snapshot démontrée, aucune relecture indépendante stockage/Healthchecks, heure snapshot séparée non affichée ; pré-restauration isolée portait sur l’ancien dump et quatre tables. #149/#147 restent ouvertes. A6 n’a interrogé ni VPS, stockage, sauvegarde ni site production. Prochaine action autorisée : conserver chaîne de preuves et réserves, pas réexécuter exploitation.

## Tableau de reprise A0

| Sous-tâche | État | Blocage / propriétaire | Prochaine action exacte |
|---|---|---|---|
| M01 état runtime/ports/DB | Vérifié partiellement | Scripts publiés non exposés ; cause arrêt sans trace ; nouvelle session non prouvée / A6 | Export expurgé install/start révision18 puis accord D04 borné |
| M03 préparation protections | Vérifié documentaire ; activation Bloqué | Main non protégé ; autorisation/outillage admin absent / utilisateur-admin | Arbitrer solo0 ou revue1 ; réutiliser152 puis accord activation séparé |
| M04 versions/CI courante | Vérifié sur SHA cité | Tests locaux mutateurs interdits ; appareils réels absents / A5-A6 | A5 complète oracles/scénarios ; pas de transfert à futur SHA |
| M10 lecture jalons149 | Vérifié rapporté | Originaux captures non recontrôlés ; restauration nouveau snapshot non prouvée / exploitation | Maintenir limites, ne pas répéter déploiement/sauvegarde |

Aucun service redémarré, migration, installation, test destructif, opération administrative, commit, PR ou action production par A6. Préparation avancée ; missions complètes/gates non déclarés acceptés.
