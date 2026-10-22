# Plan d'implémentation — Gestion des comptes (Users Management)

> **Destinataire : Claude Code**, exécuté dans le dépôt `RachEma-ux/Fadi`.
> À placer dans `docs/workstreams/users-management/PLAN.md` puis lancer :
> `claude "Exécute docs/workstreams/users-management/PLAN.md, phase par phase, en respectant les points d'arrêt."`

---

## 0. Règles d'exécution (à lire avant tout)

1. **Ordre strict des phases** : 0 → 1 → 2 → 3 → 4 → 5 → 6. Ne commence jamais une phase avant que les critères d'acceptation de la précédente soient verts.
2. **Une phase = une Issue + une branche courte + une PR** (`feat/um-<phase>-<sujet>`). Pas de push direct sur `main`.
3. **Points d'arrêt 🛑** : à chaque 🛑, tu t'arrêtes, tu résumes ce qui est fait et tu attends la validation humaine.
4. **Le concept prime** : après la Phase 0, le fichier `docs/workstreams/users-management/concept.md` est la source normative. Si une tâche de ce plan contredit le concept, **le concept gagne** : signale l'écart dans `STATUS.md` et adapte la tâche.
5. **Rien n'est inventé** : si une capacité manque (ex. service de courriel), on la déclare comme limite dans l'interface, on ne la simule pas.
6. **Migrations additives et idempotentes** uniquement, dans `apps/api/src/db/init.sql` + `apps/api/src/db/schema.ts`. Jamais de `DROP` ni de colonne `NOT NULL` sans défaut sur une table existante.
7. **Autorisation côté serveur à chaque requête**, échec fermé (droit inconnu = refus).
8. **i18n** : tout texte d'interface en français dans le code + clé dans `apps/web/src/lib/i18n/en.json`.
9. **Accessibilité** : WCAG 2.2 AA, passage axe-core sur chaque nouvel écran (bureau + téléphone).
10. **Aucun déploiement**, aucune modification d'environnement de production, aucun secret en clair dans le code, les logs ou les commits.
11. **Checkpoint après chaque phase** : mettre à jour `docs/workstreams/users-management/STATUS.md` et `HANDOFF.md`, et `docs/continuity/README.md` si le processus l'exige.
12. Avant chaque PR : `npm run typecheck`, `npm test`, `npm run build` doivent passer. Distinguer explicitement dans la PR les tests **réussis** et **non exécutés** (garde DB-1/2).

---

## Phase 0 — Cadrage : extraire le concept et auditer l'existant

**But** : remplacer toute hypothèse par les exigences réelles.

### Tâches
1. Créer `docs/workstreams/users-management/` avec `STATUS.md`, `HANDOFF.md`, `DECISIONS.md`.
2. Extraire le document :
   ```bash
   pandoc "Fadi Concept/Fadi Concept - Users Management.docx" -t gfm \
     -o docs/workstreams/users-management/concept.md
   ```
   (repli : `npx mammoth` ou `python -m docx2txt`). Vérifier que tableaux et listes sont lisibles.
