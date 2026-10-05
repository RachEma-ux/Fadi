/**
 * Esquisse contrainte bornée (fiches DA-01-07, DA-01-08, DA-06-01 / 02) : contraintes géométriques entre sommets
 * et segments d'esquisses à sommets (lignes, polylignes, polygones) — coïncidence, horizontal, vertical,
 * parallélisme, perpendicularité, distance (cote pilotante ou de contrôle) et, depuis D-051, égalité de longueurs,
 * milieu, point sur ligne, sommet fixe, symétrie par rapport à un axe et angle entre deux segments. Solveur de
 * Gauss–Newton au plus petit déplacement (Δ = −Jᵀ(JJᵀ)⁻¹r), diagnostic de rang (degrés de liberté restants,
 * contrainte redondante, conflit). Jeu borné : pas de tangence ni d'arc (les cercles et arcs ne sont pas
 * contraignables) ; 200 variables au plus.
 *
 * Une contrainte est une relation `contrainte` du modèle : source = esquisse A, cible = esquisse B (ou A),
 * paramètres { type, a, b, valeur, pilotante, etat } où a / b sont des caractéristiques nommées `sommet[i]` ou
 * `segment[i]`. Une contrainte dont un objet a disparu passe « à réparer ».
 */
import type { ModeleAtelier, Occurrence, Relation } from "./modele.js";
import type { Angle, Longueur } from "./unites.js";

export type TypeContrainte = "coincidence" | "horizontal" | "vertical" | "parallele" | "perpendiculaire" | "distance" | "egalite" | "milieu" | "sur-ligne" | "fixe" | "symetrie" | "angle";
export const TYPES_CONTRAINTE: readonly TypeContrainte[] = ["coincidence", "horizontal", "vertical", "parallele", "perpendiculaire", "distance", "egalite", "milieu", "sur-ligne", "fixe", "symetrie", "angle"];
export const LIBELLES_CONTRAINTE: Record<TypeContrainte, string> = {
  coincidence: "Coïncidence",
  horizontal: "Horizontal",
  vertical: "Vertical",
  parallele: "Parallèles",
  perpendiculaire: "Perpendiculaires",
  distance: "Distance",
  egalite: "Longueurs égales",
  milieu: "Au milieu",
  "sur-ligne": "Sur la ligne",
  fixe: "Fixe",
  symetrie: "Symétriques",
  angle: "Angle",
};

/**
 * Éléments portés par chaque type : a (sur l'esquisse A), puis b (sur l'esquisse B ; null : aucun). La symétrie porte
 * l'axe en a (segment de A) et deux sommets de B en b et c.
 */
export const ELEMENTS_CONTRAINTE: Record<TypeContrainte, readonly ["sommet" | "segment", "sommet" | "segment" | null]> = {
  coincidence: ["sommet", "sommet"],
  horizontal: ["segment", null],
  vertical: ["segment", null],
  parallele: ["segment", "segment"],
  perpendiculaire: ["segment", "segment"],
  distance: ["sommet", "sommet"],
  egalite: ["segment", "segment"],
  milieu: ["sommet", "segment"],
  "sur-ligne": ["sommet", "segment"],
  fixe: ["sommet", null],
  symetrie: ["segment", "sommet"],
  angle: ["segment", "segment"],
};

export interface ParamsContrainte {
  type: TypeContrainte;
  a: string;
  b: string | null;
  valeur: Longueur | null;
  /** Cote pilotante (contraint la géométrie) ou de contrôle (mesure seulement). */
  pilotante: boolean;
  etat: "ok" | "a-reparer";
  /** Angle (contrainte « angle ») : angle orienté de a vers b, en degrés, modulo 180° (droites). */
  angle?: Angle | null;
  /** Second sommet de B (contrainte « symetrie », symétrique de b par rapport à l'axe a). */
  c?: string | null;
  /** Position tenue (contrainte « fixe »), relevée à l'ajout. */
  position?: { x: number; y: number } | null;
}

