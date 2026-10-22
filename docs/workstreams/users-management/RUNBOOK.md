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
`MAIL_TRANSPORT=console` est refusé en production.

## 4. Migration et bascule vers `fadi_app`

`docker-compose.yml` connecte désormais l'API en `fadi_app` et migre au démarrage avec le compte d'administration
(`DATABASE_MIGRATION_URL`) :

```sh
docker compose --env-file .env.deploy up -d --build app
docker compose --env-file .env.deploy logs app | grep -E "Schema applied|D-7|Courriel|listening"
```

Attendu : `Schema applied`, `D-7 : mot de passe appliqué pour fadi_app`, `Courriel : transport smtp`, `listening`.
L'API **refuse de démarrer en production** si son rôle peut créer des objets dans `public` (D-7).

Vérification des droits (lecture seule) :

```sh
docker compose --env-file .env.deploy exec db psql -U fadi -d fadi -c "SELECT has_schema_privilege('fadi_app','public','CREATE') AS ddl, has_table_privilege('fadi_app','admin.audit_log','UPDATE') AS audit_update"
# attendu : f | f
```

## 5. Courriel de test

Depuis l'application (compte existant) : Paramètres → Mon compte → « Vérifier mon adresse », ou « Mot de passe oublié »
avec une adresse de l'exploitant. Contrôler la réception, l'expéditeur, le lien (`APP_PUBLIC_URL`), et l'absence de
pixel de suivi. En cas d'échec : `admin.mail_outbox.last_error` (sans contenu de lien), 3 tentatives (30 s, 2 min, 8 min).

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

Autorisation du propriétaire : Issue #166 (« J'autorise DB-3 : base de test jetable en CI »). Mise en place :

1. **Clé** : paire Ed25519 générée **par le propriétaire**, hors de toute session IA. Clé publique enregistrée par le
   propriétaire dans `apps/api/src/testing/approved-test-authorities.ts` (entrée `owner-db3-2026-10`, commit `bdeeb73`) ;
   le registre n'accepte aucune clé par variable d'environnement, par conception.
2. **Secret** : clé privée (PEM PKCS#8, ou ce PEM encodé en base64) dans le secret GitHub Actions
   `FADI_TEST_DB_SIGNING_KEY`. Jamais affichée ; `scripts/validation/db3-attest.mjs` vérifie que la clé publique dérivée
   du secret est **exactement** celle du registre.
3. **CI** (job `validate`, étape « DB-3 — base jetable attestée ») :
   - base `fadi_db3_run` créée dans le service PostGIS éphémère du job, migrée par le compte d'administration du
     conteneur (rôles D-7 créés, mot de passe aléatoire masqué pour `fadi_app`) ;
   - marqueur `fadi_test_meta.provisioning` créé par l'administrateur, lisible mais non modifiable par le rôle de test
     (vérifié) ; rôle de test `fadi_app` sans privilège d'administration (vérifié) — il reçoit, dans cette base jetable
     seulement, TRUNCATE pour la remise à zéro des suites ;
   - attestation canonique liée au run (`gh-<run>-<tentative>`) et au commit, valable 55 min, signée puis supprimée du
     runner après les tests ;
   - les 12 suites historiques passent par la garde existante (aucune vérification retirée) ; `check-api-tests-db3.mjs
     --db3` exige qu'elles **s'exécutent et réussissent**.
4. **Secret absent** (PR externe, secret non créé) : l'étape le déclare (avertissement et résumé « DB-3 — non exécuté »)
   et les suites restent refusées par la garde ; rien n'est simulé.
5. **Rotation** : nouvelle paire générée par le propriétaire → PR qui remplace l'entrée du registre (revue humaine) →
   mise à jour du secret ; l'ancienne clé ne doit plus figurer au registre.

Correctif de la garde nécessaire au premier essai réel : `IDENTITY_SQL` lisait `inet_server_addr()::text`, qui ajoute le
masque (`172.18.0.2/32`), alors que l'adresse attestée est une IP nue — `host(inet_server_addr())` ; la comparaison reste
stricte (tests de la garde : 173 verts).
