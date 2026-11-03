# Audit 04 — Stockage navigateur & synchronisation / GeoData

Dépôt : `/home/claude/fadi`, HEAD `b9d9897` (2026-11-02). Audit en lecture seule : aucune modification, aucune exécution
de tests ni de base. Chaque constat cite `fichier:ligne` ; ce qui n'a pas pu être vérifié est marqué **Hypothèse**.
Règles de référence : `CLAUDE.md:33` (aucune donnée inventée), `CLAUDE.md:40-44` / `AGENTS.md:24-29` (D-GD-29,
« Interface ≠ base de données »).

## Synthèse

| # | Constat | Gravité | Effort |
|---|---------|---------|--------|
| A1 | `localStorage` non purgé à la déconnexion ou au changement de compte (presse-papiers Atelier, ensembles et leur base de synchronisation, état GeoData, clé MapTiler) ; risque de pousser les ensembles du compte A vers le compte B | Élevée | S |
| A2 | Quarantaine IndexedDB jamais vidée, lisible et exportable par tout compte suivant sur l'appareil | Moyenne | S |
| A3 | `navigator.storage.persist()` demandé seulement pour Studio ; les lots Atelier et les mutations en pause peuvent être évincés | Moyenne | S |
| A4 | Commentaires rejoués sans identifiant d'idempotence : doublons possibles | Moyenne | S |
| A5 | Un 401 en cours de session ne purge pas l'appareil (purge seulement au démarrage, à la connexion et à la déconnexion) | Moyenne | S |
| A6 | `oublierProjet` laisse le brouillon Planche du projet (`keyValue`) | Faible | XS |
| A7 | Liste des préfixes d'API du service worker différente de celle du serveur | Faible | XS |
| A8 | Lectures locales qui échouent en silence ; aucun gestionnaire `versionchange` / `blocked` pour Dexie | Faible | S |
| B1 | Import de référence : la vérification d'idempotence a lieu hors transaction, sans verrou ni index unique ; publication non atomique | Élevée | S |
| B2 | Tuiles MVT calculées à chaque requête, sans cache serveur, sans GiST composite, `ST_Transform` à la volée | Moyenne | M |
| B3 | `::geography` sur les colonnes (proximité, analyses) : l'index GiST n'est pas utilisé | Moyenne | S |
| B4 | Recherche `LIKE '%…%'` sur toutes les couches : aucun index utilisable | Moyenne | S |
| B5 | Aucun rôle PostgreSQL dédié à GeoData ; `fadi_app` peut modifier ou effacer l'archive `geodata_fichiers` | Moyenne | S |
| B6 | Archive des fichiers non transactionnelle ; `--prix-sources` marque comme retirés les fichiers provisoires | Moyenne | S |
| B7 | D-GD-29 : catalogue des catégories codé en dur et repli de l'interface sur ces données embarquées | Moyenne | M |
| B8 | D-GD-29 : autres référentiels dans le code (libellés des douars, correspondances FeenWay, priorité HCP, `apps/api/src/data/*.json`) | Moyenne | M–L |
| B9 | Systèmes de coordonnées : Merchich (EPSG:26191 seulement, 3 paramètres) défini deux fois en JS, autres zones absentes | Faible | S |
| B10 | Index manquant `geodata_indicateurs(couche_id)` ; cache raster en mémoire jusqu'à ~190 Mo | Faible | XS |
| B11 | Taille des contours renvoyés en GeoJSON (jusqu'à ~210 Ko par entité) | Faible | S |

**Points solides vérifiés**
- Historique Dexie complet (versions 1 à 9) avec des montées qui ne suppriment rien (mise en quarantaine).
- Propriétaire `userId` sur les lots, brouillons, contextes et photos.
- Purge à la déconnexion et au changement de compte (`auth-context.tsx:57-67`).
- Le service worker ne met jamais l'API en cache.
- Idempotence serveur des lots par `requestId`, vérifiée avant le contrôle de révision (`lib/atelier-validation.ts:84`).
- GeoData : versions publiées immuables (déclencheurs `init.sql:3194-3209`, `3410-3431`) et empreinte SHA-256 contrôlée.
- Données GeoData en EPSG:4326 seulement, sans reprojection devinée (`geojson.ts:76-81`, `geopackage.ts:80-81`).
- GiST sur `geodata_objets`, `geodata_territoires`, `geodata_zones`, `geodata_prix_zones`.
- Aire ellipsoïdale (`geography`) pour les analyses.
- Aucune liste de régions, provinces ou communes ni aucune statistique HCP trouvée dans `apps/web/src`, `apps/api/src`
  (hors `data/*.json`) ou `packages/*/src`.

---

## A. Stockage navigateur et synchronisation (`apps/web`)

### Inventaire (vérifié)

**IndexedDB `fadi-local`** (`apps/web/src/lib/local-store.ts:168-193`, Dexie `~4.4.6`)

| Table | Clé, index | Contenu | Version |
|---|---|---|---|
| `outbox` | — | supprimée (v4) | 1→4 |
| `modelCache` | `projectId` | modèle Atelier complet en JSON + révision | 1 |
| `keyValue` | `key` | cache TanStack Query déshydraté (`fadi-queries-1`), brouillons Planche (`planche-brouillon:<projectId>`) | 2 |
| `lots` | `id, projectId, ordre, userId` | file d'écriture Atelier (enveloppes `requestId` + `baseRevision`) | 3, propriétaire en v7 |
| `studioBrouillons` / `studioContextes` | `cle, userId, projectId` | brouillons hors ligne avec jeton de comparaison, contextes lus | 5, propriétaire en v6 |
| `comPhotos` | `id, userId, projectId` | photos (Blob) en attente d'envoi | 8 |
| `quarantaine` | `id, table, misEnQuarantaineA` | lignes sans propriétaire (montées v6 et v7) | 6 / 9 |

Aucun jeton d'authentification n'est stocké : la session repose sur un cookie (`credentials: "include"`).

**Données personnelles stockées localement** : `fadi.lastUser` (id, courriel, nom, rôle — `auth-context.tsx:26-40`) ;
le cache de requêtes contient des données de projet et de collaboration. Les requêtes de sécurité en sont exclues
(`query-persister.ts:16,84`). Durée de conservation : 14 jours (`query-persister.ts:78`).

**Synchronisation**
- Lots Atelier : `requestId` (idempotence, index unique `atelier_commands_request_unique`, `db/schema.ts:839`) et
  `baseRevision`. Un écart de révision renvoie 409 (`routes/atelier-commands.ts:271-272`). Les conflits sont
  conservés, jamais résolus par « dernier écrit gagne ».
- Saisies et arbitrages : `baseline` et `expectedVersion` (`lib/mutations.ts:1-13`), rejeu via `resumePausedMutations`
  (`main.tsx:68`).
- Ensembles : fusion à trois voies et version (`sync-ensembles.ts:26-34,66-85`).
- Studio : comparer-puis-écrire par jeton (`local-store.ts:410-422`).

### A1 — `localStorage` non purgé à la déconnexion ou au changement de compte — **Élevée**

**Constat.** `forgetDevice` (`lib/auth-context.tsx:57-67`) vide le cache de requêtes, les conflits, les brouillons COM,
`fadi.lastUser`, les tables IndexedDB et Studio. Il ne touche pas aux clés suivantes, qui contiennent pourtant des
données du compte ou du projet :

| Clé | Contenu |
|---|---|
| `fadi-atelier-presse-papiers` (`AtelierNouveau.tsx:79,364`) | objets copiés, définitions, noms de calques et `projetId` (`packages/atelier-model/src/presse-papiers.ts:17-29`) : contenu de projet. Collable par un autre compte (`AtelierNouveau.tsx:377`). |
| `fadi.atelier.prefs` (`etat-ui.ts:137-152`) | `ensembles` (personnels, synchronisés côté serveur) |
| `fadi.atelier.ensembles-sync` (`sync-ensembles.ts:15`) | version serveur et liste de base du compte précédent |
| `geodata.derniere-carte`, `geodata.pays`… (`PageGeoData.tsx:39,176-185,326`) | identifiant de la dernière carte |
| `fadi.sandbox.contexte-travail.*` (`sandbox/planche/contexte-travail.ts:8`) | contexte de travail |
| `parcelle-maptiler-key-v1` (`lib/maptiler.ts:21,39`) | clé d'API MapTiler (un secret) |

**Hypothèse (non testée).** Après un changement de compte, `synchroniserEnsembles` compare les ensembles locaux (ceux du
compte A, restés dans `fadi.atelier.prefs`) à la base de A. S'ils diffèrent (modifications de A non envoyées), la fusion
`fusionnerEnsembles(serveurB, localA, baseA)` est envoyée au compte B (`sync-ensembles.ts:72-79`) : des données
traverseraient alors d'un compte à l'autre.

**Impact.** Fuite de contenu de projet (presse-papiers) et de préférences personnelles entre utilisateurs d'un même
appareil ; secret MapTiler conservé.

**Recommandation.** Préfixer par `userId` toute clé qui porte des données du compte, et purger les clés globales dans
`forgetDevice` :

```ts
// auth-context.tsx — forgetDevice()
const PREFIXES_COMPTE = ["fadi-atelier-presse-papiers", "fadi.atelier.ensembles-sync", "fadi.atelier.prefs",
  "geodata.", "fadi.sandbox.contexte-travail.", "fadi.conflicts."];
try {
  for (const k of Object.keys(localStorage)) if (PREFIXES_COMPTE.some((p) => k.startsWith(p))) localStorage.removeItem(k);
} catch { /* stockage indisponible */ }
etatUi.set({ ensembles: [] }); // état en mémoire
```

Il faut aussi conserver la clé MapTiler en `sessionStorage` uniquement (ou par compte, en base). Ajouter un test e2e
« A se déconnecte, B se connecte : aucune clé `fadi*` ou `geodata*` héritée ».

**Effort.** S.

### A2 — Quarantaine jamais vidée et visible par tout compte — **Moyenne**

**Constat.**
- `oublierTout` ne vide pas `quarantaine` (`local-store.ts:338-340`), et c'est voulu : « aucune tâche ne la vide, ni la
  déconnexion » (`local-store.ts:26-27`).
- `quarantaineLister` et `quarantaineExporter` ne filtrent rien (`local-store.ts:394-396`) ; la liste s'affiche dans
  Paramètres (`routes/ParametresPage.tsx:151-197`).
- Les lignes contiennent des enveloppes Atelier et des brouillons Studio d'avant v6/v7 : du contenu de projet d'un
  propriétaire inconnu.

**Impact.** Sur un appareil partagé, tout compte connecté peut lire et exporter les modifications non synchronisées d'un
compte précédent.

**Recommandation.** Garder la règle « ne jamais supprimer », mais :
- limiter l'affichage et l'export au premier compte qui ouvre l'application après la montée, ou à un compte
  administrateur ;
- chiffrer les lignes (WebCrypto, clé dérivée côté serveur) ;
- ou proposer une purge explicite, confirmée et journalisée.

Documenter le choix dans une ADR, car il s'agit d'un compromis entre conservation et confidentialité.

**Effort.** S.

### A3 — Persistance du stockage demandée seulement pour Studio — **Moyenne**

**Constat.** Le seul appel à `navigator.storage.persist()` se trouve dans `modules/studio/chargement/hors-connexion-studio.ts:92`,
et seulement s'il existe des brouillons Studio. Il n'y en a aucun pour les `lots` Atelier, les mutations en pause
(persistées dans `keyValue`) ni les `comPhotos`. Seul Studio gère le dépassement de quota (`useEnregistrement.ts:131-132`) ;
`putLot` lève une `LocalPersistenceError` générique (`local-store.ts:229-234`).

**Impact.** Sous pression de stockage, le navigateur peut évincer la file Atelier ou les messages en attente. Le travail
non synchronisé est alors perdu sans signal fiable.

**Recommandation.** Appeler `protegerFileLocale`, généralisé, dès qu'une écriture locale est mise en file (`putLot`,
`comPhotoEcrire`, mutation mise en pause). Afficher l'état `persisted()` dans Paramètres. Distinguer
`QuotaExceededError` dans `checked()` :

