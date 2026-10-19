import { aleaMotif, memoMotif } from "./alea.js";
import { calque, construireCorpus, objet, type Primitive } from "./commun.js";
import { GRAINES_CORPUS, type CorpusStudio } from "./types.js";

/**
 * S3 — plan dense (X.1-03). REF-02 §18.2 : « plan 2D très dense, entités superposées et intersections nombreuses ».
 * Toutes les primitives tombent dans un même carré de 100 m de côté, quelle que soit la taille : la densité croît avec
 * elle (≈ 1 primitive/100 m² à 100, 10/m² à 100 000). Motif de 4 primitives : ligne (direction tirée parmi douze
 * directions exactes 3-4-5 et axiales), rectangle, cercle, polyligne ouverte en équerre. Positions tirées au millimètre ;
 * longueurs et dimensions nominales ci-dessous (entrées des oracles), indépendantes des tirages.
 */

export const MOTIF_S3 = 4;
export const DEFINITION_S3 = "Scène S3 : plan 2D très dense, entités superposées et intersections nombreuses.";
export const COTE_CARRE_S3 = 100;

/** Directions unitaires exactes (axes et triangles 3-4-5) : la longueur d'une ligne ne dépend pas de la direction tirée. */
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1], [0.6, 0.8], [0.8, 0.6], [-0.6, 0.8], [-0.8, 0.6], [0.6, -0.8], [0.8, -0.6], [-0.6, -0.8], [-0.8, -0.6]] as const;

export function parametresS3(j: number) {
  return {
    longueurLigne: 0.5 + (j % 10) * 0.5,
    largeur: 0.2 + (j % 6) * 0.3,
    hauteur: 0.2 + (j % 4) * 0.4,
    rayon: 0.1 + (j % 5) * 0.2,
    /** Équerre : branche horizontale puis verticale. */
    brancheX: 0.5 + (j % 3) * 0.5,
    brancheY: 0.5 + (j % 7) * 0.25,
  };
}

export function corpusS3(taille: number): CorpusStudio {
  const tirage = memoMotif((j: number) => {
    const r = aleaMotif(GRAINES_CORPUS.S3, j), pt = () => ({ x: r.millimetres(COTE_CARRE_S3), y: r.millimetres(COTE_CARRE_S3) });
    return { a: pt(), b: pt(), c: pt(), d: pt(), direction: DIRECTIONS[r.entier(DIRECTIONS.length)]!, calque: r.entier(2) === 0 ? "trait-fin" : "trait-fort" };
  });
  const primitive = (j: number, role: number): Primitive => {
    const t = tirage(j), p = parametresS3(j), id = (s: string) => `s3-${j}-${s}`;
    switch (role) {
      case 0: return objet({ id: id("ligne"), type: "line", layerId: t.calque, start: t.a, end: { x: t.a.x + p.longueurLigne * t.direction[0], y: t.a.y + p.longueurLigne * t.direction[1] } });
      case 1: return objet({ id: id("rect"), type: "rectangle", layerId: t.calque, origin: t.b, width: p.largeur, height: p.hauteur });
      case 2: return objet({ id: id("cercle"), type: "circle", layerId: t.calque, center: t.c, radius: p.rayon });
      default: return objet({ id: id("equerre"), type: "polyline", layerId: t.calque, points: [t.d, { x: t.d.x + p.brancheX, y: t.d.y }, { x: t.d.x + p.brancheX, y: t.d.y + p.brancheY }], closed: false });
    }
  };
  return construireCorpus({
    scene: "S3", definition: DEFINITION_S3, taille, motif: MOTIF_S3, primitive,
    calques: [calque("trait-fin", "Trait fin (synthétique)"), calque("trait-fort", "Trait fort (synthétique)")],
    couverture: { representes: ["densité croissante sur une emprise fixe", "entités superposées", "intersections nombreuses (lignes, contours, cercles)"], absents: [] },
  });
}
