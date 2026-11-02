# Base de données : fiabilité et performance — Reprise de session

Mis à jour : 2026-11-02 (UTC).

## Point de reprise

- Chantier : base-donnees
- Issue : à ouvrir (« Base de données : fiabilité et performance »).
- Branche / PR actives : branches locales empilées `docs/base-donnees-plan` → `fix/bd-1-garde-fous` (non poussées) ; à vérifier sur GitHub.
- Dernier commit vérifié : `b9d9897` pour l'audit ; relever le HEAD de `main` en début de session, ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Audit terminé (`audit/`), plan établi (`PLAN.md`) ; BD-1 implémenté localement (voir `STATUS.md`).

## Prochaine action

- Ouvrir l'Issue, pousser les branches, ouvrir la PR de BD-1 et faire tourner la CI (suites DB-3) ; BD-0.2 (mesures) en préproduction ; constater Healthchecks sur le VPS.

## Tests et preuves

- Audit : mesures sur base jetable consignées dans `audit/01-schema-index.md` § 0 et § 4 (requêtes reproductibles).
- BD-1 : tests purs ajoutés (`apply-schema`, `pool-config`, `volumes-gc-planifie`, `purge-stockage-compte`), test DB `atelier-commands` (bascule BD-1.8) à faire tourner en CI ; mesure du `lock_timeout` sur base jetable (STATUS).

## Risques et blocages

- Les coûts de requêtes sont estimés, pas mesurés : BD-0.3 (`pg_stat_statements`) avant BD-4.
- `CREATE INDEX CONCURRENTLY` impossible dans `init.sql` tant que BD-2 n'est pas livré.
- Avant tout déploiement touchant `bascule.ts`, vérifier `to_regclass('public.atelier_store')` en production.
- BD-1.4 : vérifier qu'aucune purge de journal ne passe par `fadi_app` avant les `REVOKE`.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
