# Matrice d’échanges de Studio

<!-- Généré depuis packages/atelier-model/src/studio/echanges/matrice-echanges.ts (studio-matrice-echanges/1, révision 8) : ne pas éditer à la main. -->

Établie le 2026-10-26 (révision 8, schéma `studio-matrice-echanges/1`), à partir de l’audit des exporteurs et importeurs Studio. Lots E.6-01 à E.6-05 du plan d’implémentation Studio V1.0 (§5.7).

**Aucune entrée n’est une déclaration de conformité** : « livré » dit ce que le code écrit ou lit et le contrôle qui le vérifie ; la conformité d’un format reste non évaluée. Un format reporté est inscrit « non livré » avec sa raison et sa source ; « renoncé » exige une décision Studio admise (aucune aujourd’hui).

Entrées : 45 — livrées : 31, non livrées : 14, renoncées : 0.

## Formats × sens

| Identifiant | Format | Version du format | Sens | Famille | Objet | Statut | Tâches | Limite de couverture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `natif-commandes` | Enveloppe de commandes Studio (JSON) | studio-commands/1 | import | natif | Commandes de document appliquées à une variante (seule écriture du modèle) | livré | E.6-02 | 500 commandes et 1 Mo par enveloppe ; chaque commande est revalidée par le serveur, qui fait seul autorité ; rejeu idempotent par requestId. |
| `natif-archive-export` | Archive de projet (section Studio, JSON) | fadi-studio-archive/1 (document studio-document/1) | export | natif | Études, variantes, révisions immuables, commentaires, observations, publications et leurs fichiers figés, exigences, journal du métré | livré | E.6-02 | Section signée (HMAC-SHA256 du manifeste, clé du serveur) ; empreintes de contenu conservées ; rien n’est recalculé. |
| `natif-archive-import` | Archive de projet (section Studio, JSON) | fadi-studio-archive/1 (document studio-document/1) | import | natif | Restauration de la section Studio dans un nouveau projet | livré | E.6-02 | Manifeste et empreintes contrôlés (refus 422) ; sans signature vérifiée par ce serveur, auteurs et approbations ne sont pas crus ; identifiant déjà présent : partie Studio non restaurée, réserve signalée. |
| `natif-file-locale` | File locale hors ligne (JSON) | fadi-studio-file-locale/1 | export | natif | Copie de secours d’une file locale de commandes non synchronisée | livré | E.6-02 | Export de secours seulement : Studio ne relit pas ce fichier ; la ligne exportée est relue du stockage, jamais de la mémoire. |
| `natif-profil-outils-export` | Profil d’outils Studio (JSON) | fadi-studio-profil/1 | export | natif | Profil d’outils du compte (profileId, version, ordre, raccourcis personnels, visibilité) | livré | E.6-02 | Préférences du compte seulement : aucune donnée du projet, aucun droit (EX-033, INV-009). |
| `natif-profil-outils-import` | Profil d’outils Studio (JSON) | fadi-studio-profil/1 | import | natif | Profil d’outils importé dans le compte | livré | E.6-02 | Aucun droit conféré : une capacité exigeant un droit absent est refusée ; raccourcis en conflit refusés ou écartés sur demande explicite. |
| `dessin-svg` | SVG | SVG (espace de noms W3C, aucune version déclarée dans le fichier) | export | dessin | Document d’une révision de variante (plan 2D) | livré | E.6-03 | Plan 2D seulement : solides et hauteurs absents ; calques masqués conservés sous display="none" ; graphismes (splines en courbes de Bézier exactes, traits de hachure, symboles) avec leur transparence (opacity) ; aucun script ni ressource externe. |
| `dessin-dxf` | DXF ASCII | R12 (AC1009), CRLF, $INSUNITS = 6 (mètre) | export | dessin | Document d’une révision de variante (plan 2D) | livré | E.6-03 | R12 seulement ; $INSUNITS n’appartient pas à R12 (variable introduite avec AC1015) : l’unité n’est pas garantie chez un lecteur R12 strict ; ASCII strict (texte échappé, 250 caractères) ; cotes non associatives ; noms de calque réécrits (31 caractères ASCII) ; solides absents ; splines découpées en POLYLINE (16 segments par morceau de Bézier), transparence des graphismes non portée (déclarée en commentaire 999). |
| `maquette-ifc` | IFC (STEP physique, ISO 10303-21) | IFC4X3_ADD2, ViewDefinition [ReferenceView] | export | maquette | Objets extrudés, solides libres, murs et ouvertures, propriétés déclarées d’une révision | livré | E.6-03 | Seuls les éléments 3D sont écrits ; arcs discrétisés ; cotes, annotations et réglages de visualisation absents ; IfcDoor / IfcWindow seulement si le type est déclaré, sans représentation propre. |
| `maquette-obj` | OBJ (Wavefront) | OBJ texte ASCII, studio-export-obj/1 (le format ne déclare aucune version) | export | maquette | Géométrie 3D d’une révision (maillage triangulé de la vue 3D) | livré | E.6-04 | Maillage seulement : courbes discrétisées comme dans la vue 3D, coordonnées au micromètre ; mètres déclarés en commentaire (OBJ ne porte aucune unité) ; aucun matériau ; tous les calques écrits, un calque masqué signalé ; ce qui n’est pas une géométrie 3D est compté dans l’en-tête, jamais écrit. |
| `maquette-stl` | STL ASCII | STL ASCII (solid … endsolid), sans version | export | maquette | Solides d’une révision (facettes triangulées) | livré | E.6-04 | Une seule pièce « solid » : STL ne porte ni unité (mètres), ni identité, ni calque ; facettes des solides seulement, normale unitaire calculée dans le sens des sommets ; courbes discrétisées ; surfaces sans épaisseur et contours plats non écrits (comptés par le bilan de l’export). |
| `maquette-step` | STEP (ISO 10303-21) | AP214 (FILE_SCHEMA AUTOMOTIVE_DESIGN, écrit par OCCT 8.0), assemblage XCAF nommé | export | maquette | Solides d’une révision en représentation exacte (brep), un produit nommé par élément | livré | E.6-04 | Écrit côté serveur par le noyau exact (OCCT en WebAssembly, chargé à la demande) ; millimètres déclarés (SI_UNIT .MILLI. .METRE.), géométrie mise à l’échelle × 1 000 depuis les mètres du modèle ; horodatage de la révision ; emprises des objets extrudés discrétisées comme dans la vue 3D ; aucune couleur ni propriété ; révision sans solide : refus 422, jamais un fichier vide. |
| `dessin-dxf-import` | DXF ASCII | R12 et suivantes (codes de groupe), CRLF ou LF ; DXF binaire refusé | import | dessin | Plan 2D ajouté au brouillon d’une variante, par commandes | livré | E.6-03 | 5 Mo au plus ; unité lue dans $INSUNITS (16 codes reconnus ; tout autre code, 0 ou absent : unité inconnue, choisie par l’utilisateur, jamais devinée) ; un calque déjà verrouillé dans le document (calque implicite compris) qui recevrait des objets fait échouer l’import ; Z ignoré (compté) ; tout le reste compté par type dans le rapport d’import, jamais écarté en silence. |
| `maquette-ifc-import` | IFC (STEP physique, ISO 10303-21) | IFC2X3, IFC4, IFC4X1 à IFC4X3 (FILE_SCHEMA lu) ; ifcXML et ifcZIP refusés | import | maquette | Maquette d’un autre logiciel ajoutée au brouillon d’une variante, par commandes | livré | E.6-04 | 5 Mo au plus ; lecteur STEP propre, sans web-ifc ; unité de longueur lue dans l’IfcUnitAssignment du projet (IfcSIUnit et son préfixe, ou IfcConversionBasedUnit dont le facteur est déclaré), absente : rien n’est importé, jamais supposée ; seules les extrusions verticales (IfcExtrudedAreaSolid d’un IfcRectangleProfileDef ou d’un IfcArbitraryClosedProfileDef droit) placées par IfcLocalPlacement tourné autour de z sont traduites ; toute autre entité ou géométrie est conservée comme élément non natif, et chaque information non reprise est comptée dans le rapport de pertes. |
| `modele-externe-ifc` | IFC (STEP physique, ISO 10303-21) | IFC2X3, IFC4, IFC4X1 à IFC4X3 (lecteur de l’import IFC) | import | coordination | Modèle d’un partenaire référencé, comparé à la révision courante, accepté ou refusé | livré | E.6-04 | Référence, auteur, discipline, version, unité, transformation, repère source et restrictions d’utilisation déclarés par l’émetteur ; fichier relu par le serveur dans un document à part, jamais dans la variante ; comparaison par identifiant (GlobalId) avec la révision courante ; acceptation ou refus réservés au propriétaire et aux approbateurs, journalisés, un refus avec motif ; accepté, le modèle s’ajoute au brouillon seulement par une action explicite ; non repris par l’archive du projet. |
| `feuille-svg` | SVG | studio-sheet/1 (SVG en millimètres) | export | feuille | Feuille de présentation d’une révision (format, échelle, cartouche) | livré | E.6-02 | A4 à A1 ; échelle choisie ou ajustée ; dessin découpé au cadre ; valeur absente du cartouche imprimée « non évalué ». |
| `feuille-pdf` | PDF | PDF 1.4 (une page) | export | feuille | Feuille de présentation d’une révision | livré | E.6-02 | Mêmes primitives que la feuille SVG ; aucune conformité PDF/A déclarée. |
| `feuille-composee-svg` | SVG | studio-feuille-composee/1 (feuille studio-sheet/1 avec ligne de provenance) | export | feuille | Feuille composée enregistrée (vue source, révision épinglée) | livré | E.6-02 | Lit une révision enregistrée, jamais le brouillon ; provenance recalculée par le serveur (révision, empreintes du document et de la vue). |
| `feuille-composee-pdf` | PDF | PDF 1.4 (une page) | export | feuille | Feuille composée enregistrée | livré | E.6-02 | Mêmes primitives que la feuille composée SVG ; aucune conformité PDF/A déclarée. |
| `dossier-pdf` | PDF | PDF 1.4 (plusieurs pages) | export | dossier | Dossier de conception : feuilles ordonnées, métré, rapport de fidélité | livré | E.6-02 | Quantités brutes, déductions et nettes séparées ; valeur absente « non évalué » ; aucune conformité PDF/A déclarée. |
| `dossier-json` | JSON | studio-dossier-conception/1 | export | dossier | Dossier de conception (données natives du dossier) | livré | E.6-02 | Export seulement : aucun import de dossier ; empreinte du dossier portée en en-tête. |
| `tableau-metre-csv` | CSV | UTF-8 avec BOM, séparateur « ; », décimale « , » ou « . » | export | tableau | Tableau du métré d’une révision (brut, déductions, net, ajustements) | livré | E.6-02 | Export seulement ; statut de chaque ajustement écrit en clair ; refusé tant que le métré n’est pas à jour. |
| `rendu-png` | PNG | PNG (bloc iTXt « fadi:rendu » de provenance) | export | rendu | Rendu du modèle depuis la vue 3D d’une révision enregistrée | livré | E.6-02 | Image du canevas, pixels non modifiés ; refusé sur un brouillon non enregistré ou un maillage en cours ; provenance : étude, variante, révision, scène, caméra, date. |
| `illustration-png` | PNG | PNG (bloc iTXt « fadi:illustration » de provenance, studio-illustration/1) | export | rendu | Illustration archivée, tirée du rendu du modèle d’une vue (lot F) | livré | E.6-02 | Image séparée « non vérifiée » : ni métrique, ni conforme, aucune donnée du modèle relisible ; provenance : rendu source, empreintes du document avant et après, paramètres, fournisseur, coûts, reproductibilité. |
| `paquet-publication` | Paquet de publication (SVG, DXF, IFC, feuille PDF ; dossier de conception : PDF et JSON) | studio-publication-manifest/1 | export | paquet | Fichiers figés d’une publication approuvée et diffusée | livré | E.6-02 | Fichiers du manifeste approuvé, identifiés par SHA-256 et vérifiables ; dessin 2D indépendant : sans IFC ; dossier de conception (lot PUB) : PDF et JSON du dossier, feuilles et vues de coupe jointes ; mêmes limites que chaque export. |
| `rapport-fidelite-json` | JSON | studio-rapport-fidelite/1 | export | rapport | Rapport de fidélité d’un export SVG, DXF ou IFC (même révision) | livré | E.6-03 | Décrit le fichier (jamais certifié) : exact, approché, non couvert, par type et par raison ; calques masqués et noms réécrits. |
| `provenance-sources-json` | JSON | studio-provenance/1 | export | rapport | Provenance des sources importées dans le dessin (import DXF, EX-014) | livré | E.6-04 | Déclarée avec l’import (même lot) : fichier, empreinte SHA-256 et version du format lues, horodatage, unité lue et retenue, repère source, transformation (aucune : identité), auteur et restrictions d’utilisation déclarés ou « non déclarés » ; enregistrée par le navigateur depuis le brouillon affiché. |
| `provenance-modele-externe-json` | JSON | studio-provenance-modele/1 | export | coordination | Provenance d’un modèle externe reçu (EX-014) | livré | E.6-04 | Ce que l’émetteur déclare (référence, auteur, discipline, version, unité, repère source, transformation, restrictions d’utilisation) et ce que le serveur a lu et calculé (schéma, unité lue, SHA-256, horodatage de réception) ; droit d’export. |
| `diagnostic-releve-perf` | JSON | studio-releve-perf/1 (relevé de performances Studio, JSON) | export | diagnostic | Mesures de chargement et d’exécution de la session (hors modèle) | livré | E.6-02 | Diagnostic seulement : aucune donnée du projet ; non relu par Studio. |
| `bcf-export` | BCF (BIM Collaboration Format, .bcfzip) | 2.1 (bcf.version VersionId 2.1), archive sans compression | export | coordination | Observations d’une variante (sujets BCF) | livré | E.6-04 | Contrat minimal du lot PUB : sujet (Guid stable dérivé de l’identité interne, type = catégorie, statut, titre, priorité = gravité, objets cités en étiquettes, auteur, responsable, description) et commentaires du journal ; aucun point de vue (caméra) ni pièce jointe ; observations lisibles par l’acteur seulement. |
| `bcf-import` | BCF (BIM Collaboration Format, .bcfzip) | 2.x lu selon le contrat 2.1 minimal ; entrées stockées (sans compression) | import | coordination | Sujets BCF reçus, créés comme observations distinctes de la variante | livré | E.6-04 | 8 Mo au plus ; 500 sujets ; reconnaissance par (Guid, contexte) seulement : un Guid déjà importé dans le même contexte n’est ni recréé ni réécrit, un même Guid venu d’un autre contexte crée une observation distincte, un sujet absent ne clôt rien, un objet cité inconnu reste une référence ; points de vue non repris (avertissement) ; entrées compressées refusées (message). |
| `dwg-import` | DWG | non évaluée | import | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `dwg-export` | DWG | non évaluée | export | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `dgn-import` | DGN | non évaluée | import | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `dgn-export` | DGN | non évaluée | export | dessin | Dessin 2D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `step-import` | STEP (ISO 10303-21, AP203 / AP214 / AP242) | non évaluée | import | maquette | Solides exacts (brep) | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `obj-import` | OBJ (Wavefront) | non évaluée | import | maquette | Maillage 3D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `stl-import` | STL | non évaluée (ASCII / binaire) | import | maquette | Maillage 3D | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `gltf-export` | glTF | non évaluée (2.0) | export | maquette | Maillage 3D et apparences d’affichage | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |
| `ifc-autres-versions-export` | IFC | IFC2X3, IFC4 | export | maquette | Document d’une révision | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `dxf-autres-versions-export` | DXF ASCII | AC1015 (2000) et suivantes | export | dessin | Document d’une révision | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `dxf-binaire-import` | DXF binaire | non évaluée | import | dessin | Plan 2D | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `svg-lecture-import` | SVG | non évaluée | import | dessin | Dessin 2D | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `pdf-lecture-import` | PDF | non évaluée | import | dessin | Fond de plan | non livré | E.6-05 | Non livré ; aucune conformité évaluée. |
| `nuage-points-import` | Nuage de points (LAS, E57, LAZ) | non évaluée | import | maquette | Relevé | non livré | E.6-04, E.6-05 | Non livré ; aucune conformité évaluée. |

