/**
 * Géométrie des réseaux (P2-5) — pure : segments balayés le long d'une polyligne 3D (tube creux ou gaine
 * rectangulaire), raccords (un bras par port), vannes (corps sur l'axe), équipements (boîte posée), supports
 * (symbole). Maillages dans le repère du niveau (z relatif).
 */
import type { ParamsEquipementReseau, ParamsRaccordReseau, ParamsSegmentReseau, ParamsSupportReseau, ParamsVanne, Point3Reseau, SectionReseau } from "../../modele.js";
import { balayer, boiteOrientee, fusionner, type MaillageBrut, type V3 } from "../../geometrie-3d.js";
import type { Point2 } from "../../unites.js";
import { encombrement } from "./sections.js";

const v3 = (p: Point3Reseau): V3 => [p.x, p.y, p.z];

function contourSection(s: SectionReseau, facettes = 16): [number, number][] {
  if (s.forme === "rectangulaire") { const l = s.largeur.value / 2, h = s.hauteur.value / 2; return [[-l, -h], [l, -h], [l, h], [-l, h]]; }
  const r = s.diametre.value / 2;
  return Array.from({ length: facettes }, (_, k) => [r * Math.cos((2 * Math.PI * k) / facettes), r * Math.sin((2 * Math.PI * k) / facettes)]);
}
function trousSection(s: SectionReseau, facettes = 16): [number, number][][] {
  if (s.forme !== "circulaire" || !s.epaisseur) return [];
  const r = s.diametre.value / 2 - s.epaisseur.value;
  if (r <= 0) return [];
  return [Array.from({ length: facettes }, (_, k) => [r * Math.cos((2 * Math.PI * k) / facettes), r * Math.sin((2 * Math.PI * k) / facettes)])];
}

/** Un corps balayé entre deux points 3D ; un tube creux est fermé aux extrémités par sa couronne (tronçon par tronçon). */
function troncon(s: SectionReseau, a: V3, b: V3): MaillageBrut {
  return balayer(contourSection(s), trousSection(s), a, b);
}

export function longueurSegment(p: Pick<ParamsSegmentReseau, "sommets">): number {
  let L = 0;
  for (let i = 1; i < p.sommets.length; i++) L += Math.hypot(p.sommets[i]!.x - p.sommets[i - 1]!.x, p.sommets[i]!.y - p.sommets[i - 1]!.y, p.sommets[i]!.z - p.sommets[i - 1]!.z);
  return L;
}

export function maillageSegmentReseau(p: ParamsSegmentReseau): MaillageBrut {
  const parts: MaillageBrut[] = [];
  for (let i = 1; i < p.sommets.length; i++) {
    const a = v3(p.sommets[i - 1]!), b = v3(p.sommets[i]!);
    if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-9) continue;
    parts.push(troncon(p.section, a, b));
  }
  return fusionner(...parts);
}

/** Raccord : un bras plein de la section du port, du centre au port. */
export function maillageRaccordReseau(p: ParamsRaccordReseau): MaillageBrut {
  const c: V3 = [p.position.x, p.position.y, p.z];
  const parts = p.ports.map((port) => {
    const s = port.section ?? p.section;
    const fin: V3 = [c[0] + port.dx, c[1] + port.dy, c[2] + port.dz];
    if (Math.hypot(port.dx, port.dy, port.dz) < 1e-9) return null;
    return balayer(contourSection(s), [], c, fin);
  }).filter((m): m is MaillageBrut => !!m);
  return fusionner(...parts);
}

export function repereVanne(p: Pick<ParamsVanne, "angle">): { u: V3; n: V3 } {
  const r = (p.angle.value * Math.PI) / 180;
  return { u: [Math.cos(r), Math.sin(r), 0], n: [-Math.sin(r), Math.cos(r), 0] };
}

/** Vanne : corps de la section sur la longueur face à face, boîte de commande au centre (symbole, largeur de la section). */
export function maillageVanne(p: ParamsVanne): MaillageBrut {
  const { u, n } = repereVanne(p);
  const c: V3 = [p.position.x, p.position.y, p.z];
  const L = p.longueur.value / 2;
  const a: V3 = [c[0] - u[0] * L, c[1] - u[1] * L, c[2]];
  const b: V3 = [c[0] + u[0] * L, c[1] + u[1] * L, c[2]];
  const { dn, dw } = encombrement(p.section);
  const corps = boiteOrientee(c, u, n, [0, 0, 1], Math.min(L, dn), dn, dw);
  return fusionner(troncon(p.section, a, b), corps);
}

export function repereEquipement(p: Pick<ParamsEquipementReseau, "angle">): { u: V3; n: V3 } {
  const r = (p.angle.value * Math.PI) / 180;
  return { u: [Math.cos(r), Math.sin(r), 0], n: [-Math.sin(r), Math.cos(r), 0] };
}

/** Équipement : boîte longueur × largeur × hauteur posée sur z, tournée de l'angle, centrée en plan sur la position. */
export function maillageEquipementReseau(p: ParamsEquipementReseau): MaillageBrut {
  const { u, n } = repereEquipement(p);
  const h = p.hauteur.value;
  return boiteOrientee([p.position.x, p.position.y, p.z + h / 2], u, n, [0, 0, 1], p.longueur.value / 2, p.largeur.value / 2, h / 2);
}

/** Support : symbole — collier / rail / console : petite boîte au point ; suspente : tige verticale de la longueur saisie. */
export function maillageSupportReseau(p: ParamsSupportReseau, section: SectionReseau | null): MaillageBrut {
  const { dn, dw } = section ? encombrement(section) : { dn: 0.025, dw: 0.025 };
  const c: V3 = [p.position.x, p.position.y, p.z];
  const base = boiteOrientee(c, [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.02, dn + 0.01, dw + 0.01);
  if (p.type !== "suspente" || !p.longueur) return base;
  const L = p.longueur.value;
  return fusionner(base, boiteOrientee([c[0], c[1], c[2] + dw + L / 2], [0, 0, 1], [1, 0, 0], [0, 1, 0], L / 2, 0.005, 0.005));
}

/** Emprise en plan d'un équipement (rectangle tourné). */
export function empriseEquipement(p: ParamsEquipementReseau): Point2[] {
  const { u, n } = repereEquipement(p);
  const L = p.longueur.value / 2, W = p.largeur.value / 2;
  return ([[-L, -W], [L, -W], [L, W], [-L, W]] as [number, number][]).map(([a, b]) => ({ x: Math.round((p.position.x + u[0] * a + n[0] * b) * 1e6) / 1e6, y: Math.round((p.position.y + u[1] * a + n[1] * b) * 1e6) / 1e6, frame: "local" as const, unit: "m" as const }));
}

/** Tracé en plan d'un segment (projection des sommets). */
export const traceSegment = (p: Pick<ParamsSegmentReseau, "sommets">): Point2[] => p.sommets.map((s) => ({ x: s.x, y: s.y, frame: "local" as const, unit: "m" as const }));
