# G2 — faisabilité statique du futur harness (A3)

Référence applicative : `5e0285d37f23c7c539502664036f0a2ff0986409` (PR171). Aucun POC, import applicatif, test, typecheck, CLI/help de runner, installation ou service exécuté. HEAD local vérifié identique ; worktree propre. Cette étude ne constate pas le HEAD distant ni une CI actuelle. Aucun gate ou choix physique accepté.

**La sélection et le typecheck des cinq fichiers proposés peuvent être préparés sans nouveau package ni dépendance. Pour la variante bundle natif + Node pur, proposer avant accord un sixième fichier `supervisor.py`, plutôt qu’une config Vitest, afin de rendre les IO bornés et la supervision concrets et versionnés. Aucun de ces éléments n’est implémenté ; confinement fort et arrêt effectif après 30 secondes restent non démontrés.** Les cinq fichiers comprennent un README, quatre TS et un seul fichier de test ; le runner et la fermeture publique core demeurent des modules chargés supplémentaires.

## Sources exactes

- Annexe A0 : `/workspace/work/mission003/repo/docs/ai-team/reports/reprise-496dcfc/G2-PERIMETRE-A0-PROPOSE.md` ; SHA256 `3de688104e96a64d4126f4dca1320dc6b07eca008aa6ae0df65a881ff9a86d75`.
- Graphe public A2 : `/workspace/work/resume496/agents/A2/G2-GRAPHE-IMPORT-PUBLIC-A2.json` ; SHA256 `4f57e852670404cafbbe6942d6d46ab710eb7c9f19a15321739a3b27bd004915`. Quatre modules runtime core ; aucun import profond ajouté.
- Configuration applicative lue au SHA demandé ; source installée du runner lue statiquement avec empreintes séparées dans JSON. Les fichiers node_modules ne sont pas attribués au commit Git et leur tarball n’a pas été réauthentifié par cette étude.
- Versions verrouillées : Vitest 5.0.3, Vite 6.4.3, TypeScript 5.9.3, types Node 22.15.35 ; TSX 4.19.4 est présent mais aucune nouvelle chaîne de lancement TSX n’est retenue ni déclarée validée.

## Deux commandes initiales candidates, jamais exécutées

À lancer uniquement après autorisation applicable et préconditions A5/A6. `node` ci-dessous désigne l’exécutable absolu vérifié par A6, appelé directement avec le tableau argv du JSON et `shell:false`, depuis la racine physique du futur worktree. Aucun npx, installation ou npm test global. Un wrapper de confinement complet n’est pas encore disponible ni validé.

### CMD-TSC

```sh
node ./node_modules/typescript/bin/tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution Bundler --lib ES2022,DOM --types node --strict --noUnusedLocals --noUnusedParameters --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --noFallthroughCasesInSwitch --forceConsistentCasingInFileNames --skipLibCheck experiments/studio/g2-2d-identities/schema.ts experiments/studio/g2-2d-identities/fixtures.ts experiments/studio/g2-2d-identities/harness.ts experiments/studio/g2-2d-identities/harness.test.ts
```

Typecheck des quatre racines TS expérimentales et de leur fermeture de types, sans émission ; README est relu comme documentation. Pas de tsconfig package hérité, pas de démarrage.

### CMD-VITEST

```sh
node ./node_modules/vitest/vitest.mjs run --root=experiments/studio/g2-2d-identities --environment=node --pool=threads --maxWorkers=1 --no-file-parallelism --maxConcurrency=1 --testTimeout=5000 --hookTimeout=5000 --teardownTimeout=1000 --retry=0 --no-cache --no-fsModuleCache --no-coverage --no-browser --no-ui --no-open --no-api --no-allowOnly --no-passWithNoTests --reporter=verbose harness.test.ts
```

Un seul candidat de fichier test sous la racine expérimentale inventoriée. Les trois autres TS sont des modules auxiliaires ; README n’est pas du code. Aucune garantie que ces quatre fichiers sont tous les modules chargés : runner et graphe public core sont aussi évalués.

