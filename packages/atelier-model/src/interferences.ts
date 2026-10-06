/**
 * Contrôle d'interférence (D-124, DA-03-12) : deux corps qui occupent le même volume. Un corps est un prisme vertical
 * (empreinte en plan, trous compris, et étendue en altitude) : solide fermé (ou chemin épaissi, une boîte par
 * segment), poteau, mur (hauteur renseignée), dalle. Paires contrôlées : un solide contre tout corps, un poteau contre
 * un poteau — les rencontres voulues par construction (murs entre eux et avec les dalles, poteau noyé dans un mur)
 * ne sont pas signalées. Volume commun = aire commune en plan × hauteur commune ; au-dessous de 1 dm³ il est ignoré.
 * Un corps dont la hauteur n'est pas renseignée n'est pas évalué (jamais une hauteur supposée). Rien n'est corrigé.
 * Contrôle à la demande (bouton « Contrôler les interférences ») : des corps génériques se recouvrent souvent à dessein
 * (rampes en gradins, garde-corps posés), ce ne sont donc pas des collisions d'architecture permanentes.
 */
import { aireSignee, cross, normalise, perp, polygoneMur, polygoneMurCourbe, sub, type Vec } from "./geometrie.js";
import type { ModeleAtelier, OccurrenceQuelconque } from "./modele.js";
import { etendueMur, trianguler } from "./projection/maillage.js";
import { contoursArchitecture } from "./blocs-places.js";

export interface Corps {
  objetId: string;
  classe: OccurrenceQuelconque["classe"];
  niveauId: string | null;
  contour: Vec[];
  trous: Vec[][];
  z0: number;
  z1: number;
}

export interface Interference {
  objets: [string, string];
  niveauId: string | null;
  volume: number;
}

const VOLUME_MIN = 0.001;

function altitude(etat: ModeleAtelier, niveauId: string | null): number {
  return niveauId ? (etat.niveaux[niveauId]?.elevation ?? 0) : 0;
}

/** Corps prismatiques d'un objet (vide si l'objet n'a pas de volume évaluable). */
export function corpsDe(etat: ModeleAtelier, o: OccurrenceQuelconque): Corps[] {
  const z = altitude(etat, o.niveauId);
  const c = (contour: Vec[], trous: Vec[][], z0: number, z1: number): Corps => ({ objetId: o.id, classe: o.classe, niveauId: o.niveauId, contour, trous, z0, z1 });
  switch (o.classe) {
    case "solide": {
      const h = o.params.hauteur?.value;
      if (!h) return [];
      const z0 = z + o.params.decalageBase.value;
      if (o.params.ferme) return [c(o.params.contour, o.params.trous, z0, z0 + h)];
      const ep = o.params.epaisseur?.value;
      if (!ep) return [];
      const out: Corps[] = [];
      for (let k = 0; k + 1 < o.params.contour.length; k++) {
        const a = o.params.contour[k]!;
        const b = o.params.contour[k + 1]!;
        const u = normalise(sub(b, a));
        const n = perp(u);
        const q = (p: Vec, s: number) => ({ x: p.x + n.x * s, y: p.y + n.y * s });
        out.push(c([q(a, -ep / 2), q(b, -ep / 2), q(b, ep / 2), q(a, ep / 2)], [], z0, z0 + h));
      }
      return out;
    }
    case "poteau": {
      const h = o.params.hauteur?.value;
      if (!h) return [];
      // Section selon la forme (D-139).
      const s = contoursArchitecture("poteau", o.params as unknown as Record<string, unknown>);
      return s ? [c(s.contour, [], z, z + h)] : [];
    }
    case "mur": {
      const e = etendueMur(etat, o);
      if (!e) return [];
      const poly = o.params.renflement ? polygoneMurCourbe(o.params.a, o.params.b, o.params.epaisseur.value, o.params.alignement, o.params.renflement) : polygoneMur(o.params.a, o.params.b, o.params.epaisseur.value, o.params.alignement);
      return [c(poly, [], e[0], e[1])];
    }
    case "dalle": {
      if (o.params.pente) return []; // dalle inclinée (D-140) : prisme non vertical, non évaluée ici
      const z0 = z + o.params.decalageBase.value;
      return [c(o.params.contour, o.params.trous, z0, z0 + o.params.epaisseur.value)];
    }
    default:
      return [];
  }
}

