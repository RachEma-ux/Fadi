/**
 * Traitements lourds de Studio exécutés hors du fil principal (`studio.worker.ts`), ou directement sans Worker : la
 * même fonction dans les deux cas, donc le même résultat.
 *
 * - `dxf.lire` : lecture d'un DXF par `lireDxf` (`import/import-dxf-ui.ts`, lecteur pur `lireDxfStudio`) ; la source
 *   est le fichier choisi (lu dans le Worker) ou son texte.
 * - `ifc.lire` : lecture d'un IFC par `lireIfc` (`import/import-ifc-ui.ts`, lecteur pur `lireIfcStudio`), même source.
 * - `feuille.composer` : composition de la feuille (`composerFeuilleStudio`), puis SVG et PDF.
 * - `maillage.3d` : maillage dérivé de la vue 3D (`studioMesh3d`), tâche de fond (D.1-01).
 * - `maillage.3d.objets` : morceaux du maillage des seuls objets invalidés (`studioMaillerObjets`, tous si `ids` est
 *   null), assemblés sur le fil principal avec le cache de la vue 3D (lot C.2).
 * - `quantites.calculer` : métré brut (`quantitesStudio`), tâche de fond (D.1-01).
 *
 * Pur : ni React ni DOM (seul `Blob.text()` est appelé, disponible dans un Worker).
 */
import {
  composerFeuilleStudio, quantitesStudio, studioMaillerObjets, studioMesh3d, studioSheetPdf, studioSheetSvg,
  type StudioDocument, type StudioDxfUnite, type StudioSheet, type StudioSheetOptions, type StudioTransformationDeclaree,
} from "@parcours/atelier-model";
import { lireDxf, type LectureDxf } from "../import/import-dxf-ui";
import { lireIfc, type LectureIfc } from "../import/import-ifc-ui";
import type { Progression } from "./hote-worker";
import type { Traitements } from "./protocole";

export const MESSAGE_LECTURE_IMPOSSIBLE = "Lecture du fichier impossible.";
export const MESSAGE_FEUILLE_IMPOSSIBLE = "La feuille n’a pas pu être composée avec ces réglages.";

export interface ChargeDxf {
  /** Fichier choisi (lu dans le Worker, sans copie du texte sur le fil principal) ou son texte. */
  source: Blob | string;
  document: StudioDocument;
  unite: StudioDxfUnite | null;
  /** Conserver les entités entières non prises comme éléments non natifs (lot F3) ; faux si absent. */
  conserverNonNatifs?: boolean;
}

export interface ChargeIfc {
  source: Blob | string;
  document: StudioDocument;
  /** Transformation déclarée (modèle partenaire) ; aucune si absente. */
  transformation?: StudioTransformationDeclaree | null;
}

/** Étapes annoncées pendant la lecture d'un DXF. */
export type EtapeDxf = "lecture" | "analyse";

export async function lireDxfSource(c: ChargeDxf, progresser: (p: Progression) => void = () => {}): Promise<LectureDxf> {
  progresser({ etape: "lecture" });
  let texte: string;
  try {
    texte = typeof c.source === "string" ? c.source : await c.source.text();
  } catch {
    return { erreur: MESSAGE_LECTURE_IMPOSSIBLE };
  }
  // Le lecteur pur est synchrone et ne rapporte pas d'avancement : l'étape est annoncée, sans pourcentage inventé.
  progresser({ etape: "analyse" });
  return lireDxf(texte, c.document, c.unite, c.conserverNonNatifs === true);
}

export async function lireIfcSource(c: ChargeIfc, progresser: (p: Progression) => void = () => {}): Promise<LectureIfc> {
  progresser({ etape: "lecture" });
  let texte: string;
  try {
    texte = typeof c.source === "string" ? c.source : await c.source.text();
  } catch {
    return { erreur: MESSAGE_LECTURE_IMPOSSIBLE };
  }
  progresser({ etape: "analyse" });
  return lireIfc(texte, c.document, c.transformation ?? null);
}

export interface ResultatFeuille {
  feuille: StudioSheet | null;
  svg: string | null;
  pdf: Uint8Array | null;
  erreur: string;
}

export function composerFeuille(document: StudioDocument, options: StudioSheetOptions): ResultatFeuille {
  try {
    const feuille = composerFeuilleStudio(document, options);
    return { feuille, svg: studioSheetSvg(feuille), pdf: studioSheetPdf(feuille), erreur: "" };
  } catch {
    return { feuille: null, svg: null, pdf: null, erreur: MESSAGE_FEUILLE_IMPOSSIBLE };
  }
}

export const TRAITEMENTS_STUDIO: Traitements = {
  "dxf.lire": { executer: (c: ChargeDxf, progresser) => lireDxfSource(c, progresser) },
  "ifc.lire": { executer: (c: ChargeIfc, progresser) => lireIfcSource(c, progresser) },
  "feuille.composer": {
    executer: (c: { document: StudioDocument; options: StudioSheetOptions }) => composerFeuille(c.document, c.options),
    transfert: (r: ResultatFeuille) => (r.pdf ? [r.pdf.buffer as ArrayBuffer] : []),
  },
  "maillage.3d": { executer: (c: { document: StudioDocument }) => studioMesh3d(c.document) },
  "maillage.3d.objets": { executer: (c: { document: StudioDocument; ids: string[] | null }) => studioMaillerObjets(c.document, c.ids) },
  "quantites.calculer": { executer: (c: { document: StudioDocument }) => quantitesStudio(c.document) },
};