Le typecheck est une vérification syntaxique/de types, pas une validation métier. Il ne suffit pas d’exécuter `npm run typecheck` racine : les workspaces `apps/*`/`packages/*` ne couvrent pas `experiments/`. Les chemins TS explicites font ignorer la recherche du tsconfig racine. Aucun `--config=false` n’est proposé au CLI : `--config` attend un chemin ; le mécanisme sans config vient de la racine expérimentale sans fichier de config.

Le filtre `harness.test.ts` est un filtre de sous-chaîne. Avant lancement, il faut donc vérifier qu’un seul candidat existe dans la racine, qu’elle contient exactement les cinq fichiers ordinaires autorisés, sans lien, `.env*`, configuration, snapshot ou autre fichier test. L’import public `@parcours/core-geometry` est conservé. Le résolveur Vite installé étaye la substitution `.js`→`.ts` ; cela reste une faisabilité statique, jamais une résolution exécutée.

## Conditions et limites

### HAR-01 — Sélection des cinq sources

Le répertoire experiments n’existe pas au SHA 5e ; aucun tsconfig/vitest/vite.config racine. Vitest cherche uniquement les noms config sous --root et passe configFile:false si aucun trouvé. Pas d’héritage implicite de apps/api/vitest.config.ts dans cette commande.

**Condition :** Avant exécution, vérifier exactement README.md/schema.ts/fixtures.ts/harness.ts/harness.test.ts, fichiers ordinaires, aucun lien ni .env/.env.* ni config ajoutée, aucun autre fichier test. SHA final et dépendances résolues localement vérifiés. Le filtre harness.test.ts est une sous-chaîne, pas une whitelist de sécurité ; c’est l’inventaire de cette racine qui le rend univoque.

### HAR-02 — Résolution publique TS ESM

Le package core expose src/index.ts. Le graphe A2 comporte quatre modules natifs sans effet IO identifié à l’import. Le résolveur Vite installé possède la substitution .js→.ts ; le runner fournit donc une piste existante sans paquet nouveau.

**Condition :** Aucune deep import, copie de polygonArea ou hypothèse de tree shaking. Revoir le delta de la fermeture A2 au SHA retenu. La résolution effective runner/workspace/TS reste non exécutée ; un échec sera conservé et non contourné.

### HAR-03 — Config supplémentaire

Une sixième config n’est pas indispensable pour cette sélection bornée et ce typecheck explicite. Elle devient nécessaire si l’on exige envFile:false et cacheDir explicite indépendamment de l’inventaire ou des valeurs CLI, car ces paramètres Vite et setupFiles/globalSetup/include/projects ne sont pas tous exposés par ce CLI.

**Condition :** Ne créer aucune config maintenant. Si A0 choisit cette variante, demander explicitement extension à experiments/studio/g2-2d-identities/vitest.config.ts ; décrire include exact harness.test.ts, setupFiles/globalSetup vides, aucune extension/projet/plugin utilisateur, envFile:false, cacheDir dans le scratch technique, Node/threads/1 et options d’arrêt. Cette config ne prouve ni confinement OS ni zéro réseau.

### HAR-04 — Écritures du runner

Vitest 5 appelle resolveApiToken même avec API/UI désactivées ; premier chemin XDG_DATA_HOME/vitest/.vitest-secret-token, repli workspace/node_modules/.vitest/.vitest-secret-token. no-cache ne l’annule pas. Le reporter JSON sans option stdout explicite peut créer un rapport ; il n’est pas retenu.

**Condition :** A6 doit autoriser et borner un sous-espace technique dans la session, fixer XDG_DATA_HOME et TMPDIR à cet espace, bloquer le repli dépôt par permissions/montage, inclure jeton/temp/cache/logs dans les limites ou faire préciser leur budget. Jeton jamais publié. Si l’écriture technique n’est pas autorisée ou dépasse une borne : refus, pas repli. Le dépôt est en lecture seule à l’exécution.

### HAR-05 — Environnement

Le runner lit aussi variables d’injection Vitest ; Vite peut lire les fichiers .env du root. Une variable vide ne bloque aucun socket.

**Condition :** Le superviseur passe un objet env construit de zéro : seulement valeurs fixes revues (par exemple CI=1, TZ=UTC, LANG=C.UTF-8 si disponible, XDG_DATA_HOME/TMPDIR scratch) et un PATH minimal si un auxiliaire est indispensable et identifié. Aucun spread process.env, NODE_OPTIONS/NODE_PATH/VITEST_MODULE_DIRECTORIES/npm_config_* ni credential/URL DB/proxy. Session physique confiée séparément à l’interface harness, jamais chemin provenant d’une fixture. Sans config dédiée, refuser tout .env* dans root inventorié.