```ts
catch (cause) {
  const quota = cause instanceof DOMException && cause.name === "QuotaExceededError";
  throw new LocalPersistenceError(quota ? MESSAGE_QUOTA : undefined, { cause });
}
```

**Effort.** S.

### A4 — Commentaires rejoués sans idempotence — **Moyenne**

**Constat.**
- La mutation `comment` rejoue `api.addComment` (`lib/mutations.ts:280-282`).
- `addComment` n'envoie aucun identifiant de requête (`lib/api.ts:1691-1692`) ; la route `POST /comments` n'en lit aucun
  (`routes/collaboration.ts:5`).
- `RETRY_NETWORK` réessaie jusqu'à 20 fois sur une erreur réseau (`mutations.ts:251`), y compris quand la requête est
  arrivée au serveur mais que la réponse a été perdue.

Les messages COM, eux, portent un `clientRequestId` (`mutations.ts:23-33`).

**Impact.** Commentaires en double en cas de réseau instable.

**Recommandation.** Aligner les commentaires sur COM :

```sql
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS client_request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS project_comments_request_unique
  ON project_comments (project_id, author_id, client_request_id) WHERE client_request_id IS NOT NULL;
```

Le client fixe `clientRequestId` à la rédaction, dans `CommentVars`. Le serveur renvoie le commentaire existant en cas
de conflit.

