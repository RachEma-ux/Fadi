/**
 * Maillages 3D dérivés du modèle typé (cahier §5.3 ; R13 : la géométrie canonique est paramétrique, le maillage
 * n'est qu'une représentation recalculée). Pur, sans three.js ni DOM : le rendu (WebGL2 / WebGPU) ne fait que
 * copier ces tampons. Repère local, mètres, z vers le haut (altitude du niveau + décalage de base).
 *
 * Conventions verticales reprises du prototype (moteur V14 : `vertical()`, `fdPathGeometry`) : un mur monte de
 * l'altitude de son niveau jusqu'au niveau haut s'il est donné, sinon de sa hauteur ; une dalle, une toiture et un
 * solide montent de `decalageBase` sur leur épaisseur / hauteur. Une hauteur absente (« non évaluée ») ne
 * produit aucun volume : l'objet reste en plan, rien n'est inventé.
 */
import { aireSignee, facesMur, normalise, perp, pointsArc, sub, type Vec } from "../geometrie.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../modele.js";

export interface Maillage {
  objetId: string;
  classe: OccurrenceQuelconque["classe"];
  niveauId: string | null;
  /** x, y, z à la suite. */
  positions: number[];
  /** Triangles (indices de sommets). */
  indices: number[];
  couleur: string;
  opacite: number;
}

export const COULEURS_3D: Record<string, string> = {
  mur: "#d9d4c7",
  porte: "#8a6a3f",
  fenetre: "#9cc3d5",
  dalle: "#bfb7a6",
  toiture: "#9c8f7a",
  escalier: "#c7bba3",
  poteau: "#7d8f86",
  solide: "#a9b9b0",
  piece: "#e8d9b0",
  espace: "#cfe0d4",
};

// ---------------------------------------------------------------------------
// Triangulation d'un polygone avec trous (oreilles + ponts vers les trous)
// ---------------------------------------------------------------------------

interface Sommet {
  x: number;
  y: number;
  i: number;
}

function orienter(poly: readonly Vec[], sensDirect: boolean): Vec[] {
  const direct = aireSignee(poly) > 0;
  return direct === sensDirect ? [...poly] : [...poly].reverse();
}

const croix = (o: Sommet, a: Sommet, b: Sommet) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function dansTriangle(p: Sommet, a: Sommet, b: Sommet, c: Sommet): boolean {
  const d1 = croix(a, b, p);
  const d2 = croix(b, c, p);
  const d3 = croix(c, a, p);
  return d1 >= -1e-12 && d2 >= -1e-12 && d3 >= -1e-12;
}

