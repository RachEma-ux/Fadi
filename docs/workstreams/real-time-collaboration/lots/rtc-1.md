# RTC-1 — Socle des sessions et canal temps réel (compte rendu)

Issue [#283](https://github.com/RachEma-ux/Fadi/issues/283) ; décisions RT-D4 (exécution déléguée) et RT-D5 (choix
techniques). Statut : **fusionné** (PR #288, CI verte) et **accepté** (RT-D8).

## Livré

| Élément | Où |
| --- | --- |
| Schéma additif : `rt_sessions` (portée discriminée, révision épinglée par FK composite, hôte, présentateur, statut, échéance, `request_id` idempotent) et `rt_session_events` (ajout seul, UPDATE refusée par déclencheur) | `apps/api/src/db/init.sql`, `schema.ts` |
| Sessions : ouverture idempotente, lecture, liste, présentateur, transmission et reprise de l'animation, changement explicite de révision, clôture, expiration ; chaque geste journalisé | `apps/api/src/lib/temps-reel-sessions.ts` |
| Routes HTTP `/projects/:id/temps-reel/sessions…` (droit `comment`, support exclu, 404 sans drapeau) | `apps/api/src/routes/temps-reel.ts` |
| Protocole v1 : messages typés (zod), caméra relue par le contrat des scènes Studio (`validerElementVisualisation`, repère `local-3d`), bornes, codes de fermeture, limiteur de débit, journal de reprise | `apps/api/src/lib/temps-reel-protocole.ts` |
| Projection par destinataire : droit frais (≤ 3 s), sélection réduite aux objets du document épinglé, annotations `equipe` réservées à l'équipe | `apps/api/src/lib/temps-reel-projection.ts` |
| Répartiteur en mémoire : salles, présence, vue du présentateur, reprise, battement, revalidation (2 s), file d'envoi bornée | `apps/api/src/lib/temps-reel-hub.ts` |
| Canal `ws` 8.18.3 sur `/temps-reel` : origine, session de compte, gestionnaire d'erreur par prise, minuteries (battement, revalidation, expiration), arrêt propre | `apps/api/src/lib/temps-reel-canal.ts`, `server.ts` |
| Signaux immédiats : écriture réussie sur les membres et les participations, révocation de session de compte, nouvelle révision Studio | `apps/api/src/lib/temps-reel-signaux.ts` ; raccords d'une ligne dans `routes/members.ts`, `routes/participants.ts`, `lib/auth.ts`, `lib/studio-commands.ts` (après validation de la transaction) |

## Preuves

- `apps/api/src/lib/temps-reel-protocole.test.ts` et `temps-reel-hub.test.ts` : **22 tests verts** (TR-T01, TR-T02,
  TR-T07, TR-T09 en version pure ; débit, reprise, battement, file saturée, hôte absent, vingt connexions par compte).
- `apps/web/e2e/temps-reel-sessions.mjs` sur API, canal et PostgreSQL + PostGIS réels (base jetable locale) :
  **44 vérifications vertes** — montée de protocole refusée (401, 403, 404), session idempotente, tiers indistinguable
  d'une session inexistante, présence à trois, vue du présentateur, sélection forgée réduite, révision annoncée sans
  bascule, hôte lecteur sans droit d'écriture (403), retrait du lecteur → 4403 immédiat, déconnexion → 4401, clôture →
  4404, journal complet. Ajoutée à la CI (tranche `p2`, drapeau `FADI_TEMPS_REEL=1`).
- Schéma appliqué deux fois de suite sans erreur (idempotence).

## Limites déclarées

- Aucune interface : elle arrive avec RTC-2 (vue partagée dans le Studio).
- Une instance d'API (RT-D2) ; plusieurs instances exigent une diffusion partagée (porte distincte).
- Revalidation par gestes connus immédiate ; autres changements (échéance d'accès, suspension) : 2 s au plus.
- Comportement « drapeau absent » (routes et canal 404) vérifié par lecture du code, pas par une recette dédiée.
