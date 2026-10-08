/**
 * Ossatures bois à génération contrôlée (P2-4, DA-09-02, 07, 08) — pur. `planOssatureMur` : lisses basse et haute,
 * montants à l'entraxe (premier et dernier affleurants), montants de rive des baies, linteau et appui ; les montants
 * qui traverseraient une baie sont omis (pas de montant court, déclaré). `planCharpente` : chevrons à l'entraxe sur
 * chaque pan (de l'égout au faîtage), pannes sablières sur les rives basses, panne faîtière. Les éléments sont décrits
 * par leur axe (a → b, za, zb), leur rôle et leur section ; rien n'est dessiné avant l'accord (`ossature.generer`).
 */
import type { GeometrieToiture } from "../../projection/maillage.js";
import type { Point2 } from "../../unites.js";
import type { RoleBois, SectionBois } from "../../modele.js";

export interface ElementPlanifie { role: RoleBois; a: Point2; b: Point2; za: number; zb: number; section: SectionBois; rotation: number; repere: string }
export interface BaieMur { s0: number; s1: number; zb: number; zt: number }

const P = (x: number, y: number): Point2 => ({ x: Math.round(x * 1e6) / 1e6, y: Math.round(y * 1e6) / 1e6, frame: "local", unit: "m" });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function planOssatureMur(mur: { a: Point2; b: Point2 }, hauteur: number, baies: readonly BaieMur[], entraxe: number, montant: SectionBois, lisse: SectionBois): ElementPlanifie[] {
  const L = Math.hypot(mur.b.x - mur.a.x, mur.b.y - mur.a.y);
  if (L < 1e-9 || hauteur <= 0 || entraxe <= 0) return [];
  const u = { x: (mur.b.x - mur.a.x) / L, y: (mur.b.y - mur.a.y) / L };
  const angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  const at = (s: number) => P(mur.a.x + u.x * s, mur.a.y + u.y * s);
  const hl = lisse.hauteur.value, lm = montant.largeur.value;
  const out: ElementPlanifie[] = [];
  let n = 0;
  const rep = (role: RoleBois) => `${role.slice(0, 2).toUpperCase()}${String(++n).padStart(2, "0")}`;
  // Lisses basse et haute sur toute la longueur.
  out.push({ role: "lisse", a: at(0), b: at(L), za: r6(hl / 2), zb: r6(hl / 2), section: lisse, rotation: 0, repere: rep("lisse") });
  out.push({ role: "sabliere", a: at(0), b: at(L), za: r6(hauteur - hl / 2), zb: r6(hauteur - hl / 2), section: lisse, rotation: 0, repere: rep("sabliere") });
  // Montants : positions candidates à l'entraxe, premier et dernier affleurants.
  const positions = new Set<number>();
  for (let s = lm / 2; s < L - lm / 2 - 1e-9; s += entraxe) positions.add(r6(s));
  positions.add(r6(L - lm / 2));
  const dansBaie = (s: number) => baies.some((b) => s + lm / 2 > b.s0 + 1e-9 && s - lm / 2 < b.s1 - 1e-9);
  const montantPlein = (s: number, role: RoleBois) => out.push({ role, a: at(s), b: at(s), za: r6(hl), zb: r6(hauteur - hl), section: montant, rotation: angle, repere: rep(role) });
  for (const s of [...positions].sort((x, y) => x - y)) if (!dansBaie(s)) montantPlein(s, "montant");
  // Baies : montants de rive, linteau, appui (fenêtre).
  for (const b of [...baies].sort((x, y) => x.s0 - y.s0)) {
    const sg = r6(b.s0 - lm / 2), sd = r6(b.s1 + lm / 2);
    if (sg > lm / 2 - 1e-9 && !positions.has(sg)) montantPlein(sg, "montant");
    if (sd < L - lm / 2 + 1e-9 && !positions.has(sd)) montantPlein(sd, "montant");
    const zl = Math.min(hauteur - hl, b.zt + hl / 2);
    out.push({ role: "linteau", a: at(Math.max(0, b.s0 - lm)), b: at(Math.min(L, b.s1 + lm)), za: r6(zl), zb: r6(zl), section: lisse, rotation: 0, repere: rep("linteau") });
    if (b.zb > hl + 1e-9) out.push({ role: "appui", a: at(Math.max(0, b.s0 - lm)), b: at(Math.min(L, b.s1 + lm)), za: r6(b.zb - hl / 2), zb: r6(b.zb - hl / 2), section: lisse, rotation: 0, repere: rep("appui") });
  }
  return out;
}

