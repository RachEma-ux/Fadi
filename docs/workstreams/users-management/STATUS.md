# Gestion des comptes (Users Management) — Statut

Mis à jour : 2026-10-24 (UTC).

## État

**Fusionné dans `main`, déployé en préproduction, pas en production ; Issue #253 close (UM-26).** La PR #255 (phases 0 à 6, amendement D-7, DB-3 raccordé, correctifs UM-18 à
UM-23) a été fusionnée par le maître d'ouvrage le 2026-10-23 à 06:23 UTC (commit de fusion `516e2f7`, tête `dd784bc`).
CI de `main` verte sur `516e2f7` : run CI 39911221480 et 5 autres workflows (14 contrôles réussis, 3 sautés comme sur la
PR). **Préproduction** : `02329e1` déployé le 2026-10-23 à 15:28:46 UTC
par le déploiement automatique (outillage D-7 de la PR #264, `init-env` lancé) — voir la section Préproduction.
**Production (www.fadimmo.com) : non déployée, hors de toute action** (consigne du maître d'ouvrage du 2026-10-23 : pendant le développement, tout se déploie sur preprod.fadimmo.com) ; un futur déploiement suivrait RUNBOOK.md (§1 à §11, dont §4 et §4 bis) et attend l'accord explicite
du maître d'ouvrage.
DB-3 : **vérifié en CI** sur `570d248` (UM-17) — les 12 suites passent sur base jetable attestée. Points d'arrêt 🛑 2,
D7-final et final : **clos** par la décision de fusion du maître d'ouvrage (2026-10-23, UM-24) ; plus aucune revue de la
PR #255 n'est attendue. Reste au maître d'ouvrage : le déploiement en production. UM-1 est levé (UM-25) : le chantier
« Organisations, participation et revue externe » est ouvert ([Issue #262](https://github.com/RachEma-ux/Fadi/issues/262)).

**Amendement de D-5 (UM-27, 2026-10-24) : fusionné dans `main` ([PR #270](https://github.com/RachEma-ux/Fadi/pull/270), `2cc038a`, 2026-10-24 16:09 UTC),
CI de `main` verte sur `2cc038a` (validate, e2e, image et les 5 autres workflows).** Courriel en préproduction (UM-28) :
fusionné ([PR #271](https://github.com/RachEma-ux/Fadi/pull/271), `e03fdfc`). `2cc038a` remplit les conditions du
déploiement automatique de la préproduction ; son passage effectif n'est pas constaté depuis une session cloud.
**Mise en service en préproduction (RUNBOOK §3 bis, §5 à §9) : non consignée** — tâche UM-SERVICE. Corbeille des comptes et « Anonymiser maintenant » dans `/admin/utilisateurs` — voir la section UM-27.

## Faits vérifiés

### Corbeille et « Anonymiser maintenant » (UM-27, 2026-10-24)

Branche `feat/253-corbeille-anonymiser`, depuis `main` à `c201d2b`. Vérifié en local sur PostgreSQL 16 + PostGIS 3
(API construite en `fadi_app`, servant `WEB_DIST`, courriels vers Mailpit v1.20.4, même configuration que la CI) :

- `npm run typecheck` : vert. `npm run build` : vert.
- `npm test` : tous les paquets et le web verts (dont `icones-admin.test.ts`, 4 tests, règle d'or) ; API : 454 tests purs
  verts (dont 7 nouveaux dans `lib/security/security.test.ts`) ; les 12 suites DB-3 refusées par la garde **seule**
  (`TARGET_REQUIRED`), comme attendu sans la clé `fadi-ci-db3`.
- `app.test.ts` sur une base jetable locale attestée par `scripts/db3/preparer-base-test.mjs` : **77 tests verts** (78 après le correctif ci-dessous), dont
  les 6 nouveaux de « 5. corbeille et Anonymiser maintenant » (refus, appels simultanés, restaurer contre anonymiser,
  statut suspendu rétabli, administrateur de la corbeille). L'autorité de signature locale a été ajoutée au registre
  **dans la copie de travail seulement**, puis retirée (`git checkout`) : elle n'est pas dans le dépôt ; la preuve
  opposable reste DB-3 en CI.
- `comptes-api.mjs` : vert (inchangé). `comptes-securite.mjs` : **71 contrôles verts**, section 5 comprise (26 contrôles :
  corbeille, demandeur, refus, journal, double appel, appels simultanés, restauration d'un compte suspendu, projets
  partagés). Les courses du dernier administrateur restent NON EXÉCUTÉES hors base vierge (inchangé).
- `comptes-admin.mjs` : **64 contrôles verts** (corbeille listée, icône propre sur chaque commande, « Restaurer »,
  « Anonymiser maintenant » avec bouton inactif tant que l'adresse n'est pas ressaisie, axe-core sur la corbeille et la
  boîte de confirmation, passe anglaise de la corbeille et de la confirmation).
- Constat corrigé pendant la recette : `/admin/trash` tombait dans le repli SPA (l'API ne recevait que `/admin/users*` et
  `/admin/invitations*`) ; ajouté à `API_PREFIX`, au montage `/admin` (`app.ts`) et au mandataire de Vite.
- Revue Codex de `15f1935` (P2) : le lien d'annulation verrouillait le jeton puis le compte, « Restaurer » le compte puis
  le jeton — interblocage possible entre les deux voies simultanées. Corrigé : `/auth/cancel-deletion` lit le jeton,
  verrouille la ligne du compte, puis consomme le jeton (même ordre que la restauration et l'anonymisation). Test DB-3
  ajouté (lien et « Restaurer » simultanés, 5 fois : exactement l'un des deux) ; `app.test.ts` **78 tests verts** sur base
  jetable locale ; `comptes-api.mjs` et `comptes-securite.mjs` verts sur l'API reconstruite.
- Aucune migration : aucune colonne ni table ajoutée ; le déploiement de cette PR ne change pas RUNBOOK.md.
- **CI de la PR #270 verte sur `4aa7d0b`** (run CI 40105186547 et les 5 autres workflows, 2026-10-24 15:02–15:16 UTC) :
  `validate` avec DB-3 actif (clé `fadi-ci-db3`) — 577 tests API, dont **123 dans les 12 suites DB-3** (116 + 7 nouveaux) ;
  `image`, Studio V1 et les cinq tranches e2e (`complements` : `comptes-api`, `comptes-securite`, `comptes-admin`) vertes.

### Phase 0 — concept et audit

- `concept.md` = copie exacte du `.md` officiel v2.2 ; la parité avec le `.docx` est vérifiée par pandoc
  (`pandoc -t plain` : même multiensemble de mots, diff vide), car pandoc aplatit les tableaux du `.docx`.
- Anti-dérive : `concept.md.sha256`, `apps/api/src/lib/users-concept-drift.test.ts` (5 tests verts) et
  `node scripts/users-concept.mjs`.
- Réponses d'audit (commit `9d466f8`) :
  1. **Hachage.** Argon2id 19 MiB / t=2 / p=1, déjà conforme (`apps/api/src/lib/auth.ts:11-15`). La longueur minimale
     était de 8 caractères (`routes/auth.ts:16`).
  2. **Sessions.** Cookie opaque `fadi_session`, dont le jeton `randomUUID` était stocké **en clair** comme clé de
     `sessions` (`auth.ts:39`, `init.sql:24-30`). Expiration fixe de 30 jours, révocable par suppression de la ligne.
  3. **Table `users`.** Colonnes : `id`, `email`, `password_hash`, `created_at`, préférences. Aucun statut, aucun rôle,
     aucun compteur d'échecs (`schema.ts:24-39`).
  4. **`AUTH_RATE_LIMIT`.** 20 requêtes par 15 min et par IP, sur tout `/auth` (`app.ts:55-57`). Aucune limite par
     identifiant, aucun verrouillage.
  5. **Défaut de la PR #1 confirmé.** Un 401 sur `/auth/me` n'efface que `fadi.lastUser` (`auth-context.tsx:90-91`).
     Les lots de l'Atelier et `modelCache` n'avaient pas de propriétaire et n'étaient jamais purgés.

### Phases 1 à 4 et D-7 — sur base réelle (PostGIS 16 local, hors garde Vitest)

- `scripts/validation/users-migration-check.mjs` : **31 contrôles verts**.
  - `init.sql` rejoué deux fois sans erreur ; un compte historique reste `active` / `user` ; une session historique
    est convertie en empreinte.
  - Les contraintes CHECK refusent les valeurs invalides ; le journal d'audit refuse UPDATE et DELETE.
  - D-7 : chaque table est dans son schéma et appartient à `fadi_owner`.
  - `fadi_app` : CREATE, ALTER, DROP et TRUNCATE refusés ; UPDATE et DELETE sur le journal d'audit refusés ;
    lecture et écriture des tables applicatives permises.
  - `fadi_retention` ne peut qu'anonymiser des colonnes du journal ; `fadi_backup` est en lecture seule.
- Migration jouée deux fois en `fadi_migrator`, non super-utilisateur : réussie.
- `scripts/verify-restore.sh` : restauration vérifiée, journal d'audit identique, déclencheurs append-only présents,
  propriétaires et droits D-7 identiques après restauration.
- `apps/web/e2e/comptes-api.mjs` : **109 contrôles verts** avec l'API connectée en `fadi_app`. Deux exécutions :
  courriel en console, puis SMTP réel vers Mailpit v1.20.4, avec la même configuration que la CI. La recette couvre :
  - la politique de mot de passe et le hachage ;
  - le jeton de session jamais stocké en clair ;
  - une réponse identique pour un compte inconnu et un mauvais mot de passe ;
  - le verrouillage après 5 échecs et la protection CSRF ;
  - la révocation des sessions au changement et à la réinitialisation du mot de passe ;
  - TOTP chiffré : enrôlement, codes de secours hachés à usage unique, rejeu refusé ;
  - la session administrateur plafonnée à 24 h ;
  - `/admin` : 404 pour un non-administrateur et pour un anonyme, 403 `mfa_required` sans TOTP ;
  - les invitations : renvoi sans doublon, lien transféré refusé, invitation expirée, annulée ou déclinée sans effet ;
  - l'accès support : lecture permise ; écriture, commentaire et export refusés ; lectures journalisées ; propriétaire
    prévenu ; accès expiré ou révoqué → 404 ;
  - la suspension (sessions révoquées, réservations d'édition libérées) et la réactivation ;
  - le mot de passe oublié (réponse identique) ;
  - l'export et la suppression : refusée avec un projet partagé, annulable, anonymisation à 30 jours sur horloge simulée ;
  - le garde-fou de quota (lien à copier) et un journal d'audit sans aucune adresse e-mail.
- Tests purs API (`npx vitest run src/lib …`) : 19 fichiers, **229 tests verts**. Ils couvrent la politique de mot de
  passe, les vecteurs RFC 6238, le coffre AES-GCM, les sessions et le verrouillage, la machine d'états, les règles
  d'invitation, D-5, le mailer, le quota, les gabarits FR/EN, l'accès plateforme et le dernier administrateur.
- Matrice Studio régénérée : `routes/auth.ts` est déclarée hors matrice, l'export lisant les commentaires Studio du
  compte. Contrôle DB-3 : voir la section DB-3 ci-dessous.

### Phase 5 — écrans (équipe Interface, sous-agent)

- `apps/web/e2e/comptes-admin.mjs` : **48 vérifications vertes** sur l'API :3005 (SMTP vers Mailpit), après
  correction de deux points de recette : la limite par destinataire lue dans l'environnement et l'attente du bandeau.
  Elle couvre :
  - le renvoi vers l'enrôlement quand l'administrateur n'a pas de double authentification ;
  - l'enrôlement TOTP par l'interface et la connexion en deux étapes ;
  - le tableau d'administration, la recherche, la fiche, l'invitation avec lien à copier et l'activation ;
  - le mot de passe oublié ;
  - côté projet : invitation en attente, accès support et bandeau ;
  - A révoqué puis B sur le même navigateur : rien de A n'est visible, IndexedDB et `fadi.lastUser` sont purgés ;
  - axe-core sans violation critique ni sérieuse sur 16 écrans, en bureau et en téléphone (390×844).
- Rapport du sous-agent :
  - `npm run test --workspace=@fadi/web` : 940 tests verts ;
  - build vert ;
  - `interface-anglais.mjs` vert (0,34 % de textes restés en français), complété d'un relevé ponctuel des nouvelles
    pages publiques et de Mon compte ;
  - `/admin/utilisateurs` et le panneau d'accès support, d'abord non relevés en anglais, sont couverts depuis le
    2026-10-22 : relevé statique (textes JSX et littéraux passés au `Traducteur` avec `en.json`) puis passe anglaise
    ajoutée à `comptes-admin.mjs` (2 contrôles). Les textes à valeurs étaient rendus en plusieurs nœuds (« Projets ( »,
    « · jusqu’au … ») que la traduction DOM ne reconnaissait pas : ils sont rendus d'un seul tenant, avec leurs motifs
    `{0}` au dictionnaire ; « Réactiver » (traduit « Unmute » ailleurs) devient « Réactiver le compte ».
    `comptes-admin.mjs` : **50 vérifications vertes** en local (PostGIS 16, transport console), tests web 945 verts,
    typecheck et build verts.

### DB-3 — suites API sur base jetable attestée (CI)

Run CI 39855284507, job `validate` (120091788375), commit `570d248`, 2026-10-22 21:15–21:21 UTC :

- Préparation : base `fadi_test`, rôle `fadi_test` sans privilège d'administration, marqueur
  `fadi_test_meta.provisioning`, attestation signée par la clé du propriétaire `fadi-ci-db3`, valable 55 min.
- `vitest` API : **41 fichiers, 515 tests verts**, dont **105 dans les 12 suites DB-3** ; aucun refus de la garde.
- `check-api-tests-db3.mjs --db3-actif` : « toutes les suites API tournent sur la base attestée, aucune n'est refusée ».

| Suite | Tests | Résultat |
|---|---|---|
| `src/app.test.ts` | 60 | réussie |
| `src/routes/atelier-commands.test.ts` | 31 | réussie |
| `src/routes/history.test.ts` | 3 | réussie |
| `src/routes/atelier-automatisation-p2.test.ts` | 2 | réussie |
| `src/routes/atelier-planches.test.ts` | 2 | réussie |
| `src/routes/atelier-bois-tolerie.test.ts` | 1 | réussie |
| `src/routes/atelier-coordination.test.ts` | 1 | réussie |
| `src/routes/atelier-documentation.test.ts` | 1 | réussie |
| `src/routes/atelier-exact.test.ts` | 1 | réussie |
| `src/routes/atelier-mecanique.test.ts` | 1 | réussie |
| `src/routes/atelier-reseaux.test.ts` | 1 | réussie |
| `src/routes/atelier-structure.test.ts` | 1 | réussie |

### Revue de sécurité de `c7dbc92` — trois blocages corrigés (2026-10-22)

Chaque blocage a d'abord été **reproduit** sur le code non corrigé par `apps/web/e2e/comptes-securite.mjs` (API réelle
:3011, base locale vierge `fadi_secu`, PostGIS 16, transport console), puis corrigé :

1. **Double authentification et sessions (UM-18).** Avant : navigateur B (mot de passe seul, ouvert avant l'activation
   dans A) → `GET /admin/users` **200** ; B non révoqué. Après : B révoqué (401), `/admin` refusé ; une session sans
   preuve (héritée) → 403 `mfa_session_required`.
2. **Dernier administrateur (UM-19).** Avant : deux auto-suppressions simultanées → **202 / 202, 0 administrateur
   actif**. Après : une seule passe, l'autre 409 `last_admin`, aucun état partiel (statut, rôle, demande de suppression
   et journal inchangés) — quatre courses : deux auto-suppressions, suppressions croisées, auto-suppression contre
   suspension, suppression contre rétrogradation.
3. **Accès support et export (UM-20).** Avant : tous les documents produits servis à l'accès support (GET, HEAD,
   identifiant encodé, barre finale, casse), **10 traces de production** écrites, **copie créée** par
   `POST /projects/%70…/copies` (201), lecture par identifiant encodé **non journalisée**. Après : 403
   `support_no_export` partout, aucune trace ni copie, lectures permises et journalisées ; propriétaire et lecteur
   gardent l'export.

Preuves locales après correction :

- `comptes-securite.mjs` : **64 vérifications vertes**, trois exécutions successives sur base vierge
  (`COMPTES_SECURITE_BASE_VIERGE=1`) ; avant correction : 12 échecs (sections 1 et 3) et 0 administrateur actif (section 2).
- `comptes-api.mjs` 109 ✓ ; `comptes-admin.mjs` 50 ✓ (navigateur, axe-core) ; `users-migration-check.mjs` ✓ sur base
  neuve ; tests purs API 226 ✓ (dont `support-path.test.ts` 31 et `platform-access.test.ts` 15) ; `test:db-guard`
  178 ✓ ; `npm run typecheck` ✓ ; `npm run build` ✓.
- `app.test.ts` (suite DB-3) : nouveau bloc « gestion des comptes — correctifs de sécurité » (9 tests : navigateurs A/B,
  TOTP et code de secours, session partielle et héritée, promotion, désactivation / réactivation, quatre courses
  concurrentes, accès support). Non exécutable en local (la garde refuse la base locale, `TARGET_REQUIRED`).
- **CI sur `873f740`** (run CI 39871011012 et 5 autres workflows, tous verts) : job `validate`, DB-3 actif —
  `app.test.ts` **69 tests verts dont les 9 nouveaux**, API **561 tests, dont 114 dans les 12 suites DB-3**, aucune
  suite refusée ; tranche `complements` — `comptes-securite.mjs` **43 vérifications vertes** (sections 1 et 3 ; la
  section 2 déclarée NON EXÉCUTÉE sur la base partagée, couverte par `app.test.ts`), `comptes-api.mjs` et
  `comptes-admin.mjs` verts.
- En CI (tranche `complements`), `comptes-securite.mjs` tourne sur la base partagée : les courses du dernier
  administrateur y sont déclarées NON EXÉCUTÉES (elles exigent une base vierge) et couvertes par `app.test.ts`.

### Revue Codex de `fcb0dd1` — trois constats corrigés (2026-10-23)

- **Annulation d'une suppression sans courriel (UM-21).** Avant : `queued: false` sans lien, aucune voie d'annulation.
  Après, vérifié sur l'API locale sans transport : 202 avec le lien ; connexion 403 pendant la suppression ; le lien
  annule (200) ; connexion de nouveau 200.
- **Migration hors de l'API (UM-22).** `docker compose config` valide ; en local, `MIGRATE_ONLY=1` applique le schéma et
  le mot de passe de `fadi_app` puis s'arrête (code 0) ; l'API en production avec `DATABASE_MIGRATION_URL` refuse de
  démarrer (code 1) ; sans lui, elle démarre en `fadi_app` (`/health` ok). Le job CI `image` vérifie les trois.
- **Compteur d'échecs atomique (UM-23).** Avant (reproduit par `comptes-securite.mjs`, section 4) : cinq échecs
  simultanés → `failed_login_count = 1`, pas de verrouillage. Après : 5 et verrouillé.
- Recettes locales : `comptes-securite.mjs` **66 ✓** (base vierge), `comptes-api.mjs` 109 ✓, `comptes-admin.mjs` 50 ✓,
  `users-migration-check.mjs` ✓ ; typecheck, build et `test:db-guard` 178 ✓.
- **CI sur `24ed965`** (run CI 39877219454 et 5 autres workflows, tous verts) : DB-3 actif — `app.test.ts` 71 tests verts
  dont les 2 nouveaux (« 4. revue Codex »), API **563 tests, dont 116 dans les 12 suites DB-3** ; job `image` vert
  (migration à usage unique, refus de l'identifiant de migration dans l'API, démarrage en `fadi_app`) ; `e2e (parcours)`
  vert sur cette tête.
- `e2e (parcours)` en échec sur `6a9d1e7` puis `a5aa183` (commits de documentation) : course de
  `apps/web/e2e/accueils-design.mjs:351` (`route.fulfill: Route is already handled!`), le gestionnaire d'interception étant
  retiré pendant son `route.fetch()`.
  - **Correctif de `361c7bd` inopérant (constat de revue) :** `page.unroute(url, handler?)` n'accepte pas d'options ; l'objet
    `{ behavior: "wait" }` y était pris pour un gestionnaire, aucun n'était retiré et rien n'était attendu. Vérifié : avec
    cet appel, le nouveau contrôle « interception retirée » échoue (rôle reçu `null`).
  - **Correctif (2026-10-23) :** seule interception de page active à cet endroit, elle est retirée par
    `page.unrouteAll({ behavior: "wait" })` (Playwright 1.56), qui attend les gestionnaires en cours. Deux contrôles
    ajoutés : aucun gestionnaire encore en cours après le retrait, et le serveur redonne le rôle (mock réellement retiré).
    Les interceptions des scénarios suivants (`recoveryUrl`) sont posées après et restent actives.
  - **Seconde cause d'intermittence diagnostiquée** (1 échec sur 10 en local, base neuve) : « l’accès aux 21 étapes reste
    disponible » attendait un lien non rattaché au dossier B, satisfait par celui de A pendant la navigation ; le comptage
    tombait sur l'état intermédiaire. La recette attend désormais l'URL et l'accueil de B, puis exige exactement un lien,
    vers B.
  - **Vérification locale :** 15 exécutions consécutives, chacune sur une base neuve (`fadi_acc`) : 15/15 vertes, 80 ✓
    chacune, aucune erreur de routage ni rejet non traité ; typecheck ✓, tests web 945 ✓, build ✓.
  - **CI sur `18cd1d0`** (après fusion de `main` en `9bc5b35`) : run CI 39898711436 et 5 autres workflows, tous verts ;
    tranche `parcours` : « Accueil : 80 contrôles réussis, 0 échec(s) », dont les deux nouveaux contrôles de retrait et
    « l’accès aux 21 étapes reste disponible », aucun « Route is already handled ».

### Préproduction (2026-10-23, UM-26)

Relevé de `sudo fadi-preprod status` transmis par le maître d'ouvrage (VPS, non accessible depuis la session) :

- `etat.json` : commit `02329e1ae4144c7e03a45e21bf5efdc756bb6963`, étape `fin`, résultat `succes`, heure
  2026-10-23T15:28:46Z, message « déployé en préproduction (build, migrate, up, smoke, /version, e2e : sandbox-module
  parcours-scenario) », journal `20261023T152026Z-2337465-auto`, `en_ligne` = ce commit.
- Conteneurs : `fadi-preprod-app-1` (image `fadi-preprod-app:02329e1ae414`, sain, `127.0.0.1:3101`) et
  `fadi-preprod-db-1` (PostGIS 16-3.4, sain).
- `PREPROD_FADI_APP_DB_PASSWORD` : présence **déduite** du succès de `build` et `migrate`, qui refusent de tourner sans
  elle ; `migrate` vérifie aussi que `fadi_app` ne peut pas créer dans `public`. Le `grep -c` de contrôle n'apparaît pas
  dans le relevé.
- Production (lecture seule) : `app-proxy`, `app-app`, `app-backup`, `app-db` démarrés depuis 3 jours, inchangés.
- Non exercés en préproduction : `comptes-api`, `comptes-admin`, `comptes-securite` (base jetable et transport de
  courriel exigés) ; couverts par la CI. Les tests de l'outillage (PR #264) utilisent des doubles `docker` / `curl`.

### Courriel en préproduction et domaines réservés (2026-10-24, UM-28) — Fusionné

Branche `feat/preprod-courriel`, [PR #271](https://github.com/RachEma-ux/Fadi/pull/271) fusionnée le 2026-10-24 à 15:46 UTC (`e03fdfc`) ; variables SMTP à poser sur le VPS (UM-SERVICE). Demande du maître d'ouvrage relayée
par la session d'exploitation du VPS.

- `deploy/preprod/compose.yml` : variables de courriel transmises au seul service `app` depuis `PREPROD_*`
  facultatives (sans `PREPROD_MAIL_TRANSPORT` : aucun envoi ; `MAIL_DAILY_LIMIT` 50 par défaut) ; garde
  `fadi-preprod garde` : `SMTP_PASS` refusé hors `app`. `env.example` et RUNBOOK §3 bis (procédure administrateur).
- Mailer : `isReservedDomain` et raison `reserved_domain` (`apps/api/src/lib/mailer/quota.ts`, `outbox.ts`) ;
  `MAIL_ALLOW_RESERVED_DOMAINS=true` en CI (Mailpit), refusé en production (`index.ts`).
- Preuves locales (2026-10-24) : `mailer.test.ts` (domaines réservés / non réservés, décision de file, drapeau) ;
  `bash deploy/preprod/tests/run.sh` sous un compte non root : **99 réussis, 0 échec** (dont « garde refuse : SMTP_PASS
  donné à la recette », compose résolu sans / avec `PREPROD_MAIL_*`) et `run-auto.sh` **80 réussis, 0 échec** ;
  `npm run typecheck`, `npm test`, `npm run build` : voir la PR. CI : à relever sur la PR.
- Non vérifié : envoi réel depuis la préproduction (exige les variables sur le VPS, RUNBOOK §3 bis et §5).

## Écarts au plan (le concept et D-7 priment)

- UM-2 et UM-3 : pas d'état `invited` ni de compte fantôme ; les invitations ont leur propre table (`auth.invitations`).
- UM-5 et UM-13 : `public.sessions` est étendue au lieu de `user_sessions`, et reste dans `public`.
- La tâche 2.E2E visait `e2e/scenarios/00-compte.mjs`, et la tâche 6.1 `scenarios/NN-…` avec `run.mjs`. Ces fichiers
  n'existent pas dans le dépôt : les recettes `comptes-api.mjs` et `comptes-admin.mjs` sont des étapes de CI, comme
  les autres recettes (tranche `complements`).
- Le générateur `PERMISSIONS.md` couvre Studio seulement. La matrice des routes `/admin/*` est portée par
  `platform-access.test.ts` (décision pure par acteur : admin, utilisateur, suspendu, anonyme) et par la recette HTTP.
  Les « 7 acteurs » de la matrice Studio sont le non-membre plus six situations de membre.

## Points ouverts

- UM-27 : fusionné (PR #270, `2cc038a`) ; aucun déploiement en production.
- UM-SERVICE : mise en service et recette en préproduction (RUNBOOK §3 bis, §5 à §9) non consignées. Contrôles à relever
  sur le VPS : `fadi-preprod status` (commit en ligne), `/version`, `PREPROD_FADI_ADMIN_ENABLED=true` présent dans
  `/opt/fadi-preprod/env/.env.preprod`, nombre d'administrateurs et d'administrateurs avec TOTP actif (comptages
  seulement, aucune adresse). La sonde anonyme `/admin/users` répond **404 dans tous les cas** (`platformRefusal`,
  non-divulgation) : elle ne distingue pas une administration ouverte d'une fermée. L'ouverture se constate avec une
  session administrateur ouverte avec son code : `/admin/users` **200** et `GET /auth/me` avec `adminEnabled: true`.
- Indice non vérifié : la PR #275 rapporte une invitation envoyée depuis l'Administration en préproduction, ce qui
  suppose un administrateur, l'administration ouverte et le courriel configurés ; rien n'est déclaré fait sans relevé.
- UM-27, signalé : pas de corbeille pour les projets ni les documents (hors périmètre de la décision ; le concept ne
  l'exige pas). L'anonymisation supprime les projets non partagés du compte, et « Anonymiser maintenant » avance cette
  suppression : à trancher par le maître d'ouvrage s'il veut une corbeille de projets.

- UM-1 : levé le 2026-10-23 (UM-25), chantier ouvert ([Issue #262](https://github.com/RachEma-ux/Fadi/issues/262), `../organisations-participation/`).
- UM-17 : DB-3 livré par la PR #256 et raccordé à D-7 ; **12 suites vertes en CI** sur `570d248` (section DB-3).
- UM-15 : préproduction faite (UM-26) ; le déploiement en production exige `FADI_APP_DB_PASSWORD` dans `.env.deploy` (RUNBOOK §2–4).
- Annexe C (Infomaniak, DNS, clé de chiffrement, premier admin) : hors code.
- CI de la PR #255 : **verte** sur `81af007` (run CI 39840078841 et 5 autres workflows, 2026-10-22 19:42 UTC). Le premier passage (`cf3d56f`) échouait sur la tranche `parcours` : le scénario attendait l'ancien refus du partage vers une adresse sans compte, puis des compteurs de cache invalidés par la purge sur 401. Corrigé dans `81af007`.
- CI de la PR #255 **verte** sur `570d248` (fusion de `main` + DB-3) : run CI 39855284507 entier (validate, image, Studio V1, e2e p2 / planche / parcours / atelier / complements) et les 5 autres workflows, 2026-10-22 21:12–21:3x UTC.

## Liens de suivi

- Issue : [#253](https://github.com/RachEma-ux/Fadi/issues/253) (close le 2026-10-23, terminée)
- Préproduction : [PR #264](https://github.com/RachEma-ux/Fadi/pull/264) (outillage D-7)
- Branche de tâche : `ccr-266c1e83-7780ml` (imposée par la session, UM-12).
- Pull Request : [#255](https://github.com/RachEma-ux/Fadi/pull/255) (fusionnée le 2026-10-23, commit `516e2f7`).

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
