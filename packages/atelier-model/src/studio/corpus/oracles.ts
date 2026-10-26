import { STUDIO_LIMITS } from "../document-2d.js";
import type { GrandeurQuantite } from "../quantites.js";
import { MOTIF_S1, parametresS1 } from "./s1-detail.js";
import { MOTIF_PLAN, MOTIF_S2, PARAMETRES_S2 } from "./s2-niveau.js";
import { MOTIF_S3, parametresS3 } from "./s3-dense.js";
import { MOTIF_S4, PARAMETRES_S4 } from "./s4-immeuble.js";
import { BOOLEENS_S5, MOTIF_S5, parametresS5 } from "./s5-libre.js";
import { SESSION_HORS_RESEAU_S7 } from "./s7-hors-reseau.js";
import type { SceneCorpus } from "./types.js";

/**
 * Oracles numériques des corpus (X.1-08) : valeurs attendues **calculées indépendamment** du modèle — en forme close, à
 * partir des seules dimensions nominales de chaque motif et du rôle de chaque primitive, sans lire les documents
 * générés ni appeler le métré. Les tests comparent ensuite ce que le modèle dérive des documents (comptes, métré
 * `quantitesStudio`, volumes des solides, mesures des cotes par `studioDimensionValue` / `measureStudioDimension`) à
 * ces valeurs, dans une tolérance relative déclarée.
 *
 * Limite de l'indépendance : les **paramètres nominaux** (`PARAMETRES_S2`, `PARAMETRES_S4`, `parametresS1`…) sont
 * **partagés** avec les générateurs — oracle et générateur lisent les mêmes dimensions d'entrée. L'oracle est indépendant
 * du calcul (métré, mesure), pas de ces entrées : une dimension nominale fausse passerait des deux côtés à la fois.
 *
 * Volumes des murs : brut = longueur × épaisseur × hauteur (mur droit à deux points, sans jonction), déduction =
 * Σ largeur × hauteur × épaisseur des ouvertures déclarées, net = brut − déduction (REC-A-03).
 */

/** Tolérance relative des comparaisons d'oracle (arrondi flottant des sommes ; aucune approximation géométrique). */
export const TOLERANCE_ORACLE = 1e-9;

export interface OracleMurs { brut: number; deduit: number; net: number }

export interface OracleCorpus {
  scene: SceneCorpus;
  taille: number;
  primitives: number;
  feuillets: number;
  /** Nombre d'éléments par type (`line`, `wall`, `box`…). */
  comptes: Record<string, number>;
  /** Totaux attendus du métré (`quantitesStudio`), sommés sur les feuillets ; seules les grandeurs listées sont contrôlées. */
  totaux: Partial<Record<GrandeurQuantite, number>>;
  /** Objets dont le volume s'applique sans être évalué (non extrudés) : jamais un zéro inventé. */
  volumeNonEvalues: number;
  /** Cotes linéaires : liées, libres et somme des valeurs mesurées. */
  cotes?: { liees: number; libres: number; sommeMesures: number };
  /** Cotes angulaires : nombre et somme des angles (degrés). */
  angles?: { nombre: number; sommeDegres: number };
  murs?: OracleMurs & { premier?: OracleMurs & { id: string } };
  /** Volume total des solides libres (`studioQuantitesSolides`). */
  volumeSolides?: number;
  /** Solides exacts : nombre par opération et volume total (forme close des booléens de boîtes). */
  exacts?: { operations: Record<string, number>; volume: number };
  /** Graphismes : aire totale des contours de hachure, symboles posés par nom, points de contrôle des splines. */
  graphismes?: { aireHachures: number; symboles: Record<string, number>; pointsSplines: number };
  /** Références externes déclarées (S2) : une source par feuillet qui porte des axes, objets venus du fond. */
  sources?: { nombre: number; objets: number };
}

class Accumulateur {
  comptes: Record<string, number> = {};
  totaux: Partial<Record<GrandeurQuantite, number>> = {};
  volumeNonEvalues = 0;
  compter(type: string) { this.comptes[type] = (this.comptes[type] ?? 0) + 1; }
  ajouter(g: GrandeurQuantite, v: number) { this.totaux[g] = (this.totaux[g] ?? 0) + v; }
}

const feuillets = (taille: number, motif: number) => Math.ceil(taille / (Math.floor(STUDIO_LIMITS.objects / motif) * motif));

