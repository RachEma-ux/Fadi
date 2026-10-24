# Communication (COM) — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : communication. Issue : [#280](https://github.com/RachEma-ux/Fadi/issues/280).
- Livraison : PR [#285](https://github.com/RachEma-ux/Fadi/pull/285) **fusionnée** dans `main` (`173b9f1`, 2026-10-24). Non déployée.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Plan, décisions et phases COM-1 à COM-8 et COM-5 bis implémentés (le `.docx` du concept, relu, est identique au
  `.md`) ; vérifications locales consignées dans STATUS.md.

## Prochaine action

- Obtenir la confirmation explicite des décisions COM-D1 à COM-D14 (la fusion a été demandée sans les accepter une à une).
- Déploiement en préproduction puis production : uniquement sur accord explicite.
- Suites déclarées : TASKS COM-10 à COM-12 (après Organisations phases 2 et 4, et décisions du concept).

## Tests et preuves

- `npm run typecheck` ; `npm test` (web) ; `npx --workspace=@fadi/api vitest run --reporter=json …` puis
  `node scripts/check-api-tests-db3.mjs api-vitest.json` ; `npm run build`.
- Local : PostGIS jetable, `npm run db:migrate`, `node apps/api/dist/server.js` (WEB_DIST), puis
  `BASE_URL=http://localhost:3001 node apps/web/e2e/communication.mjs` (et `CHROMIUM_PATH` si Playwright n'a pas son navigateur).

## Risques et blocages

- COM s'appuie sur les rôles actuels (propriétaire, éditeur, lecteur, support) : la bascule d'Organisations phase 2
  devra conserver les mêmes frontières d'audience (COM-10).
- Listes et boîte relues sans cache (requêtes par conversation) : volume à surveiller sur de très gros projets.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