export const FORMES_CONTRAIGNABLES = ["ligne", "polyligne", "polygone", "construction"] as const;
export const MAX_VARIABLES = 200;
/**
 * Écart au-delà duquel une contrainte est dite non respectée : les coordonnées résolues sont arrondies au
 * micromètre, ce qui laisse sur une longueur ou un angle un écart résiduel de l'ordre du micromètre.
 */
export const TOLERANCE_CONTRAINTE = 5e-6;
const TOL = 1e-9;

export const contraintesDe = (etat: ModeleAtelier): (Relation & { params: ParamsContrainte })[] =>
  Object.values(etat.relations).filter((r): r is Relation & { params: ParamsContrainte } => r.kind === "contrainte").sort((a, b) => (a.id < b.id ? -1 : 1));

export const contraintesDeLObjet = (etat: ModeleAtelier, id: string) => contraintesDe(etat).filter((r) => r.sourceId === id || r.targetId === id);

/** Esquisse contraignable ? (sinon, la raison) */
export function raisonNonContraignable(etat: ModeleAtelier, id: string): string | null {
  const o = etat.objets[id];
  if (!o) return `objet inconnu : ${id}`;
  if (o.classe !== "esquisse") return `${id} n'est pas une esquisse`;
  if (!(FORMES_CONTRAIGNABLES as readonly string[]).includes(o.params.forme)) return `esquisse « ${o.params.forme} » : contraintes réservées aux lignes, polylignes et polygones`;
  if (o.params.renflements) return `${id} : polyligne à segments en arc, contraintes non prises en charge`;
  return null;
}

/** Indices des sommets d'une caractéristique `sommet[i]` (1 sommet) ou `segment[i]` (2 sommets). */
export function sommetsDe(o: Occurrence<"esquisse">, carac: string): number[] | null {
  const m = /^(sommet|segment)\[(\d+)\]$/.exec(carac);
  if (!m) return null;
  const i = Number(m[2]);
  const n = o.params.points.length;
  if (m[1] === "sommet") return i < n ? [i] : null;
  const ferme = o.params.ferme || o.params.forme === "polygone";
  if (i + 1 < n) return [i, i + 1];
  if (ferme && i === n - 1 && n > 2) return [i, 0];
  return null;
}

interface Systeme {
  /** Variables : (esquisseId, indice de sommet) → position dans x (x, y à la suite). */
  index: Map<string, number>;
  x: number[];
  equations: ((x: number[]) => number)[];
  /** Équation(s) de chaque contrainte (pour le diagnostic). */
  parContrainte: Map<string, number[]>;
}

const cle = (id: string, i: number) => `${id}#${i}`;

