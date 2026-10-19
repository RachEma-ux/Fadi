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
import type { StudioToolGroup } from "@parcours/atelier-model";
import { COMMANDES_EDITEUR, type CibleRaccourci, type IdCommandeEditeur } from "../planche2d/raccourcis";

export type DomaineStudio = "dessin" | "bim" | "visualisation" | "documentation";
export type PlancheStudio = "2d" | "3d";

export interface DefinitionDomaine {
  readonly id: DomaineStudio;
  /** Numéro d'ordre de REF-01 (« 01 » à « 04 »). */
  readonly numero: string;
  /** Nom exact du domaine (REF-01 §02). */
  readonly libelleFR: string;
  /** Responsabilité exacte du domaine (REF-01 §02). */
  readonly responsabiliteFR: string;
}

/** REF-01 §02, dans l'ordre de la référence. */
export const DOMAINES_STUDIO: readonly DefinitionDomaine[] = Object.freeze([
  { id: "dessin", numero: "01", libelleFR: "Dessin et modélisation", responsabiliteFR: "Concevoir et modifier dans Planche 2D ⇄ Planche 3D." },
  { id: "bim", numero: "02", libelleFR: "BIM et coordination", responsabiliteFR: "Structurer les informations et contrôler la cohérence des modèles." },
  { id: "visualisation", numero: "03", libelleFR: "Visualisation, rendu et immersion", responsabiliteFR: "Examiner et présenter les solutions architecturales." },
  { id: "documentation", numero: "04", libelleFR: "Documentation, métrés et collaboration", responsabiliteFR: "Produire les documents, quantités, observations, revues et publications." },
]);

/** Le domaine du profil standard ouvert par défaut : celui des planches. */
export const DOMAINE_PAR_DEFAUT: DomaineStudio = "dessin";
/** La planche ouverte par défaut (comportement antérieur à I.4 : la planche 2D). */
export const PLANCHE_PAR_DEFAUT: PlancheStudio = "2d";

/** Les deux planches (REF-01 §02) et leur seul domaine (NAV-005). */
export const PLANCHES_STUDIO: readonly { readonly id: PlancheStudio; readonly libelleFR: string; readonly domaine: DomaineStudio }[] = Object.freeze([
  { id: "2d", libelleFR: "Planche 2D", domaine: "dessin" },
  { id: "3d", libelleFR: "Planche 3D", domaine: "dessin" },
]);

export const estDomaineStudio = (v: string): v is DomaineStudio => DOMAINES_STUDIO.some((d) => d.id === v);
export const estPlancheStudio = (v: string): v is PlancheStudio => PLANCHES_STUDIO.some((p) => p.id === v);
export const definitionDomaine = (id: DomaineStudio): DefinitionDomaine => DOMAINES_STUDIO.find((d) => d.id === id)!;

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
  "accrochage-intersection": "dessin", "accrochage-perpendiculaire": "dessin", "accrochage-tangente": "dessin", "accrochage-proche": "dessin",
  "reperage-orthogonal": "dessin", "reperage-polaire": "dessin", "pas-polaire": "dessin",
  "exporter-png": A_DEFINIR, "importer-dxf": A_DEFINIR, "exporter-svg": A_DEFINIR, "exporter-dxf": A_DEFINIR, "exporter-ifc": A_DEFINIR, echanges: A_DEFINIR,
  feuille: "documentation", dossier: "documentation",
  outils: A_DEFINIR, palette: A_DEFINIR,
  exigences: "bim",
} as const satisfies Record<IdCommandeEditeur, DomaineAttribue>);

/**
 * Domaine des outils du registre, par leur famille (`StudioToolGroup`) ; `satisfies` impose une entrée par famille.
 * Dessin, modification, calques, volume, volume libre et architecture : Dessin et modélisation. Propriétés déclarées
 * (« structurer les informations ») : BIM et coordination. Scènes et apparence : Visualisation, rendu et immersion.
 */
export const DOMAINES_FAMILLES_OUTILS = Object.freeze({
  dessin: "dessin", modification: "dessin", calques: "dessin", volume: "dessin", "volume-libre": "dessin", architecture: "dessin",
  proprietes: "bim", visualisation: "visualisation",
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
