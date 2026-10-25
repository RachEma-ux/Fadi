# Achèvement de Studio — réconciliation et suivi — 25 octobre 2026

Mandat du maître d'ouvrage du 25 octobre 2026 : achever Studio jusqu'à une livraison vérifiée, sous la délégation consignée en [ADR-STUDIO-PILOTE-01](../../../continuity/decisions/ADR-STUDIO-PILOTE-01.md) P-12.

## Réconciliation des chiffres

Le bilan précédent annonçait **425 obligations closes sur 630**, soit **205 restantes**. Ses catégories n'en détaillaient que 120 : les restes du point 2. Les 86 autres venaient du rapprochement du 25 octobre et n'étaient pas reprises dans ce compte rendu.

| Origine | Nombre |
|---|---:|
| Point 2 : fonctions absentes | 49 |
| Point 2 : décisions | 35 |
| Point 2 : partielles | 24 |
| Point 2 : mesures | 9 |
| Point 2 : preuves documentaires non retenues | 2 |
| Point 2 : sous-total | 119 |
| Rapprochement : mesures (migration, estimation, risques, jalons) | 29 |
| Rapprochement : suivi continu (SUIVI, PR, ARC-08, BLOC-07) | 16 |
| Rapprochement : production (R.*, J7, J8, OPS) | 16 |
| Rapprochement : non couvert (lot F, extensions) | 7 |
| Rapprochement : hors pilote (lot F) | 5 |
| Rapprochement : décisions (G2-05, G4-03, PASS-03, PASS-04) | 4 |
| Rapprochement : partiel (TEST-033) | 1 |
| Restes des lots F1 et F2 et de G4 | 8 |
| **Total** | **205** |

Le sous-total du point 2 est de 119 et non de 120 : l'une des 50 « fonctions absentes » a été vérifiée depuis, par un lot suivant (G1, BLOC-02).

## Plan d'exécution

Les obligations sont reprises par lots cohérents. Un lot est inscrit au registre seulement après sa fusion, CI verte, avec ses preuves :

| Lot | Contenu |
|---|---|
| PUB | publications, dossiers, coupes, quantités, observations, manifeste |
| CMD | commandes, révisions, états dérivés, migration du schéma, tâches serveur, bascule |
| OUT | outils, profils, chargement, Workers, caches, quotas, instanciation |
| REND | repères, rendu 2D avancé, renderer alternatif sous garde, mesures |
| F | illustration (fournisseur local, fournisseur externe sous politique), adaptateur MCP, extensions |
| API | contrats versionnés des 48 routes |
| REG | contrôles du registre et du suivi, analyse de secrets, corpus S1 à S7 |
| Décisions courantes | P-12 |

## État au moment de ce document

193 obligations ouvertes après la requalification par dépendances et les décisions P-12. Elles sont suivies au registre. Leur état exact est recalculé à chaque lot dans les checkpoints `STATUS.md` et `HANDOFF.md`.
