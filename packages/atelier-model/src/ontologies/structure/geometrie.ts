/**
 * Géométrie des éléments de structure (P2-3) — pure, indépendante du DOM. Balayage d'une section le long d'un
 * segment 3D (élément droit ou incliné), boîtes et cylindres orientés (platines, boulons, barres), volume d'un
 * maillage fermé. Les maillages sont exprimés dans le repère du niveau (z relatif au niveau).
 */
import type { ParamsArmature, ParamsAssemblageStructurel, ParamsPoutre } from "../../modele.js";
import type { Point2 } from "../../unites.js";
import { contourSection, trousSection } from "./sections.js";
import { balayer, boiteOrientee, cylindre, fusionner, type MaillageBrut, type V3 } from "../../geometrie-3d.js";

export { balayer, boiteOrientee, cylindre, empriseXY, fusionner, repereElement, volumeMaillage, type MaillageBrut } from "../../geometrie-3d.js";

/** Maillage d'un élément de structure dans le repère du niveau (z relatif). */
export function maillagePoutre(p: ParamsPoutre): MaillageBrut {
  return balayer(contourSection(p.section), trousSection(p.section), [p.a.x, p.a.y, p.za], [p.b.x, p.b.y, p.zb], p.rotation.value);
}

export const longueurPoutre = (p: Pick<ParamsPoutre, "a" | "b" | "za" | "zb">): number => Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y, p.zb - p.za);

/** Maillage d'un assemblage structurel : platine (boîte) et boulons (cylindres) dans le repère du niveau. */
export function maillageAssemblageStructurel(p: ParamsAssemblageStructurel): MaillageBrut {
  const r = (p.angle.value * Math.PI) / 180;
  const u: V3 = [Math.cos(r), Math.sin(r), 0];
  const n: V3 = [-Math.sin(r), Math.cos(r), 0];
  const w: V3 = [0, 0, 1];
  const c: V3 = [p.position.x, p.position.y, p.z];
  const e = p.platine.epaisseur.value, l = p.platine.largeur.value, h = p.platine.hauteur.value;
  // Platine verticale, normale u (platine d'about, pied, éclisse) ; gousset et cornières : même convention déclarée.
  const parts = [boiteOrientee(c, u, n, w, e / 2, l / 2, h / 2)];
  if (p.boulons) {
    const { rangees, parRangee, diametre, entraxe, longueur } = p.boulons;
    for (let i = 0; i < rangees; i++) {
      for (let j = 0; j < parRangee; j++) {
        const y = (j - (parRangee - 1) / 2) * entraxe.value;
        const z = (i - (rangees - 1) / 2) * entraxe.value;
        const centre: V3 = [c[0] + n[0] * y + w[0] * z, c[1] + n[1] * y + w[1] * z, c[2] + n[2] * y + w[2] * z];
        const L = longueur.value / 2;
        parts.push(cylindre([centre[0] - u[0] * L, centre[1] - u[1] * L, centre[2] - u[2] * L], [centre[0] + u[0] * L, centre[1] + u[1] * L, centre[2] + u[2] * L], diametre.value / 2, 12));
      }
    }
  }
  return fusionner(...parts);
}

/** Longueur développée d'une barre (m) : polyligne, fermée pour un cadre ou un étrier. */
export function longueurBarre(p: Pick<ParamsArmature, "points" | "forme">): number {
  let L = 0;
  for (let i = 0; i + 1 < p.points.length; i++) L += Math.hypot(p.points[i + 1]!.x - p.points[i]!.x, p.points[i + 1]!.y - p.points[i]!.y);
  if ((p.forme === "cadre" || p.forme === "etrier") && p.points.length >= 3) L += Math.hypot(p.points[0]!.x - p.points[p.points.length - 1]!.x, p.points[0]!.y - p.points[p.points.length - 1]!.y);
  return L;
}

/** Maillage des barres d'une armature : une boîte carrée (côté = diamètre) par segment, répétée `nombre` fois (400 au plus, validateur) selon la normale au premier segment. */
export function maillageArmature(p: ParamsArmature): MaillageBrut {
  const d = p.diametre.value;
  const pts: Point2[] = p.forme === "cadre" || p.forme === "etrier" ? [...p.points, p.points[0]!] : p.points;
  if (pts.length < 2) return { positions: [], indices: [] };
  const first = pts[1]!, p0 = pts[0]!;
  const dir = Math.hypot(first.x - p0.x, first.y - p0.y) || 1;
  const nx = -(first.y - p0.y) / dir, ny = (first.x - p0.x) / dir;
  const parts: MaillageBrut[] = [];
  const nb = Math.max(1, p.nombre); // toutes les barres acceptées (≤ 400, validateur) sont dessinées
  for (let k = 0; k < nb; k++) {
    const off = p.espacement && nb > 1 ? k * p.espacement.value : 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a: V3 = [pts[i]!.x + nx * off, pts[i]!.y + ny * off, p.z];
      const b: V3 = [pts[i + 1]!.x + nx * off, pts[i + 1]!.y + ny * off, p.z];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue;
      parts.push(balayer([[-d / 2, -d / 2], [d / 2, -d / 2], [d / 2, d / 2], [-d / 2, d / 2]], [], a, b));
    }
  }
  return fusionner(...parts);
}