**Hypothèse à vérifier.** Pour `stepPatch`, un rejeu après un succès dont la réponse a été perdue produirait-il un faux
conflit 409 (`baseline` ≠ valeur courante) ? À tester.

**Effort.** S.

### A5 — Un 401 en cours de session ne purge pas l'appareil — **Moyenne**

**Constat.** `forgetDevice` n'est appelé qu'à quatre endroits : au démarrage si `/auth/me` répond 401
(`auth-context.tsx:105-109`), au changement de compte (`79`, `93`) et à la déconnexion (`148`). Aucun gestionnaire
global ne réagit aux autres 401 (recherche de `status === 401` : traitements locaux à l'affichage seulement, par exemple
`DossierDashboard.tsx:52`). Le commentaire de `local-store.ts:331` (« session expirée (401) ») ne décrit donc que le
démarrage.

**Impact.** Une session révoquée (mot de passe changé, compte suspendu) laisse le cache local lisible jusqu'au
rechargement suivant.

**Recommandation.** Écouter les erreurs du cache de requêtes et de mutations pour déclencher la purge sur un 401 :

```ts
queryClient.getQueryCache().subscribe((e) => {
  if (e.type === "updated" && e.action.type === "error" && forgetsSession(e.action.error)) void forgetDevice(queryClient);
});
```

Prévoir aussi un `BroadcastChannel("fadi-auth")` pour propager la déconnexion aux autres onglets.

**Effort.** S.

### A6 — `oublierProjet` laisse le brouillon Planche — **Faible**

**Constat.** Le brouillon Planche est stocké dans `keyValue` sous `planche-brouillon:<projectId>`
(`modules/atelier/nouveau/planche/brouillon.ts:12,39-40`). `oublierProjet` ne touche pas `keyValue`
(`local-store.ts:352-359`), et `forgetProject` ne purge que le cache de requêtes (`project-cache-guard.ts:33-39`).

