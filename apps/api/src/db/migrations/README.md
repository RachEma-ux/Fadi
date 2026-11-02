# Migrations de la base Fadi

Chantier `docs/workstreams/base-donnees/` (BD-2). Ce dossier contient les évolutions du schéma **après** la base de
départ `../init.sql`.

## Fonctionnement

- `../init.sql` est la **base de départ** (version `0000`), **gelée** : le test `db/migrations.test.ts` compare son
  empreinte à `init.sql.sha256`. On ne le modifie plus ; toute évolution est un nouveau fichier ici.
- `npm run db:migrate` (développement) et le service `migrate` (`MIGRATE_ONLY=1`, production) appellent
  `db/schema-migrations.ts` :
  1. verrou consultatif : un seul processus migre à la fois ;
  2. base de départ appliquée si la base est neuve, ou si `init.sql` a changé depuis la dernière application ;
  3. chaque fichier numéroté absent de `schema_migrations` est appliqué une fois, dans l'ordre, puis enregistré avec
     son empreinte et sa durée.
- Un fichier déjà appliqué dont le contenu change est **refusé** : on n'édite pas l'histoire, on ajoute un fichier.
- Le journal de migration contient toujours `Schema applied (init.sql).` en cas de succès (contrôle de la préproduction).

## Nommer un fichier

| Fichier | Exécution |
| --- | --- |
| `NNNN_nom_en_minuscules.sql` | Une transaction, `lock_timeout = 3s`, `statement_timeout = 10min`, en tant que `fadi_owner` quand ce rôle existe ; relancé jusqu'à 4 fois sur l'erreur 55P03 (verrou non obtenu). |
| `NNNN_nom.concurrent.sql` | **Hors transaction**, instruction par instruction (séparées par `;` en fin de ligne). Seulement `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS`, `DROP INDEX CONCURRENTLY IF EXISTS`, `REINDEX INDEX CONCURRENTLY`, `ANALYZE`. Un index laissé invalide par un échec est supprimé puis recréé au passage suivant. |

`NNNN` : quatre chiffres, croissants, uniques (`0000` est réservé à `init.sql`).

## Règles (contrôlées par `db/migrations-lint.ts`, test `db/migrations.test.ts`)

Une règle se lève seulement par un marqueur `-- bd: <nom> (raison)` écrit dans le fichier.

| Règle | Interdit | À faire à la place |
| --- | --- | --- |
| `index-bloquant` | `CREATE INDEX` sur une table existante dans un fichier transactionnel | fichier `.concurrent.sql` |
| `contrainte-validee` | `ADD FOREIGN KEY` / `ADD CHECK` sans `NOT VALID` sur une table existante | `… NOT VALID`, puis `VALIDATE CONSTRAINT` dans une migration suivante (verrou léger) |
| `type-colonne` (`-- bd: reecriture`) | `ALTER COLUMN … TYPE` (réécriture sous verrou exclusif) | expand/contract : nouvelle colonne, remplissage par lots, bascule du code, suppression de l'ancienne |
| `not-null` (`-- bd: not-null-valide`) | `SET NOT NULL` direct | `CHECK (col IS NOT NULL) NOT VALID`, `VALIDATE`, puis `SET NOT NULL` (PostgreSQL utilise le CHECK validé) |
| `defaut-volatil` | `ADD COLUMN … DEFAULT now()` (ou autre fonction volatile) | ajouter sans défaut, `SET DEFAULT`, remplir par lots |
| `contraction` (`-- bd: contraction`) | `DROP COLUMN`, `DROP TABLE` | seulement dans une Release **postérieure** à celle dont le code ne lit plus l'objet |
| `reprise` (`-- bd: reprise`) | `UPDATE` / `DELETE` de données | par lots bornés (`WHERE id IN (SELECT … LIMIT n)`), idempotents |
| `destruction`, `reecriture` | `TRUNCATE`, `VACUUM FULL`, `CLUSTER` | jamais dans une migration |
| `transaction` | `BEGIN` / `COMMIT` dans le fichier | l'exécuteur gère la transaction |

## Expand / contract et retour arrière

Le déploiement automatique ramène l'**image** précédente en cas d'échec, pas la base. Une migration doit donc rester
compatible avec la version précédente de l'application :

1. **Expand** (Release N) : ajouter colonnes, tables, index ; l'ancien code continue de fonctionner.
2. Le code de la Release N écrit dans les deux formes, ou lit la nouvelle avec repli sur l'ancienne.
3. Reprise des données par lots si nécessaire.
4. **Contract** (Release N+1 ou plus tard) : supprimer l'ancienne forme (`-- bd: contraction`).

Jamais de contraction dans la même Release que le code qui en a besoin. Chaque PR de migration décrit son retour arrière.

## Conventions des nouvelles tables

- Clé primaire : `bigint GENERATED ALWAYS AS IDENTITY` (journaux, événements, lignes nombreuses), ou UUIDv7 (`uuid`)
  quand l'identifiant est exposé ou créé hors de la base. Plus de `bigserial` ni de nouvel identifiant `text` aléatoire.
- Toujours `timestamptz`, `jsonb` (jamais `json`), `text` plutôt que `varchar(n)`.
- Indexer la colonne enfant de toute clé étrangère avec `ON DELETE CASCADE` ou filtrée par l'application.
- Nommage : `<table>_<colonnes>_<suffixe>` (`_pkey`, `_fk`, `_uq`, `_ck`, `_idx`), en snake_case.
- Journal en ajout seul : déclencheur `*_no_update` et `REVOKE DELETE … FROM fadi_app` dans la même migration.
- Données : jamais de référentiel, de liste territoriale, de statistique ni de catalogue dans une migration
  (D-GD-29) ; les données passent par la chaîne d'import et sont archivées. Catalogues du Parcours (BD-9.6) :
  `db/catalogues-chargement.ts`, lancé par `migrate.ts` / le service `migrate` après les migrations, et par
  `npm run db:catalogues:charger`.

## Outils associés

- `npm run db:validate-constraints` (`db/valider-contraintes.ts`) : valide une à une les contraintes `NOT VALID`
  restantes, hors pic, et liste celles dont des lignes existantes ne respectent pas la règle.
- `scripts/validation/migration-montee-version.mjs` (CI) : base de départ de la branche cible, puis migrations du HEAD.