### HAR-06 — Fichiers et liens

Node expose open(path,flags), O_CREAT/O_EXCL/O_NOFOLLOW et FileHandle. Cela protège la création exclusive du composant final dans le cadre OS adapté ; cela ne lie pas atomiquement toute la chaîne des parents. Les declarations fs lues n’exposent pas openat/openat2 ni RESOLVE_BENEATH. lstat/realpath/startsWith puis open reste vulnérable à substitution de parents.

**Condition :** Nom de session inédit/aléatoire, parents ancrés par environnement fiable, racine privée sans autre writer, fichiers ordinaires ouverts exclusivement, aucune entrée utilisateur de chemin, fstat du handle, vérifications des tailles et types avant usage. Si A6 ne peut garantir que les parents ne sont pas remplaçables pendant les ouvertures, la garantie forte demandée reste bloquée ; ne pas la remplacer par un simple contrôle de chaîne ou un chemin /proc auto-inventé.

### HAR-07 — Immuabilité et atomicité

Création exclusive ne signifie pas écriture complète atomique, transaction multi-fichiers ou résistance matérielle à une coupure. Un fichier partiel peut subsister après erreur/timeout. rename n’offre pas ici de no-replace portable.

**Condition :** Ne jamais ouvrir une destination existante en écriture, ni utiliser rename écrasant/copyFile standard/cleanup automatique. Anciennes révisions ouvertes en lecture et empreintes vérifiées. Fichiers candidats incomplets demeurent non promus ; un manifeste de réussite n’est considéré qu’après sortie correcte avant échéance et vérification externe. Aucune promesse de crash-durability ou transaction DB.

### HAR-08 — Bornes de données et ressources

Les 16 fichiers, 1 Mio/JSON, 8 Mio cumulés, profondeur32, 1000 objets, 10000 points sont des bornes proposées, jamais mesurées. Une vérification applicative ne constitue pas un quota OS.

**Condition :** Rejeter non-finitude/structures non synthétiques avant JSON.stringify, compter Buffer.byteLength UTF-8 avant création/écriture, réserver le cumul et les noms avant effets, sérialiser les écritures avec writer unique. Fichiers techniques et stdout/stderr doivent avoir budget explicite. A6 borne aussi disque/processus/mémoire hors du calcul ; aucun nettoyage silencieux en cas de dépassement.

### HAR-09 — Timeout et supervision

testTimeout/hookTimeout règlent des tests, pas l’initialisation complète, le calcul synchrone bloquant ou la durée globale. Node spawn timeout/AbortSignal envoient un signal ; kill n’est pas preuve de décès ni de disparition des descendants.

**Condition :** Superviseur extérieur au calcul, horloge monotone, délai global30s couvrant lancement/import/calcul/relecture selon budget à préciser, argv fixes et shell:false, stdout/stderr drainés et bornés, observation close/exit et vérification de la fin de l’arbre propre. Marquer annulé dès échéance et interdire promotion ultérieure. Groupe/cgroup/job dédié à cette exécution seulement ; jamais signal à processus partagé ni PID simplement mémorisé après réemploi possible. Aucun mécanisme externe vérifié ici.

### HAR-10 — Nombre de processus et relecture

pool=threads,maxWorkers=1 évite le fork de worker de test normal ; cela ne garantit pas un seul processus global. Vite/esbuild et chargeurs peuvent utiliser des auxiliaires ; ce graphe d’infrastructure n’est pas entièrement audité. Une seconde lecture dans le même test/processus ne prouve pas la réouverture indépendante.

**Condition :** Pas de spawn imbriqué dans un worker pour la relecture. Proposer deux invocations séquentielles indépendantes du même fichier test avec phases écriture/relecture explicites et nouvelle instance du runner ; le lecteur reçoit uniquement racine acceptée+identifiant/manifeste et n’écrit pas les révisions. Contrat de phase/argv pas encore défini par un fichier existant : ne pas inventer une commande read actuellement disponible. A6 doit préciser si le budget « un enfant de relecture » exclut ou inclut infrastructure ; si un processus total strict est exigé, cette candidate Vitest est non démontrée et arrêtée sans nouveau moteur/loader.

