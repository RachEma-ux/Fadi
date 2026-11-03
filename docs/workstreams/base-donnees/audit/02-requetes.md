# Audit 02 — Requêtes et accès aux données (apps/api/src)

- Dépôt : `/home/claude/fadi` (HEAD b9d9897, 2026-11-02). Audit en lecture seule, aucun fichier du dépôt modifié.
- Pile : Express 5.1, `pg` Pool (options par défaut), Drizzle ORM 0.45, PostgreSQL 16 + PostGIS 3.4 (image `postgis/postgis:16-3.4`, `docker-compose.yml`).
- Référentiel appliqué : `expert-bases-de-donnees/references/optimisation-requetes.md` (EXPLAIN, patterns N+1 / OFFSET / SELECT *, index composites, prédicats non sargables, transactions courtes). Ce référentiel ne couvre pas Drizzle : les principes généraux ont été transposés.
- Méthode : lecture du code (routes, lib, middleware, db) et recoupement systématique des index avec `db/init.sql`.
- **Limite.** Les plans d'exécution n'ont pas pu être mesurés. Une tentative d'`EXPLAIN ANALYZE` sur données synthétiques a été lancée dans une transaction annulée (`ROLLBACK`). Elle visait une instance PostgreSQL temporaire déjà présente dans le bac à sable, que je n'avais pas créée. Cette instance s'est arrêtée (PANIC `pg_control: Permission denied` : le répertoire parent `/tmp/claude-0` a perdu son droit de traversée), puis a disparu. Mes insertions n'ont pas été validées. Toutes les estimations de coût ci-dessous sont donc **analytiques**, sauf mention contraire. Chaque constat donne la commande `EXPLAIN` à lancer.

Convention : **[Vérifié]** signifie constaté dans le code ou le DDL. **[Hypothèse]** signifie inféré et à confirmer par mesure.

---

## 1. Synthèse

Le socle est sain sur plusieurs points :

- les écritures métier critiques passent par des transactions courtes avec verrou de ligne du projet (`lockProject` → `SELECT … FOR UPDATE`) ;
- des verrous consultatifs sont utilisés (`pg_advisory_xact_lock`) ;
- l'idempotence repose sur des index uniques (`request_id`) ;
- la file de courriels utilise `FOR UPDATE SKIP LOCKED` ;
- les compteurs critiques sont atomiques (`failed_login_count + 1`, `totp_last_step` en compare-and-set, codes de secours en `UPDATE … WHERE used_at IS NULL RETURNING`) ;
- la recherche de session passe par un index unique (`sessions_token_hash_unique`) ;
- **aucune injection SQL exploitable n'a été trouvée** : toutes les interpolations portent sur des constantes ou des valeurs mises en liste blanche.

Les risques principaux sont ailleurs :

1. **Le pool de connexions.** Un seul `Pool` aux options par défaut : `max` = 10, attente de connexion **infinie**, pas de `statement_timeout`, pas d'`idle_in_transaction_session_timeout`, pas d'`application_name`, pas de gestionnaire `pool.on('error')`. Plusieurs chemins consomment ce pool en rafale :
   - `chargerModele` lance 8 requêtes en `Promise.all` sur le pool ;
   - le canal temps réel revalide **toutes** les connexions WebSocket toutes les 2 s (2 requêtes ou plus par connexion) ;
   - la cloche de notifications, appelée chaque minute par chaque onglet, exécute environ 20 requêtes, dont des balayages non bornés.

   Sous charge, les requêtes HTTP attendent indéfiniment une connexion.
2. **Les fichiers binaires stockés en base.** Il y a des colonnes `bytea` dans 6 tables, jusqu'à 25 Mo par fichier. Ils sont lus entiers en mémoire Node, et l'export d'archive charge tous les fichiers d'un projet d'un coup. Le ramasse-miettes des volumes (`nettoyerVolumes`) tourne **dans la requête `DELETE /projects/:id`** : il verrouille 6 tables contre l'écriture et relit l'intégralité de 5 colonnes jsonb de toute la base.
3. **Des lectures surdimensionnées sur les chemins chauds.** `loadProjectAccess` (279 appels, sur chaque route de projet) et `GET /projects` relisent la ligne `projects` entière, avec ses gros jsonb (`harmony`, `programme_state`, `source_attachment`, qui contient un cas de programme d'exemple d'environ 400 Ko). `resolveSession` relit la ligne `users` entière à chaque requête.
4. **Des N+1 sur les vues agrégées.** `/com/boite` exécute O(projets + 4 × conversations) requêtes. La cloche exécute jusqu'à 40 requêtes dans une boucle. L'accusé d'ouverture d'un fil insère un reçu par message, jusqu'à 500 aller-retours dans une transaction. On trouve aussi `loadProjectAccess` appelé en boucle dans 4 fichiers.
5. **Une croissance non bornée.** Chaque révision Studio stocke le document complet **deux fois** (`document` et `response.revision.document`). Rien ne purge `sessions`, `mail_outbox`, `atelier_commands` ni `com_*`.
6. **Quelques courses de type lecture puis écriture sans condition**, sur les verrous d'édition et les verrous fins de l'Atelier.

Index manquants identifiés (détails au §4) :

- `com_messages(author_id)` ;
- `atelier_commands(author_id, project_id)` et `atelier_commands(project_id, created_at)` ;
- `atelier_locks(author_id)` ;
- `studio_revisions(variant_id, created_at)` ;
- `drawing_exports(created_by, created_at)` ;
- `sessions(expires_at)`, pour la purge ;
- trigrammes sur `geodata_objets.nom` ;
- éventuellement GiST composite `(couche_id, geom)`.

---

## 2. Chemins chauds

| Endpoint / tâche | Fréquence [Vérifié dans le code client ou serveur] | Requêtes par appel | Coût / risque estimé |
|---|---|---|---|
| `attachUser` → `resolveSession` (`middleware/require-auth.ts:20`, `lib/auth.ts:139-179`) | **Chaque requête HTTP** après `/version`, fichiers statiques compris quand `WEB_DIST` est servi (monté après `attachUser`, `app.ts:60` puis `app.ts:116`) | 1 `SELECT sessions ⋈ users` par index unique `token_hash`, plus 1 `UPDATE sessions` au plus une fois par minute | Faible par appel (index unique + PK). Mais `users.*` est relu en entier (jsonb `atelier_ensembles`, `notification_preferences`) et chaque fichier statique coûte une requête. Voir F-05. |
| `projectOr404` → `loadProjectAccess` (`lib/owned-project.ts:137`) | **Chaque route de projet** (279 appels dans routes/ et lib/) | 1 requête : `projects` en LEFT JOIN sur la vue `project_effective_access` (UNION ALL + GROUP BY) + sous-requête corrélée `portees`, plus 1 requête support si aucun rôle | Moyen. Ligne `projects` entière avec tous ses jsonb (F-05). La vue est filtrée par `project_id` et `user_id` ; le prédicat devrait être poussé dans la branche agrégée [Hypothèse, voir EXPLAIN F-05]. |
| `GET /projects` (`routes/projects.ts:79`) | Ouverture de l'application, invalidations | 2 à 3 requêtes, **sans LIMIT**, `SELECT projects.*` | Élevé pour un compte avec beaucoup de projets ou des projets d'exemple (jsonb volumineux sérialisés). Voir F-05. |
| `GET /projects/:id` (`routes/projects.ts:131`) | **Toutes les 60 s** par onglet (`ProjectShell.tsx:36`, `dossier-data.ts:12`) | 4 à 5 requêtes : accès, courriel du propriétaire, `step_files` du projet sans `content`, organisation | Moyen : la ligne projet complète est renvoyée au client chaque minute. |
| `GET /notifications` (`routes/notifications.ts:96-520`) | **Toutes les 60 s** par onglet connecté (`NotificationBell.tsx:119`) | Environ 20 requêtes, + jusqu'à 40 dans la boucle « péremption » (`:393`), + `reviewNotifications` (N+1 `loadReviewAccess`, F-07) | **Élevé** : plusieurs balayages non bornés, jsonb `effets` relus sur tout l'historique de l'auteur, index manquants (F-03). |
| `GET /com/boite` (`routes/com.ts:917-961`) | Ouverture de la page Boîte et invalidations | 1 + Σprojets (1 à 2 accès + 1 conversations + `lireDemandes`) + Σconversations (participants + lecture + messages LIMIT 200 + reçus) | **Élevé** : N+1 imbriqué, linéaire en nombre de conversations (F-04). |
| Atelier : `chargerModele(db, …)` (`lib/atelier-modele.ts:31-44`, 22 appels avec `db`) | Ouverture et actions de l'Atelier | 1 + **8 requêtes en `Promise.all`** sur le pool | **Élevé pour le pool** : un seul appel occupe jusqu'à 8 des 10 connexions (F-01). |
| Studio : `POST …/commands` (`lib/studio-commands.ts:704-806`) | Chaque geste d'édition Studio | Transaction : verrou projet, verrou participations, étude, variante `FOR UPDATE`, contexte (accès + 3 SELECT), rejeu, contrôle de chemin, INSERT révision (document **×2**), UPDATE tête, événement | Moyen par appel, mais le verrou du projet est tenu pendant le calcul géométrique côté Node, et l'écriture est volumineuse (F-09, F-10). |
| Studio : lecture d'une variante (`readStudioContext`, `:156`) et sondage de la tête (`AvisRevision.tsx`, 30 s) | Chaque ouverture ; sondage `listStudioVariants` toutes les 30 s | 4 requêtes (accès, étude, variante, révision avec `document` jsonb) | Moyen : le document complet est détoasté à chaque ouverture. |
| WebSocket : `revalider()` (`lib/temps-reel-hub.ts:145`, `temps-reel-canal.ts:109`) | **Toutes les 2 s**, toutes les connexions (`BORNES_TEMPS_REEL.revalidationMs = 2000`) | Par connexion : `resolveSession` (1 à 2) + `loadProjectAccess` (1 à 2), en **`Promise.all` sur toutes les connexions** | **Élevé** : 200 connexions donnent environ 400 requêtes simultanées toutes les 2 s, soit environ 200 requêtes/s, qui saturent le pool de 10 (F-02). |
| Tâche minute temps réel (`temps-reel-canal.ts:110-117`) | 60 s | `toucherActivite` UPDATE + `sessionsAExpirer` (LIMIT 1000, filtre JS) + 1 transaction par session expirée | Faible. |
| Tuiles MVT `GET /geodata/api/tuiles/:c/:z/:x/:y` (`routes/geodata/consultation.ts:147`) | Rafales (limite 3000/min/IP) | `espacePersonnel` : **INSERT ON CONFLICT** + SELECT, puis `coucheConsultable` (3 jointures), puis MVT | Moyen à élevé : une écriture tentée à chaque tuile ; filtre spatial sur un index GiST qui ne contient pas `couche_id` (F-12). |
| Courriels `processMailOutbox` (`lib/mailer/outbox.ts:49`) | 5 s | Jusqu'à 100 transactions séquentielles, **envoi SMTP dans la transaction** | Moyen : une connexion est tenue pendant la latence SMTP (F-10). |

