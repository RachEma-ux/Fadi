# Preuve — restauration des données Studio (R.1-02, R.1-03, R.2-01, R.2-02)

- **Date :** 19 octobre 2026
- **Équipe :** R12 (QA / DevOps), sous le développeur principal
- **Branche :** `teamr12-restauration` (depuis `lead-vague4`, `b7305a5`), commits locaux, non poussés
- **Commits éprouvés :** `cf6986cc78a6a383776989aa5a1c6b342dbcc28b` (sections 1 à 3) puis
  `10ebc8d8b61db84e4da22fdc965e5d42c9a41ca5` (signature des archives, section 5)
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
  manifeste. Ce risque est traité en section 5 (décision du développeur principal : archives signées, restauration
  sans confiance d'une archive non vérifiée).
- Les champs historiques figés gardent l'identifiant du projet d'origine (`envelope`, `response` des révisions,
  métadonnées gelées du paquet : code et nom du projet d'origine) : ils sont restaurés tels quels, par principe.
- La restauration par l'archive conserve les identifiants Studio : elle ne peut pas créer un second exemplaire dans la
  base d'origine (réserve, rien n'est écrasé). Une restauration dans la même base exige que le projet d'origine ait
  disparu (ou passer par `pg_restore`).
- Correction de libellé après `cf6986c` dans la recette (« l'éditeur ouvre la variante dérivée du projet restauré »,
  texte du contrôle seulement), livrée avec ce rapport.

## 5. Signature des archives (commit `10ebc8d`, 19 octobre 2026)

Décision du développeur principal sur le risque d'archive falsifiée : option prudente, aucun usage existant cassé.

**Signature.** Chaque export porte `studio.signature = { algorithm: "HMAC-SHA256", keyId, value }`, HMAC de
l'empreinte globale du manifeste (`apps/api/src/lib/archive-signature.ts`, pur). Cette empreinte globale couvre
désormais, en plus des empreintes par table, le projet et le propriétaire d'origine et les comptes cités (identifiant →
adresse) : une adresse réécrite change l'empreinte. Clé : `ARCHIVE_SIGNING_KEY` si elle est fournie (identifiant
`env-…`), sinon une clé aléatoire de 32 octets propre à la base, créée à la première signature dans
`archive_signing_keys` (identifiant `db-…`, `apps/api/src/lib/archive-signing-key.ts`). Dans `init.sql`, une seule
instruction, ajoutée : `CREATE TABLE IF NOT EXISTS archive_signing_keys`. L'identifiant de clé est une empreinte
tronquée, séparée de la signature ; la clé n'est ni dans l'archive ni dans les journaux (vérifié par la recette).

**Restauration** (`importStudioArchive`) :

- **Contrôles d'intégrité inchangés :** une anomalie du manifeste ou d'une empreinte renvoie toujours 422
  `archive_studio`, et rien n'est créé.
