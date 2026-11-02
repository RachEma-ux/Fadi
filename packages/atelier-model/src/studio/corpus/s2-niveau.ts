import { exportStudioDxf } from "../export.js";
import { studioSha256 } from "../empreinte-sha256.js";
import type { StudioDocument } from "../document-2d.js";
import type { StudioSourceExterne } from "../sources/sources.js";
import { aleaMotif } from "./alea.js";
import { annotation, architecture, calque, construireCorpus, cote, coteGrille, nombreMotifs, objet, type Primitive } from "./commun.js";
import { GRAINES_CORPUS, type CorpusStudio, type CouvertureCorpus, type SceneCorpus } from "./types.js";

/**
 * S2 — plan de niveau (X.1-02). REF-02 §18.2 : « plan de niveau avec murs, portes, fenêtres, croisements et références
 * liées ». Motif de 8 primitives par cellule d'une grille de 6 m : mur horizontal et mur vertical (ils se rejoignent aux
 * nœuds de la grille, par leurs extrémités seulement — aucun croisement à mi-portée), une porte dans le mur horizontal, une fenêtre dans le mur vertical, deux
 * lignes d'axe (références) qui traversent les murs, une cote **liée** à l'axe horizontal, un texte de pièce. S2 seul
 * ajoute un neuvième rôle : un mur **traversant** de 2 m qui croise le mur vertical en cours de portée (croisement de
 * murs ; le modèle ne calcule aucune jonction : chaque mur garde son volume, déclaré), et chaque feuillet de S2 déclare
 * sa **référence externe** : les axes viennent d'un fond DXF synthétique écrit par l'export Studio (`exportStudioDxf`),
 * dont la provenance (empreinte SHA-256 réelle du fichier, version, unité, objets) est portée par `sources` (EX-014).
 *
 * Toutes les dimensions sont synthétiques et saisies ici (aucune valeur par défaut ni normative) ; le premier motif
 * reproduit le cas REC-A-03 : mur de 6 × 0,2 × 3 m (3,600 m³ brut), porte de 1 × 2,1 m (0,420 m³ déduit), 3,180 m³ net.
 */

/** Motif du plan de niveau partagé par S6 et S7 (sans croisement ni référence externe). */
export const MOTIF_PLAN = 8;
/** Motif de S2 : le plan et un mur traversant. */
export const MOTIF_S2 = 9;
export const DEFINITION_S2 = "Scène S2 : plan de niveau avec murs, portes, fenêtres, croisements et références liées.";

/** Dimensions nominales (mètres) : les seules entrées des oracles. */
export const PARAMETRES_S2 = Object.freeze({
  maille: 6, epaisseur: 0.2, hauteurMur: 3,
  porte: { largeur: 1, hauteur: 2.1, allege: 0 },
  fenetre: { largeur: 0.6, hauteur: 0.7, allege: 1.2, position: 2.5 },
  /** Mur traversant (S2) : 2 m centré sur le mur vertical, à 4,5 m de son départ (hors de la fenêtre). */
  traversant: { longueur: 2, ordonnee: 4.5 },
});
/** Fond de référence DXF de S2 (synthétique, généré) : nom, horodatage de réception fixe (rien n'est tiré de l'horloge). */
export const REFERENCE_S2 = Object.freeze({ nomFichier: "s2-axes-synthetiques.dxf", recuLe: "2026-10-26T00:00:00.000Z", auteur: "Corpus synthétique Fadi (généré par le dépôt)", restrictions: "Corpus de qualification synthétique : usage dans le dépôt Fadi (corpus/LICENCE.md)" });

/** Fond DXF des axes d'un feuillet : document des seules lignes du calque « axes », écrit par l'export DXF de Studio. */
export function fondAxesS2(feuillet: StudioDocument): { dxf: string; objets: number } {
  const axes = feuillet.objects.filter((o) => o.layerId === "axes");
  const calques = (feuillet.layers ?? []).filter((l) => l.id === "axes");
  return { dxf: exportStudioDxf({ id: `${feuillet.id}-axes`, schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: axes, ...(calques.length ? { layers: calques } : {}) }), objets: axes.length };
}

function referenceS2(feuillet: StudioDocument): Partial<Pick<StudioDocument, "sources">> {
  const { dxf, objets } = fondAxesS2(feuillet);
  if (!objets) return {};
  const source: StudioSourceExterne = {
    id: `${feuillet.id}-reference-axes`, type: "source", format: "dxf", versionFormat: "AC1009", nomFichier: REFERENCE_S2.nomFichier, empreinteSha256: studioSha256(dxf),
    recuLe: REFERENCE_S2.recuLe, auteur: REFERENCE_S2.auteur, uniteLue: "m", uniteRetenue: "m", facteur: 1, repereSource: null, transformation: "identite",
    restrictions: REFERENCE_S2.restrictions, objets,
  };
  return { sources: [source] };
}
/** Position de la porte le long du mur horizontal du motif `j` (tirée parmi trois, sans effet sur les quantités). */
const POSITIONS_PORTE = [1, 2, 3] as const;

