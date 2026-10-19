# Preuve — restauration des données Studio (R.1-02, R.1-03, R.2-01, R.2-02)

- **Date :** 19 octobre 2026
- **Équipe :** R12 (QA / DevOps), sous le développeur principal
- **Branche :** `teamr12-restauration` (depuis `lead-vague4`, `b7305a5`), commits locaux, non poussés
- **Commit éprouvé :** `cf6986cc78a6a383776989aa5a1c6b342dbcc28b`
- **État :** Implémenté et vérifié localement. Non accepté : la CI n'a pas tourné (rien n'a été poussé) et aucune
  décision d'acceptation n'a été prise.

## 1. Constat avant la modification

Deux chemins de sauvegarde existent.

| Chemin | Studio avant `cf6986c` |
|---|---|
| Base entière : `scripts/backup.sh` / `restore.sh` (`pg_dump -Fc` / `pg_restore`) | Les tables Studio étaient **sauvegardées** (dump de toute la base, déclencheurs compris), mais `scripts/verify-restore.sh` n'en **vérifiait aucune** : ni effectif, ni empreinte, ni déclencheur d'immuabilité. |
| Projet : « Sauvegarder projet JSON » (`GET /projects/:id/archive`) puis « Importer projet JSON » (`POST /projects/import`), `apps/api/src/lib/project-archive.ts` | **Aucune donnée Studio** : ni études, variantes, révisions et documents, ni commentaires, observations et leur journal, ni liens d'étapes du Parcours, ni publications, journal de publication et fichiers figés des paquets (`volumes`), ni préférences d'outils. Les **droits** (`project_members`) n'étaient pas non plus dans l'archive : le projet importé n'avait que son propriétaire. |

## 2. Ce qui a été ajouté

- **Section `studio` de l'archive JSON** (`apps/api/src/lib/studio-archive.ts`, logique pure
  `studio-archive-manifest.ts`) : lignes telles que PostgreSQL les stocke (`to_jsonb`, horodatages à la microseconde,
  `bytea` en hexadécimal) pour `studio_studies`, `studio_variants`, `studio_revisions`, `studio_comments`,
  `studio_observations`, `studio_observation_events`, `studio_study_steps`, `volumes` (fichiers des paquets),
  `studio_publications`, `studio_publication_events`, `project_members`, `studio_tool_preferences` (propriétaire et
  membres) ; comptes cités (identifiant → adresse) ; **manifeste** : schéma `fadi-studio-archive/1`, version de schéma
  (`studio-document/1`, jeu de tables), effectif et empreinte SHA-256 par table, empreinte globale. Section absente
  pour un projet sans donnée Studio ni membre : les archives existantes sont inchangées.
- **Restauration** (`importStudioArchive`, appelée par `importProjectArchive` dans la même transaction) :
  1. section revérifiée en entier : manifeste recalculé, références internes, empreinte de chaque document publié,
     empreinte du paquet, SHA-256 de chaque volume ; la moindre anomalie → **422 `archive_studio`**, rien n'est créé ;
  2. lignes **insérées telles quelles** (`INSERT … SELECT * FROM jsonb_populate_recordset`) : aucune révision recalculée,
     `payload_hash`, `document_hash`, `package_hash` et identifiants inchangés ; seuls l'identifiant du projet et, faute
     du même compte, l'auteur technique changent. Le déclencheur `studio_revisions_no_update` ne porte que sur UPDATE
     et reste actif (vérifié) ;
  3. comptes retrouvés par adresse ; un compte absent est réattribué au compte qui restaure et **déclaré** en réserve ;
  4. identifiant Studio déjà présent dans la base (réimport dans la base d'origine) : Studio **non restauré, rien
     d'écrasé**, réserve explicite ;
  5. droits : membres retrouvés repris avec leur rôle et leur date ; préférences reprises seulement pour un compte qui
     n'en a pas (jamais écrasées).
- La **copie de projet** (`POST /projects/:id/copies`) n'emporte ni Studio ni droits (inchangé pour l'utilisateur).
- `scripts/verify-restore.sh` : tables Studio dans le décompte, empreintes Studio (révisions, variantes, commentaires,
  journaux, publications), présence des 5 déclencheurs d'immuabilité, puis outil de comparaison `--all`.
