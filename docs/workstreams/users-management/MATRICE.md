# Gestion des comptes — matrice des exigences du concept

Source : [concept.md](concept.md) (Fadi Concept — Users Management v2.2). Une ligne par exigence vérifiable. Colonnes :
**Initial** = constat de l'audit Phase 0 (2026-10-22, commit `9d466f8`) ; **Statut** = état à la fin du plan
(`en place` / `partiel` / `manquant` / `hors périmètre`), avec la preuve. « Hors périmètre » renvoie à UM-1
([DECISIONS.md](DECISIONS.md)) : chantier organisations / participation / revue externe distinct.

Légende des preuves : `api:` = `apps/api/src/…`, `web:` = `apps/web/src/…`, `e2e:` = `apps/web/e2e/…`.

## Partie 1 — Définition

| ID | Exigence | Module | Code existant (initial) | Test | Initial | Statut |
|---|---|---|---|---|---|---|
| C1-01 | Un compte identifie et attribue les actions ; l'authentification seule ne donne aucun accès projet | Compte | api:lib/owned-project.ts (`loadProjectAccess`) | e2e:comptes-api.mjs (admin sans accès support → 404) | en place | en place |
| C1-02 | Trois contextes (plateforme, organisation, projet) sans catégories exclusives ; rôles plateforme distincts | Plateforme | aucun rôle plateforme | api:lib/platform-access.test.ts ; e2e:comptes-api.mjs | manquant | partiel — rôle plateforme `admin` livré ; contexte organisation hors périmètre |
| C1-03 | Enregistrements personne/contact, organisation, appartenance, participation, affectation de travail, affectation d'accès | Organisation / Projet | `project_members` (accès seul) | — | partiel | hors périmètre (UM-1) |
| C1-04 | Identité unique ; pas de fusion automatique sur nom ou contact non vérifié | Compte | e-mail unique (`users_email_unique`) | e2e:comptes-api.mjs (lien transféré refusé, adresse vérifiée) | partiel | en place — vérification d'e-mail livrée, aucune fusion automatique |
| C1-05 | Participants (annuaire, contacts sans accès) et équipe = vues des mêmes enregistrements | Projet | — | — | manquant | hors périmètre (UM-1) |
| C1-06 | Responsabilité métier, travail affecté et permission inspectables séparément | Projet | rôles Studio (permissions) | — | partiel | hors périmètre (UM-1) |
| C1-07 | Administration plateforme : personnel Fadi, responsabilités plateforme, contrôles opérationnels autorisés | Plateforme | — | e2e:comptes-admin.mjs | manquant | en place — `/admin/utilisateurs` |

## Partie 2 — Accès et propriété