3. Ajouter un test anti-dérive (même principe que celui de la Définition V2.1 du Studio) qui échoue si le `.docx` change sans que `concept.md` soit régénéré (comparaison d'empreinte SHA-256 stockée dans un fichier `.sha256`).
4. Auditer le code et consigner les réponses dans `STATUS.md` :
   - algorithme et paramètres de hachage des mots de passe (`apps/api/src/routes/auth.ts`, `package.json`) ;
   - nature de la session (cookie opaque + table, cookie signé, JWT ?) et révocabilité ;
   - colonnes actuelles de la table `users` (`schema.ts`, `init.sql`) ;
   - application réelle de `AUTH_RATE_LIMIT` (fenêtre, clé) ;
   - le défaut signalé en PR #1 : à l'expiration de session (401 sur `/auth/me`), le cache TanStack Query persisté et IndexedDB (Dexie) sont-ils purgés ?
5. Produire `docs/workstreams/users-management/MATRICE.md` : une ligne par exigence du concept
   `| ID | Exigence | Module | Code existant | Test | Statut (en place / partiel / manquant / hors périmètre) |`.
6. Créer `DECISIONS.md` en recopiant **telles quelles** les décisions D-1 à D-6 de l'annexe A (elles sont **prises**). Pour chacune, ajouter une ligne « Concept : conforme / contredit / muet » après lecture de `concept.md`.

### Acceptation
- `concept.md` existe, test anti-dérive vert.
- Chaque exigence du concept a un ID et un statut ; les 5 questions d'audit ont une réponse sourcée (fichier + ligne).

### 🛑 Point d'arrêt 0
Présente : résumé du concept, matrice, réponses d'audit, et **les ajustements que le concept impose aux phases 1–6**. Si le concept **contredit** une décision de l'annexe A (en particulier D-3 : organisations/équipes), signale-le explicitement : c'est à l'humain de trancher. Attends la validation avant de coder.

---

## Phase 1 — Modèle de données et journal d'audit

### Tâches
1. **`users`** — colonnes ajoutées (toutes nullable ou avec défaut) :
   - `status text not null default 'active'` + `CHECK (status in ('active','invited','suspended','deleted'))`
   - `platform_role text not null default 'user'` + `CHECK (platform_role in ('user','admin'))`
   - `email_verified_at timestamptz`, `last_login_at timestamptz`, `password_changed_at timestamptz`, `deleted_at timestamptz`
   - `failed_login_count int not null default 0`, `locked_until timestamptz`
   - `deletion_requested_at timestamptz` (D-5 : délai de grâce de 30 jours)
   - `totp_secret_enc text` (secret TOTP **chiffré** avec une clé `FADI_ENCRYPTION_KEY` en variable d'environnement), `totp_enabled_at timestamptz` (D-6)
   - `organization_id uuid null` (D-3 : réservée, **aucune** logique ne l'utilise pour l'instant)
   - (ajuster la liste des rôles/statuts selon le concept)
1bis. **`projects`** : ajouter `organization_id uuid null` (D-3, réservée, inutilisée).
1ter. **`user_recovery_codes`** (D-6) : `id`, `user_id`, `code_hash`, `used_at`. 10 codes de secours générés à l'activation de la double authentification.
1quater. **`project_support_grants`** (D-2) : `id`, `project_id`, `admin_id`, `granted_by` (le propriétaire), `granted_at`, `expires_at` (max. 72 h), `revoked_at`. Accès **lecture seule**.
2. **`user_sessions`** (seulement si l'audit montre que les sessions ne sont pas déjà stockées côté serveur) :
   `id uuid pk`, `user_id fk`, `token_hash text unique` (SHA-256, jamais le jeton brut), `created_at`, `last_seen_at`, `expires_at`, `absolute_expires_at`, `revoked_at`, `user_agent`, `ip`. Index sur `user_id`.
3. **`account_tokens`** : `id`, `user_id` (nullable), `email`, `purpose` (`invite` | `verify_email` | `reset_password` | `cancel_deletion`), `token_hash unique`, `payload jsonb` (ex. projet + rôle d'une invitation), `expires_at`, `used_at`, `created_by`, `created_at`.
4. **`audit_log`** append-only : `id bigserial`, `actor_id`, `action text`, `target_type`, `target_id`, `metadata jsonb`, `ip`, `created_at default now()`. Déclencheur qui refuse `UPDATE`/`DELETE` (même modèle que l'immuabilité de `studio_revisions`).
5. Module `apps/api/src/lib/audit.ts` : `audit(tx, { actorId, action, target, metadata, ip })`, utilisé dans la même transaction que l'action tracée.
6. Mettre à jour le script de sauvegarde/restauration (`scripts/verify-restore.sh`) pour couvrir les nouvelles tables.

### Tests
- Migration jouée 2 fois de suite sans erreur ; puis sur une base contenant des utilisateurs existants (tous restent `active`/`user`).
- `UPDATE`/`DELETE` sur `audit_log` rejetés.
- Contraintes `CHECK` rejettent les valeurs invalides.

### Acceptation
`npm run db:migrate` idempotent, aucun comportement existant modifié, restauration vérifiée.

---

## Phase 2 — Durcissement de l'authentification

### Tâches
1. **Hachage** : si l'existant n'est pas Argon2id (≥ 19 MiB, 2 itérations, parallélisme 1) ou bcrypt coût ≥ 12, introduire Argon2id avec **réhachage transparent à la connexion réussie** (détection par le préfixe du hash stocké).
2. **Politique de mot de passe** (D-6, `apps/api/src/lib/password-policy.ts`, fonction pure) : **longueur min. 12**, max. accepté 128, **aucune règle de composition**, refus des mots de passe courants/compromis (liste embarquée, ex. top 100k, versionnée dans le dépôt — pas d'appel réseau), pas d'expiration périodique. Indicateur de robustesse côté interface.
2bis. **Double authentification TOTP** (D-6, bibliothèque `otplib` ou équivalent maintenu) :
   - **facultative** pour les utilisateurs, **obligatoire** pour tout compte `platform_role = 'admin'` : un admin sans TOTP actif ne peut accéder à aucune route `/admin/*` et est redirigé vers l'enrôlement ;
   - enrôlement : QR code + saisie d'un code pour confirmer ; génération de 10 codes de secours (affichés une fois, stockés hachés) ;
   - connexion en 2 étapes : mot de passe → état de session « partiellement authentifiée » (5 min max) → code TOTP ou code de secours ;
   - tolérance ±1 pas de 30 s, refus de la réutilisation d'un même code, limitation de débit sur la saisie du code ;
   - désactivation : mot de passe + code requis ; journalisée.
3. **Sessions** : cookie `__Host-fadi_sid`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/` ; nouveau jeton à chaque connexion ; expiration glissante + plafond absolu (utilisateur : 30 j max ; admin : 24 h max et 1 h d'inactivité) ; refus immédiat si `users.status <> 'active'`.
4. **Révocation** : changement ou réinitialisation de mot de passe ⇒ révoque toutes les autres sessions.
5. **Anti-abus** : `AUTH_RATE_LIMIT` actif en production, par IP **et** par identifiant ; verrouillage progressif via `failed_login_count`/`locked_until` ; message identique « identifiants invalides » ; vérification d'un hash factice si le compte n'existe pas (temps constant).
6. **CSRF** : middleware vérifiant `Origin` / `Sec-Fetch-Site` sur toute requête non-GET authentifiée par cookie.
7. **Client** (`apps/web`) : sur 401 de `/auth/me` **ou** à la déconnexion → vider le cache TanStack Query (mémoire + persistance), purger Dexie (files hors ligne) et `fadi.lastUser`. Interdire de rejouer la file hors ligne d'un utilisateur sous la session d'un autre (stocker `userId` avec chaque entrée de file et filtrer).
8. Journaliser dans `audit_log` : connexion réussie/échouée, verrouillage, changement de mot de passe, révocation.

### Tests
- Unitaires : politique de mot de passe (11 caractères refusé, 12 accepté, mot de passe courant refusé), détection/réhachage, calcul de verrouillage, vérification TOTP (fenêtre, rejeu), codes de secours à usage unique.
- API : 401 sur session expirée/révoquée/compte suspendu, 429 au-delà du seuil, réponse identique compte inconnu/mauvais mot de passe.
- E2E (étendre `apps/web/e2e/scenarios/00-compte.mjs`) : A se connecte → session expire → B se connecte sur le même navigateur → **aucune donnée de A visible**.

### Acceptation
Aucun mot de passe ni jeton brut en base ou dans les logs ; tests ci-dessus verts.

### 🛑 Point d'arrêt 2
Changement sensible (sessions de tous les utilisateurs). Présente la PR et attends la revue humaine avant fusion.

---

## Phase 3 — RBAC plateforme (administrateur)

### Tâches
1. Middleware `requirePlatformRole('admin')` dans `apps/api/src/lib/platform-access.ts`, à côté de `projectOr404`.
2. Routeur isolé `apps/api/src/routes/admin/` monté sur `/admin` ; un non-admin reçoit **404** (non-divulgation, comme les projets).
3. **Séparation des pouvoirs (D-2)** : l'admin gère les **comptes**, **jamais** le contenu des projets par défaut. Le rôle admin ne doit rien changer au résultat de `projectOr404`.
   - Accès support : le **propriétaire** du projet accorde un accès via `POST /projects/:id/support-grants` (admin désigné, durée ≤ 72 h) ; révocable par `DELETE`.
   - `loadProjectAccess` reconnaît une autorisation `project_support_grants` active et non expirée comme un rôle **lecteur** (lecture seule, pas de commentaire, pas d'export).
   - Bandeau visible dans le projet pour l'admin (« Accès support jusqu'au … ») et notification au propriétaire à l'ouverture.
   - Chaque accès et chaque lecture → `audit_log`.
4. Garde-fous : impossible de modifier son propre rôle ou de se suspendre ; impossible de retirer le **dernier** admin (vérif. transactionnelle) ; tout changement de rôle journalisé.
5. Amorçage : `apps/api/scripts/create-admin.mjs` (lit l'e-mail en argument, promeut un compte existant ou crée une invitation ; n'affiche aucun secret).
6. Étendre le générateur de matrice de permissions (`PERMISSIONS.md`) aux routes `/admin/*` avec les acteurs : admin, utilisateur, utilisateur suspendu, anonyme. Clarifier au passage l'incohérence 6 vs 7 acteurs de la PR #204.

### Tests
Matrice générée couvrant 100 % des routes déclarées ; cas « dernier admin » ; accès direct par URL refusé ; admin **sans** accès support → 404 sur tout projet ; admin avec accès support → lecture OK, écriture 403, accès expiré → 404 ; admin sans TOTP → refusé sur `/admin/*`.

---

## Phase 4 — Cycle de vie des comptes

### 4.0 Service de courriel (D-1 : SMTP Infomaniak provisoire)

1. Interface `Mailer` dans `apps/api/src/lib/mailer/index.ts` : `send({ to, template, data, locale })`. Le code métier ne connaît **que** cette interface.
2. Implémentations, choisies par `MAIL_TRANSPORT` :
   - `console` : écrit le courriel dans les logs (sans le jeton en clair en production : en production ce transport est **interdit**, l'API refuse de démarrer) ;
   - `smtp` : `nodemailer`, configuré uniquement par variables d'environnement.
3. Variables à ajouter à `apps/api/.env.example` (valeurs factices, **aucun secret commité**) :
   ```
   MAIL_TRANSPORT=smtp            # console | smtp
   SMTP_HOST=mail.infomaniak.com
   SMTP_PORT=465
   SMTP_SECURE=true               # SSL/TLS implicite
   SMTP_USER=noreply@exemple.ch   # adresse complète
   SMTP_PASS=change-me
   MAIL_FROM="Fadi <noreply@exemple.ch>"   # DOIT être identique à SMTP_USER (exigence Infomaniak)
   MAIL_DAILY_LIMIT=150           # garde-fou Fadi, < quota Infomaniak
   APP_PUBLIC_URL=https://…       # pour construire les liens
   ```
4. Validation au démarrage : si `MAIL_TRANSPORT=smtp`, vérifier la présence des variables et que l'adresse de `MAIL_FROM` = `SMTP_USER` ; sinon échec explicite.
5. **Garde-fou de quota** : compteur glissant sur 24 h (table `mail_outbox` ou compteur en base) ; au-delà de `MAIL_DAILY_LIMIT`, ne pas envoyer, journaliser, et répondre à l'interface par le **lien à copier** (repli déclaré, pas d'échec silencieux). Limite supplémentaire par destinataire (ex. 5 courriels/heure) contre le spam de « mot de passe oublié ».
6. **Envoi non bloquant** : table `mail_outbox` (`id`, `to`, `template`, `payload` jsonb **sans jeton en clair si possible**, `status`, `attempts`, `last_error`, `sent_at`) + petit worker en boucle dans le processus API, 3 tentatives avec attente croissante. Les routes ne dépendent jamais de la disponibilité SMTP.
7. **Gabarits** FR/EN (`apps/api/src/lib/mailer/templates/`) : invitation, vérification d'e-mail, réinitialisation, mot de passe modifié, double authentification activée/désactivée, compte suspendu, suppression programmée (avec lien d'annulation). Version texte + HTML simple, aucun pixel de suivi.
8. **Dev et CI** : service **Mailpit** dans `docker-compose` de dev et dans la CI (`SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `SMTP_SECURE=false`). Les tests e2e récupèrent les liens via l'API HTTP de Mailpit. Aucun courriel réel n'est envoyé hors recette/production.
9. Documenter dans `RUNBOOK.md` : création de l'adresse `noreply@…` chez Infomaniak, vérification SPF/DKIM/DMARC du domaine, rotation du mot de passe SMTP, et **procédure de bascule** vers un fournisseur transactionnel (Brevo/Mailjet/Postmark UE) = changement de variables seulement.

> Le transport SMTP Infomaniak est **provisoire** : adapté au développement, à la recette et à un petit nombre d'utilisateurs (quota de 200 à 500 envois / 24 h selon l'offre). À remplacer avant une ouverture publique.

### Tâches
1. **Machine d'états** (fonction pure, testée) : `invited → active → suspended ⇄ active → deleted` ; toute autre transition rejetée.
2. **Jetons** : 32 octets aléatoires, stockés hachés, usage unique, expiration (invitation 7 j, vérif. e-mail 24 h, reset 1 h).
3. **Invitation** : `POST /admin/users/invitations` ; extension de `POST /projects/:id/members` aux adresses sans compte (invitation portant `projectId` + rôle dans `payload`).
4. **Activation** : `POST /auth/activate` (jeton + mot de passe + acceptation des conditions) → `active`, rattachement aux projets de l'invitation.
5. **Vérification d'e-mail** : `POST /auth/verify-email/request`, `POST /auth/verify-email/confirm`.
6. **Mot de passe oublié** : `POST /auth/forgot-password` (réponse identique que le compte existe ou non), `POST /auth/reset-password` (révoque toutes les sessions).
7. **Changement de mot de passe** : `POST /auth/me/password` (ancien mot de passe requis).
8. **Suspension / réactivation** : `POST /admin/users/:id/suspend|reactivate` → révocation des sessions + libération des `projects.editing_lock` détenus.
9. **Suppression (D-5)** :
   - `GET /auth/me/export` : export JSON des données personnelles (profil, appartenances, commentaires rédigés, journal d'audit le concernant).
   - `DELETE /auth/me` (mot de passe + confirmation) et `DELETE /admin/users/:id` : refus tant que l'utilisateur est **propriétaire de projets partagés** → proposer le transfert (`…/members/:userId/propriete`).
   - Sinon : `deletion_requested_at = now()`, sessions révoquées, connexion bloquée, courriel avec lien d'annulation (`cancel_deletion`, valable 30 j).
   - Tâche planifiée quotidienne (dans le worker) : au-delà de 30 jours → `status = 'deleted'`, anonymisation (e-mail remplacé par `deleted-<id>@invalid`, nom effacé, hash de mot de passe, TOTP et codes de secours supprimés), projets non partagés supprimés, commentaires et révisions conservés sous « Compte supprimé ».
   - Conforme RGPD et nLPD : l'anonymisation est irréversible ; le journal d'audit conserve l'`id` mais plus l'e-mail.
10. **Sessions** : `GET /auth/me/sessions`, `DELETE /auth/me/sessions/:id`, `DELETE /auth/me/sessions` (toutes sauf courante) ; `POST /admin/users/:id/revoke-sessions`.
11. Chaque action → `audit_log`.

### Tests
Machine d'états (tous les cas interdits) ; jeton expiré/réutilisé refusé ; suppression avec projets possédés refusée ; annulation de suppression dans le délai ; anonymisation après 30 j (horloge simulée) ; garde-fou de quota courriel (bascule vers le lien à copier) ; démarrage refusé si `MAIL_FROM` ≠ `SMTP_USER` ; E2E (via Mailpit) invitation → courriel reçu → activation → accès au projet → suspension → connexion refusée.

---

## Phase 5 — Écrans

### Tâches
1. **Administration** `/admin/utilisateurs` (route chargée à la demande, comme le Studio) :
   - tableau paginé : e-mail, nom, rôle, statut, dernière connexion, nombre de projets ; recherche + filtres (statut, rôle) ;
   - fiche utilisateur : projets, sessions, historique d'audit ;
   - actions : inviter, changer le rôle, suspendre, réactiver, révoquer les sessions, supprimer — toutes avec boîte de confirmation.
2. **Mon compte** (dans Paramètres) : profil, changement de mot de passe, double authentification (activer/désactiver, QR code, codes de secours), sessions ouvertes (« Cette session », « Déconnecter les autres »), export de mes données, suppression du compte (avec mention du délai de 30 jours).
2bis. **Projet → Membres** : section « Accès support » pour le propriétaire (accorder à un admin, durée, révoquer, historique).
3. **Pages publiques** : activation d'invitation, mot de passe oublié, réinitialisation, vérification d'e-mail, saisie du code TOTP à la connexion, annulation de suppression.
3bis. Quand le garde-fou de quota courriel est atteint, l'écran d'invitation affiche le **lien à copier** avec un message clair (« Le courriel n'a pas pu être envoyé, transmettez ce lien »).
4. **État client** : hook `usePlatformRole()` ; clés TanStack Query dédiées (`['admin','users',filtres]`) ; mutations d'administration **jamais** mises en file hors ligne (désactivées hors connexion, avec message).
5. Entrée de menu « Administration » visible seulement pour un admin (la protection reste serveur).
6. Textes FR + `en.json` ; lancer `interface-anglais.mjs` (seuil 2 %).

### Acceptation
axe-core sans violation critique/sérieuse sur chaque écran (bureau + téléphone) ; e2e vert.

---

## Phase 6 — Tests, recette et préparation de mise en production

### Tâches
1. Nouveau segment e2e `apps/web/e2e/scenarios/NN-comptes-admin.mjs` enchaîné par `run.mjs`.
2. Tests API sur base réelle (D-4) : ajouter dans `.github/workflows/ci.yml` un **service conteneur** `postgis/postgis:16-3.4` éphémère, exposé uniquement au job, avec `TEST_DATABASE_URL` pointant dessus. Faire reconnaître cette cible par la garde DB-1/2 (inscription au registre d'autorités comme base **jetable attestée** : nom de base dédié, hôte `localhost` du runner, refus si l'URL ressemble à la production). Jamais de secret de production dans la CI. Vérifier que les 12 suites historiques passent de « NON EXÉCUTÉES » à « réussies ». 🛑 Ce changement de garde exige la revue humaine.
2bis. Ajouter le service **Mailpit** au même workflow (voir 4.0 §8).
3. Drapeau `FADI_ADMIN_ENABLED` (défaut `false`) qui masque `/admin` et les nouvelles pages tant qu'il n'est pas activé.
4. Rédiger `docs/workstreams/users-management/RUNBOOK.md` : sauvegarde préalable → migration → configuration des variables SMTP Infomaniak et `FADI_ENCRYPTION_KEY` → envoi d'un courriel de test → création du 1er admin via le script → enrôlement TOTP de l'admin → activation du drapeau → recette → sauvegarde post-validation → procédure de retour arrière. Inclure la bascule future vers un fournisseur transactionnel.
5. Mettre à jour la matrice `MATRICE.md` : chaque exigence du concept = « en place » avec lien vers code + test, ou « hors périmètre » justifié.

### 🛑 Point d'arrêt final
Rapport : statut de chaque exigence (vérifié / configuré non vérifié / bloqué, avec preuve), tests réussis vs non exécutés, risques restants. **Aucun déploiement** sans accord explicite.

---

## Annexe A — Décisions prises (à recopier dans `DECISIONS.md`)

Statut : **validées le 2026-10-22** par le maître d'ouvrage. Seule exception possible : un point que le document de concept contredit (à signaler au point d'arrêt 0).

| ID | Décision | Appliquée en |
|---|---|---|
| **D-1** Courriel | **Provisoire : SMTP Infomaniak** (`mail.infomaniak.com`, port 465 SSL/TLS, adresse dédiée `noreply@<domaine>`, `MAIL_FROM` = `SMTP_USER`), derrière l'interface `Mailer`, avec file d'envoi, garde-fou `MAIL_DAILY_LIMIT` et repli « lien à copier ». **Mailpit** en dev/CI. **Cible** : fournisseur transactionnel UE (Brevo, Mailjet ou Postmark UE) avant ouverture publique — bascule par variables d'environnement uniquement. | Phase 4.0, 5, 6 |
| **D-2** Admin et contenu des projets | **Non par défaut.** L'admin gère les comptes. Accès support **lecture seule**, accordé par le propriétaire, **≤ 72 h**, révocable, visible et journalisé. | Phases 1, 3, 5 |
| **D-3** Organisations / équipes | **Pas maintenant**, sauf exigence du concept. Colonne `organization_id` nullable réservée sur `users` et `projects`, sans logique. | Phase 1 |
| **D-4** Tests DB-3 | **Oui** : PostGIS **éphémère** en service conteneur GitHub Actions, attesté jetable, jamais relié à la production. | Phase 6 |
| **D-5** Suppression | **Anonymisation** après **30 jours de grâce** (annulable par lien) ; **export JSON** préalable ; transfert obligatoire des projets partagés possédés ; commentaires et révisions conservés sous « Compte supprimé ». Conforme RGPD et nLPD. | Phases 1, 4, 5 |
| **D-6** Mots de passe et MFA | **12 caractères min.**, 128 max., sans règles de composition, liste de mots de passe compromis, pas d'expiration. **TOTP facultatif** pour les utilisateurs, **obligatoire pour les admins** + 10 codes de secours. Session admin ≤ 24 h et 1 h d'inactivité ; utilisateur ≤ 30 j. | Phases 1, 2, 3, 5 |

## Annexe B — Prérequis de gouvernance

- Activer la protection de branche sur `main` (Issue #146) **avant** de fusionner les phases 2 à 4.
- Une PR par phase, revue humaine obligatoire pour les phases 2, 3 et 4, et pour la modification de la garde DB-1/2 (Phase 6).
- Secrets (`SMTP_PASS`, `FADI_ENCRYPTION_KEY`) : uniquement dans les variables d'environnement du serveur ou les secrets GitHub, jamais dans le dépôt ni dans les logs.

## Annexe C — Prérequis côté maître d'ouvrage (hors code)

- Créer chez Infomaniak l'adresse `noreply@<domaine>` et fournir ses identifiants **hors dépôt**.
- Vérifier SPF, DKIM et DMARC du domaine dans le Manager Infomaniak.
- Générer `FADI_ENCRYPTION_KEY` (32 octets aléatoires, ex. `openssl rand -base64 32`) et la conserver dans un coffre.
- Choisir l'e-mail du premier administrateur.
