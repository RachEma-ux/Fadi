import { STUDIO_LIMITS, validateStudioDocument, type StudioDocument, type StudioLayer, type StudioShape } from "../document-2d.js";
import type { StudioDimension } from "../objets/cote.js";
import type { StudioAnnotation } from "../objets/formes.js";
import type { StudioArchitectureItem } from "../architecture/types.js";
import type { StudioSolid } from "../objets-3d/solides.js";
import type { StudioSolideExact } from "../objets-3d/exacts.js";
import type { StudioGraphisme } from "../graphismes/graphismes.js";
import type { StudioOccurrence } from "../batiment/composants.js";
import { AVERTISSEMENT_CORPUS, GRAINES_CORPUS, LICENCE_CORPUS, type CorpusStudio, type CouvertureCorpus, type SceneCorpus } from "./types.js";

/** Une primitive du corpus et le champ du document qui la range. */
export type Primitive =
  | { champ: "objects"; valeur: StudioShape }
  | { champ: "dimensions"; valeur: StudioDimension }
  | { champ: "annotations"; valeur: StudioAnnotation }
  | { champ: "architecture"; valeur: StudioArchitectureItem }
  | { champ: "solides"; valeur: StudioSolid }
  | { champ: "graphismes"; valeur: StudioGraphisme }
  | { champ: "exacts"; valeur: StudioSolideExact }
  /** Lot W3-B : occurrence d'un composant 3D (sa définition est commune au feuillet, `communs`). */
  | { champ: "occurrences"; valeur: StudioOccurrence };

export const objet = (valeur: StudioShape): Primitive => ({ champ: "objects", valeur });
export const cote = (valeur: StudioDimension): Primitive => ({ champ: "dimensions", valeur });
export const annotation = (valeur: StudioAnnotation): Primitive => ({ champ: "annotations", valeur });
export const architecture = (valeur: StudioArchitectureItem): Primitive => ({ champ: "architecture", valeur });
export const solide = (valeur: StudioSolid): Primitive => ({ champ: "solides", valeur });
export const graphisme = (valeur: StudioGraphisme): Primitive => ({ champ: "graphismes", valeur });
export const exact = (valeur: StudioSolideExact): Primitive => ({ champ: "exacts", valeur });
export const occurrence = (valeur: StudioOccurrence): Primitive => ({ champ: "occurrences", valeur });

/** Calque synthétique visible et déverrouillé. */
export const calque = (id: string, name: string): StudioLayer => ({ id, name, visible: true, locked: false });

export interface DefinitionCorpus {
  scene: SceneCorpus;
  definition: string;
  taille: number;
  /** Primitives par motif. */
  motif: number;
  couverture: CouvertureCorpus;
  /** Calques déclarés (chaque feuillet ne garde que ceux qu'il emploie, dans cet ordre). */
  calques: readonly StudioLayer[];
  /** Primitive `role` (0 ≤ role < motif) du motif `j`, dans un ordre où toute référence précède ce qui la vise. */
  primitive: (j: number, role: number) => Primitive;
  /** Extensions d'un feuillet assemblé (sources déclarées…), calculées sur le feuillet lui-même ; absentes : aucune. */
  completer?: (feuillet: StudioDocument) => Partial<Pick<StudioDocument, "sources">>;
  /**
   * Éléments communs d'un feuillet (lot W3-B : niveaux et définitions de composants), calculés sur ses primitives avant
   * validation ; ce ne sont pas des primitives (comme les calques). Absent : aucun.
   */
  communs?: (primitives: readonly Primitive[]) => Partial<Pick<StudioDocument, "niveaux" | "composants">>;
}

/** Nombre de motifs entamés pour `taille` primitives. */
export const nombreMotifs = (taille: number, motif: number): number => Math.ceil(taille / motif);
/** Côté de la grille carrée qui range `n` motifs. */
export const coteGrille = (n: number): number => Math.max(1, Math.ceil(Math.sqrt(n)));
/** Primitives par feuillet : le plus grand multiple du motif sous la borne d'un document. */
export const primitivesParFeuillet = (motif: number): number => Math.floor(STUDIO_LIMITS.objects / motif) * motif;

