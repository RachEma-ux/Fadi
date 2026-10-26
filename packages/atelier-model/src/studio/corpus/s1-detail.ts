import { aleaMotif, memoMotif } from "./alea.js";
import { annotation, calque, construireCorpus, cote, coteGrille, graphisme, nombreMotifs, objet, type Primitive } from "./commun.js";
import { GRAINES_CORPUS, type CorpusStudio } from "./types.js";

/**
 * S1 — détail 2D (X.1-01). REF-02 §18.2 : « détail 2D isolé avec cotes, textes, hachures, blocs, entités courbes et
 * contraintes ». Motif de 16 primitives, répété sur une grille (pas 12 m × 8 m, décalage tiré au millimètre) :
 * rectangle, cercle, arc, polyligne fermée à renflements (cercle exact), polyligne ouverte (droite puis demi-cercle),
 * ligne de direction 3-4-5, deux cotes **liées** aux sommets du rectangle, une cote libre sur la ligne, une cote
 * angulaire libre (90°), deux textes, puis les graphismes (EX-055) : une hachure du rectangle (angle et espacement
 * saisis, transparence 0,5), deux symboles de la bibliothèque posés comme des blocs (nord, croix ; position, rotation,
 * échelle) et une spline de deux morceaux de Bézier. Géométrie synthétique ; dimensions nominales ci-dessous (entrées des
 * oracles).
 */

export const MOTIF_S1 = 16;
export const DEFINITION_S1 = "Scène S1 : détail 2D isolé avec cotes, textes, hachures, blocs, entités courbes et contraintes.";

/** Dimensions nominales du motif `j` (mètres, radians) : les seules entrées des oracles. */
export function parametresS1(j: number) {
  return {
    largeur: 2 + (j % 5) * 0.5,
    hauteur: 1 + (j % 3) * 0.5,
    rayonCercle: 0.25 + (j % 4) * 0.125,
    rayonArc: 0.5 + (j % 3) * 0.25,
    /** Arc de 0 à (1 + j mod 3) · π/2. */
    balayageArc: (1 + (j % 3)) * (Math.PI / 2),
    /** Polyligne fermée de deux sommets à renflements 1 : cercle exact de ce diamètre. */
    diametreRenfle: 0.5 + (j % 2) * 0.5,
    /** Polyligne ouverte : segment droit puis demi-cercle (renflement 1) de corde `cordeDemiCercle`. */
    segmentDroit: 1 + (j % 4) * 0.25,
    cordeDemiCercle: 0.5,
    /** Ligne de direction (0,6 ; 0,8) : longueur exacte. */
    longueurLigne: 1 + (j % 3),
    /** Hachure du rectangle : angle (rad) et espacement (m) saisis, aucun motif normalisé. */
    hachure: { angle: Math.PI / 4, espacement: 0.1 + (j % 3) * 0.05, opacite: 0.5 },
    /** Symboles posés : échelle et rotation (rad). */
    nord: { echelle: 0.5 + (j % 2) * 0.5, rotation: (j % 4) * (Math.PI / 2) },
    croix: { echelle: 0.4 },
  };
}