- **Signature vérifiée par une clé de ce serveur** (celle de l'environnement ou celle de la base) : restauration comme
  avant. Les comptes sont retrouvés par adresse ; auteurs, approbations, droits et préférences sont repris.
- **Signature absente, inconnue ou invalide :** l'import est permis, mais rien n'en est cru.
  - Chaque auteur, approbateur, acteur de publication, responsable et acteur d'observation devient le compte qui
    restaure.
  - Les adresses d'origine ne restent qu'en réserve : « Auteurs d'origine déclarés (non vérifiés) : … ».
  - Les publications approuvées ou diffusées reviennent « à relire » : statut `soumis`, approbation effacée, paquet et
    empreintes conservés et lisibles. Un passage `soumettre`, daté de la restauration, est ajouté au journal ; les
    évènements d'origine ne sont pas réécrits. Une nouvelle approbation est exigée avant toute diffusion.
  - Droits (membres) et préférences d'outils ne sont pas repris.
  - Réserves en français (traduites dans `en.json`), affichées dans le message d'import.
- La réponse de `POST /projects/import` indique, pour chaque projet, `studio: { trust, restored, downgraded }`.
- **CI :** une clé aléatoire est tirée à chaque exécution, masquée dans les journaux et partagée par les deux API de la
  recette. Aucune clé n'est dans le dépôt.

### Commandes exécutées et résultats (commit `10ebc8d`)

Les bases jetables neuves `fadi_teamr12a` et `fadi_teamr12b` ont été migrées **deux fois chacune** (4 × `Schema applied
(init.sql).`, table des clés vide après migration). L'API A tournait sur le port 3085 avec une clé `ARCHIVE_SIGNING_KEY`
tirée pour l'occasion et jamais écrite dans le dépôt. L'API B a été lancée et arrêtée par la recette sur le port 3086,
avec puis sans la clé. À la fin, les API ont été arrêtées par PID et les bases supprimées.

| Commande | Résultat |
|---|---|
| `npm run typecheck` | succès |
| Tests des paquets et du web (comme la CI) | 47 + 95 + 869 + 744 (1 ignoré) + 22 + 569 réussis |
| API hors base + `check-api-tests-db3.mjs` (et ses 6 tests) | 176 tests réussis (dont 3 de `archive-signature.test.ts`, 11 de `studio-archive-manifest.test.ts`) ; 12 suites DB-3 refusées par la garde seule ; contrôle vert |
| `npm run test:db-guard` | 138 réussis |
| `node --test` : outil de comparaison, gardes d'architecture, dépendances, continuité | 75/75 |
| `npm run build` | succès |
| `studio-restauration.mjs` | **66 contrôles réussis, 0 échec** ; comparaison A / B : 28 lignes, **0 anomalie** |
| `studio-persistance.mjs` | 293 réussis, 0 échec |
| `verify-restore.sh` (pg_dump / pg_restore) | effectifs et empreintes identiques, déclencheurs présents, comparaison `--all` : 4 projets, 0 anomalie |

Contrôles ajoutés à la recette :

- **Export :** archive signée, identifiant `env-…`, clé absente du fichier.
- **Archive intacte restaurée dans B** (même clé) :
  - confiance `verifiee` ;
  - auteurs conservés : révision 1 au propriétaire, révision 2 à l'éditeur ;
  - approbation par le propriétaire et diffusion par l'éditeur conservées.
- **Archive d'un second projet falsifiée, manifeste recalculé selon la règle publique** (texte d'un commentaire
  réécrit, révisions « attribuées » au propriétaire). L'éditeur l'importe depuis la page Projets du navigateur.
  - L'import réussit et le message affiche la réserve : signature invalide, « rien n'en est cru », « à relire »,
    adresses déclarées.
  - Révisions, commentaire, observation et journal sont attribués au compte qui restaure.
  - La publication diffusée revient `soumis`, sans approbation, avec 5 évènements dont le passage de restauration.
  - Les 4 fichiers du paquet sont identiques et lisibles.
  - Aucun membre n'est repris : le propriétaire d'origine n'a pas accès.
  - La diffusion est refusée (409) jusqu'à une nouvelle approbation ; après approbation, la diffusion réussit.
- **API B relancée sans `ARCHIVE_SIGNING_KEY` :**
  - clé propre à la base créée une seule fois (64 caractères), identifiant `db-…`, ni dans l'archive ni dans le
    journal de l'API ;
  - l'archive de B y est vérifiée ;
  - l'archive signée par la clé de A y est « clé inconnue », avec la réserve correspondante.
- **Réimport dans A :** son propre export y est vérifié.

**Limites de la section 5 :**

- Sans `ARCHIVE_SIGNING_KEY`, deux serveurs (ou deux bases) ne se font pas confiance. Une restauration entre bases
  conserve les auteurs seulement si la même clé est configurée des deux côtés.
- Une base restaurée par `pg_restore` reprend sa clé propre, ce qui est voulu : c'est la même identité de serveur.
- La clé propre à la base est lisible par qui lit la base. En production, fournir `ARCHIVE_SIGNING_KEY` par le
  gestionnaire de secrets ; cette documentation de déploiement n'est pas faite ici.
- La CI n'a pas tourné : rien n'a été poussé.

