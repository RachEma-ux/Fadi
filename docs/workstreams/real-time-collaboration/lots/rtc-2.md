# RTC-2 — Vue partagée Studio (compte rendu)

Issue [#283](https://github.com/RachEma-ux/Fadi/issues/283) ; décisions RT-D3 (Studio seul), RT-D4 (exécution déléguée),
RT-D5 (bornes). Statut : **implémenté et vérifié en local** ; CI et fusion : voir la PR du lot.

## Livré

| Élément | Où |
| --- | --- |
| État de session pur (réception des messages, pointeurs frais, rôles, fermetures → états définitifs ou reprise, délai de reconnexion, regroupement 100 ms) | `apps/web/src/modules/studio/temps-reel/etat-session.ts` |
| Canal navigateur : reconnexion 1 s → 15 s, retour avec `depuis` (dernier numéro d'événement), arrêt sur 4401 / 4403 / 4404 / 4409, éphémères envoyés seulement une fois l'état reçu | `temps-reel/canal.ts` |
| Client HTTP des sessions et crochet React (registre de canaux par variante, liste des sessions, actions) | `temps-reel/api-temps-reel.ts`, `useSessionTempsReel.ts` |
| Bandeau de session : portée, révision, audience, suivi, état de connexion, avis (révision différente, révision plus récente, vue ailleurs, hôte absent, resynchronisé), participants avec désignation du présentateur et transmission de l'animation | `temps-reel/BandeauSession.tsx`, `temps-reel.css` |
| Surimpression 2D des pointeurs et sélections distants (nom affiché, jamais la seule couleur, `pointer-events: none`) | `temps-reel/Superposition2D.tsx`, prop `superposition` de `planche2d/Dessin2D.tsx` |
| Caméra 3D partagée : le présentateur la diffuse, le suiveur la pose sans boucle de retour | `vue3d/Vue3DStudio.tsx` (props `cameraPartagee`, `surCameraLocale`) |
| Raccordement dans l'espace de travail : suivi du cadre plan, partage de la vue, pointeur sur la planche, sélection, affichage explicite de la révision de session (jamais en silence ; brouillon protégé) | `VariantWorkspace.tsx` |
| Règle d'or : 12 commandes avec icône, barre (bandeau ou ligne de participant) et raccourci Ctrl+Alt+Maj+lettre ; bascule suivre / naviguer | `modules/collaboration/commandes-collaboration.ts` (+ test) |
| Traductions anglaises (69 entrées) | `apps/web/src/lib/i18n/en.json` |
| Proxy Vite du canal (`ws: true`) en développement et en aperçu | `apps/web/vite.config.ts` |

## Preuves

- `temps-reel/etat-session.test.ts` (8 tests) et `commandes-collaboration.test.ts` (règle d'or des commandes temps réel) ;
  suite web complète : 991 tests verts.
- `apps/web/e2e/temps-reel-studio.mjs`, deux navigateurs réels sur API, canal et PostgreSQL + PostGIS : **25
  vérifications vertes** — ouverture, arrivée du lecteur, portée et audience affichées, suivi du cadre, navigation libre
  par raccourci, pointeur et sélection distants nommés, nouvelle révision annoncée puis appliquée par l'hôte, icônes et
  raccourcis, axe-core, passe anglaise, téléphone, départ et clôture, aucune erreur JavaScript. Ajoutée à la CI (tranche
  `p2`).
- `temps-reel-sessions.mjs` (RTC-1) reste verte (44).

## Limites déclarées

- Pointeur 3D : transmis par le protocole, non dessiné dans la vue 3D (la 2D seule le montre) — repris à RTC-5.
- Suivre ne déplace que la vue : la sélection et le brouillon local ne changent jamais.
- Annotations : RTC-3.