export function corpusS1(taille: number): CorpusStudio {
  const motifs = nombreMotifs(taille, MOTIF_S1), cols = coteGrille(motifs);
  const origine = memoMotif((j: number) => {
    const r = aleaMotif(GRAINES_CORPUS.S1, j);
    return { x: (j % cols) * 12 + r.millimetres(0.5), y: Math.floor(j / cols) * 8 + r.millimetres(0.5) };
  });
  const primitive = (j: number, role: number): Primitive => {
    const o = origine(j), p = parametresS1(j), id = (s: string) => `s1-${j}-${s}`;
    const ligneDebut = { x: o.x, y: o.y + p.hauteur + 0.5 };
    const ligneFin = { x: ligneDebut.x + 0.6 * p.longueurLigne, y: ligneDebut.y + 0.8 * p.longueurLigne };
    switch (role) {
      case 0: return objet({ id: id("rect"), type: "rectangle", layerId: "contours", origin: { x: o.x, y: o.y }, width: p.largeur, height: p.hauteur });
      case 1: return objet({ id: id("cercle"), type: "circle", layerId: "courbes", center: { x: o.x + p.largeur / 2, y: o.y + p.hauteur / 2 }, radius: p.rayonCercle });
      case 2: return objet({ id: id("arc"), type: "arc", layerId: "courbes", center: { x: o.x + p.largeur + 2.5, y: o.y + 1 }, radius: p.rayonArc, startAngle: 0, endAngle: p.balayageArc });
      case 3: {
        const a = { x: o.x + p.largeur + 4, y: o.y + 0.5 };
        return objet({ id: id("renfle"), type: "polyline", layerId: "courbes", points: [a, { x: a.x + p.diametreRenfle, y: a.y }], closed: true, bulges: [1, 1] });
      }
      case 4: {
        const a = { x: o.x, y: o.y - 1 }, b = { x: a.x + p.segmentDroit, y: a.y }, c = { x: b.x + p.cordeDemiCercle, y: a.y };
        return objet({ id: id("poly"), type: "polyline", layerId: "courbes", points: [a, b, c], closed: false, bulges: [0, 1] });
      }
      case 5: return objet({ id: id("ligne"), type: "line", layerId: "contours", start: ligneDebut, end: ligneFin });
      case 6: return cote({
        id: id("cote-l"), type: "dimension", layerId: "cotes", start: { x: o.x, y: o.y }, end: { x: o.x + p.largeur, y: o.y }, offset: -0.4,
        links: { start: { objectId: id("rect"), anchor: "corner-origin" }, end: { objectId: id("rect"), anchor: "corner-width" } }, toResolve: false,
      });
      case 7: return cote({
        id: id("cote-h"), type: "dimension", layerId: "cotes", start: { x: o.x + p.largeur, y: o.y }, end: { x: o.x + p.largeur, y: o.y + p.hauteur }, offset: 0.4,
        links: { start: { objectId: id("rect"), anchor: "corner-width" }, end: { objectId: id("rect"), anchor: "corner-opposite" } }, toResolve: false,
      });
      case 8: return cote({ id: id("cote-libre"), type: "dimension", layerId: "cotes", start: ligneDebut, end: ligneFin, offset: 0.3, links: { start: null, end: null }, toResolve: false });
      case 9: return annotation({
        id: id("angle"), type: "angular-dimension", layerId: "cotes", vertex: { x: o.x, y: o.y }, first: { x: o.x + 1, y: o.y }, second: { x: o.x, y: o.y + 1 },
        radius: 0.5, links: { first: null, second: null }, toResolve: false,
      });
      case 10: return annotation({ id: id("titre"), type: "text", layerId: "textes", position: { x: o.x, y: o.y + p.hauteur + 2 }, height: 0.2, rotation: 0, content: `Détail synthétique S1 n° ${j}`, justification: "left" });
      case 11: return annotation({ id: id("repere"), type: "text", layerId: "textes", position: { x: o.x - 0.5, y: o.y }, height: 0.15, rotation: Math.PI / 2, content: `Repère synthétique ${j}`, justification: "center" });
      case 12: return graphisme({
        id: id("hachure"), type: "hachure", layerId: "hachures", opacite: p.hachure.opacite, angle: p.hachure.angle, espacement: p.hachure.espacement,
        contour: [{ x: o.x, y: o.y }, { x: o.x + p.largeur, y: o.y }, { x: o.x + p.largeur, y: o.y + p.hauteur }, { x: o.x, y: o.y + p.hauteur }],
      });
      case 13: return graphisme({ id: id("nord"), type: "symbole", layerId: "symboles", symbole: "nord", position: { x: o.x + p.largeur + 6.5, y: o.y + 1.5 }, rotation: p.nord.rotation, echelle: p.nord.echelle });
      case 14: return graphisme({ id: id("croix"), type: "symbole", layerId: "symboles", symbole: "croix", position: { x: o.x - 1, y: o.y + p.hauteur + 1 }, rotation: 0, echelle: p.croix.echelle });
      default: {
        // Spline de deux morceaux de Bézier cubiques (7 points explicites), sous le détail.
        const a = { x: o.x + 3, y: o.y - 2 };
        return graphisme({ id: id("spline"), type: "spline", layerId: "courbes", points: [a, { x: a.x + 0.5, y: a.y + 0.8 }, { x: a.x + 1, y: a.y - 0.8 }, { x: a.x + 1.5, y: a.y }, { x: a.x + 2, y: a.y + 0.8 }, { x: a.x + 2.5, y: a.y - 0.8 }, { x: a.x + 3, y: a.y }] });
      }
    }
  };
  return construireCorpus({
    scene: "S1", definition: DEFINITION_S1, taille, motif: MOTIF_S1, primitive,
    calques: [calque("contours", "Contours (synthétique)"), calque("courbes", "Courbes (synthétique)"), calque("cotes", "Cotes (synthétique)"), calque("textes", "Textes (synthétique)"), calque("hachures", "Hachures (synthétique)"), calque("symboles", "Symboles (synthétique)")],
    couverture: {
      representes: [
        "cotes linéaires (liées et libres)", "cote angulaire", "textes", "entités courbes (cercle, arc, polylignes à renflements)", "liens associatifs cote → sommet (seule forme de contrainte du modèle)",
        "hachures : contour, angle et espacement saisis, transparence (graphismes, EX-055)",
        "blocs de bibliothèque : symboles nord et croix posés par position, rotation et échelle (transformation local-objet → local-2d)",
        "courbes de Bézier exactes : splines de deux morceaux",
      ],
      absents: [
        { element: "blocs définis par l'utilisateur", raison: "studio-document/1 n'a qu'une bibliothèque fermée de symboles (STUDIO_SYMBOLES : nord, croix, niveau) ; aucune définition de bloc saisie ni insertion d'une telle définition" },
        { element: "contraintes géométriques", raison: "le modèle ne porte que les liens associatifs des cotes ; aucune contrainte (parallélisme, tangence…) n'existe" },
      ],
    },
  });
}