/** Découpe d'un polygone par un triangle (fenêtre convexe), Sutherland–Hodgman. */
function couperTriangle(poly: readonly Vec[], tri: readonly [Vec, Vec, Vec]): Vec[] {
  const sens = Math.sign(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]))) || 1;
  let out: Vec[] = [...poly];
  for (let k = 0; k < 3 && out.length; k++) {
    const a = tri[k]!;
    const b = tri[(k + 1) % 3]!;
    const f = (p: Vec) => sens * cross(sub(b, a), sub(p, a));
    const entree = out;
    out = [];
    for (let i = 0; i < entree.length; i++) {
      const p = entree[i]!;
      const q = entree[(i + 1) % entree.length]!;
      const fp = f(p);
      const fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) {
        const t = fp / (fp - fq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

/** Aire commune de deux polygones simples (le second découpé en triangles). */
export function aireCommune(p: readonly Vec[], q: readonly Vec[]): number {
  if (p.length < 3 || q.length < 3) return 0;
  const idx = trianguler(q);
  let a = 0;
  for (let k = 0; k + 2 < idx.length; k += 3) {
    const tri: [Vec, Vec, Vec] = [q[idx[k]!]!, q[idx[k + 1]!]!, q[idx[k + 2]!]!];
    const r = couperTriangle(p, tri);
    if (r.length >= 3) a += Math.abs(aireSignee(r));
  }
  return a;
}

/** Aire commune de deux empreintes à trous (inclusion-exclusion, trous intérieurs et disjoints). */
function aireCommuneTrous(a: Corps, b: Corps): number {
  let s = aireCommune(a.contour, b.contour);
  for (const h of a.trous) s -= aireCommune(h, b.contour);
  for (const h of b.trous) s -= aireCommune(a.contour, h);
  for (const h of a.trous) for (const g of b.trous) s += aireCommune(h, g);
  return Math.max(0, s);
}

const boite = (c: Corps) => {
  const xs = c.contour.map((p) => p.x);
  const ys = c.contour.map((p) => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/** Interférences du modèle, triées (paires d'identifiants dans l'ordre alphabétique). */
export function interferences(etat: ModeleAtelier, options: { niveauId?: string | null } = {}): Interference[] {
  const corps = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => !options.niveauId || o.niveauId === options.niveauId).flatMap((o) => corpsDe(etat, o));
  const boites = corps.map(boite);
  const parPaire = new Map<string, Interference>();
  for (let i = 0; i < corps.length; i++) {
    for (let j = i + 1; j < corps.length; j++) {
      const a = corps[i]!;
      const b = corps[j]!;
      if (a.objetId === b.objetId) continue;
      const controlee = a.classe === "solide" || b.classe === "solide" || (a.classe === "poteau" && b.classe === "poteau");
      if (!controlee) continue;
      const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (dz <= 1e-6) continue;
      const ba = boites[i]!;
      const bb = boites[j]!;
      if (ba.x1 <= bb.x0 || bb.x1 <= ba.x0 || ba.y1 <= bb.y0 || bb.y1 <= ba.y0) continue;
      const v = aireCommuneTrous(a, b) * dz;
      if (v <= 0) continue;
      const [u, w] = a.objetId < b.objetId ? [a, b] : [b, a];
      const cle = `${u.objetId}|${w.objetId}`;
      const prec = parPaire.get(cle);
      parPaire.set(cle, { objets: [u.objetId, w.objetId], niveauId: u.niveauId ?? w.niveauId, volume: (prec?.volume ?? 0) + v });
    }
  }
  return [...parPaire.values()].filter((x) => x.volume >= VOLUME_MIN).sort((x, y) => (x.objets[0] < y.objets[0] ? -1 : x.objets[0] > y.objets[0] ? 1 : x.objets[1] < y.objets[1] ? -1 : 1));
}
