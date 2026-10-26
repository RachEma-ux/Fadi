import { STUDIO_CAPACITES_EXPORT, STUDIO_RAISONS_FIDELITE, type StudioFormatEchange, type StudioRaisonFidelite, type StudioStatutFidelite } from "./rapport-fidelite.js";

/**
 * Matrice d'échanges de Studio (E.6-01 à E.6-05) : donnée versionnée du modèle, une entrée par format × sens × objet
 * échangé, avec la version du format écrite ou lue, les entités couvertes et leur limite, le statut (livré, non livré,
 * renoncé) et, pour une entrée livrée, ses preuves (code, test, route, interface).
 *
 * Règles (Plan §5.7, E.6) :
 * - aucune entrée n'est déclarée **conforme** : la conformité d'un format reste « non évaluée » ; une entrée livrée
 *   dit seulement ce que le code écrit ou lit, et le contrôle qui le vérifie (test, validation IfcOpenShell en CI).
 *   Le contrôle `studioDeclareConformite` relit **tous** les champs texte, proposition par proposition ;
 * - SVG, DXF et IFC exportés : la couverture par entité est **celle du rapport de fidélité** (`rapport-fidelite.ts`,
 *   E.6-03) — la matrice déclare, par type d'élément, les raisons que le juge peut rendre ; un test les recoupe avec
 *   `STUDIO_CAPACITES_EXPORT` (mêmes types, raisons observées toutes déclarées, raisons déclarées toutes observées) ;
 *   l'IFC déclare en plus la liste des entités IFC et des jeux de propriétés réellement écrits (`ecritureIfc`), qu'un
 *   test recoupe avec la sortie réelle de `exportStudioIfc` ;
 * - OBJ, STL et STEP exportés (E.6-04) : chacun son contrat (`export-3d.ts`, noyau exact pour STEP), ses entités et ses
 *   preuves ; leur lecture n'est pas livrée (entrées d'import « non livré », chacune sa raison) ;
 * - un format reporté (DWG, DGN, glTF…) est inscrit « non livré » avec sa raison et sa source (E.6-04, E.6-05) ;
 *   « renoncé » exige une décision **Studio** admise (`STUDIO_DECISIONS_RENONCEMENT`, vide aujourd'hui). DWG : la
 *   décision approuvée D-179 (`docs/atelier/decisions.md`) y renonce ; Studio la cite et ne la contourne pas — DWG reste
 *   inscrit « non livré » avec cette source ;
 * - capacités par sens d'échange (EX-079, `STUDIO_CAPACITES_PAR_SENS`) : pour chaque format, lecture, consultation,
 *   édition, export et aller-retour sont évalués **séparément** ; un aller-retour n'est livré qu'avec la lecture et
 *   l'export livrés et un test qui relit l'export par le lecteur de Studio — un export seul, même valide, ne le prouve
 *   jamais (`controlerCapacitesParSens`) ;
 * - un test relit le dépôt : chaque preuve citée existe (symbole exporté, motif discriminant présent dans le test, la
 *   route, la page), et chaque écrivain, chaque route de fichier et chaque téléchargement de l'interface Studio a son
 *   entrée ; un autre épingle l'empreinte des entrées de chaque révision.
 *
 * Pur, gelé et déterministe ; le document `docs/ai-team/reports/claude-v9-e6/MATRICE-ECHANGES.md` en est généré
 * (`studioMatriceEchangesMarkdown`, test anti-dérive).
 */

export const STUDIO_MATRICE_ECHANGES_SCHEMA = "studio-matrice-echanges/1" as const;
/** Révision de la matrice : à incrémenter avec toute modification d'une entrée (empreinte épinglée par test). */
export const STUDIO_MATRICE_ECHANGES_REVISION = 10 as const;
/** Date de l'audit qui a établi la révision courante. */
export const STUDIO_MATRICE_ECHANGES_DATE = "2026-10-26" as const;

/**
 * Décisions **Studio** admises pour un statut « renoncé » : vide aujourd'hui (aucune décision du maître d'ouvrage ne
 * renonce à un format Studio). Une décision d'un autre chantier (D-179, Atelier P2) ne vaut pas.
 */
export const STUDIO_DECISIONS_RENONCEMENT: readonly string[] = Object.freeze([]);

export type StudioSensEchange = "import" | "export";
export type StudioStatutEchange = "livre" | "non-livre" | "renonce";
export const STUDIO_STATUTS_ECHANGE: readonly StudioStatutEchange[] = Object.freeze(["livre", "non-livre", "renonce"] as const);
/** Famille de l'objet échangé (E.6-02 : natif, vues / feuilles, tableaux ; E.6-03 : dessin et maquette). */
export type StudioFamilleEchange = "natif" | "dessin" | "maquette" | "feuille" | "dossier" | "tableau" | "rendu" | "paquet" | "rapport" | "diagnostic" | "coordination";
export type StudioTacheEchange = "E.6-02" | "E.6-03" | "E.6-04" | "E.6-05";
/** Couverture d'une entité : portée telle quelle, portée en partie (ou transformée), ou absente du fichier. */
export type StudioCouvertureEntite = "portee" | "partielle" | "absente";

export interface StudioEntiteEchange {
  entite: string;
  couverture: StudioCouvertureEntite;
  detail: string;
}

/** Preuve d'une entrée livrée : chemin depuis la racine du dépôt et motif littéral qui doit y figurer. */
export interface StudioPreuveEchange {
  fichier: string;
  /** Code : nom du symbole exporté ; test, route ou interface : texte discriminant présent dans le fichier. */
  motif: string;
}

/**
 * Source d'une entrée : la **référence** (chemin du dépôt, section, identifiant ; jamais traduite) et un commentaire
 * en prose (traduit à l'affichage).
 */
export interface StudioSourceEchange {
  reference: string;
  commentaire?: string;
}

/** Entités IFC écrites pour un rôle (noms EXPRESS en casse usuelle), avec ce qui les produit. */
export interface StudioEcritureIfc {
  entites: readonly string[];
  detail: string;
}

/** Jeu de propriétés IFC écrit, avec ce qu'il porte. */
export interface StudioJeuProprietesIfc {
  nom: string;
  detail: string;
}

export interface StudioEntreeEchange {
  id: string;
  format: string;
  /** Version du format écrite ou acceptée, telle que le fichier la porte (ou « sans objet »). */
  versionFormat: string;
  sens: StudioSensEchange;
  famille: StudioFamilleEchange;
  objet: string;
  taches: readonly StudioTacheEchange[];
  statut: StudioStatutEchange;
  /** Limite de couverture, dite en clair (jamais une conformité). */
  limite: string;
  entites: readonly StudioEntiteEchange[];
  /** Export SVG, DXF ou IFC du document : couverture par type = rapport de fidélité de ce format. */
  fidelite?: StudioFormatEchange;
  /** Export 3D d'une révision (E.6-04) : format servi par la route d'export, couverture déclarée par `entites`. */
  export3d?: "obj" | "stl" | "step";
  /** Export IFC : entités et jeux de propriétés réellement écrits par `exportStudioIfc` (recoupés par test). */
  ecritureIfc?: { elements: readonly StudioEcritureIfc[]; jeuxDeProprietes: readonly StudioJeuProprietesIfc[] };
  /** Contrôle effectivement exécuté (tests, recette, validation externe) ; absent = aucun contrôle propre. */
  controle?: string;
  route?: string;
  preuves?: {
    code: readonly StudioPreuveEchange[];
    tests: readonly StudioPreuveEchange[];
    routes?: readonly StudioPreuveEchange[];
    interfaces?: readonly StudioPreuveEchange[];
  };
  /** Non livré ou renoncé : pourquoi. */
  raison?: string;
  /** Renoncé : décision Studio qui le prononce (doit figurer dans `STUDIO_DECISIONS_RENONCEMENT`). */
  decision?: string;
  /** Sources : plan, liste d'exécution, décisions. */
  sources: readonly StudioSourceEchange[];
}

/** Statut de chaque raison du rapport de fidélité (une raison n'a qu'un statut). */
export const STUDIO_STATUT_DE_RAISON: Readonly<Record<StudioRaisonFidelite, StudioStatutFidelite>> = Object.freeze({
  "trace-exact": "exact", "arcs-exacts": "exact", "renflements-exacts": "exact", "cote-tracee": "exact", "texte-exact": "exact",
  "extrusion-exacte": "exact", "profil-exact": "exact", "ouverture-evidee": "exact", "propriete-en-pset": "exact", "surface-exacte": "exact",
  "extrusion-non-portee": "approche", "arcs-discretises": "approche", "cote-eclatee": "approche", "texte-police-generique": "approche",
  "texte-ascii-echappe": "approche", "texte-remplace": "approche", "texte-tronque": "approche", "ouverture-en-lacune": "approche",
  "non-extrude": "non-couvert", "cote-hors-ifc": "non-couvert", "annotation-hors-ifc": "non-couvert", "solide-hors-2d": "non-couvert",
  "visualisation-hors-export": "non-couvert", "type-sans-capacite": "non-couvert", "propriete-non-exportee": "non-couvert",
  "propriete-non-evaluee": "non-couvert", "non-natif-hors-export": "non-couvert", "solide-exact-hors-ifc": "non-couvert",
  "spline-decoupee": "approche", "transparence-non-portee": "approche", "graphisme-hors-ifc": "non-couvert", "provenance-hors-dessin": "non-couvert",
  "surface-libre-hors-export": "non-couvert",
});

type Categorie = keyof typeof STUDIO_CAPACITES_EXPORT;
type ParType = { readonly [C in Categorie]: { readonly [T in keyof (typeof STUDIO_CAPACITES_EXPORT)[C]]: readonly StudioRaisonFidelite[] } };

const TRACE_2D = ["trace-exact", "extrusion-non-portee"] as const;
const VISU = ["visualisation-hors-export"] as const;
const NN = ["non-natif-hors-export"] as const;
/**
 * Couverture par type et par format des exports SVG, DXF et IFC : raisons que le juge de `STUDIO_CAPACITES_EXPORT`
 * peut rendre pour ce type. Recoupée par test avec la table des capacités (aucune raison de plus, aucune de moins).
 */
export const STUDIO_COUVERTURE_EXPORT: { readonly [F in StudioFormatEchange]: ParType } = Object.freeze({
  svg: {
    objets: { line: TRACE_2D, rectangle: TRACE_2D, circle: TRACE_2D, arc: ["arcs-exacts", "extrusion-non-portee"], polyline: ["trace-exact", "arcs-exacts", "extrusion-non-portee"] },
    cotes: { dimension: ["cote-tracee"] },
    annotations: { "angular-dimension": ["cote-tracee"], text: ["texte-police-generique"] },
    solides: { box: ["solide-hors-2d"], prism: ["solide-hors-2d"] },
    exacts: { exact: ["solide-hors-2d"] },
    surfaces: { "surface-libre": ["surface-libre-hors-export"] },
    cotesFaces: { "face-dimension": ["solide-hors-2d"] },
    architecture: { wall: ["extrusion-non-portee"], opening: ["ouverture-en-lacune"], ladder: ["extrusion-non-portee"] },
    proprietes: { propriete: ["propriete-non-exportee"] },
    scenes: { scene: VISU, appearance: VISU },
    nonNatifs: { "non-native": NN },
    graphismes: { spline: ["trace-exact"], hachure: ["trace-exact"], symbole: ["trace-exact"] },
    sources: { source: ["provenance-hors-dessin"] },
  },
  dxf: {
    objets: { line: TRACE_2D, rectangle: TRACE_2D, circle: TRACE_2D, arc: ["arcs-exacts", "extrusion-non-portee"], polyline: ["trace-exact", "renflements-exacts", "extrusion-non-portee"] },
    cotes: { dimension: ["cote-eclatee"] },
    annotations: { "angular-dimension": ["cote-eclatee"], text: ["texte-exact", "texte-ascii-echappe", "texte-remplace", "texte-tronque"] },
    solides: { box: ["solide-hors-2d"], prism: ["solide-hors-2d"] },
    exacts: { exact: ["solide-hors-2d"] },
    surfaces: { "surface-libre": ["surface-libre-hors-export"] },
    cotesFaces: { "face-dimension": ["solide-hors-2d"] },
    architecture: { wall: ["extrusion-non-portee"], opening: ["ouverture-en-lacune"], ladder: ["extrusion-non-portee"] },
    proprietes: { propriete: ["propriete-non-exportee"] },
    scenes: { scene: VISU, appearance: VISU },
    nonNatifs: { "non-native": NN },
    graphismes: { spline: ["spline-decoupee"], hachure: ["trace-exact", "transparence-non-portee"], symbole: ["trace-exact", "transparence-non-portee"] },
    sources: { source: ["provenance-hors-dessin"] },
  },
  ifc: {
    objets: {
      line: ["extrusion-exacte", "surface-exacte", "non-extrude"], rectangle: ["extrusion-exacte", "non-extrude"], circle: ["profil-exact", "non-extrude"],
      arc: ["arcs-discretises", "non-extrude"], polyline: ["extrusion-exacte", "surface-exacte", "arcs-discretises", "non-extrude"],
    },
    cotes: { dimension: ["cote-hors-ifc"] },
    annotations: { "angular-dimension": ["annotation-hors-ifc"], text: ["annotation-hors-ifc"] },
    solides: { box: ["profil-exact"], prism: ["profil-exact"] },
    exacts: { exact: ["solide-exact-hors-ifc"] },
    surfaces: { "surface-libre": ["surface-libre-hors-export"] },
    cotesFaces: { "face-dimension": ["cote-hors-ifc"] },
    architecture: { wall: ["extrusion-exacte"], opening: ["ouverture-evidee"], ladder: ["extrusion-exacte"] },
    proprietes: { propriete: ["propriete-en-pset", "propriete-non-evaluee"] },
    scenes: { scene: VISU, appearance: VISU },
    nonNatifs: { "non-native": NN },
    graphismes: { spline: ["graphisme-hors-ifc"], hachure: ["graphisme-hors-ifc"], symbole: ["graphisme-hors-ifc"] },
    sources: { source: ["provenance-hors-dessin"] },
  },
});