| ID | Exigence | Module | Code existant (initial) | Test | Initial | Statut |
|---|---|---|---|---|---|---|
| C2-01 | Propriétaire / gardien du projet, distinct de la direction, de l'auteur et de l'approbation | Projet | `projects.owner_id`, transfert `…/propriete` | api:app.test.ts (DB-3) | partiel | partiel — gardien unique ; adjoints et partie propriétaire (organisation) hors périmètre |
| C2-02 | Le droit d'agir et le droit d'accorder sont séparés ; un admin n'accorde que dans sa délégation | Plateforme | — | api:lib/platform-access.test.ts | manquant | en place pour la plateforme (admin ≠ contenu, D-2) ; délégation fine hors périmètre |
| C2-03 | Évaluation à chaque action : compte actif et authentifié, participation active, grant valide, restriction prioritaire, délais | Accès | `projectOr404` (participation) | api:lib/security/security.test.ts ; e2e:comptes-api.mjs (suspendu → 401) | partiel | en place — statut du compte et session revérifiés à chaque requête ; restrictions explicites hors périmètre |
| C2-04 | Révocation appliquée à la prochaine action, même depuis un écran déjà ouvert | Accès | session relue à chaque requête | e2e:comptes-api.mjs (session révoquée → 401) | partiel | en place |
| C2-05 | Vue d'accès effectif (qui peut quoi, où, jusqu'à quand, par quelle affectation) | Accès | — | — | manquant | partiel — fiche utilisateur admin (projets, rôles, accès support, sessions) ; vue complète hors périmètre |
| C2-06 | Transfert accepté par le successeur ; attribution historique conservée | Projet | transfert immédiat sans acceptation | — | partiel | partiel — transfert existant conservé, acceptation hors périmètre (UM-1) |
| C2-07 | Suspension urgente possible ; perte du dernier gardien → voie de reprise autorisée | Plateforme | — | e2e:comptes-api.mjs (suspension, verrous) ; api:lib/platform-access.test.ts (dernier admin) | manquant | en place — suspension, garde du dernier admin, libération des verrous ; reprise d'un projet orphelin = transfert par le propriétaire avant suppression (D-5) |
| C2-08 | Accès support : opérateur, autorisant, motif, ressources, durée ; expire ; traçable ; aucune usurpation | Support | — | e2e:comptes-api.mjs ; e2e:comptes-admin.mjs | manquant | en place (D-2, UM-4) |
| C2-09 | Droits de téléchargement / export explicites | Accès | rôles `lecteur` | e2e:comptes-securite.mjs ; api:app.test.ts (DB-3) ; api:lib/support-path.test.ts | partiel | partiel — capacité `export` déclarée par chaque route (UM-20), jamais à l'accès support ; grille fine hors périmètre |

## Partie 3 — Parcours

