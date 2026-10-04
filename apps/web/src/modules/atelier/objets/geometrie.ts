/**
 * Géométrie des objets d'architecture (L3a.3), pure : faces d'un mur selon son alignement, emprise des baies,
 * jonctions, hôte d'une baie trouvé **depuis l'état** (jamais depuis l'écran), aire d'un contour.
 *
 * Réutilise `decalagesFaces` d'`@parcours/atelier-model` (convention DA-02-07 figée par un test : normale gauche
 * n = (−dy, dx) / L ; « gauche » = corps côté −n ; « droite » = corps côté +n ; « axe » = ±e/2). Le contour de
 * `core-geometry` (`wallPolygon`) n'est pas utilisé : il porte une épaisseur de repli de 0,20 m (R3) et les
 * conventions `lineRef` du prototype, sans correspondance avec `AlignementMur`.
 */
import { decalagesFaces, estNonEvaluee, TOLERANCES, type EtatModele, type IdObjet, type ObjetBaie, type ObjetModele, type ObjetMur } from "@parcours/atelier-model";
import { aireSignee, distance, parametreProjection, scalaire, sous, type Vec } from "../plan2d/geometrie";

export const estMur = (o: ObjetModele | undefined): o is ObjetMur => o?.classe === "mur";
export const estBaie = (o: ObjetModele | undefined): o is ObjetBaie => o !== undefined && (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture");

/** Repère d'un mur : origine `a`, direction unitaire `u`, normale gauche `n`, longueur `L` ; `null` si dégénéré. */
export interface RepereMur {
  readonly a: Vec;
  readonly b: Vec;
  readonly u: Vec;
  readonly n: Vec;
  readonly L: number;
}

export function repereAxe(a: Vec, b: Vec): RepereMur | null {
  const L = distance(a, b);
  if (!(L >= TOLERANCES.longueurMin)) return null;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  return { a, b, u, n: { x: -u.y, y: u.x }, L };
}

/** Point à l'abscisse `s` (m) le long de l'axe, décalé de `k` (m) selon la normale gauche. */
export const surMur = (r: RepereMur, s: number, k = 0): Vec => ({ x: r.a.x + r.u.x * s + r.n.x * k, y: r.a.y + r.u.y * s + r.n.y * k });

/**
 * Décalages des faces gauche et droite (le long de n). Alignement « non évaluée » : dessiné sur l'axe
 * (hypothèse du prototype, DA-07-01, statut « à vérifier »). `null` si l'épaisseur est inexploitable.
 */
export function faces(mur: ObjetMur): { readonly gauche: number; readonly droite: number } | null {
  const al = mur.params.alignement;
  return decalagesFaces(estNonEvaluee(al) ? ({ ...mur, params: { ...mur.params, alignement: "axe" } } as ObjetMur) : mur);
}

/** Contour d'épaisseur d'un mur entre les abscisses `s0` et `s1` (m). */
export function contourMur(r: RepereMur, f: { gauche: number; droite: number }, s0 = 0, s1 = r.L): Vec[] {
  return [surMur(r, s0, f.gauche), surMur(r, s1, f.gauche), surMur(r, s1, f.droite), surMur(r, s0, f.droite)];
}

/** Intervalle d'une baie le long de l'axe de son mur (m, depuis `a`). */
export interface IntervalleBaie {
  readonly id: IdObjet;
  readonly debut: number;
  readonly fin: number;
}

const cacheBaies = new WeakMap<EtatModele, Map<IdObjet, ObjetBaie[]>>();

/** Baies hébergées par chaque mur (index calculé une fois par état). */
export function baiesDe(etat: EtatModele, murId: IdObjet): readonly ObjetBaie[] {
  let index = cacheBaies.get(etat);
  if (!index) {
    index = new Map();
    for (const o of Object.values(etat.objets)) {
      if (!estBaie(o)) continue;
      const l = index.get(o.params.murHoteId) ?? [];
      l.push(o);
      index.set(o.params.murHoteId, l);
    }
    cacheBaies.set(etat, index);
  }
  return index.get(murId) ?? [];
}

export function intervalleBaie(b: ObjetBaie, L: number): IntervalleBaie {
  const c = b.params.position.t * L;
  return { id: b.id, debut: c - b.params.largeur.value / 2, fin: c + b.params.largeur.value / 2 };
}

export function mursDuNiveau(etat: EtatModele, niveauId: IdObjet): ObjetMur[] {
  return Object.values(etat.objets).filter((o): o is ObjetMur => estMur(o) && o.niveauId === niveauId);
}

/** Projection d'un point sur l'axe d'un mur : abscisse `s` (m), `t` ∈ ℝ, écart à l'axe (m). */
export function projeter(m: ObjetMur, p: Vec): { s: number; t: number; ecart: number; r: RepereMur } | null {
  const r = repereAxe(m.params.axe.a, m.params.axe.b);
  if (!r) return null;
  const t = parametreProjection(r, p);
  const s = t * r.L;
  const q = surMur(r, s);
  return { s, t, ecart: distance(q, p), r };
}

/**
 * Mur hôte d'un point : le mur du niveau dont l'axe (segment) est le plus proche, dans la demi-épaisseur plus
 * `marge` (m). `prefere` : objet sous le pointeur, retenu s'il est un mur admissible.
 */
export function murSousPoint(etat: EtatModele, niveauId: IdObjet, p: Vec, marge: number, prefere: IdObjet | null = null): { mur: ObjetMur; s: number; t: number } | null {
  let meilleur: { mur: ObjetMur; s: number; t: number; d: number } | null = null;
  for (const m of mursDuNiveau(etat, niveauId)) {
    const pr = projeter(m, p);
    if (!pr || pr.t < 0 || pr.t > 1) continue;
    const e = m.params.epaisseur.value;
    if (pr.ecart > e / 2 + marge && m.id !== prefere) continue;
    if (pr.ecart > e + marge) continue;
    const d = m.id === prefere ? -1 : pr.ecart;
    if (!meilleur || d < meilleur.d || (d === meilleur.d && m.id < meilleur.mur.id)) meilleur = { mur: m, s: pr.s, t: pr.t, d };
  }
  return meilleur ? { mur: meilleur.mur, s: meilleur.s, t: meilleur.t } : null;
}

/**
 * Jonctions d'un mur : abscisses (m) où un autre mur du niveau le touche (extrémité de l'un sur l'axe de
 * l'autre), avec la demi-épaisseur de l'autre mur (zone où une baie serait « trop près d'une jonction »).
 */
export function jonctionsDe(etat: EtatModele, m: ObjetMur): { s: number; demi: number; murId: IdObjet }[] {
  const r = repereAxe(m.params.axe.a, m.params.axe.b);
  if (!r || m.niveauId === undefined) return [];
  const tol = TOLERANCES.longueurMin;
  const res: { s: number; demi: number; murId: IdObjet }[] = [];
  for (const autre of mursDuNiveau(etat, m.niveauId)) {
    if (autre.id === m.id) continue;
    const demi = autre.params.epaisseur.value / 2;
    const candidats: Vec[] = [autre.params.axe.a, autre.params.axe.b];
    // Une extrémité de ce mur posée sur l'axe de l'autre : jonction à cette extrémité.
    const ra = repereAxe(autre.params.axe.a, autre.params.axe.b);
    if (ra) for (const [q, s] of [[r.a, 0], [r.b, r.L]] as const) {
      const t = parametreProjection(ra, q);
      if (t >= -tol / ra.L && t <= 1 + tol / ra.L && distance(surMur(ra, t * ra.L), q) <= tol) res.push({ s, demi, murId: autre.id });
    }
    for (const q of candidats) {
      const s = scalaire(sous(q, r.a), r.u);
      if (s < -tol || s > r.L + tol) continue;
      if (distance(surMur(r, s), q) <= tol) res.push({ s, demi, murId: autre.id });
    }
  }
  return res;
}

/** Contrôle d'emprise d'une baie projetée (DA-07-02) : motif lisible, ou `null` si elle tient. */
export function controlerEmpriseBaie(etat: EtatModele, mur: ObjetMur, centre: number, largeur: number, ignorer: IdObjet | null = null): { cause: string; action: string; ids: IdObjet[] } | null {
  const r = repereAxe(mur.params.axe.a, mur.params.axe.b);
  if (!r) return { cause: "mur hôte dégénéré", action: "choisir un autre mur", ids: [mur.id] };
  const tol = TOLERANCES.longueurMin;
  const debut = centre - largeur / 2;
  const fin = centre + largeur / 2;
  if (largeur > r.L + tol) return { cause: `largeur ${largeur} m supérieure à la longueur du mur (${r.L} m)`, action: "réduire la largeur ou choisir un mur plus long", ids: [mur.id] };
  if (debut < -tol || fin > r.L + tol) return { cause: "sort du mur hôte", action: "rapprocher la baie du milieu du mur", ids: [mur.id] };
  for (const b of baiesDe(etat, mur.id)) {
    if (b.id === ignorer) continue;
    const i = intervalleBaie(b, r.L);
    if (fin > i.debut + tol && debut < i.fin - tol) return { cause: `chevauche ${b.id}`, action: "déplacer la baie ou réduire sa largeur", ids: [b.id, mur.id] };
  }
  for (const j of jonctionsDe(etat, mur)) {
    if (fin > j.s - j.demi + tol && debut < j.s + j.demi - tol) return { cause: `trop près de la jonction avec ${j.murId}`, action: "éloigner la baie de la jonction", ids: [j.murId, mur.id] };
  }
  return null;
}

export const aireContour = (contour: readonly Vec[]): number => Math.abs(aireSignee(contour));

/** Centre de gravité d'un contour (repli : moyenne des sommets si l'aire est nulle). */
export function centreContour(contour: readonly Vec[]): Vec {
  const A = aireSignee(contour);
  if (Math.abs(A) < 1e-12) {
    const n = Math.max(1, contour.length);
    return { x: contour.reduce((s, p) => s + p.x, 0) / n, y: contour.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i] as Vec;
    const q = contour[(i + 1) % contour.length] as Vec;
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}
