# Lot Planche 7 — Persistance par commandes, Planches nommées, IFC, recette — compte rendu

**Statut : code livré sur la branche `planche/lot-7` ; tests du noyau, de l'API (base PostgreSQL) et recettes navigateur
exécutés ici ; CI GitHub et acceptation du maître d'ouvrage en attente** (8 octobre 2026). Cadre : `cahier-planche.md`
§8 (lot 7), §5.7, §7.1, décisions P-1 et P-6 (D-167), choix du lot consignés en D-172.

> **Accepté par le maître d'ouvrage le 8 octobre 2026 (D-174)** ; fiches du lot à l'état « disponible ».

## Ce qui est livré

| Tâche | Contenu | Fichiers | Fiche |
| --- | --- | --- | --- |
| L7.1 | **Planches nommées (P-1)** : une Planche est une définition `planche` du modèle de l'Atelier — nom, niveau de référence facultatif (origine en altitude), modèle de géométrie libre, empreinte reproductible ; plusieurs Planches par projet ; hors métrés (ce ne sont pas des objets) | `packages/atelier-model/src/commandes/planches.ts`, `modele.ts` (`ClasseDefinition`), `archive.ts` (revalidation à l'import) | PL-07-01 |
| L7.2 | **Commandes du contrat** (version **`atelier-commands/2`**, `/1` toujours accepté) : `planche.creer` (vide ou reprise d'un brouillon validé), `planche.renommer` (nom, niveau), `planche.copier` (« Enregistrer sous »), `planche.supprimer`, **`planche.operation`** (un pas de la Planche = différence structurelle `DeltaPlanche` + empreinte d'arrivée ; le serveur applique le même delta avec la même fonction pure et refuse — précondition, 409 — si l'empreinte obtenue n'est pas celle annoncée) ; idempotence par `requestId`, `baseRevision` périmée → 409, journal (une opération = une entrée), inverse = instantané différentiel (annuler / rétablir de l'Atelier) | `planches.ts`, `base.ts` (`CONTRATS_ACCEPTES`), `index.ts`, `apps/api/src/routes/atelier-commands.ts` (schéma) | PL-07-01 |
| L7.3 | Noyau Planche : `differencePlanche` / `appliquerDeltaPlanche` (tables par identifiant, `null` = suppression, définitions remplacées entières, repère / réglages), `empreintePlanche` (FNV-1a 64 bits sur la forme canonique à clés triées), `lireModelePlanche` (lecture validée), `estDeltaPlanche`, `maillagesPlanche` (représentation hors Planche) | `packages/planche-model/src/delta.ts`, `representation.ts` | PL-07-01 |
| L7.4 | **Planche reliée au projet** : chaque pas de l'historique local (opération, Ctrl + Z, Ctrl + Y) devient une commande `planche.operation` envoyée par le bus de l'Atelier (file hors ligne IndexedDB, rejeu au retour du réseau, 409 et conflits existants, MO-2) ; le modèle de la Planche ouverte est adopté à l'ouverture et quand le projet le change (autre poste, lot refusé), reconnu par l'empreinte ; le **brouillon local** reste la Planche d'un projet sans Planche et sa reprise dans le projet est **proposée** (« Nouvelle Planche… », case cochée), jamais imposée | `Planche.tsx`, `brouillon.ts`, `etat-ui.ts` (`plancheId`), `AtelierNouveau.tsx` | PL-07-02 |
| L7.5 | **Menu principal** (§7.1) dans la barre du haut : Ouvrir (liste des Planches, niveau affiché), Nouvelle Planche…, Renommer / niveau de référence…, Enregistrer sous…, Supprimer (confirmation), **Exporter la Planche en IFC**, **Télécharger la vue (PNG)** ; ordinateur et téléphone | `menu-planche.tsx`, `planche.css`, `messages.ts` | PL-07-02 |
| L7.6 | **IFC** (C14, P-6) : chaque objet de la racine d'une Planche est un `IfcBuildingElementProxy` tessellé (`IfcTriangulatedFaceSet`, ObjectType « Planche », `Fadi_Planche` : Planche, Identifiant, Genre, Solide, Volume des seuls solides), posé sous l'étage de référence (sinon le bâtiment) ; la géométrie libre forme un proxy « Géométrie libre » ; dans l'IFC du projet (`modele.ifc`) et dans l'IFC d'une Planche seule (`GET /projects/:id/atelier/planches/:plancheId/export.ifc`) ; corpus `petit.ifc` enrichi d'une Planche (référence régénérée, effectif `IfcBuildingElementProxy: 1`) validé par IfcOpenShell en CI | `echanges/ifc.ts`, `routes/atelier-commands.ts`, `test-corpus/ifc/generer.ts`, `petit.attendu.ifc` | PL-07-03 |
| L7.7 | **3D de l'Atelier** : les Planches sont dessinées en lecture seule (maillages gris, ni sélectionnables ni accrochables) dans le groupe de leur niveau de référence ; `fadiMesures3D.planches` les compte | `vue3d/scene3d.ts`, `Vue3D.tsx` | PL-07-02 |
| L7.9 | **OBJ / STL** (P-6, D-173) : `exporterObj`, `exporterStl` (noyau pur, `echanges.ts`), entrées du menu ☰, message « {format} écrit : N objet(s), N triangle(s) » | `packages/planche-model/src/echanges.ts`, `menu-planche.tsx`, `Planche.tsx` | PL-07-03 |
| L7.8 | Tests : `delta.test.ts` (aller-retour, empreinte stable, lecture validée), `planches.test.ts` (commandes, inverse), `atelier-planches.test.ts` (API : idempotence, 409 révision / empreinte, journal, annuler, IFC relu par web-ifc — nombre de proxys et **volume** égaux à ceux de la Planche, altitude du niveau de référence, IFC d'une Planche seule, renommer / copier / supprimer / doublon) ; recette `planche-lot-7.mjs` (ordinateur, hors ligne, téléphone, axe-core, 31 vérifications) câblée en CI | `packages/*/src`, `apps/api/src/routes`, `apps/web/e2e` | — |

## Critères du cahier (lot 7) et preuves

| Critère | Preuve |
| --- | --- |
| Une opération = une entrée de journal | e2e : « Rectangle », « Annulé : Rectangle. », « Rétabli : Rectangle. » ; API : journal `["Nouvelle Planche", "Rectangle"]` |
| Rejouer un `requestId` ne l'applique pas deux fois | API et e2e : `rejouee: true`, révision inchangée |
| `baseRevision` périmée → 409 | API et e2e : `motif: "revision"` ; empreinte fausse → `motif: "precondition"` |
| Hors ligne → file, reprise à la reconnexion | e2e : barre « hors-ligne », lot rejoué au retour du réseau (2 → 3 faces sur le serveur) |
| IFC relu par web-ifc : nombre de proxys et volumes égaux à ceux de la Planche | `atelier-planches.test.ts` : 2 proxys, volume de la boîte 4 m³ à 10⁻⁶, z min = altitude du niveau |
| Recette verte | `planche-lot-7.mjs` : 31 vérifications (ordinateur, hors ligne, téléphone, axe-core) ; recettes antérieures de la Planche et de l'Atelier toujours vertes |
| Décision P-1 appliquée | plusieurs Planches nommées, niveau de référence, 3D en lecture seule, hors métrés |

## Choix Fadi déclarés (D-172)

- **Une Planche est une définition** du modèle typé (classe `planche`), pas une table nouvelle : persistance par
  différentiel, versions, variantes, archive, journal et inverse existants s'appliquent sans code dédié (MO-2).
- **Granularité** : une commande `planche.operation` par pas d'historique ; son contenu est la différence structurelle
  (jamais le modèle entier), l'inverse est l'instantané différentiel de l'Atelier (la définition d'avant, entière) —
  déclaré : le journal porte donc le modèle complet de la Planche à chaque pas en inverse ; à revoir si les Planches
  dépassent quelques mégaoctets (compactage des inverses).
- **Contrat `atelier-commands/2`** : les lots `/1` restent acceptés (mêmes commandes, mêmes réducteurs) pour les files
  hors ligne déjà écrites et les recettes ; la version du contrat n'entraîne aucune migration.
- **Annuler / rétablir** : l'historique local de la Planche reste l'interface (réponse immédiate) ; chaque annulation
  ou rétablissement est **une commande de plus** (libellée « Annulé : … », « Rétabli : … »), jamais un retrait du
  journal ; Annuler / Rétablir de l'Atelier (journal) agit aussi sur les Planches par l'inverse.
- **Brouillon local** : conservé tel quel pour un projet sans Planche (hors ligne comme avant) ; dès qu'une Planche du
  projet est ouverte, rien n'est plus écrit dans le brouillon (le projet et la file hors ligne du bus font foi).
- **Synchronisation** : la Planche ouverte adopte le modèle du projet quand son empreinte diffère de l'empreinte
  locale (modification d'un autre poste connue à la synchronisation du bus, lot refusé) ; une modification faite par un
  autre poste n'est connue qu'à la prochaine synchronisation du bus (pas de canal temps réel), déclaré.
- **IFC** : `IfcBuildingElementProxy` (C14) et non un reclassement ; volume écrit pour les seuls solides (lot 6), les
  autres objets et la géométrie libre sont tessellés sans volume (« non évalué ») ; les Planches ne produisent
  aucune quantité dans `quantites.html` (ce ne sont pas des objets).
- **PNG** : image du canevas de la Planche telle qu'affichée ; **OBJ / STL** (P-6, D-173) : livrés en ASCII depuis le menu ☰
  (`exporterObj` / `exporterStl` du noyau : mètres, Z vers le haut, un objet OBJ par maillage, un `solid` STL par Planche,
  texte reproductible) ; DWG / SKP et les autres formats de SketchUp restent exclus.
- Menu principal : entrées de SketchUp sans équivalent Fadi (Trimble Connect, 3D Warehouse, emplacement, imprimer)
  non reproduites (C13, C17, P-2) ; « Partager » et « Accueil » restent ceux du projet.

## Ce que le maître d'ouvrage pourra vérifier lui-même

- Planche d'un projet neuf : dessiner (brouillon local, note affichée) → ☰ → **Nouvelle Planche…** (case « Reprendre le
  brouillon » cochée) → Créer : la note disparaît, le journal de l'Atelier porte « Nouvelle Planche… » ; chaque
  rectangle, chaque Ctrl + Z ajoute une entrée ; mode avion → dessiner → retour du réseau → le projet reçoit le lot.
- ☰ → Renommer / niveau de référence, Enregistrer sous, Ouvrir (liste), Supprimer ; Exporter la Planche en IFC
  (fichier `<code>_<nom>.ifc`), Télécharger la vue (PNG) ; mode 3D : la Planche apparaît en gris.
- `npm test --workspace=@parcours/planche-model` (delta), `--workspace=@parcours/atelier-model` (planches),
  `--workspace=@fadi/api` (atelier-planches) ; `node apps/web/e2e/planche-lot-7.mjs`.
