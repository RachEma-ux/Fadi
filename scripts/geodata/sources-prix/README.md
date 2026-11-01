# Sources de prix des quartiers (D-GD-54)

Chaque fichier JSON de ce dossier **déclare** une source de prix de quartier : d'où viennent les prix, sous quels droits,
et comment lire ses champs. `scripts/geodata/preparer_prix_quartiers.py` en tire la couche au **schéma commun** et sa
fiche GeoData. Ce dossier ne contient aucune donnée : les données vivent dans `docs/geodata/sources/` (fichier d'origine
tel quel et couche préparée), puis en base.

| Déclaration | Statut | Fiche produite |
| --- | --- | --- |
| `feenway.json` | **Provisoire** (D-GD-54) : droits non établis, préproduction et développement seulement | `docs/geodata/sources/provisoires/feenway-prix-quartiers.json` |

## Schéma commun

Propriétés de chaque quartier : `code` (préfixe de la source + identifiant d'origine), `nom`, `ville`, `prix_m2`,
`prix_min_m2`, `prix_max_m2`, `indice_confiance`. Indicateurs : thème « Immobilier », familles « Prix moyen au m² »,
« Prix minimal au m² », « Prix maximal au m² », unité déclarée par la source (`DH/m²`). L'interface reconnaît un indicateur
par cette clé : une nouvelle source qui la respecte s'affiche sans aucun changement de code (carte, synthèse de la vue,
synthèse d'une entité, fiche, pastille « Immobilier et foncier »). Une valeur absente reste absente (« non publiée »),
jamais zéro ; rien n'est recalculé, lissé ni corrigé.

## Brancher une source future

1. **Qualifier la source** : producteur, licence, conditions de réutilisation, période, méthode. Une source qualifiée
   (ANCFCC, DGI, Bank Al-Maghrib…) déclare ses droits établis et **aucune** `qualification` ; une source dont les droits
   ne sont pas établis reste `provisoire`, avec motif et décision du maître d'ouvrage.
2. **Déposer le fichier d'origine** tel quel : `docs/geodata/sources/donnees/` (source qualifiée) ou
   `docs/geodata/sources/provisoires/donnees/` (source provisoire). GeoJSON de polygones en WGS 84. Une source qui publie
   ses prix par commune ou par code plutôt que par polygone se rattache aux contours déjà en base par une préparation
   dédiée (comme les tableaux du HCP), jamais par un rapprochement de noms non contrôlé.
3. **Écrire la déclaration** `<source>.json` sur le modèle de `feenway.json` : `cle`, `titre`, `description`,
   `producteur`, `couverture`, `dossier` (`""` pour une source qualifiée, `"provisoires"` sinon), `prefixeCode`, `unite`,
   `champs` (nom des champs d'origine pour code, nom, ville, prix, min, max, confiance), `origine`, `version` (libellé,
   période, licence, attribution, droits par usage, précision, conditions) et, pour une source provisoire, `qualification`.
4. **Préparer** : `python3 -I scripts/geodata/preparer_prix_quartiers.py --declaration scripts/geodata/sources-prix/<source>.json`
   (bilan : quartiers, valeurs absentes, incohérences min / moyen / max signalées sans correction, empreinte).
5. **Retirer FeenWay** quand la source qualifiée la remplace : ajouter à `docs/geodata/sources/donnees/retraits-sources.json`
   `{ "cle": "feenway-prix-quartiers", "remplacePar": "<cle de la nouvelle source>", "motif": "…", "decision": "D-GD-n" }`
   et supprimer `scripts/geodata/sources-prix/feenway.json` et `docs/geodata/sources/provisoires/feenway-prix-quartiers*`.
   Le retrait n'est appliqué qu'une fois la remplaçante publiée.
6. Tests (`apps/api/src/db/geodata-sources.test.ts`), typecheck, build, recette, puis décision consignée dans
   `docs/continuity/decisions/ADR-GEODATA-02.md`.

## Relever à nouveau FeenWay (provisoire)

`python3 -I scripts/geodata/collecter_feenway.py` réécrit le fichier d'origine (réponse telle quelle), puis l'étape 4
avec `feenway.json` met à jour la couche et sa fiche (nouvelle empreinte : nouvelle version au prochain import).
