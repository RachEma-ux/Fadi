/**
 * Pliage et développé (P2-4, DA-11-02 à 05) — pur. Les paramètres de pliage (facteur K, déduction) viennent d'une table
 * sourcée du projet (gabarit `table-pliage.csv` : materiau, epaisseur_mm, rayon_interieur_mm, facteur_k, angle_deg,
 * deduction_pli_mm, source, edition, page ; D-180) ou d'un facteur K déclaré avec sa source. Sans l'un ni l'autre, le
 * développé est « non évalué » : aucune valeur de pliage n'est écrite dans le code (R3).
 *
 * Développé d'une tôle : face de base longueur × largeur centrée ; chaque pli sur un bord ajoute, à plat, la zone pliée
 * (allongement BA = angle · (r + K·t), ou longueur à plat = aile + déduction tabulée) puis l'aile. Lignes de pli aux
 * limites de la zone pliée.
 */
import type { BordTole, ParamsTole, PliTole } from "../../modele.js";
import type { LigneCatalogue } from "../../catalogues/csv-source.js";

export interface ParametresPli {
  facteurK: number | null;
  /** Déduction de pli tabulée (m) pour cet angle, si la table la donne. */
  deduction: number | null;
  source: string | null;
  /** Allongement de la zone pliée à plat (m) : null si non évaluable. */
  allongement: number | null;
  rayon: number;
}

const approx = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** Paramètres d'un pli : table sourcée (ligne du matériau, de l'épaisseur et du rayon ; angle exact si présent) ou facteur K déclaré. */
export function parametresPli(tole: ParamsTole, pli: PliTole, table: readonly LigneCatalogue[] | null): ParametresPli {
  const t = tole.epaisseur.value;
  const r = pli.rayon?.value ?? tole.rayonInterieur.value;
  const angle = Math.abs(pli.angle.value);
  const rad = (angle * Math.PI) / 180;
  if (tole.pliage && "facteurK" in tole.pliage) {
    return { facteurK: tole.pliage.facteurK, deduction: null, source: tole.pliage.source, allongement: rad * (r + tole.pliage.facteurK * t), rayon: r };
  }
  if (table && tole.materiau) {
    const lignes = table.filter((l) => String(l.valeurs["materiau"] ?? "").trim().toLowerCase() === tole.materiau!.trim().toLowerCase() && typeof l.valeurs["epaisseur_mm"] === "number" && approx((l.valeurs["epaisseur_mm"] as number) / 1000, t, 5e-5) && (l.valeurs["rayon_interieur_mm"] === null || l.valeurs["rayon_interieur_mm"] === undefined || approx((l.valeurs["rayon_interieur_mm"] as number) / 1000, r, 5e-5)));
    const exact = lignes.find((l) => typeof l.valeurs["angle_deg"] === "number" && approx(l.valeurs["angle_deg"] as number, angle, 0.01));
    const generique = lignes.find((l) => l.valeurs["angle_deg"] === null || l.valeurs["angle_deg"] === undefined);
    const ligne = exact ?? generique;
    if (ligne) {
      const src = `${ligne.source.source}, ${ligne.source.edition}, ${ligne.source.page}`;
      const k = typeof ligne.valeurs["facteur_k"] === "number" ? (ligne.valeurs["facteur_k"] as number) : null;
      const ded = exact && typeof exact.valeurs["deduction_pli_mm"] === "number" ? (exact.valeurs["deduction_pli_mm"] as number) / 1000 : null;
      // Avec une déduction tabulée : longueur à plat de la zone = 2·(r + t)·tan(θ/2) − déduction (angle ≤ 90°), sinon par K.
      let allongement: number | null = null;
      if (ded !== null && angle <= 90 + 1e-9) allongement = 2 * (r + t) * Math.tan(rad / 2) - ded;
      else if (k !== null) allongement = rad * (r + k * t);
      return { facteurK: k, deduction: ded, source: src, allongement: allongement !== null && allongement >= 0 ? allongement : null, rayon: r };
    }
  }
  return { facteurK: null, deduction: null, source: null, allongement: null, rayon: r };
}

