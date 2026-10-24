# Règles communes de collaboration — Reprise de session

Mis à jour : 2026-10-24 (UTC).

## Point de reprise

- Chantier : collaboration-rules. Issue : [#272](https://github.com/RachEma-ux/Fadi/issues/272).
- Branche / PR : `docs/272-collaboration-rules`, PR de cadrage vers `main`, non fusionnée.
- Dernier commit vérifié : à relever en début de session ; ne pas réutiliser un SHA périmé.

## Dernier état vérifié

- Matrice, plan et décisions rédigés à partir de `main` = `034dbfb`, branche mise à jour avec `main` = `2cc038a`.
- Décisions CR-R1 consignées (relayées par la session VPS) ; CR-D4 en attente de précision.
- Aucune ligne de code modifiée.

## Prochaine action

- Attendre la revue de la PR et la précision sur CR-D4 ; ne pas fusionner sans l'accord écrit du maître d'ouvrage.
- Après la fusion de la PR #265 et l'accord (CR-D10), ouvrir la PR qui reporte l'annexe A du PLAN dans le PLAN
  d'Organisations.

## Tests et preuves

- Documentation seule : `node scripts/check-continuity.mjs`, `node --test scripts/check-continuity.test.mjs` ; aucun test
  d'application à exécuter. Avant de réutiliser une preuve de la matrice, revérifier la ligne citée sur le `main` courant.

## Risques et blocages

- Les numéros de ligne de la matrice dérivent avec `main` : ils valent pour `034dbfb`.
- E1 et E2 : ouvrir un projet à un participant externe avant la phase 4 d'Organisations exposerait les notes internes.

## Arrêt sûr

- Aucune mutation de production sans autorisation. Vérifier le HEAD Git et les tests avant chaque reprise.
