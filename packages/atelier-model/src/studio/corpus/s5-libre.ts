import { calque, construireCorpus, coteGrille, exact, nombreMotifs, objet, solide, surface, type Primitive } from "./commun.js";
import type { StudioSurfaceLibre } from "../objets-3d/surfaces-libres.js";
import type { StudioPoint } from "../document-2d.js";
import type { StudioBox } from "../objets-3d/solides.js";
import type { StudioOperationBooleenne } from "../objets-3d/exacts.js";
import { RESULTATS_EXACTS_S5 } from "./fixtures/s5-exacts.js";
import type { CorpusStudio } from "./types.js";

/**
 * S5 — géométrie libre complexe (X.1-05). REF-02 §18.2 : « géométrie 3D libre avec booléens, courbes exactes et
 * surfaces complexes ». Motif de 6 primitives sur une grille de 20 m : boîte tournée (rotation k · π/8), prisme d'un
 * profil en étoile de 16 à 256 sommets (1 024, la borne du profil, tous les 100 motifs), mur courbe (arc à épaisseur, balayage k · π/6), polyligne fermée extrudée à un
 * côté en demi-cercle (renflement 1), cylindre (cercle extrudé), prisme d'un polygone régulier de 3 à 100 sommets.
 * Dimensions nominales ci-dessous (entrées des oracles) ; aires des profils en forme close.
 *
 * Booléens : dans les `BOOLEENS_S5.length` premiers motifs, la boîte est remplacée par un **solide exact** (union,
 * différence, intersection) de deux boîtes droites de mêmes dimensions décalées d'une demi-largeur, opérandes conservés
 * (R15). Le résultat (brep, maillage, volume) est celui du noyau exact OCCT, calculé par
 * `apps/api/src/lib/studio-corpus-s5.test.ts` et conservé dans `fixtures/s5-exacts.ts` avec son empreinte ; le
 * générateur reste pur (il ne charge aucun noyau) et refuse un résultat absent. Volumes attendus en forme close : union
 * 1,5 V, différence 0,5 V, intersection 0,5 V (V : volume d'une boîte).
 *
 * Surfaces libres (X.1-05) : dans les deux motifs suivants (`SURFACES_S5`), la boîte est remplacée par un **quart de
 * cylindre NURBS rationnel** vertical (arc de degré 2, poids 1, √2/2, 1 ; génératrice de degré 1) de rayon R et de
 * hauteur L, posé hors de la grille en (−20 (j + 1) ; −20) : le premier reste une surface libre (aire exacte π R L / 2 ; le métré lit l'aire approchée
 * de son maillage d'affichage), le second est **épaissi** de e vers l'extérieur (le long de la normale) par le noyau
 * OCCT, surface conservée, résultat conservé dans `fixtures/s5-exacts.ts` avec son empreinte ; volume de forme close
 * π/4 ((R + e)² − R²) L.
 */

/** Opérations des booléens du corpus, une par motif (les premiers). */
export const BOOLEENS_S5: readonly StudioOperationBooleenne[] = Object.freeze(["union", "difference", "intersection"] as const);

/**
 * Opérandes du booléen du motif `j` (j < BOOLEENS_S5.length) : deux boîtes droites, B décalée de la demi-largeur en x,
 * posées hors de la grille en (−20 (j + 1) ; −20) — une position qui ne dépend pas de la taille du corpus, donc un même
 * résultat exact pour toutes les tailles.
 */
export function operandesBooleenS5(j: number): [StudioBox, StudioBox] {
  const b = parametresS5(j).boite, x = -20 * (j + 1), y = -20;
  const boite = (cle: string, dx: number): StudioBox => ({ id: `s5-${j}-op-${cle}`, type: "box", layerId: "solides", placement: { origin: { x: x + dx, y, z: b.z }, rotation: 0 }, width: b.largeur, depth: b.profondeur, height: b.hauteur });
  return [boite("a", 0), boite("b", b.largeur / 2)];
}

/** Motifs dont la boîte devient une surface libre (`surface`) puis une surface épaissie (`epaissie`), après les booléens. */
export const SURFACES_S5 = Object.freeze({ surface: BOOLEENS_S5.length, epaissie: BOOLEENS_S5.length + 1 } as const);