## 6. Publications E.4 et exigences E.1 (branche `teamr12-e4b`, 19 octobre 2026)

La branche `teamr12-e4b` part de `lead-vague5` (`3a58bde`), puis fusionne `lead-vague5` (`fb701d3`) pour les exigences
de l'équipe E1. Commits : `f78671f` (E.4), fusion `bbca093`, `8e67e5b` (E.1). Tout est local, rien n'est poussé.

**Archive.** Les lignes sont lues par `to_jsonb` et réinsérées par `jsonb_populate_recordset`. Toutes les colonnes
entrent donc dans l'archive, dans les empreintes par table et dans l'empreinte globale signée, y compris :

- les nouvelles colonnes des publications : `work_status`, `diffusion_status`, `manifest`, `manifest_hash`,
  `manifest_built_at`, `approved_manifest_hash`, `replaced_by_publication_id`, `replaced_by`, `replaced_at` ;
- celles des évènements : `manifest_hash`, `work_status`, `diffusion_status`, `related_publication_id`, ainsi que
  les actions `actualiser` et `remplacer` ;
- les deux tables E.1, `studio_requirement_sets` et `studio_requirement_checks`, ajoutées au périmètre ;
- le champ `proprietes`, transporté dans les documents de révision.

Ajouts à la restauration :

- `replaced_by` est traité comme un compte (réattribué comme les autres) ;
- le dossier remplaçant est inséré avant le dossier remplacé, car la clé étrangère n'est pas différée.

Contrôles d'intégrité ajoutés (une anomalie renvoie 422) :

- empreinte du manifeste ;
- présence et empreinte de chaque source du manifeste ;
- approbation portant sur le même manifeste ;
- présence du dossier remplaçant et du dossier lié ;
- jeu d'exigences rattaché à son étude, sans version en double ;
- contrôle lié à une révision de sa variante (empreinte du document) et à une version existante du jeu.

**Archive non vérifiée, projetée sur le modèle E.4** (`distrustStudioPublications`, qui s'appuie sur `dimensionsDe` et
`statutCombine` de `studio-publication-statuts.ts`) :

- Travail : `approuve` devient `en-revue`. L'approbation est entièrement effacée : `approved_revision_id`,
  `approved_document_hash`, `approved_manifest_hash`, approbateur et date.
- Diffusion : `diffuse` devient `non-diffuse` (« diffusion retirée à la restauration »). C'est l'option prudente :
  - c'est le seul état depuis lequel E.4 admet une nouvelle approbation puis une nouvelle diffusion ;
  - `retire` est terminal dans E.4, donc ce dossier n'aurait jamais pu être republié ;
  - `retire` et `remplace`, déjà hors vigueur, restent tels quels.
- Le statut combiné historique est recalculé par `statutCombine`, comme E.4 le tient ; un dossier diffusé devient
  `soumis`.
- Le manifeste, le paquet et leurs empreintes sont conservés et restent lisibles.
- Un passage `soumettre` est journalisé, daté de la restauration, avec les dimensions, l'empreinte du manifeste et un
  commentaire explicite.
- Pour republier, la restauration change le nom du projet (« · import »), ce qui périme le manifeste. Le circuit E.4
  complet est donc exigé : actualiser, soumettre, approuver le manifeste examiné, diffuser.
