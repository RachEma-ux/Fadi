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
import { contenuPlace, contoursArchitecture } from "../blocs-places.js";
import { etendueEspace } from "../espaces-volume.js";
import { arcCintre, flecheCintre, profilBaie } from "../cintres.js";
import { aireSignee, facesMur, hoteOuverture, longueurAxeMur, normalise, perp, pointsArc, sub, type Vec } from "../geometrie.js";
import { contourMurCourbeRaccorde, raccordMur } from "../raccords.js";
import { corpsMenuiserie } from "../menuiserie.js";
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
  "garde-corps": "#6f7f78",
  "bloc-occurrence": "#b8a88a",
  "objet-importe": "#b9c4cc",
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
  prisme(contour: readonly Vec[], trous: readonly (readonly Vec[])[], z0: number, z1: number, dz?: (p: Vec) => number): void {
    if (contour.length < 3 || !(z1 > z0)) return;
    const anneaux = [contour, ...trous];
    const tri = trianguler(contour, trous);
    const plats = anneaux.flat();
    // Prisme incliné (D-140) : dessous et dessus relevés de dz(p), épaisseur verticale inchangée.
    const bas = plats.map((p) => this.sommet(p.x, p.y, z0 + (dz ? dz(p) : 0)));
    const haut = plats.map((p) => this.sommet(p.x, p.y, z1 + (dz ? dz(p) : 0)));
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
  /**
   * Profil d'élévation épaissi (D-141) : polygone (s le long de `u`, z) en sens trigonométrique, extrudé selon `n`
   * entre les décalages o0 et o1 (baies cintrées, écoinçons au-dessus d'un arc).
   */
  profilEpais(origine: Vec, u: Vec, n: Vec, profil: readonly { s: number; z: number }[], o0: number, o1: number): void {
    if (profil.length < 3 || !(o1 > o0)) return;
    const plan = profil.map((q) => ({ x: q.s, y: q.z }));
    const tri = trianguler(plan, []);
    const p = (q: { s: number; z: number }, o: number) => this.sommet(origine.x + u.x * q.s + n.x * o, origine.y + u.y * q.s + n.y * o, q.z);
    const avant = profil.map((q) => p(q, o0));
    const arriere = profil.map((q) => p(q, o1));
    for (let k = 0; k < tri.length; k += 3) {
      this.indices.push(avant[tri[k]!]!, avant[tri[k + 1]!]!, avant[tri[k + 2]!]!);
      this.indices.push(arriere[tri[k]!]!, arriere[tri[k + 2]!]!, arriere[tri[k + 1]!]!);
    }
    for (let i = 0; i < profil.length; i++) {
      const j = (i + 1) % profil.length;
      this.quad(arriere[i]!, arriere[j]!, avant[j]!, avant[i]!);
    }
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
  // Mur courbe (D-086) : prismes des portions d'arc entre les vides des ouvertures (D-095), chaque portion coupée en
  // hauteur sous et au-dessus des ouvertures qu'elle porte.
  if (mur.params.renflement) {
    const L = longueurAxeMur(mur.params);
    const vides = videsOuvertures(etat, mur, L, z0);
    const coupures = [...new Set([0, L, ...vides.flatMap((v) => [v.s0, v.s1])])].filter((s) => s >= 0 && s <= L).sort((x, y) => x - y);
    for (let k = 0; k + 1 < coupures.length; k++) {
      const s0 = coupures[k]!;
      const s1 = coupures[k + 1]!;
      if (s1 - s0 < 1e-6) continue;
      const milieu = (s0 + s1) / 2;
      const ici = vides.filter((v) => v.s0 <= milieu && v.s1 >= milieu).map((v) => [v.zb, v.zt] as [number, number]);
      // Raccords aux extrémités réelles (D-104) : onglets et tés avec les murs voisins.
      const contour = contourMurCourbeRaccorde(etat, mur, s0, s1);
      for (const [za, zb] of soustraire(z0, z1, ici)) if (zb > za) t.prisme(contour, [], za, zb);
    }
    return;
  }
  const { a, b } = mur.params;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const f = facesMur(a, b, mur.params.epaisseur.value, mur.params.alignement);
  const oG = (f.gauche[0].x - a.x) * n.x + (f.gauche[0].y - a.y) * n.y;
  const oD = (f.droite[0].x - a.x) * n.x + (f.droite[0].y - a.y) * n.y;
  const [o0, o1] = [Math.min(oG, oD), Math.max(oG, oD)];
  // Vides des ouvertures hébergées, en abscisse le long de l'axe ; écoinçons des baies cintrées (D-141).
  const ecoincons: { s: number; z: number }[][] = [];
  const vides = videsOuvertures(etat, mur, L, z0, ecoincons);
  for (const tri of ecoincons) if (tri.every((q) => q.z <= z1 + 1e-9)) t.profilEpais(a, u, n, tri, o0, o1);
  const coupures = [...new Set([0, L, ...vides.flatMap((v) => [v.s0, v.s1])])].filter((s) => s >= 0 && s <= L).sort((x, y) => x - y);
  const r: { gauche: [number, number]; droite: [number, number]; pointes?: [Vec | null, Vec | null] } = raccordMur(etat, mur) ?? { gauche: [0, L], droite: [0, L] };
  for (let k = 0; k + 1 < coupures.length; k++) {
    const s0 = coupures[k]!;
    const s1 = coupures[k + 1]!;
    if (s1 - s0 < 1e-6) continue;
    const milieu = (s0 + s1) / 2;
    const ici = vides.filter((v) => v.s0 <= milieu && v.s1 >= milieu).map((v) => [v.zb, v.zt] as [number, number]);
    // Raccords (géométrie dérivée) : aux extrémités, chaque face s'arrête à son abscisse raccordée.
    const sD0 = k === 0 ? r.droite[0] : s0;
    const sG0 = k === 0 ? r.gauche[0] : s0;
    const sD1 = k + 2 === coupures.length ? r.droite[1] : s1;
    const sG1 = k + 2 === coupures.length ? r.gauche[1] : s1;
    const biais = sD0 !== s0 || sG0 !== s0 || sD1 !== s1 || sG1 !== s1 || (k === 0 && !!r.pointes?.[0]) || (k + 2 === coupures.length && !!r.pointes?.[1]);
    for (const [za, zb] of soustraire(z0, z1, ici)) {
      // Une face peut s'annuler (poteau d'angle en triangle, D-106) : le prisme garde l'autre face et l'onglet.
      if (biais && sD1 >= sD0 - 1e-9 && sG1 >= sG0 - 1e-9 && (sD1 - sD0 > 1e-9 || sG1 - sG0 > 1e-9) && o1 > o0 && zb > za) {
        const p = (s: number, o: number): Vec => ({ x: a.x + u.x * s + n.x * o, y: a.y + u.y * s + n.y * o });
        // o0 = face droite, o1 = face gauche (décalages croissants selon n).
        // Nœud sans paire (D-032) : le contour passe par le point du nœud.
        const pA = k === 0 ? r.pointes?.[0] : undefined;
        const pB = k + 2 === coupures.length ? r.pointes?.[1] : undefined;
        const contour = [p(sD0, o0), p(sD1, o0), ...(pB ? [pB] : []), p(sG1, o1), p(sG0, o1), ...(pA ? [pA] : [])].filter((q, i, l) => Math.hypot(q.x - l[(i + l.length - 1) % l.length]!.x, q.y - l[(i + l.length - 1) % l.length]!.y) > 1e-9);
        t.prisme(contour, [], za, zb);
      } else t.boite(a, u, n, s0, s1, o0, o1, za, zb);
    }
  }
}

/**
 * Vides des ouvertures d'un mur, en abscisse le long de l'axe (corde ou arc) et en altitude. Baie cintrée (D-141) :
 * une tranche par corde de l'arc, vidée jusqu'au plus haut de ses deux extrémités ; `ecoincons` rend les triangles
 * pleins entre la corde et ce plus haut (mur droit : ils referment exactement le polygone de l'arc).
 */
function videsOuvertures(etat: ModeleAtelier, mur: Occurrence<"mur">, L: number, z0: number, ecoincons?: { s: number; z: number }[][]): { s0: number; s1: number; zb: number; zt: number }[] {
  const vides: { s0: number; s1: number; zb: number; zt: number }[] = [];
  for (const o of Object.values(etat.objets)) {
    if ((o.classe !== "porte" && o.classe !== "fenetre" && o.classe !== "ouverture") || o.params.murHoteId !== mur.id) continue;
    const c = o.params.position * L;
    const zb = z0 + (o.params.allege?.value ?? 0);
    const w = o.params.largeur.value;
    if (!o.params.cintre) {
      vides.push({ s0: Math.max(0, c - w / 2), s1: Math.min(L, c + w / 2), zb, zt: zb + o.params.hauteur.value });
      continue;
    }
    const arc = arcCintre(o.params.cintre, w, o.params.hauteur.value).map((q) => ({ s: c - w / 2 + q.s, z: zb + q.z })).reverse();
    for (let k = 0; k + 1 < arc.length; k++) {
      const p = arc[k]!;
      const q = arc[k + 1]!;
      if (q.s - p.s < 1e-9) continue;
      vides.push({ s0: Math.max(0, p.s), s1: Math.min(L, q.s), zb, zt: Math.max(p.z, q.z) });
      // Triangle au-dessus de la corde, sous le plus haut, en sens trigonométrique (s, z).
      if (ecoincons && Math.abs(p.z - q.z) > 1e-9) ecoincons.push(p.z < q.z ? [p, q, { s: p.s, z: q.z }] : [p, q, { s: q.s, z: p.z }]);
    }
  }
  return vides;
}

function ouvertureMaillage(etat: ModeleAtelier, o: Occurrence<"porte" | "fenetre" | "ouverture">, t: Tampon): void {
  if (o.classe === "ouverture") return; // baie libre : le vide suffit
  const mur = etat.objets[o.params.murHoteId];
  if (!mur || mur.classe !== "mur") return;
  const etendue = etendueMur(etat, mur);
  if (!etendue) return;
  // Mur courbe (D-095) : le corps se pose sur la tangente à l'axe au centre de l'ouverture.
  const { a, b, position } = hoteOuverture(mur.params, o.params.position, o.params.largeur.value);
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return;
  const u = normalise(sub(b, a));
  const n = perp(u);
  const f = facesMur(a, b, mur.params.epaisseur.value, mur.params.alignement);
  const oG = (f.gauche[0].x - a.x) * n.x + (f.gauche[0].y - a.y) * n.y;
  const oD = (f.droite[0].x - a.x) * n.x + (f.droite[0].y - a.y) * n.y;
  const centre = (oG + oD) / 2;
  const e = o.classe === "porte" ? 0.04 : 0.03;
  const c = position * L;
  const zb = etendue[0] + (o.params.allege?.value ?? 0);
  // Menuiserie paramétrée (D-101) : dormant, montants et vitrages ; sinon un panneau simple.
  const m = o.classe === "fenetre" || o.classe === "porte" ? o.params.menuiserie : null;
  const cintre = o.params.cintre;
  const w = o.params.largeur.value;
  const h = o.params.hauteur.value;
  const s0 = c - w / 2;
  // Baie cintrée (D-141) : panneau au profil de la baie ; avec menuiserie, les pièces s'arrêtent aux naissances et un
  // tympan cintré ferme l'arc.
  const naissance = cintre ? h - flecheCintre(cintre, w) : h;
  if (m) {
    for (const k of corpsMenuiserie(w, h, m, e, o.classe === "porte")) {
      const z1 = Math.min(k.z1, naissance);
      if (z1 > k.z0 + 1e-9) t.boite(a, u, n, s0 + k.s0, s0 + k.s1, centre - k.e / 2, centre + k.e / 2, zb + k.z0, zb + z1);
    }
    // L'arc, de la naissance droite à la naissance gauche, refermé par sa corde : sens trigonométrique.
    if (cintre) t.profilEpais(a, u, n, arcCintre(cintre, w, h).map((q) => ({ s: s0 + q.s, z: zb + q.z })), centre - e / 2, centre + e / 2);
    return;
  }
  if (cintre) {
    t.profilEpais(a, u, n, profilBaie(cintre, w, h).map((q) => ({ s: s0 + q.s, z: zb + q.z })), centre - e / 2, centre + e / 2);
    return;
  }
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

// ---------------------------------------------------------------------------
// Toitures en pente, garde-corps, composants (lot 5)
// ---------------------------------------------------------------------------

/**
 * Géométrie d'une toiture en pente (convention de l'Atelier, fiche DA-07 / lot 5) : le premier côté du contour est
 * l'égout ; la pente monte perpendiculairement vers l'intérieur. Bipente : faîtage parallèle à l'égout, à mi-distance
 * du côté le plus éloigné. Hauteur relative au plan d'égout : `h(p) = tan(pente) × d(p)`.
 */
export interface GeometrieToiture {
  type: "monopente" | "bipente";
  pans: Vec[][];
  /** Hauteur au-dessus de l'égout d'un point du contour (m). */
  hauteur: (p: Vec) => number;
  /** Faîtage (bipente), extrémités sur le contour. */
  faitage: [Vec, Vec] | null;
  /** Contour subdivisé aux points de faîtage (côtés du volume). */
  contour: Vec[];
}

function couperDemiPlan(poly: readonly Vec[], d: (p: Vec) => number, c: number, garderInf: boolean): Vec[] {
  const out: Vec[] = [];
  const dedans = (p: Vec) => (garderInf ? d(p) <= c + 1e-12 : d(p) >= c - 1e-12);
  for (let k = 0; k < poly.length; k++) {
    const cur = poly[k]!;
    const prec = poly[(k + poly.length - 1) % poly.length]!;
    const ci = dedans(cur);
    const pi = dedans(prec);
    if (ci !== pi) {
      const t = (c - d(prec)) / (d(cur) - d(prec));
      out.push({ x: prec.x + (cur.x - prec.x) * t, y: prec.y + (cur.y - prec.y) * t });
    }
    if (ci) out.push(cur);
  }
  return out;
}

export function geometrieToiture(contour: readonly Vec[], type: "plate" | "monopente" | "bipente", penteDeg: number): GeometrieToiture | null {
  if (type === "plate" || contour.length < 3 || !(penteDeg > 0) || penteDeg >= 89) return null;
  const e0 = contour[0]!;
  const e1 = contour[1]!;
  const L = Math.hypot(e1.x - e0.x, e1.y - e0.y);
  if (L < 1e-9) return null;
  const u = { x: (e1.x - e0.x) / L, y: (e1.y - e0.y) / L };
  let n = perp(u);
  if (aireSignee(contour) < 0) n = { x: -n.x, y: -n.y };
  const d = (p: Vec) => (p.x - e0.x) * n.x + (p.y - e0.y) * n.y;
  const dmax = Math.max(...contour.map(d));
  if (!(dmax > 1e-9)) return null;
  const tg = Math.tan((penteDeg * Math.PI) / 180);
  if (type === "monopente") return { type, pans: [[...contour]], hauteur: (p) => tg * Math.max(0, d(p)), faitage: null, contour: [...contour] };
  const c = dmax / 2;
  const pans = [couperDemiPlan(contour, d, c, true), couperDemiPlan(contour, d, c, false)].filter((p) => p.length >= 3);
  // Contour subdivisé aux traversées du faîtage.
  const sub: Vec[] = [];
  for (let k = 0; k < contour.length; k++) {
    const a = contour[k]!;
    const b = contour[(k + 1) % contour.length]!;
    sub.push(a);
    const da = d(a) - c;
    const db = d(b) - c;
    if ((da < -1e-12 && db > 1e-12) || (da > 1e-12 && db < -1e-12)) {
      const t = da / (da - db);
      sub.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  const surFaitage = sub.filter((p) => Math.abs(d(p) - c) < 1e-9);
  let faitage: [Vec, Vec] | null = null;
  if (surFaitage.length >= 2) {
    const s = (p: Vec) => p.x * u.x + p.y * u.y;
    const tri = [...surFaitage].sort((a, b) => s(a) - s(b));
    faitage = [tri[0]!, tri[tri.length - 1]!];
  }
  return { type, pans, hauteur: (p) => tg * (c - Math.abs(d(p) - c)), faitage, contour: sub };
}

function toitureEnPente(t: Tampon, g: GeometrieToiture, z0: number, ep: number): void {
  for (const pan of g.pans) {
    const tri = trianguler(pan);
    const haut = pan.map((p) => t.sommet(p.x, p.y, z0 + ep + g.hauteur(p)));
    const bas = pan.map((p) => t.sommet(p.x, p.y, z0 + g.hauteur(p)));
    for (let k = 0; k < tri.length; k += 3) {
      t.indices.push(haut[tri[k]!]!, haut[tri[k + 1]!]!, haut[tri[k + 2]!]!);
      t.indices.push(bas[tri[k]!]!, bas[tri[k + 2]!]!, bas[tri[k + 1]!]!);
    }
  }
  const c = g.contour;
  const bas = c.map((p) => t.sommet(p.x, p.y, z0 + g.hauteur(p)));
  const haut = c.map((p) => t.sommet(p.x, p.y, z0 + ep + g.hauteur(p)));
  for (let k = 0; k < c.length; k++) t.quad(bas[k]!, bas[(k + 1) % c.length]!, haut[(k + 1) % c.length]!, haut[k]!);
}

/** Garde-corps : panneau plein ou vitré, ou lisse haute et barreaux (représentation, pas une règle d'écartement). */
function gardeCorpsMaillage(o: Occurrence<"garde-corps">, z: number, t: Tampon): void {
  const { points, ferme, hauteur, epaisseur, remplissage, decalageBase } = o.params;
  const z0 = z + decalageBase.value;
  const h = hauteur.value;
  const ep = epaisseur.value;
  const n = ferme ? points.length : points.length - 1;
  for (let k = 0; k < n; k++) {
    const a = points[k]!;
    const b = points[(k + 1) % points.length]!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    const u = normalise(sub(b, a));
    const nn = perp(u);
    if (remplissage !== "barreaudage") {
      t.boite(a, u, nn, 0, L, -ep / 2, ep / 2, z0, z0 + h);
      continue;
    }
    const lisse = Math.min(0.05, h / 4);
    t.boite(a, u, nn, 0, L, -ep / 2, ep / 2, z0 + h - lisse, z0 + h);
    const nb = Math.max(1, Math.round(L / 0.12));
    for (let i = 0; i <= nb; i++) {
      const s = (L * i) / nb;
      t.boite(a, u, nn, Math.max(0, s - 0.01), Math.min(L, s + 0.01), -0.01, 0.01, z0, z0 + h - lisse);
    }
  }
}

/** Occurrence de bloc ou de composant : solides fermés de la définition, placés (position, angle, échelle). */
function blocMaillage(etat: ModeleAtelier, o: Occurrence<"bloc-occurrence">, z: number, t: Tampon): void {
  for (const { classe, params, tr, k } of contenuPlace(etat, o.definitionId, o.params)) {
    const e = { classe, params };
    // Poteaux et dalles d'un bloc (D-108) : prismes de leur section ou contour, hauteurs à l'échelle du bloc.
    if (e.classe === "poteau") {
      const h = (e.params["hauteur"] as { value: number } | null)?.value;
      const c = contoursArchitecture("poteau", e.params);
      if (h && c) t.prisme(c.contour.map(tr), [], z, z + h * k);
      continue;
    }
    if (e.classe === "dalle") {
      const c = contoursArchitecture("dalle", e.params);
      const ep = (e.params["epaisseur"] as { value: number } | undefined)?.value;
      const base = ((e.params["decalageBase"] as { value: number } | undefined)?.value ?? 0) * k;
      if (c && ep) t.prisme(c.contour.map(tr), c.trous.map((x) => x.map(tr)), z + base, z + base + ep * k);
      continue;
    }
    if (e.classe !== "solide") continue;
    const h = (e.params["hauteur"] as { value: number } | null)?.value;
    const contour = e.params["contour"] as Vec[] | undefined;
    if (!h || !contour || contour.length < 3 || e.params["ferme"] === false) continue;
    const base = ((e.params["decalageBase"] as { value: number } | undefined)?.value ?? 0) * k;
    t.prisme(contour.map(tr), [], z + base, z + base + h * k);
  }
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
      t.prisme(o.params.contour, o.params.trous, z + o.params.decalageBase.value, z + o.params.decalageBase.value + o.params.epaisseur.value, o.params.pente ? releveDalle(o.params.contour, o.params.pente) : undefined);
      break;
    case "toiture": {
      const z0 = z + o.params.decalageBase.value;
      const geo = o.params.type !== "plate" && o.params.pente ? geometrieToiture(o.params.contour, o.params.type, o.params.pente.value) : null;
      if (!geo) t.prisme(o.params.contour, o.params.trous, z0, z0 + o.params.epaisseur.value);
      else toitureEnPente(t, geo, z0, o.params.epaisseur.value);
      break;
    }
    case "garde-corps":
      gardeCorpsMaillage(o, z, t);
      if (o.params.remplissage === "vitre") opacite = 0.45;
      break;
    case "bloc-occurrence":
      blocMaillage(etat, o, z, t);
      break;
    case "objet-importe": {
      // Maillage importé tel quel (repère local, z relatif au niveau).
      const p = o.params.maillage.positions;
      const base = t.positions.length / 3;
      for (let i = 0; i < p.length; i += 3) t.sommet(p[i]!, p[i + 1]!, z + p[i + 2]!);
      for (const i of o.params.maillage.indices) t.indices.push(base + i);
      if (o.params.ifcClasse.toLowerCase() === "ifcspace") opacite = 0.2;
      break;
    }
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
      // Section selon la forme (D-139) : rectangle, cercle, profilés I, T, L, U.
      const c = contoursArchitecture("poteau", o.params as unknown as Record<string, unknown>);
      if (c) t.prisme(c.contour, [], z, z + h);
      break;
    }
    case "escalier":
      escalierMaillage(etat, o, t);
      break;
    case "piece":
      t.surface(o.params.contour, o.params.trous, z + 0.01);
      opacite = 0.5;
      break;
    case "espace": {
      // Étendue verticale connue (D-142 : hauteur propre ou niveau haut) : volume translucide ; sinon surface.
      const ext = etendueEspace(etat, o);
      for (const pg of o.params.polygones) ext ? t.prisme(pg.contour, pg.trous, ext[0] + 0.012, ext[1] - 0.012) : t.surface(pg.contour, pg.trous, z + 0.012);
      opacite = ext ? 0.18 : 0.35;
      break;
    }
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

/** Relevé d'une dalle inclinée (D-140) : montée depuis le point le plus bas du contour, selon la direction et la pente. */
export function releveDalle(contour: readonly Vec[], pente: { angle: { value: number }; direction: { value: number } }): (p: Vec) => number {
  const d = (pente.direction.value * Math.PI) / 180;
  const u = { x: Math.cos(d), y: Math.sin(d) };
  const s0 = Math.min(...contour.map((q) => q.x * u.x + q.y * u.y));
  const k = Math.tan((pente.angle.value * Math.PI) / 180);
  return (p) => Math.round((p.x * u.x + p.y * u.y - s0) * k * 1e9) / 1e9;
}