| ID | Exigence | Module | Code existant (initial) | Test | Initial | Statut |
|---|---|---|---|---|---|---|
| C3-01 | Invitation : destinataire, contexte, rôle, portée, expiration ; aperçu avant envoi | Invitations | partage d'un compte existant seulement | e2e:comptes-admin.mjs | manquant | partiel — destinataire, projet, rôle, expirations, statut ; aperçu = récapitulatif avant confirmation |
| C3-02 | Une invitation ne crée pas de compte en silence | Invitations | — | api:lib/security/security.test.ts ; e2e:comptes-api.mjs | en place (pas d'invitation) | en place (UM-3) |
| C3-03 | Renvoi sans multiplier les participants (règle visible) | Invitations | — | api:lib/security/security.test.ts ; e2e:comptes-api.mjs | manquant | en place — une invitation en attente par (adresse, projet) : le renvoi remplace le jeton |
| C3-04 | Acceptation liée à l'identité vérifiée ; mauvais compte, lien transféré, expiré, annulé, décliné → aucune activation | Invitations | — | api:lib/security/security.test.ts ; e2e:comptes-api.mjs | manquant | en place |
| C3-05 | Revalidation de l'autorité de l'invitant et de la portée à l'activation | Invitations | — | api:lib/security/security.test.ts ; e2e:comptes-api.mjs | manquant | en place |
| C3-06 | États séparés : compte (actif, verrouillé, suspendu, fermé), invitation (en attente, acceptée, déclinée, expirée, annulée) | Compte | — | api:lib/security/security.test.ts | manquant | en place (UM-2) ; appartenance / participation / affectation hors périmètre |
| C3-07 | Session expirée ou interrompue : l'utilisateur voit si l'opération a été enregistrée ; reprise sans doublon | Client | files hors ligne avec `requestId` | e2e:comptes-admin.mjs (A révoqué puis B, même navigateur) ; web:lib/auth-purge.test.ts | partiel | partiel — purge et cloisonnement par utilisateur livrés ; mutations d'administration jamais mises en file |
| C3-08 | Affectations de travail, délégation, fin de participation | Projet | — | — | manquant | hors périmètre (UM-1) |
| C3-09 | Interface : libellés clairs, clavier, erreurs lisibles, confirmations qui nomment la conséquence | Interface | — | e2e:comptes-admin.mjs (axe-core) | — | en place — boîtes de confirmation, axe-core |

## Parties 4, 5, 6 — Revue externe, organisations, collaboration

| ID | Exigence | Module | Initial | Statut |
|---|---|---|---|---|
| C4-01 | Paquet de revue figé, invitation nominative, espace de revue externe, cycle de corrections | Revue externe | manquant | hors périmètre (UM-1) — séquence du concept : chantier suivant |
| C4-02 | Trois échéances indépendantes : expiration de l'invitation, de l'accès, date de réponse | Invitations | manquant | partiel — expiration de l'invitation et de l'accès stockées séparément ; date de réponse hors périmètre |
| C5-01 | Espace organisation : membres, groupes, ressources partagées, administration déléguée, gabarits | Organisation | manquant | hors périmètre (UM-1, D-3) |
| C6-01 | Mentions, abonnements et notifications ne donnent aucun accès ; accès revérifié à l'envoi et à l'ouverture | Collaboration | partiel (notifications existantes) | partiel — les courriels de compte ne portent aucun contenu de projet ; reste hors périmètre |
| C6-02 | Décisions formelles distinctes de la discussion | Collaboration | en place (Studio) | hors périmètre — inchangé |

## Section v2.2 — invitations

| ID | Exigence | Statut |
|---|---|---|
| V22-01 | Users Management fait autorité pour identités, invitations et grants | en place pour comptes, invitations plateforme / projet et accès support |
| V22-02 | Cinq finalités d'invitation | partiel — 2/5 (`platform_account`, `project_participation`) ; les 3 autres hors périmètre (UM-3) |
| V22-03 | Enregistrer destinataire, autorité invitante, actions, portée, expirations, statut, historique | en place (table `invitations`, `audit_log`) ; « partie représentée » hors périmètre |
| V22-04 | Acceptation : identité visée, autorité actuelle de l'invitant, activation idempotente | en place |
| V22-05 | Échec de remise : reprise claire | en place — repli « lien à copier » (D-1) |
| V22-06 | Révocation retire l'accès dépendant sans effacer l'auteur | en place (suspension, accès support, suppression D-5) |

## Exigences du plan (D-1 à D-6) — traçabilité

| ID | Exigence | Statut |
|---|---|---|
| P-01 | Argon2id ≥ 19 MiB, t=2, p=1 ; réhachage transparent | en place (déjà conforme ; détection `needsRehash`) |
| P-02 | Politique 12–128, sans composition, liste compromise, pas d'expiration | en place |
| P-03 | TOTP facultatif / obligatoire admin, 10 codes de secours, ±1 pas, anti-rejeu | en place |
| P-04 | Sessions : cookie `__Host-`, glissante + plafond (30 j / 24 h + 1 h), statut revérifié | en place (UM-6) |
| P-05 | Verrouillage progressif, limite par IP et identifiant, temps constant | en place |
| P-06 | CSRF par `Origin` / `Sec-Fetch-Site` | en place |
| P-07 | Purge client (cache, Dexie, `fadi.lastUser`) sur 401 et déconnexion ; file hors ligne par utilisateur | en place |
| P-08 | Journal d'audit append-only dans la transaction | en place |
| P-09 | Courriel : `Mailer`, console / SMTP, outbox, quota, repli lien, gabarits FR/EN, Mailpit | en place |
| P-10 | Suppression : export, 30 j de grâce, anonymisation | en place |
| P-11 | Tests DB-3 sur PostGIS éphémère attesté | en place — 12 suites (105 tests) vertes en CI sur `570d248`, clé `fadi-ci-db3` (UM-17, STATUS.md) |
| P-13 | D-7 : schémas `auth` / `admin`, rôles au moindre privilège, `fadi_app` sans DDL, audit non modifiable | en place — `scripts/validation/users-migration-check.mjs` (SET ROLE par rôle), `verify-restore.sh` (droits identiques) |
| P-12 | Drapeau `FADI_ADMIN_ENABLED` | en place |
