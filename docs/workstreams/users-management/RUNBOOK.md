# Gestion des comptes — runbook de mise en production

Chantier `users-management` ([Issue #253](https://github.com/RachEma-ux/Fadi/issues/253)). Ce document décrit les
opérations **à faire par l'exploitant**, dans l'ordre, après fusion et accord explicite du maître d'ouvrage. **Rien de
ce qui suit n'a été exécuté en production** : aucun déploiement n'est fait par le chantier.

Secrets (`SMTP_PASS`, `FADI_ENCRYPTION_KEY`, mots de passe des rôles PostgreSQL) : uniquement dans `.env.deploy` sur le
serveur ou dans les secrets GitHub ; jamais dans le dépôt, un ticket, un journal ou une conversation.

## 0. Prérequis du maître d'ouvrage (annexe C du plan)

1. Adresse dédiée `noreply@<domaine>` créée chez Infomaniak (Manager → Service Mail), mot de passe conservé dans le coffre.
2. SPF, DKIM et DMARC du domaine vérifiés dans le Manager Infomaniak (Domaine → Zone DNS) : `v=spf1 include:spf.infomaniak.ch -all`,
   DKIM activé pour le domaine, enregistrement `_dmarc` au minimum `v=DMARC1; p=quarantine; rua=mailto:…`.
3. `FADI_ENCRYPTION_KEY` générée une fois (`openssl rand -base64 32`) et conservée dans le coffre : **la perdre rend les
   secrets TOTP illisibles** (chaque utilisateur devrait réactiver sa double authentification).
4. Adresse du premier administrateur choisie.
5. Protection de branche sur `main` active (Issue #146) avant la fusion des phases 2 à 4.

## 1. Sauvegarde préalable

```sh
docker compose --env-file .env.deploy exec backup fadi-backup db fadi fadi /backups   # dump + définition des rôles
```

Copier le dump hors de la machine (procédure `docs/deploiement.md`). Noter le commit déployé actuel (`/version`).

## 2. Rôles PostgreSQL (D-7)

La migration crée elle-même les rôles `fadi_owner` (NOLOGIN), `fadi_migrator`, `fadi_app`, `fadi_retention`,
`fadi_backup` quand elle tourne avec le compte d'administration de la base (`POSTGRES_USER` du conteneur), transfère la
propriété des tables à `fadi_owner` et accorde les droits. Les mots de passe viennent de l'environnement :

| Variable (`.env.deploy`) | Rôle | Obligatoire |
|---|---|---|
| `FADI_APP_DB_PASSWORD` | `fadi_app` (API) | oui |
| `FADI_RETENTION_DB_PASSWORD` | `fadi_retention` (rétention du journal, plan console) | non |
| `FADI_MIGRATOR_DB_PASSWORD` | `fadi_migrator` (migrations hors démarrage) | non |
| `FADI_BACKUP_DB_PASSWORD` | `fadi_backup` (`pg_dump` en lecture seule) | non |

Ajouter dans `.env.deploy` : `FADI_APP_DB_PASSWORD=<long, unique>` (et les autres si utilisés).

## 3. Variables de l'application

Dans `.env.deploy` (voir `.env.deploy.example`) :

```sh
FADI_ADMIN_ENABLED=false            # activé à l'étape 8 seulement
FADI_ENCRYPTION_KEY=<coffre>
MAIL_TRANSPORT=smtp
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@<domaine>
SMTP_PASS=<coffre>
MAIL_FROM="Fadi <noreply@<domaine>>"   # même adresse que SMTP_USER, sinon l'API refuse de démarrer
MAIL_DAILY_LIMIT=150                # sous le quota Infomaniak (200 à 500 / 24 h selon l'offre)
```

Sans `MAIL_TRANSPORT`, l'API démarre mais n'envoie rien : les écrans affichent le lien à copier (limite déclarée).
`MAIL_TRANSPORT=console` est refusé en production. En SMTP, un destinataire de domaine réservé (`example.com`,
`*.test`, `*.invalid`, `*.localhost`… — RFC 2606 / 6761) n'est jamais envoyé : raison `reserved_domain`, lien à copier
(UM-28). `MAIL_ALLOW_RESERVED_DOMAINS=true` (Mailpit en CI / dev) est refusé en production.

## 3 bis. Courriel en préproduction (UM-28)

La préproduction (`deploy/preprod/compose.yml`) lit les mêmes variables, préfixées `PREPROD_`, toutes facultatives :
sans `PREPROD_MAIL_TRANSPORT`, rien n'est envoyé. Les recettes rejouées à chaque déploiement inscrivent des comptes
`@example.com` / `@example.test` : ils ne partent jamais (domaines réservés). `SMTP_PASS` n'est donné qu'au service
`app`, jamais à la recette (garde `fadi-preprod garde`).

1. L'administrateur (root) ajoute à `/opt/fadi-preprod/env/.env.preprod` (0600, jamais affiché, jamais commité) :

   ```sh
   PREPROD_MAIL_TRANSPORT=smtp
   PREPROD_SMTP_HOST=mail.infomaniak.com     # défaut
   PREPROD_SMTP_PORT=465                     # défaut
   PREPROD_SMTP_SECURE=true                  # défaut
   PREPROD_SMTP_USER=noreply@fadimmo.com
   PREPROD_SMTP_PASS=<mot de passe de la boîte noreply, coffre>
   PREPROD_MAIL_FROM="Fadi <noreply@fadimmo.com>"   # même adresse que PREPROD_SMTP_USER
   PREPROD_MAIL_DAILY_LIMIT=50               # défaut prudent de la préproduction
   # PREPROD_MAIL_RECIPIENT_HOURLY_LIMIT=5   # défaut
   ```

   puis vérifie les droits : `stat -c %a /opt/fadi-preprod/env/.env.preprod` → `600`.
2. `sudo fadi-preprod garde` puis `sudo fadi-preprod up` : l'application est recréée avec les nouvelles variables
   (une configuration invalide — `MAIL_FROM` ≠ `SMTP_USER`, variable manquante — fait refuser le démarrage : le
   journal `sudo fadi-preprod logs app` le dit, sans afficher le mot de passe).
3. Journal de démarrage attendu (`sudo fadi-preprod logs app`) : « Courriel : transport smtp ; domaines réservés jamais envoyés. »
4. Contrôle : §5 avec une adresse réelle de l'exploitant (invitation ou « Mot de passe oublié »).
5. Retour arrière : retirer `PREPROD_MAIL_TRANSPORT` (ou le laisser vide) puis `sudo fadi-preprod up` ; les liens à
   copier reviennent.

## 4. Migration et bascule vers `fadi_app`

`docker-compose.yml` sépare la migration de l'API (revue de la PR #255) : le service à usage unique `migrate`
(`MIGRATE_ONLY=1`) applique le schéma et les mots de passe des rôles avec le compte d'administration de la base, puis
s'arrête ; `app` ne démarre qu'après sa réussite et se connecte en `fadi_app` **sans** l'identifiant de migration (l'API
refuse de démarrer en production si `DATABASE_MIGRATION_URL` lui est donné) :

```sh
docker compose --env-file .env.deploy up -d --build app      # lance d'abord `migrate`, puis `app`
docker compose --env-file .env.deploy logs migrate | grep -E "Schema applied|D-7|Migration terminée"
docker compose --env-file .env.deploy logs app | grep -E "Courriel|listening"
```

Attendu : `Schema applied`, `D-7 : mot de passe appliqué pour fadi_app`, `Migration terminée` (migrate), puis
`Courriel : transport smtp`, `listening` (app).
L'API **refuse de démarrer en production** si son rôle peut créer des objets dans `public` (D-7).

Vérification des droits (lecture seule) :

```sh
docker compose --env-file .env.deploy exec db psql -U fadi -d fadi -c "SELECT has_schema_privilege('fadi_app','public','CREATE') AS ddl, has_table_privilege('fadi_app','admin.audit_log','UPDATE') AS audit_update"
# attendu : f | f
```

### 4 bis. Effets du correctif de sécurité de la PR #255 (assurance de session)

- La migration ajoute `sessions.mfa_verified_at` (colonne nullable, additive). Toute session ouverte avant le déploiement
  n'a **aucune** preuve de double authentification : un administrateur connecté reçoit 403 `mfa_session_required` sur
  `/admin/*` et doit **se déconnecter puis se reconnecter avec son code** (l'écran le dit). Les comptes non
  administrateurs ne sont pas touchés.
- Retour arrière : l'ancienne version ignore la colonne ; aucune donnée à restaurer.
- L'accès support ne peut plus produire, exporter, télécharger ni copier (403 `support_no_export`) ; la lecture reste
  permise et journalisée.
- Sans transport de courriel, une suppression programmée rend son lien d'annulation à la personne (Mon compte) ou à
  l'administrateur, à transmettre au titulaire (UM-21).
- Migration : service à usage unique `migrate` (§4) ; une ancienne `.env.deploy` reste valable, aucune variable nouvelle.

## 5. Courriel de test

Depuis l'application (compte existant) : Paramètres → Mon compte → « Vérifier mon adresse », ou « Mot de passe oublié »
avec une adresse de l'exploitant. Contrôler la réception, l'expéditeur, le lien (`APP_PUBLIC_URL`), et l'absence de
pixel de suivi. En cas d'échec : `admin.mail_outbox.last_error` (sans contenu de lien), 3 tentatives (30 s, 2 min, 8 min).
Une adresse de domaine réservé (`@example.com`, `@….test`) n'est jamais envoyée (`last_error = reserved_domain`) : tester
avec une vraie boîte.

## 6. Premier administrateur

```sh
docker compose --env-file .env.deploy exec app node apps/api/scripts/create-admin.mjs prenom.nom@<domaine>
```

- Compte existant : promu administrateur (ses sessions sont fermées).
- Pas de compte : invitation d'amorçage déposée dans la file et envoyée (7 jours) ; le lien n'est jamais affiché.
  Sans transport de courriel : créer le compte par l'inscription puis relancer le script.

## 7. Double authentification de l'administrateur

Se connecter → Paramètres → Mon compte → Double authentification → scanner le QR code, saisir le code, **conserver les
10 codes de secours hors ligne**. Sans elle, `/admin/*` répond 403 `mfa_required` (D-6).

## 8. Activation de l'administration

`FADI_ADMIN_ENABLED=true` dans `.env.deploy`, puis `docker compose --env-file .env.deploy up -d app`. Vérifier :
`/admin/utilisateurs` accessible à l'administrateur, **404** pour tout autre compte et pour un visiteur anonyme.

## 9. Recette en production

Avec deux comptes de test : inscription (12 caractères minimum), vérification d'e-mail, connexion en deux étapes de
l'administrateur, invitation d'une adresse de test, accès support accordé puis révoqué par un propriétaire,
suspension / réactivation, mot de passe oublié. Supprimer ensuite les comptes de test (suppression programmée, 30 jours).

## 10. Sauvegarde post-validation

Refaire l'étape 1 et conserver ce dump comme point de retour.

## 11. Retour arrière

1. Désactiver l'administration : `FADI_ADMIN_ENABLED=false`, redémarrer l'application.
2. Revenir à l'image précédente (commit noté à l'étape 1). Le schéma ajouté est **additif** : l'ancienne version ignore
   les colonnes et schémas nouveaux ; les sessions ouvertes depuis la bascule ne sont pas reconnues par l'ancienne version
   (nouvelle connexion nécessaire).
3. Si l'ancienne version doit se connecter avec l'ancien compte : remettre l'ancienne `DATABASE_URL` (compte
   d'administration) ; pour la version nouvelle, `ALLOW_PRIVILEGED_DB_ROLE=1` lève le refus de démarrage — **réservé au
   retour arrière**, à retirer dès que possible.
4. En dernier recours : restauration du dump de l'étape 1 (`scripts/restore.sh`), puis rejouer `init.sql` (droits D-7).

## 12. Bascule future vers un fournisseur transactionnel (cible D-1)

Brevo, Mailjet ou Postmark (région UE) : créer l'expéditeur vérifié, puis changer **seulement** les variables
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (même adresse que `SMTP_USER`, ou adapter
si le fournisseur sépare identifiant et expéditeur — le contrôle de démarrage l'exige aujourd'hui) et relever
`MAIL_DAILY_LIMIT`. Aucun changement de code. À faire **avant toute ouverture publique**.

## 13. Rotation

- Mot de passe SMTP : le changer chez Infomaniak, mettre à jour `SMTP_PASS`, redémarrer l'application ; les courriels en
  attente sont renvoyés (3 tentatives).
- Mot de passe d'un rôle PostgreSQL : changer la variable `FADI_*_DB_PASSWORD`, redémarrer l'application (la migration
  l'applique au démarrage).
- `FADI_ENCRYPTION_KEY` : pas de rotation automatique (les secrets TOTP seraient illisibles) ; une rotation exige que
  chaque utilisateur réactive sa double authentification — à planifier comme un chantier.

## 14. Garde DB-3 (D-4) — base de test jetable attestée en CI

Autorisation du propriétaire : Issue #166 (« J'autorise DB-3 : base de test jetable en CI »). L'implémentation retenue
est celle fusionnée dans `main` par la PR #256 (Issue #157) ; ce chantier s'y raccorde :

1. **Clé** : paire Ed25519 générée par le propriétaire ; clé publique enregistrée sous `fadi-ci-db3` dans
   `apps/api/src/testing/approved-test-authorities.ts` (PR #256) ; clé privée dans le secret GitHub Actions
   `FADI_TEST_DB_SIGNING_KEY`. Aucune clé n'est enrôlée par variable d'environnement.
2. **CI** (job `validate`, étape « Tests API — sur base jetable attestée (DB-3) ») : `scripts/db3/preparer-base-test.mjs`
   prépare la base jetable du job (rôle `fadi_test` sans privilège d'administration, marqueur `fadi_test_meta.provisioning`
   non modifiable par lui, attestation ≤ 55 min liée au run et au commit), puis toutes les suites API tournent derrière
   la garde et `check-api-tests-db3.mjs --db3-actif` exige leur réussite.
3. **Raccord gestion des comptes (D-7)** : la préparation donne au rôle de test les mêmes droits sur les schémas `auth`
   et `admin` que sur `public`, sauf `admin.audit_log` (SELECT, INSERT seulement : append-only conservé).
4. **Secret absent** (PR d'un fork) : la garde reste fermée et le contrôle historique s'applique (suites déclarées non
   exécutées) ; rien n'est simulé.
5. **Rotation** : nouvelle paire générée par le propriétaire → PR relue qui remplace l'entrée du registre → secret mis à jour.