/** Intersection d'une droite s = const (repère u, n du pan) avec un polygone : étendue [dmin, dmax] en d, ou null. */
function etendueD(poly: readonly { x: number; y: number }[], s: (p: { x: number; y: number }) => number, d: (p: { x: number; y: number }) => number, sv: number): [number, number] | null {
  const ds: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const sa = s(a) - sv, sb = s(b) - sv;
    if ((sa <= 0 && sb > 0) || (sa > 0 && sb <= 0)) { const t = sa / (sa - sb); ds.push(d(a) + (d(b) - d(a)) * t); }
  }
  if (ds.length < 2) return null;
  return [Math.min(...ds), Math.max(...ds)];
}

export function planCharpente(toit: { contour: readonly Point2[]; z0: number }, geo: GeometrieToiture, entraxe: number, chevron: SectionBois, panne: SectionBois): ElementPlanifie[] {
  const c = toit.contour;
  if (c.length < 3 || entraxe <= 0) return [];
  const e0 = c[0]!, e1 = c[1]!;
  const L = Math.hypot(e1.x - e0.x, e1.y - e0.y);
  if (L < 1e-9) return [];
  const u = { x: (e1.x - e0.x) / L, y: (e1.y - e0.y) / L };
  const aireS = c.reduce((acc, p, i) => { const q = c[(i + 1) % c.length]!; return acc + p.x * q.y - q.x * p.y; }, 0);
  let nv = { x: -u.y, y: u.x };
  if (aireS < 0) nv = { x: -nv.x, y: -nv.y };
  const s = (p: { x: number; y: number }) => (p.x - e0.x) * u.x + (p.y - e0.y) * u.y;
  const d = (p: { x: number; y: number }) => (p.x - e0.x) * nv.x + (p.y - e0.y) * nv.y;
  const at = (sv: number, dv: number) => P(e0.x + u.x * sv + nv.x * dv, e0.y + u.y * sv + nv.y * dv);
  const out: ElementPlanifie[] = [];
  let n = 0;
  const rep = (role: RoleBois) => `${role.slice(0, 2).toUpperCase()}${String(++n).padStart(2, "0")}`;
  const hc = chevron.hauteur.value, hp = panne.hauteur.value;
  // Pannes sablières : arêtes du contour dont les deux extrémités sont à l'égout (hauteur nulle).
  for (let i = 0; i < c.length; i++) {
    const a = c[i]!, b = c[(i + 1) % c.length]!;
    const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (geo.hauteur(a) < 1e-9 && geo.hauteur(b) < 1e-9 && geo.hauteur(milieu) < 1e-9 && Math.hypot(b.x - a.x, b.y - a.y) > 1e-9) out.push({ role: "sabliere", a: P(a.x, a.y), b: P(b.x, b.y), za: r6(toit.z0 - hp / 2), zb: r6(toit.z0 - hp / 2), section: panne, rotation: 0, repere: rep("sabliere") });
  }
  // Panne faîtière.
  if (geo.faitage) {
    const [fa, fb] = geo.faitage;
    const zf = toit.z0 + geo.hauteur(fa) - hp / 2;
    out.push({ role: "faitiere", a: P(fa.x, fa.y), b: P(fb.x, fb.y), za: r6(zf), zb: r6(zf), section: panne, rotation: 0, repere: rep("faitiere") });
  }
  // Chevrons : sur chaque pan, lignes s = const à l'entraxe, de la rive basse à la rive haute du pan.
  for (const pan of geo.pans) {
    const ss = pan.map(s);
    const smin = Math.min(...ss), smax = Math.max(...ss);
    const lc = chevron.largeur.value;
    const pos: number[] = [];
    for (let sv = smin + lc / 2; sv < smax - lc / 2 - 1e-9; sv += entraxe) pos.push(sv);
    pos.push(smax - lc / 2);
    for (const sv of pos) {
      const ext = etendueD(pan, s, d, sv);
      if (!ext || ext[1] - ext[0] < 1e-6) continue;
      const pa = at(sv, ext[0]), pb = at(sv, ext[1]);
      const za = toit.z0 + geo.hauteur(pa) - hc / 2, zb = toit.z0 + geo.hauteur(pb) - hc / 2;
      // Du bas vers le haut.
      const bas = za <= zb;
      out.push({ role: "chevron", a: bas ? pa : pb, b: bas ? pb : pa, za: r6(Math.min(za, zb)), zb: r6(Math.max(za, zb)), section: chevron, rotation: 0, repere: rep("chevron") });
    }
  }
  return out;
}
