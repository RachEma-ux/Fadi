# RTC-5 — Robustesse et mise en service (compte rendu)

Issue [#283](https://github.com/RachEma-ux/Fadi/issues/283) ; décisions RT-D4, RT-D5, RT-D6 ; critères RT-R1, RT-R5,
RT-R6 ; tests TR-T08, TR-T09, TR-T10, TR-T16, TR-T17 (partie automatisable). Statut : **implémenté et vérifié en
local** ; CI et fusion : voir la PR du lot. **La préproduction et la mise en service restent au maître d'ouvrage**
(hors délégation : aucun déploiement).

## Livré

| Élément | Où |
| --- | --- |
| Pointeur 3D (limite déclarée en RTC-2) : impact du rayon sur le premier objet, sinon le sol z = 0 (`local-3d`) ; marques des autres participants en sphères nommées (étiquette HTML projetée à chaque rendu), jamais une donnée du document | `vue3d/Vue3DStudio.tsx` (props `surPointeur3d`, `pointeurs3d`), `VariantWorkspace.tsx` |
| Réservation d'édition du projet visible en session (RT-R6, TR-T10) : titulaire et échéance ; jamais transmise par la session | `useSessionTempsReel.ts`, `BandeauSession.tsx` |
| Supervision : compteurs agrégés du répartiteur (`mesures()`), ligne de journal par minute, refus de montée par code | `apps/api/src/lib/temps-reel-hub.ts`, `temps-reel-canal.ts` (+ test) |
| TR-T16 : mouvement réduit (pulsation coupée), cibles tactiles de 44 px (`pointer: coarse`) | `temps-reel/temps-reel.css` |
| RTC-0.6 : statut de Collaboration à jour dans le registre des modules (et sa traduction) | `apps/web/src/modules/module-registry.ts`, `en.json` |
| Conservation (RT-Q5) et profil de budgets (RTC-0.4) consignés | `DECISIONS.md` RT-D6 § 5 et § 7 |

## Preuves

- Unitaires API temps réel : 29 verts (dont la supervision) ; suite web complète verte.
- `apps/web/e2e/temps-reel-charge.mjs` (CI, tranche `p2`) : **10 sessions × 10 participants**, 100 connexions entrées
  en 0,5 s ; rafale de 8 à 10 s : chaque connexion bornée à 10 éphémères / s (90 000 pointeurs relayés exactement à la
  borne), **latence p50 6 ms, p95 19 ms**, aucune fermeture, aucun pointeur d'une autre session ; **100 reconnexions
  en 0,3 s**, sans resynchronisation, présence retrouvée ; `/health` vert.
- `apps/web/e2e/temps-reel-robustesse.mjs` (CI) : **21 vérifications** — pointeur 3D nommé puis retiré ; réservation
  visible (titulaire, échéance), conservée au départ de l'hôte, levée refusée au lecteur (403), libérée par le
  propriétaire ; mouvement réduit ; téléphone tactile (cibles ≥ 44 px, aucun débordement) ; clavier (focus, Entrée,
  Échap) ; anglais ; axe-core.
- `apps/web/e2e/temps-reel-redemarrage.mjs` (local, hors CI : elle redémarre le serveur) : **8 / 8** — clients
  prévenus (1001), API relancée en 2,1 s, session ouverte en base, retour resynchronisé, présence et annotation
  retrouvées.
- `apps/web/e2e/temps-reel-retour-arriere.mjs` (local, hors CI) : **9 / 9, répétée deux fois** — sans le drapeau :
  liste « inactif », autres routes et montée de protocole 404, annotation lisible comme commentaire Studio ; drapeau
  remis : session et annotation retrouvées telles quelles.
- Recettes des lots précédents toujours vertes : sessions 44, vue partagée 26, annotations 32, revue 26 ; charge 12.

## Retour arrière (procédure)

1. Retirer `FADI_TEMPS_REEL` de l'environnement de l'API et la redémarrer : aucune route ni canal temps réel, l'interface
   n'affiche aucune entrée ; aucune donnée n'est supprimée (tables additives, commentaires Studio intacts).
2. Si nécessaire, revert des PR #288 à la PR de RTC-5 ; les tables `rt_*` peuvent rester (aucune lecture hors module).

## Non couvert (déclaré)

- Préproduction derrière Caddy `basic_auth` (TR-T17 sur le chemin réel), profil P.118 sur l'appareil Android de
  recette, Firefox et WebKit : à exécuter par le maître d'ouvrage (seul Chromium est disponible ici) — les scripts
  `temps-reel-redemarrage.mjs`, `temps-reel-retour-arriere.mjs` et `temps-reel-charge.mjs` sont prêts pour cette recette.
- Plusieurs instances d'API : diffusion partagée non livrée (RT-D2 : une instance).
- TR-T15 (invité restreint) : attend la phase 4 d'Organisations.

## Revue d'équipe (RT-D7)

Constats et correctifs : `../PREUVES-SECURITE-ET-CI.md` (pointeur fantôme, lancer de rayon borné à une image, coordonnées
bornées, étiquettes, pointeurs périmés, compteurs, recette de charge).