---

## 3. Constats

### F-01 — Pool `pg` aux options par défaut, sans délai, sans garde-fous serveur, sans gestion d'erreur
**Gravité : Élevée**

**Constat [Vérifié]**

- `apps/api/src/db/client.ts:13` crée le pool sans aucune option :
  ```ts
  return new Pool({ connectionString });
  ```
  Avec `pg` 8, cela donne `max` = 10, `idleTimeoutMillis` = 10 s et `connectionTimeoutMillis` = 0, c'est-à-dire une **attente infinie** d'une connexion libre.
- Aucune occurrence de `statement_timeout`, `idle_in_transaction_session_timeout`, `application_name` ni `connectionTimeoutMillis` dans `apps/api/src`. Aucun réglage non plus dans `docker-compose.yml` (pas de `command: postgres -c …`).
- Aucun `pool.on("error", …)` dans le code. Avec node-postgres, une erreur sur un client **inactif** du pool (redémarrage de PostgreSQL, coupure réseau) est émise sur le pool. Sans écouteur, Node lève une exception non gérée et le processus s'arrête.
- Il y a un seul pool applicatif (`db/client.ts`), ce qui est correct. Les autres `new Pool` sont dans des scripts CLI : `db/migrate.ts:18`, `db/volumes-gc.ts:14`, `db/geodata-role.ts:19` et `db/geodata-reference.ts` (lignes 266, 298, 345, 383, 419, 522). Ces derniers ouvrent plusieurs pools successifs dans le même processus (`--prix-sources` à `:383`, puis `pre` à `:419`, puis `:522`), chacun de 10 connexions au plus. L'API lance `geodata-reference` comme **processus enfant** au démarrage (`lib/geodata/import-auto.ts:64`), qui consomme donc des connexions en plus de l'API.
- Vérification `pool.connect()` et `release()` : les 6 usages applicatifs libèrent tous dans un `finally` (`lib/volumes-gc.ts:127`, `lib/geodata/acces.ts:32`, `db/bascule.ts:121`, `db/geodata-reference.ts:132/328/350/583`). **Pas de fuite constatée.**
- Arrêt du processus (`server.ts:113`) :
  ```ts
  process.once("SIGTERM", () => { arreterTempsReel(); arreterImportAuto(); setTimeout(() => process.exit(0), 200); });
  ```
  Il n'y a ni `server.close()` ni `pool.end()`. Les requêtes en cours sont coupées après 200 ms ; PostgreSQL annule leurs transactions, ce qui ne pose pas de problème de cohérence mais renvoie des 5xx aux clients pendant un déploiement. Rien n'écoute SIGINT.
- Amplificateurs de consommation du pool :
  - `lib/atelier-modele.ts:35-44` : `Promise.all` de 8 `q.select()` avec `q = db`, utilisé dans 22 appels `chargerModele(db, …)`. Une requête de l'Atelier prend jusqu'à 8 des 10 connexions ;
  - la revalidation WebSocket (F-02).

**Impact**

