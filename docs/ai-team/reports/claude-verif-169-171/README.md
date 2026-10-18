# Vérification indépendante des lots de code autorisés — PR #171 (A3-CLASSIF-1) et PR #169 (A3-DB-1/2)

**Exécutant :** Claude Code, session distincte de l'équipe Codex ; ce n'est ni la revue d'A2, ni celle d'A5 ou d'A6. [Annonce #166](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6251022689). **Date :** 18 octobre 2026 (UTC).
**Méthode :** arbres de travail détachés, hors du dépôt, aux SHA exacts ; `npm ci --ignore-scripts` comme la CI. Des fusions **locales** avec `main@817bd36` ont été faites pour l'essai. **Aucun push sur `fix/156-*` ni sur `fix/157-*`**, aucune base, API, E2E ni service lancés. Les variables `DATABASE_URL` et `TEST_DATABASE_URL` ont été retirées de l'environnement pour les tests de garde.

## Pourquoi seuls ces deux lots

Parmi les lots de code, seuls deux sont **autorisés** à ce jour :

- A3-DB-1/2 ([#166/6249520098](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6249520098), Mission 004) ;
- A3-CLASSIF-1 ([#166/6250110849](https://github.com/RachEma-ux/Fadi/issues/166#issuecomment-6250110849)).

Codex les a déjà implémentés. Les autres corrections relevées dans mes remises (COEX-01 : C05, C06, C09) et le harness G2 attendent leur propre autorisation : elles ne sont **pas** implémentées ici. Le travail éligible consistait donc à **tester et vérifier** ces deux lots de façon indépendante, puis à préparer ce qui bloque leur intégration.

## Résultats

| Contrôle | #171 `5e0285d` | #169 `a15d650` |
|---|---|---|
| Tests du lot au SHA exact | atelier-model **492/492** (107 fichiers) | `test:db-guard` **129/129** (3 fichiers) |
| Typecheck complet (y compris `check-module-deps`) | réussi | réussi |
| Build complet | réussi | réussi |
| **Contre-épreuve** (correctif ou garde neutralisé localement, puis restauré) | Ligne `classeIfc` remise : **20 cas visibles en échec** (sortie tronquée à 20 lignes), dont le test d'oracle actualisé et les cas indépendants A5 | Garde `VITEST/NODE_ENV` retirée de `db/client.ts` : **2 tests en échec** (DB-N01 et « NODE_ENV=test alone… »). La garde est bien détectée. |
| Fusion locale avec `main@817bd36` | **conflit sur `.github/workflows/ci.yml` seulement** | **conflit sur `.github/workflows/ci.yml` seulement** |
| Après résolution (fichier ci-dessous) | 492 atelier-model ; core 47, domain 95, planche 744 (+1 skip déjà présent sur `main`), exact 22, web 273 ; types et build réussis ; couverture 630, continuité et isolation OK | 129 garde ; atelier-model 468 ; web 273 ; types et build réussis ; couverture 630, continuité et isolation OK |
| `main` + #171 + #169 fusionnés ensemble | 129 garde ; core 47, domain 95, atelier-model 492, planche 744, exact 22, web 273 ; types et build réussis | (même arbre) |

### Lecture indépendante de #171

`classeIfc` n'a que deux consommateurs hors tests, au SHA `5e0285d`. L'export IFC n'en fait pas partie : il dérive la classe de l'ontologie ou de l'annexe C (`echanges/ifc.ts`).

- `annexe-c.ts` : `controleClassesIfc` *lit* la déclaration. Il ignore l'absence et signale une incohérence sans la corriger (D-111, R3, R16).
- `commandes/organisation.ts` : c'est l'écriture que la PR supprime.

**Avant le correctif**, affecter un code externe réécrivait `classeIfc` à la valeur de l'ontologie, au statut « vérifiée ». Une déclaration incompatible, saisie ou importée, disparaissait alors, et avec elle l'alerte D-111. Le correctif rétablit le comportement que décrit l'en-tête de `annexe-c.ts`. Comme la PR l'indique, les objets déjà réécrits avant le correctif ne sont pas réparés.

### Lecture indépendante de #169

- `vitest.guard.config.ts` limite la suite à `src/testing/**`.
- `vitest.guard.setup.ts` bloque `net`, `tls` et `dns` par des sentinelles vérifiées après chaque test.
- `pg` et `drizzle` sont simulés.
- Les URL utilisent des adresses de documentation (192.0.2.1) ou des boucles locales jamais contactées.

Exécuter cette suite n'ouvre donc aucune connexion. Les 12 suites d'intégration API **n'ont pas** été lancées : elles relèvent de DB-3, non autorisé.

## Bloquant d'intégration trouvé : conflit `ci.yml` et risque de résolution naïve

Les deux PR sont `mergeable_state: dirty` depuis la fusion de #165. #165 a ajouté sur `main` sa propre exception, le job `mission-docs-pure`. Chaque PR a ajouté la sienne au même endroit : `classification-pure` pour #171, `db-guard-pure` pour #169.

Si quelqu'un résout le conflit **en gardant la version de `main`**, l'exception de la PR disparaît. Ses PR relanceraient alors `validate`, `e2e` et `image`, **avec PostgreSQL**, ce qui n'est pas autorisé. Ce routage a été vérifié par évaluation des conditions ([`routage.txt`](routage.txt)).

**Résolution proposée, non poussée :** garder les jobs purs de toutes les branches, et exclure les jobs à services seulement pour la **disjonction** des conditions de branche exactes.

| Fichier | Usage | SHA-256 |
|---|---|---|
| [`ci-resolu-171.yml`](ci-resolu-171.yml) | `main` + #171 | `beca2dea…ad618b9` |
| [`ci-resolu-169.yml`](ci-resolu-169.yml) | `main` + #169 | `ecb29027…edd3701590` |
| [`ci-resolu-169-171.yml`](ci-resolu-169-171.yml) | `main` + #169 + #171 | `eccb5d87…3878e209` |

Les fichiers sont produits par [`ci_merge.py`](ci_merge.py) à partir des trois versions sources, et vérifiés par [`ci_eval.py`](ci_eval.py) sur 7 contextes :

- chacune des trois branches exactes ;
- une autre branche ;
- un fork qui porte le même nom de branche ;
- une PR vers une autre base ;
- un push sur `main`.

Résultat : chaque branche exacte ne lance **que** son job pur, et tous les autres contextes gardent `validate`, `e2e` et `image`.

**Observation mineure pour A6.** La condition de #169 ne teste pas `github.repository == 'RachEma-ux/Fadi'`, contrairement aux deux autres. Le test sur `head.repo.full_name` suffit à exclure les forks ; l'écart est seulement d'homogénéité.

**Suite proposée (propriétaires A3 et A6).** Fusionner `main` dans chaque branche, sans rebase ni force-push, avec le fichier correspondant. On obtient alors une CI au nouveau SHA, sans PostgreSQL. La fusion vers `main` reste une **décision du propriétaire**.

## Limites

- Aucune intégration serveur, recette métier, réparation de données ni DB-3. Ces vérifications ne valent pas acceptation.
- `ci_eval.py` évalue seulement le sous-ensemble d'expressions GitHub présent dans ce fichier (`==`, `&&`, `||`, `!`). Ce n'est pas un moteur Actions complet ; une CI réelle au SHA reste nécessaire.
- Les fusions locales ont été jetées. Aucun commit de vérification n'est publié.