/** Fusionne chaque trou dans le contour par un pont vers un sommet visible (méthode d'Eberly). */
function fusionnerTrous(contour: Sommet[], trous: Sommet[][]): Sommet[] {
  let anneau = contour;
  const ordonnes = [...trous].filter((t) => t.length >= 3).sort((a, b) => Math.max(...b.map((p) => p.x)) - Math.max(...a.map((p) => p.x)));
  for (const trou of ordonnes) {
    let im = 0;
    for (let k = 1; k < trou.length; k++) if (trou[k]!.x > trou[im]!.x) im = k;
    const m = trou[im]!;
    // Rayon horizontal vers +x : arête la plus proche.
    let meilleurX = Infinity;
    let pont = -1;
    for (let k = 0; k < anneau.length; k++) {
      const a = anneau[k]!;
      const b = anneau[(k + 1) % anneau.length]!;
      if ((a.y - m.y) * (b.y - m.y) > 0 || a.y === b.y) continue;
      const x = a.x + ((m.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (x >= m.x - 1e-12 && x < meilleurX) {
        meilleurX = x;
        pont = a.x > b.x ? k : (k + 1) % anneau.length;
      }
    }
    if (pont < 0) {
      // Trou hors du contour : ignoré (le contour reste plein plutôt que faux).
      continue;
    }
    // Un sommet réflexe dans le triangle (m, intersection, pont) masquerait le pont : prendre celui d'angle minimal.
    const p = anneau[pont]!;
    const inter: Sommet = { x: meilleurX, y: m.y, i: -1 };
    let angleMin = Infinity;
    for (let k = 0; k < anneau.length; k++) {
      const q = anneau[k]!;
      if (q === p || q.x < m.x) continue;
      if (dansTriangle(q, m, inter, p) || dansTriangle(q, m, p, inter)) {
        const angle = Math.abs(Math.atan2(q.y - m.y, q.x - m.x));
        if (angle < angleMin) {
          angleMin = angle;
          pont = k;
        }
      }
    }
    const debut = anneau.slice(0, pont + 1);
    const fin = anneau.slice(pont);
    const tour = [...trou.slice(im), ...trou.slice(0, im + 1)];
    anneau = [...debut, ...tour, ...fin];
  }
  return anneau;
}

/**
 * Triangule un contour (et ses trous) : renvoie des indices dans le tableau `[...contour, ...trous.flat()]`.
 * Contour remis en sens direct, trous en sens indirect ; une boucle dégénérée se termine en éventail.
 */
export function trianguler(contour: readonly Vec[], trous: readonly (readonly Vec[])[] = []): number[] {
  if (contour.length < 3) return [];
  const sommets: Vec[] = [...contour, ...trous.flat()];
  const ext = orienter(contour, true);
  const sensOriginal = aireSignee(contour) > 0;
  let base = 0;
  const indexExt = (k: number) => (sensOriginal ? k : contour.length - 1 - k);
  const anneauExt: Sommet[] = ext.map((p, k) => ({ x: p.x, y: p.y, i: indexExt(k) }));
  base = contour.length;
  const anneauxTrous: Sommet[][] = [];
  for (const t of trous) {
    const direct = aireSignee(t) > 0;
    const o = direct ? [...t].reverse() : [...t];
    const idx = (k: number) => base + (direct ? t.length - 1 - k : k);
    anneauxTrous.push(o.map((p, k) => ({ x: p.x, y: p.y, i: idx(k) })));
    base += t.length;
  }
  void sommets;
  const anneau = fusionnerTrous(anneauExt, anneauxTrous);
  const out: number[] = [];
  const restants = [...anneau];
  let garde = 0;
  while (restants.length > 3 && garde++ < 100000) {
    let trouve = false;
    for (let k = 0; k < restants.length; k++) {
      const a = restants[(k + restants.length - 1) % restants.length]!;
      const b = restants[k]!;
      const c = restants[(k + 1) % restants.length]!;
      if (croix(a, b, c) <= 1e-14) continue; // réflexe ou plat
      let contient = false;
      for (const q of restants) {
        if (q === a || q === b || q === c || (q.x === a.x && q.y === a.y) || (q.x === b.x && q.y === b.y) || (q.x === c.x && q.y === c.y)) continue;
        if (dansTriangle(q, a, b, c)) {
          contient = true;
          break;
        }
      }
      if (contient) continue;
      out.push(a.i, b.i, c.i);
      restants.splice(k, 1);
      trouve = true;
      break;
    }
    if (!trouve) {
      // Polygone dégénéré (auto-intersection, points alignés) : on retire un sommet plat ou on termine en éventail.
      const plat = restants.findIndex((b, k) => Math.abs(croix(restants[(k + restants.length - 1) % restants.length]!, b, restants[(k + 1) % restants.length]!)) <= 1e-14);
      if (plat >= 0) {
        restants.splice(plat, 1);
        continue;
      }
      for (let k = 1; k + 1 < restants.length; k++) out.push(restants[0]!.i, restants[k]!.i, restants[k + 1]!.i);
      return out;
    }
  }
  if (restants.length === 3 && croix(restants[0]!, restants[1]!, restants[2]!) > 1e-14) out.push(restants[0]!.i, restants[1]!.i, restants[2]!.i);
  return out;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

class Tampon {
  positions: number[] = [];
  indices: number[] = [];
  sommet(x: number, y: number, z: number): number {
    this.positions.push(x, y, z);
    return this.positions.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, c, a, c, d);
  }
  /** Prisme droit d'un contour (avec trous) entre z0 et z1. */
  prisme(contour: readonly Vec[], trous: readonly (readonly Vec[])[], z0: number, z1: number): void {
    if (contour.length < 3 || !(z1 > z0)) return;
    const anneaux = [contour, ...trous];
    const tri = trianguler(contour, trous);
    const plats = anneaux.flat();
    const bas = plats.map((p) => this.sommet(p.x, p.y, z0));
    const haut = plats.map((p) => this.sommet(p.x, p.y, z1));
    for (let k = 0; k < tri.length; k += 3) {
      this.indices.push(haut[tri[k]!]!, haut[tri[k + 1]!]!, haut[tri[k + 2]!]!);
      this.indices.push(bas[tri[k]!]!, bas[tri[k + 2]!]!, bas[tri[k + 1]!]!);
    }
    let decal = 0;
    for (const r of anneaux) {
      for (let k = 0; k < r.length; k++) {
        const i = decal + k;
        const j = decal + ((k + 1) % r.length);
        this.quad(bas[i]!, bas[j]!, haut[j]!, haut[i]!);
      }
      decal += r.length;
    }
  }
  /** Surface plane horizontale (pièce, espace). */
  surface(contour: readonly Vec[], trous: readonly (readonly Vec[])[], z: number): void {
    if (contour.length < 3) return;
    const tri = trianguler(contour, trous);
    const ids = [contour, ...trous].flat().map((p) => this.sommet(p.x, p.y, z));
    for (let k = 0; k < tri.length; k += 3) this.indices.push(ids[tri[k]!]!, ids[tri[k + 1]!]!, ids[tri[k + 2]!]!);
  }
  /** Boîte orientée le long d'un axe : abscisses s0..s1 sur `u`, décalages o0..o1 sur `n`, hauteurs z0..z1. */
  boite(origine: Vec, u: Vec, n: Vec, s0: number, s1: number, o0: number, o1: number, z0: number, z1: number): void {
    if (!(s1 > s0) || !(o1 > o0) || !(z1 > z0)) return;
    const p = (s: number, o: number): Vec => ({ x: origine.x + u.x * s + n.x * o, y: origine.y + u.y * s + n.y * o });
    this.prisme([p(s0, o0), p(s1, o0), p(s1, o1), p(s0, o1)], [], z0, z1);
  }
}

// ---------------------------------------------------------------------------
// Par classe
// ---------------------------------------------------------------------------

function altitude(etat: ModeleAtelier, niveauId: string | null): number {
  return niveauId ? (etat.niveaux[niveauId]?.elevation ?? 0) : 0;
}

/** Intervalles pleins de [z0, z1] privés de l'union des vides. */
function soustraire(z0: number, z1: number, vides: [number, number][]): [number, number][] {
  let pleins: [number, number][] = [[z0, z1]];
  for (const [a, b] of vides) {
    const suivants: [number, number][] = [];
    for (const [c, d] of pleins) {
      if (b <= c || a >= d) suivants.push([c, d]);
      else {
        if (a > c) suivants.push([c, a]);
        if (b < d) suivants.push([b, d]);
      }
    }
    pleins = suivants;
  }
  return pleins.filter(([a, b]) => b - a > 1e-6);
}

/** Étendue verticale d'un mur (null : hauteur non évaluée, pas de volume). */
export function etendueMur(etat: ModeleAtelier, mur: Occurrence<"mur">): [number, number] | null {
  const z0 = altitude(etat, mur.niveauId);
  if (mur.params.niveauHautId && etat.niveaux[mur.params.niveauHautId]) {
    const z1 = etat.niveaux[mur.params.niveauHautId]!.elevation;
    return z1 > z0 ? [z0, z1] : null;
  }
  if (!mur.params.hauteur) return null;
  return [z0, z0 + mur.params.hauteur.value];
}

function murMaillage(etat: ModeleAtelier, mur: Occurrence<"mur">, t: Tampon): void {
  const etendue = etendueMur(etat, mur);
  if (!etendue) return;
  const [z0, z1] = etendue;
  const { a, b } = mur.params;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const f = facesMur(a, b, mur.params.epaisseur.value, mur.params.alignement);
  const oG = (f.gauche[0].x - a.x) * n.x + (f.gauche[0].y - a.y) * n.y;
  const oD = (f.droite[0].x - a.x) * n.x + (f.droite[0].y - a.y) * n.y;
  const [o0, o1] = [Math.min(oG, oD), Math.max(oG, oD)];
  // Vides des ouvertures hébergées, en abscisse le long de l'axe.
  const vides: { s0: number; s1: number; zb: number; zt: number }[] = [];
  for (const o of Object.values(etat.objets)) {
    if ((o.classe !== "porte" && o.classe !== "fenetre" && o.classe !== "ouverture") || o.params.murHoteId !== mur.id) continue;
    const c = o.params.position * L;
    const zb = z0 + (o.params.allege?.value ?? 0);
    vides.push({ s0: Math.max(0, c - o.params.largeur.value / 2), s1: Math.min(L, c + o.params.largeur.value / 2), zb, zt: zb + o.params.hauteur.value });
  }
  const coupures = [...new Set([0, L, ...vides.flatMap((v) => [v.s0, v.s1])])].filter((s) => s >= 0 && s <= L).sort((x, y) => x - y);
  for (let k = 0; k + 1 < coupures.length; k++) {
    const s0 = coupures[k]!;
    const s1 = coupures[k + 1]!;
    if (s1 - s0 < 1e-6) continue;
    const milieu = (s0 + s1) / 2;
    const ici = vides.filter((v) => v.s0 <= milieu && v.s1 >= milieu).map((v) => [v.zb, v.zt] as [number, number]);
    for (const [za, zb] of soustraire(z0, z1, ici)) t.boite(a, u, n, s0, s1, o0, o1, za, zb);
  }
}

function ouvertureMaillage(etat: ModeleAtelier, o: Occurrence<"porte" | "fenetre" | "ouverture">, t: Tampon): void {
  if (o.classe === "ouverture") return; // baie libre : le vide suffit
  const mur = etat.objets[o.params.murHoteId];
  if (!mur || mur.classe !== "mur") return;
  const etendue = etendueMur(etat, mur);
  if (!etendue) return;
  const { a, b } = mur.params;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const f = facesMur(a, b, mur.params.epaisseur.value, mur.params.alignement);
  const oG = (f.gauche[0].x - a.x) * n.x + (f.gauche[0].y - a.y) * n.y;
  const oD = (f.droite[0].x - a.x) * n.x + (f.droite[0].y - a.y) * n.y;
  const centre = (oG + oD) / 2;
  const e = o.classe === "porte" ? 0.04 : 0.03;
  const c = o.params.position * L;
  const zb = etendue[0] + (o.params.allege?.value ?? 0);
  t.boite(a, u, n, c - o.params.largeur.value / 2, c + o.params.largeur.value / 2, centre - e / 2, centre + e / 2, zb, zb + o.params.hauteur.value);
}

function escalierMaillage(etat: ModeleAtelier, e: Occurrence<"escalier">, t: Tampon): void {
  if (e.params.referencePlanSeulement) return;
  const { a, b } = e.params;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const z0 = altitude(etat, e.niveauId) + e.params.decalageBase.value;
  const H = e.params.hauteurAFranchir.value;
  const w = e.params.largeur.value / 2;
  const nombre = e.params.contremarches ?? e.params.marches;
  if (!nombre || nombre < 1) {
    // Nombre de marches non renseigné : volume de paillasse seul (rampe), sans marches inventées.
    // Épaisseur de paillasse absente : surface de la rampe seule (aucune épaisseur inventée).
    const ep = e.params.epaisseurPaillasse?.value ?? 0;
    const p = (s: number, o: number): Vec => ({ x: a.x + u.x * s + n.x * o, y: a.y + u.y * s + n.y * o });
    const bas = [p(0, -w), p(L, -w), p(L, w), p(0, w)];
    const ids = [
      ...bas.map((q, k) => t.sommet(q.x, q.y, z0 + (k === 1 || k === 2 ? H : 0) - ep)),
      ...bas.map((q, k) => t.sommet(q.x, q.y, z0 + (k === 1 || k === 2 ? H : 0))),
    ];
    t.quad(ids[4]!, ids[5]!, ids[6]!, ids[7]!);
    if (ep <= 0) return;
    t.quad(ids[0]!, ids[3]!, ids[2]!, ids[1]!);
    for (let k = 0; k < 4; k++) t.quad(ids[k]!, ids[(k + 1) % 4]!, ids[4 + ((k + 1) % 4)]!, ids[4 + k]!);
    return;
  }
  const giron = L / nombre;
  for (let k = 0; k < nombre; k++) t.boite(a, u, n, k * giron, (k + 1) * giron, -w, w, z0, z0 + ((k + 1) * H) / nombre);
}

/** Maillage d'une occurrence, ou null si elle n'a pas de volume (annotations, hauteur non évaluée…). */
export function maillageObjet(etat: ModeleAtelier, o: OccurrenceQuelconque): Maillage | null {
  const t = new Tampon();
  const z = altitude(etat, o.niveauId);
  let opacite = 1;
  let couleur = COULEURS_3D[o.classe] ?? "#bbbbbb";
  switch (o.classe) {
    case "mur":
      murMaillage(etat, o, t);
      break;
    case "porte":
    case "fenetre":
    case "ouverture":
      ouvertureMaillage(etat, o, t);
      if (o.classe === "fenetre") opacite = 0.55;
      break;
    case "dalle":
    case "toiture":
      t.prisme(o.params.contour, o.params.trous, z + o.params.decalageBase.value, z + o.params.decalageBase.value + o.params.epaisseur.value);
      break;
    case "solide": {
      const h = o.params.hauteur?.value;
      if (!h) break;
      const z0 = z + o.params.decalageBase.value;
      if (o.params.ferme) t.prisme(o.params.contour, o.params.trous, z0, z0 + h);
      else if (o.params.epaisseur) {
        // Chemin ouvert épaissi (garde-corps, murets) : une boîte par segment.
        const ep = o.params.epaisseur.value;
        for (let k = 0; k + 1 < o.params.contour.length; k++) {
          const a = o.params.contour[k]!;
          const b = o.params.contour[k + 1]!;
          const L = Math.hypot(b.x - a.x, b.y - a.y);
          if (L < 1e-9) continue;
          const u = normalise(sub(b, a));
          t.boite(a, u, perp(u), 0, L, -ep / 2, ep / 2, z0, z0 + h);
        }
      }
      if (o.params.couleur) couleur = o.params.couleur;
      if (o.params.role !== "solid" && o.params.role !== "") opacite = 0.45;
      break;
    }
    case "poteau": {
      const h = o.params.hauteur?.value;
      if (!h) break;
      const ang = (o.params.angle.value * Math.PI) / 180;
      const u = { x: Math.cos(ang), y: Math.sin(ang) };
      const lx = o.params.largeur.value / 2;
      const ly = o.params.profondeur.value / 2;
      t.boite(o.params.point, u, perp(u), -lx, lx, -ly, ly, z, z + h);
      break;
    }
    case "escalier":
      escalierMaillage(etat, o, t);
      break;
    case "piece":
      t.surface(o.params.contour, o.params.trous, z + 0.01);
      opacite = 0.5;
      break;
    case "espace":
      for (const pg of o.params.polygones) t.surface(pg.contour, pg.trous, z + 0.012);
      opacite = 0.35;
      break;
    case "esquisse": {
      // Une esquisse fermée n'a pas de volume ; seule l'extrusion (commande) en fait un solide.
      void pointsArc;
      break;
    }
    default:
      break;
  }
  if (t.indices.length === 0) return null;
  return { objetId: o.id, classe: o.classe, niveauId: o.niveauId, positions: t.positions, indices: t.indices, couleur, opacite };
}

/** Maillages de tout le modèle, ou d'un niveau. */
export function maillagesModele(etat: ModeleAtelier, niveauId?: string): Maillage[] {
  const out: Maillage[] = [];
  for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
    if (niveauId !== undefined && o.niveauId !== niveauId) continue;
    const m = maillageObjet(etat, o);
    if (m) out.push(m);
  }
  return out;
}

/** Boîte englobante (min / max) d'un ensemble de maillages. */
export function englobant(maillages: readonly Maillage[]): { min: [number, number, number]; max: [number, number, number] } | null {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const m of maillages) {
    for (let k = 0; k < m.positions.length; k += 3) {
      for (let d = 0; d < 3; d++) {
        const v = m.positions[k + d]!;
        if (v < min[d]!) min[d] = v;
        if (v > max[d]!) max[d] = v;
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

/** Plan de coupe : point et normale. */
export interface PlanCoupe {
  point: [number, number, number];
  normale: [number, number, number];
}

/**
 * Segments d'intersection d'un maillage avec un plan (vues de coupe, contrôle des hauteurs) : x1, y1, z1, x2, y2, z2
 * à la suite. Les triangles posés dans le plan sont ignorés.
 */
export function couper(m: Maillage, plan: PlanCoupe): number[] {
  const [nx, ny, nz] = plan.normale;
  const d0 = nx * plan.point[0] + ny * plan.point[1] + nz * plan.point[2];
  const dist = (i: number) => nx * m.positions[i * 3]! + ny * m.positions[i * 3 + 1]! + nz * m.positions[i * 3 + 2]! - d0;
  const out: number[] = [];
  for (let k = 0; k < m.indices.length; k += 3) {
    const ids = [m.indices[k]!, m.indices[k + 1]!, m.indices[k + 2]!];
    const ds = ids.map(dist);
    const pts: number[][] = [];
    for (let e = 0; e < 3; e++) {
      const i = ids[e]!;
      const j = ids[(e + 1) % 3]!;
      const di = ds[e]!;
      const dj = ds[(e + 1) % 3]!;
      if ((di > 0 && dj < 0) || (di < 0 && dj > 0)) {
        const s = di / (di - dj);
        pts.push([0, 1, 2].map((c) => m.positions[i * 3 + c]! + s * (m.positions[j * 3 + c]! - m.positions[i * 3 + c]!)));
      } else if (Math.abs(di) < 1e-9 && Math.abs(dj) >= 1e-9) pts.push([0, 1, 2].map((c) => m.positions[i * 3 + c]!));
    }
    if (pts.length >= 2) out.push(...pts[0]!, ...pts[1]!);
  }
  return out;
}