/** Système des contraintes pilotantes valides ; `fixes` : sommets tenus à leur position (geste en cours). */
export function systeme(etat: ModeleAtelier, contraintes: (Relation & { params: ParamsContrainte })[], fixes: { id: string; i: number }[] = []): Systeme {
  const index = new Map<string, number>();
  const x: number[] = [];
  const variable = (id: string, i: number) => {
    const k = cle(id, i);
    let v = index.get(k);
    if (v === undefined) {
      const o = etat.objets[id] as Occurrence<"esquisse">;
      v = x.length;
      index.set(k, v);
      x.push(o.params.points[i]!.x, o.params.points[i]!.y);
    }
    return v;
  };
  const equations: Systeme["equations"] = [];
  const parContrainte = new Map<string, number[]>();
  for (const r of contraintes) {
    const p = r.params;
    if (p.etat !== "ok" || !p.pilotante) continue;
    const A = etat.objets[r.sourceId] as Occurrence<"esquisse"> | undefined;
    const B = etat.objets[r.targetId] as Occurrence<"esquisse"> | undefined;
    if (!A || !B) continue;
    const sa = sommetsDe(A, p.a);
    const sb = p.b ? sommetsDe(B, p.b) : null;
    if (!sa) continue;
    const va = sa.map((i) => variable(A.id, i));
    const vb = sb ? sb.map((i) => variable(B.id, i)) : null;
    const debut = equations.length;
    const d = (x: number[], v: number[]) => [x[v[1]!]! - x[v[0]!]!, x[v[1]! + 1]! - x[v[0]! + 1]!] as const;
    /** Distance signée du point v à la droite du segment s (normalisée). */
    const horsLigne = (x: number[], v: number, s: number[]) => {
      const [sx, sy] = d(x, s);
      return (sx * (x[v + 1]! - x[s[0]! + 1]!) - sy * (x[v]! - x[s[0]!]!)) / (Math.hypot(sx, sy) || 1);
    };
    switch (p.type) {
      case "coincidence":
        if (!vb) break;
        equations.push((x) => x[va[0]!]! - x[vb[0]!]!, (x) => x[va[0]! + 1]! - x[vb[0]! + 1]!);
        break;
      case "horizontal":
        if (va.length === 2) equations.push((x) => x[va[1]! + 1]! - x[va[0]! + 1]!);
        break;
      case "vertical":
        if (va.length === 2) equations.push((x) => x[va[1]!]! - x[va[0]!]!);
        break;
      case "parallele":
      case "perpendiculaire":
        if (va.length === 2 && vb && vb.length === 2)
          equations.push((x) => {
            const [ax, ay] = d(x, va);
            const [bx, by] = d(x, vb);
            const l = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1;
            return (p.type === "parallele" ? ax * by - ay * bx : ax * bx + ay * by) / l;
          });
        break;
      case "distance": {
        const cible = p.valeur?.value ?? 0;
        if (va.length === 2 && !vb) equations.push((x) => Math.hypot(...d(x, va)) - cible);
        else if (vb) equations.push((x) => Math.hypot(x[vb[0]!]! - x[va[0]!]!, x[vb[0]! + 1]! - x[va[0]! + 1]!) - cible);
        break;
      }
      case "egalite":
        if (va.length === 2 && vb?.length === 2) equations.push((x) => Math.hypot(...d(x, va)) - Math.hypot(...d(x, vb)));
        break;
      case "milieu":
        if (va.length === 1 && vb?.length === 2)
          equations.push((x) => x[va[0]!]! - (x[vb[0]!]! + x[vb[1]!]!) / 2, (x) => x[va[0]! + 1]! - (x[vb[0]! + 1]! + x[vb[1]! + 1]!) / 2);
        break;
      case "sur-ligne":
        if (va.length === 1 && vb?.length === 2) equations.push((x) => horsLigne(x, va[0]!, vb));
        break;
      case "fixe": {
        const q = p.position;
        if (va.length === 1 && q) equations.push((x) => x[va[0]!]! - q.x, (x) => x[va[0]! + 1]! - q.y);
        break;
      }
      case "symetrie": {
        const sc = p.c ? sommetsDe(B, p.c) : null;
        if (va.length === 2 && vb?.length === 1 && sc?.length === 1) {
          const vx = va;
          const vs = [vb[0]!, variable(B.id, sc[0]!)] as const;
          // Le milieu des deux sommets est sur l'axe ; leur segment est perpendiculaire à l'axe.
          equations.push(
            (x) => {
              const [ux, uy] = d(x, vx);
              const mx = (x[vs[0]]! + x[vs[1]]!) / 2 - x[vx[0]!]!;
              const my = (x[vs[0] + 1]! + x[vs[1] + 1]!) / 2 - x[vx[0]! + 1]!;
              return (ux * my - uy * mx) / (Math.hypot(ux, uy) || 1);
            },
            (x) => {
              const [ux, uy] = d(x, vx);
              return (ux * (x[vs[1]]! - x[vs[0]]!) + uy * (x[vs[1] + 1]! - x[vs[0] + 1]!)) / (Math.hypot(ux, uy) || 1);
            },
          );
        }
        break;
      }
      case "angle": {
        const t = ((p.angle?.value ?? 0) * Math.PI) / 180;
        if (va.length === 2 && vb?.length === 2)
          equations.push((x) => {
            const [ax, ay] = d(x, va);
            const [bx, by] = d(x, vb);
            const l = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1;
            // sin(φ − θ) = 0 avec φ l'angle orienté de a vers b : vrai pour φ = θ (mod 180°).
            return ((ax * by - ay * bx) * Math.cos(t) - (ax * bx + ay * by) * Math.sin(t)) / l;
          });
        break;
      }
    }
    parContrainte.set(r.id, Array.from({ length: equations.length - debut }, (_, k) => debut + k));
  }
  for (const f of fixes) {
    const v = index.get(cle(f.id, f.i));
    if (v === undefined) continue;
    const x0 = x[v]!;
    const y0 = x[v + 1]!;
    equations.push((x) => x[v]! - x0, (x) => x[v + 1]! - y0);
  }
  return { index, x, equations, parContrainte };
}

