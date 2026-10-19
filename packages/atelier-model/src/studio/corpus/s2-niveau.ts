import { aleaMotif } from "./alea.js";
import { annotation, architecture, calque, construireCorpus, cote, coteGrille, nombreMotifs, objet, type Primitive } from "./commun.js";
import { GRAINES_CORPUS, type CorpusStudio, type SceneCorpus } from "./types.js";

/**
 * S2 — plan de niveau (X.1-02). REF-02 §18.2 : « plan de niveau avec murs, portes, fenêtres, croisements et références
 * liées ». Motif de 8 primitives par cellule d'une grille de 6 m : mur horizontal et mur vertical (ils se croisent aux
 * nœuds de la grille et avec les murs voisins), une porte dans le mur horizontal, une fenêtre dans le mur vertical, deux
 * lignes d'axe (références) qui traversent les murs, une cote **liée** à l'axe horizontal, un texte de pièce.
 *
 * Toutes les dimensions sont synthétiques et saisies ici (aucune valeur par défaut ni normative) ; le premier motif
 * reproduit le cas REC-A-03 : mur de 6 × 0,2 × 3 m (3,600 m³ brut), porte de 1 × 2,1 m (0,420 m³ déduit), 3,180 m³ net.
 */

export const MOTIF_S2 = 8;
export const DEFINITION_S2 = "Scène S2 : plan de niveau avec murs, portes, fenêtres, croisements et références liées.";

/** Dimensions nominales (mètres) : les seules entrées des oracles. */
export const PARAMETRES_S2 = Object.freeze({
  maille: 6, epaisseur: 0.2, hauteurMur: 3,
  porte: { largeur: 1, hauteur: 2.1, allege: 0 },
  fenetre: { largeur: 0.6, hauteur: 0.7, allege: 1.2, position: 2.5 },
});
/** Position de la porte le long du mur horizontal du motif `j` (tirée parmi trois, sans effet sur les quantités). */
const POSITIONS_PORTE = [1, 2, 3] as const;

/** S2 et S7 partagent ce plan (S7 : graine et préfixe propres). */
export function planDeNiveau(scene: SceneCorpus, definition: string, taille: number): CorpusStudio {
  const P = PARAMETRES_S2, motifs = nombreMotifs(taille, MOTIF_S2), cols = coteGrille(motifs), pre = scene.toLowerCase();
  const primitive = (j: number, role: number): Primitive => {
    const x = (j % cols) * P.maille, y = Math.floor(j / cols) * P.maille, id = (s: string) => `${pre}-${j}-${s}`;
    const mur = (s: string, fin: { x: number; y: number }) => architecture({
      id: id(s), type: "wall", layerId: "murs", axis: [{ x, y }, fin], thickness: P.epaisseur, height: P.hauteurMur, base: 0, justification: "center",
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
      default: return annotation({ id: id("piece"), type: "text", layerId: "textes", position: { x: x + 0.5, y: y + 0.5 }, height: 0.25, rotation: 0, content: `Pièce synthétique ${j}`, justification: "left" });
    }
  };
  return construireCorpus({
    scene, definition, taille, motif: MOTIF_S2, primitive,
    calques: [calque("murs", "Murs (synthétique)"), calque("axes", "Axes de référence (synthétique)"), calque("cotes", "Cotes (synthétique)"), calque("textes", "Textes (synthétique)")],
    couverture: {
      representes: ["murs", "portes et fenêtres (ouvertures déclarées)", "croisements de murs et d'axes", "références liées : cotes liées aux axes"],
      absents: [{ element: "références externes (modèles liés)", raison: "studio-document/1 n'a pas de référence externe ; seules les cotes liées aux objets du document existent" }],
    },
  });
}

export const corpusS2 = (taille: number): CorpusStudio => planDeNiveau("S2", DEFINITION_S2, taille);
