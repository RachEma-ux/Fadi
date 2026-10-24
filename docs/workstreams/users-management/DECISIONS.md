# Gestion des comptes — décisions

Journal du chantier `users-management` ([Issue #253](https://github.com/RachEma-ux/Fadi/issues/253)). Les décisions D-1 à D-6
sont **prises** par le maître d'ouvrage (validées le 2026-10-22) et recopiées telles quelles depuis l'annexe A du plan
([PLAN.md](PLAN.md)). Les numéros UM-x sont des arbitrages d'implémentation pris pendant l'exécution, sous la délégation
explicite du maître d'ouvrage du 2026-10-22 (« Je te délègue de répondre à toute question pour l'implémentation ») ;
ils ne réécrivent aucune décision D-x et restent révisables par lui.

## Décisions du maître d'ouvrage (annexe A, recopiées telles quelles)

| ID | Décision | Appliquée en |
|---|---|---|
| **D-1** Courriel | **Provisoire : SMTP Infomaniak** (`mail.infomaniak.com`, port 465 SSL/TLS, adresse dédiée `noreply@<domaine>`, `MAIL_FROM` = `SMTP_USER`), derrière l'interface `Mailer`, avec file d'envoi, garde-fou `MAIL_DAILY_LIMIT` et repli « lien à copier ». **Mailpit** en dev/CI. **Cible** : fournisseur transactionnel UE (Brevo, Mailjet ou Postmark UE) avant ouverture publique — bascule par variables d'environnement uniquement. | Phase 4.0, 5, 6 |
| **D-2** Admin et contenu des projets | **Non par défaut.** L'admin gère les comptes. Accès support **lecture seule**, accordé par le propriétaire, **≤ 72 h**, révocable, visible et journalisé. | Phases 1, 3, 5 |
| **D-3** Organisations / équipes | **Pas maintenant**, sauf exigence du concept. Colonne `organization_id` nullable réservée sur `users` et `projects`, sans logique. | Phase 1 |
| **D-4** Tests DB-3 | **Oui** : PostGIS **éphémère** en service conteneur GitHub Actions, attesté jetable, jamais relié à la production. | Phase 6 |
| **D-5** Suppression | **Anonymisation** après **30 jours de grâce** (annulable par lien) ; **export JSON** préalable ; transfert obligatoire des projets partagés possédés ; commentaires et révisions conservés sous « Compte supprimé ». Conforme RGPD et nLPD. | Phases 1, 4, 5 ; **amendée le 2026-10-24** (UM-27 : corbeille, « Anonymiser maintenant ») |
| **D-7** Schémas et rôles (amendement du 2026-10-22, [AMENDEMENT-D7.md](AMENDEMENT-D7.md)) | **Une seule base**, schémas `public` (tables existantes, inchangées), `auth` (tables des comptes), `admin` (audit, exploitation). **Rôles au moindre privilège** : `fadi_owner` (NOLOGIN, propriétaire), `fadi_migrator` (DDL, migrations seulement), `fadi_app` (API : DML, aucun DDL, `admin.audit_log` en SELECT / INSERT seulement), `fadi_retention` (anonymisation de colonnes du journal), `fadi_backup` (lecture seule). Mots de passe hors dépôt. Prime sur le plan pour l'emplacement des tables et les droits. | Phases 1, 6 ; amendement |
| **D-6** Mots de passe et MFA | **12 caractères min.**, 128 max., sans règles de composition, liste de mots de passe compromis, pas d'expiration. **TOTP facultatif** pour les utilisateurs, **obligatoire pour les admins** + 10 codes de secours. Session admin ≤ 24 h et 1 h d'inactivité ; utilisateur ≤ 30 j. | Phases 1, 2, 3, 5 |

## Lecture du concept (v2.2) contre chaque décision

| ID | Concept | Constat |
|---|---|---|
| D-1 | **Muet** | Le concept ne parle pas de transport ; il exige seulement que l'échec de remise d'une invitation ait une issue claire (« delivery failure … require clear recovery », v2.2) — servi par le repli « lien à copier ». |
| D-2 | **Conforme** | « Support access identifies the operator, authorizing party, purpose, resources and duration. It expires and remains traceable. Support actions must not impersonate … » (Partie 2). Ajout imposé : le **motif** (*purpose*) de l'accès est enregistré (UM-4). |
| D-3 | **Contredit** | Le concept fait de l'organisation un enregistrement partagé de base (Partie 1 « Shared records », Partie 2 « owning party », Partie 5 entière). D-3 réservait cette exception : voir UM-1. |
| D-4 | **Muet** | Aucune exigence de test d'infrastructure dans le concept. |
| D-5 | **Conforme** | « Authorship, previous approvals … retain their original attribution » (Partie 2) ; l'anonymisation conserve l'identifiant et l'attribution « Compte supprimé ». |
| D-7 | **Muet** | Le concept ne traite pas du stockage ; D-7 renforce l'exigence « autorisation à chaque opération » côté base. |
| D-6 | **Muet / conforme** | Le concept exige un compte « active and authenticated for the operation » (Partie 2, règle 1) et des états de compte distincts ; il ne fixe pas de politique de mot de passe. |

## Arbitrages d'implémentation (délégation du 2026-10-22)

- **UM-1 — Organisations (D-3 contredit).** Le concept exige les organisations, mais sa propre séquence (« Development
  sequence and completion ») place la gestion des organisations (Partie 5) **après** la revue externe (Partie 4), comme
  extension. Ce plan livre le socle compte / plateforme ; les organisations, appartenances, groupes, participations
  « contact seul », affectations de travail et la revue externe deviennent un **chantier distinct** (hors périmètre de ce
  plan, déclaré dans [MATRICE.md](MATRICE.md)). `organization_id` reste réservée et inutilisée, conformément à D-3.
  **Point à confirmer par le maître d'ouvrage** à l'ouverture de ce chantier suivant.
- **UM-2 — États de compte (le concept prime sur la tâche 1.1 du plan).** Concept : « Account — Active, locked,
  suspended or closed ». Le plan proposait `active | invited | suspended | deleted`. Retenu : `status ∈ {active,
  suspended, closed}` stocké ; **verrouillé** est l'état *dérivé* `locked_until > now()` (verrouillage progressif, levé
  par le temps) ; **closed** = compte anonymisé (le « deleted » du plan). Pas d'état `invited` : voir UM-3.
