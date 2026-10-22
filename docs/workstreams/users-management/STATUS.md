# Gestion des comptes (Users Management) — Statut

Mis à jour : 2026-10-22 (UTC).

## État

**En cours** — Phase 0 terminée (cadrage) ; phases suivantes en cours d'implémentation sur la branche
`ccr-266c1e83-7780ml`. Rien n'est accepté ni déployé.

## Faits vérifiés

### Phase 0 — concept

- `concept.md` = copie exacte de `Fadi Concept/Fadi Concept - Users Management.md` v2.2. L'extraction pandoc du `.docx`
  (`pandoc … -t gfm`) aplatit les tableaux (le `.docx` les encode en paragraphes) : le pair Markdown officiel est donc
  recopié, et la **parité** a été vérifiée le 2026-10-22 : le multiensemble des mots de `pandoc -t plain` du `.docx` est
  identique à celui du `.md` (diff vide).
- Anti-dérive : `concept.md.sha256` (empreintes du `.docx`, du `.md` et de `concept.md`),
  `apps/api/src/lib/users-concept-drift.test.ts` (5 tests, verts) et `node scripts/users-concept.mjs` (contrôle / `--write`).

### Phase 0 — réponses d'audit (commit `9d466f8`)

1. **Hachage** — Argon2id via `@node-rs/argon2` (`apps/api/package.json`, `~2.0.2`), paramètres `memoryCost: 19456`
   (19 MiB), `timeCost: 2`, `parallelism: 1` (`apps/api/src/lib/auth.ts:11-15`), algorithme par défaut de la
   bibliothèque = Argon2id. **Déjà conforme** à la cible de la tâche 2.1 ; aucun réhachage massif n'est nécessaire, une
   détection `needsRehash` est ajoutée pour l'avenir. Longueur minimale actuelle **8** (`apps/api/src/routes/auth.ts:16`).
2. **Session** — cookie opaque `fadi_session` (`auth.ts:8`), valeur = `randomUUID()` (`auth.ts:39`) **stockée en clair**
   comme clé primaire de la table `sessions` (`init.sql:24-30`), expiration fixe 30 j (`auth.ts:7`, `:40`), sans
   glissement, sans plafond par rôle ; `HttpOnly`, `SameSite=Lax`, `Secure` en production seulement
   (`routes/auth.ts:19-30`). **Révocable** : suppression de la ligne (`auth.ts:46`), relue à chaque requête
   (`middleware/require-auth.ts`). Pas de révocation des autres sessions au changement de mot de passe (aucune route de
   changement n'existe).
3. **Table `users`** — `id`, `email` (unique), `password_hash`, `created_at`, `notifications_seen_at`, `display_name`,
   `atelier_ensembles`, `atelier_ensembles_at`, `notification_preferences` (`schema.ts:24-39`, `init.sql:11-22`). Aucun
   statut, rôle plateforme, vérification d'e-mail ni compteur d'échecs.
4. **`AUTH_RATE_LIMIT`** — `express-rate-limit`, fenêtre **15 min**, **20** requêtes par défaut, clé = **adresse IP**
   seule (générateur par défaut), appliqué à tout `/auth` y compris `/auth/me` (`app.ts:55-57`) ; actif en production
   (valeur par défaut). Aucune limite par identifiant, aucun verrouillage de compte.
5. **Défaut PR #1 (expiration de session)** — **confirmé** : sur 401 de `/auth/me` au chargement,
   `apps/web/src/lib/auth-context.tsx:90-91` efface seulement `fadi.lastUser` ; le cache TanStack persisté et IndexedDB
   **ne sont pas purgés** (`forgetDevice`, `:50`, n'est appelé qu'au changement d'utilisateur `:65`, `:78` et à la
   déconnexion `:122`). Même à la déconnexion, la file des lots de l'Atelier (`lots`) et `modelCache`
   (`local-store.ts:84-97`) **ne portent aucun `userId`** et ne sont pas vidés : un lot laissé par A pourrait être rejoué
   sous la session de B.

### Phase 0 — ajustements imposés par le concept

Consignés dans [DECISIONS.md](DECISIONS.md) : UM-1 (organisations hors de ce plan — **D-3 contredit, signalé**), UM-2
(états de compte), UM-3 (invitations sans compte fantôme, table dédiée), UM-4 (motif de l'accès support, rôle `support`),
UM-8 (partage direct d'un compte existant conservé, écart déclaré). Point d'arrêt 0 franchi sous délégation (UM-12).

## Points ouverts

- UM-1 : chantier organisations / participation / revue externe à ouvrir par le maître d'ouvrage.
- UM-11 : DB-3 bloqué (autorité d'attestation hors dépôt).
- Annexe C (Infomaniak, SPF/DKIM/DMARC, `FADI_ENCRYPTION_KEY`, premier admin) : hors code.

## Liens de suivi

- Issue : [#253](https://github.com/RachEma-ux/Fadi/issues/253)
- Branche de tâche : `ccr-266c1e83-7780ml` (imposée par la session, UM-12).
- Pull Request : à ouvrir à la fin de l'implémentation, non fusionnée.

## Préconditions de clôture

- Critères de l'Issue testés et documentés.
- Décisions validées, documentation et `HANDOFF.md` mis à jour.
