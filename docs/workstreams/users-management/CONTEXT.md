# Gestion des comptes (Users Management) — Contexte

## Objectif

Exécuter le plan [PLAN.md](PLAN.md) (phases 0 à 6) : comptes durcis (Argon2id, politique de mot de passe, TOTP,
sessions révocables, anti-abus, CSRF), rôle plateforme administrateur séparé du contenu des projets (accès support D-2),
cycle de vie complet (invitation, vérification, réinitialisation, suspension, suppression D-5) avec un service de courriel
remplaçable (D-1), écrans d'administration et « Mon compte », recette et runbook — sans déploiement.

## Périmètre

- Inclus : `apps/api` (schéma additif, authentification, `/admin`, cycle de vie, courriel), `apps/web` (écrans, purge
  client), scénario e2e, CI (Mailpit), documentation du chantier.
- Exclus : organisations, appartenances, groupes, participations « contact seul », affectations de travail, revue externe
  (UM-1) ; tout déploiement ; toute modification de la garde DB sans revue humaine (UM-11) ; production et données
  clients sans autorisation explicite.

## Sources canoniques

- `AGENTS.md` ; `CLAUDE.md` ; `docs/architecture.md`
- Issue : [#253](https://github.com/RachEma-ux/Fadi/issues/253)
- Références métier spécifiques : [concept.md](concept.md) (normatif, prime sur le plan — règle 4), [PLAN.md](PLAN.md),
  [DECISIONS.md](DECISIONS.md) (D-1 à D-6 du maître d'ouvrage, arbitrages UM-x), [MATRICE.md](MATRICE.md).

## Contraintes

- Préserver les décisions et règles métier existantes (21 étapes, rôles projet, Studio).
- Migrations additives et idempotentes uniquement (`init.sql` + `schema.ts`).
- Autorisation serveur à chaque requête, échec fermé ; aucun secret ni jeton brut en base, dans les logs ou les commits.
- Ne pas confondre implémentation, vérification et acceptation. Pas de secret dans GitHub.

## Hypothèses et questions ouvertes

- UM-1 : le chantier organisations / participation / revue externe reste à ouvrir par le maître d'ouvrage.
- UM-11 : enrôlement d'une autorité d'attestation DB-3 (clé hors dépôt) à décider et provisionner par le maître d'ouvrage.
- Annexe C du plan (adresse Infomaniak, SPF/DKIM/DMARC, `FADI_ENCRYPTION_KEY`, premier admin) : hors code, au maître d'ouvrage.
