# Garde-fous d’architecture native Fadi — L1

Référence : Issue #151 ; base `5cf61d1fed9ed523b331228af20bce93a4f2bf63`. Ce lot renforce T14 et les contrôles existants ; il ne change pas l’architecture cible ni le périmètre métier.

## Contrat du contrôle de modularité

`node scripts/check-module-deps.mjs` utilise l’AST et la résolution de modules de TypeScript déjà présent dans les dépendances de développement. Il ne charge ni n’exécute le code audité.

- Analyse des sources JS/TS, JSX/TSX, CJS/MJS/CTS/MTS et déclarations dans `apps/*/src` et `packages/*/src`.
- Résolution des chemins relatifs, substitutions `.js` → `.ts` et alias déclarés dans les tsconfig (y compris préfixes #). Les chemins réels, pas seulement leur orthographe, déterminent le propriétaire. Une dépendance npm non hissée ne devient pas une source du paquet qui l’héberge.
- Interdiction des imports entre applications et des paquets purs vers une application ; un import inter-paquets doit être autorisé par le manifeste du paquet source.
- Interdiction des imports directs entre deux sous-répertoires `src/ontologies/<nom>/` distincts.
- Contrôle des cycles au niveau des paquets/applications (manifestes, dépendances déclarées et imports hors tests) ; aucune interdiction nouvelle des cycles de fichiers à l’intérieur d’un paquet.
- Analyse des imports/exports statiques, import type, import equals, import dynamique littéral et require littéral. Les cibles calculées et import.meta.glob sont refusés explicitement, non ignorés. Pas d’exception globale silencieuse.
- Les API navigateur nominales usuelles dans les paquets purs restent refusées ; vitest et node:* restent permis pour leurs tests.
- Les erreurs de lecture, JSON, syntaxe, sources absentes et liens symboliques de sources bloquent le contrôle.

## Contrat du contrôle d’isolation

`node scripts/check-fadi-isolation.mjs` étend le contrôle nominal aux fichiers de `apps`, `packages`, `ops`, `infra`, `deploy`, `config`, et aux manifestes/lockfiles/configurations de construction racine. SVG et autres ressources textuelles sont inclus. Les marqueurs nominaux sont également recherchés dans les chemins et, pour les binaires, sous forme ASCII.

Les identifiants de fiches `DA-*` ne sont pas interdits : ils ne prouvent pas une dépendance externe. Aucun outil, modèle, nom de fiche ou champ persistant n’est renommé dans ce lot.

## Limites explicites

Ces contrôles ne sont pas un audit universel de dépendances : ni téléchargement et examen du contenu transitif npm, ni décompression des archives, ni analyse de code embarqué chiffré/encodé, ni observation réseau à l’exécution. Les imports par alias de fonctions de chargement, eval et les mécanismes propres aux bibliothèques demandent un examen distinct. Les scripts d’exploitation et workflows ne sont pas analysés par l’AST applicatif ; les dossiers `docs`, la documentation MD/MDX/RST et les sorties/dépendances générées sont hors du scanner nominal. Les exclusions documentaires et binaires du périmètre parcouru sont comptés en sortie. Un fichier supérieur à 64 Mio ou un lien symbolique du périmètre audité exige un examen explicite.

Un succès ne clôture donc pas automatiquement #147 ni le rapprochement des inventaires historiques. Une revue des changements aux manifestes et aux garde-fous eux-mêmes reste indispensable.

## Tests et exécution

`node --test scripts/architecture-guards*.test.mjs` exécute 52 tests synthétiques : les sept angles morts identifiés dans l’audit, des témoins positifs et des cas supplémentaires (imports relatifs/alias/exports/require, cycles, imports dynamiques, ontologies, lockfiles, SVG, configurations, liens symboliques et dépendances npm non hissées). Aucun test n’utilise de données de production.

Le workflow `Architecture native — garde-fous` exécute les tests puis les deux contrôles sur le dépôt réel après `npm ci`. Ses actions sont épinglées aux SHA observés dans le run L1 initial et les identifiants Git ne sont pas conservés dans le checkout. Le contrôle de modularité reste également exécuté par `npm run typecheck`. Le contrôle d’isolation conserve son workflow existant. Aucun job n’accède à Fadi-Serv ni à un autre dépôt applicatif.

## Protection de main

Voir `docs/continuity/L1-MAIN-PROTECTION.md`. Un fichier ou workflow versionné ne configure pas une protection GitHub. L’activation administrative reste suivie séparément dans #146.

## Sources techniques

- API du compilateur TypeScript : https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- Alias TypeScript : https://www.typescriptlang.org/tsconfig/paths.html
- API des règles GitHub : https://docs.github.com/en/rest/repos/rules