const src = (reference: string, commentaire?: string): StudioSourceEchange => (commentaire ? { reference, commentaire } : { reference });
const S_PLAN = src("Studio/Fadi_Studio_Plan_Implementation_V1_0.md, §5.7", "Plan d’implémentation Studio V1.0 (E.6, interopérabilité)");
const S_LISTE = (id: string) => src(`Studio/Fadi_Studio_Checklist_Execution_V1_0.md, ${id}`, "Liste d’exécution Studio V1.0");
const S_D179 = src("docs/atelier/decisions.md, D-179", "Décision approuvée : DWG et DGN renoncés, déclarés ; DXF et IFC restent les formats d’échange");
const S_FRONTIERE = src("scripts/frontieres.json, ADR-STUDIO-NAV-01", "Studio n’importe pas l’Atelier");

const p = (fichier: string, motif: string): StudioPreuveEchange => ({ fichier, motif });
const M = "packages/atelier-model/src/studio/";
const API = "apps/api/src/";
const WEB = "apps/web/src/modules/studio/";
const E2E = "apps/web/e2e/";
const ROUTE_VARIANTE = "/projects/:projectId/studio/studies/:studyId/variants/:variantId";

/** Entités IFC et jeux de propriétés écrits par `exportStudioIfc` (recoupés par test avec la sortie réelle). */
const ECRITURE_IFC: NonNullable<StudioEntreeEchange["ecritureIfc"]> = {
  elements: [
    { entites: ["IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcRelAggregates", "IfcRelContainedInSpatialStructure"], detail: "Projet (unités SI, mètre), site nommé d’après l’étude, bâtiment nommé d’après la variante, un niveau de référence à z = 0 ; ni adresse, ni géoréférencement." },
    { entites: ["IfcUnitAssignment", "IfcSIUnit", "IfcGeometricRepresentationContext", "IfcGeometricRepresentationSubContext"], detail: "Unités SI (longueur, aire, volume, angle) ; contextes Body et Axis du repère local-3d." },
    { entites: ["IfcCartesianPoint", "IfcDirection", "IfcAxis2Placement3D", "IfcAxis2Placement2D", "IfcLocalPlacement", "IfcProductDefinitionShape", "IfcShapeRepresentation", "IfcPolyline"], detail: "Placements, représentations et courbes des éléments écrits." },
    { entites: ["IfcWall", "IfcExtrudedAreaSolid", "IfcRectangleProfileDef", "IfcArbitraryClosedProfileDef"], detail: "Mur d’architecture (emprise extrudée et axe) ; ligne extrudée avec épaisseur (profil rectangle longueur × épaisseur) ; arc extrudé avec épaisseur (couronne discrétisée) ; type prédéfini .NOTDEFINED." },
    { entites: ["IfcBuildingElementProxy", "IfcCircleProfileDef"], detail: "Prisme .NOTDEFINED. (SweptSolid) : rectangle, cercle (profil exact) et polyligne fermée extrudés, solides libres ; jamais une dalle ni un poteau devinés." },
    { entites: ["IfcBuildingElementProxy", "IfcTriangulatedFaceSet", "IfcCartesianPointList3D"], detail: "Surface verticale ouverte .NOTDEFINED. (Tessellation) : ligne, arc ou polyligne ouverte extrudés sans épaisseur ; aucun solide." },
    { entites: ["IfcOpeningElement", "IfcRelVoidsElement"], detail: "Ouverture : boîte .OPENING. reliée au mur hôte, placée relativement au mur." },
    { entites: ["IfcDoor", "IfcWindow", "IfcRelFillsElement"], detail: "Porte ou fenêtre seulement si son type est déclaré : remplit l’ouverture, sans représentation propre." },
    { entites: ["IfcStair"], detail: "Échelle d’accès (EX-027) : type prédéfini .LADDER., montants et échelons extrudés (profils fermés), placée à la cote de son pied ; aucune valeur normative." },
    { entites: ["IfcPropertySet", "IfcPropertySingleValue", "IfcRelDefinesByProperties"], detail: "Jeux de propriétés listés ci-dessous, valeurs saisies seulement." },
    { entites: ["IfcPresentationLayerWithStyle"], detail: "Un calque par calque non vide : nom, identifiant Studio, visibilité, verrou ; calque masqué exporté éteint." },
  ],
  jeuxDeProprietes: [
    { nom: "Fadi_StudioExtrusion", detail: "Objet extrudé : identifiant Studio, base, hauteur, épaisseur si saisie." },
    { nom: "Fadi_StudioFreeSolid", detail: "Solide libre : identifiant, forme, origine, rotation, dimensions saisies." },
    { nom: "Fadi_StudioWall", detail: "Mur : identifiant, épaisseur, hauteur, base, justification, longueur d’axe." },
    { nom: "Fadi_StudioOpening", detail: "Ouverture : identifiant, mur hôte, position, largeur, hauteur, allège, type déclaré." },
    { nom: "Fadi_StudioLadder", detail: "Échelle d’accès : identifiant, entre-axe, hauteur, base, nombre et pas des échelons, section des montants." },
    { nom: "Fadi_StudioExport", detail: "Projet : document, révision, repère et effectifs (éléments écrits, objets non extrudés, cotes et annotations non exportées)." },
    { nom: "Fadi_ProprietesDeclarees", detail: "Propriétés déclarées valuées de chaque objet porteur ; les propriétés sans valeur sont comptées, jamais écrites." },
  ],
};