/** Jacobien par différences centrées (pas de 1 µm) : précis à 1e-12 près sur ces équations régulières. */
function jacobien(s: Systeme, x: number[]): number[][] {
  const h = 1e-6;
  return s.equations.map((e) => {
    const ligne = new Array<number>(x.length);
    for (let j = 0; j < x.length; j++) {
      const xp = [...x];
      const xm = [...x];
      xp[j]! += h;
      xm[j]! -= h;
      ligne[j] = (e(xp) - e(xm)) / (2 * h);
    }
    return ligne;
  });
}

/** Rang numérique (élimination de Gauss à pivot partiel, tolérance relative). */
export function rang(M: number[][]): number {
  const A = M.map((l) => [...l]);
  const m = A.length;
  const n = m ? A[0]!.length : 0;
  let r = 0;
  const echelle = Math.max(1e-12, ...A.flat().map(Math.abs));
  for (let c = 0; c < n && r < m; c++) {
    let p = r;
    for (let i = r + 1; i < m; i++) if (Math.abs(A[i]![c]!) > Math.abs(A[p]![c]!)) p = i;
    if (Math.abs(A[p]![c]!) <= 1e-8 * echelle) continue;
    [A[r], A[p]] = [A[p]!, A[r]!];
    for (let i = r + 1; i < m; i++) {
      const f = A[i]![c]! / A[r]![c]!;
      for (let j = c; j < n; j++) A[i]![j]! -= f * A[r]![j]!;
    }
    r++;
  }
  return r;
}

/** Résout (A + λI) y = b par Gauss (A symétrique m × m). */
function resoudre(A: number[][], b: number[], lambda: number): number[] | null {
  const m = b.length;
  const M = A.map((l, i) => [...l.map((v, j) => v + (i === j ? lambda : 0)), b[i]!]);
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let i = c + 1; i < m; i++) if (Math.abs(M[i]![c]!) > Math.abs(M[p]![c]!)) p = i;
    if (Math.abs(M[p]![c]!) < 1e-15) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let i = 0; i < m; i++) {
      if (i === c) continue;
      const f = M[i]![c]! / M[c]![c]!;
      for (let j = c; j <= m; j++) M[i]![j]! -= f * M[c]![j]!;
    }
  }
  return M.map((l, i) => l[m]! / l[i]!);
}

export interface ResultatResolution {
  converge: boolean;
  x: number[];
  residu: number;
  /** Degrés de liberté restants : variables − rang du jacobien. */
  degresDeLiberte: number;
  rang: number;
}

