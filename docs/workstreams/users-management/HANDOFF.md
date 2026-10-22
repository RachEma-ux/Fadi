# Gestion des comptes (Users Management) — Reprise de session

Mis à jour : 2026-10-22 (UTC).

## Point de reprise

- Chantier : users-management
- Issue : [#253](https://github.com/RachEma-ux/Fadi/issues/253)
- Branche / PR actives : `ccr-266c1e83-7780ml` ; PR à vérifier sur GitHub.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Phase 0 terminée : concept, anti-dérive, audit sourcé, matrice, décisions (voir STATUS.md).

## Prochaine action

- Phase 1 : schéma additif (`users`, `sessions`, `invitations`, `account_tokens`, `user_recovery_codes`,
  `project_support_grants`, `audit_log`, `mail_outbox`) et `lib/audit.ts`.

## Tests et preuves

- `npx --workspace=@fadi/api vitest run src/lib/users-concept-drift.test.ts` : 5 tests verts.

## Risques et blocages

- DB-3 bloqué (UM-11). Organisations hors périmètre (UM-1, à confirmer par le maître d'ouvrage).

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
