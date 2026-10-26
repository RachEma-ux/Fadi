/**
 * Domaines fonctionnels du Studio (I.4-01, I.4-02 ; NAV-005). Les quatre domaines, leur ordre, leur nom et leur
 * responsabilité sont ceux de la Définition officielle de référence du Studio V2.1 (REF-01), §02 « Organisation
 * fonctionnelle » (`Studio/Fadi_Studio_Definition_Officielle_Reference_V2_1.docx`, repris mot pour mot dans
 * `Studio/Fadi_Studio_Definition_V2_1_Mind_Map_Interactif.html`, contrôlé par `domaines.test.ts`) : ils ne sont ni
 * inventés ni renommés ici. « Le premier domaine contient deux planches de travail complètes : Planche 2D et
 * Planche 3D » (REF-01 §02) : les planches n'appartiennent qu'à « Dessin et modélisation » (Plan d'implémentation,
 * NAV-005). Les quatre domaines forment le profil standard (REF-01 §03) : une personnalisation ne change ni les
 * responsabilités, ni les droits, ni les données.
 *
 * Le rattachement des blocs (`FONCTIONS_STUDIO`), des commandes (`DOMAINES_COMMANDES`) et des outils
 * (`DOMAINES_FAMILLES_OUTILS`) à leur domaine suit la responsabilité citée ; c'est une lecture de la référence, pas une
 * nouvelle organisation. Quand la référence ne fixe pas le domaine, il est « à définir » (`A_DEFINIR`), jamais deviné.
 * La mise en page de l'espace d'une variante est dérivée de ces tables. Pur : ni React ni DOM.
 */
import { STUDIO_TOOLS, type StudioToolGroup } from "@parcours/atelier-model";
import { COMMANDES_EDITEUR, type CibleRaccourci, type IdCommandeEditeur } from "../planche2d/raccourcis";

export * from "./definitions";
import type { DomaineStudio } from "./definitions";

/** Domaine d'une fonction, d'une commande ou d'un outil : un des quatre domaines, ou « à définir » (REF-01 muet). */
export const A_DEFINIR = "a-definir" as const;
export type DomaineAttribue = DomaineStudio | typeof A_DEFINIR;

/**
 * Blocs de l'espace d'une variante et leur domaine, dans l'ordre d'affichage : **la mise en page lit cette table**
 * (`fonctionsDuDomaine`), chaque section ne rend que les blocs de son domaine. Planches (Planche 2D, Planche 3D),
 * barre d'outils, portée d'Annuler et liste des éléments : Dessin et modélisation (« concevoir et modifier dans
 * Planche 2D ⇄ Planche 3D ») ; exigences et écarts (« structurer les informations et contrôler la cohérence ») : BIM et
 * coordination ; aperçu des scènes et des rendus (« examiner et présenter ») : Visualisation, rendu et immersion ;
 * publications, commentaires et observations, révisions, métré (« documents, quantités, observations, revues et
 * publications ») : Documentation, métrés et collaboration.
 */
export const FONCTIONS_STUDIO = Object.freeze({
  outils: "dessin",
  planches: "dessin",
  "portee-annuler": "dessin",
  elements: "dessin",
  exigences: "bim",
  "scenes-rendus": "visualisation",
  publications: "documentation",
  "commentaires-observations": "documentation",
  revisions: "documentation",
  metre: "documentation",
} as const satisfies Record<string, DomaineStudio>);

export type FonctionStudio = keyof typeof FONCTIONS_STUDIO;

export const domaineDeFonction = (f: FonctionStudio): DomaineStudio => FONCTIONS_STUDIO[f];
/** Blocs d'un domaine, dans l'ordre de `FONCTIONS_STUDIO`. */
export const fonctionsDuDomaine = (d: DomaineStudio): FonctionStudio[] => (Object.keys(FONCTIONS_STUDIO) as FonctionStudio[]).filter((f) => FONCTIONS_STUDIO[f] === d);

/**
 * Domaine de chaque commande de l'éditeur (`COMMANDES_EDITEUR`) ; `satisfies` impose une entrée par commande. Édition,
 * vue (Vue 3D, navigation et coupe 3D comprises), accrochage et repérage agissent sur les planches : Dessin et
 * modélisation. « Feuille » et « Feuilles et dossier » produisent les documents : Documentation. « Exigences et écarts » :
 * BIM et coordination. **À définir** (REF-01 §02 ne les range dans aucun domaine ; question posée au maître d'ouvrage,
 * ADR-STUDIO-NAV-01 §1) : imports et exports (Importer DXF, Exporter SVG / DXF / IFC, Exporter le rendu PNG), Matrice
 * d'échanges, et le système d'outils commun aux domaines (Outils, Palette de commandes : REF-01 §03). Ces commandes
 * restent où elles sont aujourd'hui (barre d'outils des planches).
 */
