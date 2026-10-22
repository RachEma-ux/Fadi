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
| **D-5** Suppression | **Anonymisation** après **30 jours de grâce** (annulable par lien) ; **export JSON** préalable ; transfert obligatoire des projets partagés possédés ; commentaires et révisions conservés sous « Compte supprimé ». Conforme RGPD et nLPD. | Phases 1, 4, 5 |
| **D-6** Mots de passe et MFA | **12 caractères min.**, 128 max., sans règles de composition, liste de mots de passe compromis, pas d'expiration. **TOTP facultatif** pour les utilisateurs, **obligatoire pour les admins** + 10 codes de secours. Session admin ≤ 24 h et 1 h d'inactivité ; utilisateur ≤ 30 j. | Phases 1, 2, 3, 5 |

## Lecture du concept (v2.2) contre chaque décision

| ID | Concept | Constat |
|---|---|---|
| D-1 | **Muet** | Le concept ne parle pas de transport ; il exige seulement que l'échec de remise d'une invitation ait une issue claire (« delivery failure … require clear recovery », v2.2) — servi par le repli « lien à copier ». |
| D-2 | **Conforme** | « Support access identifies the operator, authorizing party, purpose, resources and duration. It expires and remains traceable. Support actions must not impersonate … » (Partie 2). Ajout imposé : le **motif** (*purpose*) de l'accès est enregistré (UM-4). |
| D-3 | **Contredit** | Le concept fait de l'organisation un enregistrement partagé de base (Partie 1 « Shared records », Partie 2 « owning party », Partie 5 entière). D-3 réservait cette exception : voir UM-1. |
| D-4 | **Muet** | Aucune exigence de test d'infrastructure dans le concept. |
| D-5 | **Conforme** | « Authorship, previous approvals … retain their original attribution » (Partie 2) ; l'anonymisation conserve l'identifiant et l'attribution « Compte supprimé ». |
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
- **UM-11 — Garde DB-1/2 (Phase 6, tâche 2).** L'enrôlement d'une autorité d'attestation dans
  `approved-test-authorities.ts` exige une clé privée hors dépôt (secret GitHub) que seule l'administration du dépôt peut
  créer : **bloqué**, en attente du maître d'ouvrage (procédure dans [RUNBOOK.md](RUNBOOK.md)). Les contrôles de ce
  chantier sur base réelle passent par des scénarios HTTP (API construite + PostGIS de la CI), hors garde Vitest.
- **UM-12 — Branche unique et points d'arrêt.** La session d'exécution impose la branche `ccr-266c1e83-7780ml` : les
  phases y sont des commits distincts (un par phase) et une seule PR est ouverte, **non fusionnée** ; la revue humaine des
  phases 2, 3, 4 et de la garde DB a lieu sur cette PR. Les points d'arrêt 🛑 0 et 2 ont été franchis sous la délégation
  ci-dessus, sans fusion ni déploiement ; le point d'arrêt final reste au maître d'ouvrage.
