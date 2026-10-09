/**
 * Bâtiment P2 et surfaces libres (P2-6, DA-07-08, 09, 11, 13, 14, 18, 19, 20, 23 ; DA-03-03, 05, 06, 07) — géométrie pure,
 * indépendante du DOM : maillages (repère du niveau, z relatif), pente d'une rampe, altitude d'un terrain triangulé,
 * subdivision d'une surface libre. Aucune valeur normative : dimensions, entraxes, pentes viennent du projet ; une pente
 * n'est jamais comparée à une règle.
 */
import type { ParamsCoque, ParamsEchelle, ParamsInstallationChantier, ParamsMurRideau, ParamsPlafond, ParamsRampe, ParamsReservation, ParamsSurfaceLibre, ParamsTerrain } from "./modele.js";
import type { Point2 } from "./unites.js";
import { balayer, boiteOrientee, delaunay, fusionner, subdiviserLoop, triangulerFaces, type MaillageBrut, type V3 } from "./geometrie-3d.js";
import { trianguler } from "./projection/maillage.js";

const vide = (): MaillageBrut => ({ positions: [], indices: [] });

/** Prisme vertical d'un contour (trous compris) entre z0 et z1, avec un relevé facultatif dz(p) du dessus. */
export function prisme(contour: readonly Point2[], trous: readonly (readonly Point2[])[], z0: number, z1: number, dz?: (p: Point2) => number): MaillageBrut {
  if (contour.length < 3 || !(z1 > z0)) return vide();
  const sommets = [...contour, ...trous.flat()];
  const tri = trianguler(contour, trous);
  const positions: number[] = [];
  const indices: number[] = [];
  const n = sommets.length;
  for (const p of sommets) positions.push(p.x, p.y, z0);
  for (const p of sommets) positions.push(p.x, p.y, z1 + (dz ? dz(p) : 0));
  for (let k = 0; k < tri.length; k += 3) { indices.push(tri[k]!, tri[k + 2]!, tri[k + 1]!); indices.push(n + tri[k]!, n + tri[k + 1]!, n + tri[k + 2]!); }
  const anneau = (pts: readonly Point2[], decalage: number, inverse: boolean) => {
    for (let i = 0; i < pts.length; i++) {
      const a = decalage + i, b = decalage + ((i + 1) % pts.length);
      if (inverse) indices.push(a, n + a, b, b, n + a, n + b); else indices.push(a, b, n + a, b, n + b, n + a);
    }
  };
  // Le contour extérieur est orienté en sens direct par `trianguler` ? Non : on calcule l'orientation pour tourner les parois vers l'extérieur.
  const aire = (pts: readonly Point2[]) => pts.reduce((acc, q, i) => { const r = pts[(i + 1) % pts.length]!; return acc + q.x * r.y - r.x * q.y; }, 0) / 2;
  anneau(contour, 0, aire(contour) < 0);
  let dec = contour.length;
  for (const t of trous) { anneau(t, dec, aire(t) > 0); dec += t.length; }
  return { positions, indices };
}

export const centroide2 = (pts: readonly Point2[]): Point2 => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, frame: "local", unit: "m" });

export function maillagePlafond(p: ParamsPlafond): MaillageBrut {
  return prisme(p.contour, p.trous, p.hauteur.value, p.hauteur.value + p.epaisseur.value);
}

