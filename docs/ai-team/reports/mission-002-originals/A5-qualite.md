# Mission 002 — A5 Qualité et sécurité — préparation uniquement

Date : 18 octobre 2026. Code local observé : `aadd083ca282ed7db8af31f0fb3724c861b5107f`. La revalidation du SHA GitHub courant et de sa CI relève de la consolidation A0 ; aucun résultat ci-dessous ne prétend couvrir automatiquement le main distant. Aucun test DB/E2E/destructif, migration, correction ou opération GitHub effectué.

## Constats requalifiés

| Priorité | Constat vérifiable | Portée et risque |
|---|---|---|
| P1 | `apps/api/vitest.setup.ts:6` charge `.env.test` sans override ; `apps/api/src/db/client.ts:5–13` prend DATABASE_URL et construit Pool sans garde test. | Une DATABASE_URL héritée gagne sur `.env.test`. NODE_ENV=test ou un nom contenant test ne prouvent pas la destination. |
| P1 | TRUNCATE CASCADE dans `apps/api/src/app.test.ts:29`, `apps/api/src/routes/atelier-commands.test.ts:20` et dix autres fichiers de tests API. `vitest.config.ts:6` documente la base partagée. | Le risque dépasse deux fichiers : supprimer une seule occurrence ne sécurise pas le lancement complet. |
| P2 | `apps/api/src/app.ts:27` : helmet({ contentSecurityPolicy: false }). | Réserve de défense en profondeur, pas preuve de faille exploitable. Vérifier aussi l’en-tête effectivement servi par le frontal avant verdict production. |
| P2 | `.github/workflows/ci.yml` installe avec --no-audit ; aucun scan dédié CodeQL/OSV/Trivy/Snyk/npm audit trouvé dans les workflows examinés. | Pas de preuve courante d’absence de vulnérabilités. npm ci réussi ne remplace pas un scan. |
| P3 | CI Node22 ; historique Cloud Node24 et Chromium système154/Playwright1.56. | Reproductibilité différente ; pas une preuve de panne. |

La CI configure bien des services PostGIS jetables distincts (`fadi_test`, `fadi_e2e`, `fadi_image`), mais ce bon câblage CI ne protège pas une exécution locale mal ciblée. Les identifiants CI publics de service ne sont pas des secrets de production.

## Spécification proposée : barrière avant toute destruction

1. Séparer le lanceur de tests DB du client applicatif. Le lanceur exige une TEST_DATABASE_URL explicite ; absence = refus. Ne jamais retomber sur DATABASE_URL applicative, .env général, valeur par défaut ou URL inconnue.
2. Le provisioning A6 produit un descripteur éphémère autorisé : runId aléatoire, identité de conteneur/service, hôte/port exacts, database et rôle dédiés, expiration, marqueur de base jetable. Aucune détection fondée seulement sur le suffixe test ni sur localhost.
3. Avant connexion : parser strictement l’URL PostgreSQL, normaliser hôte/port/database/role ; comparer au descripteur exact ; refuser production/staging/inconnu, URL ambiguë, options de routage ou socket non autorisées, paramètres dupliqués/encodages piégeux, override de service/host. NODE_ENV=test et un flag ALLOW_DESTRUCTIVE ne suffisent jamais.
4. Une connexion validée n’obtient d’abord que des lectures d’identité : current_database(), current_user, adresse/port serveur et marqueur de provisioning. Toute divergence, lecture impossible, marqueur absent/expiré = refus fermé. Ne pas créer le marqueur au cours de cette vérification.
5. La même configuration validée produit le pool de nettoyage ; aucune relecture tardive de process.env. Centraliser le reset et interdire les TRUNCATE directs hors helper contrôlé. Vérifier les schémas/tables ciblés et leurs dépendances CASCADE. Rôle limité à la base jetable, jamais superuser ni accès aux autres bases.
6. Autorisation de reset bornée au run et à l’identité vérifiée ; nouvelle vérification après reconnexion. Conteneur/réseau sans route vers production, aucun credential production injecté. Ne jamais appliquer ces gardes au client production de façon à casser son fonctionnement.
7. Journaux : SHA, runId, version garde, identité non sensible, verdict ; aucun mot de passe/URL complète/token. Provisioning, migrations et destruction de base sont des tâches distinctes soumises à l’autorisation correspondante.

### Tests négatifs sans base réelle (première correction A3, après autorisation)