- **UM-3 — Invitations sans compte fantôme (le concept prime sur 1.3 / 4.3 du plan).** Concept : « An invitation request
  must not silently create an account for its recipient » ; « An invitation is a proposal, not a grant » ; un lien
  transféré, expiré, annulé ou décliné ne donne aucun accès ; l'acceptation revérifie l'autorité actuelle de l'invitant.
  Les invitations ont donc leur propre table `invitations` (destinataire, invitant, portée projet + rôle, expiration de
  l'invitation, expiration de l'accès, statut `pending | accepted | declined | expired | cancelled`) au lieu d'un
  `purpose = invite` de `account_tokens`. L'acceptation exige que l'adresse du compte soit celle de l'invitation.
  `account_tokens` garde `verify_email`, `reset_password`, `cancel_deletion`. Deux finalités d'invitation sur les cinq
  du concept sont livrées (`platform_account`, `project_participation`) ; les trois autres (appartenance à une
  organisation, ressource restreinte, paquet de revue figé, accès à une session en direct) sont hors périmètre (UM-1).
- **UM-4 — Accès support.** `project_support_grants` reçoit en plus `purpose` (motif obligatoire) et `revoked_by` ; le
  rôle effectif est un rôle **`support`** distinct de `lecteur` : lecture seule, **ni commentaire, ni export, ni
  téléchargement de pièce jointe**.
- **UM-5 — Sessions existantes.** L'audit montre des sessions déjà stockées côté serveur (table `sessions`) : pas de table
  `user_sessions` (tâche 1.2 conditionnelle) ; `sessions` est étendue. L'identifiant brut stocké en clé primaire est
  remplacé par son empreinte SHA-256 (`token_hash`) à la migration ; aucune session ouverte n'est perdue.
