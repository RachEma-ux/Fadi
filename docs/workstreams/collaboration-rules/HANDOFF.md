# Règles communes de collaboration — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : collaboration-rules. Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).
- Cadrage : PR #273 **fusionnée** (`7083285`).
- Écarts E1, E2, E3 (et E7) : [PR #274](https://github.com/RachEma-ux/Fadi/pull/274) **fusionnée** (`2577e25`, CR-C1).
- Écarts E5, E6, E9, E10 et report CR-1 : branche `ccr-e2b77568-r17oja` (depuis `main` = `2577e25`), [PR #282](https://github.com/RachEma-ux/Fadi/pull/282) vers
  `main` **non fusionnée** (DECISIONS.md CR-R3, CR-C2).
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Matrice, plan et décisions rédigés à partir de `main` = `034dbfb`, branche mise à jour avec `main` = `2cc038a`.
- Décisions CR-R1 et CR-R2 consignées (relayées par la session VPS) : CR-D1 à CR-D10 toutes répondues.
- Code : PR #274 fusionnée (E1, E2, E3, E7) ; PR de CR-C2 (E5, E6, E9 glossaire, E10, CR-1) vérifiée en local (STATUS.md).

## Prochaine action

- [PR #282](https://github.com/RachEma-ux/Fadi/pull/282) : CI verte sur `e1b7511` (run 40133674349 : 628 tests API dont 133 DB-3, tous les lots e2e) ; revérifier le HEAD
  courant ; fusion et déploiement sur décision du maître d'ouvrage.
- Restent : E4 et E8 (phase 3 d'Organisations) ; CR-2 à CR-4 à l'ouverture de COM et du Temps réel.

## Tests et preuves

- Documentation seule : `node scripts/check-continuity.mjs`, `node --test scripts/check-continuity.test.mjs` ; aucun test
  d'application à exécuter. Avant de réutiliser une preuve de la matrice, revérifier la ligne citée sur le `main` courant.

## Risques et blocages

- Les numéros de ligne de la matrice dérivent avec `main` : ils valent pour `034dbfb`.
- E1 et E2 : corrigés par la PR #274 (fusionnée) ; tant que ce n'est pas déployé, ouvrir un projet à un participant
  externe exposerait les notes internes.
- CR-C2, après déploiement : un Approbateur ou un Diffuseur désigné peut être un lecteur (OP-D7 a) ; l'approbation et la
  diffusion ne sont plus réservées au seul propriétaire dès qu'il désigne quelqu'un. Le retrait d'un membre libère sa
  réservation d'édition et ses verrous (changement visible pour les autres membres, notifié).

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
