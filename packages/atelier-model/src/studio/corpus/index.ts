/**
 * Corpus de qualification Studio S1–S7 (X.1-01 à X.1-08, X.1-10) : générateurs déterministes, oracles numériques
 * indépendants, références visuelles (SVG et empreintes). Point d'entrée `@parcours/atelier-model/studio-corpus`, hors
 * de la façade publique du paquet (ce sont des outils d'essai, pas des fonctions du produit). Pur : ni React, ni DOM.
 */
import type { StudioDocument } from "../document-2d.js";
import { exportStudioSvg } from "../export.js";
import { studioMesh3d } from "../mesh-3d.js";
import { studioEmpreinteContenu } from "../projections.js";
import { studioSha256 } from "../empreinte-sha256.js";
import { corpusS1 } from "./s1-detail.js";
import { corpusS2 } from "./s2-niveau.js";
import { corpusS3 } from "./s3-dense.js";
import { corpusS4 } from "./s4-immeuble.js";
import { corpusS5 } from "./s5-libre.js";
import { corpusS7 } from "./s7-hors-reseau.js";
import type { CorpusStudio, SceneCorpus } from "./types.js";

export * from "./types.js";
export { primitivesDu, primitivesParFeuillet } from "./commun.js";
export { commandesDuDocument } from "./commandes.js";
export { aleaMotif, alea, type Alea } from "./alea.js";
export { corpusS1, DEFINITION_S1, MOTIF_S1 } from "./s1-detail.js";
export { corpusS2, DEFINITION_S2, MOTIF_S2, PARAMETRES_S2 } from "./s2-niveau.js";
export { corpusS3, DEFINITION_S3, MOTIF_S3 } from "./s3-dense.js";
export { corpusS4, DEFINITION_S4, MOTIF_S4 } from "./s4-immeuble.js";
export { corpusS5, DEFINITION_S5, MOTIF_S5 } from "./s5-libre.js";
export { DEFINITION_S6, planS6, type CleVarianteS6, type EtapeS6, type ExigenceS6, type PlanS6, type VarianteS6 } from "./s6-variantes.js";
export { corpusS7, DEFINITION_S7, SESSION_HORS_RESEAU_S7 } from "./s7-hors-reseau.js";
export * from "./oracles.js";

/** Scènes générées comme corpus de documents (S6 est un plan d'étude : `planS6`). */
export type SceneDocuments = Exclude<SceneCorpus, "S6">;
export const SCENES_DOCUMENTS: readonly SceneDocuments[] = Object.freeze(["S1", "S2", "S3", "S4", "S5", "S7"] as const);

const GENERATEURS: Readonly<Record<SceneDocuments, (taille: number) => CorpusStudio>> = Object.freeze({ S1: corpusS1, S2: corpusS2, S3: corpusS3, S4: corpusS4, S5: corpusS5, S7: corpusS7 });

export function genererCorpus(scene: SceneDocuments, taille: number): CorpusStudio {
  return GENERATEURS[scene](taille);
}

/** Empreinte SHA-256 d'un document (JSON canonique tel que validé). */
export const empreinteDocument = (doc: StudioDocument): string => studioSha256(JSON.stringify(doc));

/** Empreinte du corpus (REF-02 §18.2) : SHA-256 de la suite des empreintes de ses feuillets. */
export const empreinteCorpus = (corpus: CorpusStudio): string => studioSha256(corpus.documents.map(empreinteDocument).join("\n"));

export interface ReferenceVisuelle {
  /** SVG de référence de chaque feuillet (`exportStudioSvg`, options par défaut). */
  svg: string[];
  /** SHA-256 de chaque SVG. */
  empreintesSvg: string[];
  /** Empreinte de contenu du maillage 3D dérivé (`studioMesh3d`) de chaque feuillet : la référence des solides, que le SVG 2D ne trace pas. */
  empreintesMaillage: string[];
}

export function referenceVisuelle(corpus: CorpusStudio): ReferenceVisuelle {
  const svg = corpus.documents.map((d) => exportStudioSvg(d));
  return { svg, empreintesSvg: svg.map(studioSha256), empreintesMaillage: corpus.documents.map((d) => studioEmpreinteContenu(studioMesh3d(d))) };
}
