# Addendum préparatoire — picking et ADR/navigation

Trois résiduels uniquement. Aucun ADR créé ni décision adoptée. Claude est annoncé porteur de la proposition ADR-01/02 (commentaire 6251022689 relayé par A0) ; A0 réconcilie, A2 conserve son périmètre. Ses nouvelles pièces ne sont pas prétendues relues.

## C.2-03 — oracles candidats

La conservation d’un identifiant ne suffit pas : géométrie ciblée, contexte/révision, droits, surbrillance, inspecteur et cible de commande doivent concorder. Aucun seuil ni départage géométrique n’est inventé.

- **PICK-EMPTY — Sélection vide** : Aucune cible sélectionnée, commandes dépendantes désactivées avec raison accessible ; pas de remplacement automatique. Cas futur : Cliquer le fond vide puis invoquer commande objet : aucune mutation ni ciblage ancien. Oracle : Contrôler sélection canonique vide ET absence surbrillance/poignées/inspecteur ancien ; notification FR/EN si nécessaire.
- **PICK-MODIFIED — Objet modifié, identité conservée** : Conserver objectId et contexte autorisé si objet subsiste ; reconstruire projection à la révision acceptée. Cas futur : Déplacer A : ancien emplacement ne sélectionne plus A si aucune géométrie restante ; nouvel emplacement sélectionne A. Oracle : Comparer cible géométrique, objectId, inspecteur et commandes à référence ; simple ID conservé insuffisant.
- **PICK-DELETED — Objet supprimé** : Invalider ciblage périmé ; option candidate vider sélection + message, ou conserver témoin non éditable explicitement marqué. Choix UX non arbitré. Cas futur : Supprimer A ; réutiliser un drawId pour B : aucune commande destinée à A ne cible B. Oracle : Absence de highlight fantôme/poignées actives et refus de commande sur ancien objet ; remplacement automatique interdit sans contrat explicite.
- **PICK-UNAVAILABLE — Représentation indisponible** : Distinguer absence objet et projection en chargement/échec ; sélection canonique connue peut rester informative seulement si droits vérifiés. Cas futur : Géométrie A non chargée : ne pas afficher picking prêt ni inventer B ; reprise reconstruit la bonne révision. Oracle : État et raison accessibles ; ciblage géométrique non confirmé ne devient pas preuve ; aucune donnée divulguée après révocation.
- **PICK-STALE — Résultat asynchrone périmé** : Résultat d’ancien contexte ou ancienne révision ne retargete pas sélection courante. Cas futur : Pointer A puis changer variante/révision avant réponse worker : réponse ancienne ignorée. Oracle : P/S/V/R, sourceRevisionId et droits concordent pour résultat appliqué ; observer aucun changement sur nouvelle variante.
- **PICK-BATCH — Lot de rendu et ambiguïté** : Mapping stable objets/instances/triangles ; priorité et tolérance de référence restent à fixer, aucune valeur inventée. Cas futur : Deux objets superposés, calque caché ou référence non sélectionnable ; comparer index et référence. Oracle : Cible et point géométrique identiques selon règle déclarée, traces ambiguïtés ; présence du même ID dans scène insuffisante.
- **PICK-UNDO — Annulation et restauration** : Une inversion est une nouvelle commande ; reconstruction au contexte/révision courant. Restaurer sélection n’est pas impliqué par restaurer objet. Cas futur : Undo suppression A, puis redo ; identité canonique et mapping vérifiés ; aucun ancien drawId réaffecté silencieusement. Oracle : Cohérence géométrie/état autorisé ; politique de restauration sélection à décider, pas déduite du journal.
- **PICK-MULTI — Sélection multiple et accès** : Retirer/invalider membres supprimés ou interdits sans détourner les autres ; détail UX candidat. Cas futur : A+B sélectionnés ; supprimer A ou retirer accès A ; B reste cohérent si autorisé. Oracle : Aucune action collective sur objet absent/interdit, compte accessible exact sans fuite metadata ; politique sélection partielle à arbitrer.

Choix restant humains/architecture : vider ou témoin après suppression, restauration de sélection après undo, sélection multiple partielle, remplacement/scission et règle des ambiguïtés. Tous les cas sont non exécutés.

## ADR-01/02 — renvois sans doublon

ADR-01 : reprendre G1_INDEX/G1_REVIEW, CONTRAT-NAV-M004/NAV9, NAV-DELTA-G1-v2, COEX03 et M17 ; conserver les trois réserves COEX et les quatre questions déjà publiées. Le nom ADR-STUDIO-NAV-01 est un exemple, sans réservation ni adoption. Aucun auteur humain, décideur ni date de décision ne sont inventés.

ADR-02 : les contrats sont déjà décrits dans NAV/M21. Seuls les manques physiques restent à porter dans la proposition : routes/query, mapping permissions, refus sans fuite/focus/cache, reprise des files, transfert d’autorité compatible, preuves mobile/clavier/FR-EN/plein écran. Le JSON donne les renvois exacts par aspect et toutes les empreintes des pièces.

## Prochains déclencheurs

C.2-03 : confirmation des effets/identités par A2 et arbitrage ciblé des politiques UX, puis corpus et assertions préparés par A5. ADR-01/02 : publication de la proposition Claude, revue de son delta et réconciliation A0/A2 avant décision humaine. D07, Atelier/Planche et 21 étapes sont conservés. PR #142 reste un recouvrement à réconcilier ; aucune nouvelle vérification de son SHA ni de sa CI dans cette tâche.

Aucun code, UI, test, navigateur, API, base, service ou mesure exécuté ; aucune porte G1–4 ni statut Vérifié/Accepté accordé.