export const DOMAINES_COMMANDES = Object.freeze({
  annuler: "dessin", retablir: "dessin", "annuler-trace": "dessin", enregistrer: "dessin", "tout-selectionner": "dessin",
  "terminer-polyligne": "dessin", "fermer-polyligne": "dessin",
  "zoom-avant": "dessin", "zoom-arriere": "dessin", cadrer: "dessin", "plein-ecran": "dessin", "vue-3d": "dessin", "navigation-3d": "dessin", "coupe-3d": "dessin",
  "accrochage-sommets": "dessin", "accrochage-grille": "dessin", "accrochage-milieu": "dessin", "accrochage-centre": "dessin", "accrochage-quadrant": "dessin",
  "accrochage-intersection": "dessin", "accrochage-perpendiculaire": "dessin", "accrochage-tangente": "dessin", "accrochage-parallele": "dessin", "accrochage-proche": "dessin", "accrochage-cible-suivante": "dessin",
  "reperage-orthogonal": "dessin", "reperage-polaire": "dessin", "pas-polaire": "dessin",
  "exporter-png": A_DEFINIR, "importer-dxf": A_DEFINIR, "importer-ifc": A_DEFINIR, "modeles-externes": A_DEFINIR, "exporter-svg": A_DEFINIR, "exporter-dxf": A_DEFINIR, "exporter-ifc": A_DEFINIR, "exporter-obj": A_DEFINIR, "exporter-stl": A_DEFINIR, "exporter-step": A_DEFINIR, echanges: A_DEFINIR,
  feuille: "documentation", dossier: "documentation",
  // AC-010 (lot G2) : l'approbation d'une publication (« revues et publications ») : Documentation.
  approuver: "documentation",
  outils: A_DEFINIR, palette: A_DEFINIR,
  // Lot F : l’illustration est un rendu (« examiner et présenter » : Visualisation) ; les agents proposent, la personne confirme
  // (« revues » : Documentation, métrés et collaboration).
  illustration: "visualisation", agents: "documentation",
  exigences: "bim",
  // Lot W3-D : la fusion de variantes porte sur l'étude et ses variantes, que REF-01 §02 ne range dans aucun domaine
  // (À définir, comme les échanges) ; ses boîtes s'ouvrent par-dessus le domaine affiché.
  "fusionner-variantes": A_DEFINIR, "annuler-fusion": A_DEFINIR,
} as const satisfies Record<IdCommandeEditeur, DomaineAttribue>);

/**
 * Domaine des outils du registre, par leur famille (`StudioToolGroup`) ; `satisfies` impose une entrée par famille.
 * Dessin, modification, calques, volume, volume libre et architecture : Dessin et modélisation. Propriétés déclarées
 * (« structurer les informations ») : BIM et coordination. Scènes et apparence : Visualisation, rendu et immersion.
 */
export const DOMAINES_FAMILLES_OUTILS = Object.freeze({
  dessin: "dessin", modification: "dessin", calques: "dessin", volume: "dessin", "volume-libre": "dessin", architecture: "dessin",
  proprietes: "bim", visualisation: "visualisation",
  // Éléments non natifs (lot F3) : la référence ne fixe pas leur domaine (comme l’import) : à définir.
  "non-natifs": A_DEFINIR,
  // Graphismes (EX-055) et système de projet (EX-023) : dessin 2D et repères du dessin, Dessin et modélisation.
  graphismes: "dessin", reperes: "dessin",
  // Sources importées (EX-014) : nées d'un import, comme lui à définir.
  sources: A_DEFINIR,
  // Blocs définis par l'utilisateur et contraintes géométriques (X.1-01) : dessin 2D, Dessin et modélisation.
  blocs: "dessin", contraintes: "dessin",
} as const satisfies Record<StudioToolGroup, DomaineAttribue>);

/** Domaine d'une entrée du catalogue (outil du registre ou commande de l'éditeur). */
export function domaineEntree(e: { readonly cible: CibleRaccourci; readonly outil: { readonly groupe: StudioToolGroup } | null }): DomaineAttribue {
  if (e.cible.type === "commande") return DOMAINES_COMMANDES[e.cible.id];
  return DOMAINES_FAMILLES_OUTILS[e.outil!.groupe];
}

/** Commandes d'un domaine, dans l'ordre de `COMMANDES_EDITEUR` (accès rendus dans la section du domaine). */
export const commandesDuDomaine = (d: DomaineStudio): IdCommandeEditeur[] => COMMANDES_EDITEUR.filter((c) => DOMAINES_COMMANDES[c.id] === d).map((c) => c.id);

/** Identifiant DOM de la section d'un domaine (cible des liens de la navigation des domaines). */
export const idSectionDomaine = (id: DomaineStudio): string => `studio-domaine-${id}`;

// ——— Espace de travail d'un domaine (un domaine affiché à la fois) ———

/**
 * Actions de l'espace, dans la barre du haut quel que soit le domaine : Annuler, Rétablir, Enregistrer, le Tool Manager
 * (« Outils ») et la palette (Ctrl+K). Elles quittent la palette d'outils (chaque commande n'est rendue qu'une fois) et
 * gardent leur icône et leur raccourci (règle d'or). Le système d'outils est commun aux quatre domaines (REF-01 §03).
 */
