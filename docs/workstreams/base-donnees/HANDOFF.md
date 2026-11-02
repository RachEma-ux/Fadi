# Base de données : fiabilité et performance — Reprise de session

Mis à jour : 2026-11-02 (UTC).

## Point de reprise

- Chantier : base-donnees
- Issue : à ouvrir (« Base de données : fiabilité et performance »).
- Branche / PR actives : aucune ; à vérifier sur GitHub.
- Dernier commit vérifié : `b9d9897` pour l'audit ; relever le HEAD de `main` en début de session, ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Audit terminé (`audit/`), plan établi (`PLAN.md`), aucune modification de code.

## Prochaine action

- Ouvrir l'Issue, commiter ce dossier (avec STATUS et HANDOFF), puis lancer BD-0.2 (mesures en lecture seule) et BD-1 sur une branche `fix/<issue>-bd-1-garde-fous`, en commençant par BD-1.1 et BD-1.2.

## Tests et preuves

- Audit : mesures sur base jetable consignées dans `audit/01-schema-index.md` § 0 et § 4 (requêtes reproductibles).
- Aucun test de remédiation : rien n'est encore implémenté.

## Risques et blocages

- Les coûts de requêtes sont estimés, pas mesurés : BD-0.3 (`pg_stat_statements`) avant BD-4.
- `CREATE INDEX CONCURRENTLY` impossible dans `init.sql` tant que BD-2 n'est pas livré.
- Avant tout déploiement touchant `bascule.ts`, vérifier `to_regclass('public.atelier_store')` en production.
- BD-1.4 : vérifier qu'aucune purge de journal ne passe par `fadi_app` avant les `REVOKE`.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
