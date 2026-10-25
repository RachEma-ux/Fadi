# RTC-4 — Revue en direct sur une publication figée (compte rendu)

Issue [#283](https://github.com/RachEma-ux/Fadi/issues/283) ; RT-D5 § 8 ; critères RT-R1, RT-R2, RT-R7 ; tests TR-T05
(dans la limite des rôles de projet actuels) et TR-T06. Statut : **implémenté et vérifié en local** ; CI et fusion : voir
la PR du lot.

## Choix (délégation RT-D4, RT-D5 § 8)

- Une revue (`paquet-revue`) s'ouvre **seulement** sur une publication Studio de la variante dont le manifeste est figé,
  ni retirée ni remplacée (`refusRevue`, pur et testé). Étude, variante et révision sont **celles de la publication** :
  une révision différente demandée est refusée (422), une publication d'une autre variante est introuvable (404).
- La revue reste sur la révision publiée : changer sa révision est refusé (409 `revue_figee`, RTC-1), une nouvelle
  révision de la variante **n'est pas annoncée** dans une revue (le signal Studio ne vise que les sessions de travail).
- Relecteurs : les membres du projet (propriétaire, éditeurs, lecteurs, rôles de participation). L'accès « paquet seul »
  d'un invité sans accès au projet attend la phase 4 d'Organisations (reportée par son chantier) : il viendra par un
  adaptateur de droit, sans changer la portée ni le protocole.
- Aucune commande d'export ni d'approbation dans le bandeau ; l'hôte (même un lecteur) n'en tire aucun droit : les
  routes de publication gardent leurs refus (TR-T06 : approbation par un lecteur hôte → 403).
- Annotations d'une revue : ancrées à la révision publiée ; notes `equipe` jamais servies à un lecteur (RTC-3).

## Livré

| Élément | Où |
| --- | --- |
| Ouverture `publicationId` (portée `paquet-revue`, titre « Revue — … », rejeu idempotent comparant la publication) | `apps/api/src/lib/temps-reel-sessions.ts`, `routes/temps-reel.ts` |
| `refusRevue` (manifeste figé, retirée, remplacée) | `apps/api/src/lib/temps-reel-protocole.ts` (+ test) |
| Bandeau hors session : publications figées de la variante, choix si plusieurs, « Ouvrir une revue en direct » (Ctrl+Alt+Maj+U) ; en revue : mention « Revue figée… ni export ni approbation » | `temps-reel/BandeauSession.tsx`, `useSessionTempsReel.ts` |
| Règle d'or (16 commandes temps réel) ; traductions | `commandes-collaboration.ts` (+ test), `en.json` |

## Preuves

- Tests unitaires API temps réel : 28 verts.
- `apps/web/e2e/temps-reel-revue.mjs`, deux navigateurs, base réelle : **24 vérifications vertes** — publication figée
  sur R03 puis R04 enregistrée ; ouverture par Ctrl+Alt+Maj+U (portée, publication, révision épinglée) ; mention revue
  figée ; aucun passage à la tête ; le lecteur affiche R03 pendant que la tête est R04 ; R05 non annoncée ; changement de
  révision refusé (409) ; note d'équipe jamais servie au lecteur ; lecteur hôte refusé à l'approbation (403) ; aucune
  commande d'export ni d'approbation ; refus 404 / 422 à l'ouverture ; axe-core ; passe anglaise ; clôture par le
  lecteur hôte. Ajoutée à la CI (tranche `p2`).
- Les recettes RTC-1 à RTC-3 restent vertes (44, 25, 29).

## Limites déclarées

- Invité restreint au paquet (sans accès au projet) : phase 4 d'Organisations, non livrée.
- Publication retirée ou remplacée **pendant** une revue ouverte : la revue continue sur sa révision figée jusqu'à sa
  clôture ; aucune annonce dédiée (reprise possible en RTC-5).