/** Gauss–Newton au plus petit déplacement depuis la position courante ; mêmes entrées, mêmes coordonnées. */
export function resoudreSysteme(s: Systeme): ResultatResolution {
  let x = [...s.x];
  const residu = (v: number[]) => Math.max(0, ...s.equations.map((e) => Math.abs(e(v))));
  let r = residu(x);
  for (let it = 0; it < 60 && r > TOL; it++) {
    const J = jacobien(s, x);
    const f = s.equations.map((e) => e(x));
    const JJt = J.map((li) => J.map((lj) => li.reduce((acc, v, k) => acc + v * lj[k]!, 0)));
    const y = resoudre(JJt, f, 1e-12);
    if (!y) break;
    const delta = x.map((_, k) => -J.reduce((acc, li, i) => acc + li[k]! * y[i]!, 0));
    // Pas amorti si le résidu augmente.
    let pas = 1;
    let suivant = x.map((v, k) => v + delta[k]!);
    let rs = residu(suivant);
    while (rs > r && pas > 1 / 64) {
      pas /= 2;
      suivant = x.map((v, k) => v + pas * delta[k]!);
      rs = residu(suivant);
    }
    x = suivant;
    r = rs;
  }
  const J = s.equations.length ? jacobien(s, x) : [];
  const rg = J.length ? rang(J) : 0;
  // Coordonnées arrondies au micromètre : deux résolutions identiques donnent les mêmes octets.
  x = x.map((v) => Math.round(v * 1e6) / 1e6);
  return { converge: r <= 1e-7, x, residu: r, degresDeLiberte: x.length - rg, rang: rg };
}

/** Écrit les positions résolues dans les esquisses (nouvel état, immuable). */
export function appliquerSolution(etat: ModeleAtelier, s: Systeme, x: number[]): { etat: ModeleAtelier; modifies: string[] } {
  const parObjet = new Map<string, Map<number, [number, number]>>();
  for (const [k, v] of s.index) {
    const [id, i] = k.split("#") as [string, string];
    const m = parObjet.get(id) ?? new Map<number, [number, number]>();
    m.set(Number(i), [x[v]!, x[v + 1]!]);
    parObjet.set(id, m);
  }
  const objets = { ...etat.objets };
  const modifies: string[] = [];
  for (const [id, m] of parObjet) {
    const o = objets[id] as Occurrence<"esquisse">;
    const points = o.params.points.map((p, i) => {
      const n = m.get(i);
      return n ? { ...p, x: n[0], y: n[1] } : p;
    });
    if (points.some((p, i) => p.x !== o.params.points[i]!.x || p.y !== o.params.points[i]!.y)) {
      objets[id] = { ...o, params: { ...o.params, points } };
      modifies.push(id);
    }
  }
  return { etat: { ...etat, objets }, modifies };
}

/** Plus grand écart des contraintes pilotantes valides (0 = toutes respectées). */
export function ecartContraintes(etat: ModeleAtelier, contraintes = contraintesDe(etat)): number {
  const s = systeme(etat, contraintes);
  return Math.max(0, ...s.equations.map((e) => Math.abs(e(s.x))));
}

/** Diagnostic d'une esquisse (ou d'un groupe d'esquisses liées) : contraintes, degrés de liberté, écart. */
export function diagnosticContraintes(etat: ModeleAtelier, ids: string[]): { contraintes: number; degresDeLiberte: number; ecart: number; aReparer: number } {
  const set = new Set(ids);
  const liees = contraintesDe(etat).filter((r) => set.has(r.sourceId) || set.has(r.targetId));
  const s = systeme(etat, liees);
  // Variables libres : tous les sommets des esquisses concernées (même non contraints).
  let variables = 0;
  for (const id of ids) {
    const o = etat.objets[id];
    if (o?.classe === "esquisse") variables += 2 * o.params.points.length;
  }
  const J = s.equations.length ? jacobien(s, s.x) : [];
  return { contraintes: liees.filter((r) => r.params.etat === "ok").length, degresDeLiberte: variables - (J.length ? rang(J) : 0), ecart: Math.max(0, ...s.equations.map((e) => Math.abs(e(s.x)))), aReparer: liees.filter((r) => r.params.etat === "a-reparer").length };
}

export type { Systeme };