/** Couverture du plan de niveau S2 (REF-02 §18.2) : ce que le plan représente et ce qu'il déclare absent. */
export const COUVERTURE_S2: CouvertureCorpus = Object.freeze({
  representes: [
    "murs", "portes et fenêtres (ouvertures déclarées)", "croisements d'axes avec les murs", "rencontres de murs aux nœuds de la grille (extrémités)", "références liées : cotes liées aux axes",
    "croisements de murs en cours de portée : un mur traversant par motif",
    "référence externe déclarée : axes venus d'un fond DXF synthétique, provenance portée par sources (empreinte SHA-256 du fichier, version, unité, objets)",
  ],
  absents: [
    { element: "jonctions calculées aux croisements de murs", raison: "le modèle ne calcule aucune jonction au croisement : chaque mur garde son volume (mur droit à deux points : longueur × épaisseur × hauteur), le volume commun est compté dans les deux murs" },
    { element: "modèle lié dans le document", raison: "un modèle d'un partenaire est reçu et comparé à part (modèles externes, recette studio-echanges.mjs), jamais rangé dans studio-document/1" },
  ],
}) as CouvertureCorpus;

/** S2, S6 et S7 partagent ce plan (graine et préfixe propres) ; chaque scène déclare sa propre couverture. */
export function planDeNiveau(scene: SceneCorpus, definition: string, taille: number, couverture: CouvertureCorpus = COUVERTURE_S2, croisements = false): CorpusStudio {
  const motif = croisements ? MOTIF_S2 : MOTIF_PLAN;
  const P = PARAMETRES_S2, motifs = nombreMotifs(taille, motif), cols = coteGrille(motifs), pre = scene.toLowerCase();
  const primitive = (j: number, role: number): Primitive => {
    const x = (j % cols) * P.maille, y = Math.floor(j / cols) * P.maille, id = (s: string) => `${pre}-${j}-${s}`;
    const mur = (s: string, fin: { x: number; y: number }, debut: { x: number; y: number } = { x, y }) => architecture({
      id: id(s), type: "wall", layerId: "murs", axis: [debut, fin], thickness: P.epaisseur, height: P.hauteurMur, base: 0, justification: "center",
    });
    const m = P.maille / 2;
    switch (role) {
      case 0: return mur("mur-h", { x: x + P.maille, y });
      case 1: return mur("mur-v", { x, y: y + P.maille });
      case 2: return architecture({
        id: id("porte"), type: "opening", hostId: id("mur-h"), position: POSITIONS_PORTE[aleaMotif(GRAINES_CORPUS[scene], j).entier(3)]!,
        width: P.porte.largeur, height: P.porte.hauteur, sill: P.porte.allege, kind: "porte",
      });
      case 3: return architecture({
        id: id("fenetre"), type: "opening", hostId: id("mur-v"), position: P.fenetre.position, width: P.fenetre.largeur, height: P.fenetre.hauteur, sill: P.fenetre.allege, kind: "fenetre",
      });
      case 4: return objet({ id: id("axe-h"), type: "line", layerId: "axes", start: { x, y: y + m }, end: { x: x + P.maille, y: y + m } });
      case 5: return objet({ id: id("axe-v"), type: "line", layerId: "axes", start: { x: x + m, y }, end: { x: x + m, y: y + P.maille } });
      case 6: return cote({
        id: id("cote-axe"), type: "dimension", layerId: "cotes", start: { x, y: y + m }, end: { x: x + P.maille, y: y + m }, offset: 0.6,
        links: { start: { objectId: id("axe-h"), anchor: "start" }, end: { objectId: id("axe-h"), anchor: "end" } }, toResolve: false,
      });
      case 7: return annotation({ id: id("piece"), type: "text", layerId: "textes", position: { x: x + 0.5, y: y + 0.5 }, height: 0.25, rotation: 0, content: `Pièce synthétique ${j}`, justification: "left" });
      default: {
        const t = P.traversant;
        return mur("mur-traversant", { x: x + t.longueur / 2, y: y + t.ordonnee }, { x: x - t.longueur / 2, y: y + t.ordonnee });
      }
    }
  };
  return construireCorpus({
    scene, definition, taille, motif, primitive, ...(croisements ? { completer: referenceS2 } : {}),
    calques: [calque("murs", "Murs (synthétique)"), calque("axes", "Axes de référence (synthétique)"), calque("cotes", "Cotes (synthétique)"), calque("textes", "Textes (synthétique)")],
    couverture,
  });
}

export const corpusS2 = (taille: number): CorpusStudio => planDeNiveau("S2", DEFINITION_S2, taille, COUVERTURE_S2, true);
