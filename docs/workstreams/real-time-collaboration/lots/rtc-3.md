# RTC-3 — Annotations enregistrées (compte rendu)

Issue [#283](https://github.com/RachEma-ux/Fadi/issues/283) ; critères RT-R3, RT-R5 ; test TR-T04 ; décisions RT-D4, RT-D5.
Statut : **implémenté et vérifié en local** ; CI et fusion : voir la PR du lot.

## Choix (pris par délégation RT-D4)

- Une annotation **est un commentaire Studio** (même identifiant) : texte, auteur, audience E1, objets cités vérifiés
  contre la révision, idempotence par `requestId`, suppression douce par l'auteur, promotion en observation (tâches,
  décisions) et conversation COM (rattachée à l'observation) restent ceux du circuit existant — rien n'est recopié.
- Elle est **ancrée à la révision épinglée par la session** (révision source), jamais à la tête du moment.
- Une table additive `rt_annotations` garde ce que le commentaire n'a pas : le **point de vue** (cadre plan `local-2d`
  et / ou caméra `local-3d`, mètres — repères et unités écrits à l'enregistrement) et la **session d'origine**
  (`ON DELETE SET NULL` : l'annotation survit à la session et à sa clôture).
- Rejeu : même `requestId` + même contenu + même point de vue = la même annotation (aucune annonce de plus) ; autre point
  de vue avec le même `requestId` = 409. La comparaison est canonique (clés triées : `jsonb` ne garde pas leur ordre).
  Une ligne de point de vue manquante (réponse perdue entre les deux écritures) est complétée par le rejeu.
- Annonce `annotation` à toutes les sessions ouvertes sur la variante, projetée par destinataire : une note de l'équipe
  n'atteint jamais un lecteur (canal et liste).

## Livré

| Élément | Où |
| --- | --- |
| Table `rt_annotations` (FK commentaire, projet, révision source par FK composite, session `SET NULL`, point de vue `jsonb`) | `apps/api/src/db/init.sql`, `schema.ts` |
| Schéma `POINT_DE_VUE` (même contrat que la vue partagée, cadre ou caméra exigé), `pointDeVue`, `canonique` | `apps/api/src/lib/temps-reel-protocole.ts` |
| `annoter`, `listerAnnotations` (audience E1 filtrée par le serveur, texte retiré si supprimé, drapeau observation) | `apps/api/src/lib/temps-reel-annotations.ts` |
| Routes `POST /sessions/:id/annotations`, `GET /annotations?variantId=…[&sessionId=…]` | `apps/api/src/routes/temps-reel.ts` |
| Formulaire « Annoter » (citer la sélection, « Visible par les lecteurs » Alt+Maj+1, point de vue affiché), liste des annotations de la session, « Voir le point de vue » (navigation libre, cadre et caméra reposés) | `temps-reel/BandeauSession.tsx`, `useSessionTempsReel.ts`, `api-temps-reel.ts`, `VariantWorkspace.tsx` |
| Règle d'or : `annoter` (Ctrl+Alt+Maj+A), `enregistrer-annotation` (E), `voir-point-de-vue` (G) | `commandes-collaboration.ts` (+ test) |
| Traductions anglaises (25 entrées) | `en.json` |

## Preuves

- Tests unitaires API temps réel : 27 verts (point de vue exigé, repères déclarés, comparaison canonique).
- Suite web : 991 tests verts (règle d'or à 15 commandes temps réel).
- `apps/web/e2e/temps-reel-annotations.mjs`, deux navigateurs, base réelle : **29 vérifications vertes** — note d'équipe
  invisible au lecteur (canal et liste), note visible annoncée, commentaire Studio de même identifiant ancré à la
  révision source, Alt+Maj+1 et Ctrl+Alt+Maj+A / E, rejeu 201 → 200 sans doublon, 409 sur autre point de vue, 422
  pour un lecteur visant l'équipe et pour un point de vue vide, R03 → R04 avec révision source conservée, point de vue
  reposé et navigation libre, règle d'or, axe-core (formulaire et liste), passe anglaise, survie à la clôture, 409 après
  clôture, promotion en observation. Ajoutée à la CI (tranche `p2`).
- `temps-reel-studio.mjs` 25 / 25 et `temps-reel-sessions.mjs` 44 / 44 toujours verts.

## Limites déclarées

- Après la clôture, on annote depuis les commentaires Studio (point de vue non enregistré) ; la liste des annotations
  reste lisible par la route `GET /annotations` (revue asynchrone) — un écran dédié hors session n'est pas livré.
- Pas de marque des annotations dans la planche : leur point de vue se revoit depuis la liste.