- **UM-6 — Cookie `__Host-`.** `__Host-fadi_sid` exige `Secure` : il est posé en production (`NODE_ENV=production`) ; en
  développement et en recette locale sur `http://localhost`, le nom `fadi_sid` (sans préfixe) est utilisé. L'ancien cookie
  `fadi_session` est encore **lu** pour ne déconnecter personne au déploiement, puis remplacé à la réponse suivante.
- **UM-7 — Inscription libre conservée.** `POST /auth/register` reste ouvert (scénarios e2e existants, aucun arbitrage
  contraire) ; il applique la nouvelle politique de mot de passe.
- **UM-8 — Partage avec un compte existant.** `POST /projects/:id/members` continue d'ajouter directement un compte
  existant (comportement accepté et couvert par les recettes). Le concept voudrait une proposition acceptée : écart
  déclaré « partiel » dans la matrice, à traiter avec le chantier participation (UM-1). Les adresses **sans compte**
  reçoivent désormais une invitation (tâche 4.3).
- **UM-9 — TOTP sans bibliothèque.** RFC 6238 implémentée dans `apps/api/src/lib/totp.ts` (≈ 60 lignes, vecteurs de test
  de la RFC) plutôt qu'`otplib` : moins de dépendances dans un module de sécurité. Le QR code est produit côté serveur
  (`qrcode`, SVG) ; le secret est chiffré AES-256-GCM avec `FADI_ENCRYPTION_KEY`. Sans clé configurée, l'enrôlement est
  refusé avec un message explicite (limite déclarée, jamais simulée).
- **UM-10 — Liste de mots de passe compromis.** Liste NCSC 100k (SecLists, MIT) filtrée aux entrées de 12 à 128
  caractères (les plus courtes sont déjà refusées par la longueur) : 1 259 entrées, source et empreinte en tête du
  fichier `apps/api/src/data/security/common-passwords.txt`.
- **UM-11 — Garde DB-1/2 (Phase 6, tâche 2)** — *remplacé par UM-17*. L'enrôlement d'une autorité d'attestation dans
  `approved-test-authorities.ts` exige une clé privée hors dépôt (secret GitHub) que seule l'administration du dépôt peut
  créer : **bloqué**, en attente du maître d'ouvrage (procédure dans [RUNBOOK.md](RUNBOOK.md)). Les contrôles de ce
  chantier sur base réelle passent par des scénarios HTTP (API construite + PostGIS de la CI), hors garde Vitest.
- **UM-12 — Branche unique et points d'arrêt.** La session d'exécution impose la branche `ccr-266c1e83-7780ml` : les
  phases y sont des commits distincts (un par phase) et une seule PR est ouverte, **non fusionnée** ; la revue humaine des
  phases 2, 3, 4 et de la garde DB a lieu sur cette PR. Les points d'arrêt 🛑 0 et 2 ont été franchis sous la délégation
  ci-dessus, sans fusion ni déploiement ; le point d'arrêt final reste au maître d'ouvrage.
- **UM-13 — Amendement D-7, point d'arrêt D7-0 (cas B).** Constat du 2026-10-22 : la Phase 1 avait créé ses tables dans
  `public` sur la branche `ccr-266c1e83-7780ml`, non fusionnée (commit `807eebe`) → **cas B** : la migration est corrigée
  sur la branche, chaque table créée directement dans son schéma cible — `auth.account_tokens`,
  `auth.user_recovery_codes`, `auth.invitations` (table des comptes ajoutée par UM-3), `admin.audit_log`,
  `admin.mail_outbox` ; `public.project_support_grants`. Le tableau de l'amendement cite `user_sessions` dans `auth` :
  cette table n'existe pas (UM-5, la table historique `public.sessions` est étendue) et l'amendement interdit de déplacer
  une table existante — `sessions` **reste dans `public`** (seule son empreinte de jeton y est stockée). `app_settings`,
  `worker_heartbeats` et `projects.archived_at` relèvent du plan console (non engagé ici) : non créés. Point d'arrêt
  franchi sous la délégation du 2026-10-22 ; le point d'arrêt D7-final (revue humaine avant fusion) reste au maître d'ouvrage.