/** Parcourt les primitives présentes : `role` du motif `j`, avec la présence d'un autre rôle du même motif. */
function parcourir(taille: number, motif: number, f: (j: number, role: number, present: (role: number) => boolean) => void): void {
  for (let k = 0; k < taille; k++) {
    const j = Math.floor(k / motif);
    f(j, k % motif, (r) => j * motif + r < taille);
  }
}

export function oracleS1(taille: number): OracleCorpus {
  const a = new Accumulateur();
  const cotes = { liees: 0, libres: 0, sommeMesures: 0 }, angles = { nombre: 0, sommeDegres: 0 };
  const graphismes = { aireHachures: 0, symboles: {} as Record<string, number>, pointsSplines: 0 };
  parcourir(taille, MOTIF_S1, (j, role) => {
    const p = parametresS1(j);
    switch (role) {
      case 0: a.compter("rectangle"); a.ajouter("perimetre", 2 * (p.largeur + p.hauteur)); a.ajouter("surface", p.largeur * p.hauteur); a.volumeNonEvalues++; break;
      case 1: a.compter("circle"); a.ajouter("perimetre", 2 * Math.PI * p.rayonCercle); a.ajouter("surface", Math.PI * p.rayonCercle ** 2); a.volumeNonEvalues++; break;
      case 2: a.compter("arc"); a.ajouter("longueur", p.rayonArc * p.balayageArc); a.volumeNonEvalues++; break;
      // Deux sommets à renflements 1 : cercle de diamètre d.
      case 3: a.compter("polyline"); a.ajouter("perimetre", Math.PI * p.diametreRenfle); a.ajouter("surface", (Math.PI * p.diametreRenfle ** 2) / 4); a.volumeNonEvalues++; break;
      // Segment droit puis demi-cercle de corde c : c + π c / 2 ; une polyligne ouverte n'a pas de volume.
      case 4: a.compter("polyline"); a.ajouter("longueur", p.segmentDroit + (Math.PI * p.cordeDemiCercle) / 2); break;
      case 5: a.compter("line"); a.ajouter("longueur", p.longueurLigne); a.volumeNonEvalues++; break;
      case 6: a.compter("dimension"); cotes.liees++; cotes.sommeMesures += p.largeur; break;
      case 7: a.compter("dimension"); cotes.liees++; cotes.sommeMesures += p.hauteur; break;
      case 8: a.compter("dimension"); cotes.libres++; cotes.sommeMesures += p.longueurLigne; break;
      case 9: a.compter("angular-dimension"); angles.nombre++; angles.sommeDegres += 90; break;
      case 10: case 11: a.compter("text"); break;
      // Hachure du rectangle : aire du contour l × h.
      case 12: a.compter("hachure"); graphismes.aireHachures += p.largeur * p.hauteur; break;
      case 13: a.compter("symbole"); graphismes.symboles.nord = (graphismes.symboles.nord ?? 0) + 1; break;
      case 14: a.compter("symbole"); graphismes.symboles.croix = (graphismes.symboles.croix ?? 0) + 1; break;
      // Deux morceaux de Bézier : 3 × 2 + 1 points.
      default: a.compter("spline"); graphismes.pointsSplines += 7;
    }
  });
  return { scene: "S1", taille, primitives: taille, feuillets: feuillets(taille, MOTIF_S1), comptes: a.comptes, totaux: a.totaux, volumeNonEvalues: a.volumeNonEvalues, cotes, angles, graphismes };
}