### HAR-11 — Réseau et isolation

no-api/no-browser/no-ui implique statiquement un Vite en middlewareMode plutôt qu’un service d’application exposé ; le runtime du runner peut néanmoins créer des objets serveur et le réseau n’est pas interdit par ces flags. Les types Node permission consultés listent fs/child/worker, pas une garantie de refus réseau.

**Condition :** A6 constate un refus réseau OS réel (sortant/entrant/loopback/IPC selon contrat) avant exécution dans un environnement dédié, sans lui substituer suppression d’env, mocks ou flags Node. Aucun serveur Fadi/API/DB, navigateur, installation, lifecycle ou service lancé. Si « aucun serveur » exclut même l’objet middleware interne du runner, il faut arbitrer la formulation ou déclarer ce runner incompatible ; pas d’affirmation implicite.

### HAR-12 — Types et portée du contrôle

Les quatre fichiers explicites évitent la recherche automatique tsconfig ; noEmit évite les sorties compilées. La lib DOM est requise pour les types publics core qui décrivent FaceCanvas, sans activer de navigateur. Le contrôle inclut la fermeture de types et node_modules, pas seulement quatre fichiers physiques.

**Condition :** Pas de -p packages/core-geometry (rootDir src exclut le harness), ni typecheck root prétendument couvrant experiments : workspaces limités apps/* et packages/*. Ne pas lancer npm test ou build root pour ce POC. Node réel doit satisfaire aussi engines Vitest ^22.12 || ^24 || >=26, plus étroit que >=22.12 racine.

## Extension de configuration éventuelle

Aucun sixième fichier créé. Si A0 exige une déclaration `envFile:false`, `cacheDir` sous le scratch technique, `include` exactement égal au seul test et `setupFiles/globalSetup` explicitement vides plutôt qu’une whitelist physique du root, proposer **avant accord** l’ajout de `experiments/studio/g2-2d-identities/vitest.config.ts`. Aucun héritage de configuration API, projet, plugin UI, setup DB ou dépendance nouvelle. Ce choix ne remplace pas les mesures OS de FS/réseau ni le superviseur externe.

## Relecture dans un processus indépendant

Le même fichier de test pourrait exposer des phases explicites, relancées séquentiellement dans deux instances distinctes du runner, avec le lecteur strictement en lecture sur les révisions. Aucun spawn imbriqué dans le worker. L’interface de phase n’existe pas encore : aucune commande `read` disponible n’est inventée ici. A0/A3/A5 doivent fixer ses arguments et l’inventaire exhaustif des cas avant code ; pas de test masqué par un filtre, `.only`, `skip` ou changement de résultat. Un passage dans une seule invocation ne prouverait pas à lui seul la réouverture après arrêt du processus producteur.

## Points à fixer avant demande d’exécution

| Point | Responsable | Action |
|---|---|---|
| G2-HAR-A | A0/A6 | Autoriser et compter les écritures techniques inévitables du runner (jeton/cache/temp/logs) dans la racine session, avec repli au dépôt interdit ; aucun secret publié. |
| G2-HAR-B | A6 | Fournir preuve de confinement réseau/FS et ancrage parents à la version Node/environnement finale ; rien n’est attesté ici. |
| G2-HAR-C | A0/A6 | Préciser budget processus infrastructure versus unique relecture, et sens de sans serveur vis-à-vis middleware interne Vitest. |
| G2-HAR-D | A0/A3/A5 | Fixer interface de phases et invocations indépendantes sans enfant imbriqué, inventaire des tests sans masquage et oracles avant code autorisé. |

A6 peut relire cette proposition. A0 ajuste ensuite la question de périmètre avant publication. Aucune question nouvelle ni autorisation de POC n’a été publiée par A3 ; aucune opération GitHub, code applicatif, fichier expérimental ou config modifié.

Le JSON conserve les empreintes de 36 sources et leurs citations exactes, les argv structurés et la distinction entre configuration Git et artefacts installés. Les contrôles effectués ici sont Git en lecture seule, lecture de textes, empreintes et validation de forme du rapport. Aucun résultat de test, délai mesuré, atomicité FS, blocage réseau ou reprise indépendante ne peut en être déduit.

## Comparaison complémentaire bornée demandée par A0

Aucune piste supplémentaire après celles-ci. Les options sont mutuellement à choisir pour le futur fichier `harness.test.ts` : une source de test Vitest et une source `node:test` ne sont pas interchangeables sans conception explicite. Aucune source de POC écrite ici.

| Option | Effets et limites observés statiquement | Position proposée |
|---|---|---|
| Vitest5 | Sélection des fichiers et options existantes étayées ; résolveur TS public déjà prévu par runner. Jeton persistant même no-api, cache et rapports possibles, .env du root, middleware Vite, infrastructure multi-processus à qualifier. | Candidate possible seulement avec ces effets explicitement autorisés/bornés, pas option privilégiée pour éviter hooks. |
| Node --import tsx + node:test | Pas de Vitest ni jeton/report Vite ; pas de nouvelle dépendance/config obligatoire. TSX_DISABLE_CACHE=1 évite FileCache et son nettoyage dans branches ESM+CJS. Hooks ESM+CJS globaux, sourceMaps, recherche config si chemin non fixé, tentative IPC locale à l’import et processus/threads de transformation esbuild ; son get-tsconfig peut sonder la casse par écriture/suppression. Pas zero-IO ni zero-IPC garanti. | Option conservée, non privilégiée après lecture de ces effets. |
| Binaire esbuild existant → stdout borné → artefact inédit → Node direct + node:test | Évite hooks/runtime/caches Vitest et TSX ; aucune config6e ni package nouveau ; origine publique et build tracé. Compilation et exécution séparables sous supervision externe. Artefact dérivé à autoriser/compter ; résolution et absence d’effets natifs non exécutées ; code natif Go non audité ; stdout/FS/config/plateforme à borner ; Node ne confine pas le réseau/FS à lui seul. | À privilégier pour relecture A6 et question de périmètre A0, sans accord ou code acquis. |

### Option TSX + node:test

```sh
node --import tsx ./experiments/studio/g2-2d-identities/harness.test.ts
```

Avec un environnement construit de zéro et, uniquement si cette option est retenue, `TSX_DISABLE_CACHE=1` et `TSX_TSCONFIG_PATH` fixé au chemin absolu vérifié du tsconfig core (aucun héritage API). La désactivation du FileCache est prouvée par les branches ESM et CJS installées ; sans elle, le cache peut aussi supprimer d’anciens fichiers. Le chargeur effectue toutefois une tentative IPC locale à l’import et installe des hooks ESM/CJS globaux. Le matcher de config possède une branche de sonde de casse créant/supprimant un fichier : ce n’est donc pas une option « sans IO » ni « sans nettoyage » par simple variable. L’option n’est pas privilégiée.

### Option bundle existant puis Node direct — à privilégier pour revue, sans adoption

Entrée du futur test : imports `node:test` et `node:assert/strict`, auxiliaires expérimentaux, import **public** `@parcours/core-geometry`. Le binaire Linux x64 installé peut être proposé sans wrapper JS esbuild, CLI TSX ou Vitest. Sa présence/empreinte seulement a été vérifiée ; aucune commande native n’a tourné.

```sh
./node_modules/@esbuild/linux-x64/bin/esbuild experiments/studio/g2-2d-identities/harness.test.ts --bundle --platform=node --format=esm --target=node22.12 --packages=bundle '--tsconfig-raw={}' --tree-shaking=false --legal-comments=eof --log-level=warning
```

**stdout doit être capturé par le superviseur**, pas redirigé par un shell et pas écrit par `--outfile`. Le superviseur borne les octets en mémoire, exige exit0, puis écrit vers un handle créé exclusivement sans suivi du composant final sous parent ancré. L’artefact `.mjs` inédit est compté dans les16 fichiers/8Mio (plafond propre proposé1Mio à confirmer), hashé et rendu immuable avant exécution. Aucun artefact produit par cette étude.

La commande suivante est un **gabarit** : le chemin final ne peut être exact tant qu’aucune session n’existe ; il sera fourni par le superviseur, jamais une fixture.

```text
node <chemin-physique-attesté-du-nouvel-artefact.mjs>
```

Node est invoqué directement avec l’argv de cet artefact : aucun `--import`, `--loader`, `--test` avec découverte, service API, DB ou navigateur. Le futur test utilise les API natives ; le superviseur doit vérifier un inventaire de cas attendu non nul, aucun skip/only/todo, le code de sortie et les erreurs non gérées. Une seconde invocation distincte doit faire la relecture ; son interface de phase reste à définir avant code, aucune commande `read` prétendument existante n’est fournie.

`--tsconfig-raw={}` explicite vise à éviter config auto/extends, `--legal-comments=eof` conserve les commentaires légaux reconnus et `--tree-shaking=false` évite de prendre l’élimination d’exports comme argument de sûreté. Le générateur de flags installé étaye leur forme ; le code Go natif et sa trace exhaustive IO n’ont pas été audités. Le build résout/compile l’entrée publique : aucune copie manuelle de moteur ni import profond de contournement. Vérifier l’artefact pour imports externes uniquement Node autorisés et aucun fichier/actif inattendu ; aucune hypothèse que compiler les fichiers évalue leurs imports applicatifs. Aucun accord G2 ni licence nouvelle n’est déduit de l’artefact.

### Confinement et délai restent des préconditions indépendantes

L’option bundle réduit les hooks d’exécution mais ne prouve ni ancrage atomique de tous les parents FS, ni zéro réseau, ni fin des descendants après signal. Les contrôles HAR-06 à HAR-11 restent intégralement applicables. Node:test documente lui aussi qu’un timeout ne peut pas interrompre sûrement un thread bloqué ; le superviseur extérieur30s est requis. La configuration dédiée6e n’est indispensable à aucune commande TSC explicite ou option bundle/Node ; elle ne doit pas être créée par défaut.

**Prochaine action :** A6 relit la comparaison et les primitives de supervision, A0 choisit la variante et ajuste le périmètre demandé avant publication. Les conditions non démontrées restent ouvertes, sans expérience lancée.

## Proposition finale de sixième source, avant accord

Chemin proposé : **`experiments/studio/g2-2d-identities/supervisor.py`**, Python stdlib uniquement. Aucun fichier créé. Cette extension remplace la piste de sixième configuration Vitest pour la variante recommandée ; aucune nouvelle dépendance, workspace, script npm ou workflow. En l’absence d’une primitive de supervision existante attestée, les cinq sources seules ne constituent pas aujourd’hui un lancement reproductible démontrant création exclusive, borne stdout et délai global.

Le superviseur serait propriétaire unique des IO et processus : ancrage de répertoires par descripteurs, appels relatifs `dir_fd` sous Linux avec `O_DIRECTORY`/`O_NOFOLLOW` selon capacités constatées ; session inédite, noms fixes, création exclusive et vérification du handle ; stdout/stderr bornés et compte des octets/fichiers avant écriture ; binaire esbuild puis Node avec argv fixes, environnement minimal et aucun shell ; horloge monotone, échéance, observation de fin et groupe/cgroup propre. Node se limiterait au calcul, aux tests purs et à la sérialisation par stdin/stdout, sans écriture directe sur des chemins non maîtrisés. L’interface de phases/relecture et le protocole ne sont pas encore implémentés ni approuvés.

**Réserves maintenues :** la disponibilité effective des primitives Python/OS n’a pas été testée ; `dir_fd` ne neutralise pas des writers externes capables de déplacer les parents ; réseau OS refusé, racine stable/privée et arbre de processus dédié restent à attester par A6. Un superviseur Python peut lui-même bloquer en IO/parsing : il ne suffit pas d’ajouter un timer ou d’envoyer un signal pour déclarer un délai dur obtenu. Aucun accord d’atomicité multi-fichiers, durabilité matérielle, absence de tentative réseau ou garantie de30s. En cas de précondition non démontrable, conserver ce sous-point bloqué et ne créer ni exécuter le POC.

A0 peut maintenant figer l’annexe à soumettre sur cette variante **six sources proposées dont une extension à autoriser**, avec artefact build dérivé dans les sorties bornées. Cette remise reste une étude technique ; aucun lot de code activé, aucune décision GitHub publiée par A3.