**Impact.** Une géométrie de projet reste sur l'appareil après la perte de l'accès au projet.

**Recommandation.** Dans `oublierProjet`, ajouter `await d.keyValue.delete(\`planche-brouillon:${projectId}\`)`, et
inclure `d.keyValue` dans la transaction. Même chose pour le brouillon du sandbox (`modules/sandbox/planche/brouillon.ts`).

**Effort.** XS.

### A7 — Liste des préfixes d'API différente entre service worker et serveur — **Faible**

**Constat.** La liste du service worker (`public/sw.js:54`) ne contient pas `geodata/api`, `organizations`, `admin/…`,
`reviews`, `mcp` ni `sandbox/preferences`, que le serveur déclare (`apps/api/src/app.ts:28`). Les GET de ces routes ne
sont pas mis en cache (seuls `/assets` et `/parcelle` le sont, `sw.js:224-232`), donc il n'y a pas de données périmées.
En revanche, une navigation vers par exemple `/geodata/api/exports/…` passe par `shell()` : hors ligne, l'utilisateur
reçoit la page de l'application au lieu d'une erreur (`sw.js:175-188`).

Les tuiles GeoData publiques sont servies avec `private, max-age=300` (`routes/geodata/consultation.ts:190,274`) et
restent dans le cache HTTP du navigateur après la déconnexion, 5 minutes au plus. Les couches privées sont en
`no-store`. Risque faible.

**Recommandation.** Générer la liste des préfixes du service worker depuis la même constante au build
(`vite.config.ts`), ou ajouter un test de cohérence entre les deux.

**Effort.** XS.

### A8 — Échecs silencieux et cycle de vie Dexie — **Faible**

**Constat.**
- `safe()` renvoie la valeur par défaut sur toute erreur (`local-store.ts:212-220`). `readModelCache`, `getValue` et
  `studioContexte` peuvent donc confondre « absent » et « illisible ». Les écritures critiques passent bien par
  `checked()`.
- Aucun `db.on("versionchange")` ni `on("blocked")` (recherche négative). Dexie 4 ferme la connexion sur `versionchange`.
- **Hypothèse.** Un onglet ancien garderait alors un `db` fermé en cache (`local-store.ts:196,202`) et toutes ses lectures
  tomberaient silencieusement sur la valeur par défaut.

**Recommandation.**

```ts
db.on("versionchange", () => { db?.close(); db = null; /* annoncer : rechargez l'onglet */ return false; });
db.on("blocked", () => { /* annoncer : fermez les autres onglets Fadi */ });
```

Journaliser (sans contenu) les erreurs avalées par `safe()`.

**Effort.** S.

### Cohérence entre modèle local et serveur (vérifié, sans défaut)

`ModelCacheEntry.revision` et `LotEntry.enveloppe.baseRevision` reflètent `projects.model_revision`. Le serveur
verrouille le projet (`lockProject`, `atelier-commands.ts:95`), puis vérifie l'idempotence par `requestId`
(`lib/atelier-validation.ts:84`) avant la révision. Un rejeu d'un lot déjà validé est donc reconnu, pas refusé en
conflit. La quarantaine v7 traite les lots sans propriétaire. Le modèle local n'a pas de clé `userId` (`modelCache`
indexé par `projectId` seul) mais il est vidé à chaque changement de compte. Acceptable, à condition de corriger A5.

---

## B. GeoData

### Modèle de données (vérifié)

**Stockage.**
- `geometry(Geometry, 4326)` pour `geodata_objets.geom` et `geodata_territoires.geom` (`init.sql:3025,3314`).
- `geometry(Polygon, 4326)` pour les emprises (`init.sql:3011`).
- `geography(Polygon, 4326)` pour `projects.parcel_footprint` seulement (`init.sql:74`).
- Raster : grille Float32 compressée dans `bytea` (`init.sql:3215-3228`).

**Système de coordonnées.** EPSG:4326 seulement à l'import. GeoJSON : CRS84 ou EPSG:4326 (`geojson.ts:29-30,76-81`).
GeoPackage : EPSG:4326 sinon refus (`geopackage.ts:80-81`). GeoTIFF : EPSG:4326. Aucune reprojection en base hormis
`ST_Transform(…, 3857)` pour les tuiles.

**Provenance.**
- `geodata_versions` : empreinte SHA-256 (`CHECK` hex), fichier, URL, licence, droits, `crs_source`, `transformations`,
  `controles` (`init.sql:2973-3000`).
- `geodata_fichiers` : contenu brut en `bytea`, taille contrôlée et empreinte (`init.sql:3372-3387`).
- `geodata_decoupage_imports UNIQUE (pays, empreinte)` (`init.sql:3358-3367`).

**Simplification.** Aucune, par décision (D-GD-33, `consultation.ts:139-143`, `territoires.ts:76-77`). La seule
réduction est la quantification de `ST_AsMVTGeom` (grille 4096, `consultation.ts:156`).

**Volumétrie mesurée** sur les fichiers livrés (`docs/geodata/sources/donnees`) :