/** S2, et S6 / S7 qui en reprennent le plan. */
export function oraclePlanDeNiveau(scene: "S2" | "S6" | "S7", taille: number): OracleCorpus {
  // S2 seul porte le mur traversant (rôle 8) et la référence externe de ses axes.
  const motif = scene === "S2" ? MOTIF_S2 : MOTIF_PLAN;
  const P = PARAMETRES_S2, a = new Accumulateur();
  let axes = 0;
  const brut = P.maille * P.epaisseur * P.hauteurMur;
  const deduitPorte = P.porte.largeur * P.porte.hauteur * P.epaisseur, deduitFenetre = P.fenetre.largeur * P.fenetre.hauteur * P.epaisseur;
  const murs: OracleMurs = { brut: 0, deduit: 0, net: 0 };
  let premier: (OracleMurs & { id: string }) | undefined;
  const cotes = { liees: 0, libres: 0, sommeMesures: 0 };
  const mur = (deduit: number) => {
    a.compter("wall"); a.ajouter("longueur", P.maille); a.ajouter("volume", brut); a.ajouter("volume-deduit", deduit); a.ajouter("volume-net", brut - deduit);
    murs.brut += brut; murs.deduit += deduit; murs.net += brut - deduit;
  };
  parcourir(taille, motif, (j, role, present) => {
    switch (role) {
      case 0: {
        const d = present(2) ? deduitPorte : 0;
        mur(d);
        if (j === 0) premier = { id: `${scene.toLowerCase()}-0-mur-h`, brut, deduit: d, net: brut - d };
        break;
      }
      case 1: mur(present(3) ? deduitFenetre : 0); break;
      case 2: a.compter("opening"); a.ajouter("surface-ouverture", P.porte.largeur * P.porte.hauteur); break;
      case 3: a.compter("opening"); a.ajouter("surface-ouverture", P.fenetre.largeur * P.fenetre.hauteur); break;
      case 4: case 5: a.compter("line"); a.ajouter("longueur", P.maille); a.volumeNonEvalues++; axes++; break;
      case 6: a.compter("dimension"); cotes.liees++; cotes.sommeMesures += P.maille; break;
      case 7: a.compter("text"); break;
      // Mur traversant : aucune jonction calculée, volume plein L × e × h.
      default: {
        const b = P.traversant.longueur * P.epaisseur * P.hauteurMur;
        a.compter("wall"); a.ajouter("longueur", P.traversant.longueur); a.ajouter("volume", b); a.ajouter("volume-deduit", 0); a.ajouter("volume-net", b);
        murs.brut += b; murs.net += b;
      }
    }
  });
  const n = feuillets(taille, motif);
  return {
    scene, taille, primitives: taille, feuillets: n, comptes: a.comptes, totaux: a.totaux, volumeNonEvalues: a.volumeNonEvalues, cotes,
    murs: { ...murs, ...(premier ? { premier } : {}) },
    // Chaque feuillet porte au moins un motif entier, donc ses axes : une source par feuillet.
    ...(scene === "S2" ? { sources: { nombre: axes > 0 ? n : 0, objets: axes } } : {}),
  };
}

export function oracleS3(taille: number): OracleCorpus {
  const a = new Accumulateur();
  parcourir(taille, MOTIF_S3, (j, role) => {
    const p = parametresS3(j);
    switch (role) {
      case 0: a.compter("line"); a.ajouter("longueur", p.longueurLigne); a.volumeNonEvalues++; break;
      case 1: a.compter("rectangle"); a.ajouter("perimetre", 2 * (p.largeur + p.hauteur)); a.ajouter("surface", p.largeur * p.hauteur); a.volumeNonEvalues++; break;
      case 2: a.compter("circle"); a.ajouter("perimetre", 2 * Math.PI * p.rayon); a.ajouter("surface", Math.PI * p.rayon ** 2); a.volumeNonEvalues++; break;
      default: a.compter("polyline"); a.ajouter("longueur", p.brancheX + p.brancheY);
    }
  });
  return { scene: "S3", taille, primitives: taille, feuillets: feuillets(taille, MOTIF_S3), comptes: a.comptes, totaux: a.totaux, volumeNonEvalues: a.volumeNonEvalues };
}

