/**
 * Géométrie des pièces de bois (P2-4) — pure : balayage de la section rectangulaire le long de l'axe, panneau CLT
 * vertical (boîte le long de a → b), platine d'un assemblage bois–métal.
 */
import type { ParamsAssemblageBois, ParamsElementBois, ParamsPanneauClt } from "../../modele.js";
import { balayer, boiteOrientee, type MaillageBrut } from "../../geometrie-3d.js";
import { contourBois } from "./sections.js";

export function maillageElementBois(p: ParamsElementBois): MaillageBrut {
  return balayer(contourBois(p.section), [], [p.a.x, p.a.y, p.za], [p.b.x, p.b.y, p.zb], p.rotation.value);
}

export const longueurElementBois = (p: Pick<ParamsElementBois, "a" | "b" | "za" | "zb">): number => Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y, p.zb - p.za);

/** Panneau vertical : boîte d'épaisseur e centrée sur l'axe a → b, de z à z + hauteur. */
export function maillagePanneauClt(p: ParamsPanneauClt): MaillageBrut | null {
  if (p.pose !== "mur" || !p.a || !p.b || !p.hauteur) return null;
  const e = p.epaisseur.value, h = p.hauteur.value;
  return balayer([[-e / 2, 0], [e / 2, 0], [e / 2, h], [-e / 2, h]], [], [p.a.x, p.a.y, p.z], [p.b.x, p.b.y, p.z]);
}

/** Platine d'un assemblage bois–métal (verticale, normale x) ; rien pour un assemblage bois–bois. */
export function maillageAssemblageBois(p: ParamsAssemblageBois): MaillageBrut | null {
  if (!p.platine) return null;
  return boiteOrientee([p.position.x, p.position.y, p.z], [1, 0, 0], [0, 1, 0], [0, 0, 1], p.platine.epaisseur.value / 2, p.platine.largeur.value / 2, p.platine.hauteur.value / 2);
}

/** Volume d'un panneau CLT (m³) : aire × épaisseur. */
export function volumePanneauClt(p: ParamsPanneauClt): number {
  if (p.pose === "mur") return p.a && p.b && p.hauteur ? Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) * p.hauteur.value * p.epaisseur.value : 0;
  const aire = (poly: readonly { x: number; y: number }[]) => Math.abs(poly.reduce((acc, q, i) => { const r = poly[(i + 1) % poly.length]!; return acc + q.x * r.y - r.x * q.y; }, 0)) / 2;
  return (aire(p.contour) - p.trous.reduce((s, t) => s + aire(t), 0)) * p.epaisseur.value;
}