/** Entrées livrées : ce que le code écrit ou lit aujourd'hui, et ce qui le contrôle. */
const LIVREES: readonly StudioEntreeEchange[] = [
  {
    id: "natif-commandes", format: "Enveloppe de commandes Studio (JSON)", versionFormat: "studio-commands/1", sens: "import", famille: "natif",
    objet: "Commandes de document appliquées à une variante (seule écriture du modèle)", taches: ["E.6-02"], statut: "livre",
    limite: "500 commandes et 1 Mo par enveloppe ; chaque commande est revalidée par le serveur, qui fait seul autorité ; rejeu idempotent par requestId.",
    entites: [{ entite: "Toutes les entités du document", couverture: "portee", detail: "Formes, cotes, annotations, solides, architecture, propriétés, scènes : par leurs outils du registre." }],
    controle: "Recette studio-persistance.mjs (rejeu, conflits, droits).", route: `POST ${ROUTE_VARIANTE}/commands`,
    preuves: {
      code: [p(`${API}lib/studio-commands.ts`, "submitStudioCommands")],
      tests: [p(`${E2E}studio-persistance.mjs`, "const replay = await owner('POST', `${variantPath(s)}/commands`, envelope)")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/commands")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02")],
  },
  {
    id: "natif-archive-export", format: "Archive de projet (section Studio, JSON)", versionFormat: "fadi-studio-archive/1 (document studio-document/1)", sens: "export", famille: "natif",
    objet: "Études, variantes, révisions immuables, commentaires, observations, publications et leurs fichiers figés, exigences, journal du métré", taches: ["E.6-02"], statut: "livre",
    limite: "Section signée (HMAC-SHA256 du manifeste, clé du serveur) ; empreintes de contenu conservées ; rien n’est recalculé.",
    entites: [{ entite: "Tables Studio du projet", couverture: "portee", detail: "Lignes exportées telles quelles, manifeste et empreinte globale." }],
    controle: "Tests du manifeste d’archive ; recette studio-restauration.mjs (base neuve, comparaison avant / après).", route: "GET /projects/:projectId/archive",
    preuves: {
      code: [p(`${API}lib/studio-archive.ts`, "exportStudioArchive")],
      tests: [p(`${API}lib/studio-archive-manifest.test.ts`, "STUDIO_ARCHIVE_SCHEMA"), p(`${E2E}studio-restauration.mjs`, "check('sauvegarde : section Studio présente (schéma, version, manifeste)'")],
      routes: [p(`${API}routes/projects.ts`, "/:projectId/archive")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("R.1-02")],
  },
  {
    id: "natif-archive-import", format: "Archive de projet (section Studio, JSON)", versionFormat: "fadi-studio-archive/1 (document studio-document/1)", sens: "import", famille: "natif",
    objet: "Restauration de la section Studio dans un nouveau projet", taches: ["E.6-02"], statut: "livre",
    limite: "Manifeste et empreintes contrôlés (refus 422) ; sans signature vérifiée par ce serveur, auteurs et approbations ne sont pas crus ; identifiant déjà présent : partie Studio non restaurée, réserve signalée.",
    entites: [{ entite: "Tables Studio du projet", couverture: "portee", detail: "Réinsérées telles quelles ; révisions et journaux insérés, jamais réécrits." }],
    controle: "Recette studio-restauration.mjs.", route: "POST /projects/import",
    preuves: {
      code: [p(`${API}lib/studio-archive.ts`, "importStudioArchive")],
      tests: [p(`${API}lib/studio-archive-manifest.test.ts`, "checkStudioArchive"), p(`${E2E}studio-restauration.mjs`, "const imported = await ownerB('POST', '/projects/import', archiveText)")],
      routes: [p(`${API}routes/projects.ts`, "\"/import\"")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("R.1-02")],
  },
  {
    id: "natif-file-locale", format: "File locale hors ligne (JSON)", versionFormat: "fadi-studio-file-locale/1", sens: "export", famille: "natif",
    objet: "Copie de secours d’une file locale de commandes non synchronisée", taches: ["E.6-02"], statut: "livre",
    limite: "Export de secours seulement : Studio ne relit pas ce fichier ; la ligne exportée est relue du stockage, jamais de la mémoire.",
    entites: [{ entite: "Brouillon local (commandes non envoyées)", couverture: "portee", detail: "Ligne conservée telle quelle, avec la raison du blocage et la date d’export." }],
    controle: "Tests de la file locale.",
    preuves: {
      code: [p(`${WEB}hors-ligne/AvisFileLocale.tsx`, "preparerExportFileLocale")],
      tests: [p(`${WEB}hors-ligne/file-locale.test.ts`, "preparerExportFileLocale")],
      interfaces: [p(`${WEB}hors-ligne/AvisFileLocale.tsx`, "a.download = \"studio-file-locale.json\"")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02")],
  },
  {
    id: "natif-profil-outils-export", format: "Profil d’outils Studio (JSON)", versionFormat: "fadi-studio-profil/1", sens: "export", famille: "natif",
    objet: "Profil d’outils du compte (profileId, version, ordre, raccourcis personnels, visibilité)", taches: ["E.6-02"], statut: "livre",
    limite: "Préférences du compte seulement : aucune donnée du projet, aucun droit (EX-033, INV-009).",
    entites: [{ entite: "Profil d’outils", couverture: "portee", detail: "Profil des barres, favoris, liste personnelle, regroupements, ordre des capacités, raccourcis personnels, version." }],
    controle: "Tests des profils importés et exportés.",
    preuves: {
      code: [p(`${API}routes/studio-preferences.ts`, "lireProfilExporte")],
      tests: [p(`${API}routes/studio-profils-import.test.ts`, "format: \"fadi-studio-profil/1\", profileId: r1.body.profileId")],
      interfaces: [p(`${WEB}planche2d/CatalogueOutils.tsx`, "lien.download = `profil-studio-${f.profileId}-v${f.version}.json`")],
      routes: [p(`${API}routes/studio-preferences.ts`, "/outils/export")],
    },
    sources: [S_LISTE("E.6-02")],
  },
  {
    id: "natif-profil-outils-import", format: "Profil d’outils Studio (JSON)", versionFormat: "fadi-studio-profil/1", sens: "import", famille: "natif",
    objet: "Profil d’outils importé dans le compte", taches: ["E.6-02"], statut: "livre",
    limite: "Aucun droit conféré : une capacité exigeant un droit absent est refusée ; raccourcis en conflit refusés ou écartés sur demande explicite.",
    entites: [{ entite: "Profil d’outils", couverture: "portee", detail: "Relu, contrôlé (outils du registre, droits, conflits de raccourcis), version +1, provenance gardée." }],
    controle: "Tests des profils importés et exportés.",
    preuves: {
      code: [p(`${API}lib/studio-profils.ts`, "conflitsRaccourcis")],
      tests: [p(`${API}routes/studio-profils-import.test.ts`, "permission_non_conferee")],
      routes: [p(`${API}routes/studio-preferences.ts`, "/outils/import")],
    },
    sources: [S_LISTE("E.6-02")],
  },
  {
    id: "dessin-svg", format: "SVG", versionFormat: "SVG (espace de noms W3C, aucune version déclarée dans le fichier)", sens: "export", famille: "dessin",
    objet: "Document d’une révision de variante (plan 2D)", taches: ["E.6-03"], statut: "livre", fidelite: "svg",
    limite: "Plan 2D seulement : solides et hauteurs absents ; calques masqués conservés sous display=\"none\" ; graphismes (splines en courbes de Bézier exactes, traits de hachure, symboles) avec leur transparence (opacity) ; aucun script ni ressource externe.",
    entites: [], controle: "Tests de l’export ; recette studio-persistance.mjs ; rapport de fidélité servi à côté du fichier.",
    route: `GET ${ROUTE_VARIANTE}/export?format=svg`,
    preuves: {
      code: [p(`${M}export.ts`, "exportStudioSvg"), p(`${API}lib/studio-commands.ts`, "exportStudioVariant")],
      tests: [p(`${M}export.test.ts`, "exportStudioSvg"), p(`${E2E}studio-persistance.mjs`, "const svg = await owner('GET', `${exportPath}?format=svg`)")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/export")],
      interfaces: [p(`${WEB}planche2d/BarreOutils.tsx`, "download={actif ? \"\" : undefined}"), p(`${WEB}VariantWorkspace.tsx`, "\"exporter-svg\": studioExportUrl(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-03")],
  },
  {
    id: "dessin-dxf", format: "DXF ASCII", versionFormat: "R12 (AC1009), CRLF, $INSUNITS = 6 (mètre)", sens: "export", famille: "dessin",
    objet: "Document d’une révision de variante (plan 2D)", taches: ["E.6-03"], statut: "livre", fidelite: "dxf",
    limite: "R12 seulement ; $INSUNITS n’appartient pas à R12 (variable introduite avec AC1015) : l’unité n’est pas garantie chez un lecteur R12 strict ; ASCII strict (texte échappé, 250 caractères) ; cotes non associatives ; noms de calque réécrits (31 caractères ASCII) ; solides absents ; splines découpées en POLYLINE (16 segments par morceau de Bézier), transparence des graphismes non portée (déclarée en commentaire 999).",
    entites: [], controle: "Tests de l’export ; recette studio-persistance.mjs ; rapport de fidélité servi à côté du fichier.",
    route: `GET ${ROUTE_VARIANTE}/export?format=dxf`,
    preuves: {
      code: [p(`${M}export.ts`, "exportStudioDxf"), p(`${API}lib/studio-commands.ts`, "exportStudioVariant")],
      tests: [p(`${M}export.test.ts`, "exportStudioDxf"), p(`${E2E}studio-persistance.mjs`, "const dxf = await owner('GET', `${exportPath}?format=dxf`)")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/export")],
      interfaces: [p(`${WEB}planche2d/BarreOutils.tsx`, "download={actif ? \"\" : undefined}"), p(`${WEB}VariantWorkspace.tsx`, "\"exporter-dxf\": studioExportUrl(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-03")],
  },
  {
    id: "maquette-ifc", format: "IFC (STEP physique, ISO 10303-21)", versionFormat: "IFC4X3_ADD2, ViewDefinition [ReferenceView]", sens: "export", famille: "maquette",
    objet: "Objets extrudés, solides libres, murs et ouvertures, propriétés déclarées d’une révision", taches: ["E.6-03"], statut: "livre", fidelite: "ifc",
    limite: "Seuls les éléments 3D sont écrits ; arcs discrétisés ; cotes, annotations et réglages de visualisation absents ; IfcDoor / IfcWindow seulement si le type est déclaré, sans représentation propre.",
    entites: [], ecritureIfc: ECRITURE_IFC,
    controle: "Tests de l’export ; corpus validé par IfcOpenShell 0.9.0 en CI (schéma, règles EXPRESS, effectifs, propriétés) ; testé, jamais certifié.",
    route: `GET ${ROUTE_VARIANTE}/export?format=ifc`,
    preuves: {
      code: [p(`${M}ifc.ts`, "exportStudioIfc"), p(`${API}lib/studio-commands.ts`, "exportStudioVariant")],
      tests: [p(`${M}ifc.test.ts`, "exportStudioIfc"), p("apps/api/test-corpus/ifc/generer-studio.ts", "exportStudioIfc"), p(".github/workflows/ci.yml", "generer-studio.ts")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/export")],
      interfaces: [p(`${WEB}planche2d/BarreOutils.tsx`, "download={actif ? \"\" : undefined}"), p(`${WEB}VariantWorkspace.tsx`, "\"exporter-ifc\": studioExportUrl(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-03")],
  },
  {
    id: "maquette-obj", format: "OBJ (Wavefront)", versionFormat: "OBJ texte ASCII, studio-export-obj/1 (le format ne déclare aucune version)", sens: "export", famille: "maquette",
    objet: "Géométrie 3D d’une révision (maillage triangulé de la vue 3D)", taches: ["E.6-04"], statut: "livre", export3d: "obj",
    limite: "Maillage seulement : courbes discrétisées comme dans la vue 3D, coordonnées au micromètre ; mètres déclarés en commentaire (OBJ ne porte aucune unité) ; aucun matériau ; tous les calques écrits, un calque masqué signalé ; ce qui n’est pas une géométrie 3D est compté dans l’en-tête, jamais écrit.",
    entites: [
      { entite: "Objets extrudés, solides libres, solides exacts, murs", couverture: "partielle", detail: "Un objet « o » par élément, nommé par son identifiant Studio (échappé ~XXXX~, réversible), faces triangulaires orientées ; volume relu égal à celui du modèle ; courbes discrétisées." },
      { entite: "Calques", couverture: "portee", detail: "Un groupe « g » par calque ; un calque masqué est écrit et signalé." },
      { entite: "Surfaces verticales sans épaisseur", couverture: "portee", detail: "Triangles sans volume, comme dans la vue 3D." },
      { entite: "Surfaces libres NURBS (X.1-05)", couverture: "partielle", detail: "Nappe ouverte triangulée depuis ses pôles, degrés et poids (maillage d’affichage, 16 échantillons par travée) : un objet « o » par surface ; pôles, poids et degrés perdus." },
      { entite: "Contours non extrudés", couverture: "partielle", detail: "Lignes « l » à z = 0, courbes discrétisées." },
      { entite: "Ouvertures", couverture: "partielle", detail: "Vide dans le maillage du mur ; l’ouverture n’est pas un objet du fichier (comptée)." },
      { entite: "Cotes, annotations, graphismes, propriétés, scènes, éléments non natifs", couverture: "absente", detail: "Comptés dans le bilan de l’en-tête, jamais écrits." },
    ],
    controle: "Tests du modèle (OBJ relu : objets, groupes, volumes égaux au modèle, bilan) ; règle d’or de la commande « Exporter OBJ ».",
    route: `GET ${ROUTE_VARIANTE}/export?format=obj`,
    preuves: {
      code: [p(`${M}export-3d.ts`, "exportStudioObj"), p(`${API}lib/studio-commands.ts`, "exportStudioVariant")],
      tests: [p(`${M}export-3d.test.ts`, "E.6-04 OBJ : un objet par élément"), p(`${E2E}studio-echanges.mjs`, "check(\"Exporter OBJ : fichier servi"), p(`${M}surfaces-libres.test.ts`, "X.1-05 exports : OBJ écrit la nappe")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/export")],
      interfaces: [p(`${WEB}planche2d/BarreOutils.tsx`, "download={actif ? \"\" : undefined}"), p(`${WEB}VariantWorkspace.tsx`, "\"exporter-obj\": studioExportUrl(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "maquette-stl", format: "STL ASCII", versionFormat: "STL ASCII (solid … endsolid), sans version", sens: "export", famille: "maquette",
    objet: "Solides d’une révision (facettes triangulées)", taches: ["E.6-04"], statut: "livre", export3d: "stl",
    limite: "Une seule pièce « solid » : STL ne porte ni unité (mètres), ni identité, ni calque ; facettes des solides seulement, normale unitaire calculée dans le sens des sommets ; courbes discrétisées ; surfaces sans épaisseur et contours plats non écrits (comptés par le bilan de l’export).",
    entites: [
      { entite: "Objets extrudés, solides libres, solides exacts, murs", couverture: "partielle", detail: "Facettes du maillage de la vue 3D ; volume relu égal à celui du modèle ; identité et calque perdus." },
      { entite: "Surfaces verticales sans épaisseur, contours non extrudés", couverture: "absente", detail: "Ce ne sont pas des solides : comptés, jamais écrits." },
      { entite: "Surfaces libres NURBS non épaissies (X.1-05)", couverture: "absente", detail: "Nappes ouvertes, pas des solides : comptées « surface-libre-non-epaissie », jamais écrites ; épaissies, ce sont des solides exacts (écrits)." },
      { entite: "Cotes, annotations, graphismes, ouvertures, propriétés, scènes, éléments non natifs", couverture: "absente", detail: "Comptés par le bilan de l’export, jamais écrits." },
    ],
    controle: "Tests du modèle (STL relu : facettes, normales sortantes, volume total égal au modèle, bilan) ; règle d’or de la commande « Exporter STL ».",
    route: `GET ${ROUTE_VARIANTE}/export?format=stl`,
    preuves: {
      code: [p(`${M}export-3d.ts`, "exportStudioStl"), p(`${API}lib/studio-commands.ts`, "exportStudioVariant")],
      tests: [p(`${M}export-3d.test.ts`, "E.6-04 STL : une pièce solid"), p(`${E2E}studio-echanges.mjs`, "check(\"Exporter STL : fichier servi"), p(`${M}surfaces-libres.test.ts`, "X.1-05 exports : OBJ écrit la nappe")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/export")],
      interfaces: [p(`${WEB}planche2d/BarreOutils.tsx`, "download={actif ? \"\" : undefined}"), p(`${WEB}VariantWorkspace.tsx`, "\"exporter-stl\": studioExportUrl(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "maquette-step", format: "STEP (ISO 10303-21)", versionFormat: "AP214 (FILE_SCHEMA AUTOMOTIVE_DESIGN, écrit par OCCT 8.0), assemblage XCAF nommé", sens: "export", famille: "maquette",
    objet: "Solides d’une révision en représentation exacte (brep), un produit nommé par élément", taches: ["E.6-04"], statut: "livre", export3d: "step",
    limite: "Écrit côté serveur par le noyau exact (OCCT en WebAssembly, chargé à la demande) ; millimètres déclarés (SI_UNIT .MILLI. .METRE.), géométrie mise à l’échelle × 1 000 depuis les mètres du modèle ; horodatage de la révision ; emprises des objets extrudés discrétisées comme dans la vue 3D ; aucune couleur ni propriété ; révision sans solide : refus 422, jamais un fichier vide.",
    entites: [
      { entite: "Solides exacts (booléens)", couverture: "portee", detail: "Brep du noyau écrit tel quel." },
      { entite: "Surfaces libres NURBS épaissies (X.1-05)", couverture: "portee", detail: "Solide exact du noyau (faces B-spline rationnelles exactes, pôles et poids de la surface) écrit tel quel ; une surface non épaissie n’est pas un solide : comptée « surface-libre-non-epaissie », jamais écrite." },
      { entite: "Solides libres (boîtes, prismes)", couverture: "portee", detail: "Extrusion de l’emprise (solide droit) ou lissage réglé entre ses deux faces (solide oblique ou basculé) : faces planes, exactes." },
      { entite: "Murs", couverture: "portee", detail: "Morceaux pleins juxtaposés (vides des ouvertures déduits), un produit par mur ; volume relu égal au volume net du modèle." },
      { entite: "Objets extrudés fermés, lignes et arcs avec épaisseur", couverture: "partielle", detail: "Extrusion de l’emprise de la vue 3D : cercles et arcs discrétisés." },
      { entite: "Identité", couverture: "portee", detail: "Nom du produit STEP = identifiant Studio (échappé ~XXXX~ hors ASCII imprimable, réversible)." },
      { entite: "Calques, surfaces sans épaisseur, contours, cotes, annotations, graphismes, ouvertures, propriétés, scènes, éléments non natifs", couverture: "absente", detail: "Non écrits ; comptés par le bilan de l’export." },
    ],
    controle: "Tests du noyau (STEP nommé relu : noms, solides, volumes, unité, reproductibilité) et du serveur (révision exportée relue par le noyau, égale au modèle) ; règle d’or de la commande « Exporter STEP ».",
    route: `GET ${ROUTE_VARIANTE}/export?format=step`,
    preuves: {
      code: [p(`${M}export-3d.ts`, "studioPiecesStep"), p(`${API}lib/studio-exact.ts`, "exportStudioStep"), p(`${API}lib/studio-commands.ts`, "exportStudioVariant")],
      tests: [p(`${M}export-3d.test.ts`, "E.6-04 STEP : une pièce nommée par élément solide"), p(`${API}lib/studio-export-3d.test.ts`, "E.6-04 STEP serveur : relu par le noyau"), p("packages/geometry-exact/src/index.test.ts", "E.6-04 STEP : un produit nommé par pièce"), p(`${E2E}studio-echanges.mjs`, "check(\"Exporter STEP : fichier servi"), p(`${API}lib/studio-surfaces.test.ts`, "X.1-05 STEP serveur : la surface épaissie")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/export")],
      interfaces: [p(`${WEB}planche2d/BarreOutils.tsx`, "download={actif ? \"\" : undefined}"), p(`${WEB}VariantWorkspace.tsx`, "\"exporter-step\": studioExportUrl(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04"), src("docs/atelier/decisions.md, D-177", "Noyau exact OCCT, composant LGPL chargé à part")],
  },
  {
    id: "dessin-dxf-import", format: "DXF ASCII", versionFormat: "R12 et suivantes (codes de groupe), CRLF ou LF ; DXF binaire refusé", sens: "import", famille: "dessin",
    objet: "Plan 2D ajouté au brouillon d’une variante, par commandes", taches: ["E.6-03"], statut: "livre",
    limite: "5 Mo au plus ; unité lue dans $INSUNITS (16 codes reconnus ; tout autre code, 0 ou absent : unité inconnue, choisie par l’utilisateur, jamais devinée) ; un calque déjà verrouillé dans le document (calque implicite compris) qui recevrait des objets fait échouer l’import ; Z ignoré (compté) ; tout le reste compté par type dans le rapport d’import, jamais écarté en silence.",
    entites: [
      { entite: "LINE", couverture: "portee", detail: "Ligne." },
      { entite: "CIRCLE", couverture: "portee", detail: "Cercle." },
      { entite: "ARC", couverture: "portee", detail: "Arc (angles ramenés en radians), cercle si ses angles se confondent." },
      { entite: "LWPOLYLINE / POLYLINE 2D", couverture: "partielle", detail: "Polyligne à renflements ; rectangle si fermée à 4 sommets parallèles aux axes ; sinon un segment droit par ligne." },
      { entite: "Calques (table LAYER)", couverture: "portee", detail: "Repris par nom ou créés, visibilité et verrouillage du fichier." },
      { entite: "TEXT, INSERT, SPLINE, HATCH, DIMENSION, ELLIPSE…", couverture: "absente", detail: "Non importés comme objets, comptés par type ; conservés comme éléments non natifs (type, handle, nom de bloc, raison) si l’option est cochée." },
      { entite: "Polylignes 3D ou lissées, espace papier", couverture: "absente", detail: "Non importées comme objets, comptées ; conservées comme éléments non natifs si l’option est cochée." },
    ],
    controle: "Tests de l’import (modèle et interface) ; rapport d’import à l’aperçu.",
    preuves: {
      code: [p(`${M}import-dxf.ts`, "lireDxfStudio")],
      tests: [p(`${M}import-dxf.test.ts`, "lireDxfStudio"), p(`${WEB}import/import-dxf.test.ts`, "lireDxfStudio")],
      interfaces: [p(`${WEB}import/DialogueImportDxf.tsx`, "export function DialogueImportDxf(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-03")],
  },
  {
    id: "maquette-ifc-import", format: "IFC (STEP physique, ISO 10303-21)", versionFormat: "IFC2X3, IFC4, IFC4X1 à IFC4X3 (FILE_SCHEMA lu) ; ifcXML et ifcZIP refusés", sens: "import", famille: "maquette",
    objet: "Maquette d’un autre logiciel ajoutée au brouillon d’une variante, par commandes", taches: ["E.6-04"], statut: "livre",
    limite: "5 Mo au plus ; lecteur STEP propre, sans web-ifc ; unité de longueur lue dans l’IfcUnitAssignment du projet (IfcSIUnit et son préfixe, ou IfcConversionBasedUnit dont le facteur est déclaré), absente : rien n’est importé, jamais supposée ; seules les extrusions verticales (IfcExtrudedAreaSolid d’un IfcRectangleProfileDef ou d’un IfcArbitraryClosedProfileDef droit) placées par IfcLocalPlacement tourné autour de z sont traduites ; toute autre entité ou géométrie est conservée comme élément non natif, et chaque information non reprise est comptée dans le rapport de pertes.",
    entites: [
      { entite: "IfcWall, IfcWallStandardCase", couverture: "partielle", detail: "Mur (axe, épaisseur, hauteur, cote de base lus ; justification déduite de l’axe Axis) si le corps est rectangulaire ; sinon prisme libre, perte comptée." },
      { entite: "IfcOpeningElement, IfcRelVoidsElement", couverture: "portee", detail: "Ouverture du mur importé : position, largeur, hauteur et allège lues de son corps." },
      { entite: "IfcDoor, IfcWindow, IfcRelFillsElement", couverture: "partielle", detail: "Type déclaré porte ou fenêtre de l’ouverture remplie ; géométrie propre du remplissage non reprise (perte comptée)." },
      { entite: "IfcSlab", couverture: "partielle", detail: "Prisme libre à sa cote ; sémantique de dalle non reprise (perte comptée)." },
      { entite: "IfcBuildingStorey", couverture: "partielle", detail: "Calque nommé d’après le niveau ; ses éléments y sont rangés ; l’élévation est portée par les placements." },
      { entite: "IfcSpace, IfcColumn, IfcBeam, IfcBuildingElementProxy…", couverture: "absente", detail: "Conservés comme éléments non natifs : type, GlobalId, nom, raison, empreinte lue ; non éditables, exclus des métrés." },
      { entite: "IfcPropertySet, IfcRelAssociatesMaterial, IfcRelDefinesByType, IfcMapConversion, IfcSite, IfcBuilding…", couverture: "absente", detail: "Comptés par type dans le rapport de pertes." },
    ],
    controle: "Tests du lecteur (fixture IFC2X3 écrite à la main, IFC4 en pieds, aller-retour avec l’export IFC4X3 de Studio) ; recette studio-echanges.mjs (import par l’interface, éléments non natifs visibles).",
    preuves: {
      code: [p(`${M}import-ifc/import-ifc.ts`, "lireIfcStudio")],
      tests: [p(`${M}import-ifc/import-ifc.test.ts`, "lireIfcStudio"), p(`${WEB}import/import-ifc.test.ts`, "lireIfcStudio"), p(`${E2E}studio-echanges.mjs`, "check(\"Importer IFC : rapport de pertes")],
      interfaces: [p(`${WEB}import/DialogueImportIfc.tsx`, "export function DialogueImportIfc(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04"), S_LISTE("TEST-028")],
  },
  {
    id: "modele-externe-ifc", format: "IFC (STEP physique, ISO 10303-21)", versionFormat: "IFC2X3, IFC4, IFC4X1 à IFC4X3 (lecteur de l’import IFC)", sens: "import", famille: "coordination",
    objet: "Modèle d’un partenaire référencé, comparé à la révision courante, accepté ou refusé", taches: ["E.6-04"], statut: "livre",
    limite: "Référence, auteur, discipline, version, unité, transformation, repère source et restrictions d’utilisation déclarés par l’émetteur ; fichier relu par le serveur dans un document à part, jamais dans la variante ; comparaison par identifiant (GlobalId) avec la révision courante ; acceptation ou refus réservés au propriétaire et aux approbateurs, journalisés, un refus avec motif ; accepté, le modèle s’ajoute au brouillon seulement par une action explicite ; non repris par l’archive du projet.",
    entites: [
      { entite: "Déclarations de l’émetteur", couverture: "portee", detail: "Conservées telles quelles ; l’unité déclarée est comparée à l’unité lue, jamais substituée." },
      { entite: "Fichier reçu", couverture: "portee", detail: "Conservé tel quel avec son SHA-256 ; lecture et pertes comme l’import IFC." },
      { entite: "Écarts avec la révision courante", couverture: "portee", detail: "Objets, calques, cotes, murs et ouvertures, solides libres, éléments non natifs : ajoutés, supprimés, modifiés." },
    ],
    controle: "Tests des règles (modèle et serveur) ; recette studio-echanges.mjs (réception, comparaison, acceptation journalisée).",
    route: `POST ${ROUTE_VARIANTE}/modeles-externes`,
    preuves: {
      code: [p(`${M}echanges/modeles-externes.ts`, "lireModeleExterne"), p(`${API}lib/studio-modeles-externes.ts`, "deciderReception")],
      tests: [p(`${M}echanges/modeles-externes.test.ts`, "passageModeleExterne"), p(`${API}lib/studio-modeles-externes.test.ts`, "deciderReception"), p(`${E2E}studio-echanges.mjs`, "check(\"Modèle externe : accepté par le propriétaire")],
      routes: [p(`${API}routes/studio-modeles-externes.ts`, "/studies/:studyId/variants/:variantId/modeles-externes")],
      interfaces: [p(`${WEB}echanges/PanneauModelesExternes.tsx`, "export function PanneauModelesExternes(")],
    },
    sources: [S_PLAN, S_LISTE("TR-EX-066")],
  },
  {
    id: "feuille-svg", format: "SVG", versionFormat: "studio-sheet/1 (SVG en millimètres)", sens: "export", famille: "feuille",
    objet: "Feuille de présentation d’une révision (format, échelle, cartouche)", taches: ["E.6-02"], statut: "livre",
    limite: "A4 à A1 ; échelle choisie ou ajustée ; dessin découpé au cadre ; valeur absente du cartouche imprimée « non évalué ».",
    entites: [
      { entite: "Dessin 2D par calque", couverture: "partielle", detail: "Mêmes primitives que l’export SVG, découpées au cadre ; solides absents." },
      { entite: "Cartouche, échelle graphique, nord", couverture: "portee", detail: "Tracés sur la feuille." },
    ],
    controle: "Tests de la feuille.",
    preuves: {
      code: [p(`${M}feuille.ts`, "exportStudioSheetSvg"), p(`${M}feuille.ts`, "studioSheetSvg")],
      tests: [p(`${M}feuille.test.ts`, "exportStudioSheetSvg")],
      interfaces: [p(`${WEB}feuille/PanneauFeuille.tsx`, "data-studio-feuille-svg")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02")],
  },
  {
    id: "feuille-pdf", format: "PDF", versionFormat: "PDF 1.4 (une page)", sens: "export", famille: "feuille",
    objet: "Feuille de présentation d’une révision", taches: ["E.6-02"], statut: "livre",
    limite: "Mêmes primitives que la feuille SVG ; aucune conformité PDF/A déclarée.",
    entites: [{ entite: "Feuille composée", couverture: "portee", detail: "Primitives de la feuille SVG." }],
    controle: "Tests de la feuille.",
    preuves: {
      code: [p(`${M}feuille.ts`, "studioSheetPdf")],
      tests: [p(`${M}feuille.test.ts`, "studioSheetPdf")],
      interfaces: [p(`${WEB}feuille/PanneauFeuille.tsx`, "data-studio-feuille-pdf")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02")],
  },
  {
    id: "feuille-composee-svg", format: "SVG", versionFormat: "studio-feuille-composee/1 (feuille studio-sheet/1 avec ligne de provenance)", sens: "export", famille: "feuille",
    objet: "Feuille composée enregistrée (vue source, révision épinglée)", taches: ["E.6-02"], statut: "livre",
    limite: "Lit une révision enregistrée, jamais le brouillon ; provenance recalculée par le serveur (révision, empreintes du document et de la vue).",
    entites: [{ entite: "Vue documentaire (calques retenus)", couverture: "partielle", detail: "Calques exclus listés ; solides absents." }],
    controle: "Tests du dossier de conception ; recette studio-dossier.mjs.",
    route: "GET /projects/:projectId/studio/studies/:studyId/sheets/:sheetId/files/svg",
    preuves: {
      code: [p(`${M}dossier-conception.ts`, "studioFeuilleComposeeSvg"), p(`${API}lib/studio-dossiers.ts`, "readStudioSheetFile")],
      tests: [p(`${M}dossier-conception.test.ts`, "studioFeuilleComposeeSvg"), p(`${E2E}studio-dossier.mjs`, "await fichier(f1.files.svg)")],
      routes: [p(`${API}routes/studio-dossiers.ts`, "${sheet}/files/:format")],
      interfaces: [p(`${WEB}dossier/PanneauDossier.tsx`, "href={f.files.svg} download")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.3-02")],
  },
  {
    id: "feuille-composee-pdf", format: "PDF", versionFormat: "PDF 1.4 (une page)", sens: "export", famille: "feuille",
    objet: "Feuille composée enregistrée", taches: ["E.6-02"], statut: "livre",
    limite: "Mêmes primitives que la feuille composée SVG ; aucune conformité PDF/A déclarée.",
    entites: [{ entite: "Feuille composée", couverture: "portee", detail: "Primitives de la feuille SVG." }],
    controle: "Recette studio-dossier.mjs.",
    route: "GET /projects/:projectId/studio/studies/:studyId/sheets/:sheetId/files/pdf",
    preuves: {
      code: [p(`${M}feuille.ts`, "studioSheetPdf"), p(`${API}lib/studio-dossiers.ts`, "readStudioSheetFile")],
      tests: [p(`${E2E}studio-dossier.mjs`, "await fichier(f1.files.pdf)")],
      routes: [p(`${API}routes/studio-dossiers.ts`, "${sheet}/files/:format")],
      interfaces: [p(`${WEB}dossier/PanneauDossier.tsx`, "href={f.files.pdf} download")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.3-02")],
  },
  {
    id: "dossier-pdf", format: "PDF", versionFormat: "PDF 1.4 (plusieurs pages)", sens: "export", famille: "dossier",
    objet: "Dossier de conception : feuilles ordonnées, métré, rapport de fidélité", taches: ["E.6-02"], statut: "livre",
    limite: "Quantités brutes, déductions et nettes séparées ; valeur absente « non évalué » ; aucune conformité PDF/A déclarée.",
    entites: [
      { entite: "Feuilles composées", couverture: "portee", detail: "Dans l’ordre du dossier." },
      { entite: "Métré (brut, déductions, net)", couverture: "portee", detail: "Épinglé sur une révision." },
      { entite: "Rapport de fidélité", couverture: "portee", detail: "Totaux par format, raisons." },
    ],
    controle: "Tests du dossier de conception ; recette studio-dossier.mjs.",
    route: "GET /projects/:projectId/studio/studies/:studyId/dossiers/:dossierId/files/pdf",
    preuves: {
      code: [p(`${M}dossier-conception.ts`, "pdfDossierConception"), p(`${API}lib/studio-dossiers.ts`, "readStudioDossierFile")],
      tests: [p(`${M}dossier-conception.test.ts`, "pdfDossierConception"), p(`${E2E}studio-dossier.mjs`, "await fichier(dos.files.pdf)")],
      routes: [p(`${API}routes/studio-dossiers.ts`, "${dossier}/files/:format")],
      interfaces: [p(`${WEB}dossier/PanneauDossier.tsx`, "data-studio-dossier-pdf")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.3-03")],
  },
  {
    id: "dossier-json", format: "JSON", versionFormat: "studio-dossier-conception/1", sens: "export", famille: "dossier",
    objet: "Dossier de conception (données natives du dossier)", taches: ["E.6-02"], statut: "livre",
    limite: "Export seulement : aucun import de dossier ; empreinte du dossier portée en en-tête.",
    entites: [{ entite: "Dossier (feuilles, métré, fidélité, empreintes)", couverture: "portee", detail: "Objet du dossier tel qu’assemblé." }],
    controle: "Tests du dossier de conception ; recette studio-dossier.mjs.",
    route: "GET /projects/:projectId/studio/studies/:studyId/dossiers/:dossierId/files/json",
    preuves: {
      code: [p(`${M}dossier-conception.ts`, "assemblerDossierConception"), p(`${API}lib/studio-dossiers.ts`, "readStudioDossierFile")],
      tests: [p(`${M}dossier-conception.test.ts`, "assemblerDossierConception"), p(`${E2E}studio-dossier.mjs`, "const json1 = await fichier(dos.files.json)")],
      routes: [p(`${API}routes/studio-dossiers.ts`, "${dossier}/files/:format")],
      interfaces: [p(`${WEB}dossier/PanneauDossier.tsx`, "data-studio-dossier-json")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.3-03")],
  },
  {
    id: "tableau-metre-csv", format: "CSV", versionFormat: "UTF-8 avec BOM, séparateur « ; », décimale « , » ou « . »", sens: "export", famille: "tableau",
    objet: "Tableau du métré d’une révision (brut, déductions, net, ajustements)", taches: ["E.6-02"], statut: "livre",
    limite: "Export seulement ; statut de chaque ajustement écrit en clair ; refusé tant que le métré n’est pas à jour.",
    entites: [{ entite: "Lignes du métré", couverture: "portee", detail: "Quantité dérivée, ajustement, auteur, statut." }],
    controle: "Tests du CSV ; recette studio-quantites.mjs.",
    preuves: {
      code: [p(`${WEB}quantites/csv-quantites.ts`, "csvQuantites")],
      tests: [p(`${WEB}quantites/csv-quantites.test.ts`, "csvQuantites"), p(`${E2E}studio-quantites.mjs`, "// 6. CSV : colonnes d'ajustement.")],
      interfaces: [p(`${WEB}quantites/PanneauQuantites.tsx`, "data-studio-quantites-csv")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.3-04")],
  },
  {
    id: "rendu-png", format: "PNG", versionFormat: "PNG (bloc iTXt « fadi:rendu » de provenance)", sens: "export", famille: "rendu",
    objet: "Rendu du modèle depuis la vue 3D d’une révision enregistrée", taches: ["E.6-02"], statut: "livre",
    limite: "Image du canevas, pixels non modifiés ; refusé sur un brouillon non enregistré ou un maillage en cours ; provenance : étude, variante, révision, scène, caméra, date.",
    entites: [{ entite: "Vue 3D affichée", couverture: "partielle", detail: "Image seulement : aucune donnée du modèle n’est relisible." }],
    controle: "Tests du bloc de provenance ; recette studio-visualisation.mjs.",
    preuves: {
      code: [p(`${WEB}vue3d/scenes/png.ts`, "insererTextePng")],
      tests: [p(`${WEB}vue3d/scenes/scenes.test.ts`, "insererTextePng"), p(`${E2E}studio-visualisation.mjs`, "check(\"PNG : vrai fichier PNG tiré du canevas\"")],
      interfaces: [p(`${WEB}vue3d/Vue3DStudio.tsx`, "lien.download = studioNomFichierRendu(p)")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.5-03")],
  },
  {
    id: "illustration-png", format: "PNG", versionFormat: "PNG (bloc iTXt « fadi:illustration » de provenance, studio-illustration/1)", sens: "export", famille: "rendu",
    objet: "Illustration archivée, tirée du rendu du modèle d’une vue (lot F)", taches: ["E.6-02"], statut: "livre",
    limite: "Image séparée « non vérifiée » : ni métrique, ni conforme, aucune donnée du modèle relisible ; provenance : rendu source, empreintes du document avant et après, paramètres, fournisseur, coûts, reproductibilité.",
    entites: [{ entite: "Vue 3D affichée", couverture: "partielle", detail: "Illustration seulement : le modèle n’est ni exporté ni modifié." }],
    controle: "Tests des routes d’illustration (base simulée) ; recette studio-lot-f.mjs.",
    route: "GET /projects/:projectId/studio/studies/:studyId/variants/:variantId/illustrations/:illustrationId/image",
    preuves: {
      code: [p(`${API}lib/studio-illustrations.ts`, "lireImageIllustration")],
      tests: [p(`${API}routes/studio-illustrations.test.ts`, "x-studio-verification")],
      routes: [p(`${API}routes/studio-illustrations.ts`, "${base}/:illustrationId/image")],
      interfaces: [p(`${WEB}illustration/DialogueIllustration.tsx`, "data-studio-illustration-archivee")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.5-03")],
  },
  {
    id: "paquet-publication", format: "Paquet de publication (SVG, DXF, IFC, feuille PDF ; dossier de conception : PDF et JSON)", versionFormat: "studio-publication-manifest/1", sens: "export", famille: "paquet",
    objet: "Fichiers figés d’une publication approuvée et diffusée", taches: ["E.6-02"], statut: "livre",
    limite: "Fichiers du manifeste approuvé, identifiés par SHA-256 et vérifiables ; dessin 2D indépendant : sans IFC ; dossier de conception (lot PUB) : PDF et JSON du dossier, feuilles et vues de coupe jointes ; mêmes limites que chaque export.",
    entites: [
      { entite: "Fichiers du paquet", couverture: "portee", detail: "SVG, DXF, IFC et feuille PDF calculés par les exporteurs du modèle." },
      { entite: "Dossier de conception", couverture: "portee", detail: "PDF (sommaire, feuilles, métré, fidélité, vues de coupe) et JSON du dossier ; pièces, origine et présentation déclarées dans le manifeste." },
    ],
    controle: "Recettes studio-publication.mjs et studio-dossier.mjs (empreintes recalculées).",
    route: "GET /projects/:projectId/studio/studies/:studyId/publications/:publicationId/files/:format",
    preuves: {
      code: [p(`${API}lib/studio-publications.ts`, "studioPackageFiles"), p(`${API}lib/studio-publications.ts`, "readStudioPackageFile")],
      tests: [p(`${E2E}studio-publication.mjs`, "const file = await reader('GET', `${pubs}/${id3}/files/${f.format}`")],
      routes: [p(`${API}routes/studio-publications.ts`, "${base}/files/:format")],
      interfaces: [p(`${WEB}publication/PanneauPublications.tsx`, "data-studio-publication-fichier")],
    },
    sources: [S_PLAN, S_LISTE("E.6-02"), S_LISTE("E.4-03")],
  },
  {
    id: "rapport-fidelite-json", format: "JSON", versionFormat: "studio-rapport-fidelite/1", sens: "export", famille: "rapport",
    objet: "Rapport de fidélité d’un export SVG, DXF ou IFC (même révision)", taches: ["E.6-03"], statut: "livre",
    limite: "Décrit le fichier (jamais certifié) : exact, approché, non couvert, par type et par raison ; calques masqués et noms réécrits.",
    entites: [{ entite: "Éléments du document", couverture: "portee", detail: "Chacun compté une fois ; liste inconnue comptée « non couverte »." }],
    controle: "Tests du rapport de fidélité.",
    route: `GET ${ROUTE_VARIANTE}/export/rapport?format=svg|dxf|ifc`,
    preuves: {
      code: [p(`${M}echanges/rapport-fidelite.ts`, "studioRapportFidelite")],
      tests: [p(`${M}echanges/rapport-fidelite.test.ts`, "studioRapportFidelite"), p(`${WEB}variante/rapport-export.test.ts`, "studioRapportFidelite")],
      routes: [p(`${API}routes/studio.ts`, "/studies/:studyId/variants/:variantId/export/rapport")],
    },
    sources: [S_PLAN, S_LISTE("E.6-03")],
  },
  {
    id: "provenance-sources-json", format: "JSON", versionFormat: "studio-provenance/1", sens: "export", famille: "rapport",
    objet: "Provenance des sources importées dans le dessin (import DXF, EX-014)", taches: ["E.6-04"], statut: "livre",
    limite: "Déclarée avec l’import (même lot) : fichier, empreinte SHA-256 et version du format lues, horodatage, unité lue et retenue, repère source, transformation (aucune : identité), auteur et restrictions d’utilisation déclarés ou « non déclarés » ; enregistrée par le navigateur depuis le brouillon affiché.",
    entites: [{ entite: "Sources du document", couverture: "portee", detail: "Chacune telle que déclarée ; un champ inconnu vaut null, jamais une valeur supposée." }],
    controle: "Tests des sources ; recette studio-rend.mjs (import DXF avec sa provenance, enregistrée et relue).",
    preuves: {
      code: [p(`${M}sources/sources.ts`, "studioExportProvenance")],
      tests: [p(`${M}sources/sources.test.ts`, "studioExportProvenance"), p(`${E2E}studio-rend.mjs`, "check(\"TR-EX-014 : import DXF")],
      interfaces: [p(`${WEB}import/DialogueImportDxf.tsx`, "export function exporterProvenance(")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "provenance-modele-externe-json", format: "JSON", versionFormat: "studio-provenance-modele/1", sens: "export", famille: "coordination",
    objet: "Provenance d’un modèle externe reçu (EX-014)", taches: ["E.6-04"], statut: "livre",
    limite: "Ce que l’émetteur déclare (référence, auteur, discipline, version, unité, repère source, transformation, restrictions d’utilisation) et ce que le serveur a lu et calculé (schéma, unité lue, SHA-256, horodatage de réception) ; droit d’export.",
    entites: [{ entite: "Modèle reçu", couverture: "portee", detail: "Déclarations telles quelles, non déclarées à null ; l’unité lue est comparée, jamais substituée." }],
    controle: "Tests des sources et des modèles externes ; recette studio-rend.mjs (provenance exportée).",
    route: `GET ${ROUTE_VARIANTE}/modeles-externes/:modelId/provenance`,
    preuves: {
      code: [p(`${M}echanges/modeles-externes.ts`, "studioProvenanceModeleExterne")],
      tests: [p(`${M}sources/sources.test.ts`, "studioProvenanceModeleExterne"), p(`${E2E}studio-rend.mjs`, "check(\"TR-EX-014 : modèle externe IFC")],
      routes: [p(`${API}routes/studio-modeles-externes.ts`, "/:modelId/provenance")],
      interfaces: [p(`${WEB}echanges/PanneauModelesExternes.tsx`, "data-studio-modele-provenance")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "diagnostic-releve-perf", format: "JSON", versionFormat: "studio-releve-perf/1 (relevé de performances Studio, JSON)", sens: "export", famille: "diagnostic",
    objet: "Mesures de chargement et d’exécution de la session (hors modèle)", taches: ["E.6-02"], statut: "livre",
    limite: "Diagnostic seulement : aucune donnée du projet ; non relu par Studio.",
    entites: [{ entite: "Mesures de la session", couverture: "portee", detail: "Schéma versionné, définitions, contexte, synthèse, journal." }],
    controle: "Tests du relevé et de son schéma versionné (controlerRelevePerf).",
    preuves: {
      code: [p(`${WEB}chargement/perf.ts`, "ReleveurPerf"), p(`${WEB}chargement/perf.ts`, "controlerRelevePerf")],
      tests: [p(`${WEB}chargement/perf.test.ts`, "ReleveurPerf"), p(`${WEB}chargement/perf.test.ts`, "controlerRelevePerf")],
      interfaces: [p(`${WEB}chargement/PanneauRessources.tsx`, "a.download = \"studio-releve-perf.json\"")],
    },
    sources: [S_LISTE("X.1-09")],
  },
  {
    id: "bcf-export", format: "BCF (BIM Collaboration Format, .bcfzip)", versionFormat: "2.1 (bcf.version VersionId 2.1), archive sans compression", sens: "export", famille: "coordination",
    objet: "Observations d’une variante (sujets BCF)", taches: ["E.6-04"], statut: "livre",
    limite: "Contrat minimal du lot PUB : sujet (Guid stable dérivé de l’identité interne, type = catégorie, statut, titre, priorité = gravité, objets cités en étiquettes, auteur, responsable, description) et commentaires du journal ; aucun point de vue (caméra) ni pièce jointe ; observations lisibles par l’acteur seulement.",
    entites: [
      { entite: "Topic", couverture: "portee", detail: "Guid, TopicType, TopicStatus, Title, Priority, Labels, CreationDate, CreationAuthor, AssignedTo, Description." },
      { entite: "Comment", couverture: "partielle", detail: "Un commentaire par passage du journal (action et note)." },
      { entite: "Viewpoints, Components, pièces justificatives", couverture: "absente", detail: "Les observations Studio ne portent pas de point de vue ; les pièces restent dans Studio." },
    ],
    controle: "Tests du modèle (export relu, Guid stable) ; recette studio-pub.mjs (export servi par l’API).",
    route: `GET ${ROUTE_VARIANTE}/observations/bcf`,
    preuves: {
      code: [p(`${M}echanges/bcf-observations.ts`, "studioExporterBcf"), p(`${API}lib/studio-observations-bcf.ts`, "exporterObservationsBcf")],
      tests: [p(`${M}echanges/bcf-observations.test.ts`, "IF-010 [+] export BCF 2.1 relu à l'identique")],
      routes: [p(`${API}routes/studio-observations.ts`, "${base}/bcf")],
      interfaces: [p(`${WEB}observations/PanneauObservations.tsx`, "data-studio-bcf-exporter")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04"), src("docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json", "Contrat IF-010 : identifiants BCF conservés comme références")],
  },
  {
    id: "bcf-import", format: "BCF (BIM Collaboration Format, .bcfzip)", versionFormat: "2.x lu selon le contrat 2.1 minimal ; entrées stockées (sans compression)", sens: "import", famille: "coordination",
    objet: "Sujets BCF reçus, créés comme observations distinctes de la variante", taches: ["E.6-04"], statut: "livre",
    limite: "8 Mo au plus ; 500 sujets ; reconnaissance par (Guid, contexte) seulement : un Guid déjà importé dans le même contexte n’est ni recréé ni réécrit, un même Guid venu d’un autre contexte crée une observation distincte, un sujet absent ne clôt rien, un objet cité inconnu reste une référence ; points de vue non repris (avertissement) ; entrées compressées refusées (message).",
    entites: [
      { entite: "Topic", couverture: "partielle", detail: "Titre et description en note d’origine ; catégorie et gravité reprises seulement dans le vocabulaire décidé ; Guid et contexte conservés comme références BCF." },
      { entite: "Viewpoints, Components", couverture: "absente", detail: "Non repris, signalés en avertissement." },
    ],
    controle: "Tests du modèle (plan d’import : homonymes, reconnus, absents) ; recette studio-pub.mjs (import servi par l’API, même Guid dans un autre contexte).",
    route: `POST ${ROUTE_VARIANTE}/observations/bcf`,
    preuves: {
      code: [p(`${M}echanges/bcf-observations.ts`, "studioPlanImportBcf"), p(`${API}lib/studio-observations-bcf.ts`, "importerObservationsBcf")],
      tests: [p(`${M}echanges/bcf-observations.test.ts`, "IF-010 [−] même BCF-ID reçu dans un autre contexte")],
      routes: [p(`${API}routes/studio-observations.ts`, "${base}/bcf")],
      interfaces: [p(`${WEB}observations/PanneauObservations.tsx`, "data-studio-bcf-importer")],
    },
    sources: [S_PLAN, S_LISTE("E.6-04"), src("docs/ai-team/reports/mission-004/A1/studio-141-fiches-v2.json", "Cas négatif « Même BCF-ID »")],
  },
];

interface Report { id: string; format: string; versionFormat: string; sens: readonly StudioSensEchange[]; famille: StudioFamilleEchange; objet: string; taches: readonly StudioTacheEchange[]; raison: string; sources: readonly StudioSourceEchange[]; limite?: string }
const RAISON_SANS_CONTRAT = "Aucun contrat, aucune preuve ni décision Studio : format reporté, inscrit au périmètre sans être livré ; aucune conformité déclarée.";
const LIMITE_REPORT = "Non livré ; aucune conformité évaluée.";

/** Formats reportés (E.6-04, E.6-05) : un sens par entrée. Aucune n'est « renoncée » faute de décision Studio. */
const REPORTS: readonly Report[] = [
  {
    id: "dwg", format: "DWG", versionFormat: "non évaluée", sens: ["import", "export"], famille: "dessin", objet: "Dessin 2D", taches: ["E.6-04", "E.6-05"],
    raison: "Non livré, déclaré : la décision approuvée D-179 (maître d’ouvrage, 8 octobre 2026) renonce au DWG — libredwg (GPL) lit mal les versions récentes et imposerait un service séparé, l’ODA SDK (commercial) ne se justifie que devant un besoin client réel ; Studio ne la contourne pas : DXF et IFC restent ses formats d’échange, et la décision se reprend si un client l’exige, avec son coût.",
    sources: [S_D179, S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "dgn", format: "DGN", versionFormat: "non évaluée", sens: ["import", "export"], famille: "dessin", objet: "Dessin 2D", taches: ["E.6-04", "E.6-05"],
    raison: `${RAISON_SANS_CONTRAT} D-179 renonce au DGN (aucun besoin exprimé, format propriétaire, aucune bibliothèque libre admissible).`,
    sources: [S_PLAN, S_LISTE("E.6-04"), S_D179],
  },
  {
    id: "step", format: "STEP (ISO 10303-21, AP203 / AP214 / AP242)", versionFormat: "non évaluée", sens: ["import"], famille: "maquette", objet: "Solides exacts (brep)", taches: ["E.6-04", "E.6-05"],
    raison: "Lecture non livrée : un solide exact de studio-document/1 est le résultat d’un booléen dont les deux opérandes sont conservés ; un solide lu d’un fichier STEP n’a pas d’opérandes et n’a pas de place dans le document. L’export STEP est livré (maquette-step).",
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "obj", format: "OBJ (Wavefront)", versionFormat: "non évaluée", sens: ["import"], famille: "maquette", objet: "Maillage 3D", taches: ["E.6-04", "E.6-05"],
    raison: "Lecture non livrée : studio-document/1 n’a pas de maillage libre ; un maillage lu n’aurait pas d’équivalent natif. L’export OBJ est livré (maquette-obj).",
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "stl", format: "STL", versionFormat: "non évaluée (ASCII / binaire)", sens: ["import"], famille: "maquette", objet: "Maillage 3D", taches: ["E.6-04", "E.6-05"],
    raison: "Lecture non livrée : un fichier STL ne porte ni identité ni unité, et studio-document/1 n’a pas de maillage libre pour le recevoir. L’export STL ASCII est livré (maquette-stl).",
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "gltf", format: "glTF", versionFormat: "non évaluée (2.0)", sens: ["export"], famille: "maquette", objet: "Maillage 3D et apparences d’affichage", taches: ["E.6-04", "E.6-05"],
    raison: `${RAISON_SANS_CONTRAT} Aucun écrivain glTF.`,
    sources: [S_PLAN, S_LISTE("E.6-04")],
  },
  {
    id: "ifc-autres-versions", format: "IFC", versionFormat: "IFC2X3, IFC4", sens: ["export"], famille: "maquette", objet: "Document d’une révision", taches: ["E.6-05"],
    raison: `${RAISON_SANS_CONTRAT} Seul IFC4X3_ADD2 est écrit.`,
    sources: [S_PLAN, S_LISTE("E.6-05")],
  },
  {
    id: "dxf-autres-versions", format: "DXF ASCII", versionFormat: "AC1015 (2000) et suivantes", sens: ["export"], famille: "dessin", objet: "Document d’une révision", taches: ["E.6-05"],
    raison: `${RAISON_SANS_CONTRAT} Seul R12 (AC1009) est écrit ; les fichiers récents sont lus à l’import.`,
    sources: [S_PLAN, S_LISTE("E.6-05")],
  },
  {
    id: "dxf-binaire", format: "DXF binaire", versionFormat: "non évaluée", sens: ["import"], famille: "dessin", objet: "Plan 2D", taches: ["E.6-05"],
    raison: "Refusé à l’import avec un message (« enregistrez le fichier en DXF ASCII ») ; aucun lecteur binaire.",
    sources: [S_LISTE("E.6-05"), src(`${M}import-dxf.ts`, "Refus du DXF binaire")],
  },
  {
    id: "svg-lecture", format: "SVG", versionFormat: "non évaluée", sens: ["import"], famille: "dessin", objet: "Dessin 2D", taches: ["E.6-05"],
    raison: `${RAISON_SANS_CONTRAT} Aucun lecteur SVG.`,
    sources: [S_PLAN, S_LISTE("E.6-05")],
  },
  {
    id: "pdf-lecture", format: "PDF", versionFormat: "non évaluée", sens: ["import"], famille: "dessin", objet: "Fond de plan", taches: ["E.6-05"],
    raison: `${RAISON_SANS_CONTRAT} Aucun lecteur PDF.`,
    sources: [S_PLAN, S_LISTE("E.6-05")],
  },
  {
    id: "nuage-points", format: "Nuage de points (LAS, E57, LAZ)", versionFormat: "non évaluée", sens: ["import"], famille: "maquette", objet: "Relevé", taches: ["E.6-04", "E.6-05"],
    raison: `${RAISON_SANS_CONTRAT} La lecture LAS / XYZ / PTS de l’Atelier (P2-7) n’est pas un échange Studio.`,
    sources: [S_PLAN, S_LISTE("E.6-04"), S_FRONTIERE],
  },
];

const deReport = (r: Report): StudioEntreeEchange[] => r.sens.map((sens) => ({
  id: `${r.id}-${sens}`, format: r.format, versionFormat: r.versionFormat, sens, famille: r.famille, objet: r.objet, taches: r.taches,
  statut: "non-livre" as const, limite: r.limite ?? LIMITE_REPORT, entites: [], raison: r.raison, sources: r.sources,
}));

function geler<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) geler(x); }
  return v;
}

export interface StudioMatriceEchanges {
  schema: typeof STUDIO_MATRICE_ECHANGES_SCHEMA;
  revision: number;
  etablieLe: string;
  /** Rappel : aucune entrée n'est une déclaration de conformité. */
  conformite: "non-evaluee";
  entrees: readonly StudioEntreeEchange[];
}

export const STUDIO_MATRICE_ECHANGES: StudioMatriceEchanges = geler({
  schema: STUDIO_MATRICE_ECHANGES_SCHEMA, revision: STUDIO_MATRICE_ECHANGES_REVISION, etablieLe: STUDIO_MATRICE_ECHANGES_DATE, conformite: "non-evaluee",
  entrees: [...LIVREES, ...REPORTS.flatMap(deReport)],
});

// ——— Capacités par sens d'échange (EX-079, TR-EX-079) ———

/**
 * Les cinq sens d'échange évalués séparément (EX-079, REF-02 : « lecture, consultation, édition, export, aller-retour
 * sont évalués séparément ») :
 * - **lecture** : Studio lit le fichier (import, réception) ;
 * - **consultation** : ce qui est lu se montre sans entrer dans la variante (aperçu, modèle reçu, liste) ;
 * - **édition** : ce qui est lu devient modifiable dans Studio (objets natifs par commandes, observations, profil) ;
 * - **export** : Studio écrit le fichier ;
 * - **aller-retour** : un fichier exporté par Studio, relu par le lecteur de Studio, rend le contenu exporté — prouvé par
 *   un test qui fait les deux ; un export seul, même valide, ne le prouve jamais.
 */
export const STUDIO_SENS_CAPACITE = Object.freeze(["lecture", "consultation", "edition", "export", "aller-retour"] as const);
export type StudioSensCapacite = (typeof STUDIO_SENS_CAPACITE)[number];

export interface StudioEvaluationSens {
  statut: "livre" | "non-livre";
  /** Ce qui est fait (livré) ou pourquoi rien ne l'est (non livré), dit en clair ; jamais une conformité. */
  detail: string;
  /** Consultation, édition, aller-retour livrés : le ou les tests qui le contrôlent (motif présent dans le fichier). */
  preuves?: readonly StudioPreuveEchange[];
}

export interface StudioCapacitesFormat {
  id: string;
  format: string;
  /** Entrées de la matrice que ce format rassemble (chaque entrée appartient à un seul format). */
  entrees: readonly string[];
  sens: Readonly<Record<StudioSensCapacite, StudioEvaluationSens>>;
}

const livre = (detail: string, ...preuves: StudioPreuveEchange[]): StudioEvaluationSens => (preuves.length ? { statut: "livre", detail, preuves } : { statut: "livre", detail });
const nonLivre = (detail: string): StudioEvaluationSens => ({ statut: "non-livre", detail });
const EXPORT_SEUL = "Studio ne relit pas ce format : export seulement.";
const SANS_LECTEUR = "Aucun lecteur dans Studio.";
const AR_SANS_LECTEUR = "Sans lecteur, aucun fichier exporté n’est relu par Studio : un export valide ne prouve aucun aller-retour.";
const exportSeul = (id: string, format: string, entrees: readonly string[], exportDetail: string): StudioCapacitesFormat => ({
  id, format, entrees,
  sens: { lecture: nonLivre(EXPORT_SEUL), consultation: nonLivre(EXPORT_SEUL), edition: nonLivre(EXPORT_SEUL), export: livre(exportDetail), "aller-retour": nonLivre(AR_SANS_LECTEUR) },
});
const nonLivreTous = (id: string, format: string, entrees: readonly string[], raison: string): StudioCapacitesFormat => ({
  id, format, entrees,
  sens: { lecture: nonLivre(raison), consultation: nonLivre(raison), edition: nonLivre(raison), export: nonLivre(raison), "aller-retour": nonLivre(raison) },
});

/** Capacités par format et par sens (EX-079) : chaque entrée de la matrice est rangée sous un format. */
export const STUDIO_CAPACITES_PAR_SENS: readonly StudioCapacitesFormat[] = geler([
  {
    id: "commandes", format: "Enveloppe de commandes Studio (studio-commands/1)", entrees: ["natif-commandes"],
    sens: {
      lecture: livre("Enveloppe relue et revalidée commande par commande par le serveur."),
      consultation: nonLivre("Une enveloppe reçue est appliquée ou refusée en bloc : aucun aperçu de son contenu sans l’appliquer."),
      edition: livre("Les commandes sont la seule écriture du document : ce qu’elles créent est natif et modifiable.", p(`${E2E}studio-persistance.mjs`, "const replay = await owner('POST', `${variantPath(s)}/commands`, envelope)")),
      export: nonLivre("Studio n’écrit pas d’enveloppe dans un fichier ; l’historique d’une révision se lit par l’API (revisions/:revisionId/changes)."),
      "aller-retour": nonLivre("Sans export de fichier, aucun aller-retour."),
    },
  },
  {
    id: "archive", format: "Archive de projet, section Studio (fadi-studio-archive/1)", entrees: ["natif-archive-export", "natif-archive-import"],
    sens: {
      lecture: livre("Manifeste et empreintes contrôlés, section restaurée dans un nouveau projet."),
      consultation: nonLivre("Une archive est contrôlée puis restaurée : aucune consultation de son contenu sans restauration."),
      edition: livre("Le projet restauré reçoit de nouvelles révisions sur la tête restaurée.", p(`${E2E}studio-restauration.mjs`, "check('B : nouvelle révision possible après restauration (parent = tête restaurée)'")),
      export: livre("Section signée, empreintes de contenu conservées."),
      "aller-retour": livre("Archive exportée de A puis restaurée dans une base neuve B : documents de révision identiques octet pour octet, outil de comparaison sans anomalie.", p(`${E2E}studio-restauration.mjs`, "check(`documents de révision identiques (variante")),
    },
  },
  exportSeul("file-locale", "File locale hors ligne (fadi-studio-file-locale/1)", ["natif-file-locale"], "Copie de secours d’une file locale non synchronisée."),
  {
    id: "profil-outils", format: "Profil d’outils Studio (fadi-studio-profil/1)", entrees: ["natif-profil-outils-export", "natif-profil-outils-import"],
    sens: {
      lecture: livre("Profil relu et contrôlé : outils du registre, droits, conflits de raccourcis."),
      consultation: nonLivre("Le profil reçu est contrôlé puis importé : aucun aperçu de son contenu avant l’import."),
      edition: livre("Le profil importé devient celui du compte, qui le modifie ensuite comme le sien (version + 1, provenance gardée).", p(`${API}routes/studio-profils-import.test.ts`, "import par un autre compte : le compte importateur devient propriétaire")),
      export: livre("Profil du compte, sans donnée de projet ni droit."),
      "aller-retour": livre("Profil exporté par un compte puis importé par un autre : ordre, raccourcis, favoris, liste personnelle et regroupements relus à l’identique.", p(`${API}routes/studio-profils-import.test.ts`, "EX-079 aller-retour : profil exporté par un compte puis importé par un autre")),
    },
  },
  {
    id: "svg", format: "SVG", entrees: ["dessin-svg", "feuille-svg", "feuille-composee-svg", "svg-lecture-import"],
    sens: { lecture: nonLivre(SANS_LECTEUR), consultation: nonLivre(SANS_LECTEUR), edition: nonLivre(SANS_LECTEUR), export: livre("Plan 2D, feuille et feuille composée d’une révision."), "aller-retour": nonLivre(AR_SANS_LECTEUR) },
  },
  {
    id: "dxf", format: "DXF ASCII", entrees: ["dessin-dxf", "dessin-dxf-import", "dxf-autres-versions-export", "dxf-binaire-import"],
    sens: {
      lecture: livre("R12 et suivantes, unité lue dans $INSUNITS ou choisie ; DXF binaire refusé."),
      consultation: livre("Aperçu de l’import avant tout ajout : unité, objets pris, entités non prises comptées par type.", p(`${WEB}import/import-dxf.test.ts`, "rapport d'un DXF en millimètres : unité du fichier, 4 objets dont 1 cercle, rien de non pris")),
      edition: livre("Les objets lus sont ajoutés au brouillon par des commandes : natifs, modifiables comme les autres ; le reste n’est pas importé ou devient non natif.", p(`${WEB}import/import-dxf.test.ts`, "un import DXF de 1 200 lignes part en 3 enveloppes conformes à l'API")),
      export: livre("R12 (AC1009) seulement."),
      "aller-retour": livre("Partiel : lignes, rectangles et calques (masqué, verrouillé) exportés puis relus à l’identique ; les cotes reviennent en lignes, leurs textes ne sont pas repris.", p(`${M}import-dxf.test.ts`, "lignes, rectangles, calques (masqué, verrouillé) relus à l'identique")),
    },
  },
  {
    id: "ifc", format: "IFC (STEP physique)", entrees: ["maquette-ifc", "maquette-ifc-import", "modele-externe-ifc", "ifc-autres-versions-export"],
    sens: {
      lecture: livre("IFC2X3, IFC4, IFC4X1 à IFC4X3 ; unité lue, jamais supposée ; pertes comptées."),
      consultation: livre("Modèle d’un partenaire reçu, relu par le serveur dans un document à part et comparé à la révision courante, sans modifier la variante.", p(`${E2E}studio-echanges.mjs`, "check(\"Modèle externe : recevoir et accepter ne modifient pas la variante\"")),
      edition: livre("Partielle : murs, ouvertures et extrusions verticales deviennent des objets natifs modifiables ; le reste est conservé non natif, non modifiable.", p(`${E2E}studio-echanges.mjs`, "check(\"Importer IFC : enregistré par le serveur")),
      export: livre("IFC4X3_ADD2 des éléments 3D."),
      "aller-retour": livre("Partiel : murs (justification comprise), ouvertures et leurs types déclarés exportés puis relus à l’identique ; le reste revient non natif.", p(`${M}import-ifc/import-ifc.test.ts`, "murs (justification comprise), ouvertures et leurs types déclarés reviennent à l'identique")),
    },
  },
  {
    id: "obj", format: "OBJ (Wavefront)", entrees: ["maquette-obj", "obj-import"],
    sens: { lecture: nonLivre("Aucun lecteur OBJ : studio-document/1 n’a pas de maillage libre."), consultation: nonLivre(SANS_LECTEUR), edition: nonLivre(SANS_LECTEUR), export: livre("Maillage nommé de la vue 3D d’une révision."), "aller-retour": nonLivre(AR_SANS_LECTEUR) },
  },
  {
    id: "stl", format: "STL", entrees: ["maquette-stl", "stl-import"],
    sens: { lecture: nonLivre("Aucun lecteur STL : ni identité ni unité dans le fichier, aucun maillage libre dans le document."), consultation: nonLivre(SANS_LECTEUR), edition: nonLivre(SANS_LECTEUR), export: livre("Facettes des solides d’une révision (ASCII)."), "aller-retour": nonLivre(AR_SANS_LECTEUR) },
  },
  {
    id: "step", format: "STEP (ISO 10303-21)", entrees: ["maquette-step", "step-import"],
    sens: {
      lecture: nonLivre("Aucun lecteur STEP dans Studio : un solide exact du document est un booléen avec ses opérandes ; un solide lu n’en a pas."),
      consultation: nonLivre(SANS_LECTEUR), edition: nonLivre(SANS_LECTEUR),
      export: livre("Solides exacts nommés d’une révision (AP214, noyau exact du serveur)."),
      "aller-retour": nonLivre("La relecture du STEP exporté par le noyau exact contrôle l’export (noms, volumes, unité) ; Studio n’ayant pas de lecteur STEP, ce n’est pas un aller-retour."),
    },
  },
  {
    id: "pdf", format: "PDF", entrees: ["feuille-pdf", "feuille-composee-pdf", "dossier-pdf", "pdf-lecture-import"],
    sens: { lecture: nonLivre(SANS_LECTEUR), consultation: nonLivre(SANS_LECTEUR), edition: nonLivre(SANS_LECTEUR), export: livre("Feuille, feuille composée et dossier de conception."), "aller-retour": nonLivre(AR_SANS_LECTEUR) },
  },
  exportSeul("json-rapports", "JSON en lecture seule (dossier, rapport de fidélité, provenance, relevé de performances)", ["dossier-json", "rapport-fidelite-json", "provenance-sources-json", "provenance-modele-externe-json", "diagnostic-releve-perf"], "Données décrites par leur schéma versionné."),
  exportSeul("csv", "CSV", ["tableau-metre-csv"], "Tableau du métré d’une révision."),
  exportSeul("png", "PNG", ["rendu-png", "illustration-png"], "Rendu et illustration, avec leur bloc de provenance."),
  exportSeul("paquet", "Paquet de publication", ["paquet-publication"], "Fichiers figés d’une publication diffusée, identifiés par SHA-256."),
  {
    id: "bcf", format: "BCF (.bcfzip)", entrees: ["bcf-export", "bcf-import"],
    sens: {
      lecture: livre("Contrat 2.1 minimal ; reconnaissance par (Guid, contexte)."),
      consultation: livre("Les sujets reçus se lisent comme des observations distinctes de la variante, la note d’origine gardée, avec leurs références BCF.", p(`${E2E}studio-pub.mjs`, "porte son identité et ses références BCF")),
      edition: livre("Un sujet nouveau devient une observation de Studio, suivie par le flux des observations ; un objet cité inconnu reste une référence.", p(`${M}echanges/bcf-observations.test.ts`, "IF-010 [+] import : sujets nouveaux créés, objets inconnus conservés comme références")),
      export: livre("Sujets et commentaires des observations."),
      "aller-retour": livre("Export relu à l’identique (Guid stable, catégorie, gravité, statut, objets, commentaires) ; réimporté par l’API dans le même contexte, il est reconnu sans rien recréer.", p(`${M}echanges/bcf-observations.test.ts`, "IF-010 [+] export BCF 2.1 relu à l'identique"), p(`${E2E}studio-pub.mjs`, "même BCF-ID, même contexte → reconnu, rien recréé ni réécrit")),
    },
  },
  nonLivreTous("dwg", "DWG", ["dwg-import", "dwg-export"], "Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md), que Studio ne contourne pas."),
  nonLivreTous("dgn", "DGN", ["dgn-import", "dgn-export"], "Non livré, déclaré : décision approuvée D-179 (docs/atelier/decisions.md)."),
  nonLivreTous("gltf", "glTF", ["gltf-export"], "Aucun écrivain ni lecteur glTF."),
  nonLivreTous("nuage-points", "Nuage de points (LAS, E57, LAZ)", ["nuage-points-import"], "Aucun lecteur de nuage de points dans Studio."),
]);

/**
 * Cohérence des capacités par sens avec la matrice (vide = valide) : chaque entrée rangée sous un seul format ; lecture
 * et export livrés exactement quand une entrée d'import ou d'export de ce format est livrée ; consultation, édition et
 * aller-retour livrés seulement avec la lecture livrée et un test cité ; aller-retour livré seulement avec l'export livré
 * aussi (un export seul ne prouve jamais un aller-retour) ; toute évaluation dite en clair, sans conformité.
 */
export function controlerCapacitesParSens(m: StudioMatriceEchanges = STUDIO_MATRICE_ECHANGES, capacites: readonly StudioCapacitesFormat[] = STUDIO_CAPACITES_PAR_SENS): string[] {
  const pbs: string[] = [];
  const vues = new Map<string, string>();
  const parId = new Map(m.entrees.map((e) => [e.id, e]));
  for (const c of capacites) {
    for (const id of c.entrees) {
      if (!parId.has(id)) pbs.push(`${c.id} : entrée inconnue ${id}`);
      if (vues.has(id)) pbs.push(`${id} : rangée sous ${vues.get(id)} et ${c.id}`);
      vues.set(id, c.id);
    }
    const entrees = c.entrees.map((id) => parId.get(id)).filter((e): e is StudioEntreeEchange => !!e);
    const lu = entrees.some((e) => e.sens === "import" && e.statut === "livre");
    const ecrit = entrees.some((e) => e.sens === "export" && e.statut === "livre");
    const s = c.sens;
    if ((s.lecture.statut === "livre") !== lu) pbs.push(`${c.id} : lecture ${s.lecture.statut} alors qu’une entrée d’import livrée ${lu ? "existe" : "manque"}`);
    if ((s.export.statut === "livre") !== ecrit) pbs.push(`${c.id} : export ${s.export.statut} alors qu’une entrée d’export livrée ${ecrit ? "existe" : "manque"}`);
    for (const sens of ["consultation", "edition", "aller-retour"] as const) {
      const ev = s[sens];
      if (ev.statut !== "livre") continue;
      if (!lu) pbs.push(`${c.id} : ${sens} livré sans lecture livrée`);
      if (!ev.preuves?.length) pbs.push(`${c.id} : ${sens} livré sans test cité`);
    }
    if (s["aller-retour"].statut === "livre" && !ecrit) pbs.push(`${c.id} : aller-retour livré sans export livré`);
    for (const sens of STUDIO_SENS_CAPACITE) {
      const ev = s[sens];
      if (!ev.detail.trim()) pbs.push(`${c.id} : ${sens} sans détail`);
      if (ev.statut === "non-livre" && ev.preuves?.length) pbs.push(`${c.id} : ${sens} non livré avec des preuves`);
      if (studioDeclareConformite(ev.detail) || studioDeclareConformite(c.format)) pbs.push(`${c.id} : ${sens} déclare une conformité`);
    }
  }
  for (const e of m.entrees) if (!vues.has(e.id)) pbs.push(`${e.id} : rangée sous aucun format`);
  return pbs;
}

const LIBELLE_SENS_CAPACITE: Readonly<Record<StudioSensCapacite, string>> = Object.freeze({ lecture: "Lecture", consultation: "Consultation", edition: "Édition", export: "Export", "aller-retour": "Aller-retour" });

/** Ligne de couverture par type d'un export SVG, DXF ou IFC (dérivée de `STUDIO_COUVERTURE_EXPORT`). */
export interface StudioCouvertureType {
  categorie: Categorie;
  type: string;
  raisons: readonly { raison: StudioRaisonFidelite; statut: StudioStatutFidelite }[];
}

export function studioCouvertureFormat(format: StudioFormatEchange): StudioCouvertureType[] {
  const table = STUDIO_COUVERTURE_EXPORT[format] as unknown as Record<Categorie, Record<string, readonly StudioRaisonFidelite[]>>;
  return (Object.keys(table) as Categorie[]).flatMap((categorie) => Object.entries(table[categorie]).map(([type, raisons]) => ({
    categorie, type, raisons: raisons.map((raison) => ({ raison, statut: STUDIO_STATUT_DE_RAISON[raison] })),
  })));
}

/** Mots qui déclarent une conformité, une certification ou une homologation (français et anglais). */
const MOT_CONFORMITE = /(?<!\p{L})(?:conform|certifi|compliant|compliance|homologu)\p{L}*/giu;
/** Négation admise : un mot entier qui précède **immédiatement** le mot de conformité. */
const NEGATION_AVANT = /(?:^|[^\p{L}])(?:non|jamais|ni|aucun|aucune|not|never|no)\s+$/iu;

/**
 * Le texte déclare-t-il une conformité ? Chaque proposition (séparée par . ; : , ! ? —, parenthèse ou saut de ligne)
 * est jugée séparément ; un mot de conformité n'y est toléré que précédé immédiatement d'une négation
 * (« aucune conformité », « jamais certifié »). « Conformité garantie », « conforme à … », « Compliant » : déclarés.
 */
export function studioDeclareConformite(texte: string): boolean {
  for (const proposition of texte.split(/[.;:,!?\n()—]+/u)) {
    for (const m of proposition.matchAll(MOT_CONFORMITE)) {
      if (!NEGATION_AVANT.test(proposition.slice(0, m.index))) return true;
    }
  }
  return false;
}

/** Tous les champs texte d'une entrée (hors identifiants et preuves) : ce que le contrôle de conformité relit. */
export function studioTextesEntree(e: StudioEntreeEchange): string[] {
  return [
    e.format, e.versionFormat, e.objet, e.limite, e.controle ?? "", e.raison ?? "", e.route ?? "", e.decision ?? "",
    ...e.entites.flatMap((x) => [x.entite, x.detail]),
    ...(e.ecritureIfc ? [...e.ecritureIfc.elements.flatMap((x) => [...x.entites, x.detail]), ...e.ecritureIfc.jeuxDeProprietes.flatMap((x) => [x.nom, x.detail])] : []),
    ...e.sources.flatMap((s) => [s.reference, s.commentaire ?? ""]),
  ].filter((s) => s !== "");
}

/** Problèmes de cohérence interne de la matrice (vide = valide) ; le test du dépôt vérifie en plus les preuves. */
export function controlerMatriceEchanges(m: StudioMatriceEchanges = STUDIO_MATRICE_ECHANGES): string[] {
  const pbs: string[] = [];
  const ids = new Set<string>();
  for (const e of m.entrees) {
    if (ids.has(e.id)) pbs.push(`identifiant en double : ${e.id}`);
    ids.add(e.id);
    if (!e.limite.trim()) pbs.push(`${e.id} : limite absente`);
    if (e.sources.length === 0 || e.sources.some((s) => !s.reference.trim())) pbs.push(`${e.id} : source absente`);
    // Aucun champ texte ne déclare une conformité ni une certification (seulement leur absence).
    if (studioTextesEntree(e).some(studioDeclareConformite)) pbs.push(`${e.id} : conformité déclarée`);
    if (e.statut === "livre") {
      if (!e.preuves || e.preuves.code.length === 0 || e.preuves.tests.length === 0) pbs.push(`${e.id} : entrée livrée sans code ou sans test`);
      if (e.raison) pbs.push(`${e.id} : entrée livrée avec une raison de report`);
      if (!e.fidelite && e.entites.length === 0) pbs.push(`${e.id} : entrée livrée sans entité`);
      if (e.fidelite && e.entites.length > 0) pbs.push(`${e.id} : entités déclarées en plus du rapport de fidélité`);
    } else {
      if (!e.raison?.trim()) pbs.push(`${e.id} : report sans raison`);
      if (e.preuves) pbs.push(`${e.id} : report avec des preuves de livraison`);
      if (e.fidelite) pbs.push(`${e.id} : report lié à un rapport de fidélité`);
      if (!e.taches.some((t) => t === "E.6-04" || t === "E.6-05")) pbs.push(`${e.id} : report hors E.6-04 / E.6-05`);
    }
    if (e.export3d && !(e.statut === "livre" && e.sens === "export" && !e.fidelite && e.entites.length > 0)) pbs.push(`${e.id} : export 3D hors d’une entrée d’export livrée avec ses entités`);
    if ((e.fidelite === "ifc" && e.statut === "livre") !== !!e.ecritureIfc) pbs.push(`${e.id} : entités IFC écrites déclarées hors de l’export IFC, ou absentes de lui`);
    // Renoncé : seule une décision Studio admise vaut (une décision d'un autre chantier, D-179 par exemple, ne vaut pas).
    if (e.statut === "renonce" && !(e.decision && STUDIO_DECISIONS_RENONCEMENT.includes(e.decision))) pbs.push(`${e.id} : renoncé sans décision Studio admise`);
  }
  for (const f of ["svg", "dxf", "ifc"] as const) {
    const n = m.entrees.filter((e) => e.fidelite === f && e.statut === "livre" && e.sens === "export").length;
    if (n !== 1) pbs.push(`format ${f} : ${n} entrée(s) d'export liée(s) au rapport de fidélité (1 attendue)`);
  }
  for (const f of ["obj", "stl", "step"] as const) {
    const n = m.entrees.filter((e) => e.export3d === f).length;
    if (n !== 1) pbs.push(`format ${f} : ${n} entrée(s) d'export 3D (1 attendue)`);
  }
  for (const r of STUDIO_RAISONS_FIDELITE) if (!(r in STUDIO_STATUT_DE_RAISON)) pbs.push(`raison sans statut : ${r}`);
  return pbs;
}

const LIBELLE_STATUT: Readonly<Record<StudioStatutEchange, string>> = Object.freeze({ livre: "livré", "non-livre": "non livré", renonce: "renoncé" });
const LIBELLE_COUVERTURE: Readonly<Record<StudioCouvertureEntite, string>> = Object.freeze({ portee: "portée", partielle: "partielle", absente: "absente" });
const cellule = (s: string): string => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
/** Source en Markdown : référence entre accents graves, commentaire à la suite. */
const sourceMd = (s: StudioSourceEchange): string => (s.commentaire ? `\`${s.reference}\` — ${s.commentaire}` : `\`${s.reference}\``);

/** Document Markdown généré depuis la matrice (copie lisible, jamais éditée à la main). */
export function studioMatriceEchangesMarkdown(m: StudioMatriceEchanges = STUDIO_MATRICE_ECHANGES): string {
  const l: string[] = [];
  l.push("# Matrice d’échanges de Studio", "");
  l.push(`<!-- Généré depuis packages/atelier-model/src/studio/echanges/matrice-echanges.ts (${m.schema}, révision ${m.revision}) : ne pas éditer à la main. -->`, "");
  l.push(`Établie le ${m.etablieLe} (révision ${m.revision}, schéma \`${m.schema}\`), à partir de l’audit des exporteurs et importeurs Studio. Lots E.6-01 à E.6-05 du plan d’implémentation Studio V1.0 (§5.7).`, "");
  l.push("**Aucune entrée n’est une déclaration de conformité** : « livré » dit ce que le code écrit ou lit et le contrôle qui le vérifie ; la conformité d’un format reste non évaluée. Un format reporté est inscrit « non livré » avec sa raison et sa source ; « renoncé » exige une décision Studio admise (aucune aujourd’hui).", "");
  const nb = (s: StudioStatutEchange) => m.entrees.filter((e) => e.statut === s).length;
  l.push(`Entrées : ${m.entrees.length} — livrées : ${nb("livre")}, non livrées : ${nb("non-livre")}, renoncées : ${nb("renonce")}.`, "");
  l.push("## Formats × sens", "");
  l.push("| Identifiant | Format | Version du format | Sens | Famille | Objet | Statut | Tâches | Limite de couverture |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const e of m.entrees) {
    l.push(`| \`${e.id}\` | ${cellule(e.format)} | ${cellule(e.versionFormat)} | ${e.sens} | ${e.famille} | ${cellule(e.objet)} | ${LIBELLE_STATUT[e.statut]} | ${e.taches.join(", ")} | ${cellule(e.limite)} |`);
  }
  l.push("", "## Entrées livrées : entités, contrôles et preuves", "");
  for (const e of m.entrees.filter((x) => x.statut === "livre")) {
    l.push(`### \`${e.id}\` — ${e.format} (${e.sens})`, "");
    l.push(`- Version : ${e.versionFormat}`, `- Objet : ${e.objet}`, `- Limite : ${e.limite}`);
    if (e.route) l.push(`- Route : \`${e.route}\``);
    if (e.controle) l.push(`- Contrôle : ${e.controle}`);
    if (e.fidelite) l.push(`- Couverture par entité : rapport de fidélité \`${e.fidelite}\` (tableau ci-dessous).`);
    for (const x of e.entites) l.push(`- Entité ${x.entite} : ${LIBELLE_COUVERTURE[x.couverture]} — ${x.detail}`);
    if (e.ecritureIfc) {
      for (const x of e.ecritureIfc.elements) l.push(`- Entités IFC écrites ${x.entites.map((n) => `\`${n}\``).join(", ")} : ${x.detail}`);
      for (const x of e.ecritureIfc.jeuxDeProprietes) l.push(`- Jeu de propriétés \`${x.nom}\` : ${x.detail}`);
    }
    const pr = e.preuves!;
    const liste = (titre: string, xs: readonly StudioPreuveEchange[] | undefined) => { if (xs?.length) l.push(`- ${titre} : ${xs.map((x) => `\`${x.fichier}\` (\`\` ${x.motif} \`\`)`).join(" ; ")}`); };
    liste("Code", pr.code); liste("Tests", pr.tests); liste("Routes", pr.routes); liste("Interface", pr.interfaces);
    l.push(`- Sources : ${e.sources.map(sourceMd).join(" ; ")}`, "");
  }
  l.push("## Sous-ensemble SVG / DXF / IFC retenu (E.6-03) : couverture par type", "");
  l.push("Raisons possibles du rapport de fidélité (`studioRapportFidelite`) pour chaque type d’élément du document ; statut entre parenthèses.", "");
  l.push("| Catégorie | Type | SVG | DXF R12 | IFC4X3_ADD2 |", "| --- | --- | --- | --- | --- |");
  const parFormat = Object.fromEntries((["svg", "dxf", "ifc"] as const).map((f) => [f, new Map(studioCouvertureFormat(f).map((c) => [`${c.categorie}.${c.type}`, c]))]));
  for (const c of studioCouvertureFormat("svg")) {
    const cle = `${c.categorie}.${c.type}`;
    const cel = (f: StudioFormatEchange) => parFormat[f]!.get(cle)!.raisons.map((r) => `\`${r.raison}\` (${r.statut})`).join(", ");
    l.push(`| ${c.categorie} | ${c.type} | ${cel("svg")} | ${cel("dxf")} | ${cel("ifc")} |`);
  }
  l.push("", "## Capacités par sens d’échange (EX-079)", "");
  l.push("Lecture, consultation, édition, export et aller-retour évalués séparément pour chaque format. Un aller-retour n’est livré qu’avec la lecture et l’export livrés et un test qui relit l’export par le lecteur de Studio : un export seul, même valide, ne le prouve jamais.", "");
  l.push(`| Format | ${STUDIO_SENS_CAPACITE.map((x) => LIBELLE_SENS_CAPACITE[x]).join(" | ")} |`, `| --- |${STUDIO_SENS_CAPACITE.map(() => " --- |").join("")}`);
  for (const c of STUDIO_CAPACITES_PAR_SENS) {
    l.push(`| ${cellule(c.format)} | ${STUDIO_SENS_CAPACITE.map((x) => `${c.sens[x].statut === "livre" ? "livré" : "non livré"} — ${cellule(c.sens[x].detail)}${c.sens[x].preuves?.length ? ` (${c.sens[x].preuves!.map((y) => `\`${y.fichier}\``).join(", ")})` : ""}`).join(" | ")} |`);
  }
  l.push("", "## Formats reportés (E.6-04, E.6-05)", "");
  l.push("| Identifiant | Format | Sens | Statut | Raison | Sources |", "| --- | --- | --- | --- | --- | --- |");
  for (const e of m.entrees.filter((x) => x.statut !== "livre")) {
    l.push(`| \`${e.id}\` | ${cellule(e.format)} | ${e.sens} | ${LIBELLE_STATUT[e.statut]} | ${cellule(e.raison ?? "")} | ${cellule(e.sources.map(sourceMd).join(" ; "))} |`);
  }
  l.push("");
  return l.join("\n");
}