export function oracleS4(taille: number): OracleCorpus {
  const P = PARAMETRES_S4, a = new Accumulateur();
  const brut = P.travee * P.epaisseur * P.hauteurMur;
  const murs: OracleMurs = { brut: 0, deduit: 0, net: 0 };
  let volumeSolides = 0;
  const mur = (deduit: number) => {
    a.compter("wall"); a.ajouter("longueur", P.travee); a.ajouter("volume", brut); a.ajouter("volume-deduit", deduit); a.ajouter("volume-net", brut - deduit);
    murs.brut += brut; murs.deduit += deduit; murs.net += brut - deduit;
  };
  parcourir(taille, MOTIF_S4, (_j, role, present) => {
    switch (role) {
      case 0: mur(present(1) ? P.fenetre.largeur * P.fenetre.hauteur * P.epaisseur : 0); break;
      case 1: a.compter("opening"); a.ajouter("surface-ouverture", P.fenetre.largeur * P.fenetre.hauteur); break;
      case 2: mur(present(3) ? P.porte.largeur * P.porte.hauteur * P.epaisseur : 0); break;
      case 3: a.compter("opening"); a.ajouter("surface-ouverture", P.porte.largeur * P.porte.hauteur); break;
      case 4: a.compter("box"); volumeSolides += P.boite.cote * P.boite.cote * P.boite.hauteur; break;
      case 5: {
        const c = P.plateau.cote;
        a.compter("rectangle"); a.ajouter("perimetre", 4 * c); a.ajouter("surface", c * c); a.ajouter("volume", c * c * P.plateau.epaisseur); break;
      }
      case 6: a.compter("polyline"); a.ajouter("longueur", P.reseau.equerre); break;
      case 7: a.compter("line"); a.ajouter("longueur", P.reseau.ligne); a.volumeNonEvalues++; break;
      case 8: {
        const r = P.descente.rayon;
        a.compter("circle"); a.ajouter("perimetre", 2 * Math.PI * r); a.ajouter("surface", Math.PI * r * r); a.ajouter("volume", Math.PI * r * r * P.hauteurNiveau); break;
      }
      default: a.compter("text");
    }
  });
  return { scene: "S4", taille, primitives: taille, feuillets: feuillets(taille, MOTIF_S4), comptes: a.comptes, totaux: a.totaux, volumeNonEvalues: a.volumeNonEvalues, murs, volumeSolides };
}

export function oracleS5(taille: number): OracleCorpus {
  const a = new Accumulateur();
  let volumeSolides = 0;
  const exacts = { operations: {} as Record<string, number>, volume: 0 };
  parcourir(taille, MOTIF_S5, (j, role) => {
    const p = parametresS5(j);
    switch (role) {
      case 0: {
        const V = p.boite.largeur * p.boite.profondeur * p.boite.hauteur;
        if (j < BOOLEENS_S5.length) {
          // Deux boîtes de volume V décalées d'une demi-largeur : union 1,5 V, différence et intersection 0,5 V.
          const op = BOOLEENS_S5[j]!;
          a.compter("exact"); exacts.operations[op] = (exacts.operations[op] ?? 0) + 1;
          const ve = op === "union" ? 1.5 * V : 0.5 * V;
          // Le métré des solides (`studioQuantitesSolides`) compte aussi les solides exacts.
          exacts.volume += ve; volumeSolides += ve;
        } else { a.compter("box"); volumeSolides += V; }
        break;
      }
      // Étoile de 2n sommets, rayons R et r alternés : 2n triangles d'aire R r sin(π/n) / 2.
      case 1: { const e = p.etoile; a.compter("prism"); volumeSolides += e.branches * e.rayonExterieur * e.rayonInterieur * Math.sin(Math.PI / e.branches) * e.hauteur; break; }
      // Secteur annulaire θ r e, longueur r θ, deux faces 2 r θ h.
      case 2: {
        const m = p.murCourbe;
        a.compter("arc"); a.ajouter("longueur", m.rayon * m.balayage); a.ajouter("surface-laterale", 2 * m.rayon * m.balayage * m.hauteur); a.ajouter("volume", m.balayage * m.rayon * m.epaisseur * m.hauteur); break;
      }
      // Carré c × c plus demi-disque de diamètre c : c² + π c² / 8 ; périmètre 3c + π c / 2.
      case 3: {
        const c = p.renfle.cote, s = c * c + (Math.PI * c * c) / 8;
        a.compter("polyline"); a.ajouter("perimetre", 3 * c + (Math.PI * c) / 2); a.ajouter("surface", s); a.ajouter("volume", s * p.renfle.hauteur); break;
      }
      case 4: {
        const r = p.cylindre.rayon;
        a.compter("circle"); a.ajouter("perimetre", 2 * Math.PI * r); a.ajouter("surface", Math.PI * r * r); a.ajouter("volume", Math.PI * r * r * p.cylindre.hauteur); break;
      }
      // Polygone régulier de q côtés inscrit dans R : q R² sin(2π/q) / 2.
      default: { const q = p.polygone; a.compter("prism"); volumeSolides += ((q.cotes * q.rayon * q.rayon * Math.sin((2 * Math.PI) / q.cotes)) / 2) * q.hauteur; }
    }
  });
  return { scene: "S5", taille, primitives: taille, feuillets: feuillets(taille, MOTIF_S5), comptes: a.comptes, totaux: a.totaux, volumeNonEvalues: a.volumeNonEvalues, volumeSolides, exacts };
}

