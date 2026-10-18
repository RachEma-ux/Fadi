# Revue statique CI proposée Claude — A6

Source immuable `b6794c64c7ff98fadf62868331f4297631201069`. Aucun script remis, module applicatif, runner, test, service ou DB exécuté.

Propositions compatibles structurellement pour les sept contextes annoncés ; application stricte exacte repo nécessite correction bornée de route169. Faisabilité contrôle pur stdlib confirmée par analyse indépendante, pas exécution des scripts Claude. A0 décide de toute intégration autorisée ; aucune fusion main autorisée.

Les trois fichiers conservent leurs jobs purs à octets identiques aux sources ; validate/e2e/image sont identiques à main817 sauf commentaires et conditions de job, placées avant services. En-tête/triggers/permissions inchangés. Les matrices de sept contextes et trois négatifs supplémentaires figurent dans le JSON.

Réserve avant application : la route169 ne contrôle pas `github.repository`. Ajouter ce prédicat dans le job pur et les trois exclusions, puis recontrôler la matrice. Les autres branches conservent leurs jobs complets ; push main rend PostgreSQL/migrations éligibles et exige son accord distinct.

`ci_merge.py` assemble les fichiers lus et écrit stdout, avec main exécuté à l’import ; il n’est pas un mergeur général sûr. `ci_eval.py` dépend de PyYAML et de eval : ne pas le présenter comme un runner stdlib sûr. La lecture indépendante utilise exclusivement la grammaire exacte égalité/et/ou/négation, sans eval.

Aucun piège nouveau d’injection directe de contexte dans shell ou expression secrets constaté dans les blocs conservés. Ceci ne rend pas la CI sans réseau : checkout/actions/npm téléchargent et typecheck/build exécutent leurs scripts. Les tests annoncés par Claude restent attribués à Claude ; conflit unique non reproduit par une fusion ici.

Patch texte proposé inclus dans le JSON : quatre substitutions par fichier169/combiné (job pur + trois exclusions), jamais appliquées. La conjonction exacte renforcée refuse toute absence/différence repo, headrepo, événement, branche ou base ; aucun préfixe/suffixe de branche accepté. Aucune installation PyYAML ni import des helpers.
