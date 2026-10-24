# Règles communes de collaboration — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : collaboration-rules. Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).
- Cadrage : PR #273 **fusionnée** (`7083285`).
- Écarts E1, E2, E3, E7 et règle d'or : [PR #274](https://github.com/RachEma-ux/Fadi/pull/274) **fusionnée le 2026-10-24 par le maître d'ouvrage (`2577e25`, tête `eeb3bc1`, CI verte)** (DECISIONS.md CR-C1).
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Matrice, plan et décisions rédigés à partir de `main` = `034dbfb`, branche mise à jour avec `main` = `2cc038a`.
- Décisions CR-R1 et CR-R2 consignées (relayées par la session VPS) : CR-D1 à CR-D10 toutes répondues.
- Code : PR #274 seule (E1, E2, E3, puis E7, règle d'or des commandes de collaboration, alignement sur #265).

## Prochaine action

- PR #274 fusionnée : relever la CI de `main` sur `2577e25` ; contrôler en préproduction (fil réservé à l'équipe
  invisible du lecteur, export du lecteur refusé puis accordé, Alt+Maj+1/2/3) et le consigner. Production : aucune action.
- Après la fusion de la PR #265 et l'accord (CR-D10), ouvrir la PR qui reporte l'annexe A du PLAN dans le PLAN
  d'Organisations.

## Tests et preuves

- Documentation seule : `node scripts/check-continuity.mjs`, `node --test scripts/check-continuity.test.mjs` ; aucun test
  d'application à exécuter. Avant de réutiliser une preuve de la matrice, revérifier la ligne citée sur le `main` courant.

## Risques et blocages

- Les numéros de ligne de la matrice dérivent avec `main` : ils valent pour `034dbfb`.
- E1 et E2 : corrigés dans `main` (PR #274) ; tant que la préproduction ou la production n'a pas reçu `2577e25`, ouvrir
  un projet à un participant externe y exposerait les notes internes.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
