import { calque, construireCorpus, coteGrille, nombreMotifs, objet, solide, type Primitive } from "./commun.js";
import type { StudioPoint } from "../document-2d.js";
import type { CorpusStudio } from "./types.js";

/**
 * S5 — géométrie libre complexe (X.1-05). REF-02 §18.2 : « géométrie 3D libre avec booléens, courbes exactes et
 * surfaces complexes ». Motif de 6 primitives sur une grille de 20 m : boîte tournée (rotation k · π/8), prisme d'un
 * profil en étoile de 16 à 256 sommets (1 024, la borne du profil, tous les 100 motifs), mur courbe (arc à épaisseur, balayage k · π/6), polyligne fermée extrudée à un
 * côté en demi-cercle (renflement 1), cylindre (cercle extrudé), prisme d'un polygone régulier de 3 à 100 sommets.
 * Dimensions nominales ci-dessous (entrées des oracles) ; aires des profils en forme close.
 */

export const MOTIF_S5 = 6;
export const DEFINITION_S5 = "Scène S5 : géométrie 3D libre avec booléens, courbes exactes et surfaces complexes.";

/** Branches de l'étoile ; une étoile de 512 branches (1 024 sommets, borne du profil) tous les 100 motifs, dès le premier. */
const BRANCHES = [8, 16, 32, 64, 128] as const;
const COTES_POLYGONE = [3, 5, 6, 7, 12, 24, 100] as const;

export function parametresS5(j: number) {
  return {
    boite: { largeur: 1 + (j % 4) * 0.5, profondeur: 1 + (j % 3) * 0.5, hauteur: 1 + (j % 5) * 0.5, rotation: (j % 16) * (Math.PI / 8), z: (j % 7) * 0.5 },
    /** Étoile de 2 × branches sommets, rayons alternés `rayonExterieur` / `rayonInterieur`. */
    etoile: { branches: j % 100 === 0 ? 512 : BRANCHES[j % BRANCHES.length]!, rayonExterieur: 2, rayonInterieur: 1, hauteur: 0.5 + (j % 3) * 0.5 },
    murCourbe: { rayon: 2 + (j % 3), balayage: (1 + (j % 11)) * (Math.PI / 6), epaisseur: 0.2, hauteur: 3 },
    /** Carré de côté `cote` dont le côté droit est un demi-cercle extérieur. */
    renfle: { cote: 1 + (j % 3) * 0.5, hauteur: 2 },
    cylindre: { rayon: 0.5 + (j % 4) * 0.25, hauteur: 1 + (j % 2) },
    polygone: { cotes: COTES_POLYGONE[j % COTES_POLYGONE.length]!, rayon: 1.5, hauteur: 1 },
  };
}

const polaire = (n: number, rayon: (i: number) => number): StudioPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: rayon(i) * Math.cos((2 * Math.PI * i) / n), y: rayon(i) * Math.sin((2 * Math.PI * i) / n) }));

export function corpusS5(taille: number): CorpusStudio {
  const motifs = nombreMotifs(taille, MOTIF_S5), cols = coteGrille(motifs);
  const primitive = (j: number, role: number): Primitive => {
    const x = (j % cols) * 20, y = Math.floor(j / cols) * 20, p = parametresS5(j), id = (s: string) => `s5-${j}-${s}`;
    switch (role) {
      case 0: return solide({ id: id("boite"), type: "box", layerId: "solides", placement: { origin: { x, y, z: p.boite.z }, rotation: p.boite.rotation }, width: p.boite.largeur, depth: p.boite.profondeur, height: p.boite.hauteur });
      case 1: {
        const e = p.etoile;
        return solide({ id: id("etoile"), type: "prism", layerId: "solides", placement: { origin: { x: x + 6, y, z: 0 }, rotation: 0 }, profile: polaire(2 * e.branches, (i) => (i % 2 === 0 ? e.rayonExterieur : e.rayonInterieur)), height: e.hauteur });
      }
      case 2: {
        const m = p.murCourbe;
        return objet({ id: id("mur-courbe"), type: "arc", layerId: "courbes", center: { x: x + 12, y }, radius: m.rayon, startAngle: 0, endAngle: m.balayage, extrusion: { base: 0, height: m.hauteur, thickness: m.epaisseur } });
      }
      case 3: {
        const c = p.renfle.cote, a = { x, y: y + 6 };
        return objet({
          id: id("renfle"), type: "polyline", layerId: "courbes", points: [a, { x: a.x + c, y: a.y }, { x: a.x + c, y: a.y + c }, { x: a.x, y: a.y + c }], closed: true,
          bulges: [0, 1, 0, 0], extrusion: { base: 0, height: p.renfle.hauteur },
        });
      }
      case 4: return objet({ id: id("cylindre"), type: "circle", layerId: "courbes", center: { x: x + 6, y: y + 7 }, radius: p.cylindre.rayon, extrusion: { base: 0, height: p.cylindre.hauteur } });
      default: {
        const q = p.polygone;
        return solide({ id: id("polygone"), type: "prism", layerId: "solides", placement: { origin: { x: x + 12, y: y + 8, z: 0 }, rotation: 0 }, profile: polaire(q.cotes, () => q.rayon), height: q.hauteur });
      }
    }
  };
  return construireCorpus({
    scene: "S5", definition: DEFINITION_S5, taille, motif: MOTIF_S5, primitive,
    calques: [calque("solides", "Solides libres (synthétique)"), calque("courbes", "Courbes extrudées (synthétique)")],
    couverture: {
      representes: ["solides libres placés et tournés (boîtes, prismes)", "courbes exactes (arc, renflements) métrées sans discrétisation", "profils complexes jusqu'à 1 024 sommets"],
      absents: [
        { element: "booléens", raison: "solides exacts (lot F2) calculés par le noyau exact OCCT seulement (Worker à la demande, recalcul par le serveur) : un corpus synthétique pur ne peut pas fabriquer de brep sans ce noyau ; couverts par la recette studio-exact" },
        { element: "surfaces libres (NURBS, subdivision)", raison: "aucun type de surface libre dans studio-document/1 ; profils polygonaux seulement" },
      ],
    },
  });
}
