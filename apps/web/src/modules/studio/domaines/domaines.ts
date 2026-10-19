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
 * Le rattachement des fonctions livrées de Studio à leur domaine (`FONCTIONS_STUDIO`) suit la responsabilité citée ;
 * c'est une lecture de la référence, pas une nouvelle organisation. Pur : ni React ni DOM.
 */

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

/**
 * Fonctions livrées de l'espace d'une variante et leur domaine. Planches, outils et propriétés de l'objet : Dessin et
 * modélisation ; exigences, écarts et propriétés BIM (« structurer les informations et contrôler la cohérence ») :
 * BIM et coordination ; scènes, apparence et rendus (« examiner et présenter ») : Visualisation, rendu et immersion ;
 * feuilles, dossiers, métré, commentaires, observations, révisions et publications (« documents, quantités,
 * observations, revues et publications ») : Documentation, métrés et collaboration.
 */
export const FONCTIONS_STUDIO = Object.freeze({
  "planche-2d": "dessin",
  "planche-3d": "dessin",
  outils: "dessin",
  elements: "dessin",
  exigences: "bim",
  scenes: "visualisation",
  rendus: "visualisation",
  feuilles: "documentation",
  dossiers: "documentation",
  metre: "documentation",
  commentaires: "documentation",
  observations: "documentation",
  revisions: "documentation",
  publications: "documentation",
} as const satisfies Record<string, DomaineStudio>);

export type FonctionStudio = keyof typeof FONCTIONS_STUDIO;

export const domaineDeFonction = (f: FonctionStudio): DomaineStudio => FONCTIONS_STUDIO[f];

/** Identifiant DOM de la section d'un domaine (cible des liens de la navigation des domaines). */
export const idSectionDomaine = (id: DomaineStudio): string => `studio-domaine-${id}`;