export const oracleS7 = (taille: number): OracleCorpus => oraclePlanDeNiveau("S7", taille);

/** Attendu de la session hors réseau S7 après reconnexion (recette `studio-corpus-s7.mjs`). */
export function oracleSessionS7(taille: number) {
  const o = oracleS7(taille), r = SESSION_HORS_RESEAU_S7.rectangle;
  return {
    revisionsAjoutees: SESSION_HORS_RESEAU_S7.revisionsAjoutees,
    objets: (o.comptes.line ?? 0) + 1,
    primitives: o.primitives + 1,
    rectangle: { origin: { x: r.x, y: r.y }, width: r.largeur, height: r.hauteur },
    murs: o.murs!,
    concurrente: (() => {
      const c = SESSION_HORS_RESEAU_S7.concurrente, r2 = c.rectangle;
      return {
        revisionsAjoutees: c.revisionsAjoutees,
        rectangle: { origin: { x: r2.x, y: r2.y }, width: r2.largeur, height: r2.hauteur },
        ligne: { id: c.ligne.id, type: "line" as const, start: { ...c.ligne.start }, end: { ...c.ligne.end } },
        /** Après le report : départ + 1 (première session) + rectangle + ligne. */
        primitives: o.primitives + 3,
      };
    })(),
  };
}

/** Attendus de l'étude S6 par variante (têtes), dérivés du plan de niveau et des étapes du plan. */
export function oracleS6(taille = 100) {
  const base = oraclePlanDeNiveau("S6", taille), P = PARAMETRES_S2;
  const c = (t: string) => base.comptes[t] ?? 0;
  const fenetre = P.fenetre.largeur * P.fenetre.hauteur * P.epaisseur, brut = P.maille * P.epaisseur * P.hauteurMur;
  const m = base.murs!;
  const A = { wall: c("wall"), opening: c("opening") + 1, line: c("line"), dimension: c("dimension"), text: c("text"), murs: { brut: m.brut, deduit: m.deduit + fenetre, net: m.net - fenetre } };
  // B part de A1 : sans la fenêtre ajoutée en A2 ; le mur s6-1-mur-v (brut 3,6, fenêtre 0,084) disparaît avec sa fenêtre.
  const B = { wall: c("wall") - 1, opening: c("opening") - 1, line: c("line") + 1, dimension: c("dimension"), text: c("text"), murs: { brut: m.brut - brut, deduit: m.deduit - fenetre, net: m.net - (brut - fenetre) } };
  const C = { ...A, line: A.line + 2 };
  return {
    base,
    premierMur: { id: "s6-0-mur-h", avant: m.premier!, apres: { brut, deduit: m.premier!.deduit + fenetre, net: m.premier!.net - fenetre } },
    variantes: { A, B, C },
    revisionsAjoutees: { A: 3, B: 2, C: 1 },
    /** Valeurs exigées (celles de A) et statut attendu de chaque exigence sur chaque tête. */
    exigences: {
      valeurs: { "s6-nombre-murs": A.wall, "s6-volume-net": A.murs.net, "s6-mur-0": m.premier!.net - fenetre } as Record<string, number>,
      statuts: {
        A: { "s6-nombre-murs": "satisfaite", "s6-volume-net": "satisfaite", "s6-mur-0": "satisfaite" },
        // B part de A1 (sans la fenêtre de A2) et perd un mur : les trois exigences tombent.
        B: { "s6-nombre-murs": "non-satisfaite", "s6-volume-net": "non-satisfaite", "s6-mur-0": "non-satisfaite" },
        C: { "s6-nombre-murs": "satisfaite", "s6-volume-net": "satisfaite", "s6-mur-0": "satisfaite" },
      } as Record<"A" | "B" | "C", Record<string, "satisfaite" | "non-satisfaite">>,
      conclusions: { A: "satisfaite", B: "non-satisfaite", C: "satisfaite" } as const,
    },
  };
}

export function oracleCorpus(scene: Exclude<SceneCorpus, "S6">, taille: number): OracleCorpus {
  switch (scene) {
    case "S1": return oracleS1(taille);
    case "S2": return oraclePlanDeNiveau("S2", taille);
    case "S3": return oracleS3(taille);
    case "S4": return oracleS4(taille);
    case "S5": return oracleS5(taille);
    default: return oracleS7(taille);
  }
}
