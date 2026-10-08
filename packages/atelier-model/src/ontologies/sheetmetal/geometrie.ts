/**
 * Géométrie d'une tôle pliée (P2-4) — pure : face de base (boîte), zones pliées (arcs à épaisseur) et ailes, dans
 * le repère du niveau (z relatif). La zone pliée est discrétisée en 8 segments sur la fibre intérieure et extérieure.
 */
import type { ParamsTole, PliTole } from "../../modele.js";
import { balayer, fusionner, type MaillageBrut, type V3 } from "../../geometrie-3d.js";
import type { Point2 } from "../../unites.js";

/** Profil [o, z] (o : vers l'extérieur du bord, z : vers le haut) d'une zone pliée + aile, épaisseur t, en sens direct. */
export function profilPli(pli: PliTole, t: number, rayon: number): [number, number][] {
  const angle = (pli.angle.value * Math.PI) / 180;
  const s = Math.sign(angle) || 1;
  const th = Math.abs(angle);
  const n = 8;
  const ri = rayon, ro = rayon + t;
  // Centre de courbure au-dessus (s > 0) ou au-dessous du bord, à la distance ri de la face intérieure.
  const cz = s > 0 ? t + ri : -ri;
  const interieur: [number, number][] = [], exterieur: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const a = (th * k) / n;
    // Point de la fibre à rayon ρ, angle a autour du centre (0, cz), partant de la face (o = 0).
    const pt = (rho: number): [number, number] => [rho * Math.sin(a), cz - s * rho * Math.cos(a)];
    interieur.push(pt(s > 0 ? ri : ro)); // face qui touche le centre : intérieure pour un pli vers le haut
    exterieur.push(pt(s > 0 ? ro : ri));
  }
  // Direction de l'aile après le pli : tangente en fin d'arc.
  const dir: [number, number] = [Math.cos(th), s * Math.sin(th)];
  const Lf = pli.longueur.value;
  const fin = (p: [number, number]): [number, number] => [p[0] + dir[0] * Lf, p[1] + dir[1] * Lf];
  const i1 = interieur[interieur.length - 1]!, e1 = exterieur[exterieur.length - 1]!;
  // Contour : face basse (extérieure si pli vers le haut) de o=0 vers l'aile, bout de l'aile, face haute en retour.
  const bas = s > 0 ? exterieur : interieur, haut = s > 0 ? interieur : exterieur;
  const poly: [number, number][] = [...bas, fin(s > 0 ? e1 : i1), fin(s > 0 ? i1 : e1), ...haut.slice().reverse()];
  return poly;
}

const bordInfo = (bord: PliTole["bord"], L: number, W: number): { origine: [number, number]; dir: [number, number]; ext: [number, number]; longueurBord: number } => {
  switch (bord) {
    case "x1": return { origine: [L / 2, -W / 2], dir: [0, 1], ext: [1, 0], longueurBord: W };
    case "x0": return { origine: [-L / 2, W / 2], dir: [0, -1], ext: [-1, 0], longueurBord: W };
    case "y1": return { origine: [L / 2, W / 2], dir: [-1, 0], ext: [0, 1], longueurBord: L };
    case "y0": return { origine: [-L / 2, -W / 2], dir: [1, 0], ext: [0, -1], longueurBord: L };
  }
};

/** Maillage de la tôle pliée dans le repère du niveau. */
export function maillageTole(p: ParamsTole): MaillageBrut {
  const L = p.longueur.value, W = p.largeur.value, t = p.epaisseur.value;
  const r = (p.angle.value * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const monde = (x: number, y: number, z: number): V3 => [p.position.x + c * x - s * y, p.position.y + s * x + c * y, p.z + z];
  // Face de base : boîte L × W × t, balayée le long de x local.
  const base = balayer([[-W / 2, 0], [W / 2, 0], [W / 2, t], [-W / 2, t]], [], monde(-L / 2, 0, 0), monde(L / 2, 0, 0));
  const parts = [base];
  for (const pli of p.plis) {
    const b = bordInfo(pli.bord, L, W);
    const prof = profilPli(pli, t, pli.rayon?.value ?? p.rayonInterieur.value);
    const a: V3 = monde(b.origine[0], b.origine[1], 0);
    const fin: V3 = monde(b.origine[0] + b.dir[0] * b.longueurBord, b.origine[1] + b.dir[1] * b.longueurBord, 0);
    // `balayer` prend n horizontal perpendiculaire à u : n = (-u.y, u.x) ; le profil est exprimé « vers l'extérieur » :
    // on retourne o si n pointe vers l'intérieur de la tôle.
    const ux = c * b.dir[0] - s * b.dir[1], uy = s * b.dir[0] + c * b.dir[1];
    const nx = -uy, ny = ux;
    const ex = c * b.ext[0] - s * b.ext[1], ey = s * b.ext[0] + c * b.ext[1];
    const signe = nx * ex + ny * ey >= 0 ? 1 : -1;
    parts.push(balayer(prof.map(([o, z]) => [o * signe, z] as [number, number]), [], a, fin));
  }
  return fusionner(...parts);
}

/** Emprise en plan de la face de base et des ailes (repère du niveau), pour le dessin et l'accrochage. */
export function empriseTole(p: ParamsTole): Point2[] {
  const L = p.longueur.value, W = p.largeur.value;
  const ext = { x0: 0, x1: 0, y0: 0, y1: 0 } as Record<PliTole["bord"], number>;
  for (const pli of p.plis) ext[pli.bord] = Math.max(ext[pli.bord], Math.abs(Math.cos((pli.angle.value * Math.PI) / 180)) * pli.longueur.value + (pli.rayon?.value ?? p.rayonInterieur.value) + p.epaisseur.value);
  const r = (p.angle.value * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const q = (x: number, y: number): Point2 => ({ x: Math.round((p.position.x + c * x - s * y) * 1e6) / 1e6, y: Math.round((p.position.y + s * x + c * y) * 1e6) / 1e6, frame: "local", unit: "m" });
  return [q(-L / 2 - ext.x0, -W / 2 - ext.y0), q(L / 2 + ext.x1, -W / 2 - ext.y0), q(L / 2 + ext.x1, W / 2 + ext.y1), q(-L / 2 - ext.x0, W / 2 + ext.y1)];
}