/** Coque : dôme paraboloïdal déclaré sur le contour (flèche au centroïde, 0 au bord selon la distance normalisée), épaisseur verticale. */
export function maillageCoque(p: ParamsCoque): MaillageBrut {
  if (p.contour.length < 3) return vide();
  const c = centroide2(p.contour);
  const rayon = Math.max(...p.contour.map((q) => Math.hypot(q.x - c.x, q.y - c.y)), 1e-9);
  const releve = (q: Point2) => p.fleche.value * Math.max(0, 1 - ((q.x - c.x) ** 2 + (q.y - c.y) ** 2) / (rayon * rayon));
  // Grille raffinée : le contour est subdivisé en anneaux concentriques vers le centroïde pour courber la surface.
  const anneaux = 6;
  const pts: Point2[] = [];
  const faces: number[][] = [];
  const nb = p.contour.length;
  for (let r = 0; r <= anneaux; r++) {
    const k = 1 - r / anneaux;
    for (const q of p.contour) pts.push({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k, frame: "local", unit: "m" });
  }
  for (let r = 0; r < anneaux; r++) for (let i = 0; i < nb; i++) {
    const a = r * nb + i, b = r * nb + ((i + 1) % nb), d = (r + 1) * nb + i, e = (r + 1) * nb + ((i + 1) % nb);
    if (r === anneaux - 1) faces.push([a, b, d]); else faces.push([a, b, e, d]);
  }
  const z0 = p.decalageBase.value, e = p.epaisseur.value;
  const positions: number[] = [];
  const n = pts.length;
  for (const q of pts) positions.push(q.x, q.y, z0 + releve(q));
  for (const q of pts) positions.push(q.x, q.y, z0 + releve(q) + e);
  const tri = triangulerFaces(faces);
  const indices: number[] = [];
  for (const [a, b, d] of tri) { indices.push(a, d, b); indices.push(n + a, n + b, n + d); }
  for (let i = 0; i < nb; i++) { const a = i, b = (i + 1) % nb; indices.push(a, b, n + a, b, n + b, n + a); }
  return { positions, indices };
}

export const longueurRampe = (p: Pick<ParamsRampe, "a" | "b">): number => Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
/** Pente de la rampe en pourcentage (hauteur / longueur en plan) : valeur dérivée, jamais une exigence. */
export const penteRampe = (p: Pick<ParamsRampe, "a" | "b" | "hauteurAFranchir">): number | null => { const L = longueurRampe(p); return L > 1e-9 ? (100 * p.hauteurAFranchir.value) / L : null; };

export function maillageRampe(p: ParamsRampe): MaillageBrut {
  const L = longueurRampe(p);
  if (L < 1e-9) return vide();
  const u: V3 = [(p.b.x - p.a.x) / L, (p.b.y - p.a.y) / L, 0];
  const n: V3 = [-u[1], u[0], 0];
  const w = p.largeur.value / 2, e = p.epaisseur.value, z0 = p.decalageBase.value, H = p.hauteurAFranchir.value;
  // Paillasse inclinée : balayage d'un rectangle (largeur × épaisseur) le long de l'axe incliné.
  const contour: [number, number][] = [[-w, -e], [w, -e], [w, 0], [-w, 0]];
  void n;
  return balayer(contour, [], [p.a.x, p.a.y, z0], [p.b.x, p.b.y, z0 + H]);
}

export function maillageEchelle(p: ParamsEchelle): MaillageBrut {
  const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
  if (L < 1e-9) return vide();
  const u: V3 = [(p.b.x - p.a.x) / L, (p.b.y - p.a.y) / L, 0];
  const n: V3 = [-u[1], u[0], 0];
  const w = p.largeur.value / 2, h = p.hauteur.value, z0 = p.decalageBase.value;
  const r = 0.02;
  const c: V3 = [p.a.x, p.a.y, z0];
  const parts: MaillageBrut[] = [];
  for (const s of [-w, w]) parts.push(boiteOrientee([c[0] + n[0] * s, c[1] + n[1] * s, z0 + h / 2], [0, 0, 1], u, n, h / 2, r, r));
  const pas = p.entraxeBarreaux.value;
  for (let z = pas; z < h - 1e-9; z += pas) parts.push(boiteOrientee([c[0], c[1], z0 + z], n, u, [0, 0, 1], w, r, r));
  if (p.crinolineDepuis && p.crinolineDepuis.value < h) {
    for (let z = p.crinolineDepuis.value; z <= h + 1e-9; z += Math.max(pas * 3, 0.5)) {
      // Arceau de crinoline : demi-anneau symbolique en avant de l'échelle (côté opposé au mur, direction −u).
      parts.push(boiteOrientee([c[0] - u[0] * 0.35, c[1] - u[1] * 0.35, z0 + z], n, u, [0, 0, 1], w + 0.1, 0.015, 0.015));
      for (const s of [-(w + 0.1), w + 0.1]) parts.push(boiteOrientee([c[0] - u[0] * 0.175 + n[0] * s, c[1] - u[1] * 0.175 + n[1] * s, z0 + z], u, n, [0, 0, 1], 0.175, 0.015, 0.015));
    }
  }
  return fusionner(...parts);
}