export const ACTIONS_ESPACE: readonly IdCommandeEditeur[] = Object.freeze(["annuler", "retablir", "enregistrer", "outils", "palette"]);

/**
 * Éléments montrés dans la palette de chaque domaine en plus des siens : la sélection et la vue du canevas (chaque
 * domaine travaille sur le même modèle et y désigne ses objets). Leur domaine de rattachement reste Dessin et
 * modélisation (`DOMAINES_COMMANDES`) : seule la palette les reprend.
 */
export const ELEMENTS_COMMUNS: ReadonlySet<string> = new Set([
  "studio.dessin.selection", "tout-selectionner", "zoom-avant", "zoom-arriere", "cadrer", "plein-ecran",
]);

/** Éléments d'un autre domaine repris dans la palette d'un domaine (examiner en 3D : orbite / plan, coupe). */
export const ELEMENTS_REPRIS: Readonly<Record<DomaineStudio, ReadonlySet<string>>> = Object.freeze({
  dessin: new Set<string>(),
  bim: new Set<string>(),
  visualisation: new Set<string>(["navigation-3d", "coupe-3d"]),
  documentation: new Set<string>(),
});

const OUTILS_PAR_ID = new Map(STUDIO_TOOLS.map((t) => [t.toolId as string, t]));
const ACTIONS = new Set<string>(ACTIONS_ESPACE);

/** Domaine d'un élément de la barre (outil du registre ou commande de l'éditeur). */
export function domaineElement(e: { readonly type: "outil" | "commande"; readonly id: string }): DomaineAttribue {
  if (e.type === "commande") return (DOMAINES_COMMANDES as Record<string, DomaineAttribue>)[e.id] ?? A_DEFINIR;
  const t = OUTILS_PAR_ID.get(e.id);
  return t ? DOMAINES_FAMILLES_OUTILS[t.groupe] : A_DEFINIR;
}

/**
 * Un élément figure-t-il dans la palette du domaine ? Ses propres outils et commandes, les éléments communs et repris,
 * et ceux dont le domaine reste « à définir » (imports, exports, matrice d'échanges : rangés nulle part par REF-01,
 * donc proposés partout) ; jamais les actions de l'espace (barre du haut).
 */
export function dansPaletteDuDomaine(e: { readonly type: "outil" | "commande"; readonly id: string }, d: DomaineStudio): boolean {
  if (ACTIONS.has(e.id)) return false;
  if (ELEMENTS_COMMUNS.has(e.id) || ELEMENTS_REPRIS[d].has(e.id)) return true;
  const de = domaineElement(e);
  return de === d || de === A_DEFINIR;
}

/**
 * Commandes qui s'exécutent sur place quel que soit le domaine (raccourci, palette) : Échap (annuler le tracé /
 * désélectionner), fin de polyligne, accrochages et repérages, boîtes Feuille et Feuilles et dossier. Elles ne changent jamais de domaine : appuyer sur Échap
 * ou sur une touche d'accrochage dans BIM ne doit pas ouvrir Dessin et modélisation.
 */
const SANS_BASCULE = (e: { readonly type: "outil" | "commande"; readonly id: string }): boolean =>
  e.type === "commande" && (e.id === "annuler-trace" || e.id === "terminer-polyligne" || e.id === "fermer-polyligne"
    || e.id.startsWith("accrochage-") || e.id.startsWith("reperage-") || e.id === "pas-polaire"
    // Boîtes de dialogue (Feuille, Feuilles et dossier) : ouvertes par-dessus le domaine affiché, qui ne change pas — le
    // focus revient à son origine à la fermeture (accessibilité).
    || e.id === "feuille" || e.id === "dossier" || e.id === "approuver" || e.id === "fusionner-variantes" || e.id === "annuler-fusion");

/**
 * Domaine où s'exécute un élément lancé depuis le domaine `actif` (raccourci, palette, Tool Manager) : le domaine actif
 * si l'élément est dans sa palette ou dans la barre de l'espace, sinon le domaine de l'élément, qui s'ouvre alors.
 */
export function domaineExecution(e: { readonly type: "outil" | "commande"; readonly id: string }, actif: DomaineStudio): DomaineStudio {
  if (ACTIONS.has(e.id) || dansPaletteDuDomaine(e, actif) || SANS_BASCULE(e)) return actif;
  const de = domaineElement(e);
  return de === A_DEFINIR ? actif : de;
}

/** Fonctions rendues en panneaux latéraux repliables (toutes sauf la palette, le canevas et la barre d'état). */
const HORS_PANNEAUX: ReadonlySet<FonctionStudio> = new Set<FonctionStudio>(["outils", "planches", "portee-annuler"]);
/** Panneaux latéraux d'un domaine, dans l'ordre de `FONCTIONS_STUDIO`. */
export const panneauxDuDomaine = (d: DomaineStudio): FonctionStudio[] => fonctionsDuDomaine(d).filter((f) => !HORS_PANNEAUX.has(f));
