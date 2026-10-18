# Chantier Atelier Architecture Fadi — dossier de suivi

> **Décision Fadi — 17 octobre 2026 (Issue #147).** Les capacités de dessin et les fonctions industrielles (mécanique, structure, bois, tôlerie, MEP, etc.) restent natives à Fadi. Les normes techniques restent référencées selon leur organisme d'origine ; les éléments propres au produit DrawAll sont exclus du référentiel opérationnel Fadi. Les fiches historiques `DA-...` ne sont pas supprimées sans remplacement sûr de leur traçabilité et de leurs tests.


Documents de pilotage Fadi : `docs/atelier-cahier-des-charges.md` (historique d'exécution), `docs/atelier/decisions.md` (décisions Fadi), `docs/atelier/recette.md` (recette). Les références propres à l'autre produit sont isolées dans le suivi de décontamination (Issue #147).

| Emplacement | Contenu | Tenu par |
| --- | --- | --- |
| `fiches/DA-XX-YY.md` | Une fiche de capacité par entrée DA retenue (gabarit `fiches/_gabarit.md`) ; état en tête de fiche | équipiers « fiches », puis propriétaires des fonctions |
| `decisions.md` | Journal des décisions : date, décision, motif, auteur, lot | chef de projet |
| `p0-mesures.md` | Mesures du lot 0, puis une section par lot ; banc déclaré pour chaque mesure | équipier « mesures » |
| `maquette/` | Maquette HTML statique de l'Atelier et captures (lot 0), validée par le maître d'ouvrage | équipier « maquette » |
| `captures/` | Captures produites par la recette du nouvel Atelier (`apps/web/e2e/atelier-nouveau.mjs`) | chef de projet |
| `lots/lot-N.md` | Compte rendu de chaque lot : fait, non fait, matrice de propriété, tests, mesures, décisions prises, décisions à prendre, ce que le maître d'ouvrage peut vérifier | chef de projet |
| `matrice-echanges.md` | Matrice d'échanges IFC / DXF / PDF / paquet natif (lot 6) | équipier « IFC » |
| `recette.md` | Dossier de recette finale (lot 9) | chef de projet |
| `recette-p2.md` | Dossier de recette P2 (lot P2-8) : livré, contrôles, T01–T20 rejouées sur P2, parcours guidé, décisions ouvertes | chef de projet |

États d'une fiche : `à spécifier` → `spécifiée` → `prototype` → `vérifiée` → `disponible` (ce dernier posé
uniquement après acceptation du maître d'ouvrage).