Injecter parseur, environnement, connecteur et fonction reset simulés ; vérifier les compteurs d’appels. Chaque refus avant connexion doit donner connect=0, SQL=0 ; les refus après attestation ne permettent que les SELECT d’identité, jamais mutation/reset.

| Cas | Attendu |
|---|---|
| TEST_DATABASE_URL absente mais DATABASE_URL présente | Refus, aucun fallback, aucune connexion. |
| URL production même si NODE_ENV=test / ALLOW=true | Refus avant connexion. |
| Nom fadi_test sur hôte inconnu, localhost non attesté, port différent | Refus. |
| Rôle inconnu/superuser, base inconnue, descripteur expiré/runId différent | Refus. |
| URL malformée, protocole inconnu, noms encodés, query host/service/options et doublons | Refus ou normalisation explicitement testée puis correspondance exacte ; aucune ambiguïté tolérée. |
| Database/user/serveur observé différent, marqueur absent/faux, timeout/erreur d’attestation | Refus avant TRUNCATE. |
| Changement environnement après validation, pool différent/reconnexion | Configuration immuable ; revalidation nécessaire, pas de bypass. |
| Import d’une suite API avec cible refusée | Échec contrôlé avant beforeEach ; aucun TRUNCATE de tous les fichiers. |
| Erreur/refus loggé avec mot de passe sentinelle | Sentinelle absente des logs. |

Après ces preuves unitaires, A6 provisionne une base jetable identifiée (aucun test sur une vraie production, même pour prouver un refus). Test positif : migrer seulement cette base autorisée, exécuter un reset, vérifier son identité et les effets attendus ; test négatif d’attestation sur seconde base également jetable. Le refus d’une cible production est démontré par simulation uniquement.

## Matrice non-régression existant → preuves à compléter

| Domaine | Existant inspecté / preuve historique | Complément requis Studio |
|---|---|---|
| Parcours | `parcours-scenario.mjs`, app.test, 21 étapes conservées par AGENTS | Rejouer sur SHA cible après garde DB ; conservation phases/libellés/cartes/Harmonie et ouverture Studio sans étape. |
| Modèles et commandes | packages atelier-model/planche-model tests ; routes atelier-commands (idempotence, unités, concurrence) | TEST001–014 : contrats Studio, deux planches indépendantes, associations/topologie, atomisme, conflits, historique ; ne pas assimiler tests Atelier à conformité Studio. |
| Outils et chargement | catalogue-outils/barres-outils et recettes Planche | TEST016–021/036 : profil20, permissions réelles, cache absent, reconnexion, compatibilité files. |
| Géométrie/performance | suites snapping/inférence/extrusion/objets Planche existantes | TEST022–025 : oracle avant/après, identité picking, tolérances décidées, mesures S1–S5. |
| Contrôles et publication | recettes atelier-documents/versions/echanges et tests API | TEST009/010/026–032/038 : études/révisions, quantités3,180 puis3,096m³, manifeste multi-sources immuable, approbation distincte. |
| Autorisations | app.test.ts:1884–1916 droits membres/lecteur, routes protégées | TEST018/035 : URL/job/export/références interprojets, permissions retirées après mise en file, absence de fuite ; tests positifs et négatifs. |
| Résilience | tests/recettes worker, versions, offline et restauration existants | TEST014/015/034/036/037 : résultat périmé jamais engagé, crash, restauration complète, file SW conservée, 50 ouvertures et seuils DEC13. |
| Extensions/IA | assistant/graphes natifs existants | TEST032/033 : mêmes droits/commandes/idempotence, modèle inchangé sans décision ; F conditionnel. |
| UX | interface-anglais et recettes clavier/mobile existantes | NAV001–009, FR/EN, focus, clavier/tactile, retour plein écran, erreurs d’enregistrement ; mesures appareil réel. |
| Industriel et isolation | recettes p2 mécanique/structure/bois/tôlerie/MEP/coordination/documentation/automatisation | Conserver fonctions/règles, migrer identifiants uniquement avec compatibilité ; scanner nominal ne prouve pas autonomie indirecte. |

## Corpus S1–S7 et traçabilité

Sources rapprochées : charte DOCX V2.1 extraite (63 lignes), référentiel technique DOCX (1673 lignes), plan (520 lignes) et checklist (1355 lignes). REF02 §18/19 et annexe A du plan prescrivent TEST001–038 ; ce sont des scénarios à prouver, pas des exécutions.