- **UM-14 — Création des rôles et des mots de passe.** `init.sql` crée les rôles **sans mot de passe** seulement si le
  rôle qui migre en a le droit (super-utilisateur ou CREATEROLE), transfère la propriété à `fadi_owner` quand il est
  super-utilisateur, et rejoue les droits quand il est membre de `fadi_owner`. Les mots de passe viennent de
  l'environnement du serveur (`FADI_APP_DB_PASSWORD`, `FADI_MIGRATOR_DB_PASSWORD`, `FADI_RETENTION_DB_PASSWORD`,
  `FADI_BACKUP_DB_PASSWORD`) et sont appliqués après la migration (`db/role-passwords.ts`), jamais écrits ni journalisés.
- **UM-15 — Démarrage en production.** L'API refuse de démarrer en production si son rôle peut créer des objets dans
  `public` ; `ALLOW_PRIVILEGED_DB_ROLE=1` n'existe que pour le retour arrière documenté (ancienne `DATABASE_URL`).
  `docker-compose.yml` passe en `fadi_app` (nouvelle variable obligatoire `FADI_APP_DB_PASSWORD` dans `.env.deploy`) :
  **changement à appliquer au déploiement suivant la fusion**, procédure dans RUNBOOK.md — aucun déploiement fait ici.
- **UM-16 — Journal d'audit et rétention.** Le déclencheur append-only laisse le seul rôle `fadi_retention` modifier
  `actor_id`, `ip`, `metadata` (droit de colonne + contrôle du déclencheur : action, cible et date inchangées) ; la
  suppression reste refusée à tous. La tâche de rétention elle-même appartient au plan console (non engagé).