- Sous charge modeste (2 ouvertures d'Atelier simultanées, ou une centaine de connexions WebSocket), toutes les requêtes HTTP sont mises en file **sans limite de temps** : latence non bornée, sonde `/health` en échec (elle a son propre délai de 3 s, `app.ts:104`), effet de cascade.
- Une requête pathologique (tuile lourde, recherche `LIKE '%x%'`, export) n'est jamais interrompue côté serveur.
- Une transaction laissée ouverte (exception entre BEGIN et COMMIT dans un code futur) n'est jamais nettoyée.
- `pg_stat_activity` ne distingue pas l'API, le processus d'import enfant et les scripts, car il n'y a pas d'`application_name`.

**Recommandation**

```ts
// BEFORE (db/client.ts:13)
return new Pool({ connectionString });

// AFTER
const pool = new Pool({
  connectionString,
  max: Number(process.env["PG_POOL_MAX"] ?? 20),          // size against max_connections / replicas
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,                          // fail fast -> 503 instead of infinite queue
  application_name: process.env["PG_APP_NAME"] ?? "fadi-api",
  statement_timeout: Number(process.env["PG_STATEMENT_TIMEOUT_MS"] ?? 15_000),
  idle_in_transaction_session_timeout: 30_000,
  // query_timeout is client-side; statement_timeout is enough server-side
});
pool.on("error", (err) => {
  console.error(JSON.stringify({ level: "error", message: "pg_pool_idle_client_error", detail: err.message }));
});
return pool;
```

- Pour les routes longues légitimes (exports, imports GeoData), utiliser `SET LOCAL statement_timeout = '120s'` dans leur transaction.
- Fixer aussi les valeurs côté rôle, comme filet de sécurité :
  ```sql
  ALTER ROLE fadi_app SET statement_timeout = '15s';
  ALTER ROLE fadi_app SET idle_in_transaction_session_timeout = '30s';
  ALTER ROLE fadi_app SET lock_timeout = '5s';
  ```
- `chargerModele` : remplacer `Promise.all` sur `db` par une exécution sur **une seule connexion** (transaction `REPEATABLE READ READ ONLY`, ce qui donne aussi un instantané cohérent des 8 tables), ou par une requête unique :
  ```ts
  // BEFORE
  const charge = await chargerModele(db, projectId);
  // AFTER — one connection, consistent snapshot
  const charge = await db.transaction((tx) => chargerModele(tx, projectId), { isolationLevel: "repeatable read", accessMode: "read only" });
  ```
  Avec un `tx`, les 8 requêtes du `Promise.all` sont sérialisées par la connexion unique : moins de parallélisme, mais pas de famine du pool.
- Arrêt propre :
  ```ts
  const stop = () => {
    arreterTempsReel(); arreterImportAuto();
    server.close(() => void pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  ```

**Vérification**

- Pendant un test de charge :
  ```sql
  SELECT application_name, state, wait_event_type, count(*) FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1,2,3;
  ```
- Côté Node, journaliser `pool.waitingCount` et `pool.totalCount` dans la surveillance (`studio-surveillance`).
- `SHOW statement_timeout;` depuis une connexion de l'API.

**Effort** : faible (0,5 j), plus 0,5 j pour `chargerModele` et ses 22 appels.

---

### F-02 — Le canal temps réel revalide toutes les connexions toutes les 2 s, en parallèle, une requête par connexion
**Gravité : Élevée**

**Constat [Vérifié]**

- `lib/temps-reel-protocole.ts:31` fixe `revalidationMs: 2_000`, et `lib/temps-reel-canal.ts:109` déclenche :
  ```ts
  setInterval(() => void hub.revalider(), BORNES_TEMPS_REEL.revalidationMs)
  ```
- `lib/temps-reel-hub.ts:145-146` :
  ```ts
  async revalider(filtre = () => true) {
    await Promise.all([...this.connexions].filter(filtre).map((c) => this.revaliderUne(c)));
  ```
- `revaliderUne` (`:245-266`) appelle `verifierCompte`, c'est-à-dire `resolveSession` (SELECT sessions ⋈ users, plus un UPDATE au plus une fois par minute). Si la connexion est dans une salle, elle appelle aussi `verifierAcces`, c'est-à-dire `loadProjectAccess` (1 à 2 requêtes).
- La seule déduplication porte sur la connexion (`c.revalidation`). Deux connexions du même compte ou du même projet donnent deux lectures.

**Impact**

- Pour C connexions, cela fait environ 2C requêtes toutes les 2 s, toutes lancées en même temps. Avec le pool de 10 (F-01), 100 connexions produisent 200 requêtes en file, chaque cycle.
- Les requêtes HTTP sont mises en concurrence avec ce trafic de fond, sans délai d'attente.
- [Hypothèse] Avec 20 connexions par compte au plus (`connexionsParCompte`) et 50 participants par session, une seule séance de revue nombreuse suffit à dégrader l'API.

**Recommandation**

Regrouper les relectures par cycle : une requête pour toutes les sessions de compte, une requête pour tous les couples (projet, compte).

```ts
// AFTER (sketch) — one query for all tokens, one for all (project,user) pairs
const hashes = [...new Set(conns.map((c) => sha256Hex(c.jeton)))];
const sess = await db.select({ h: sessions.tokenHash, userId: sessions.userId, sid: sessions.id, /* explicit cols */ })
  .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
  .where(inArray(sessions.tokenHash, hashes));
```

```sql
-- access for N (project,user) pairs in one round-trip
SELECT x.project_id, x.user_id, pea.role
  FROM unnest($1::text[], $2::text[]) AS x(project_id, user_id)
  LEFT JOIN project_effective_access pea ON pea.project_id = x.project_id AND pea.user_id = x.user_id;
```

- Les signaux (`signal()`, `temps-reel-hub.ts:150`) invalident déjà les droits à la demande. On peut porter l'intervalle périodique à 15 ou 30 s, en gardant la relecture immédiate sur signal ou sur `LISTEN/NOTIFY` émis par les routes d'accès.
- Borner la concurrence, par exemple avec `p-limit(4)`, si le regroupement est différé.

**Vérification**

- `pg_stat_statements` : `calls` de la requête `sessions ⋈ users` rapporté au nombre de connexions WebSocket, avant et après.
- `EXPLAIN (ANALYZE, BUFFERS)` de la requête `unnest … LEFT JOIN project_effective_access` avec 200 couples.

**Effort** : moyen (1 à 2 j, tests du hub compris).

---

### F-03 — `GET /notifications` (sondé toutes les 60 s) : environ 20 requêtes, balayages non bornés, N+1 et index manquants
**Gravité : Élevée**

**Constat [Vérifié]** (`routes/notifications.ts`, client `NotificationBell.tsx:119`, `refetchInterval: 60_000`)

| Ligne | Requête | Problème | Index existant |
|---|---|---|---|
| `:105-110` | `project_effective_access ⋈ projects ⋈ project_members` | `SELECT projects.*` (`project: projects`) sans LIMIT : tous les jsonb de chaque projet partagé | — |
| `:195` `:201-204` | `locked` : `projects WHERE owner_id = $1 OR id IN (…)` | Deuxième lecture des mêmes projets | `projects_owner_id_idx` |
| `:345` | `miens` : `atelier_commands WHERE project_id IN (…) AND author_id = $me` | **Tout l'historique** de l'auteur (aucune borne de date), avec `effets` jsonb ; parcours en JavaScript | `atelier_commands_project_rev_idx (project_id, result_revision)` : `author_id` est filtré après lecture |
| `:353-360` | `autres` : `… AND author_id <> $me AND created_at > $since ORDER BY created_at DESC LIMIT 200` | Tri sur `created_at` sans index adapté | Aucun index `(project_id, created_at)` |
| `:385-391` | `drawing_exports WHERE project_id IN (…) AND created_by = $me AND created_at > $since` | Pas de LIMIT | `drawing_exports_project_idx (project_id)` seulement |
| `:393-400` | **Boucle** : 1 requête `atelier_commands` par export (jusqu'à 40) | **N+1** | `(project_id, result_revision)` : correct pour cette requête |
| `:417-421` | `atelier_locks WHERE author_id = $me AND expires_at > now()` | — | PK `(project_id, cle)` : **aucun index sur `author_id`**, donc balayage séquentiel |
| `:470` | `com_conversations ⋈ projects WHERE project_id IN (…)` | Toutes les conversations, sans LIMIT | `com_conversations_project_idx` |
| `:472` | `SELECT DISTINCT conversation_id FROM com_messages WHERE author_id = $me` | **Balayage séquentiel de `com_messages`** : le seul index sur `author_id` est l'unique **partiel** `WHERE client_request_id IS NOT NULL` (`init.sql:2733`), inutilisable ici | **Manquant** |
| `:465` | `reviewNotifications` → `accessiblePackageIds` (`lib/reviews-core.ts:80-84`) | N+1 : `loadReviewAccess` par paquet | — |
| `:148-155` | `admin.audit_log WHERE action = 'support.accessed' AND target_type = 'project' AND created_at > $since` | Correct : `audit_log_action_idx (action text_pattern_ops, id)` sert l'égalité | OK |

**Impact**

- Coût linéaire en nombre de projets et d'historiques, multiplié par le nombre d'onglets ouverts. Pour U utilisateurs connectés, cela fait environ U/60 × 20 à 60 requêtes par seconde de fond.
- Les balayages de `com_messages` et `atelier_locks` grossissent avec la base entière, pas avec le compte.

**Recommandation**

1. Index ciblés (construits en `CONCURRENTLY`, hors transaction : à placer dans un script séparé, car `init.sql` est joué en un seul `query`) :
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS com_messages_author_conv_idx ON com_messages (author_id, conversation_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS atelier_commands_author_project_idx ON atelier_commands (author_id, project_id, result_revision);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS atelier_commands_project_created_idx ON atelier_commands (project_id, created_at DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS atelier_locks_author_idx ON atelier_locks (author_id, expires_at);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS drawing_exports_author_idx ON drawing_exports (created_by, created_at DESC);
   ```
2. Borner `miens` dans le temps et ne lire que les identifiants. Exemple : les objets touchés par mes commandes sur 90 jours, puis une semi-jointure SQL au lieu du parcours JavaScript :
   ```sql
   -- AFTER: "others modified my objects" computed in SQL
   WITH mine AS (
     SELECT c.project_id, o.obj, max(c.result_revision) AS rev
       FROM atelier_commands c, LATERAL jsonb_array_elements_text(c.effets->'crees' || c.effets->'modifies') AS o(obj)
      WHERE c.author_id = $1 AND c.project_id = ANY($2) AND c.created_at > now() - interval '90 days'
      GROUP BY 1, 2)
   SELECT a.id, a.project_id, a.label, a.result_revision, a.created_at, count(*) AS touched
     FROM atelier_commands a
     JOIN LATERAL jsonb_array_elements_text(a.effets->'modifies' || a.effets->'supprimes') AS t(obj) ON true
     JOIN mine m ON m.project_id = a.project_id AND m.obj = t.obj AND m.rev < a.result_revision
    WHERE a.project_id = ANY($2) AND a.author_id <> $1 AND a.created_at > $3
    GROUP BY 1,2,3,4,5 ORDER BY a.created_at DESC LIMIT 40;
   ```
3. Remplacer la boucle « péremption » (`:393`) par une requête `LATERAL` unique :
   ```sql
   SELECT x.id, x.file_name, x.model_revision, p.rev, p.label, p.created_at, u.email
     FROM unnest($1::text[], $2::text[], $3::int[], $4::timestamptz[]) AS x(id, project_id, model_revision, created_at)
     CROSS JOIN LATERAL (
       SELECT c.result_revision AS rev, c.label, c.created_at, c.author_id
         FROM atelier_commands c
        WHERE c.project_id = x.project_id AND c.author_id <> $5 AND c.result_revision > x.model_revision AND c.created_at > x.created_at
        ORDER BY c.result_revision LIMIT 1) p
     JOIN users u ON u.id = p.author_id;
   ```
4. Projeter les colonnes : `{ id, code, name, editingLock }` au lieu de `project: projects` (`:106`), et fusionner `locked` avec `memberships`.
5. Côté produit : passer le sondage à 120 s quand l'onglet est caché (`refetchIntervalInBackground: false`), ou pousser l'invalidation par le canal WebSocket existant.

**Vérification**

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT DISTINCT conversation_id FROM com_messages WHERE author_id = 'u_x';
EXPLAIN (ANALYZE, BUFFERS) SELECT project_id, effets, result_revision FROM atelier_commands WHERE project_id = ANY($1) AND author_id = $2;
EXPLAIN (ANALYZE, BUFFERS) SELECT 1 FROM atelier_locks WHERE author_id = $1 AND expires_at > now();
```

On attend un `Seq Scan` avant correction et un `Index Scan` ou `Index Only Scan` après. Mesurer le nombre total d'appels d'un `GET /notifications` avec `pg_stat_statements_reset()` puis un seul appel.

**Effort** : moyen (2 j).

---

### F-04 — `/com/boite` : N+1 imbriqué (projets × conversations)
**Gravité : Élevée**

**Constat [Vérifié]** (`routes/com.ts:917-958`)

```ts
for (const r of ids.rows) { const a = await loadProjectAccess(r.id, userId); ... }          // :920
for (const access of await mesProjets(userId)) {
  const convs = await db.select().from(comConversations).where(eq(comConversations.projectId, access.id));   // :928
  for (const conv of convs) {
    const parts = await participationsDe(conv.id);                                           // :930
    const [lu] = await db.select(...).from(comReads)...                                       // :934
    const msgs = await db.select(...).from(comMessages)... .limit(200);                       // :936
    const recus = msgs.length ? await db.select().from(comReceipts)... : [];                  // :939
  }
  for (const d of await lireDemandes(access.id, userId, access.role)) { ... }                 // :954
}
```

Pour P projets et C conversations, cela fait environ 1 + 2P + P×(1 + lireDemandes) + 4C requêtes **séquentielles**, et jusqu'à 200 messages par conversation, avec leur corps, relus pour au plus 200 éléments renvoyés.

**Impact**

La latence est linéaire : par exemple 10 projets × 20 conversations font plus de 800 aller-retours, soit 1 à 4 s à environ 1 à 5 ms par requête. Le pool est occupé de façon séquentielle et l'impact reste raisonnable tant que l'endpoint n'est pas sondé (il ne l'est pas aujourd'hui).

**Recommandation**

1. Construire l'accès de tous les projets en une requête : `SELECT … FROM projects LEFT JOIN project_effective_access … WHERE project_id = ANY($ids)`. Exposer pour cela une variante `loadProjectAccessMany(projectIds, userId)` de `lib/owned-project.ts`.
2. Charger conversations, participants et lectures en trois requêtes `inArray` (le modèle existe déjà dans `notifications.ts:470-471`).
3. Lire les messages avec une **fenêtre par conversation** en une seule requête :
   ```sql
   SELECT * FROM (
     SELECT m.*, row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.created_at DESC) AS rn
       FROM com_messages m
      WHERE m.conversation_id = ANY($1) AND m.author_id <> $2 AND m.withdrawn_at IS NULL
        AND (m.ack_required OR $2 = ANY(m.mentions) OR m.created_at > $3)) s
    WHERE rn <= 200;
   ```
   Index utile : `com_messages_conversation_idx (conversation_id, created_at)` existe.

**Vérification** : `EXPLAIN (ANALYZE, BUFFERS)` de la requête fenêtrée, et `pg_stat_statements.calls` par appel de `/com/boite` avant et après.

**Effort** : moyen (1,5 j).

---

### F-05 — Lectures « ligne entière » sur les chemins chauds (projects.*, users.*), listes non bornées
**Gravité : Élevée**

**Constat [Vérifié]**

- `lib/owned-project.ts:139-140`, appelé sur **chaque route de projet** :
  ```ts
  .select({ project: projects, role: projectEffectiveAccess.role, ... })
  ```
  La table `projects` porte `harmony`, `programme_state`, `site_observations`, `site_context`, `source_attachment`, `parcel_transmission`, `editing_lock` (jsonb) et `parcel_footprint` (geography) (`init.sql:68-93`).
- `source_attachment` des projets d'exemple contient `programmeCase`, `roomResponses`, `dossierV62`… (`data/parcours.ts:405-420`). Le fichier `data/examples/p118-programme-case.json` pèse 404 Ko et `p118-harmony-dossier.json` 186 Ko. [Hypothèse] Une ligne projet d'exemple pèse des centaines de Ko en TOAST.
- `routes/projects.ts:80-92` (`GET /projects`) : `db.select().from(projects)` pour les projets possédés et `{ project: projects }` pour les projets partagés, **sans LIMIT**, sérialisés en JSON vers le client.
- `lib/auth.ts:140-145` (chaque requête) : `.select({ session: sessions, user: users })` relit `password_hash`, `totp_secret_enc`, `atelier_ensembles` (jusqu'à 100 ensembles × 700 identifiants, `routes/preferences.ts:14-23`) et `notification_preferences`.
- Autres listes sans LIMIT ou avec gros jsonb :

  | Emplacement | Requête | Volume |
  |---|---|---|
  | `lib/studio-commands.ts:251-256` (`listStudioRevisions`) | toutes les révisions d'une variante | croît d'une ligne par commande |
  | `routes/atelier-versions.ts:425` | `select()` sur `atelier_publications` | jsonb `documents`, `catalogues` |
  | `lib/studio-publications.ts:499`, `:507` | `select()` sur `studio_publications` | `package`, `manifest` |
  | `routes/atelier-commands.ts:473`, `:481` | `select()` sur `atelier_commands`, LIMIT 200 | `commands`, `inverse`, `reponse`, `effets`, pour trouver une seule cible d'annulation |
  | `routes/collaboration.ts:166` | `produced_documents` | petite table, OK |

**Impact**

- Détoastage et sérialisation de jsonb volumineux à chaque requête de projet (CPU PostgreSQL et Node, mémoire, réseau).
- `GET /projects` peut renvoyer plusieurs Mo pour un compte avec quelques projets d'exemple.
- Pas d'index-only scan possible.

**Recommandation**

```ts
// BEFORE (lib/owned-project.ts:140)
.select({ project: projects, role: projectEffectiveAccess.role, ... })
// AFTER — access check needs only identity, owner, lock, flags
export const projectAccessColumns = {
  id: projects.id, ownerId: projects.ownerId, code: projects.code, name: projects.name,
  editingLock: projects.editingLock, modelRevision: projects.modelRevision, organizationId: projects.organizationId,
  sourceExampleId: projects.sourceExampleId, exampleMode: projects.exampleMode, closedAt: projects.closedAt,
  createdAt: projects.createdAt, updatedAt: projects.updatedAt,
};
.select({ project: projectAccessColumns, role: projectEffectiveAccess.role, ... })
```

- Les routes qui ont besoin de `harmony` ou de `programme_state` les lisent explicitement.
- Ce changement demande d'adapter le type `AccessibleProject` ; c'est le plus gros du travail.
- `GET /projects` : projeter les colonnes de la carte projet et paginer par curseur `(created_at, id)`.
- `resolveSession` : sélectionner seulement les colonnes utilisées par `toSessionUser` et `sessionValid`.
- `cibleAnnulation` : ne lire que `id, kind, inverse_of, result_revision`.
- `listStudioRevisions` : ajouter `LIMIT` et un curseur, plus l'index :
  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_revisions_variant_created_idx ON studio_revisions (variant_id, created_at DESC, id DESC);
  ```

**Vérification**

```sql
EXPLAIN (ANALYZE, BUFFERS, SERIALIZE) SELECT p.* FROM projects p WHERE p.id = $1;   -- PG17+ ; sur PG16 : comparer "Execution Time" et octets via pg_column_size
SELECT id, pg_column_size(harmony) h, pg_column_size(source_attachment) sa, pg_column_size(programme_state) ps FROM projects ORDER BY sa DESC NULLS LAST LIMIT 10;
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id, pea.role FROM projects p LEFT JOIN project_effective_access pea ON pea.project_id = p.id AND pea.user_id = $2 WHERE p.id = $1;
```

Pour la dernière requête, vérifier que le prédicat `project_id = $1` est poussé dans la branche `GROUP BY` de la vue. Sinon, il y a un agrégat sur toutes les participations : le corriger avec une fonction SQL `project_access(project_id, user_id)` ou en réécrivant la vue en `LATERAL`. **[Hypothèse à mesurer]**

**Effort** : moyen (2 à 3 j, du fait du typage `AccessibleProject` et de ses usages).

---

### F-06 — Fichiers binaires en base (bytea) lus entiers en mémoire ; export d'archive non streamé
**Gravité : Élevée**

**Constat [Vérifié]** : 6 colonnes `bytea` de contenu.

| Table (init.sql) | Taille max | Écriture / lecture |
|---|---|---|
| `step_files.content` (`:176`) | 25 Mo (`routes/step-files.ts:30`) | `raw({ limit: 25 Mo })` puis INSERT ; téléchargement `db.select().from(stepFiles)` puis `res.end(row.content)` (`:106-118`) |
| `drawing_exports.content` (`:189`) | 25 Mo (`routes/documents.ts:176`) | idem |
| `volumes.content` (`:449`) | contenus de publications, pièces de revue (JSON 16 Mo en base64, `routes/reviews.ts:184`), pièces d'observation (12 Mo) | adressage par SHA-256, partagé |
| `com_pieces.content` (`:2798`) | 2 Mo | lecture par `select()` (`routes/com.ts:565`) |
| `geodata_fichiers.contenu` (`:3379`) | fichiers sources GeoData | archive au démarrage (`lancerImportAuto`) |
| `geodata_rasters.valeurs` (`:3224`) | jusqu'à 4 M cellules | `grilleDe` à chaque `raster/:id/valeur` [Hypothèse : relit tout le raster à chaque point, à vérifier dans `lib/geodata/raster.ts`] |

- `lib/project-archive.ts:97` : `q.select().from(stepFiles).where(eq(stepFiles.projectId, project.id))` charge **tous** les fichiers d'un projet en mémoire d'un coup, puis l'archive est construite en mémoire. Cette fonction est aussi appelée pour dériver une variante (`routes/atelier-versions.ts:244`, dans une transaction).

**Impact**

- La mémoire Node est en O(taille des fichiers) par requête concurrente. Plusieurs exports simultanés peuvent épuiser le tas.
- Chaque octet passe par le WAL, les sauvegardes et la réplication.
- Les PDF, images et KMZ déjà compressés sont soumis à une compression pglz inutile.
- [Hypothèse] Avec `max` = 10, quelques téléchargements de 25 Mo sur un lien lent gardent leur connexion le temps du transfert vers PostgreSQL, pas vers le client, car le buffer est complet avant `res.end`. L'effet est donc borné, mais la mémoire ne l'est pas.

**Recommandation**

- Cible : un stockage objet compatible S3 (ou un volume disque) adressé par SHA-256, comme `volumes` le fait déjà, avec seulement les métadonnées en base. Le GC devient un simple `DELETE` de métadonnées, puis un nettoyage asynchrone.
- En attendant :
  ```sql
  -- avoid useless pglz attempts on already-compressed blobs (affects new rows only)
  ALTER TABLE step_files       ALTER COLUMN content SET STORAGE EXTERNAL;
  ALTER TABLE drawing_exports  ALTER COLUMN content SET STORAGE EXTERNAL;
  ALTER TABLE volumes          ALTER COLUMN content SET STORAGE EXTERNAL;
  ALTER TABLE com_pieces       ALTER COLUMN content SET STORAGE EXTERNAL;
  ```
- Lire les gros fichiers par morceaux, ce qui permet un streaming `res.write` :
  ```sql
  SELECT substring(content FROM $2 FOR 1048576) FROM step_files WHERE id = $1;
  ```
- Archive : itérer les fichiers un par un (identifiants d'abord, puis contenu par fichier) et écrire l'archive en flux (zip streaming).

**Vérification**

```sql
SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) total, pg_size_pretty(pg_total_relation_size(reltoastrelid)) toast
  FROM pg_class WHERE relname IN ('step_files','drawing_exports','volumes','com_pieces','geodata_fichiers','geodata_rasters','studio_revisions','atelier_commands') ORDER BY pg_total_relation_size(oid) DESC;
SELECT attname, attstorage FROM pg_attribute WHERE attrelid = 'step_files'::regclass AND attname = 'content';
```

Côté Node, observer `process.memoryUsage().rss` pendant 5 exports d'archive simultanés.

**Effort** : élevé (5 à 8 j pour un stockage objet) ; faible (0,5 j) pour `SET STORAGE` et la lecture par morceaux.

---

### F-07 — Le ramasse-miettes des volumes tourne dans la requête `DELETE /projects/:id` et verrouille 6 tables
**Gravité : Élevée**

**Constat [Vérifié]**

- `routes/projects.ts:293` : `try { await nettoyerVolumes(pool); } catch …`, exécuté de façon synchrone avant de répondre 204.
- `lib/volumes-gc.ts:93` :
  ```ts
  await client.query("LOCK TABLE volumes, atelier_publications, studio_publications, review_packages, review_findings, studio_observations IN SHARE ROW EXCLUSIVE MODE");
  ```
  `SHARE ROW EXCLUSIVE` est incompatible avec `ROW EXCLUSIVE`, le verrou pris par INSERT, UPDATE et DELETE. **Toutes les écritures de ces 6 tables, tous projets confondus, sont bloquées** pendant le GC (le `lock_timeout` de 5 s ne protège que l'acquisition par le GC lui-même).
- `:107-110` : `SELECT "<colonne>" FROM "<table>" WHERE … IS NOT NULL` pour les 5 colonnes jsonb de référence, **sur toute la base**, puis le parcours se fait en JavaScript (`chainesDe`).
- `:113` : `SELECT id, size FROM volumes`, sans LIMIT.
- Les requêtes `information_schema` (`:95-106`) sont relancées à chaque fois.

**Impact**

- La durée est en O(taille totale des publications, revues et observations), et elle est payée à chaque suppression de projet.
- Pendant ce temps : arrêt des écritures Studio (observations, publications), des revues et des publications de l'Atelier pour **tous** les utilisateurs.
- Mémoire Node en O(jsonb total).

**Recommandation**

1. Sortir le GC du chemin de requête : le planifier dans les tâches de fond (`startAccountWorkers`), par exemple chaque nuit, ou déclencher une tâche asynchrone après la suppression.
2. Remplacer le relevé en JavaScript par une table de références tenue dans les mêmes transactions que les écritures, avec une vraie FK :
   ```sql
   CREATE TABLE volume_refs (
     volume_id text NOT NULL REFERENCES volumes(id) ON DELETE RESTRICT,
     owner_table text NOT NULL, owner_id text NOT NULL,
     PRIMARY KEY (volume_id, owner_table, owner_id)
   );
   CREATE INDEX volume_refs_owner_idx ON volume_refs (owner_table, owner_id);
   -- GC then becomes an anti-join, no table lock needed:
   DELETE FROM volumes v WHERE v.created_at < now() - interval '1 day'
     AND NOT EXISTS (SELECT 1 FROM volume_refs r WHERE r.volume_id = v.id);
   ```
3. À défaut, faire l'anti-jointure en SQL avec `jsonb_path_query` plutôt que de rapatrier les jsonb, et garder la fenêtre de grâce `created_at < now() - 1 jour`, qui évite de devoir verrouiller pour protéger les écritures en cours.

**Vérification**

```sql
BEGIN; SET LOCAL lock_timeout='1s';
EXPLAIN (ANALYZE, BUFFERS) SELECT documents FROM atelier_publications WHERE documents IS NOT NULL;   -- répéter pour les 5 tables
ROLLBACK;
-- pendant un DELETE /projects/:id : verrous en attente
SELECT pid, relation::regclass, mode, granted FROM pg_locks WHERE relation::regclass::text IN ('volumes','studio_observations','review_findings') ORDER BY granted;
```

**Effort** : faible (0,5 j) pour sortir le GC de la requête ; moyen (2 j) pour `volume_refs`.

---

### F-08 — N+1 secondaires (`loadProjectAccess` / `loadReviewAccess` en boucle, inserts en boucle)
**Gravité : Moyenne**

**Constat [Vérifié]**

| Emplacement | Code | Effet |
|---|---|---|
| `routes/preferences.ts:93` | `for (const l of lignes) if (await loadProjectAccess(l.id, userId)) …` | 1 à 2 requêtes par projet muet |
| `routes/atelier-versions.ts:222` | `for (const e of enfants) if (await loadProjectAccess(e.id, …))` | 1 à 2 requêtes par variante |
| `lib/reviews-core.ts:83` | `for (const id of …) if (await loadReviewAccess(id, userId, executor))` | 2 requêtes par paquet ; appelé par `lib/reviews-recipient.ts:73` et `:358`, donc dans le chemin des notifications (F-03) |
| `routes/com.ts:276` | `for (const m of autres) await tx.insert(comReceipts).values(...).onConflictDoUpdate(...)` | **Jusqu'à 500** (`FENETRE_MESSAGES = 500`, `com.ts:70`) aller-retours dans une transaction, à chaque ouverture de fil |
| `routes/com.ts:212` | `resoudreRefs` par variante épinglée distincte | 1 requête ou plus par variante |
| `lib/studio-publications.ts:308` | `controlesDe` par publication (`withEvents`) | N lectures de contrôles |
| `routes/com.ts:187` | insertion des participants un par un | faible (petits N) |
| `routes/geodata/categories.ts:105` | `UPDATE` d'ordre par catégorie | faible (administration) |
| `lib/account-jobs.ts:78` | une transaction par compte dû | acceptable (tâche de fond) |

**Recommandation** (exemple pour `com.ts:276`)

```ts
// BEFORE
for (const m of autres) await tx.insert(comReceipts).values({ messageId: m.id, userId, openedAt: now })
  .onConflictDoUpdate({ target: [comReceipts.messageId, comReceipts.userId], set: { openedAt: sql`coalesce(${comReceipts.openedAt}, ${now.toISOString()}::timestamptz)` } });
// AFTER — one statement
if (autres.length) await tx.insert(comReceipts)
  .values(autres.map((m) => ({ messageId: m.id, userId, openedAt: now })))
  .onConflictDoUpdate({ target: [comReceipts.messageId, comReceipts.userId], set: { openedAt: sql`coalesce(${comReceipts.openedAt}, excluded.opened_at)` } });
```

- Pour les boucles d'accès : ajouter `loadProjectAccessMany(ids, userId)`, une seule requête `WHERE p.id = ANY($1)` qui suit la même logique que la vue, et `loadReviewAccessMany`.

**Vérification** : `pg_stat_statements` (champ `calls`) avant et après, sur un scénario d'ouverture de fil à 500 messages. `EXPLAIN (ANALYZE)` de l'INSERT multi-lignes.

**Effort** : faible à moyen (1 à 1,5 j).

---

### F-09 — Révisions Studio : document stocké deux fois par commande, croissance sans borne
**Gravité : Moyenne** (Élevée à moyen terme pour le volume)

**Constat [Vérifié]**

- `lib/studio-commands.ts:780-785` :
  ```ts
  const response: StudioContext = { ..., revision: { id, parentRevisionId: ..., document }, canWrite: true };
  await transaction.insert(studioRevisions).values({ id, variantId, parentRevisionId, document, envelope, requestId, payloadHash, source, authorId: actorId, response });
  ```
  `document` est écrit dans la colonne `document` **et** dans `response.revision.document`. Il en va de même pour les créations (`:345-349`, `:415`).
- Un trigger interdit tout UPDATE (`studio_revisions_no_update`, `init.sql:597`), et aucune purge n'existe.
- `atelier_commands` conserve de même `commands`, `inverse`, `effets` et `reponse` (jsonb) pour toujours (`init.sql:382-398`).
- Il n'y a pas de purge des sessions expirées : seule `lib/account-jobs.ts:54` supprime des sessions, et uniquement lors de l'anonymisation. `admin.mail_outbox` n'est pas purgée non plus (la charge utile est vidée, la ligne reste). Les tables `com_events`, `rt_session_events` et `studio_revision_events` ne grossissent qu'en ajout.

**Impact**

- Le stockage de `studio_revisions` vaut environ 2 × (taille du document) × (nombre de commandes). [Hypothèse] Pour un document de 200 Ko et 1 000 gestes, cela fait environ 400 Mo par variante, avant compression TOAST.
- Le WAL et les sauvegardes suivent. Le rejeu (`:750-756`) relit la ligne entière (`select()`) pour comparer seulement `authorId` et `payloadHash`.

**Recommandation**

```ts
// AFTER — store a response without the document; rebuild it on replay from the `document` column
const responseStored = { ...response, revision: { id, parentRevisionId: current.variant.headRevisionId } };
await transaction.insert(studioRevisions).values({ ..., document, response: responseStored });
// replay: select only needed columns
const [previous] = await transaction.select({ id: studioRevisions.id, authorId: studioRevisions.authorId, payloadHash: studioRevisions.payloadHash, response: studioRevisions.response, document: studioRevisions.document })
  .from(studioRevisions).where(and(eq(studioRevisions.variantId, scope.variantId), eq(studioRevisions.requestId, envelope.requestId))).limit(1);
```

- La reconstruction doit garder l'égalité stricte de la réponse rejouée : prévoir un test de non-régression.
- À plus long terme : stocker un instantané complet toutes les N révisions et des deltas (l'enveloppe est déjà conservée) entre deux.
- Purge planifiée :
  ```sql
  DELETE FROM sessions WHERE (expires_at < now() - interval '7 days') OR (revoked_at < now() - interval '30 days');
  CREATE INDEX CONCURRENTLY IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
  DELETE FROM admin.mail_outbox WHERE status <> 'pending' AND created_at < now() - interval '90 days';  -- respecter les règles d'audit (D-5)
  ```

**Vérification**

```sql
SELECT count(*), pg_size_pretty(sum(pg_column_size(document))) doc, pg_size_pretty(sum(pg_column_size(response))) resp FROM studio_revisions;
SELECT pg_size_pretty(pg_total_relation_size('studio_revisions')), pg_size_pretty(pg_total_relation_size('atelier_commands')), (SELECT count(*) FROM sessions WHERE expires_at < now()) AS sessions_mortes;
```

**Effort** : moyen (1,5 j avec les tests de rejeu) ; faible pour les purges.

---

### F-10 — Transactions longues : travail CPU et entrées-sorties externes sous verrou
**Gravité : Moyenne**

**Constat [Vérifié]**

- `lib/mailer/outbox.ts:53-75` : l'envoi SMTP (`await mailer.send(...)`) se fait **dans** la transaction qui tient la ligne en `FOR UPDATE SKIP LOCKED`, jusqu'à 100 fois de suite par cycle de 5 s. Une connexion du pool reste en `idle in transaction` pendant toute la latence SMTP, et sans `idle_in_transaction_session_timeout` (F-01), un SMTP bloqué la tient indéfiniment.
- `lib/studio-commands.ts:719-805` : sous le verrou `FOR UPDATE` de la ligne `projects` (`lockedAccess` → `lockProject`, `lib/step-rows.ts:28`) et de la variante, le code exécute `revaliderBooleensStudio`, `appliquerEtControler` et `studioEffetsCommande` (géométrie côté Node). Toutes les écritures du **projet** sont sérialisées pendant ce calcul : autres variantes, Parcours (`routes/parcours-steps.ts:157, 211, 295` prennent aussi `lockProject`) et verrou d'édition (`routes/lock.ts:51`).
- `routes/atelier-versions.ts:244` : `exportProjectArchive(tx, …)` (tous les fichiers, F-06) dans une transaction de dérivation.
- `nettoyerVolumes` (F-07).

**Recommandation**

- Outbox : modèle en bail (« lease »), avec une transaction courte pour réclamer la ligne, l'envoi hors transaction, puis une mise à jour :
  ```sql
  -- claim (short tx)
  UPDATE admin.mail_outbox SET status = 'sending', next_attempt_at = now() + interval '5 minutes'
   WHERE id = (SELECT id FROM admin.mail_outbox WHERE status = 'pending' AND next_attempt_at <= now()
                ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1)
   RETURNING *;
  -- send outside tx, then: UPDATE … SET status='sent' WHERE id=$1 AND status='sending';
  -- reaper: status='sending' AND next_attempt_at < now() -> back to 'pending'
  ```
  Il faut ajouter `'sending'` au CHECK `mail_outbox_status_check` et à l'index partiel.
- Studio : verrouiller la **variante** (déjà fait en `FOR UPDATE`) plutôt que le projet entier, ou prendre le verrou du projet en `FOR SHARE` (il protège déjà contre une révocation concurrente) pour que deux variantes s'écrivent en parallèle. Il faut s'assurer qu'aucune règle métier ne suppose une sérialisation par projet ; c'est à confirmer avec l'équipe Studio. **[Hypothèse]**

**Vérification**

```sql
SELECT pid, state, now() - xact_start AS xact_age, wait_event, left(query, 80) FROM pg_stat_activity WHERE state LIKE 'idle in transaction%' OR now() - xact_start > interval '1 s' ORDER BY xact_age DESC;
```

Pour mesurer le temps passé sous verrou par `submitStudioCommands`, instrumenter côté Node la durée entre `lockProject` et le COMMIT.

**Effort** : moyen (1 j pour l'outbox, 1 j ou plus pour le verrou Studio avec revue métier).

---

### F-11 — Courses lecture puis écriture sans condition (verrous d'édition et verrous fins)
**Gravité : Moyenne**

**Constat [Vérifié]**

- `routes/lock.ts:78-87` (libération du verrou d'édition) : `activeLock(access)` est évalué sur la ligne lue par `projectOr404`, **hors transaction**, puis :
  ```ts
  await db.update(projects).set({ editingLock: null }).where(eq(projects.id, access.id));
  ```
  Si le verrou expire et qu'un autre compte le reprend entre la lecture et l'UPDATE, ce nouveau verrou est effacé.
- `routes/atelier-versions.ts:565-575` (`DELETE /verrous/:cle`) : SELECT, contrôle (auteur, propriétaire ou expiré), puis `DELETE … WHERE project_id AND cle`. Le DELETE est inconditionnel et l'événement est inséré hors transaction. Le même schéma TOCTOU se retrouve sur un verrou expiré puis repris.
- `routes/atelier-versions.ts:597` (`transferer`) : `UPDATE atelier_locks SET author_id = dest` sans condition sur l'auteur ni l'échéance.
- `lib/mailer/outbox.ts:28-41` (`enqueueMail`) : quotas comptés (`count(*)`) puis INSERT, sans verrou. Des envois concurrents peuvent dépasser le quota de quelques unités (limite douce : Faible).
- **Bonnes pratiques vérifiées** :
  - `routes/auth.ts:186-193` : incrément atomique de `failed_login_count` ;
  - `routes/auth.ts:255-258` : compare-and-set TOTP ;
  - `routes/auth.ts:263-266` : code de secours à usage unique ;
  - `routes/lock.ts:50-62` : prise du verrou sous `lockProject` ;
  - `routes/atelier-versions.ts:545-556` : prise des verrous fins en transaction ;
  - `lib/atelier-validation.ts:5, 144` : `model_revision + 1` sous verrou de ligne ;
  - idempotence par index uniques (`*_request_unique`).

**Recommandation** (rendre la condition atomique dans l'écriture)

```ts
// lock.ts — BEFORE: unconditional
await db.update(projects).set({ editingLock: null }).where(eq(projects.id, access.id));
// AFTER: only clear the lock we validated
const cleared = await db.update(projects).set({ editingLock: null })
  .where(and(eq(projects.id, access.id), sql`${projects.editingLock}->>'userId' = ${lock.userId}`, sql`${projects.editingLock}->>'since' = ${lock.since}`))
  .returning({ id: projects.id });
```

```sql
-- atelier-versions.ts DELETE /verrous/:cle — AFTER (single statement, in a tx with the event insert)
DELETE FROM atelier_locks
 WHERE project_id = $1 AND cle = $2
   AND (author_id = $3 OR $4 /* is owner */ OR expires_at <= now())
RETURNING author_id, expires_at;
-- transferer
UPDATE atelier_locks SET author_id = $dest, transmis_par = $me, created_at = now()
 WHERE project_id = $1 AND cle = $2 AND expires_at > now() AND (author_id = $3 OR $4 /* is owner */)
RETURNING expires_at;
```

**Vérification** : test de concurrence (deux transactions `psql` entrelacées) ; `rowCount = 0` attendu quand la condition change entre-temps.

**Effort** : faible (0,5 j).

---

### F-12 — GeoData : écriture à chaque tuile, filtre spatial sans `couche_id`, recherche `%x%`, pagination OFFSET, `count(*)`
**Gravité : Moyenne**

**Constat [Vérifié]**

- `espacePersonnel` (`lib/geodata/acces.ts:53-60`) exécute `INSERT INTO geodata_espaces … ON CONFLICT … DO NOTHING` puis un SELECT. Il est appelé par `espaceDe(req)` à **chaque** requête GeoData, tuiles et étiquettes comprises (`routes/geodata/consultation.ts:15, 155`). Cela fait une instruction d'écriture par tuile (inutilisable sur un réplica, et un identifiant `newId` gaspillé), soit 4 requêtes par tuile avec `coucheConsultable` et le MVT.
- Tuiles (`consultation.ts:166-189`) : `WHERE o.couche_id = $1 AND o.geom && ST_Transform(b.e, 4326)`. Index disponibles : `geodata_objets_geom_idx USING gist (geom)` (sans `couche_id`) et l'unique `(couche_id, code)`. Quand plusieurs couches couvrent la même emprise (régions, provinces, communes du Maroc), le GiST renvoie les objets **de toutes les couches**, filtrés ensuite. [Hypothèse : plan BitmapAnd ou filtre ; à mesurer]
- Recherche (`consultation.ts:120-125`) : `lower(o.nom) LIKE '%' || $2 || '%'` sur toutes les couches consultables. `geodata_objets_nom_idx (couche_id, lower(nom))` ne sert pas pour une recherche infixe, et l'extension `pg_trgm` n'est pas déclarée dans `init.sql`.
- Table (`consultation.ts:349-352`) : `count(*) OVER ()` + `ORDER BY coalesce(o.nom, o.code)` + `OFFSET` jusqu'à 10 000 × 200. Le total est recalculé à chaque page, et le tri par `coalesce(nom, code)` n'est soutenu par aucun index.
- Vue (`consultation.ts:236`) : `SELECT count(*) FROM geodata_objets WHERE couche_id = $1` à chaque déplacement de carte, alors que `geodata_couches.nombre_objets` existe (mis à jour dans `lib/geodata/versions.ts:174`). [Hypothèse : maintenue à jour à l'import]
- Administration (`routes/admin/index.ts:91-100`) : `ILIKE '%q%'` + `OFFSET`, sur une table `users` de taille modeste (Faible).

**Recommandation**

```ts
// espacePersonnel — read first, insert only when missing (and memoize per user in-process, e.g. LRU 10 min)
const [e] = await requete<Espace>("SELECT id, type, cree_le FROM geodata_espaces WHERE proprietaire_id = $1 AND type = 'personnel'", [userId], ex);
if (e) return e;
await ex.query("INSERT … ON CONFLICT … DO NOTHING", [newId("gdesp"), userId]);
```

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_objets_couche_geom_idx ON geodata_objets USING gist (couche_id, geom);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_objets_nom_trgm_idx ON geodata_objets USING gin (lower(nom) gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS geodata_objets_couche_tri_idx ON geodata_objets (couche_id, (coalesce(nom, code)), code);
```

- Table : pagination par clé `WHERE couche_id = $1 AND (coalesce(nom, code), code) > ($cursorNom, $cursorCode) ORDER BY 1, 2 LIMIT $n`, avec le total pris dans `geodata_couches.nombre_objets` quand aucun filtre n'est appliqué.
- Les extensions (`btree_gist`, `pg_trgm`) demandent le rôle de migration (D-7). Vérifier qu'elles sont disponibles chez l'hébergeur.

**Vérification**

```sql
EXPLAIN (ANALYZE, BUFFERS)
WITH b AS (SELECT ST_TileEnvelope(8, 125, 105) AS e)
SELECT count(*) FROM geodata_objets o, b WHERE o.couche_id = $1 AND o.geom && ST_Transform(b.e, 4326);
EXPLAIN (ANALYZE, BUFFERS) SELECT o.code FROM geodata_objets o WHERE lower(o.nom) LIKE '%casa%' LIMIT 20;
EXPLAIN (ANALYZE, BUFFERS) SELECT o.code, count(*) OVER () FROM geodata_objets o WHERE o.couche_id = $1 ORDER BY coalesce(o.nom, o.code), o.code LIMIT 200 OFFSET 100000;
```

**Effort** : moyen (1,5 j).

---

### F-13 — Sécurité SQL : aucune injection trouvée, mais des interpolations fragiles
**Gravité : Faible**

**Constat [Vérifié]**. Toutes les interpolations dans du SQL brut ont été passées en revue :

| Emplacement | Interpolation | Source | Verdict |
|---|---|---|---|
| `lib/studio-archive.ts:46, 200` | `sql.raw(\`"${t}"\`)`, `sql.raw(\`"${key}"\`)` | `STUDIO_ARCHIVE_TABLES`, `STUDIO_TABLE_KEYS` (constantes) | sûr |
| `lib/fin-participation.ts:51` | `sql.raw(\`${col} <> p.owner_id …\`)` | littéraux `"o.responsable_id"`, `"t.assignee_id"` | sûr |
| `lib/volumes-gc.ts:90` | `SET LOCAL lock_timeout = '${Math.max(100, Math.floor(...))}ms'` | numérique borné | sûr |
| `lib/volumes-gc.ts:108` | `"${ref.colonne}" … "${ref.table}"` | `REFERENCES_VOLUMES` (constante figée) | sûr |
| `lib/geodata/prix/sauvegarde.ts:107` | `'${t}'`, `${t}` | `SEQUENCES` (constante) | sûr |
| `routes/geodata/consultation.ts:332-352` | `${tri} ${ordre}`, `${expr}`, `${filtre}` | listes blanches (`"o.code"` ou `coalesce`, `ASC`/`DESC`) ; `prop` validé contre `["nom","code",...exposees]` et **lié** en `$5` | sûr |
| `routes/geodata/consultation.ts:261` | `HORS_GLYPHES` | constante `PLAGES_GLYPHES`, liée en paramètre `$5` | sûr |
| `lib/geodata/acces.ts:96` | `VERSION_CONSULTABLE(alias, "$1")` | alias littéraux | sûr |
| `lib/journal.ts:74`, `routes/admin/index.ts:93` | motifs `ILIKE` | échappés (`escapeLike`, `replace(/[%_\\]/g)`) et liés | sûr |

- Fuite d'erreurs : le gestionnaire final (`app.ts:138-149`) renvoie `{ error: "internal_error" }` sans pile. Les `err.message` renvoyés (`routes/projects.ts:178-186`, `routes/parcours-steps.ts:152`…) sont des erreurs métier rédigées, pas des messages PostgreSQL. **Pas de fuite constatée.**
- Le schéma reste fragile : un futur développeur pourrait réutiliser `sql.raw` ou `requete(\`…${x}…\`)` avec une entrée utilisateur.

**Recommandation**

- Règle ESLint `no-restricted-syntax` qui interdit `sql.raw` et les gabarits avec interpolation passés à `.query(`/`requete(` hors d'une liste de fichiers autorisés.
- Pour les identifiants dynamiques, une aide `ident(name)` qui vérifie `^[a-z_][a-z0-9_]*$` et cite le nom :
  ```ts
  const ident = (n: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(n)) throw new Error("bad_ident"); return sql.raw(`"${n}"`); };
  ```

**Vérification** : `rg -n "sql\.raw\(|\.query\(\`[^\`]*\$\{" apps/api/src` en CI, avec une liste d'exceptions.

**Effort** : faible (0,5 j).

---

### F-14 — Session : recherche correcte, mais une requête par fichier statique, pas d'index de purge
**Gravité : Faible**

**Constat [Vérifié]**

- `sessions_token_hash_unique` (`init.sql:1683`) et la PK `users` rendent la recherche en O(log n) : c'est bien.
- L'écriture glissante a lieu au plus une fois par minute (`lib/auth.ts:176`) : c'est bien.
- `attachUser` est monté (`app.ts:60`) **avant** `express.static` (`app.ts:116`). Chaque ressource statique (JS, CSS, images de l'application servie par l'API) envoyée avec le cookie déclenche donc une requête de session.
- Rien ne purge les sessions expirées (F-09), et il n'y a pas d'index sur `expires_at`.

**Recommandation**

- Monter `express.static` et le repli SPA **avant** `attachUser`, ou ignorer les chemins `/assets/`. Le repli SPA n'a pas besoin de l'utilisateur.
- Ajouter la projection de colonnes (F-05) et la purge (F-09).

**Vérification** : `pg_stat_statements` (champ `calls` de la requête de session) rapporté au nombre de requêtes HTTP, avec un chargement à froid de l'application.

**Effort** : faible.

---

## 4. Index : récapitulatif (recoupé avec init.sql)

| Besoin | Requête(s) concernée(s) | Existant dans init.sql | Proposition |
|---|---|---|---|
| Conversations écrites par un auteur | `notifications.ts:472` | seulement `com_messages_request_unique (author_id, client_request_id) WHERE client_request_id IS NOT NULL` (partiel) | `com_messages (author_id, conversation_id)` |
| Commandes de l'auteur | `notifications.ts:345` | `(project_id, result_revision)`, `(project_id, request_id)` | `atelier_commands (author_id, project_id, result_revision)` |
| Commandes récentes par projet | `notifications.ts:353-360` | — | `atelier_commands (project_id, created_at DESC)` |
| Verrous transmis à un compte | `notifications.ts:417` | PK `(project_id, cle)` | `atelier_locks (author_id, expires_at)` |
| Exports d'un auteur | `notifications.ts:385` | `drawing_exports (project_id)` | `drawing_exports (created_by, created_at DESC)` |
| Historique des révisions | `studio-commands.ts:251` | `UNIQUE (variant_id, request_id)`, `UNIQUE (variant_id, id)` | `studio_revisions (variant_id, created_at DESC, id DESC)` |
| Purge des sessions | (à créer) | `sessions_user_id_idx`, `sessions_token_hash_unique` | `sessions (expires_at)` |
| Filtre spatial par couche | tuiles, étiquettes, vue | `gist (geom)`, `UNIQUE (couche_id, code)` | `gist (couche_id, geom)` avec `btree_gist` [à mesurer] |
| Recherche infixe | `consultation.ts:120` | `(couche_id, lower(nom))` | `gin (lower(nom) gin_trgm_ops)` |
| Tri de la table | `consultation.ts:351` | — | `(couche_id, coalesce(nom, code), code)` |
| Accès via la vue | `loadProjectAccess` | `people_user_unique`, `project_participations_person_idx`, unique `(participation_id, role, scope_type, …)` | correct ; vérifier le pushdown (F-05) |

Index **présents et adaptés**, vérifiés :

- `mail_outbox_pending_idx` (partiel), `mail_outbox_to_idx` ;
- `com_messages_conversation_idx`, `com_conversations_project_idx` ;
- `studio_comments_variant_idx` ;
- `rt_sessions_project_idx` ;
- `audit_log_actor_idx`, `audit_log_target_idx`, `audit_log_action_idx` ;
- `step_files_project_step_idx` ;
- `project_comments_project_idx` ;
- `studio_access_events_occurred_idx`, qui sert la purge.

Tous les index proposés sont à créer en `CREATE INDEX CONCURRENTLY`, hors de `init.sql` (joué en une seule instruction multiple, donc dans une transaction implicite), par exemple dans un script de migration non transactionnel. Lancer ensuite `ANALYZE`.

---

## 5. Plan de vérification global

1. Activer `pg_stat_statements` et `auto_explain` (`shared_preload_libraries`, `auto_explain.log_min_duration = '500ms'`, `log_analyze = on`, `log_buffers = on`) sur une préproduction, puis jouer un scénario type : connexion, ouverture d'un projet, Atelier, Studio avec 20 commandes, ouverture de la cloche et de la boîte, 50 connexions WebSocket, navigation de carte.
2. Classer par `total_exec_time`, puis par `calls` : on s'attend à voir en tête la requête de session et `loadProjectAccess` (en appels), la cloche et les tuiles (en temps).
3. Pour chaque constat, lancer l'`EXPLAIN` indiqué. Pour les requêtes paramétrées Drizzle : `EXPLAIN (GENERIC_PLAN)` (PG16+), puis `EXPLAIN (ANALYZE, BUFFERS)` avec des valeurs réelles.
4. Réinitialiser les mesures après correction (`SELECT pg_stat_statements_reset();`) et comparer.

## 6. Priorisation suggérée

| Ordre | Constat | Gain attendu | Effort |
|---|---|---|---|
| 1 | F-01 options du pool, `pool.on('error')`, délais côté rôle | stabilité (arrêt rapide au lieu d'une file infinie ; plus d'arrêt du processus sur erreur de client inactif) | 0,5 j |
| 2 | F-07 GC des volumes hors de la requête | supprime un gel des écritures global | 0,5 j |
| 3 | F-03 index de la cloche + N+1 « péremption » | fond de charge permanent | 1 à 2 j |
| 4 | F-02 revalidation WebSocket regroupée | pool sous charge temps réel | 1 à 2 j |
| 5 | F-05 projection de colonnes (`loadProjectAccess`, `resolveSession`, `GET /projects`) | CPU et mémoire sur chaque requête | 2 à 3 j |
| 6 | F-11 courses sur les verrous | justesse | 0,5 j |
| 7 | F-04, F-08 N+1 | latence des vues agrégées | 2 j |
| 8 | F-09, F-10 stockage des révisions, outbox en bail, purges | croissance, verrous longs | 2 à 3 j |
| 9 | F-06 stockage objet | sauvegardes, mémoire | 5 à 8 j |
| 10 | F-12, F-13, F-14 | GeoData, garde-fous | 2 j |
