# @parcours/atelier-model

Modèle typé de l'Atelier Architecture (cahier des charges `docs/atelier-cahier-des-charges.md`, section 5 ; décisions D-001
à D-013). Paquet **pur** : aucune dépendance à React, au DOM, à three.js, à Express ni à la base — le même code s'exécute dans
le navigateur (aperçu immédiat) et sur le serveur (validation faisant autorité). Contrats : `modele-atelier/1`,
`atelier-commands/1` (voir `manifest.json`).

| Module | Rôle |
| --- | --- |
| `unites.ts` | Grandeurs typées (`{ value, unit }`), coordonnées taguées (`frame: "local"`), tolérances (D-012). |
| `ontologie.ts` | Classes activées (`building.architecture`, poteau de `building.structure`, `drawing`, `annotation`), classe IFC 4.3, caractéristiques nommées, relations admises. |
| `modele.ts` | État immuable : niveaux, occurrences (paramètres canoniques par classe, propriétés typées avec provenance et statut), relations, définitions (types versionnés), calques, groupes, références, problèmes, site (parcelle avec transformation cadastral → local explicite, emprise, hypothèses, sources, structure déclarée). |
| `geometrie.ts` | Géométrie 2D pure : polygones, faces d'un mur, jonctions L / T / X, boucles fermées (détection de pièces par parcours des faces du graphe planaire), transformations, arcs, splines (Catmull-Rom centripète), décalage. |
| `commandes/` | Enveloppe, validation des paramètres par classe, réducteurs purs (objets, murs, transformations, organisation, site), registre des types de commandes (annexe B), application atomique d'un lot et inverse par instantané différentiel (`interne.restaurer`). |
| `references.ts` | Résolution d'une caractéristique nommée en point, propositions de réparation. |
| `quantites.ts` | Quantités reproductibles par niveau (pièces avec écart déclaré / calculé, murs, ouvertures, dalles, toitures, poteaux, escaliers, solides). |
| `import/natif.ts` | Importeur à sens unique du modèle natif du prototype (P.118 : 220 murs, 84 portes, 126 fenêtres, 32 escaliers, 120 poteaux, 45 espaces déclarés, 74 pièces dessinées, 6 dalles, 2 toitures, 13 zones, 2 références de plan, 870 solides, 64 cotations, 95 textes, 22 calques, parcelle, emprise, hypothèses, sources) avec rapport nominatif ; rien d'omis, aucun arrondi. |
| `projection/analyse.ts` | Projection vers l'entrée d'analyse de `@parcours/domain-model` (`analyseModel`) : les autres modules ne changent que leur source. |

Tests (`vitest`) : import P.118 (effectifs, coordonnées bit à bit, relations hôte, idempotence, analyse identique à celle du
modèle natif), commandes (identifiants déterministes, unités refusées, scission avec réaffectation et références à réparer,
transformations, lot atomique et inverse exact, détection de pièces, site).