/** Mur-rideau : montants à l'entraxe (rives comprises), traverses à l'entraxe (base et tête comprises), vitrages entre eux. */
export function maillageMurRideau(p: ParamsMurRideau): MaillageBrut {
  const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
  if (L < 1e-9) return vide();
  const u: V3 = [(p.b.x - p.a.x) / L, (p.b.y - p.a.y) / L, 0];
  const n: V3 = [-u[1], u[0], 0];
  const z0 = p.decalageBase.value, h = p.hauteur.value;
  const lp = p.largeurProfil.value, pp = p.profondeurProfil.value, ev = p.epaisseurVitrage.value;
  const parts: MaillageBrut[] = [];
  const positions = (longueur: number, entraxe: number) => { const out: number[] = []; for (let s = 0; s < longueur - 1e-9; s += entraxe) out.push(s); out.push(longueur); return out; };
  const montants = positions(L, p.entraxeMontants.value);
  const traverses = positions(h, p.entraxeTraverses.value);
  for (const s of montants) parts.push(boiteOrientee([p.a.x + u[0] * s, p.a.y + u[1] * s, z0 + h / 2], [0, 0, 1], u, n, h / 2, lp / 2, pp / 2));
  for (const z of traverses) parts.push(boiteOrientee([p.a.x + u[0] * (L / 2), p.a.y + u[1] * (L / 2), z0 + z], u, [0, 0, 1], n, L / 2, lp / 2, pp / 2));
  parts.push(boiteOrientee([p.a.x + u[0] * (L / 2), p.a.y + u[1] * (L / 2), z0 + h / 2], u, [0, 0, 1], n, L / 2, h / 2, ev / 2));
  return fusionner(...parts);
}

export function nombreProfilsMurRideau(p: ParamsMurRideau): { montants: number; traverses: number; panneaux: number } {
  const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
  const nm = Math.ceil(L / p.entraxeMontants.value - 1e-9) + 1, nt = Math.ceil(p.hauteur.value / p.entraxeTraverses.value - 1e-9) + 1;
  return { montants: nm, traverses: nt, panneaux: (nm - 1) * (nt - 1) };
}

/** Triangles du terrain (Delaunay sur le semis en plan), indices dans `points`. */
export const trianglesTerrain = (p: Pick<ParamsTerrain, "points">): [number, number, number][] => delaunay(p.points);

/** Altitude du terrain au point (interpolation linéaire dans le triangle qui le contient) ; null hors du semis — jamais extrapolée. */
export function altitudeTerrain(p: Pick<ParamsTerrain, "points">, q: { x: number; y: number }): number | null {
  for (const [a, b, c] of trianglesTerrain(p)) {
    const A = p.points[a]!, B = p.points[b]!, C = p.points[c]!;
    const d = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
    if (Math.abs(d) < 1e-15) continue;
    const l1 = ((B.y - C.y) * (q.x - C.x) + (C.x - B.x) * (q.y - C.y)) / d;
    const l2 = ((C.y - A.y) * (q.x - C.x) + (A.x - C.x) * (q.y - C.y)) / d;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * A.z + l2 * B.z + l3 * C.z;
  }
  return null;
}

