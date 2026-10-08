/**
 * Trame structurale (P2-3, DA-08-04 / 05) — pur. Files (selon u) et rangs (selon n) nommés ; intersections ;
 * plan de génération contrôlée : poteaux aux intersections, poutres entre intersections voisines d'une même file ou
 * d'un même rang, en tête des poteaux. La génération ne fait rien tant que l'aperçu n'est pas accordé (commande
 * `trame.generer`), et chaque objet créé porte `trameId` : la trame ne redessine jamais ce qui existe déjà.
 */
import type { AxeTrame, ParamsTrame } from "../../modele.js";
import type { Point2 } from "../../unites.js";

export interface IntersectionTrame { file: string; rang: string; point: Point2 }

export function repereTrame(t: Pick<ParamsTrame, "origine" | "angle">): { u: { x: number; y: number }; n: { x: number; y: number } } {
  const r = (t.angle.value * Math.PI) / 180;
  const u = { x: Math.cos(r), y: Math.sin(r) };
  return { u, n: { x: -u.y, y: u.x } };
}

export function pointTrame(t: Pick<ParamsTrame, "origine" | "angle">, s: number, o: number): Point2 {
  const { u, n } = repereTrame(t);
  return { x: Math.round((t.origine.x + u.x * s + n.x * o) * 1e6) / 1e6, y: Math.round((t.origine.y + u.y * s + n.y * o) * 1e6) / 1e6, frame: "local", unit: "m" };
}

/** Intersections file × rang, dans l'ordre des files puis des rangs. */
export function intersectionsTrame(t: ParamsTrame): IntersectionTrame[] {
  const out: IntersectionTrame[] = [];
  for (const f of t.files) for (const r of t.rangs) out.push({ file: f.nom, rang: r.nom, point: pointTrame(t, f.position, r.position) });
  return out;
}

/** Extrémités d'un axe de trame (file ou rang), prolongé de `marge` m de part et d'autre, pour le dessin. */
export function segmentsTrame(t: ParamsTrame, marge = 1): { nom: string; a: Point2; b: Point2; genre: "file" | "rang" }[] {
  const out: { nom: string; a: Point2; b: Point2; genre: "file" | "rang" }[] = [];
  const s0 = Math.min(...t.files.map((f) => f.position), 0), s1 = Math.max(...t.files.map((f) => f.position), 0);
  const o0 = Math.min(...t.rangs.map((r) => r.position), 0), o1 = Math.max(...t.rangs.map((r) => r.position), 0);
  for (const f of t.files) out.push({ nom: f.nom, genre: "file", a: pointTrame(t, f.position, o0 - marge), b: pointTrame(t, f.position, o1 + marge) });
  for (const r of t.rangs) out.push({ nom: r.nom, genre: "rang", a: pointTrame(t, s0 - marge, r.position), b: pointTrame(t, s1 + marge, r.position) });
  return out;
}

export interface PlanGeneration {
  poteaux: { file: string; rang: string; point: Point2 }[];
  poutres: { nom: string; a: Point2; b: Point2 }[];
}

/** Aperçu de la génération : poteaux aux intersections, poutres entre intersections voisines (files et rangs). */
export function planGeneration(t: ParamsTrame, options: { poteaux: boolean; poutres: boolean }): PlanGeneration {
  const inter = intersectionsTrame(t);
  const poteaux = options.poteaux ? inter : [];
  const poutres: PlanGeneration["poutres"] = [];
  if (options.poutres) {
    const files = [...t.files].sort((a, b) => a.position - b.position);
    const rangs = [...t.rangs].sort((a, b) => a.position - b.position);
    for (const f of files) for (let i = 0; i + 1 < rangs.length; i++) poutres.push({ nom: `${f.nom} ${rangs[i]!.nom}-${rangs[i + 1]!.nom}`, a: pointTrame(t, f.position, rangs[i]!.position), b: pointTrame(t, f.position, rangs[i + 1]!.position) });
    for (const r of rangs) for (let i = 0; i + 1 < files.length; i++) poutres.push({ nom: `${r.nom} ${files[i]!.nom}-${files[i + 1]!.nom}`, a: pointTrame(t, files[i]!.position, r.position), b: pointTrame(t, files[i + 1]!.position, r.position) });
  }
  return { poteaux, poutres };
}

/** Noms par défaut : files A, B, C… ; rangs 1, 2, 3… */
export function nommerAxes(positions: readonly number[], genre: "file" | "rang"): AxeTrame[] {
  return positions.map((position, i) => ({ nom: genre === "file" ? String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "") : String(i + 1), position }));
}