S1 détail2D (cotes/textes/hachures/blocs/courbes/contraintes), S2 plan niveau (objets/hôtes/références), S3 plan dense (superpositions/intersections), S4 immeuble multi-niveaux/structure/réseaux, S5 3D libre/exact, S6 études/variantes/révisions/dossiers, S7 offline/reconnexion. Pour chaque scène : origine/licence autorisée, empreinte, version, unités/repères, objets de référence et résultats attendus. Pas de données production. Densités100/10000/100000 restent candidates, pas promesse de capacité. DEC13 doit fixer appareils et budgets ; SwiftShader ne remplace pas un GPU physique.

Chaque ligne de preuve : exigence EX/INV/IF/AC → tâche checklist → composant/contrat → TEST/NAV → SHA/build → corpus/hash → environnement (OS/Node/browser/GPU/écran/caches/réseau) → répétitions/tolérances/statistique → exécutant/horodatage/verdict/logs → décision d’acceptation. États autorisés : À définir / À faire / En cours / Implémenté / Vérifié / Bloqué / Accepté. Une case, un test présent ou une CI verte n’établit pas Accepté.

## Preuves historiques réellement consultées

`/workspace/fadi-acceptance-results/RAPPORT-FADI-CLOUD.md` attribue 1757 tests réussis+1 ignoré au SHA aadd083… ; ce total n’a pas été rejoué. browser-results.json contient47 entrées, toutes exit_code0 ; registre historique, pas preuve du main courant. Trois validations IFC historiques disponibles, sans régénération ni exécution présente. p118-reimporte-validation.log : IFC4X3_ADD2, zéro erreur,1539 IfcBuildingElementProxy,0 IfcWall/IfcDoor/IfcWindow. Cela prouve une validation du fichier représentation historique, pas conservation paramétrique, certification BIM, ni TEST028 complet. Les tests API existants couvrent déjà plusieurs refus401/403, sans constituer un audit sécurité exhaustif.

## Portes et critères de sortie

G0 : corpus documentaire/préséance/périmètre et divergences recensés ; non assimilé à autorisation de développer.
G1 : contrats/décisions bloquantes et réutilisation étudiés ; critères EX/INV/IF/AC attribués.
G2 : POC limités autorisés séparément, reproductibles sur corpus pertinent. Aucun POC lancé ici.
G3 : plan/risques/coûts/périmètres et critères acceptés humainement ; autorisation de réalisation distincte.
G4 : trois parcours A2D/B3D/Cassocié réellement terminables, tests de sécurité/refus/résilience et non-régression sur SHA livraison, restauration prouvée sur environnement jetable, réserves/acceptations explicites. TEST001 reste ouvert avant publication lotE ; J3 n’est pas acceptation MVP.

## Plan sécurité complémentaire proposé

CSP : inventorier origines/API/Workers/WASM/blob/styles/fonts, produire politique minimale par environnement et vérifier en report-only sur banc autorisé ; tests de navigation/export/import/exact/offline et absence de blocages injustifiés ; mise en application après validation, sans wildcard généralisé pour faire passer la recette. Contrôler l’en-tête au niveau qui sert réellement HTML.
Scan : job explicite dépendances JS/Python/images et éventuellement analyse statique, versions/bases de signatures datées, SBOM et rapport sans secrets, triage des atteignabilités/licences, politique d’exceptions expirables et responsable. Séparer constats scanner et décision de blocage ; changement CI après autorisation.

## Mission indépendante prête pour A5 suivant

Relever SHA/branche/CI ; lire HANDOFF puis STATUS/TASKS/CONTEXT. Vérifier la garde DB par inspection et tests purs sans DB réelle. Attendre attestation A6 et autorisation avant suites API/E2E. Construire la matrice EX/INV/IF/AC→tests→preuves pour I/A/B/X ; tracer les38 scénarios sans cocher. Livrer rapport par SHA, résultats passés/ignorés/non exécutés, différences géométriques et risques résiduels. A3 reste inactif dans Mission002 ; futur A3-DB = garde+refus purs ; futur A3-CSP/CI = lots séparés après spécification et accord. Fichiers partagés avec A6 : setup/client/vitest config/workflow ; un seul éditeur désigné par lot, A5 révise sans modifier concurremment.
