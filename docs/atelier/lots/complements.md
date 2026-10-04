# Compléments après le lot 9 — compte rendu

Exécuté le 4 octobre 2026 (chef de projet, session unique ; exécution continue décidée en D-010). Décision : D-022.

Ces compléments lèvent quatre limites déclarées par la recette (`recette.md` §7) ; ils n'ouvrent aucune décision
de la section 10.1.

## Fait

| Sujet | Résultat | Preuve |
| --- | --- | --- |
| Historique d'un objet (DA-21-06 -d) | `GET /atelier/objets/:id/historique` : créé, modifié, supprimé (avec successeurs d'une scission), auteur, révision, date ; repli « Historique de l'objet » dans l'inspecteur. | test API « historique d'un objet », e2e `atelier-complements.mjs` |
| Consultation d'un état passé | Bouton « Consulter » sur une entrée du journal (révision reconstituée) et sur une version nommée : modèle affiché en lecture seule, bandeau, barre d'enregistrement masquée, annuler / rétablir bloqués. | e2e |
| Réutilisation de modèle (DA-21-09) | Panneau « Reprendre d'un autre projet » : source (projet ou version nommée), familles, données de projet à cocher, homonymes ; aperçu sans écriture puis reprise en une révision ; rapport (par classe, niveaux, homonymes, à réparer, non repris). | `reprise.test.ts` (3), `commandes.test.ts` (3), test API « reprise », e2e (590 objets du P.118 repris) |
| Références externes (DA-05-11) | Panneau « Références externes » : rattacher la publication d'un autre projet (niveau source, niveau du projet, origine, rotation) ; superposition grise non sélectionnable ; état ; différences puis épinglage de la dernière publication ; détacher. Refus : sans lecture de la source (404), publication ou empreinte fausse, niveau inconnu, référence circulaire directe ou par chaîne (409). | `refexterne.test.ts` (2), test API « références externes », e2e |

## Contrôles

- `npm run typecheck` ✅ · `npm test` ✅ · `npm run build` ✅ (effectifs : `recette.md` §2).
- Recettes `atelier-nouveau`, `atelier-documents`, `atelier-echanges`, `atelier-versions`, `atelier-automatisation`,
  `atelier-complements` et scénario complet verts en local avant le commit ; nouvelle étape CI pour
  `atelier-complements.mjs`.

## Non fait (déclaré dans les fiches)

- Références externes : accrochage sur la source, représentation dans les documents dérivés et la 3D, cache hors
  ligne persistant, réparation d'une référence inaccessible, contrat source plus récent.
- Réutilisation : sélection spatiale, bibliothèques de définitions partagées.

## À vérifier par le maître d'ouvrage

Dans l'Atelier d'une copie de P.118 : sélectionner un mur, ouvrir « Historique de l'objet » ; dans « Complet »,
« Journal » → « Consulter » ; dans un projet vide avec un niveau, « Reprendre d'un autre projet » → Aperçu →
Reprendre ; publier un second projet, puis « Références externes » → Rattacher.