export interface LignePli { bord: BordTole; a: { x: number; y: number }; b: { x: number; y: number }; angle: number; rayon: number; allongement: number }
export interface Developpe {
  /** Contour à plat (repère local de la tôle, m), sens direct. */
  contour: { x: number; y: number }[];
  lignesPli: LignePli[];
  encombrement: { longueur: number; largeur: number };
  aire: number;
  /** Plis dont l'allongement n'est pas évaluable (paramètres de pliage absents). */
  nonEvalues: BordTole[];
}

/** Développé à plat : null si un pli n'est pas évaluable (motif dans `nonEvalues` du résultat partiel). */
export function developpe(tole: ParamsTole, table: readonly LigneCatalogue[] | null): Developpe {
  const L = tole.longueur.value, W = tole.largeur.value;
  const ext: Record<BordTole, number> = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const lignesPli: LignePli[] = [];
  const nonEvalues: BordTole[] = [];
  for (const pli of tole.plis) {
    const p = parametresPli(tole, pli, table);
    if (p.allongement === null) { nonEvalues.push(pli.bord); continue; }
    ext[pli.bord] = p.allongement + pli.longueur.value;
    const sgn = pli.bord === "x1" || pli.bord === "y1" ? 1 : -1;
    const base = pli.bord.startsWith("x") ? (L / 2) * sgn : (W / 2) * sgn;
    const l1 = base, l2 = base + sgn * p.allongement;
    const demi = pli.bord.startsWith("x") ? W / 2 : L / 2;
    const lig = (v: number) => (pli.bord.startsWith("x") ? { a: { x: v, y: -demi }, b: { x: v, y: demi } } : { a: { x: -demi, y: v }, b: { x: demi, y: v } });
    lignesPli.push({ bord: pli.bord, ...lig(l1), angle: pli.angle.value, rayon: p.rayon, allongement: p.allongement });
    lignesPli.push({ bord: pli.bord, ...lig(l2), angle: pli.angle.value, rayon: p.rayon, allongement: p.allongement });
  }
  const x0 = -L / 2 - ext.x0, x1 = L / 2 + ext.x1, y0 = -W / 2 - ext.y0, y1 = W / 2 + ext.y1;
  // Croix : base + ailes (les coins restent vides).
  const c = (x: number, y: number) => ({ x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6 });
  const contour = [
    c(-L / 2, -W / 2), ...(ext.y0 ? [c(-L / 2, y0), c(L / 2, y0)] : []), c(L / 2, -W / 2),
    ...(ext.x1 ? [c(x1, -W / 2), c(x1, W / 2)] : []), c(L / 2, W / 2),
    ...(ext.y1 ? [c(L / 2, y1), c(-L / 2, y1)] : []), c(-L / 2, W / 2),
    ...(ext.x0 ? [c(x0, W / 2), c(x0, -W / 2)] : []),
  ];
  const aire = L * W + ext.x0 * W + ext.x1 * W + ext.y0 * L + ext.y1 * L;
  return { contour, lignesPli, encombrement: { longueur: Math.round((x1 - x0) * 1e6) / 1e6, largeur: Math.round((y1 - y0) * 1e6) / 1e6 }, aire: Math.round(aire * 1e9) / 1e9, nonEvalues };
}

/** Table de pliage d'un projet pour une tôle : lignes du catalogue désigné, ou null. */
export function tablePliage(tole: ParamsTole, definitions: Record<string, { classe: string; params: Record<string, unknown> }>): readonly LigneCatalogue[] | null {
  if (!tole.pliage || !("catalogueId" in tole.pliage)) return null;
  const d = definitions[tole.pliage.catalogueId];
  if (!d || d.classe !== "catalogue") return null;
  return (d.params["lignes"] as LigneCatalogue[] | undefined) ?? null;
}