export function maillageTerrain(p: ParamsTerrain): MaillageBrut {
  const tri = trianglesTerrain(p);
  if (!tri.length) return vide();
  const positions: number[] = [];
  const n = p.points.length;
  for (const q of p.points) positions.push(q.x, q.y, q.z);
  const e = p.epaisseur.value;
  const indices: number[] = [];
  for (const [a, b, c] of tri) indices.push(a, b, c);
  if (e <= 0) return { positions, indices };
  for (const q of p.points) positions.push(q.x, q.y, q.z - e);
  for (const [a, b, c] of tri) indices.push(n + a, n + c, n + b);
  // Parois : arêtes de bord (une seule fois dans les triangles).
  const compte = new Map<string, [number, number]>();
  for (const [a, b, c] of tri) for (const [u, v] of [[a, b], [b, c], [c, a]] as [number, number][]) { const k = u < v ? `${u}|${v}` : `${v}|${u}`; if (compte.has(k)) compte.delete(k); else compte.set(k, [u, v]); }
  for (const [u, v] of compte.values()) indices.push(u, n + u, v, v, n + u, n + v);
  return { positions, indices };
}

/** Emprise en plan du terrain (enveloppe convexe du semis). */
export function empriseTerrain(p: Pick<ParamsTerrain, "points">): Point2[] {
  const pts = [...p.points].map((q) => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts.map((q) => ({ ...q, frame: "local" as const, unit: "m" as const }));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const bas: { x: number; y: number }[] = [], haut: { x: number; y: number }[] = [];
  for (const q of pts) { while (bas.length >= 2 && cross(bas[bas.length - 2]!, bas[bas.length - 1]!, q) <= 0) bas.pop(); bas.push(q); }
  for (const q of [...pts].reverse()) { while (haut.length >= 2 && cross(haut[haut.length - 2]!, haut[haut.length - 1]!, q) <= 0) haut.pop(); haut.push(q); }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)].map((q) => ({ x: q.x, y: q.y, frame: "local" as const, unit: "m" as const }));
}

export function maillageReservation(p: ParamsReservation): MaillageBrut {
  return prisme(p.contour, p.trous, p.z, p.z + p.hauteur.value);
}

export function maillageInstallationChantier(p: ParamsInstallationChantier): MaillageBrut {
  if (!p.hauteur) return vide();
  return prisme(p.contour, p.trous, 0, p.hauteur.value);
}

/** Surface libre : maillage de contrôle trianguler puis subdivisé (Loop) `niveaux` fois. */
export function maillageSurfaceLibre(p: ParamsSurfaceLibre): MaillageBrut {
  const positions = p.sommets.flatMap((s) => [s.x, s.y, s.z]);
  const tri = triangulerFaces(p.faces);
  if (!tri.length) return vide();
  return subdiviserLoop(positions, tri, Math.max(0, Math.min(4, p.niveaux)));
}

/** Nombre de faces du maillage subdivisé (4ⁿ par triangle). */
export const facesSubdivisees = (p: Pick<ParamsSurfaceLibre, "faces" | "niveaux">): number => triangulerFaces(p.faces).length * 4 ** Math.max(0, Math.min(4, p.niveaux));

/** Conversion explicite d'un maillage quelconque en maillage de contrôle (sommets dédoublonnés, triangles), DA-07-20. */
export function controleDepuisMaillage(m: { positions: readonly number[]; indices: readonly number[] }): { sommets: { x: number; y: number; z: number }[]; faces: number[][] } {
  const index = new Map<string, number>();
  const sommets: { x: number; y: number; z: number }[] = [];
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const idx = (i: number) => {
    const q = { x: r(m.positions[3 * i]!), y: r(m.positions[3 * i + 1]!), z: r(m.positions[3 * i + 2]!) };
    const k = `${q.x}|${q.y}|${q.z}`;
    let n = index.get(k);
    if (n === undefined) { n = sommets.length; sommets.push(q); index.set(k, n); }
    return n;
  };
  const faces: number[][] = [];
  for (let k = 0; k < m.indices.length; k += 3) {
    const f = [idx(m.indices[k]!), idx(m.indices[k + 1]!), idx(m.indices[k + 2]!)];
    if (new Set(f).size === 3) faces.push(f);
  }
  return { sommets, faces };
}

/** Emprise en plan d'une surface libre (sommets de contrôle, enveloppe convexe). */
export function empriseSurfaceLibre(p: Pick<ParamsSurfaceLibre, "sommets">): Point2[] {
  return empriseTerrain({ points: p.sommets });
}