- **UM-17 — DB-3 (2026-10-22).** Autorisation du propriétaire (Issue #166). La PR #256, fusionnée dans `main`, livre la
  garde ouverte (clé `fadi-ci-db3` enregistrée, préparation `scripts/db3/preparer-base-test.mjs`, contrôle
  `--db3-actif`). La tentative parallèle de ce chantier (`db3-attest.mjs`, clé `owner-db3-2026-10`) est retirée à la
  fusion de `main` pour ne garder qu'une implémentation ; seul le raccord D-7 (droits du rôle de test sur `auth` /
  `admin`, journal d'audit append-only) est ajouté au script de `main`. Remplace le blocage UM-11. Trois données ou
  attentes de `app.test.ts` sont alignées sur les règles déjà décidées (12 caractères, D-6 ; invitation d'une adresse
  sans compte, UM-3), sans retirer de vérification.
- **UM-18 — Assurance de session (revue de sécurité de la PR #255, 2026-10-22).** Constat : `/admin/*` vérifiait
  l'enrôlement TOTP **du compte** (`totp_enabled_at`) ; une session ouverte au mot de passe seul avant l'activation
  (navigateur B) devenait une session d'administration sans jamais fournir de code. Décision d'implémentation : colonne
  additive `sessions.mfa_verified_at` (NULL = mot de passe seul, y compris toute session antérieure : échec fermé),
  posée seulement par la connexion avec un code TOTP ou de secours, ou par l'activation du TOTP **depuis cette session** ;
  `requirePlatformRole("admin")` exige TOTP actif (`mfa_required`, enrôlement inchangé) **et** une preuve de session
  postérieure à l'activation courante (`mfa_session_required`). L'activation révoque, dans la même transaction (compte
  verrouillé), toutes les autres sessions ; la désactivation efface les preuves et révoque les autres sessions. La
  promotion (administration, `create-admin.mjs`) ferme déjà les sessions du compte.
- **UM-19 — Verrou d'éligibilité des administrateurs (revue de sécurité de la PR #255).** Constat : l'auto-suppression
  et la suppression par l'administration vérifiaient « un autre administrateur actif existe » dans une transaction puis
  programmaient la suppression dans une autre ; deux demandes simultanées pouvaient laisser zéro administrateur.
  Décision : `lib/admin-eligibility.ts` — un verrou consultatif transactionnel unique (`pg_advisory_xact_lock(253, 1)`),
  toujours pris en premier par toute opération qui peut retirer un administrateur actif (auto-suppression, suppression,
  suspension, rétrogradation), relecture des administrateurs actifs sous ce verrou, contrôle et mutation (journal, révocation
  des sessions, jeton d'annulation, courriel en file) dans la même transaction. Un seul verrou pris en premier : aucun
  ordre concurrent, aucun interblocage. Refus métier inchangé : 409 `last_admin`.
- **UM-20 — Capacité « export » (revue de sécurité de la PR #255).** Constat : la liste noire de chemins de
  `supportReadOnlyGuard` oubliait les routes de production de documents (`/documents/surfaces`, `/programme`,
  `/fiches`, `/dossier-exemple`, `/plan/:levelId`…), qui acceptaient le rôle `support`, écrivaient une trace de production
  et servaient le fichier ; l'identifiant lu dans `req.path` brut ignorait l'encodage en pourcent, alors qu'Express le
  décode pour `:projectId`. Décision : besoin `export` dans `lib/owned-project.ts` (propriétaire, éditeur, lecteur —
  inchangés ; jamais `support`), déclaré par chaque route qui sort du contenu : documents produits (catalogue, Atelier,
  dessins), archive, copie, pièces jointes, rapports Harmonie et bilan, exports IFC / STEP / CSV de l'Atelier, fichiers de
  publication, exports et fichiers Studio, et source d'une référence externe. La garde de chemin résout le projet comme
  le routeur (décodage) et reste une défense supplémentaire ; elle journalise toujours chaque lecture (`support.accessed`).
- **UM-21 — Voie d'annulation d'une suppression sans courriel (revue Codex de `fcb0dd1`, 2026-10-23).** Constat : sans
  transport de courriel (défaut de `docker-compose.yml`) ou au quota, le courriel portant le lien d'annulation était
  écarté alors que la suppression était programmée, les sessions révoquées et la connexion bloquée : aucune voie
  d'annulation avant l'anonymisation à 30 jours. Décision (repli D-1, comme les invitations) : quand le courriel n'est
  pas mis en file, `DELETE /auth/me` rend le lien d'annulation à la personne qui vient de s'authentifier (affiché avant la
  déconnexion), et `DELETE /admin/users/:id` à l'administrateur, à transmettre au titulaire.
- **UM-22 — Migration hors du processus de l'API (revue Codex de `fcb0dd1`).** Constat : `docker-compose.yml` donnait à
  l'API, processus long, l'identifiant d'administration de la base (`DATABASE_MIGRATION_URL`) ; une compromission du
  processus le relirait et contournerait `fadi_app`. Décision : service à usage unique `migrate` (`MIGRATE_ONLY=1` : schéma,
  mots de passe des rôles, arrêt sans écouter) ; `app` en dépend (`service_completed_successfully`), ne reçoit que
  `DATABASE_URL` en `fadi_app` et refuse de démarrer en production si `DATABASE_MIGRATION_URL` lui est donné
  (`ALLOW_PRIVILEGED_DB_ROLE=1` reste réservé au retour arrière). La CI de l'image suit le même schéma en deux temps.
- **UM-23 — Compteur d'échecs de connexion atomique (revue Codex de `fcb0dd1`).** Constat : le compteur était lu puis
  réécrit ; cinq échecs simultanés laissaient `failed_login_count = 1`, sans verrouillage. Décision : incrément en base
  (`failed_login_count + 1 … RETURNING`) et durée de verrouillage calculée sur la valeur renvoyée, dans la même transaction.
- **UM-24 — Fusion de la PR #255 (2026-10-23).** Le maître d'ouvrage a fusionné la PR #255 dans `main` le 2026-10-23 à
  06:23 UTC (commit de fusion `516e2f7`, tête `dd784bc`) ; CI de `main` verte. Cette décision clôt les points d'arrêt
  🛑 2, D7-final et final, qui attendaient sa revue sur la PR (UM-12, UM-13) : les mentions « non fusionnée » et
  « revue à venir » de ces entrées décrivent l'état d'alors. Restent ouverts : le déploiement (RUNBOOK.md, accord explicite
  du maître d'ouvrage) et UM-1 (organisations, non approuvé).
- **UM-25 — UM-1 levé (2026-10-23).** Le maître d'ouvrage ouvre le chantier « Organisations, participation et revue
  externe ». Priorité : participants, invitations acceptées, revue externe. Le suivi passe à
  [`../organisations-participation/`](../organisations-participation/CONTEXT.md) ([Issue #262](https://github.com/RachEma-ux/Fadi/issues/262)).
  Ce chantier-ci ne garde que le déploiement.
- **UM-26 — Préproduction déployée, Issue #253 close (2026-10-23).** L'outillage de préproduction est rendu compatible
  avec D-7 par la PR #264 (service `migrate` à usage unique, application en `fadi_app`, `init-env` qui ajoute
  `PREPROD_FADI_APP_DB_PASSWORD` et `PREPROD_FADI_ENCRYPTION_KEY`). Le déploiement automatique a mis `02329e1` en
  préproduction (`fadi-preprod status`, relevé par le maître d'ouvrage : étape `fin`, résultat `succes` à 15:28:46 UTC,
  build, migrate, up, smoke, `/version` et e2e courts ; application saine). `build` et `migrate` refusent de tourner sans
  `PREPROD_FADI_APP_DB_PASSWORD` : leur succès établit que `init-env` a été lancé. Le maître d'ouvrage clôt l'Issue #253
  (terminée). Reste ouvert : le déploiement en **production** (RUNBOOK.md), sur son accord explicite ; la production
  tourne toujours l'ancienne version.
- **UM-27 — Corbeille et « Anonymiser maintenant » : amendement de D-5 (2026-10-24).** Décision du maître d'ouvrage,
  relayée par la session d'exploitation « Fadi VPS - Audit » : « Ajoute l'option anonymiser maintenant et ajoute une
  corbeille pour accueillir les éléments supprimés ». D-5 reste la règle par défaut (anonymisation à 30 jours, annulable
  par lien) ; l'amendement ajoute, **pour les comptes seulement**, une corbeille d'administration et la possibilité pour un
  administrateur d'anonymiser avant l'échéance. Concept v2.2 : **muet** (aucune exigence de corbeille ; l'attribution
  « Compte supprimé » est inchangée, Partie 2). Arbitrages d'implémentation :
  - *Contenu de la corbeille* : les comptes en suppression programmée (`deletion_requested_at` posé, statut stocké
    `active` ou `suspended`), avec date d'anonymisation prévue (`anonymisationAt` = demande + 30 jours, la même borne que
    la tâche), demandeur (titulaire ou administrateur, lu dans l'entrée du journal qui a programmé la suppression) et
    projets partagés qui bloquent l'anonymisation. **Les comptes anonymisés n'y figurent pas** : l'anonymisation est
    irréversible, il ne reste rien à restaurer, et une « trace non restaurable » ferait de la corbeille une seconde liste
    des comptes fermés ; leur trace reste le statut « fermé (anonymisé) » du tableau des comptes et le journal d'audit.
  - *« Restaurer »* : `cancelScheduledDeletion`, la voie unique du lien d'annulation (`POST /auth/cancel-deletion`) et de
    la corbeille (`POST /admin/users/:id/restore`). La programmation ne modifie pas le statut stocké : il est rétabli tel
    quel (un compte suspendu reste suspendu). Les liens d'annulation encore valides sont consommés ; journal
    `admin.user.deletion_cancelled`. Aucun courriel au titulaire (pas de gabarit ; non demandé).
  - *« Anonymiser maintenant »* (`POST /admin/users/:id/anonymize { confirmEmail }`) : n'accepte qu'un compte de la
    corbeille ; exécute `anonymiseAccountIn`, **le code même de la tâche des 30 jours** (`lib/account-jobs.ts`, sans
    seconde implémentation) ; adresse du compte ressaisie et revérifiée côté serveur ; refus : soi-même (422), hors corbeille
    ou déjà anonymisé (409), adresse différente (422), projets partagés possédés (409). Transaction sous le verrou
    d'éligibilité des administrateurs (UM-19) puis verrou de ligne : deux appels simultanés donnent un 200 et un 409. Le
    journal reçoit **une** entrée `admin.user.anonymized_now` (acteur = administrateur, `deletedProjects`, `scheduledFor`),
    à la place de l'entrée système `account.anonymized` de la tâche. MFA de session exigée comme pour tout `/admin`.
  - *Dernier administrateur* : la règle est relue sous le verrou, mais elle ne peut pas se déclencher par cette route :
    un administrateur en suppression programmée ne compte déjà plus parmi les administrateurs actifs (UM-19) et l'acteur
    ne peut pas viser son propre compte. Vérifié en test pur (refus `last_admin`) et sur base (DB-3 : anonymiser un
    administrateur de la corbeille ne change pas le nombre d'administrateurs actifs).
  - *Hors périmètre, signalé* : aucune corbeille pour les projets ou documents. Le concept ne l'exige pas. Conséquence à
    connaître : l'anonymisation (à 30 jours ou immédiate) supprime les projets **non partagés** du compte ; « Anonymiser
    maintenant » supprime donc la fenêtre de 30 jours pendant laquelle le titulaire pouvait encore annuler et exporter.
    La boîte de confirmation le dit. Étendre la corbeille aux projets serait une nouvelle décision du maître d'ouvrage.
  - *Fusion* : demandée par le maître d'ouvrage dans la session d'exécution le 2026-10-24 (« fusionne #270 »), après
    fusion de `main` (UM-28) dans la branche et CI verte ; méthode de fusion habituelle du dépôt (commit de fusion).
- **UM-28 — Courriel en préproduction, domaines réservés jamais envoyés (2026-10-24).** Demande du maître d'ouvrage,
  relayée par la session d'exploitation du VPS : en préproduction, les invitations et les autres courriels de compte
  partent par SMTP (`noreply@fadimmo.com`, Infomaniak, D-1 ; SPF / DKIM / DMARC vérifiés par lui). Constats :
  `deploy/preprod/compose.yml` ne transmettait aucune variable de courriel au service `app` ; la préproduction rejoue à
  chaque déploiement des recettes qui inscrivent des comptes `@example.com` / `@example.test`, qui partiraient en vrais
  courriels voués au rebond (quota Infomaniak, réputation de `fadimmo.com`). Arbitrage :
  1. `compose.yml` (service `app` seulement) transmet `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
     `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_DAILY_LIMIT`, `MAIL_RECIPIENT_HOURLY_LIMIT` depuis des variables
     `PREPROD_*` toutes facultatives : sans `PREPROD_MAIL_TRANSPORT`, aucun envoi (comportement antérieur) ; quota
     prudent par défaut `MAIL_DAILY_LIMIT=50`. La garde d'isolation refuse `SMTP_PASS` hors du service `app` (jamais à
     la recette ni à la migration). Les variables sont ajoutées à la main par l'administrateur (RUNBOOK §3 bis), jamais
     par `init-env`.
  2. Mailer : en SMTP, un destinataire de domaine réservé (RFC 2606 / 6761 : `example.com`, `example.net`,
     `example.org` et leurs sous-domaines, `*.example`, `*.test`, `*.invalid`, `*.localhost`, `localhost` ; adresse sans
     domaine) n'est jamais mis en file : ligne `skipped`, raison `reserved_domain`, `queued: false`, l'interface garde le
     lien à copier ; pas d'entrée d'audit (non-envoi déclaré, comme `disabled`, pas un dépassement). Vaut en production
     (sans effet sur de vraies adresses). Les transports `console` et absent ne remettent rien : non concernés.
  3. La CI (et le développement local) envoie vers Mailpit des comptes `@example.test` et y lit les liens : elle pose
     `MAIL_ALLOW_RESERVED_DOMAINS=true`, que `readMailConfig` **refuse en production** (refus de démarrer) et qui
     n'accepte que `true` / `false`. Solution retenue parce qu'elle est la plus simple et sûre : la préproduction et la
     production tournent en `NODE_ENV=production` et ne peuvent donc jamais l'activer, même par erreur de fichier
     d'environnement ; aucune liste d'hôtes SMTP « de capture » à maintenir ; les recettes ne changent pas d'adresses.
- **UM-30 — Langue des courriels : celle de l'interface, jamais celle du navigateur (2026-10-24).** Demande du maître
  d'ouvrage (« Corrige la langue des courriels en français »), relayée par la session d'exploitation du VPS. Constat
  vérifié en préproduction : une invitation créée depuis l'Administration affichée en français est partie en anglais
  (« Invitation to join Fadi »). Cause : `mailLocale` retombait sur l'en-tête `Accept-Language` du navigateur de
  l'administrateur (téléphone réglé en anglais) quand le client ne transmettait pas la langue, ce qui était le cas de la
  plupart des appels. Arbitrage :
  1. Serveur (`apps/api/src/lib/mail-locale.ts`, réexporté par `lib/account.ts`) : `mailLocale` ne lit plus jamais
     `Accept-Language` ; langue = valeur explicite (`locale` du corps, ou valeur déjà validée par le schéma de la route)
     si elle vaut `fr` ou `en`, sinon **`fr`**, langue source (D-163). Aucun compte n'enregistre de préférence de langue
     (schéma `users` vérifié) : aucun champ n'est créé ; un courriel adressé à un compte existant suit donc la langue
     de l'interface de la personne qui déclenche l'envoi, sinon le français.
  2. Client (`apps/web/src/lib/api.ts`) : chaque appel qui déclenche un courriel envoie `locale` = langue de l'interface
     (`LANGUE`, sélecteur Français / English) — inscription (`verify_email`), nouvelle demande de vérification,
     mot de passe oublié (`reset_password`), réinitialisation et changement du mot de passe (`password_changed`),
     activation et désactivation de la double authentification (`mfa_enabled`, `mfa_disabled`), suppression du compte
     par le titulaire ou par un administrateur (`deletion_scheduled`), suspension (`account_suspended`), invitation par
     l'administration et invitation à un projet (`invitation`). Recensement : tous les appels à `sendAccountMail`, seul
     point d'entrée de la file (`enqueueMail`).
  3. Formulaire d'invitation de l'Administration : choix « Langue du courriel : Français / English », par défaut la
     langue de l'interface de l'administrateur (texte français dans le code, traduction dans `en.json` ; liste marquée
     `translate="no"` comme le sélecteur de langue). Ce n'est pas une commande ni un outil (champ d'un formulaire
     existant, soumis par le bouton « Envoyer l'invitation » déjà présent) : la règle d'or (icône, barre, raccourci) ne
     s'applique pas. L'invitation à un projet (Collaboration) suit la langue de l'interface sans choix supplémentaire.
  4. Vérifié par `mail-locale.test.ts` (en-tête anglais sans valeur explicite → `fr` ; explicite `en` → `en` ; valeur
     invalide → `fr`) et par `comptes-admin.mjs` (section 5 bis : navigateur en anglais, interface en français → sujet
     « Invitation à rejoindre Fadi » lu dans Mailpit ; choix « English » → « Invitation to join Fadi »). Aucune
     migration ; aucun déploiement sans accord du maître d'ouvrage.
  - *Fusion* : demandée par le maître d'ouvrage dans la session d'exécution le 2026-10-24 (« fusionne #275 »), après CI
    verte du dernier commit ; méthode de fusion habituelle du dépôt (commit de fusion). Aucun déploiement demandé.
