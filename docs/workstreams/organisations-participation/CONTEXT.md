# Organisations, participation et revue externe — Contexte

## Objectif

Le maître d'ouvrage a ouvert ce chantier le 2026-10-23, à la suite de UM-1 de la gestion des comptes. Il livre les parties du concept Users Management v2.2 restées hors périmètre de la PR #255 :
- participants et équipe du projet (contacts sans compte compris) ;
- invitations acceptées liées à une participation ;
- revue externe d'un paquet identifié ;
- organisations, ensuite.

**Priorité :** participants, invitations acceptées, revue externe ; journal d'activité et historique ajoutés le même jour. Le plan est dans [PLAN.md](PLAN.md).

## Périmètre

- **Inclus :**
  - enregistrements personne / contact, organisation (minimal) et participation au projet ;
  - écran « Collaboration > Équipe et participants » ;
  - invitations proposant une participation, activées après acceptation ;
  - journal d'activité et historique par audience (administrateur, utilisateur, projet) ;
  - paquet de revue, destinataires externes, accès limité au paquet, constats et boucle de correction ;
  - organisations (partie 5), après la revue externe.
- **Exclus :**
  - tout déploiement et toute production ;
  - la session temps réel et la « ressource restreinte » (OP-D11) ;
  - la paie et la gestion d'emploi ;
  - toute modification de la garde DB-3 ou de ses clés.

## Sources canoniques

- `AGENTS.md`, `CLAUDE.md`, `docs/architecture.md`.
- Concept normatif : [`../users-management/concept.md`](../users-management/concept.md), parties 1 à 6 et section v2.2.
- Décisions héritées : [`../users-management/DECISIONS.md`](../users-management/DECISIONS.md) (D-1 à D-7, UM-1 à UM-24).
- Exigences : [`../users-management/MATRICE.md`](../users-management/MATRICE.md), lignes « hors périmètre ».
- Issue : [#262](https://github.com/RachEma-ux/Fadi/issues/262).

## Contraintes

- Le concept prime sur le plan. Les listes métier sont fournies par le maître d'ouvrage et ne sont jamais inventées.
- Migrations additives et idempotentes (schémas D-7). Les droits actuels des membres ne changent pas en phase 1 ; la bascule vers les six rôles métier (OP-D3 c) vient en phase 2, sans perte d'accès.
- Un participant externe ne voit que ce qui lui est explicitement partagé, y compris par liens, aperçus, notifications et exports.
- Autorisation serveur à chaque requête, échec fermé. Assurance de session (UM-18) et capacité `export` (UM-20) conservées.
- Implémentation, vérification et acceptation restent distinctes.

## Hypothèses et questions ouvertes

- Décisions OP-D1 à OP-D13 ([PLAN.md](PLAN.md), annexe A) : à prendre par le maître d'ouvrage au point d'arrêt 🛑 0.