| Couche | Entités | Sommets au total | Entité la plus lourde |
|---|---|---|---|
| Régions HCP | 12 | 40 623 | 5 923 sommets, 141 Ko |
| Provinces HCP | 75 | 68 247 | 2 902 sommets, 69 Ko |
| Communes HCP | 1 487 | 206 592 | 1 590 sommets, 39 Ko |
| Communes OSM | 1 498 | 280 658 | 7 874 sommets, 211 Ko |

Le dossier des sources pèse 106 Mo ; il est archivé en base à chaque démarrage s'il a changé.

### B1 — Idempotence de l'import de référence non garantie en cas de concurrence — **Élevée**

**Constat.**
- La recherche d'une version identique (`SELECT … WHERE s.cle = $1 AND v.empreinte = $2`) s'exécute **avant** `BEGIN`
  (`db/geodata-reference.ts:526` puis `557`).
- Aucun index unique sur `geodata_versions (source_id, empreinte)` : seul `(source_id, etat)` existe (`init.sql:3001`).
- Aucun `pg_advisory_xact_lock`, alors que la chaîne des prix en prend (`lib/geodata/prix/pipeline.ts:57,304,439,576`).
- L'import automatique est relancé à **chaque démarrage** de l'API (`server.ts:104` → `lib/geodata/import-auto.ts:52-62`).
- La publication (`UPDATE` et journal, `geodata-reference.ts:341-343`) a lieu **après** le `COMMIT`
  (`geodata-reference.ts:576-578`), en autocommit.