function calqueDe(p: Primitive): string | undefined {
  return "layerId" in p.valeur ? p.valeur.layerId : undefined;
}

/**
 * Assemble exactement `taille` primitives (le dernier motif peut être entamé), réparties en feuillets d'au plus
 * `STUDIO_LIMITS.objects` primitives sans couper un motif, chacun validé par le modèle (forme canonique ; un générateur
 * fautif échoue ici, jamais en silence).
 */
export function construireCorpus(d: DefinitionCorpus): CorpusStudio {
  if (!Number.isInteger(d.taille) || d.taille < 1) throw new RangeError("taille entière positive attendue");
  const parFeuillet = primitivesParFeuillet(d.motif);
  const documents: StudioDocument[] = [];
  for (let debut = 0, f = 1; debut < d.taille; debut += parFeuillet, f++) {
    const fin = Math.min(d.taille, debut + parFeuillet);
    const champs = { objects: [] as StudioShape[], dimensions: [] as StudioDimension[], annotations: [] as StudioAnnotation[], architecture: [] as StudioArchitectureItem[], solides: [] as StudioSolid[], graphismes: [] as StudioGraphisme[], exacts: [] as StudioSolideExact[], occurrences: [] as StudioOccurrence[] };
    const employes = new Set<string>();
    const poses: Primitive[] = [];
    for (let k = debut; k < fin; k++) {
      const p = primitive(d, k);
      poses.push(p);
      (champs[p.champ] as unknown[]).push(p.valeur);
      const c = calqueDe(p);
      if (c !== undefined) employes.add(c);
    }
    const layers = d.calques.filter((l) => employes.has(l.id));
    const feuillet: StudioDocument = {
      id: `${d.scene.toLowerCase()}-${d.taille}-f${f}`, schemaVersion: "studio-document/1", units: "m", frame: "local-2d",
      objects: champs.objects,
      ...(layers.length ? { layers } : {}),
      ...(champs.dimensions.length ? { dimensions: champs.dimensions } : {}),
      ...(champs.solides.length ? { solides: champs.solides } : {}),
      ...(champs.exacts.length ? { exacts: champs.exacts } : {}),
      ...(champs.annotations.length ? { annotations: champs.annotations } : {}),
      ...(champs.architecture.length ? { architecture: champs.architecture } : {}),
      ...(champs.graphismes.length ? { graphismes: champs.graphismes } : {}),
      ...(d.communs?.(poses) ?? {}),
      ...(champs.occurrences.length ? { occurrences: champs.occurrences } : {}),
    };
    documents.push(validateStudioDocument({ ...feuillet, ...(d.completer?.(validateStudioDocument(feuillet)) ?? {}) }));
  }
  return {
    scene: d.scene, definition: d.definition, taille: d.taille, graine: GRAINES_CORPUS[d.scene], synthetique: true,
    licence: LICENCE_CORPUS, avertissement: AVERTISSEMENT_CORPUS, motif: d.motif, documents, couverture: d.couverture,
  };
}

function primitive(d: DefinitionCorpus, k: number): Primitive {
  return d.primitive(Math.floor(k / d.motif), k % d.motif);
}

/** Primitives d'un document : objets, cotes, annotations, architecture, solides, solides exacts, graphismes et occurrences (lot W3-B). */
export const primitivesDuDocument = (doc: StudioDocument): number =>
  doc.objects.length + (doc.dimensions?.length ?? 0) + (doc.annotations?.length ?? 0) + (doc.architecture?.length ?? 0) + (doc.solides?.length ?? 0) + (doc.exacts?.length ?? 0) + (doc.graphismes?.length ?? 0) + (doc.occurrences?.length ?? 0);

/** Toutes les primitives d'un corpus, dans l'ordre des feuillets. */
export function primitivesDu(corpus: CorpusStudio): number {
  let n = 0;
  for (const doc of corpus.documents) n += primitivesDuDocument(doc);
  return n;
}
