# Journal des décisions — chantier Atelier (DrawAll V4.1)

| Nº | Date | Décision | Motif | Auteur | Lot |
| --- | --- | --- | --- | --- | --- |
| D-001 | 2026-10-03 | Reconstruction complète de l'Atelier dans un nouveau module, sans pont avec le moteur extrait du prototype ; celui-ci est supprimé du produit à la bascule (lot 4). | Aucun projet à migrer en dehors de l'exemple P.118 ; un seul Atelier dans le produit final. | Maître d'ouvrage, sur proposition | 0 |
| D-002 | 2026-10-03 | L'exemple P.118 entre dans le modèle typé par un importeur à sens unique depuis `p118-native-model.json`, sans arrondi, avec rapport nominatif ; pas de conversion retour. | Règle AGENTS.md (rien d'omis, pas d'arrondi) ; pas de cohabitation. | Proposition | 1 |
| D-003 | 2026-10-03 | Géométrie canonique paramétrique pour les objets du bâtiment ; OCCT absent du dépôt tant que la licence n'est pas arbitrée (lot optionnel). | D1 (une seule géométrie canonique) ; D.3 (licence LGPL bloquante). | Proposition | — |
| D-004 | 2026-10-03 | Rendu 3D WebGL2 (three.js) par défaut, WebGPU en option avec repli ; aucun chiffre promis avant mesure. | D2 ; Concept §11. | Proposition | 3b |
| D-005 | 2026-10-03 | Pas de CRDT sur la géométrie ; réservation, variantes, fusion par rejeu validé ; Yjs au plus pour le texte d'annotation, selon mesures du lot 0. | D3. | Proposition | 0, 7 |
| D-006 | 2026-10-03 | IFC 4.3 : conformité testée en CI sur corpus, jamais « certifiée » ; objets importés sans historique paramétrique inventé. | D5. | Proposition | 6 |
| D-007 | 2026-10-03 | Fiche de capacité à l'état « spécifiée » avant tout code ; « disponible » seulement après preuve liée et acceptation. | Méthode de l'Exigences V4. | Proposition | tous |
| D-008 | 2026-10-03 | Ordre des lots : 0, 1, 2, 3a, 3b, 4 (bascule), puis 5 documents, 6 échanges, 7 versions, 8 automatisation, 9 recette ; lots 5–8 réordonnables. | Bascule tôt pour qu'un seul Atelier existe ; documents d'abord pour un atelier d'architecture. | Proposition | — |
| D-009 | 2026-10-03 | Les documents DrawAll V4.1 fournis sont versionnés dans `docs/drawall/` comme référentiel du chantier. | Les équipiers doivent pouvoir les lire sans accès à la conversation d'origine. | Chef de projet | 0 |