/** Quart de cylindre NURBS rationnel vertical de rayon R et de hauteur L, axe en (cx, cy), base z = 0 (pôles, poids). */
export function quartCylindreS5(id: string, layerId: string, cx: number, cy: number, R: number, L: number): StudioSurfaceLibre {
  const arc = [{ x: R, y: 0 }, { x: R, y: R }, { x: 0, y: R }], w = [1, Math.SQRT1_2, 1];
  const controle = [], poids = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { controle.push({ x: cx + arc[i]!.x, y: cy + arc[i]!.y, z: k * L }); poids.push(w[i]!); }
  return { id, type: "surface-libre", layerId, degreU: 2, degreV: 1, lignes: 3, colonnes: 2, controle, poids };
}

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
    /** Quart de cylindre NURBS (motifs `SURFACES_S5`) : rayon, hauteur, épaisseur (vers l'extérieur) de la surface épaissie. */
    surface: { rayon: 1 + (j % 2) * 0.5, hauteur: 2, epaisseur: 0.1 },
  };
}

const polaire = (n: number, rayon: (i: number) => number): StudioPoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: rayon(i) * Math.cos((2 * Math.PI * i) / n), y: rayon(i) * Math.sin((2 * Math.PI * i) / n) }));

export function corpusS5(taille: number): CorpusStudio {
  const motifs = nombreMotifs(taille, MOTIF_S5), cols = coteGrille(motifs);
  const primitive = (j: number, role: number): Primitive => {
    const x = (j % cols) * 20, y = Math.floor(j / cols) * 20, p = parametresS5(j), id = (s: string) => `s5-${j}-${s}`;
    switch (role) {
      case 0: if (j < BOOLEENS_S5.length) {
        const resultat = RESULTATS_EXACTS_S5[id("booleen")];
        if (!resultat) throw new Error(`corpus S5 : résultat exact absent pour ${id("booleen")} (STUDIO_CORPUS_ECRIRE=1 sur apps/api/src/lib/studio-corpus-s5.test.ts)`);
        return exact({ id: id("booleen"), type: "exact", layerId: "solides", operation: BOOLEENS_S5[j]!, operandes: operandesBooleenS5(j), resultat });
      }
      if (j === SURFACES_S5.surface || j === SURFACES_S5.epaissie) {
        // Hors de la grille en (−20 (j + 1) ; −20), comme les booléens : même résultat exact pour toutes les tailles.
        const q = p.surface, s = quartCylindreS5(id("surface"), "surfaces", -20 * (j + 1), -20, q.rayon, q.hauteur);
        if (j === SURFACES_S5.surface) return surface(s);
        const resultat = RESULTATS_EXACTS_S5[id("epaissie")];
        if (!resultat) throw new Error(`corpus S5 : résultat exact absent pour ${id("epaissie")} (STUDIO_CORPUS_ECRIRE=1 sur apps/api/src/lib/studio-corpus-s5.test.ts)`);
        return exact({ id: id("epaissie"), type: "exact", layerId: "surfaces", operation: "epaississement", surface: s, epaisseur: q.epaisseur, sens: "normale", resultat });
      }
      return solide({ id: id("boite"), type: "box", layerId: "solides", placement: { origin: { x, y, z: p.boite.z }, rotation: p.boite.rotation }, width: p.boite.largeur, depth: p.boite.profondeur, height: p.boite.hauteur });
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
    calques: [calque("solides", "Solides libres (synthétique)"), calque("courbes", "Courbes extrudées (synthétique)"), calque("surfaces", "Surfaces libres NURBS (synthétique)")],
    couverture: {
      representes: [
        "solides libres placés et tournés (boîtes, prismes)", "courbes exactes (arc, renflements) métrées sans discrétisation", "profils complexes jusqu'à 1 024 sommets",
        "booléens exacts (union, différence, intersection) calculés par le noyau OCCT, opérandes conservés, résultat conservé avec son empreinte",
        "surface libre NURBS rationnelle (quart de cylindre : pôles, degrés 2 × 1, poids 1, √2/2, 1), épaissie en solide exact par le noyau OCCT, surface conservée, résultat conservé avec son empreinte",
      ],
      absents: [
        { element: "surfaces de subdivision", raison: "les surfaces libres de studio-document/1 sont des NURBS (pôles, degrés, poids) ; aucune surface de subdivision" },
      ],
    },
  });
}