- Exigences E.1 :
  - **archive signée** : lignes insérées telles quelles ;
  - **archive non vérifiée** : auteurs attribués au compte qui restaure ; l'acceptation d'une référence partenaire
    (`origine.acceptation`, qui et quand) est retirée de chaque version insérée. Le jeu reste append-only (insertion,
    jamais d'UPDATE, déclencheur intact). La référence redevient « non acceptée », avec une réserve traduite.

**Outils.** L'outil de comparaison couvre les deux tables E.1, `replaced_by` comme compte, et 7 déclencheurs
d'immuabilité. Il contrôle aussi le manifeste, l'approbation, le remplacement, l'empreinte et la version des contrôles.
`verify-restore.sh` couvre les effectifs E.1, des empreintes qui incluent toutes les colonnes E.4 et E.1, et les 7
déclencheurs.

### Commandes exécutées et résultats (commit `8e67e5b`)

Les bases jetables neuves `fadi_teamr12a` et `fadi_teamr12b` ont été recréées après la fusion E.1 et migrées **deux fois
chacune**. Les API ont été arrêtées par PID et les bases supprimées à la fin. Les recettes de la ligne 2 du tableau
ont tourné sur le build de ce commit.

| Commande | Résultat |
|---|---|
| `npm run typecheck`, `npm run build` | succès |
| Tests des paquets et du web | 47 + 95 + 886 + 744 (1 ignoré) + 22 + 610 réussis |
| API hors base + `check-api-tests-db3.mjs` (et ses 6 tests) | 207 réussis, dont 16 des modules de restauration et de signature ; 12 suites DB-3 refusées par la garde seule ; contrôle vert |
| `npm run test:db-guard` | 149 réussis |
| `node --test` : comparaison (7), gardes d'architecture, dépendances, continuité ; `check-frontieres.test.mjs` | 77/77 ; 26/26 |
| `studio-restauration.mjs` | **75 contrôles réussis, 0 échec** ; comparaison A / B : 39 lignes, **0 anomalie** |
| `studio-publication.mjs` | 123 réussis, 0 échec |
| `studio-persistance.mjs` | 293 réussis, 0 échec |
| `verify-restore.sh` | effectifs (dont 3 jeux d'exigences, 2 contrôles) et empreintes identiques, 7 déclencheurs ; comparaison `--all` : 5 projets, 0 anomalie |

Contrôles ajoutés à la recette :

- **Rôles E.4 :** l'éditeur prépare et soumet ; le propriétaire approuve, sur l'empreinte du manifeste, puis diffuse.
- **Projet restauré depuis une archive signée :**
  - remplacement archivé et restauré : action `remplacer` et dossier lié ;
  - actualisation archivée et restaurée : action `actualiser` ;
  - dossier remplacé restauré `approuve` / `remplace` ;
  - un jeu d'exigences et un contrôle identiques dans A et B.
- **Archive falsifiée :**
  - dossier diffusé restauré `en-revue` / `non-diffuse` / `soumis`, sans approbation, manifeste conservé ;
  - passage de restauration journalisé avec ses dimensions ;
  - circuit E.4 complet avant une nouvelle diffusion ;
  - référence partenaire non acceptée après restauration, puis réacceptée (version 3) ;
  - versions du jeu toujours immuables ;
  - réserve visible dans le navigateur.

**Correctif de recette (branche `teamr12-v5fix`, depuis `lead-vague5` `c38c9ad`).** Sur la branche intégrée, le
contrôle « empreintes des documents de la publication et du paquet » échouait. Ce n'était pas une incohérence de
données, et le commit E4b `453fcf0` (cache de régénération) n'y était pour rien : il ne change aucune empreinte
stockée.

- **Cause :** la recette lisait `studio_publications[0]`. Or l'archive range les lignes par identifiant, qui est
  aléatoire, et depuis la section 6 le projet porte trois dossiers. Le dossier comparé n'était donc le bon qu'une fois
  sur trois. Lors de la relance, le dossier d'origine était en deuxième position.
- **Correction :** chaque dossier est maintenant retrouvé par son identifiant, et le contrôle est renforcé. Il compare,
  pour les trois dossiers, l'empreinte du document, du manifeste et du paquet aux valeurs rendues par l'API.

Relance sur des bases neuves migrées deux fois :

| Recette | Résultat |
|---|---|
| `studio-restauration.mjs` | 75/75, comparaison sans anomalie |
| `studio-publication.mjs` | 128/128 |
| `verify-restore.sh` | 3 projets, 0 anomalie |

**Limite de la section 6 :**

- Dans une archive signée, `origine.acceptation.par` et les comptes cités dans les résultats de contrôle sont des
  valeurs JSON. Ils restent tels quels (identifiant de la base d'origine, adresse dans `parEmail`), comme le veut la
  règle « lignes telles quelles ». Seules les colonnes de compte sont réattribuées par adresse.
