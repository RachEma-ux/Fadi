# @fadi/api

API REST du projet Fadi · Parcours. Node.js, Express 5, TypeScript strict,
PostgreSQL + PostGIS via Drizzle ORM.

## Pourquoi PostGIS, et où exactement

Une seule colonne est une géométrie PostGIS : `projects.parcel_footprint`
(polygone WGS84, SRID 4326) — la parcelle, repère géographique/cadastral.
La géométrie du bâtiment (murs, niveaux, prismes, repère **local**) n'est
**pas** stockée comme géométrie spatiale : elle est manipulée par
`@parcours/core-geometry` côté application et persistée comme JSON typé par
`@parcours/domain-model` (`architectural_objects.properties`). Mélanger les
deux serait exactement l'erreur de repères que `docs/architecture.md`
interdit (voir `packages/domain-model/src/entities.ts`, `Coordinate`).

## Démarrage local

Nécessite PostgreSQL 16+ avec l'extension PostGIS installée (paquet
`postgresql-16-postgis-3` sous Debian/Ubuntu, ou l'image Docker
`postgis/postgis`).

```sh
# Une fois : créer le rôle et la base de dev (adapter le mot de passe).
sudo -u postgres psql -c "CREATE ROLE fadi WITH LOGIN PASSWORD 'change-me';"
sudo -u postgres psql -c "CREATE DATABASE fadi OWNER fadi;"

cp .env.example .env            # adapter DATABASE_URL au mot de passe choisi
npm run db:migrate --workspace=@fadi/api
npm run dev --workspace=@fadi/api   # écoute sur :3001
```

Le frontend (`npm run dev` à la racine) relaie `/auth`, `/projects`,
`/examples`, `/library`, `/notifications` et `/health` vers `:3001` via le proxy Vite (voir
`apps/web/vite.config.ts`) — pas de configuration CORS à faire en local.
`npm run build` produit `dist/server.js` (esbuild) avec `dist/data/**` et
`dist/db/init.sql` ; `node dist/server.js` lit `DATABASE_URL`, `WEB_ORIGIN`,
`PORT`, `AUTH_RATE_LIMIT`, `API_RATE_LIMIT` (voir `.env.example`).

## Tests

```sh
sudo -u postgres psql -c "CREATE DATABASE fadi_test OWNER fadi;"
cp .env.test.example .env.test
npm run db:migrate --workspace=@fadi/api -- # DATABASE_URL doit alors pointer vers fadi_test
npm test --workspace=@fadi/api
```

Les tests (`src/app.test.ts`, 52) tournent contre une vraie base Postgres —
volontairement pas de mock de la couche base de données, parce que
l'autorisation par ressource (propriétaire, éditeur, lecteur, réservation
d'édition) et la sérialisation des écritures sont justement ce qui doit
être vérifié, et un mock les masquerait. La CI fait tourner un service
`postgis/postgis` dédié, puis le scénario Playwright complet contre l'API
construite.

## Modèle de sécurité (voir aussi `references/security.md` de la skill)

- Mots de passe : Argon2id (`@node-rs/argon2`), paramètres alignés sur les
  recommandations OWASP 2025/2026. Longueur minimale seule imposée (8
  caractères) — une règle de « complexité » pousse souvent vers des mots de
  passe plus faibles et prévisibles (NIST SP 800-63B).
- Sessions : cookie `httpOnly`, `SameSite=Lax`, `Secure` en production,
  identifiant aléatoire stocké côté serveur (table `sessions`), jamais de
  JWT côté client — pas de surface XSS supplémentaire à protéger.
- Autorisation : **chaque** route d'un projet recharge le projet et le rôle
  de l'utilisateur en une jointure (`src/lib/owned-project.ts`,
  `projectOr404(req, res, need)`) et déclare ce qu'elle exige — `read`,
  `comment`, `write` ou `owner`. Sans accès : 404 ; rôle insuffisant : 403
  avec le motif ; édition réservée par quelqu'un d'autre : 423 avec
  l'échéance. « Connecté » seul ne suffit jamais. Les transactions qui
  relisent un état pour le réécrire verrouillent d'abord la ligne du projet
  (`lockProject`, `FOR UPDATE`), puis les contrôles par champ (`baseline`)
  et par version (`expectedVersion`) refusent (409) une écriture fondée sur
  une lecture périmée — jamais d'écrasement silencieux.
- Entrées : validées par schéma Zod sur chaque route qui accepte un corps.
- En-têtes : Helmet (CSP désactivée — cette API ne sert que du JSON, jamais
  de HTML, donc une CSP n'a pas d'effet utile ici).
- Débit : `express-rate-limit`, plus strict sur `/auth` (anti credential
  stuffing, `AUTH_RATE_LIMIT`) que sur le reste de l'API (`API_RATE_LIMIT`).
- Erreurs : jamais de stack trace renvoyée au client ; log structuré côté
  serveur uniquement.
- Messages d'erreur d'authentification volontairement identiques, qu'un
  compte existe ou non — éviter l'énumération d'utilisateurs.

### Limites connues, à ne pas perdre de vue

- Pièces jointes : 25 Mo par fichier (`STEP_FILE_LIMIT`), octets bruts
  jamais interprétés, toujours servies en pièce jointe (`attachment`,
  `nosniff`, `application/octet-stream` sauf images / audio / vidéo / PDF /
  texte) ; archives de projet : 32 Mo à l'import (`ARCHIVE_IMPORT_LIMIT`).
  Les clés MapTiler des utilisateurs ne transitent jamais par l'API : les
  appels au service se font depuis le navigateur, seuls les résultats
  contrôlés sont enregistrés, datés et sourcés.
- **`trust proxy` n'est pas activé** : si l'API est déployée derrière un
  reverse proxy, `express-rate-limit` verra l'IP du proxy pour toutes les
  requêtes (débit partagé) tant que `app.set("trust proxy", ...)` n'est pas
  configuré avec la bonne valeur pour cette topologie précise — volontairement
  non activé ici pour ne pas introduire un risque de usurpation d'IP sans
  connaître l'infrastructure réelle de déploiement.
- `npm audit` est vide (dépendances de production et de développement),
  Vitest 5 compris ; le fichier de verrouillage est figé par `npm ci` en CI.
