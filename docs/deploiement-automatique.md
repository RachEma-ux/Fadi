# Déploiement automatique — préproduction puis production

20 octobre 2026 · Roch · **Statut : plan validé par le maître d'ouvrage, aucune implémentation engagée**

Le VPS **tire** les versions validées depuis GitHub : `main` vérifiée par la CI part automatiquement en préproduction ; la production ne reçoit que la version validée en préproduction, après une autorisation explicite du maître d'ouvrage. GitHub ne détient aucune clé du serveur.

```
Concept → développement (Claude / Codex) → branche + PR (revue, CI) → main
   → [automatique] preprod.fadimmo.com → validation du maître d'ouvrage
   → [Release GitHub] www.fadimmo.com
```

## Décisions (20 octobre 2026)

| Décision | Statut |
| --- | --- |
| Modèle « le VPS tire » : un service sur le VPS interroge l'API publique de GitHub, aucun secret dans GitHub, aucune connexion entrante depuis GitHub | Décidé |
| Notification des déploiements par e-mail via Healthchecks (déjà utilisé pour les sauvegardes) | Décidé (canal par défaut, modifiable) |
| Autorisation de production = **Release GitHub** publiée par le maître d'ouvrage sur le commit validé en préproduction | Décidé |
| La production n'entre pas dans la délégation de la session VPS : la Release est le geste du maître d'ouvrage | Décidé |

Options écartées : push SSH depuis GitHub Actions (clé dans les secrets GitHub et port entrant) ; runner GitHub auto-hébergé sur le VPS (exécute le code du dépôt avec des droits Docker, équivalents à root).

## Ce qui existe déjà

- **CI** (`.github/workflows/ci.yml`) : `validate`, tranches `e2e`, et `image`, qui construit l'image de production et la sonde : c'est le feu vert du déploiement.
- **`fadi-preprod`** (`deploy/preprod/`, installé sur le VPS) : `sync`, `build`, `migrate`, `up`, `smoke`, `e2e`, `backup`, `restore-check`, avec garde d'isolation et rôles administrateur / opérateur. Testé par `consolidation-validation.yml`.
- **Sauvegarde chiffrée hors VPS** (restic, service `fadi-backup-offsite` surveillé par Healthchecks).
- **Plan d'activation** : `docs/exploitation-fadi-cloud.md`, portes 4 à 6 (compte limité, livraison immuable, environnement protégé).
- À ne pas confondre : Builder Deploy (démo temporaire par tunnel, environnement `recette`) et `fadifront.yml` (site statique Infomaniak) ne sont pas des déploiements permanents.

## Phase A — préproduction automatique

1. **Service `fadi-preprod-auto`** (script root, minuteur systemd toutes les 5 minutes, installé par l'administrateur) :
   - lit le dernier commit de `main` par l'API publique de GitHub ;
   - exige que les contrôles `validate`, `e2e` et `image` soient verts sur ce commit, et que le commit appartienne à l'historique de `main` ;
   - s'il est nouveau : `fadi-preprod sync <sha>`, `build`, `migrate`, `up`, `smoke`, puis un jeu court de scénarios (`sandbox-module`, `parcours-scenario`) — la CI a déjà joué tous les scénarios ;
   - écrit l'état (`/opt/fadi-preprod/etat.json` : commit, heure, étape, résultat), lisible par `fadi-preprod show` et `status` ;
   - un verrou empêche deux déploiements simultanés ; le budget d'appels de l'API publique (60 par heure) est respecté.
2. **Échec** : la version précédente reste en ligne. Une construction ratée ne remplace rien ; un démarrage raté revient à l'image précédente (images étiquetées par commit, conservées). La base de préproduction ne contient que des données synthétiques et peut être réinitialisée.
3. **Notification** : succès et échec envoyés au maître d'ouvrage (Healthchecks, e-mail).
4. **Route `/version`** dans l'application : commit et date de construction, pour vérifier d'un coup d'œil ce qui tourne (petit lot de code).

## Phase B — production après autorisation

1. **Autorisation** : le maître d'ouvrage publie une **Release GitHub** (possible depuis l'application Android) sur le commit validé en préproduction. Une règle de protection des étiquettes réserve leur création à son compte.
2. **Service `fadi-prod-auto`** : ne déploie que si le commit de la Release est **exactement** le dernier commit passé en préproduction sans échec. Ordre :
   1. sauvegarde de la base (locale et restic hors VPS), vérifiée ;
   2. mise à jour de la copie du dépôt de production (`/mnt/data/fadi/app`), jamais à la main ;
   3. nouvelle image, puis redémarrage du seul service `app` — ni la base ni Caddy ne sont recréés ; la surcharge du proxy (`deploy/preprod/proxy/proxy-preprod.override.yml`) est toujours incluse ;
   4. sondes : `https://www.fadimmo.com/health` (`"db":"ok"`), page d'accueil, `/projects` en 401.
3. **Retour arrière** : si une sonde échoue, l'application revient automatiquement à l'image précédente. La base n'est restaurée qu'avec l'accord du maître d'ouvrage, depuis la sauvegarde prise à l'étape 1.
4. **Migrations** : la production applique le schéma au démarrage (`MIGRATE_ON_START=1`) ; c'est pourquoi la sauvegarde vérifiée précède toujours le redémarrage.

## Phase C — optionnelle

- États de déploiement visibles dans GitHub (environnements `preprod` et `production`), avec un jeton à droits restreints sur le VPS.
- Images publiées sur GHCR, pour que la production reçoive l'image de la préproduction au bit près.

## Sécurité

- Aucune clé root, aucun accès au socket Docker, aucun secret du serveur dans GitHub.
- Les scripts root sont installés depuis un commit relu, avec empreinte vérifiée, jamais depuis une copie modifiable par un compte non root.
- Le service ne déploie qu'un commit de `main` à CI verte ; une branche, une PR ou une étiquette quelconque ne déclenche rien.
- Chaque déploiement est journalisé (commit, heure, étapes, résultat).

## Répartition

| Tâche | Par qui |
| --- | --- |
| Scripts `fadi-preprod-auto` et `fadi-prod-auto`, leurs tests, la route `/version`, la documentation | session cloud (PR, CI) |
| Revue de sécurité des scripts et vérification sur le VPS | session VPS |
| Installation root (scripts, minuteurs systemd), règle de protection des Releases, adresse Healthchecks | administrateur / maître d'ouvrage, une fois |

## Ordre des travaux

1. Phase A : route `/version`, puis `fadi-preprod-auto` et ses tests, puis installation et premier déploiement automatique observé.
2. Phase B : `fadi-prod-auto`, recette d'un échec simulé et du retour arrière en préproduction, règle de protection des Releases, puis première mise en production autorisée.
3. Phase C, si utile.
