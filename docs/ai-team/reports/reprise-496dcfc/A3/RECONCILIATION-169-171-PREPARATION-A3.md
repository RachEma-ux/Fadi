# A3 — Préparation de la réconciliation #169 / #171

Les deux lots restent distincts et déjà autorisés. Leurs têtes `a15d650` et `5e0285d` sont enfants directs de `a4caaab` ; `main@817bd36` partage cette base. Le seul chemin modifié des deux côtés est `.github/workflows/ci.yml`. Aucune correction applicative supplémentaire n’est nécessaire pour ce conflit. Références Git locales épinglées, sans nouvelle vérification GitHub distante par A3.

La pièce Claude `b6794c6` fournit trois templates et une attestation structurée de tests/contre-épreuves et fusions locales ensuite jetées. Ces résultats sont attribués à Claude, pas à A3 ; aucune sortie brute de runner ni CI d’un arbre de réconciliation publié n’est fournie. Les résultats129/492 historiques ne se transfèrent pas au prochain SHA. Le README simplifie un point : Drizzle est simulé dans client-integration, mais les trois cas d’adaptateur du fichier review utilisent le vrai ORM sur transport PostgreSQL simulé. Aucune base réelle n’en découle.

## Résolution bornée proposée

Conserver chaque intention : job documentaire de main + job pur du lot, et `validate/e2e/image` sous négation de leur union. Prendre la variante169 ou171 propre à la PR, pas le template combiné des deux lots. Dans169 seulement, ajouter le contrôle `github.repository` dans quatre conditions (job pur et trois exclusions). A6 reste le réviseur DevOps ; A0 réserve et attribue le writer de cette intervention. Ne pas garder aveuglément ours/theirs.

1. Revalider main/têtes/commentaires/runs, puis deux worktrees détachés ; ne pas toucher aux branches canoniques avant revue.
2. Fusion locale `--no-commit --no-ff` de main817, hooks neutralisés par commande et signature désactivée ; vérifier conflitci.yml seul.
3. Résoudre avec le template épinglé et la restriction169 ci-dessus ; prouver union complète des index, tous les blobs applicatifs/tests inchangés, pas de marqueur/conflit.
4. A5/A6 examinent les fichiers figés, les routes et tous les workflows ; avis statique avant commits locaux.
5. Deux commits locaux, parents `[lot, main817]`, identité publique Codex ; aucun push A3. Publication éventuelle réservée à A0 sur les **branches exactes existantes**, sans force, après requalification. Une autre branche distante ne correspondrait pas aux conditions et pourrait rendre DB éligible.
6. Observer une CI au nouveau SHA ; aucun skip n’est une réussite d’intégration. Aucune fusion PR versmain, DB3, service, migration, administration ou production autorisée par cette opération.

A0 a ensuite autorisé l’exécution locale réversible de cette procédure. Le rapport EXECUTION conserve ses résultats réels séparément ; la présente préparation n’est pas une permission nouvelle.

## Helpers et contrôles

Ne pas importer/exécuter `ci_merge.py` : `main()` est inconditionnel, lit les arguments/fichiers et écrit stdout. Son assemblage textuel n’est pas un merge YAML général : forme des jobs imposée, blocs normaux repris de BASE, pas de contrôle général des collisions de noms. Ne pas importer/exécuter `ci_eval.py` : dépendance PyYAML et `eval` textuel. Sept contextes ne simulent ni triggers, besoins, statuts, permissions, services, valeurs absentes ni toute la sémantique GitHub Actions. La comparaison de chaînes Actions n’est pas un simple `==` Python sensible à la casse.

La route169 doit inclure événement, dépôt exécutant, dépôt head, head et base. L’absence du premier contrôle de dépôt n’est pas une simple homogénéité : le contexte d’une PR Fadi vers un autre dépôt n’était pas distingué. Le resserrement ne crée pas d’exception large.

Les commandes futures des jobs purs restent : `npm ci --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, puis `npm run test:db-guard` pour169 ou `npm run test --workspace=@parcours/atelier-model` pour171, puis `npm run build`. Elles ne sont **pas exécutées par cette préparation**. Jamais `npm test` global, migration, API, E2E ou service. L’inventaire inclut aussi couverture, continuité et isolation surPR ; Builder Deploy est manuel et ne doit pas être déclenché. Les routes pushmain restent applicatives et constituent une raison de maintenir l’interdiction de fusion.

## Standards

Revue indépendante A2 (message, lecture seule) : ci_merge a des effets à l’import et n’est pas général ; ci_eval n’est pas un moteur Actions ni un bac à sable ; templates sousdocs inertes tant qu’ils n’entrent pas dans workflows ; toute transposition et toute preuve doivent porter sur les références finales. Aucun import ou test A2. Ces quatre constats restent distincts des exigences métier.

## Spec

Revue indépendante A5 (message, lecture seule) : les attestations distinguent les deux lots autorisés, les SHA et les simulations ; aucun résultat ne vaut DB3, réparation IFC passée ou acceptation. Sans logs bruts il s’agit d’une attestation d’auteur, pas d’une corroboration process A5. Le routage fini ne remplace pas Actions, et une nouvelleCI exacte demeure nécessaire. Aucun test A5 dans cet axe.

Le JSON joint fournit toutes les empreintes, sources et citations exactes. Aucun nouveau code applicatif, installation, test moteur/API/DB, service ou appel réseau par A3.