**Impact.** Deux démarrages simultanés (redéploiement avec chevauchement, plusieurs instances, import manuel pendant
l'import automatique) peuvent préparer deux versions de même empreinte. `DERNIERE_VERSION` devient alors ambiguë et
l'interface montre des doublons au catalogue. Un arrêt entre l'`UPDATE` et le journal laisse une publication non
journalisée.

**Recommandation.**

```sql
CREATE UNIQUE INDEX IF NOT EXISTS geodata_versions_empreinte_uniq
  ON geodata_versions (source_id, empreinte) WHERE espace_id IS NULL;
```

```ts
await client.query("BEGIN");
await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`geodata_import:${fiche.cle}`]);
const [deja] = (await client.query(/* même SELECT */)).rows;   // dans la transaction
if (!deja) await ecrireVersion(client, …);
if (publicationDemandee()) await publier(versionId);           // même transaction : UPDATE et journal atomiques
await client.query("COMMIT");
```

Prendre en plus un verrou global de session (`pg_try_advisory_lock(hashtext('geodata_import_auto'))`) dans
`lancerImportAuto`, pour qu'une seule instance importe à la fois.

**Effort.** S.

### B2 — Tuiles vectorielles recalculées à chaque requête — **Moyenne**

**Constat.** `GET /tuiles/:coucheId/:z/:x/:y` (`consultation.ts:144-192`) :
- applique `ST_Transform(ST_ClipByBox2D(o.geom, …), 3857)` à chaque objet et à chaque requête ;
- filtre par `o.couche_id = $1 AND o.geom && ST_Transform(b.e, 4326)`. Il n'existe qu'un GiST simple sur `geom`
  (`init.sql:3029`) et le B-tree `UNIQUE (couche_id, code)`. Les couches se superposent toutes sur le Maroc, donc soit
  le GiST renvoie les objets de toutes les couches, soit le B-tree renvoie toute la couche ;
- avec `regrouper=1`, appelle `ST_Transform(o.geom, 3857)` cinq fois par point (`consultation.ts:163-167`) ;
- n'a aucun cache serveur. Seul le navigateur garde la tuile 5 minutes (`private, max-age=300`), alors que les versions
  publiées sont **immuables**, ce qui en fait un cas idéal pour un cache.

Les étiquettes recalculent `ST_PointOnSurface` à chaque tuile (`consultation.ts:258-272`).

**Impact.** Coût CPU proportionnel au nombre de sommets. Aux petits zooms, toutes les communes (206 000 à 280 000
sommets) sont transformées et quantifiées à chaque tuile. Les temps de réponse et la charge PostgreSQL augmentent avec
le nombre d'utilisateurs.

**Recommandation.**
1. Index composite (extension `btree_gist`) :
   ```sql
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   CREATE INDEX IF NOT EXISTS geodata_objets_couche_geom_idx ON geodata_objets USING gist (couche_id, geom);
   ```
2. Pré-calculer la projection et le point d'étiquette à l'import (le déclencheur « contenu figé » l'autorise en
   préparation) :
   ```sql
   ALTER TABLE geodata_objets ADD COLUMN IF NOT EXISTS geom_3857 geometry(Geometry, 3857);
   ALTER TABLE geodata_objets ADD COLUMN IF NOT EXISTS etiquette_3857 geometry(Point, 3857);
   CREATE INDEX IF NOT EXISTS geodata_objets_couche_geom3857_idx ON geodata_objets USING gist (couche_id, geom_3857);
   ```
3. Cache des tuiles par version (immuable) :
   ```sql
   CREATE TABLE IF NOT EXISTS geodata_tuiles_cache (
     couche_id text NOT NULL REFERENCES geodata_couches(id) ON DELETE CASCADE,
     z smallint, x int, y int, variante text NOT NULL DEFAULT '', mvt bytea NOT NULL,
     PRIMARY KEY (couche_id, z, x, y, variante));
   ```
   Alternative : un cache LRU en mémoire, ou `Cache-Control: public, immutable` avec un ETag égal à l'empreinte de la
   version, pour les couches communes autorisées.
4. Cohérence avec D-GD-33 : un pré-calcul de type `ST_SnapToGrid` par niveau de zoom, identique pour toutes les couches,
   conserve la superposition exacte des frontières partagées. C'est la même grille que `ST_AsMVTGeom`, appliquée une
   seule fois. Cela respecte INV-09 si la géométrie de référence reste intacte.

**Effort.** M.

### B3 — Conversion en `geography` qui neutralise l'index GiST — **Moyenne**

**Constat.**
- Proximité : `ST_DWithin(o.geom::geography, t.geom::geography, $4)` (`consultation.ts:434`) et
  `ST_Distance(…::geography)` sur toute la couche cible. Aucun préfiltre `&&`.
- Analyses : `ST_Intersects` est bien indexé, puis `ST_Area(ST_Intersection(...)::geography)`
  (`routes/geodata/etudes.ts:163`). Acceptable.

**Impact.** Proximité : parcours complet de chaque couche demandée (jusqu'à 20 couches et 5 000 objets chacune) à chaque
appel.

**Recommandation.** Préfiltrer avec un rectangle en degrés (rayon de 5 000 m au plus, et latitude du Maroc ≤ 36°) :

```sql
WHERE o.couche_id = $3
  AND o.geom && ST_Expand(t.geom, $4 / 111320.0 / cos(radians(36)))   -- utilise GiST (couche_id, geom)
  AND ST_DWithin(o.geom::geography, t.geom::geography, $4)
```

Autre solution : un index fonctionnel
`CREATE INDEX … USING gist ((geom::geography))` sur `geodata_objets`.

**Effort.** S.

### B4 — Recherche sans index utilisable — **Moyenne**

**Constat.** `lower(o.nom) LIKE '%' || $2 || '%'` porte sur tous les objets de toutes les couches consultables
(`consultation.ts:124`). L'index `(couche_id, lower(nom))` (`init.sql:3030`) ne sert pas pour une recherche à l'intérieur
du texte. Le tri utilise en plus `s.producteur LIKE 'Haut-Commissariat au Plan%'` (voir B8).

**Recommandation.**

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS geodata_objets_nom_trgm ON geodata_objets USING gin (lower(nom) gin_trgm_ops);
```

Envisager aussi `unaccent` pour les noms translittérés.

**Effort.** S.

### B5 — Aucun rôle PostgreSQL dédié ; archive modifiable par l'application — **Moyenne**

**Constat.**
- `db/geodata-role.ts` gère des **rôles applicatifs** (`geodata_roles`) par `DATABASE_URL` (`geodata-role.ts:19-25`).
  Ce n'est pas un rôle de base de données.
- L'API (`fadi_app`) reçoit `SELECT, INSERT, UPDATE, DELETE` sur **toutes** les tables (`init.sql:4032`), y compris
  `geodata_fichiers` (preuve D-GD-29), `geodata_versions` et `geodata_journal`.
- L'immuabilité des versions et du contenu est protégée par des déclencheurs ; `geodata_fichiers` et `geodata_journal`
  ne le sont pas.
- L'import automatique s'exécute dans le processus de l'API, avec les mêmes identifiants (`import-auto.ts:52-62`).

**Impact.** Une faille applicative (injection, route d'administration) peut réécrire ou effacer l'archive de provenance
et le journal GeoData sans laisser de trace.

**Recommandation.**

```sql
CREATE ROLE fadi_geodata_import LOGIN;   -- chaîne d'import seulement
GRANT SELECT, INSERT, UPDATE ON geodata_fichiers, geodata_sources, geodata_versions, geodata_couches, geodata_objets,
  geodata_indicateurs, geodata_valeurs, geodata_rasters, geodata_douars, geodata_concepts, geodata_tableaux_bord,
  geodata_pays, geodata_territoires, geodata_niveaux_administratifs, geodata_entites_administratives,
  geodata_decoupage_imports TO fadi_geodata_import;
GRANT INSERT ON geodata_journal TO fadi_geodata_import;
REVOKE INSERT, UPDATE, DELETE ON geodata_fichiers FROM fadi_app;
REVOKE UPDATE, DELETE ON geodata_journal FROM fadi_app;
```

Le rôle `import-prix` passe par l'API : prévoir pour lui une fonction `SECURITY DEFINER` étroite. Ajouter un déclencheur
« ajout seulement » sur `geodata_journal`. Faire tourner l'import avec `GEODATA_IMPORT_DATABASE_URL`.

**Effort.** S.

### B6 — Archive des fichiers non transactionnelle ; retraits erronés — **Moyenne**

**Constat.**
- `archiverFichiers(pool, …)` exécute un `INSERT … ON CONFLICT` par fichier en autocommit, puis un `UPDATE … retire_le`
  global (`lib/geodata/archive-fichiers.ts:97-126`). Un arrêt en cours de route laisse une archive partielle.
- Deux exécutions concurrentes se croisent (même absence de verrou qu'en B1).
- `--archiver` passe `{ provisoires: PROVISOIRES }` (`geodata-reference.ts:300`), mais `--prix-sources` appelle
  `archiverFichiers(pool, dossierFiches())` **sans** cette option (`geodata-reference.ts:385`). Les fichiers
  `provisoires/…` ne sont alors pas inventoriés et l'`UPDATE` final les marque **retirés**. Sur un environnement où
  `GEODATA_SOURCES_PROVISOIRES=oui`, leur état alterne donc d'une commande à l'autre.

**Impact.** Provenance D-GD-29 incohérente (`retire_le` faux) ; archive partielle après un incident.

**Recommandation.** Exécuter l'archive dans une transaction avec `pg_advisory_xact_lock(hashtext('geodata_fichiers'))`.
Passer l'option `provisoires` partout, ou ne marquer comme retirés que les chemins du périmètre inventorié
(`AND NOT chemin LIKE 'provisoires/%'` quand ce périmètre est exclu).

**Effort.** S.

### B7 — D-GD-29 : catalogue des catégories dans le code et repli de l'interface — **Moyenne**

**Constat.**
- `CATEGORIES_CATALOGUE` (17 catégories avec libellés et thèmes) est codé dans `packages/geodata-model/src/catalogue.ts:16-35`
  et fait partie du bundle web.
- `RANGEMENT_PAR_DEFAUT` (`catalogue.ts:47`) sert de **valeur par défaut** à `categorieDuTheme`, `categorieDe` et
  `regrouperCatalogue` (`catalogue.ts:50,54,84`).
- Côté web, `rangementDepuis(null)` renvoie `undefined` (`panneaux/donnees.tsx:11-12`). Tant que `/rangement` n'a pas
  répondu, ou s'il est en erreur, `regrouperCatalogue(…, rangementCatalogue)` (`PageGeoData.tsx:212-214`,
  `panneaux/consultation.tsx:39`) **se replie sur le catalogue embarqué**. `AGENTS.md:28-29` l'interdit : « it never falls
  back to embedded data ».
- Le semis en base vient lui aussi du code (`routes/geodata/categories.ts:20-45`), et non d'un fichier source archivé
  dans `geodata_fichiers`.

**Recommandation.**
- Déplacer les catégories initiales dans `docs/geodata/sources/categories.json` : archivé comme les autres fichiers
  (rôle `declaration`) et semé par la chaîne d'import.
- Retirer les paramètres par défaut et rendre `rangement` obligatoire :
  ```ts
  export function regrouperCatalogue<T>(couches: readonly T[], type: TypeCatalogue, actives: ReadonlySet<string>, r: RangementCatalogue)
  ```
- Dans l'interface, sans rangement chargé : afficher « Catégories non chargées (base) » et une liste plate.
- Étendre `modules/geodata/independance.test.ts` pour refuser toute constante exportée de type tableau de libellés
  dans `geodata-model`.

**Effort.** M.

### B8 — D-GD-29 : autres référentiels et catalogues dans le code — **Moyenne**

Classés du plus au moins net :

1. **`apps/api/src/data/*.json`** (hors GeoData, mais visé par la règle générale « aucun référentiel… ni catalogue codé
   en dur ») :
   - `building-library.json` (1,28 Mo : 10 profils, 21 cas, références) ;
   - `harmony-engine.json` (69 règles) ;
   - `programme-repartition.json` (« valeurs de référence de programmation ») ;
   - `harmonie-profiles.json`, `parcours-forms.json`, `parcours-steps.json` ;
   - les exemples `examples/p118-*.json`.

   Ils sont lus au chargement du module (`data/parcours.ts:58-161,260-261`) et servis par l'API sans passer par une
   base dédiée ni une archive. `building-library.json` contient « Casablanca-Settat ».

   **Gravité Moyenne.** Le maître d'ouvrage doit arbitrer si les étapes et les formulaires relèvent de la
   configuration produit, ce qui est admissible. En revanche, la bibliothèque, Harmony et la répartition de programme
   sont des catalogues de données.
2. **`TABLEAUX_DOUARS`** (`apps/web/src/modules/geodata/panneaux/FicheTerritoriale.tsx:220-235`) : dictionnaire des
   variables HCP (colonne technique → libellé HCP, unité). Le commentaire les présente comme « libellés d'interface ».
   Il s'agit pourtant de métadonnées de la source, qui devraient venir de l'annexe (`geodata_concepts` ou d'un
   dictionnaire de colonnes de la fiche). **Faible à Moyenne.**
3. **Correspondances FeenWay** (`packages/geodata-model/src/prix/agregats-publies.ts:57-81`) : `ENTETES_FEENWAY` et
   `CORRESPONDANCE_TYPES_FEENWAY` sont des tables de correspondance propres à une source, codées en dur alors que le
   dépôt a un dossier `docs/geodata/sources/correspondances/` archivé. **Faible.**
4. **Priorité HCP en SQL** (`routes/geodata/consultation.ts:125`) : `ORDER BY (s.producteur LIKE 'Haut-Commissariat au
   Plan%') DESC`. La règle de priorité dépend du nom d'un producteur. Recommandation : une colonne
   `geodata_sources.priorite_recherche smallint` renseignée par la fiche. **Faible.**

**Contrôle négatif (vérifié).** Recherche des 12 régions et des grandes villes du Maroc et de statistiques (population
totale, « 75 provinces », « 12 régions ») dans `apps/web/src`, `apps/api/src` et `packages/*/src`, hors tests, i18n et
`data/*.json` : **aucune occurrence**. `apps/web/public/parcelle/index.html` (prototype de 966 Ko) ne contient que des
définitions de systèmes de coordonnées et des noms de formats WKT : ce sont des constantes techniques. Les données
sources (106 Mo dans `docs/geodata/sources`) sont livrées avec le code et copiées dans `dist/geodata-sources`
(`geodata-reference.ts:21-24`) pour l'import. C'est conforme si l'on considère ce dossier comme le canal des « sources
qualifiées » ; l'image de l'API transporte néanmoins des données (**à acter**).

**Effort.** M pour les points 2 à 4, L pour le point 1.

### B9 — Systèmes de coordonnées Maroc : Merchich partiel, défini deux fois — **Faible**

**Constat.**
- Seul EPSG:26191 (Merchich / Nord Maroc) est pris en charge :
  `apps/api/src/lib/site-context.ts:28-32` et `lib/parcel-transmission.ts:26`.
- La définition proj4 est copiée à l'identique dans `apps/web/public/parcelle/index.html` (`+towgs84=31,146,47`, 3
  paramètres, `clrk80ign`).
- EPSG:26192 (Sud Maroc), 26194 et 26195 (zones du Sahara) ne sont pas proposés. Parcelle avertit « zone Nord utilisée
  comme hypothèse, à confirmer » (`index.html:861`).
- Les conversions de parcelles se font en JS (proj4) ; GeoData ne reprojette jamais. PostGIS ne sert qu'au passage en
  3857 pour les tuiles.

**Hypothèse.** La transformation à 3 paramètres donne une précision de l'ordre de quelques mètres. Elle suffit pour une
esquisse, pas pour un rattachement cadastral. Une parcelle en zone Sud convertie avec 26191 serait fausse.

**Recommandation.**
- Définir une source unique des systèmes de coordonnées (paquet partagé) : 26191, 26192, 26194 et 26195, plus 2154.
- Contrôle de cohérence : refuser une conversion dont le résultat sort de l'emprise de la zone.
- Documenter la précision de la transformation dans les métadonnées de la parcelle (`transformations`, comme
  `geodata_versions.transformations`).
- Test croisé proj4 / `ST_Transform` (PostGIS `spatial_ref_sys` 26191) sur des points de contrôle.

**Effort.** S.

### B10 — Index et mémoire — **Faible**

**Constat.**
- `geodata_indicateurs` n'a aucun index sur `couche_id` (`init.sql:3031-3041` ; aucun index trouvé). Il est filtré par
  `couche_id` dans la fiche d'objet et `indicateursDe` (`consultation.ts:437-441`). La couche « royaume » porte
  670 indicateurs.
- Le cache raster en mémoire garde jusqu'à 12 grilles de 4 millions de cellules en Float32
  (`consultation.ts:280-292`, `init.sql:3227`), soit **~192 Mo par processus** au pire.

**Recommandation.**

```sql
CREATE INDEX IF NOT EXISTS geodata_indicateurs_couche_idx ON geodata_indicateurs (couche_id, ordre);
```

Borner le cache raster en octets plutôt qu'en nombre de grilles.

**Effort.** XS.

### B11 — Taille des contours renvoyés — **Faible**

**Constat.**
- `GET /territoires/.../unites/:code` renvoie le contour complet en `ST_AsGeoJSON(t.geom, 6)` (`territoires.ts:82`) :
  jusqu'à 141 Ko pour une région HCP, 211 Ko pour une commune OSM (mesures sur les sources).
- `prix/officielles/zones/:id` renvoie `ST_AsGeoJSON(z.geom)`, 9 décimales par défaut (`prix.ts:553`).

**Recommandation.**
- Renvoyer le contour seulement sur demande (`?contour=1`), puisque la carte dispose déjà des tuiles.
- `ST_AsGeoJSON(z.geom, 6)` pour les zones de prix.
- `Cache-Control` avec ETag égal à l'identifiant de version, celle-ci étant immuable.

**Effort.** S.

---

## Hypothèses à confirmer

| Réf. | Hypothèse | Comment la confirmer |
|---|---|---|
| A1 | Ensembles du compte A poussés vers le compte B | Scénario e2e : A modifie un ensemble hors ligne, se déconnecte ; B se connecte. |
| A4 | Faux conflit 409 sur rejeu de `stepPatch` après un succès | Test d'API avec réponse perdue. |
| A8 | Onglet ancien bloqué sur une connexion Dexie fermée | Deux onglets, montée de version Dexie. |
| B2 / B3 | Gains de performance | `EXPLAIN (ANALYZE, BUFFERS)` sur la préproduction : tuile z=6 de la couche communes, proximité avec 20 couches. |
| B9 | Précision de la transformation à 3 paramètres | Points de contrôle géodésiques de l'ANCFCC. |