- **Outil de comparaison** `scripts/validation/studio-compare-restore.mjs` (logique pure `studio-compare-lib.mjs`,
  tests `node --test`) : lit les données Studio d'un projet dans A et dans B, normalise le projet et les comptes
  (par adresse), compare ligne à ligne par clé (manquante, en trop, colonnes différentes, effectifs, empreintes par
  table), contrôle l'intégrité des deux côtés, la présence des déclencheurs dans B et, par une UPDATE dans une
  transaction annulée, que la révision restaurée reste immuable ; rapport Markdown et JSON ; sortie 0 seulement sans
  anomalie.
- **Recette** `apps/web/e2e/studio-restauration.mjs`, ajoutée à la tranche `parcours` de la CI après « Sauvegarde puis
  restauration vérifiées » (base `fadi_studio_restore` créée, migrée, seconde API lancée puis arrêtée par la recette).
- `init.sql` : **aucune modification** (la restauration n'exige aucune opération de schéma). `en.json` : 5 réserves
  traduites (ajout seul).

## 3. Commandes exécutées et résultats (commit `cf6986c`)

Bases jetables `fadi_teamr12a`, `fadi_teamr12b`, `fadi_teamr12c` sur `127.0.0.1:55432` (PostGIS créée par `postgres`),
API A sur le port 3085 (`node apps/api/dist/server.js`, `WEB_ORIGIN=http://localhost:3085`, `AUTH_RATE_LIMIT=500`,
`API_RATE_LIMIT=5000`, `WEB_DIST` = copie de `apps/web/dist` dans le dossier de travail), API B lancée par la recette
sur le port 3086. Aucune base partagée touchée ; API arrêtées par PID ; les trois bases supprimées à la fin.

| Commande | Résultat |
|---|---|
| `npm ci` | 0 vulnérabilité, succès |
| `DATABASE_URL=…/fadi_teamr12a npm run db:migrate` (deux fois) et `…/fadi_teamr12b` | `Schema applied (init.sql).` à chaque fois (idempotent) |
| `npm run typecheck` | succès (frontières de modules conformes) |
| `npm run test --workspace=…core-geometry …domain-model …atelier-model …planche-model …geometry-exact …@fadi/web` (comme la CI) | 47 + 95 + 869 + 744 (1 ignoré) + 22 + 569 tests réussis. Un premier passage sous forte charge (charge moyenne 14 sur 4 cœurs, autres équipes) avait donné 3 dépassements de délai de 5 s dans des tests sans rapport (`automatisation.test.ts`, `revolution-l10d.test.ts`, `index-spatial.test.ts`) ; réussis isolément puis au second passage complet. |
| `npx --workspace=@fadi/api vitest run --reporter=json --outputFile=../../api-vitest.json` puis `node --test scripts/check-api-tests-db3.test.mjs` et `node scripts/check-api-tests-db3.mjs api-vitest.json` | 171 tests API hors base réussis (dont les 9 de `studio-archive-manifest.test.ts`) ; 12 suites DB-3 refusées par la garde seule ; contrôle vert ; 6/6 tests du contrôle |
| `npm run test:db-guard` | 138 tests réussis |
| `node --test scripts/validation/studio-compare-lib.test.mjs` | 5/5 |
| `node --test scripts/architecture-guards*.test.mjs scripts/check-module-deps.test.mjs scripts/check-continuity.test.mjs` | 70/70 |
| `npm run build` | succès (web et API) |
| `BASE_URL=http://localhost:3085 DATABASE_URL_A=…/fadi_teamr12a DATABASE_URL_B=…/fadi_teamr12b RESTORE_PORT=3086 node apps/web/e2e/studio-restauration.mjs` | **47 contrôles réussis, 0 échec** ; comparaison : 1 projet, 28 lignes, **0 anomalie** |
| `BASE_URL=http://localhost:3085 node apps/web/e2e/studio-persistance.mjs` | 293 contrôles réussis, 0 échec |
| `PGPORT=55432 sh scripts/verify-restore.sh 127.0.0.1 postgres fadi_teamr12a fadi_teamr12c` (recette de sauvegarde / restauration existante, étendue) | tous les effectifs égaux (dont 38 révisions, 16 variantes, 11 commentaires, 14 passages d'observation Studio), empreintes identiques, 5 déclencheurs présents, comparaison `--all` : 3 projets, **0 anomalie** |

### Détail de la recette `studio-restauration.mjs`

Projet synthétique dans A : une étude, deux variantes (la seconde dérivée de la révision 2), 7 révisions (mur
6 × 3 × 0,2 m avec ouverture déclarée, ouverture élargie par l'éditeur, ligne et rectangle, rectangle décalé ;
rectangle sur la variante dérivée), commentaire ancré et réponse, observation (ouverte puis corrigée : 2 passages),
liens vers les étapes 3 et 7, publication soumise, approuvée et diffusée (paquet SVG / DXF / IFC / PDF, 4 évènements),
membre éditeur, préférences d'outils du propriétaire. Contrôles :

- sauvegarde : section Studio, manifeste et effectifs attendus (1 / 2 / 7 / 2 / 1 / 2 / 2 / 1 / 4 / 4 / 1 / 1) ;
- archive altérée (document d'une révision modifié) : 422 `archive_studio`, aucun projet créé dans B ;
- restauration dans B par `POST /projects/import` : 201, aucune réserve Studio ;
- historique des deux variantes identique (identifiants, parents, sources, dates) ; **7/7 documents identiques** en JSON
  canonique et SHA-256 par l'API, et texte `jsonb`, `payload_hash` et `request_id` identiques dans les deux bases ;
- commentaires, réponse, journal d'observation, liens d'étapes, publication, approbation, journal de publication
  identiques ; **4/4 fichiers du paquet identiques octet pour octet** ; vérification du paquet recalculé dans B ;
- droits : éditeur membre du projet restauré ; préférences reprises ;
- immuabilité : `UPDATE studio_revisions` refusée dans B (`studio_revision_immutable`) ;
- outil de comparaison : **0 anomalie** ; puis, après une nouvelle révision écrite dans B, l'outil signale bien la
  révision en trop et la tête différente (l'outil n'est pas aveugle) ;
- navigateur (Chromium) : variante restaurée rouverte dans B — mur, ouverture et trois objets dessinés, page de l'étude
  avec deux variantes, aucune erreur de page ;
- réimport dans la base d'origine : projet créé sans Studio, réserve « Données Studio non restaurées », original intact.

## 4. Limites et points à décider

- **Contrôle non exécuté :** la CI (tranche `parcours` avec la nouvelle étape) n'a pas tourné : rien n'a été poussé.
- **Attribution par adresse :** une archive est un fichier que son détenteur peut réécrire en recalculant le
  manifeste ; la restauration attribue alors les lignes aux comptes de la base cible qui portent les adresses citées.
  Le manifeste détecte une altération accidentelle, pas une falsification. Une signature des archives (secret du
  serveur) serait nécessaire pour l'exclure : décision à prendre, non tranchée ici.
- Les champs historiques figés gardent l'identifiant du projet d'origine (`envelope`, `response` des révisions,
  métadonnées gelées du paquet : code et nom du projet d'origine) : ils sont restaurés tels quels, par principe.
- La restauration par l'archive conserve les identifiants Studio : elle ne peut pas créer un second exemplaire dans la
  base d'origine (réserve, rien n'est écrasé). Une restauration dans la même base exige que le projet d'origine ait
  disparu (ou passer par `pg_restore`).
- Correction de libellé après `cf6986c` dans la recette (« l'éditeur ouvre la variante dérivée du projet restauré »,
  texte du contrôle seulement), livrée avec ce rapport.