## Entrées livrées : entités, contrôles et preuves

### `natif-commandes` — Enveloppe de commandes Studio (JSON) (import)

- Version : studio-commands/1
- Objet : Commandes de document appliquées à une variante (seule écriture du modèle)
- Limite : 500 commandes et 1 Mo par enveloppe ; chaque commande est revalidée par le serveur, qui fait seul autorité ; rejeu idempotent par requestId.
- Route : `POST /projects/:projectId/studio/studies/:studyId/variants/:variantId/commands`
- Contrôle : Recette studio-persistance.mjs (rejeu, conflits, droits).
- Entité Toutes les entités du document : portée — Formes, cotes, annotations, solides, architecture, propriétés, scènes : par leurs outils du registre.
- Code : `apps/api/src/lib/studio-commands.ts` (`` submitStudioCommands ``)
- Tests : `apps/web/e2e/studio-persistance.mjs` (`` const replay = await owner('POST', `${variantPath(s)}/commands`, envelope) ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/commands ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `natif-archive-export` — Archive de projet (section Studio, JSON) (export)

- Version : fadi-studio-archive/1 (document studio-document/1)
- Objet : Études, variantes, révisions immuables, commentaires, observations, publications et leurs fichiers figés, exigences, journal du métré
- Limite : Section signée (HMAC-SHA256 du manifeste, clé du serveur) ; empreintes de contenu conservées ; rien n’est recalculé.
- Route : `GET /projects/:projectId/archive`
- Contrôle : Tests du manifeste d’archive ; recette studio-restauration.mjs (base neuve, comparaison avant / après).
- Entité Tables Studio du projet : portée — Lignes exportées telles quelles, manifeste et empreinte globale.
- Code : `apps/api/src/lib/studio-archive.ts` (`` exportStudioArchive ``)
- Tests : `apps/api/src/lib/studio-archive-manifest.test.ts` (`` STUDIO_ARCHIVE_SCHEMA ``) ; `apps/web/e2e/studio-restauration.mjs` (`` check('sauvegarde : section Studio présente (schéma, version, manifeste)' ``)
- Routes : `apps/api/src/routes/projects.ts` (`` /:projectId/archive ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, R.1-02` — Liste d’exécution Studio V1.0

### `natif-archive-import` — Archive de projet (section Studio, JSON) (import)

- Version : fadi-studio-archive/1 (document studio-document/1)
- Objet : Restauration de la section Studio dans un nouveau projet
- Limite : Manifeste et empreintes contrôlés (refus 422) ; sans signature vérifiée par ce serveur, auteurs et approbations ne sont pas crus ; identifiant déjà présent : partie Studio non restaurée, réserve signalée.
- Route : `POST /projects/import`
- Contrôle : Recette studio-restauration.mjs.
- Entité Tables Studio du projet : portée — Réinsérées telles quelles ; révisions et journaux insérés, jamais réécrits.
- Code : `apps/api/src/lib/studio-archive.ts` (`` importStudioArchive ``)
- Tests : `apps/api/src/lib/studio-archive-manifest.test.ts` (`` checkStudioArchive ``) ; `apps/web/e2e/studio-restauration.mjs` (`` const imported = await ownerB('POST', '/projects/import', archiveText) ``)
- Routes : `apps/api/src/routes/projects.ts` (`` "/import" ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, R.1-02` — Liste d’exécution Studio V1.0

### `natif-file-locale` — File locale hors ligne (JSON) (export)

- Version : fadi-studio-file-locale/1
- Objet : Copie de secours d’une file locale de commandes non synchronisée
- Limite : Export de secours seulement : Studio ne relit pas ce fichier ; la ligne exportée est relue du stockage, jamais de la mémoire.
- Contrôle : Tests de la file locale.
- Entité Brouillon local (commandes non envoyées) : portée — Ligne conservée telle quelle, avec la raison du blocage et la date d’export.
- Code : `apps/web/src/modules/studio/hors-ligne/AvisFileLocale.tsx` (`` preparerExportFileLocale ``)
- Tests : `apps/web/src/modules/studio/hors-ligne/file-locale.test.ts` (`` preparerExportFileLocale ``)
- Interface : `apps/web/src/modules/studio/hors-ligne/AvisFileLocale.tsx` (`` a.download = "studio-file-locale.json" ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `natif-profil-outils-export` — Profil d’outils Studio (JSON) (export)

- Version : fadi-studio-profil/1
- Objet : Profil d’outils du compte (profileId, version, ordre, raccourcis personnels, visibilité)
- Limite : Préférences du compte seulement : aucune donnée du projet, aucun droit (EX-033, INV-009).
- Contrôle : Tests des profils importés et exportés.
- Entité Profil d’outils : portée — Profil des barres, favoris, liste personnelle, regroupements, ordre des capacités, raccourcis personnels, version.
- Code : `apps/api/src/routes/studio-preferences.ts` (`` lireProfilExporte ``)
- Tests : `apps/api/src/routes/studio-profils-import.test.ts` (`` format: "fadi-studio-profil/1", profileId: r1.body.profileId ``)
- Routes : `apps/api/src/routes/studio-preferences.ts` (`` /outils/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/CatalogueOutils.tsx` (`` lien.download = `profil-studio-${f.profileId}-v${f.version}.json` ``)
- Sources : `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `natif-profil-outils-import` — Profil d’outils Studio (JSON) (import)

- Version : fadi-studio-profil/1
- Objet : Profil d’outils importé dans le compte
- Limite : Aucun droit conféré : une capacité exigeant un droit absent est refusée ; raccourcis en conflit refusés ou écartés sur demande explicite.
- Contrôle : Tests des profils importés et exportés.
- Entité Profil d’outils : portée — Relu, contrôlé (outils du registre, droits, conflits de raccourcis), version +1, provenance gardée.
- Code : `apps/api/src/lib/studio-profils.ts` (`` conflitsRaccourcis ``)
- Tests : `apps/api/src/routes/studio-profils-import.test.ts` (`` permission_non_conferee ``)
- Routes : `apps/api/src/routes/studio-preferences.ts` (`` /outils/import ``)
- Sources : `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `dessin-svg` — SVG (export)

- Version : SVG (espace de noms W3C, aucune version déclarée dans le fichier)
- Objet : Document d’une révision de variante (plan 2D)
- Limite : Plan 2D seulement : solides et hauteurs absents ; calques masqués conservés sous display="none" ; graphismes (splines en courbes de Bézier exactes, traits de hachure, symboles) avec leur transparence (opacity) ; aucun script ni ressource externe.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=svg`
- Contrôle : Tests de l’export ; recette studio-persistance.mjs ; rapport de fidélité servi à côté du fichier.
- Couverture par entité : rapport de fidélité `svg` (tableau ci-dessous).
- Code : `packages/atelier-model/src/studio/export.ts` (`` exportStudioSvg ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/export.test.ts` (`` exportStudioSvg ``) ; `apps/web/e2e/studio-persistance.mjs` (`` const svg = await owner('GET', `${exportPath}?format=svg`) ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-svg": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `dessin-dxf` — DXF ASCII (export)

- Version : R12 (AC1009), CRLF, $INSUNITS = 6 (mètre)
- Objet : Document d’une révision de variante (plan 2D)
- Limite : R12 seulement ; $INSUNITS n’appartient pas à R12 (variable introduite avec AC1015) : l’unité n’est pas garantie chez un lecteur R12 strict ; ASCII strict (texte échappé, 250 caractères) ; cotes non associatives ; noms de calque réécrits (31 caractères ASCII) ; solides absents ; splines découpées en POLYLINE (16 segments par morceau de Bézier), transparence des graphismes non portée (déclarée en commentaire 999).
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=dxf`
- Contrôle : Tests de l’export ; recette studio-persistance.mjs ; rapport de fidélité servi à côté du fichier.
- Couverture par entité : rapport de fidélité `dxf` (tableau ci-dessous).
- Code : `packages/atelier-model/src/studio/export.ts` (`` exportStudioDxf ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/export.test.ts` (`` exportStudioDxf ``) ; `apps/web/e2e/studio-persistance.mjs` (`` const dxf = await owner('GET', `${exportPath}?format=dxf`) ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-dxf": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `maquette-ifc` — IFC (STEP physique, ISO 10303-21) (export)

- Version : IFC4X3_ADD2, ViewDefinition [ReferenceView]
- Objet : Objets extrudés, solides libres, murs et ouvertures, propriétés déclarées d’une révision
- Limite : Seuls les éléments 3D sont écrits ; arcs discrétisés ; cotes, annotations et réglages de visualisation absents ; IfcDoor / IfcWindow seulement si le type est déclaré, sans représentation propre.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=ifc`
- Contrôle : Tests de l’export ; corpus validé par IfcOpenShell 0.9.0 en CI (schéma, règles EXPRESS, effectifs, propriétés) ; testé, jamais certifié.
- Couverture par entité : rapport de fidélité `ifc` (tableau ci-dessous).
- Entités IFC écrites `IfcProject`, `IfcSite`, `IfcBuilding`, `IfcBuildingStorey`, `IfcRelAggregates`, `IfcRelContainedInSpatialStructure` : Projet (unités SI, mètre), site nommé d’après l’étude, bâtiment nommé d’après la variante, un niveau de référence à z = 0 ; ni adresse, ni géoréférencement.
- Entités IFC écrites `IfcUnitAssignment`, `IfcSIUnit`, `IfcGeometricRepresentationContext`, `IfcGeometricRepresentationSubContext` : Unités SI (longueur, aire, volume, angle) ; contextes Body et Axis du repère local-3d.
- Entités IFC écrites `IfcCartesianPoint`, `IfcDirection`, `IfcAxis2Placement3D`, `IfcAxis2Placement2D`, `IfcLocalPlacement`, `IfcProductDefinitionShape`, `IfcShapeRepresentation`, `IfcPolyline` : Placements, représentations et courbes des éléments écrits.
- Entités IFC écrites `IfcWall`, `IfcExtrudedAreaSolid`, `IfcRectangleProfileDef`, `IfcArbitraryClosedProfileDef` : Mur d’architecture (emprise extrudée et axe) ; ligne extrudée avec épaisseur (profil rectangle longueur × épaisseur) ; arc extrudé avec épaisseur (couronne discrétisée) ; type prédéfini .NOTDEFINED.
- Entités IFC écrites `IfcBuildingElementProxy`, `IfcCircleProfileDef` : Prisme .NOTDEFINED. (SweptSolid) : rectangle, cercle (profil exact) et polyligne fermée extrudés, solides libres ; jamais une dalle ni un poteau devinés.
- Entités IFC écrites `IfcBuildingElementProxy`, `IfcTriangulatedFaceSet`, `IfcCartesianPointList3D` : Surface verticale ouverte .NOTDEFINED. (Tessellation) : ligne, arc ou polyligne ouverte extrudés sans épaisseur ; aucun solide.
- Entités IFC écrites `IfcOpeningElement`, `IfcRelVoidsElement` : Ouverture : boîte .OPENING. reliée au mur hôte, placée relativement au mur.
- Entités IFC écrites `IfcDoor`, `IfcWindow`, `IfcRelFillsElement` : Porte ou fenêtre seulement si son type est déclaré : remplit l’ouverture, sans représentation propre.
- Entités IFC écrites `IfcPropertySet`, `IfcPropertySingleValue`, `IfcRelDefinesByProperties` : Jeux de propriétés listés ci-dessous, valeurs saisies seulement.
- Entités IFC écrites `IfcPresentationLayerWithStyle` : Un calque par calque non vide : nom, identifiant Studio, visibilité, verrou ; calque masqué exporté éteint.
- Jeu de propriétés `Fadi_StudioExtrusion` : Objet extrudé : identifiant Studio, base, hauteur, épaisseur si saisie.
- Jeu de propriétés `Fadi_StudioFreeSolid` : Solide libre : identifiant, forme, origine, rotation, dimensions saisies.
- Jeu de propriétés `Fadi_StudioWall` : Mur : identifiant, épaisseur, hauteur, base, justification, longueur d’axe.
- Jeu de propriétés `Fadi_StudioOpening` : Ouverture : identifiant, mur hôte, position, largeur, hauteur, allège, type déclaré.
- Jeu de propriétés `Fadi_StudioExport` : Projet : document, révision, repère et effectifs (éléments écrits, objets non extrudés, cotes et annotations non exportées).
- Jeu de propriétés `Fadi_ProprietesDeclarees` : Propriétés déclarées valuées de chaque objet porteur ; les propriétés sans valeur sont comptées, jamais écrites.
- Code : `packages/atelier-model/src/studio/ifc.ts` (`` exportStudioIfc ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/ifc.test.ts` (`` exportStudioIfc ``) ; `apps/api/test-corpus/ifc/generer-studio.ts` (`` exportStudioIfc ``) ; `.github/workflows/ci.yml` (`` generer-studio.ts ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-ifc": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `maquette-obj` — OBJ (Wavefront) (export)

- Version : OBJ texte ASCII, studio-export-obj/1 (le format ne déclare aucune version)
- Objet : Géométrie 3D d’une révision (maillage triangulé de la vue 3D)
- Limite : Maillage seulement : courbes discrétisées comme dans la vue 3D, coordonnées au micromètre ; mètres déclarés en commentaire (OBJ ne porte aucune unité) ; aucun matériau ; tous les calques écrits, un calque masqué signalé ; ce qui n’est pas une géométrie 3D est compté dans l’en-tête, jamais écrit.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=obj`
- Contrôle : Tests du modèle (OBJ relu : objets, groupes, volumes égaux au modèle, bilan) ; règle d’or de la commande « Exporter OBJ ».
- Entité Objets extrudés, solides libres, solides exacts, murs : partielle — Un objet « o » par élément, nommé par son identifiant Studio (échappé ~XXXX~, réversible), faces triangulaires orientées ; volume relu égal à celui du modèle ; courbes discrétisées.
- Entité Calques : portée — Un groupe « g » par calque ; un calque masqué est écrit et signalé.
- Entité Surfaces verticales sans épaisseur : portée — Triangles sans volume, comme dans la vue 3D.
- Entité Contours non extrudés : partielle — Lignes « l » à z = 0, courbes discrétisées.
- Entité Ouvertures : partielle — Vide dans le maillage du mur ; l’ouverture n’est pas un objet du fichier (comptée).
- Entité Cotes, annotations, graphismes, propriétés, scènes, éléments non natifs : absente — Comptés dans le bilan de l’en-tête, jamais écrits.
- Code : `packages/atelier-model/src/studio/export-3d.ts` (`` exportStudioObj ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/export-3d.test.ts` (`` E.6-04 OBJ : un objet par élément ``) ; `apps/web/e2e/studio-echanges.mjs` (`` check("Exporter OBJ : fichier servi ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-obj": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0

### `maquette-stl` — STL ASCII (export)

- Version : STL ASCII (solid … endsolid), sans version
- Objet : Solides d’une révision (facettes triangulées)
- Limite : Une seule pièce « solid » : STL ne porte ni unité (mètres), ni identité, ni calque ; facettes des solides seulement, normale unitaire calculée dans le sens des sommets ; courbes discrétisées ; surfaces sans épaisseur et contours plats non écrits (comptés par le bilan de l’export).
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=stl`
- Contrôle : Tests du modèle (STL relu : facettes, normales sortantes, volume total égal au modèle, bilan) ; règle d’or de la commande « Exporter STL ».
- Entité Objets extrudés, solides libres, solides exacts, murs : partielle — Facettes du maillage de la vue 3D ; volume relu égal à celui du modèle ; identité et calque perdus.
- Entité Surfaces verticales sans épaisseur, contours non extrudés : absente — Ce ne sont pas des solides : comptés, jamais écrits.
- Entité Cotes, annotations, graphismes, ouvertures, propriétés, scènes, éléments non natifs : absente — Comptés par le bilan de l’export, jamais écrits.
- Code : `packages/atelier-model/src/studio/export-3d.ts` (`` exportStudioStl ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/export-3d.test.ts` (`` E.6-04 STL : une pièce solid ``) ; `apps/web/e2e/studio-echanges.mjs` (`` check("Exporter STL : fichier servi ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-stl": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0

### `maquette-step` — STEP (ISO 10303-21) (export)

- Version : AP214 (FILE_SCHEMA AUTOMOTIVE_DESIGN, écrit par OCCT 8.0), assemblage XCAF nommé
- Objet : Solides d’une révision en représentation exacte (brep), un produit nommé par élément
- Limite : Écrit côté serveur par le noyau exact (OCCT en WebAssembly, chargé à la demande) ; millimètres déclarés (SI_UNIT .MILLI. .METRE.), géométrie mise à l’échelle × 1 000 depuis les mètres du modèle ; horodatage de la révision ; emprises des objets extrudés discrétisées comme dans la vue 3D ; aucune couleur ni propriété ; révision sans solide : refus 422, jamais un fichier vide.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export?format=step`
- Contrôle : Tests du noyau (STEP nommé relu : noms, solides, volumes, unité, reproductibilité) et du serveur (révision exportée relue par le noyau, égale au modèle) ; règle d’or de la commande « Exporter STEP ».
- Entité Solides exacts (booléens) : portée — Brep du noyau écrit tel quel.
- Entité Solides libres (boîtes, prismes) : portée — Extrusion de l’emprise (solide droit) ou lissage réglé entre ses deux faces (solide oblique ou basculé) : faces planes, exactes.
- Entité Murs : portée — Morceaux pleins juxtaposés (vides des ouvertures déduits), un produit par mur ; volume relu égal au volume net du modèle.
- Entité Objets extrudés fermés, lignes et arcs avec épaisseur : partielle — Extrusion de l’emprise de la vue 3D : cercles et arcs discrétisés.
- Entité Identité : portée — Nom du produit STEP = identifiant Studio (échappé ~XXXX~ hors ASCII imprimable, réversible).
- Entité Calques, surfaces sans épaisseur, contours, cotes, annotations, graphismes, ouvertures, propriétés, scènes, éléments non natifs : absente — Non écrits ; comptés par le bilan de l’export.
- Code : `packages/atelier-model/src/studio/export-3d.ts` (`` studioPiecesStep ``) ; `apps/api/src/lib/studio-exact.ts` (`` exportStudioStep ``) ; `apps/api/src/lib/studio-commands.ts` (`` exportStudioVariant ``)
- Tests : `packages/atelier-model/src/studio/export-3d.test.ts` (`` E.6-04 STEP : une pièce nommée par élément solide ``) ; `apps/api/src/lib/studio-export-3d.test.ts` (`` E.6-04 STEP serveur : relu par le noyau ``) ; `packages/geometry-exact/src/index.test.ts` (`` E.6-04 STEP : un produit nommé par pièce ``) ; `apps/web/e2e/studio-echanges.mjs` (`` check("Exporter STEP : fichier servi ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export ``)
- Interface : `apps/web/src/modules/studio/planche2d/BarreOutils.tsx` (`` download={actif ? "" : undefined} ``) ; `apps/web/src/modules/studio/VariantWorkspace.tsx` (`` "exporter-step": studioExportUrl( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/atelier/decisions.md, D-177` — Noyau exact OCCT, composant LGPL chargé à part

### `dessin-dxf-import` — DXF ASCII (import)

- Version : R12 et suivantes (codes de groupe), CRLF ou LF ; DXF binaire refusé
- Objet : Plan 2D ajouté au brouillon d’une variante, par commandes
- Limite : 5 Mo au plus ; unité lue dans $INSUNITS (16 codes reconnus ; tout autre code, 0 ou absent : unité inconnue, choisie par l’utilisateur, jamais devinée) ; un calque déjà verrouillé dans le document (calque implicite compris) qui recevrait des objets fait échouer l’import ; Z ignoré (compté) ; tout le reste compté par type dans le rapport d’import, jamais écarté en silence.
- Contrôle : Tests de l’import (modèle et interface) ; rapport d’import à l’aperçu.
- Entité LINE : portée — Ligne.
- Entité CIRCLE : portée — Cercle.
- Entité ARC : portée — Arc (angles ramenés en radians), cercle si ses angles se confondent.
- Entité LWPOLYLINE / POLYLINE 2D : partielle — Polyligne à renflements ; rectangle si fermée à 4 sommets parallèles aux axes ; sinon un segment droit par ligne.
- Entité Calques (table LAYER) : portée — Repris par nom ou créés, visibilité et verrouillage du fichier.
- Entité TEXT, INSERT, SPLINE, HATCH, DIMENSION, ELLIPSE… : absente — Non importés comme objets, comptés par type ; conservés comme éléments non natifs (type, handle, nom de bloc, raison) si l’option est cochée.
- Entité Polylignes 3D ou lissées, espace papier : absente — Non importées comme objets, comptées ; conservées comme éléments non natifs si l’option est cochée.
- Code : `packages/atelier-model/src/studio/import-dxf.ts` (`` lireDxfStudio ``)
- Tests : `packages/atelier-model/src/studio/import-dxf.test.ts` (`` lireDxfStudio ``) ; `apps/web/src/modules/studio/import/import-dxf.test.ts` (`` lireDxfStudio ``)
- Interface : `apps/web/src/modules/studio/import/DialogueImportDxf.tsx` (`` export function DialogueImportDxf( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `maquette-ifc-import` — IFC (STEP physique, ISO 10303-21) (import)

- Version : IFC2X3, IFC4, IFC4X1 à IFC4X3 (FILE_SCHEMA lu) ; ifcXML et ifcZIP refusés
- Objet : Maquette d’un autre logiciel ajoutée au brouillon d’une variante, par commandes
- Limite : 5 Mo au plus ; lecteur STEP propre, sans web-ifc ; unité de longueur lue dans l’IfcUnitAssignment du projet (IfcSIUnit et son préfixe, ou IfcConversionBasedUnit dont le facteur est déclaré), absente : rien n’est importé, jamais supposée ; seules les extrusions verticales (IfcExtrudedAreaSolid d’un IfcRectangleProfileDef ou d’un IfcArbitraryClosedProfileDef droit) placées par IfcLocalPlacement tourné autour de z sont traduites ; toute autre entité ou géométrie est conservée comme élément non natif, et chaque information non reprise est comptée dans le rapport de pertes.
- Contrôle : Tests du lecteur (fixture IFC2X3 écrite à la main, IFC4 en pieds, aller-retour avec l’export IFC4X3 de Studio) ; recette studio-echanges.mjs (import par l’interface, éléments non natifs visibles).
- Entité IfcWall, IfcWallStandardCase : partielle — Mur (axe, épaisseur, hauteur, cote de base lus ; justification déduite de l’axe Axis) si le corps est rectangulaire ; sinon prisme libre, perte comptée.
- Entité IfcOpeningElement, IfcRelVoidsElement : portée — Ouverture du mur importé : position, largeur, hauteur et allège lues de son corps.
- Entité IfcDoor, IfcWindow, IfcRelFillsElement : partielle — Type déclaré porte ou fenêtre de l’ouverture remplie ; géométrie propre du remplissage non reprise (perte comptée).
- Entité IfcSlab : partielle — Prisme libre à sa cote ; sémantique de dalle non reprise (perte comptée).
- Entité IfcBuildingStorey : partielle — Calque nommé d’après le niveau ; ses éléments y sont rangés ; l’élévation est portée par les placements.
- Entité IfcSpace, IfcColumn, IfcBeam, IfcBuildingElementProxy… : absente — Conservés comme éléments non natifs : type, GlobalId, nom, raison, empreinte lue ; non éditables, exclus des métrés.
- Entité IfcPropertySet, IfcRelAssociatesMaterial, IfcRelDefinesByType, IfcMapConversion, IfcSite, IfcBuilding… : absente — Comptés par type dans le rapport de pertes.
- Code : `packages/atelier-model/src/studio/import-ifc/import-ifc.ts` (`` lireIfcStudio ``)
- Tests : `packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts` (`` lireIfcStudio ``) ; `apps/web/src/modules/studio/import/import-ifc.test.ts` (`` lireIfcStudio ``) ; `apps/web/e2e/studio-echanges.mjs` (`` check("Importer IFC : rapport de pertes ``)
- Interface : `apps/web/src/modules/studio/import/DialogueImportIfc.tsx` (`` export function DialogueImportIfc( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, TEST-028` — Liste d’exécution Studio V1.0

### `modele-externe-ifc` — IFC (STEP physique, ISO 10303-21) (import)

- Version : IFC2X3, IFC4, IFC4X1 à IFC4X3 (lecteur de l’import IFC)
- Objet : Modèle d’un partenaire référencé, comparé à la révision courante, accepté ou refusé
- Limite : Référence, auteur, discipline, version, unité, transformation, repère source et restrictions d’utilisation déclarés par l’émetteur ; fichier relu par le serveur dans un document à part, jamais dans la variante ; comparaison par identifiant (GlobalId) avec la révision courante ; acceptation ou refus réservés au propriétaire et aux approbateurs, journalisés, un refus avec motif ; accepté, le modèle s’ajoute au brouillon seulement par une action explicite ; non repris par l’archive du projet.
- Route : `POST /projects/:projectId/studio/studies/:studyId/variants/:variantId/modeles-externes`
- Contrôle : Tests des règles (modèle et serveur) ; recette studio-echanges.mjs (réception, comparaison, acceptation journalisée).
- Entité Déclarations de l’émetteur : portée — Conservées telles quelles ; l’unité déclarée est comparée à l’unité lue, jamais substituée.
- Entité Fichier reçu : portée — Conservé tel quel avec son SHA-256 ; lecture et pertes comme l’import IFC.
- Entité Écarts avec la révision courante : portée — Objets, calques, cotes, murs et ouvertures, solides libres, éléments non natifs : ajoutés, supprimés, modifiés.
- Code : `packages/atelier-model/src/studio/echanges/modeles-externes.ts` (`` lireModeleExterne ``) ; `apps/api/src/lib/studio-modeles-externes.ts` (`` deciderReception ``)
- Tests : `packages/atelier-model/src/studio/echanges/modeles-externes.test.ts` (`` passageModeleExterne ``) ; `apps/api/src/lib/studio-modeles-externes.test.ts` (`` deciderReception ``) ; `apps/web/e2e/studio-echanges.mjs` (`` check("Modèle externe : accepté par le propriétaire ``)
- Routes : `apps/api/src/routes/studio-modeles-externes.ts` (`` /studies/:studyId/variants/:variantId/modeles-externes ``)
- Interface : `apps/web/src/modules/studio/echanges/PanneauModelesExternes.tsx` (`` export function PanneauModelesExternes( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, TR-EX-066` — Liste d’exécution Studio V1.0

### `feuille-svg` — SVG (export)

- Version : studio-sheet/1 (SVG en millimètres)
- Objet : Feuille de présentation d’une révision (format, échelle, cartouche)
- Limite : A4 à A1 ; échelle choisie ou ajustée ; dessin découpé au cadre ; valeur absente du cartouche imprimée « non évalué ».
- Contrôle : Tests de la feuille.
- Entité Dessin 2D par calque : partielle — Mêmes primitives que l’export SVG, découpées au cadre ; solides absents.
- Entité Cartouche, échelle graphique, nord : portée — Tracés sur la feuille.
- Code : `packages/atelier-model/src/studio/feuille.ts` (`` exportStudioSheetSvg ``) ; `packages/atelier-model/src/studio/feuille.ts` (`` studioSheetSvg ``)
- Tests : `packages/atelier-model/src/studio/feuille.test.ts` (`` exportStudioSheetSvg ``)
- Interface : `apps/web/src/modules/studio/feuille/PanneauFeuille.tsx` (`` data-studio-feuille-svg ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `feuille-pdf` — PDF (export)

- Version : PDF 1.4 (une page)
- Objet : Feuille de présentation d’une révision
- Limite : Mêmes primitives que la feuille SVG ; aucune conformité PDF/A déclarée.
- Contrôle : Tests de la feuille.
- Entité Feuille composée : portée — Primitives de la feuille SVG.
- Code : `packages/atelier-model/src/studio/feuille.ts` (`` studioSheetPdf ``)
- Tests : `packages/atelier-model/src/studio/feuille.test.ts` (`` studioSheetPdf ``)
- Interface : `apps/web/src/modules/studio/feuille/PanneauFeuille.tsx` (`` data-studio-feuille-pdf ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0

### `feuille-composee-svg` — SVG (export)

- Version : studio-feuille-composee/1 (feuille studio-sheet/1 avec ligne de provenance)
- Objet : Feuille composée enregistrée (vue source, révision épinglée)
- Limite : Lit une révision enregistrée, jamais le brouillon ; provenance recalculée par le serveur (révision, empreintes du document et de la vue).
- Route : `GET /projects/:projectId/studio/studies/:studyId/sheets/:sheetId/files/svg`
- Contrôle : Tests du dossier de conception ; recette studio-dossier.mjs.
- Entité Vue documentaire (calques retenus) : partielle — Calques exclus listés ; solides absents.
- Code : `packages/atelier-model/src/studio/dossier-conception.ts` (`` studioFeuilleComposeeSvg ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioSheetFile ``)
- Tests : `packages/atelier-model/src/studio/dossier-conception.test.ts` (`` studioFeuilleComposeeSvg ``) ; `apps/web/e2e/studio-dossier.mjs` (`` await fichier(f1.files.svg) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${sheet}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` href={f.files.svg} download ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-02` — Liste d’exécution Studio V1.0

### `feuille-composee-pdf` — PDF (export)

- Version : PDF 1.4 (une page)
- Objet : Feuille composée enregistrée
- Limite : Mêmes primitives que la feuille composée SVG ; aucune conformité PDF/A déclarée.
- Route : `GET /projects/:projectId/studio/studies/:studyId/sheets/:sheetId/files/pdf`
- Contrôle : Recette studio-dossier.mjs.
- Entité Feuille composée : portée — Primitives de la feuille SVG.
- Code : `packages/atelier-model/src/studio/feuille.ts` (`` studioSheetPdf ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioSheetFile ``)
- Tests : `apps/web/e2e/studio-dossier.mjs` (`` await fichier(f1.files.pdf) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${sheet}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` href={f.files.pdf} download ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-02` — Liste d’exécution Studio V1.0

### `dossier-pdf` — PDF (export)

- Version : PDF 1.4 (plusieurs pages)
- Objet : Dossier de conception : feuilles ordonnées, métré, rapport de fidélité
- Limite : Quantités brutes, déductions et nettes séparées ; valeur absente « non évalué » ; aucune conformité PDF/A déclarée.
- Route : `GET /projects/:projectId/studio/studies/:studyId/dossiers/:dossierId/files/pdf`
- Contrôle : Tests du dossier de conception ; recette studio-dossier.mjs.
- Entité Feuilles composées : portée — Dans l’ordre du dossier.
- Entité Métré (brut, déductions, net) : portée — Épinglé sur une révision.
- Entité Rapport de fidélité : portée — Totaux par format, raisons.
- Code : `packages/atelier-model/src/studio/dossier-conception.ts` (`` pdfDossierConception ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioDossierFile ``)
- Tests : `packages/atelier-model/src/studio/dossier-conception.test.ts` (`` pdfDossierConception ``) ; `apps/web/e2e/studio-dossier.mjs` (`` await fichier(dos.files.pdf) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${dossier}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` data-studio-dossier-pdf ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-03` — Liste d’exécution Studio V1.0

### `dossier-json` — JSON (export)

- Version : studio-dossier-conception/1
- Objet : Dossier de conception (données natives du dossier)
- Limite : Export seulement : aucun import de dossier ; empreinte du dossier portée en en-tête.
- Route : `GET /projects/:projectId/studio/studies/:studyId/dossiers/:dossierId/files/json`
- Contrôle : Tests du dossier de conception ; recette studio-dossier.mjs.
- Entité Dossier (feuilles, métré, fidélité, empreintes) : portée — Objet du dossier tel qu’assemblé.
- Code : `packages/atelier-model/src/studio/dossier-conception.ts` (`` assemblerDossierConception ``) ; `apps/api/src/lib/studio-dossiers.ts` (`` readStudioDossierFile ``)
- Tests : `packages/atelier-model/src/studio/dossier-conception.test.ts` (`` assemblerDossierConception ``) ; `apps/web/e2e/studio-dossier.mjs` (`` const json1 = await fichier(dos.files.json) ``)
- Routes : `apps/api/src/routes/studio-dossiers.ts` (`` ${dossier}/files/:format ``)
- Interface : `apps/web/src/modules/studio/dossier/PanneauDossier.tsx` (`` data-studio-dossier-json ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-03` — Liste d’exécution Studio V1.0

### `tableau-metre-csv` — CSV (export)

- Version : UTF-8 avec BOM, séparateur « ; », décimale « , » ou « . »
- Objet : Tableau du métré d’une révision (brut, déductions, net, ajustements)
- Limite : Export seulement ; statut de chaque ajustement écrit en clair ; refusé tant que le métré n’est pas à jour.
- Contrôle : Tests du CSV ; recette studio-quantites.mjs.
- Entité Lignes du métré : portée — Quantité dérivée, ajustement, auteur, statut.
- Code : `apps/web/src/modules/studio/quantites/csv-quantites.ts` (`` csvQuantites ``)
- Tests : `apps/web/src/modules/studio/quantites/csv-quantites.test.ts` (`` csvQuantites ``) ; `apps/web/e2e/studio-quantites.mjs` (`` // 6. CSV : colonnes d'ajustement. ``)
- Interface : `apps/web/src/modules/studio/quantites/PanneauQuantites.tsx` (`` data-studio-quantites-csv ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.3-04` — Liste d’exécution Studio V1.0

### `rendu-png` — PNG (export)

- Version : PNG (bloc iTXt « fadi:rendu » de provenance)
- Objet : Rendu du modèle depuis la vue 3D d’une révision enregistrée
- Limite : Image du canevas, pixels non modifiés ; refusé sur un brouillon non enregistré ou un maillage en cours ; provenance : étude, variante, révision, scène, caméra, date.
- Contrôle : Tests du bloc de provenance ; recette studio-visualisation.mjs.
- Entité Vue 3D affichée : partielle — Image seulement : aucune donnée du modèle n’est relisible.
- Code : `apps/web/src/modules/studio/vue3d/scenes/png.ts` (`` insererTextePng ``)
- Tests : `apps/web/src/modules/studio/vue3d/scenes/scenes.test.ts` (`` insererTextePng ``) ; `apps/web/e2e/studio-visualisation.mjs` (`` check("PNG : vrai fichier PNG tiré du canevas" ``)
- Interface : `apps/web/src/modules/studio/vue3d/Vue3DStudio.tsx` (`` lien.download = studioNomFichierRendu(p) ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.5-03` — Liste d’exécution Studio V1.0

### `illustration-png` — PNG (export)

- Version : PNG (bloc iTXt « fadi:illustration » de provenance, studio-illustration/1)
- Objet : Illustration archivée, tirée du rendu du modèle d’une vue (lot F)
- Limite : Image séparée « non vérifiée » : ni métrique, ni conforme, aucune donnée du modèle relisible ; provenance : rendu source, empreintes du document avant et après, paramètres, fournisseur, coûts, reproductibilité.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/illustrations/:illustrationId/image`
- Contrôle : Tests des routes d’illustration (base simulée) ; recette studio-lot-f.mjs.
- Entité Vue 3D affichée : partielle — Illustration seulement : le modèle n’est ni exporté ni modifié.
- Code : `apps/api/src/lib/studio-illustrations.ts` (`` lireImageIllustration ``)
- Tests : `apps/api/src/routes/studio-illustrations.test.ts` (`` x-studio-verification ``)
- Routes : `apps/api/src/routes/studio-illustrations.ts` (`` ${base}/:illustrationId/image ``)
- Interface : `apps/web/src/modules/studio/illustration/DialogueIllustration.tsx` (`` data-studio-illustration-archivee ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.5-03` — Liste d’exécution Studio V1.0

### `paquet-publication` — Paquet de publication (SVG, DXF, IFC, feuille PDF ; dossier de conception : PDF et JSON) (export)

- Version : studio-publication-manifest/1
- Objet : Fichiers figés d’une publication approuvée et diffusée
- Limite : Fichiers du manifeste approuvé, identifiés par SHA-256 et vérifiables ; dessin 2D indépendant : sans IFC ; dossier de conception (lot PUB) : PDF et JSON du dossier, feuilles et vues de coupe jointes ; mêmes limites que chaque export.
- Route : `GET /projects/:projectId/studio/studies/:studyId/publications/:publicationId/files/:format`
- Contrôle : Recettes studio-publication.mjs et studio-dossier.mjs (empreintes recalculées).
- Entité Fichiers du paquet : portée — SVG, DXF, IFC et feuille PDF calculés par les exporteurs du modèle.
- Entité Dossier de conception : portée — PDF (sommaire, feuilles, métré, fidélité, vues de coupe) et JSON du dossier ; pièces, origine et présentation déclarées dans le manifeste.
- Code : `apps/api/src/lib/studio-publications.ts` (`` studioPackageFiles ``) ; `apps/api/src/lib/studio-publications.ts` (`` readStudioPackageFile ``)
- Tests : `apps/web/e2e/studio-publication.mjs` (`` const file = await reader('GET', `${pubs}/${id3}/files/${f.format}` ``)
- Routes : `apps/api/src/routes/studio-publications.ts` (`` ${base}/files/:format ``)
- Interface : `apps/web/src/modules/studio/publication/PanneauPublications.tsx` (`` data-studio-publication-fichier ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-02` — Liste d’exécution Studio V1.0 ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.4-03` — Liste d’exécution Studio V1.0

### `rapport-fidelite-json` — JSON (export)

- Version : studio-rapport-fidelite/1
- Objet : Rapport de fidélité d’un export SVG, DXF ou IFC (même révision)
- Limite : Décrit le fichier (jamais certifié) : exact, approché, non couvert, par type et par raison ; calques masqués et noms réécrits.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/export/rapport?format=svg|dxf|ifc`
- Contrôle : Tests du rapport de fidélité.
- Entité Éléments du document : portée — Chacun compté une fois ; liste inconnue comptée « non couverte ».
- Code : `packages/atelier-model/src/studio/echanges/rapport-fidelite.ts` (`` studioRapportFidelite ``)
- Tests : `packages/atelier-model/src/studio/echanges/rapport-fidelite.test.ts` (`` studioRapportFidelite ``) ; `apps/web/src/modules/studio/variante/rapport-export.test.ts` (`` studioRapportFidelite ``)
- Routes : `apps/api/src/routes/studio.ts` (`` /studies/:studyId/variants/:variantId/export/rapport ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-03` — Liste d’exécution Studio V1.0

### `provenance-sources-json` — JSON (export)

- Version : studio-provenance/1
- Objet : Provenance des sources importées dans le dessin (import DXF, EX-014)
- Limite : Déclarée avec l’import (même lot) : fichier, empreinte SHA-256 et version du format lues, horodatage, unité lue et retenue, repère source, transformation (aucune : identité), auteur et restrictions d’utilisation déclarés ou « non déclarés » ; enregistrée par le navigateur depuis le brouillon affiché.
- Contrôle : Tests des sources ; recette studio-rend.mjs (import DXF avec sa provenance, enregistrée et relue).
- Entité Sources du document : portée — Chacune telle que déclarée ; un champ inconnu vaut null, jamais une valeur supposée.
- Code : `packages/atelier-model/src/studio/sources/sources.ts` (`` studioExportProvenance ``)
- Tests : `packages/atelier-model/src/studio/sources/sources.test.ts` (`` studioExportProvenance ``) ; `apps/web/e2e/studio-rend.mjs` (`` check("TR-EX-014 : import DXF ``)
- Interface : `apps/web/src/modules/studio/import/DialogueImportDxf.tsx` (`` export function exporterProvenance( ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0

### `provenance-modele-externe-json` — JSON (export)

- Version : studio-provenance-modele/1
- Objet : Provenance d’un modèle externe reçu (EX-014)
- Limite : Ce que l’émetteur déclare (référence, auteur, discipline, version, unité, repère source, transformation, restrictions d’utilisation) et ce que le serveur a lu et calculé (schéma, unité lue, SHA-256, horodatage de réception) ; droit d’export.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/modeles-externes/:modelId/provenance`
- Contrôle : Tests des sources et des modèles externes ; recette studio-rend.mjs (provenance exportée).
- Entité Modèle reçu : portée — Déclarations telles quelles, non déclarées à null ; l’unité lue est comparée, jamais substituée.
- Code : `packages/atelier-model/src/studio/echanges/modeles-externes.ts` (`` studioProvenanceModeleExterne ``)
- Tests : `packages/atelier-model/src/studio/sources/sources.test.ts` (`` studioProvenanceModeleExterne ``) ; `apps/web/e2e/studio-rend.mjs` (`` check("TR-EX-014 : modèle externe IFC ``)
- Routes : `apps/api/src/routes/studio-modeles-externes.ts` (`` /:modelId/provenance ``)
- Interface : `apps/web/src/modules/studio/echanges/PanneauModelesExternes.tsx` (`` data-studio-modele-provenance ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0

### `diagnostic-releve-perf` — JSON (export)

- Version : studio-releve-perf/1 (relevé de performances Studio, JSON)
- Objet : Mesures de chargement et d’exécution de la session (hors modèle)
- Limite : Diagnostic seulement : aucune donnée du projet ; non relu par Studio.
- Contrôle : Tests du relevé et de son schéma versionné (controlerRelevePerf).
- Entité Mesures de la session : portée — Schéma versionné, définitions, contexte, synthèse, journal.
- Code : `apps/web/src/modules/studio/chargement/perf.ts` (`` ReleveurPerf ``) ; `apps/web/src/modules/studio/chargement/perf.ts` (`` controlerRelevePerf ``)
- Tests : `apps/web/src/modules/studio/chargement/perf.test.ts` (`` ReleveurPerf ``) ; `apps/web/src/modules/studio/chargement/perf.test.ts` (`` controlerRelevePerf ``)
- Interface : `apps/web/src/modules/studio/chargement/PanneauRessources.tsx` (`` a.download = "studio-releve-perf.json" ``)
- Sources : `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, X.1-09` — Liste d’exécution Studio V1.0

### `bcf-export` — BCF (BIM Collaboration Format, .bcfzip) (export)

- Version : 2.1 (bcf.version VersionId 2.1), archive sans compression
- Objet : Observations d’une variante (sujets BCF)
- Limite : Contrat minimal du lot PUB : sujet (Guid stable dérivé de l’identité interne, type = catégorie, statut, titre, priorité = gravité, objets cités en étiquettes, auteur, responsable, description) et commentaires du journal ; aucun point de vue (caméra) ni pièce jointe ; observations lisibles par l’acteur seulement.
- Route : `GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/observations/bcf`
- Contrôle : Tests du modèle (export relu, Guid stable) ; recette studio-pub.mjs (export servi par l’API).
- Entité Topic : portée — Guid, TopicType, TopicStatus, Title, Priority, Labels, CreationDate, CreationAuthor, AssignedTo, Description.
- Entité Comment : partielle — Un commentaire par passage du journal (action et note).
- Entité Viewpoints, Components, pièces justificatives : absente — Les observations Studio ne portent pas de point de vue ; les pièces restent dans Studio.
- Code : `packages/atelier-model/src/studio/echanges/bcf-observations.ts` (`` studioExporterBcf ``) ; `apps/api/src/lib/studio-observations-bcf.ts` (`` exporterObservationsBcf ``)
- Tests : `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts` (`` IF-010 [+] export BCF 2.1 relu à l'identique ``)
- Routes : `apps/api/src/routes/studio-observations.ts` (`` ${base}/bcf ``)
- Interface : `apps/web/src/modules/studio/observations/PanneauObservations.tsx` (`` data-studio-bcf-exporter ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json` — Contrat IF-010 : identifiants BCF conservés comme références

### `bcf-import` — BCF (BIM Collaboration Format, .bcfzip) (import)

- Version : 2.x lu selon le contrat 2.1 minimal ; entrées stockées (sans compression)
- Objet : Sujets BCF reçus, créés comme observations distinctes de la variante
- Limite : 8 Mo au plus ; 500 sujets ; reconnaissance par (Guid, contexte) seulement : un Guid déjà importé dans le même contexte n’est ni recréé ni réécrit, un même Guid venu d’un autre contexte crée une observation distincte, un sujet absent ne clôt rien, un objet cité inconnu reste une référence ; points de vue non repris (avertissement) ; entrées compressées refusées (message).
- Route : `POST /projects/:projectId/studio/studies/:studyId/variants/:variantId/observations/bcf`
- Contrôle : Tests du modèle (plan d’import : homonymes, reconnus, absents) ; recette studio-pub.mjs (import servi par l’API, même Guid dans un autre contexte).
- Entité Topic : partielle — Titre et description en note d’origine ; catégorie et gravité reprises seulement dans le vocabulaire décidé ; Guid et contexte conservés comme références BCF.
- Entité Viewpoints, Components : absente — Non repris, signalés en avertissement.
- Code : `packages/atelier-model/src/studio/echanges/bcf-observations.ts` (`` studioPlanImportBcf ``) ; `apps/api/src/lib/studio-observations-bcf.ts` (`` importerObservationsBcf ``)
- Tests : `packages/atelier-model/src/studio/echanges/bcf-observations.test.ts` (`` IF-010 [−] même BCF-ID reçu dans un autre contexte ``)
- Routes : `apps/api/src/routes/studio-observations.ts` (`` ${base}/bcf ``)
- Interface : `apps/web/src/modules/studio/observations/PanneauObservations.tsx` (`` data-studio-bcf-importer ``)
- Sources : `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json` — Cas négatif « Même BCF-ID »

## Sous-ensemble SVG / DXF / IFC retenu (E.6-03) : couverture par type

Raisons possibles du rapport de fidélité (`studioRapportFidelite`) pour chaque type d’élément du document ; statut entre parenthèses.

| Catégorie | Type | SVG | DXF R12 | IFC4X3_ADD2 |
| --- | --- | --- | --- | --- |
| objets | line | `trace-exact` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `extrusion-non-portee` (approche) | `extrusion-exacte` (exact), `surface-exacte` (exact), `non-extrude` (non-couvert) |
| objets | rectangle | `trace-exact` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `extrusion-non-portee` (approche) | `extrusion-exacte` (exact), `non-extrude` (non-couvert) |
| objets | circle | `trace-exact` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `extrusion-non-portee` (approche) | `profil-exact` (exact), `non-extrude` (non-couvert) |
| objets | arc | `arcs-exacts` (exact), `extrusion-non-portee` (approche) | `arcs-exacts` (exact), `extrusion-non-portee` (approche) | `arcs-discretises` (approche), `non-extrude` (non-couvert) |
| objets | polyline | `trace-exact` (exact), `arcs-exacts` (exact), `extrusion-non-portee` (approche) | `trace-exact` (exact), `renflements-exacts` (exact), `extrusion-non-portee` (approche) | `extrusion-exacte` (exact), `surface-exacte` (exact), `arcs-discretises` (approche), `non-extrude` (non-couvert) |
| cotes | dimension | `cote-tracee` (exact) | `cote-eclatee` (approche) | `cote-hors-ifc` (non-couvert) |
| annotations | angular-dimension | `cote-tracee` (exact) | `cote-eclatee` (approche) | `annotation-hors-ifc` (non-couvert) |
| annotations | text | `texte-police-generique` (approche) | `texte-exact` (exact), `texte-ascii-echappe` (approche), `texte-remplace` (approche), `texte-tronque` (approche) | `annotation-hors-ifc` (non-couvert) |
| solides | box | `solide-hors-2d` (non-couvert) | `solide-hors-2d` (non-couvert) | `profil-exact` (exact) |
| solides | prism | `solide-hors-2d` (non-couvert) | `solide-hors-2d` (non-couvert) | `profil-exact` (exact) |
| exacts | exact | `solide-hors-2d` (non-couvert) | `solide-hors-2d` (non-couvert) | `solide-exact-hors-ifc` (non-couvert) |
| architecture | wall | `extrusion-non-portee` (approche) | `extrusion-non-portee` (approche) | `extrusion-exacte` (exact) |
| architecture | opening | `ouverture-en-lacune` (approche) | `ouverture-en-lacune` (approche) | `ouverture-evidee` (exact) |
| proprietes | propriete | `propriete-non-exportee` (non-couvert) | `propriete-non-exportee` (non-couvert) | `propriete-en-pset` (exact), `propriete-non-evaluee` (non-couvert) |
| scenes | scene | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) |
| scenes | appearance | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) | `visualisation-hors-export` (non-couvert) |
| nonNatifs | non-native | `non-natif-hors-export` (non-couvert) | `non-natif-hors-export` (non-couvert) | `non-natif-hors-export` (non-couvert) |
| graphismes | spline | `trace-exact` (exact) | `spline-decoupee` (approche) | `graphisme-hors-ifc` (non-couvert) |
| graphismes | hachure | `trace-exact` (exact) | `trace-exact` (exact), `transparence-non-portee` (approche) | `graphisme-hors-ifc` (non-couvert) |
| graphismes | symbole | `trace-exact` (exact) | `trace-exact` (exact), `transparence-non-portee` (approche) | `graphisme-hors-ifc` (non-couvert) |
| sources | source | `provenance-hors-dessin` (non-couvert) | `provenance-hors-dessin` (non-couvert) | `provenance-hors-dessin` (non-couvert) |

## Capacités par sens d’échange (EX-079)

Lecture, consultation, édition, export et aller-retour évalués séparément pour chaque format. Un aller-retour n’est livré qu’avec la lecture et l’export livrés et un test qui relit l’export par le lecteur de Studio : un export seul, même valide, ne le prouve jamais.

| Format | Lecture | Consultation | Édition | Export | Aller-retour |
| --- | --- | --- | --- | --- | --- |
| Enveloppe de commandes Studio (studio-commands/1) | livré — Enveloppe relue et revalidée commande par commande par le serveur. | non livré — Une enveloppe reçue est appliquée ou refusée en bloc : aucun aperçu de son contenu sans l’appliquer. | livré — Les commandes sont la seule écriture du document : ce qu’elles créent est natif et modifiable. (`apps/web/e2e/studio-persistance.mjs`) | non livré — Studio n’écrit pas d’enveloppe dans un fichier ; l’historique d’une révision se lit par l’API (revisions/:revisionId/changes). | non livré — Sans export de fichier, aucun aller-retour. |
| Archive de projet, section Studio (fadi-studio-archive/1) | livré — Manifeste et empreintes contrôlés, section restaurée dans un nouveau projet. | non livré — Une archive est contrôlée puis restaurée : aucune consultation de son contenu sans restauration. | livré — Le projet restauré reçoit de nouvelles révisions sur la tête restaurée. (`apps/web/e2e/studio-restauration.mjs`) | livré — Section signée, empreintes de contenu conservées. | livré — Archive exportée de A puis restaurée dans une base neuve B : documents de révision identiques octet pour octet, outil de comparaison sans anomalie. (`apps/web/e2e/studio-restauration.mjs`) |
| File locale hors ligne (fadi-studio-file-locale/1) | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | livré — Copie de secours d’une file locale non synchronisée. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| Profil d’outils Studio (fadi-studio-profil/1) | livré — Profil relu et contrôlé : outils du registre, droits, conflits de raccourcis. | non livré — Le profil reçu est contrôlé puis importé : aucun aperçu de son contenu avant l’import. | livré — Le profil importé devient celui du compte, qui le modifie ensuite comme le sien (version + 1, provenance gardée). (`apps/api/src/routes/studio-profils-import.test.ts`) | livré — Profil du compte, sans donnée de projet ni droit. | livré — Profil exporté par un compte puis importé par un autre : ordre, raccourcis, favoris, liste personnelle et regroupements relus à l’identique. (`apps/api/src/routes/studio-profils-import.test.ts`) |
| SVG | non livré — Aucun lecteur dans Studio. | non livré — Aucun lecteur dans Studio. | non livré — Aucun lecteur dans Studio. | livré — Plan 2D, feuille et feuille composée d’une révision. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| DXF ASCII | livré — R12 et suivantes, unité lue dans $INSUNITS ou choisie ; DXF binaire refusé. | livré — Aperçu de l’import avant tout ajout : unité, objets pris, entités non prises comptées par type. (`apps/web/src/modules/studio/import/import-dxf.test.ts`) | livré — Les objets lus sont ajoutés au brouillon par des commandes : natifs, modifiables comme les autres ; le reste n’est pas importé ou devient non natif. (`apps/web/src/modules/studio/import/import-dxf.test.ts`) | livré — R12 (AC1009) seulement. | livré — Partiel : lignes, rectangles et calques (masqué, verrouillé) exportés puis relus à l’identique ; les cotes reviennent en lignes, leurs textes ne sont pas repris. (`packages/atelier-model/src/studio/import-dxf.test.ts`) |
| IFC (STEP physique) | livré — IFC2X3, IFC4, IFC4X1 à IFC4X3 ; unité lue, jamais supposée ; pertes comptées. | livré — Modèle d’un partenaire reçu, relu par le serveur dans un document à part et comparé à la révision courante, sans modifier la variante. (`apps/web/e2e/studio-echanges.mjs`) | livré — Partielle : murs, ouvertures et extrusions verticales deviennent des objets natifs modifiables ; le reste est conservé non natif, non modifiable. (`apps/web/e2e/studio-echanges.mjs`) | livré — IFC4X3_ADD2 des éléments 3D. | livré — Partiel : murs (justification comprise), ouvertures et leurs types déclarés exportés puis relus à l’identique ; le reste revient non natif. (`packages/atelier-model/src/studio/import-ifc/import-ifc.test.ts`) |
| OBJ (Wavefront) | non livré — Aucun lecteur OBJ : studio-document/1 n’a pas de maillage libre. | non livré — Aucun lecteur dans Studio. | non livré — Aucun lecteur dans Studio. | livré — Maillage nommé de la vue 3D d’une révision. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| STL | non livré — Aucun lecteur STL : ni identité ni unité dans le fichier, aucun maillage libre dans le document. | non livré — Aucun lecteur dans Studio. | non livré — Aucun lecteur dans Studio. | livré — Facettes des solides d’une révision (ASCII). | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| STEP (ISO 10303-21) | non livré — Aucun lecteur STEP dans Studio : un solide exact du document est un booléen avec ses opérandes ; un solide lu n’en a pas. | non livré — Aucun lecteur dans Studio. | non livré — Aucun lecteur dans Studio. | livré — Solides exacts nommés d’une révision (AP214, noyau exact du serveur). | non livré — La relecture du STEP exporté par le noyau exact contrôle l’export (noms, volumes, unité) ; Studio n’ayant pas de lecteur STEP, ce n’est pas un aller-retour. |
| PDF | non livré — Aucun lecteur dans Studio. | non livré — Aucun lecteur dans Studio. | non livré — Aucun lecteur dans Studio. | livré — Feuille, feuille composée et dossier de conception. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| JSON en lecture seule (dossier, rapport de fidélité, provenance, relevé de performances) | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | livré — Données décrites par leur schéma versionné. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| CSV | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | livré — Tableau du métré d’une révision. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| PNG | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | livré — Rendu et illustration, avec leur bloc de provenance. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| Paquet de publication | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | non livré — Studio ne relit pas ce format : export seulement. | livré — Fichiers figés d’une publication diffusée, identifiés par SHA-256. | non livré — Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour. |
| BCF (.bcfzip) | livré — Contrat 2.1 minimal ; reconnaissance par (Guid, contexte). | livré — Les sujets reçus se lisent comme des observations distinctes de la variante, la note d’origine gardée, avec leurs références BCF. (`apps/web/e2e/studio-pub.mjs`) | livré — Un sujet nouveau devient une observation de Studio, suivie par le flux des observations ; un objet cité inconnu reste une référence. (`packages/atelier-model/src/studio/echanges/bcf-observations.test.ts`) | livré — Sujets et commentaires des observations. | livré — Export relu à l’identique (Guid stable, catégorie, gravité, statut, objets, commentaires) ; réimporté par l’API dans le même contexte, il est reconnu sans rien recréer. (`packages/atelier-model/src/studio/echanges/bcf-observations.test.ts`, `apps/web/e2e/studio-pub.mjs`) |
| DWG | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md), que Studio ne contourne pas. | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md), que Studio ne contourne pas. | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md), que Studio ne contourne pas. | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md), que Studio ne contourne pas. | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md), que Studio ne contourne pas. |
| DGN | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md). | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md). | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md). | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md). | non livré — Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md). |
| glTF | non livré — Aucun écrivain ni lecteur glTF. | non livré — Aucun écrivain ni lecteur glTF. | non livré — Aucun écrivain ni lecteur glTF. | non livré — Aucun écrivain ni lecteur glTF. | non livré — Aucun écrivain ni lecteur glTF. |
| Nuage de points (LAS, E57, LAZ) | non livré — Aucun lecteur de nuage de points dans Studio. | non livré — Aucun lecteur de nuage de points dans Studio. | non livré — Aucun lecteur de nuage de points dans Studio. | non livré — Aucun lecteur de nuage de points dans Studio. | non livré — Aucun lecteur de nuage de points dans Studio. |

## Formats reportés (E.6-04, E.6-05)

| Identifiant | Format | Sens | Statut | Raison | Sources |
| --- | --- | --- | --- | --- | --- |
| `dwg-import` | DWG | import | non livré | Non livré, déclaré : la décision approuvée D-179 (maître d’ouvrage, 8 octobre 2026) renonce au DWG — libredwg (GPL) lit mal les versions récentes et imposerait un service séparé, l’ODA SDK (commercial) ne se justifie que devant un besoin client réel ; Studio ne la contourne pas : DXF et IFC restent ses formats d’échange, et la décision se reprend si un client l’exige, avec son coût. | `docs/atelier/decisions.md, D-179` — Décision approuvée : DWG et DGN renoncés, déclarés ; DXF et IFC restent les formats d’échange ; `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `dwg-export` | DWG | export | non livré | Non livré, déclaré : la décision approuvée D-179 (maître d’ouvrage, 8 octobre 2026) renonce au DWG — libredwg (GPL) lit mal les versions récentes et imposerait un service séparé, l’ODA SDK (commercial) ne se justifie que devant un besoin client réel ; Studio ne la contourne pas : DXF et IFC restent ses formats d’échange, et la décision se reprend si un client l’exige, avec son coût. | `docs/atelier/decisions.md, D-179` — Décision approuvée : DWG et DGN renoncés, déclarés ; DXF et IFC restent les formats d’échange ; `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `dgn-import` | DGN | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. D-179 renonce au DGN (aucun besoin exprimé, format propriétaire, aucune bibliothèque libre admissible). | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/atelier/decisions.md, D-179` — Décision approuvée : DWG et DGN renoncés, déclarés ; DXF et IFC restent les formats d’échange |
| `dgn-export` | DGN | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. D-179 renonce au DGN (aucun besoin exprimé, format propriétaire, aucune bibliothèque libre admissible). | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `docs/atelier/decisions.md, D-179` — Décision approuvée : DWG et DGN renoncés, déclarés ; DXF et IFC restent les formats d’échange |
| `step-import` | STEP (ISO 10303-21, AP203 / AP214 / AP242) | import | non livré | Lecture non livrée : un solide exact de studio-document/1 est le résultat d’un booléen dont les deux opérandes sont conservés ; un solide lu d’un fichier STEP n’a pas d’opérandes et n’a pas de place dans le document. L’export STEP est livré (maquette-step). | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `obj-import` | OBJ (Wavefront) | import | non livré | Lecture non livrée : studio-document/1 n’a pas de maillage libre ; un maillage lu n’aurait pas d’équivalent natif. L’export OBJ est livré (maquette-obj). | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `stl-import` | STL | import | non livré | Lecture non livrée : un fichier STL ne porte ni identité ni unité, et studio-document/1 n’a pas de maillage libre pour le recevoir. L’export STL ASCII est livré (maquette-stl). | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `gltf-export` | glTF | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun écrivain glTF. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 |
| `ifc-autres-versions-export` | IFC | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Seul IFC4X3_ADD2 est écrit. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `dxf-autres-versions-export` | DXF ASCII | export | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Seul R12 (AC1009) est écrit ; les fichiers récents sont lus à l’import. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `dxf-binaire-import` | DXF binaire | import | non livré | Refusé à l’import avec un message (« enregistrez le fichier en DXF ASCII ») ; aucun lecteur binaire. | `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 ; `packages/atelier-model/src/studio/import-dxf.ts` — Refus du DXF binaire |
| `svg-lecture-import` | SVG | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun lecteur SVG. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `pdf-lecture-import` | PDF | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. Aucun lecteur PDF. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-05` — Liste d’exécution Studio V1.0 |
| `nuage-points-import` | Nuage de points (LAS, E57, LAZ) | import | non livré | Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée. La lecture LAS / XYZ / PTS de l’Atelier (P2-7) n’est pas un échange Studio. | `Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7` — Plan d’implémentation Studio V1.0 (E.6, interopérabilité) ; `Studio/Fadi_Studio_Checklist_Execution_V1_0.md, E.6-04` — Liste d’exécution Studio V1.0 ; `scripts/frontieres.json, ADR-STUDIO-NAV-01` — Studio n’importe pas l’Atelier |
