/**
 * Définitions des domaines, planches et modes d'affichage de Studio, sans dépendance (pas même le registre) : lues par
 * la barre latérale de Fadi (menu « Studio », `routes/AppShell.tsx`) sans charger Studio, et réexportées par
 * `domaines.ts`. Noms, numéros et responsabilités : Définition officielle de référence V2.1 (REF-01 §02), contrôlés par
 * `domaines.test.ts`. Pur : ni React ni DOM.
 */

export type DomaineStudio = "dessin" | "bim" | "visualisation" | "documentation";
/** Les deux planches de « Dessin et modélisation » (REF-01 §02). */
export type PlancheStudio = "2d" | "3d";
/**
 * Mode d'affichage des planches dans « Dessin et modélisation » : une planche, ou les deux côte à côte (« Double vue »).
 * La Double vue n'est pas une troisième planche : elle montre la Planche 2D et la Planche 3D en même temps.
 */
export type ModePlanche = PlancheStudio | "double";

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

/**
 * Extensions PROPOSÉES (hors références, ADR-STUDIO-NAV-01) : désactivables ici sans rien casser. `doubleVue` : la
 * Planche 2D et la Planche 3D côte à côte ; désactivée, le mode disparaît du sélecteur et `planche=double` redevient une
 * adresse non reconnue.
 */
export const EXTENSIONS_PROPOSEES: Readonly<{ doubleVue: boolean }> = Object.freeze({ doubleVue: true });

/** Modes d'affichage des planches (navigation, pas commandes) : libellé court du sélecteur et libellé long d'état. */
export const MODES_PLANCHE: readonly { readonly id: ModePlanche; readonly courtFR: string; readonly libelleFR: string; readonly extension?: true }[] = Object.freeze([
  { id: "2d" as const, courtFR: "2D", libelleFR: "Planche 2D" },
  { id: "3d" as const, courtFR: "3D", libelleFR: "Planche 3D" },
  ...(EXTENSIONS_PROPOSEES.doubleVue ? [{ id: "double" as const, courtFR: "Double vue", libelleFR: "Double vue", extension: true as const }] : []),
]);

export const estDomaineStudio = (v: string): v is DomaineStudio => DOMAINES_STUDIO.some((d) => d.id === v);
export const estPlancheStudio = (v: string): v is PlancheStudio => PLANCHES_STUDIO.some((p) => p.id === v);
export const estModePlanche = (v: string): v is ModePlanche => MODES_PLANCHE.some((m) => m.id === v);
export const definitionDomaine = (id: DomaineStudio): DefinitionDomaine => DOMAINES_STUDIO.find((d) => d.id === id)!;
/** Libellé « 01 · Dessin et modélisation » (format de la Définition, REF-01 §02). */
export const libelleNumeroteDomaine = (d: DefinitionDomaine): string => `${d.numero} · ${d.libelleFR}`;
/**
 * Domaine affiché pour une adresse de variante : celui de `domaine`, sinon « Documentation, métrés et collaboration »
 * quand l'adresse ouvre les commentaires (lien de notification, dont le panneau appartient à ce domaine), sinon Dessin et
 * modélisation (toutes les adresses antérieures). Lu par l'espace et par le menu « Studio » de la barre latérale.
 */
export const domaineDeLAdresse = (domaine: DomaineStudio | null, commentaires: boolean): DomaineStudio =>
  domaine ?? (commentaires ? "documentation" : DOMAINE_PAR_DEFAUT);
/** Le mode montre-t-il la Planche 2D, la Planche 3D ? */
export const montre2d = (m: ModePlanche): boolean => m !== "3d";
export const montre3d = (m: ModePlanche): boolean => m !== "2d";
