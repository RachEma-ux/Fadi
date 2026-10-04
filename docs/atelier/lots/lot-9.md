# Lot 9 — Recette finale — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010).

Le dossier de recette est `docs/atelier/recette.md` ; le protocole de mesures T17 / T18 est
`docs/atelier/protocole-mesures.md`.

## Fait

| Sujet | Résultat |
| --- | --- |
| Essais de l'Architecture V4 §12 | Tous reliés à une preuve (`recette.md` §4). Ajouté : **calcul ancien terminé tardivement** — une production de la révision n livrée après n + 1 reste rattachée à n, est périmée, et ne remplace jamais une production plus récente (`recordProducedDocument` garde la plus récente ; test API). |
| Aide située (UX4) | Relue : chaque outil a une phrase d'aide, un exemple court distinct, sa famille et sa fiche ou son lot ; test `nouveau.test.ts` ; exemple de « Supprimer » réécrit. |
| Fiches de capacité | 11 fiches dont le code existait depuis les lots 2 à 7 passées « prototype » avec leur preuve (DA-03-01 / 09 / 10 / 12, DA-06-07 / 08, DA-21-01 / 02 / 05 / 06 / 07) ; tests ajoutés pour les propriétés BIM, la classification et les groupes. Restent « spécifiées » : DA-05-11, DA-21-09 (non réalisées, dites). |
| Protocole T17 / T18 | Tâches, relevé, SUS, calculs pour l'apprentissage ; gestes, appareils et consignation pour la performance ; diagnostic. |
| Robustesse | Connexions persistantes du serveur gardées 65 s (au-delà des 60 s usuelles des relais et clients) : une recette avait reçu un ECONNRESET en réutilisant une connexion fermée au même instant par le serveur. |
| Documentation | `docs/architecture.md` (l'Atelier après les lots 5–8), `README.md` (recettes, corpus IFC), `docs/migration/matrix.md`, README du module Atelier, registre des modules. |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ (core-geometry 47, domain-model 95, atelier-model 102, API 76, web 21) ·
  `npm run build` ✅.
- Recettes et scénario complet : voir `recette.md` §2 (tous verts avant le commit du lot).

## À décider par le maître d'ouvrage

Voir `recette.md` §6 : acceptation des lots, OCCT, fournisseur de modèle de langage, stockage objet, compte
buildingSMART, constat IFC dans un visualiseur tiers, refus serveur sur la référence protégée.
