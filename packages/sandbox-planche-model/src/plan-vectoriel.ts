/**
 * Plan vectoriel de la Planche (cas 4 du catalogue des extensions, étape 5 : D7-F11-006, D7-S-001, D7-F11-001). Pur : ni
 * React, ni DOM.
 *
 * - Projection d'une vue en dessin 2D (projection parallèle) : lignes cachées éliminées, traits classés « coupé » (contour
 *   de la matière coupée par le plan de coupe actif), « vu » et « caché ». La visibilité est jugée par échantillonnage le
 *   long de chaque arête contre les faces du modèle (en coordonnées monde), du côté conservé par la coupe.
 * - Poché : contours fermés de la matière coupée (intersection des faces avec le plan de coupe), groupés par matière.
 * - Motifs de hachure (`annotations.motifs`, préfixe « h ») : familles de lignes en mm papier, saisies ou lues d'un
 *   fichier .pat. Aucun motif n'est fourni par Fadi. Une matière sans motif est pochée en aplat gris.
 * - Sortie SVG à l'échelle : viewBox en millimètres papier, un groupe par classe de trait.
 */
import type { FamilleHachure, Materiau, MotifHachure, PlanDeCoupe } from "./annotations.js";
import { type Id, type Modele, modifierAnnotations } from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { tiretsDuTrait } from "./balises-l4.js";
import { type Vec3, add, cross, dot, len, normalize, scale, sub } from "./vecteur.js";

export type ClasseTrait = "coupe" | "vu" | "cache";
export const CLASSES_TRAIT: readonly ClasseTrait[] = ["coupe", "vu", "cache"];
export interface P2 {
  readonly x: number;
  readonly y: number;
}
export interface TraitProjete {
  readonly a: P2;
  readonly b: P2;
  readonly classe: ClasseTrait;
  /** (Cas 2, lot 4) Balise de l'arête : son épaisseur et son type de trait, s'ils sont saisis, priment à la sortie. */
  readonly balise?: Id;
}
export interface PocheProjetee {
  /** Boucles fermées (remplissage pair-impair : une boucle intérieure est un trou). */
  readonly boucles: readonly (readonly P2[])[];
  readonly materiau: Id | null;
}
export interface PlanProjete {
  readonly traits: readonly TraitProjete[];
  readonly poches: readonly PocheProjetee[];
  /** Emprise du dessin (m, repère de la vue) ; `null` = rien à dessiner. */
  readonly cadre: { readonly min: P2; readonly max: P2 } | null;
}
export interface VueProjection {
  /** Direction de visée (de l'œil vers la scène). */
  readonly direction: Vec3;
  /** Haut souhaité (projeté sur le plan de vue) ; absent = l'axe Z, sinon Y pour une vue de dessus. */
  readonly haut?: Vec3;
}

const EPS = 1e-7;

/** Plan de coupe rendu : le dernier plan actif (comme la vue 3D), ou `null`. */
export function planDeCoupeActif(m: Modele): PlanDeCoupe | null {
  const actifs = Object.values(m.annotations?.plansDeCoupe ?? {}).filter((p) => p.actif);
  return actifs[actifs.length - 1] ?? null;
}

/** Distance signée au plan de coupe : positive du côté caché par la coupe. */
const cote = (p: PlanDeCoupe, q: Vec3): number => dot(sub(q, p.origine), p.normale) * (p.inverse ? -1 : 1);

/** Repère de la vue : x à droite, y en haut, z profondeur (vers la scène). */
export function repereVue(v: VueProjection): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize(v.direction);
  const essai = (h: Vec3) => sub(h, scale(z, dot(h, z)));
  let h = essai(v.haut ?? { x: 0, y: 0, z: 1 });
  if (len(h) < 1e-6) h = essai({ x: 0, y: 1, z: 0 });
  const y = normalize(h);
  const x = normalize(cross(z, y));
  return { x, y, z };
}

interface Bord {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly materiau?: Id | null;
}

/** Segments d'intersection d'une face plane (contour et trous) avec un plan : pairs de points de franchissement. */
function coupeFace(boucles: readonly (readonly Vec3[])[], plan: PlanDeCoupe): Bord[] {
  const pts: Vec3[] = [];
  const signe = (v: number): -1 | 0 | 1 => (v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0);
  for (const b of boucles) {
    const s = b.map((p) => signe(cote(plan, p)));
    const pleins = s.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0);
    // Changement de côté entre deux sommets hors du plan : franchissement interpolé, ou premier sommet posé sur le plan.
    // Un bord couché dans le plan sans changement de côté (paroi qui touche la coupe) ne coupe rien.
    for (let k = 0; k < pleins.length; k++) {
      const i = pleins[k]!;
      const j = pleins[(k + 1) % pleins.length]!;
      if (s[i] === s[j]) continue;
      if ((i + 1) % b.length === j) {
        const p = b[i]!;
        const q = b[j]!;
        const sp = cote(plan, p);
        pts.push(add(p, scale(sub(q, p), sp / (sp - cote(plan, q)))));
      } else pts.push(b[(i + 1) % b.length]!);
    }
  }
  if (pts.length < 2) return [];
  // Les points sont alignés sur la droite d'intersection : tri le long de sa direction, puis par paires.
  const d = sub(pts[pts.length - 1]!, pts[0]!);
  const dir = len(d) > EPS ? normalize(d) : { x: 1, y: 0, z: 0 };
  pts.sort((u, v) => dot(u, dir) - dot(v, dir));
  const r: Bord[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) if (len(sub(pts[i + 1]!, pts[i]!)) > EPS) r.push({ a: pts[i]!, b: pts[i + 1]! });
  return r;
}

const memeP = (a: Vec3, b: Vec3) => len(sub(a, b)) <= 1e-6;

/** Enchaîne des segments en boucles fermées (les chaînes ouvertes sont abandonnées : rien de faux n'est poché). */
function enBoucles(bords: readonly Bord[]): { points: Vec3[]; bords: Bord[] }[] {
  const restants = [...bords];
  const boucles: { points: Vec3[]; bords: Bord[] }[] = [];
  while (restants.length) {
    const premier = restants.shift()!;
    const chaine = [premier.a, premier.b];
    const utilises = [premier];
    let progres = true;
    while (progres && !memeP(chaine[0]!, chaine[chaine.length - 1]!)) {
      progres = false;
      const bout = chaine[chaine.length - 1]!;
      const i = restants.findIndex((s) => memeP(s.a, bout) || memeP(s.b, bout));
      if (i >= 0) {
        const s = restants.splice(i, 1)[0]!;
        chaine.push(memeP(s.a, bout) ? s.b : s.a);
        utilises.push(s);
        progres = true;
      }
    }
    if (chaine.length >= 4 && memeP(chaine[0]!, chaine[chaine.length - 1]!)) boucles.push({ points: chaine.slice(0, -1), bords: utilises });
  }
  return boucles;
}

/**
 * Matière coupée par le plan : boucles fermées (monde), par matière. Le contour est fermé toutes faces confondues ; sa
 * matière est la matière déclarée qui en borde la plus grande longueur (une paroi peinte sur une seule face reste pochée
 * entière de sa matière) ; sans matière déclarée, aplat.
 */
export function sectionsDeCoupe(m: Modele, plan: PlanDeCoupe): { readonly boucles: Vec3[][]; readonly materiau: Id | null }[] {
  const bords: Bord[] = [];
  for (const f of geometrieVisible(m).faces) {
    // Face couchée dans le plan : déjà au bord de la coupe, elle ne s'y coupe pas.
    if (Math.abs(Math.abs(dot(f.normale, plan.normale)) - 1) < 1e-9 && Math.abs(cote(plan, f.exterieur[0]!)) < 1e-9) continue;
    for (const b of coupeFace([f.exterieur, ...f.trous], plan)) bords.push({ ...b, materiau: f.materiau ?? null });
  }
  const parMatiere = new Map<Id | null, Vec3[][]>();
  for (const boucle of enBoucles(bords)) {
    const longueurs = new Map<Id | null, number>();
    for (const b of boucle.bords) longueurs.set(b.materiau ?? null, (longueurs.get(b.materiau ?? null) ?? 0) + len(sub(b.b, b.a)));
    const k = [...longueurs.entries()].sort((x, y) => (x[0] === null ? 1 : 0) - (y[0] === null ? 1 : 0) || y[1] - x[1])[0]![0];
    parMatiere.set(k, [...(parMatiere.get(k) ?? []), boucle.points]);
  }
  return [...parMatiere.entries()].map(([materiau, boucles]) => ({ boucles, materiau }));
}

interface Occulteur {
  readonly boucles: readonly (readonly P2[])[];
  readonly min: P2;
  readonly max: P2;
  readonly n: Vec3;
  readonly c: number;
  readonly nz: number;
}

/** Point dans un polygone à trous (pair-impair), strictement à l'intérieur à la tolérance près. */
function dedans(p: P2, boucles: readonly (readonly P2[])[]): boolean {
  let n = false;
  for (const b of boucles) {
    for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
      const a = b[i]!;
      const c = b[j]!;
      if (a.y > p.y !== c.y > p.y && p.x < ((c.x - a.x) * (p.y - a.y)) / (c.y - a.y) + a.x) n = !n;
    }
  }
  return n;
}

/**
 * Projette le modèle selon la vue : traits vus et cachés (les arêtes adoucies ne sont pas tracées), contour et poché de
 * la matière coupée par le plan de coupe actif (la partie coupée disparaît).
 */
export function projeterPlan(m: Modele, vue: VueProjection, o: { readonly plan?: PlanDeCoupe | null } = {}): PlanProjete {
  const plan = o.plan === undefined ? planDeCoupeActif(m) : o.plan;
  const R = repereVue(vue);
  const pr = (p: Vec3): P2 => ({ x: dot(p, R.x), y: dot(p, R.y) });
  const prof = (p: Vec3) => dot(p, R.z);
  // (Cas 2, lot 4, n° 59) Profondeur vue limitée : au-delà, rien n'est dessiné.
  const garde = (p: Vec3) => !plan || (cote(plan, p) <= 1e-9 && (plan.profondeur === undefined || -cote(plan, p) <= plan.profondeur + 1e-9));
  const geo = geometrieVisible(m);
  const occulteurs: Occulteur[] = [];
  for (const f of geo.faces) {
    const nz = dot(f.normale, R.z);
    if (Math.abs(nz) < 1e-9) continue;
    const boucles = [f.exterieur, ...f.trous].map((b) => b.map(pr));
    const xs = boucles.flat().map((p) => p.x);
    const ys = boucles.flat().map((p) => p.y);
    occulteurs.push({ boucles, min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) }, n: f.normale, c: dot(f.normale, f.exterieur[0]!), nz });
  }
  const pointMonde = (p: P2, t: number): Vec3 => add(add(scale(R.x, p.x), scale(R.y, p.y)), scale(R.z, t));
  /** Le point P (monde) est-il caché par une face conservée, plus proche de l'œil ? */
  const cache = (P: Vec3): boolean => {
    const p = pr(P);
    const dp = prof(P);
    for (const f of occulteurs) {
      if (p.x < f.min.x - EPS || p.x > f.max.x + EPS || p.y < f.min.y - EPS || p.y > f.max.y + EPS) continue;
      // Profondeur de la face au droit du point : intersection du rayon de vue avec son plan.
      const base = pointMonde(p, 0);
      const t = (f.c - dot(f.n, base)) / f.nz;
      if (t >= dp - 1e-6) continue;
      if (!garde(pointMonde(p, t))) continue;
      if (dedans(p, f.boucles)) return true;
    }
    return false;
  };
  const tous = geo.aretes.filter((a) => !a.adoucie).flatMap((a) => [a.a, a.b]);
  const diag = tous.length ? len(sub(tous.reduce((u, v) => ({ x: Math.max(u.x, v.x), y: Math.max(u.y, v.y), z: Math.max(u.z, v.z) })), tous.reduce((u, v) => ({ x: Math.min(u.x, v.x), y: Math.min(u.y, v.y), z: Math.min(u.z, v.z) })))) : 0;
  const pasEch = Math.max(diag / 400, 1e-4);
  const traits: TraitProjete[] = [];
  for (const ar of geo.aretes) {
    if (ar.adoucie) continue;
    let a = ar.a;
    let b = ar.b;
    // Découpe par le plan : seule la partie conservée est tracée.
    if (plan) {
      const sa = cote(plan, a);
      const sb = cote(plan, b);
      if (sa > 1e-9 && sb > 1e-9) continue;
      if (sa > 1e-9) a = add(a, scale(sub(b, a), sa / (sa - sb)));
      else if (sb > 1e-9) b = add(a, scale(sub(b, a), sa / (sa - sb)));
      if (plan.profondeur !== undefined) {
        // Second plan, à la profondeur vue : la partie plus lointaine n'est pas tracée.
        const ta = -cote(plan, a) - plan.profondeur;
        const tb = -cote(plan, b) - plan.profondeur;
        if (ta > 1e-9 && tb > 1e-9) continue;
        if (ta > 1e-9) a = add(a, scale(sub(b, a), ta / (ta - tb)));
        else if (tb > 1e-9) b = add(a, scale(sub(b, a), ta / (ta - tb)));
      }
    }
    const pa = pr(a);
    const pb = pr(b);
    const l2 = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (l2 < 1e-9) continue;
    const n = Math.min(400, Math.max(1, Math.ceil(l2 / pasEch)));
    let debut = 0;
    let classe: ClasseTrait | null = null;
    for (let i = 0; i < n; i++) {
      const milieu = add(a, scale(sub(b, a), (i + 0.5) / n));
      const c: ClasseTrait = cache(milieu) ? "cache" : "vu";
      if (classe === null) classe = c;
      if (c !== classe) {
        traits.push({ a: pr(add(a, scale(sub(b, a), debut / n))), b: pr(add(a, scale(sub(b, a), i / n))), classe, ...(ar.balise ? { balise: ar.balise } : {}) });
        debut = i;
        classe = c;
      }
    }
    if (classe) traits.push({ a: pr(add(a, scale(sub(b, a), debut / n))), b: pr(b), classe, ...(ar.balise ? { balise: ar.balise } : {}) });
  }
  const poches: PocheProjetee[] = [];
  if (plan) {
    for (const s of sectionsDeCoupe(m, plan)) {
      const boucles = s.boucles.map((bo) => bo.map(pr));
      poches.push({ boucles, materiau: s.materiau });
      for (const bo of boucles) for (let i = 0; i < bo.length; i++) traits.push({ a: bo[i]!, b: bo[(i + 1) % bo.length]!, classe: "coupe" });
    }
  }
  const pts = traits.flatMap((t) => [t.a, t.b]);
  const cadre = pts.length ? { min: { x: Math.min(...pts.map((p) => p.x)), y: Math.min(...pts.map((p) => p.y)) }, max: { x: Math.max(...pts.map((p) => p.x)), y: Math.max(...pts.map((p) => p.y)) } } : null;
  return { traits, poches, cadre };
}

// ————————————————————————————————————————————————————————————— Motifs de hachure

export type ErreurMotif = "nom" | "angle" | "pas" | "absent" | "fichier" | "limite";
export const NOM_MOTIF_MAX = 60;
/** Bornes d'un motif enregistré (lecture du document) : appliquées aussi à la saisie et à l'import, pour qu'un motif accepté se relise toujours. */
export const FAMILLES_MOTIF_MAX = 64;
export const TIRETS_FAMILLE_MAX = 32;

/** Motif reçu (document, delta) : jamais cru sur parole. */
export function estMotif(id: Id, v: unknown): v is MotifHachure {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const w = v as Record<string, unknown>;
  const fini = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const famille = (f: unknown): boolean => {
    if (typeof f !== "object" || f === null) return false;
    const g = f as Record<string, unknown>;
    return fini(g["angle"]) && fini(g["x0"]) && fini(g["y0"]) && fini(g["dx"]) && fini(g["dy"]) && g["dy"] !== 0 && Array.isArray(g["tirets"]) && g["tirets"].length <= TIRETS_FAMILLE_MAX && g["tirets"].every(fini);
  };
  const s = w["source"] as Record<string, unknown> | undefined;
  return (
    w["id"] === id &&
    /^h[0-9a-z]+$/.test(id) &&
    typeof w["nom"] === "string" &&
    w["nom"].trim().length > 0 &&
    w["nom"].length <= NOM_MOTIF_MAX &&
    Array.isArray(w["familles"]) &&
    w["familles"].length >= 1 &&
    w["familles"].length <= FAMILLES_MOTIF_MAX &&
    w["familles"].every(famille) &&
    typeof s === "object" &&
    s !== null &&
    (s["genre"] === "saisie" || (s["genre"] === "pat" && typeof s["fichier"] === "string" && s["fichier"].length <= 200))
  );
}

/** Motif simple saisi : une famille de lignes continues, angle (degrés) et pas (mm papier). */
export function familleSimple(angle: number, pas: number): FamilleHachure {
  return { angle, x0: 0, y0: 0, dx: 0, dy: pas, tirets: [] };
}

/**
 * Lecture d'un fichier .pat (motifs de hachure) : « *NOM, description » puis une ligne par famille
 * « angle, x0, y0, dx, dy [, tiret…] ». Les valeurs sont prises en mm papier ; une ligne illisible refuse le fichier
 * avec son numéro, jamais un motif à moitié lu.
 */
export function lirePat(texte: string): { readonly ok: true; readonly motifs: readonly { nom: string; familles: FamilleHachure[] }[] } | { readonly ok: false; readonly ligne: number } {
  const motifs: { nom: string; familles: FamilleHachure[] }[] = [];
  const lignes = texte.replace(/^﻿/, "").split(/\r?\n/);
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i]!.replace(/;.*$/, "").trim();
    if (!l) continue;
    if (l.startsWith("*")) {
      const nom = l.slice(1).split(",")[0]!.trim().slice(0, NOM_MOTIF_MAX);
      if (!nom) return { ok: false, ligne: i + 1 };
      motifs.push({ nom, familles: [] });
      continue;
    }
    const courant = motifs[motifs.length - 1];
    const v = l.split(",").map((x) => Number(x.trim()));
    if (!courant || v.length < 5 || v.some((x) => !Number.isFinite(x)) || v[4] === 0) return { ok: false, ligne: i + 1 };
    // Au-delà des bornes du document, le motif ne se relirait pas : la ligne fautive refuse le fichier.
    if (courant.familles.length >= FAMILLES_MOTIF_MAX || v.length - 5 > TIRETS_FAMILLE_MAX) return { ok: false, ligne: i + 1 };
    courant.familles.push({ angle: v[0]!, x0: v[1]!, y0: v[2]!, dx: v[3]!, dy: v[4]!, tirets: v.slice(5) });
  }
  if (!motifs.length || motifs.some((x) => x.familles.length === 0)) return { ok: false, ligne: lignes.length };
  return { ok: true, motifs };
}

export type ResultatMotif = { readonly ok: true; readonly modele: Modele; readonly ids: readonly Id[] } | { readonly ok: false; readonly erreur: ErreurMotif };

/** Ajoute des motifs (un pas). */
export function ajouterMotifs(m: Modele, motifs: readonly Omit<MotifHachure, "id">[]): ResultatMotif {
  for (const x of motifs) {
    if (!x.nom.trim() || x.nom.length > NOM_MOTIF_MAX) return { ok: false, erreur: "nom" };
    if (!x.familles.length || x.familles.some((f) => !Number.isFinite(f.angle))) return { ok: false, erreur: "angle" };
    if (x.familles.some((f) => !Number.isFinite(f.dy) || f.dy === 0)) return { ok: false, erreur: "pas" };
    if (!estMotif("h0", { ...x, id: "h0" })) return { ok: false, erreur: "limite" };
  }
  const ids: Id[] = [];
  const modele = modifierAnnotations(m, (a, id) => {
    for (const x of motifs) {
      const i = id("h");
      a.motifs[i] = { ...x, nom: x.nom.trim(), id: i };
      ids.push(i);
    }
  }).modele;
  return { ok: true, modele, ids };
}

/** Modifie le nom, l'angle et le pas d'un motif simple (première famille). */
export function modifierMotif(m: Modele, id: Id, v: { readonly nom: string; readonly angle: number; readonly pas: number }): ResultatMotif {
  const x = m.annotations?.motifs?.[id];
  if (!x) return { ok: false, erreur: "absent" };
  if (!v.nom.trim() || v.nom.length > NOM_MOTIF_MAX) return { ok: false, erreur: "nom" };
  if (!Number.isFinite(v.angle)) return { ok: false, erreur: "angle" };
  if (!(Number.isFinite(v.pas) && v.pas > 0)) return { ok: false, erreur: "pas" };
  const [premiere, ...autres] = x.familles;
  const modele = modifierAnnotations(m, (a) => {
    a.motifs[id] = { ...x, nom: v.nom.trim(), familles: [{ ...(premiere ?? familleSimple(0, 1)), angle: v.angle, dy: v.pas }, ...autres] };
  }).modele;
  return { ok: true, modele, ids: [id] };
}

/** Supprime un motif ; les matières qui l'utilisaient reviennent à l'aplat gris (un pas). */
export function supprimerMotif(m: Modele, id: Id): ResultatMotif {
  if (!m.annotations?.motifs?.[id]) return { ok: false, erreur: "absent" };
  const modele = modifierAnnotations(m, (a) => {
    delete a.motifs[id];
    for (const [k, mat] of Object.entries(a.materiaux)) {
      if (mat.motif === id) {
        const { motif: _retire, ...reste } = mat;
        a.materiaux[k] = reste;
      }
    }
  }).modele;
  return { ok: true, modele, ids: [id] };
}

/** Associe (ou retire, `null`) le motif d'une matière (un pas). */
export function associerMotif(m: Modele, materiau: Id, motif: Id | null): ResultatMotif {
  const mat = m.annotations?.materiaux[materiau];
  if (!mat || (motif !== null && !m.annotations?.motifs?.[motif])) return { ok: false, erreur: "absent" };
  const modele = modifierAnnotations(m, (a) => {
    const { motif: _ancien, ...reste } = mat;
    a.materiaux[materiau] = motif === null ? reste : { ...reste, motif };
  }).modele;
  return { ok: true, modele, ids: [materiau] };
}

/** Matières qui utilisent chaque motif. */
export function matieresParMotif(m: Modele): Record<Id, Materiau[]> {
  const r: Record<Id, Materiau[]> = {};
  for (const mat of Object.values(m.annotations?.materiaux ?? {})) if (mat.motif) (r[mat.motif] ??= []).push(mat);
  return r;
}

// ————————————————————————————————————————————————————————————— Sortie SVG

export interface OptionsSvg {
  /** Dénominateur de l'échelle (50 pour 1:50). */
  readonly echelle: number;
  /** Épaisseurs des traits (mm papier). */
  readonly traits: Readonly<Record<ClasseTrait, number>>;
  /** Lignes cachées : en pointillé, ou masquées. */
  readonly cachees: "pointille" | "masquees";
  /** Marge autour du dessin (mm papier). */
  readonly marge?: number;
}

const n3 = (v: number): string => String(Math.round(v * 1000) / 1000);
const APLAT = "rgb(217,217,217)";

/** Dessin SVG à l'échelle : viewBox et dimensions en millimètres papier ; un groupe par classe de trait. */
export function svgPlan(plan: PlanProjete, m: Modele, o: OptionsSvg): string {
  const k = 1000 / o.echelle;
  const marge = o.marge ?? 10;
  const c = plan.cadre ?? { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  const larg = (c.max.x - c.min.x) * k + 2 * marge;
  const haut = (c.max.y - c.min.y) * k + 2 * marge;
  const X = (p: P2) => n3((p.x - c.min.x) * k + marge);
  const Y = (p: P2) => n3((c.max.y - p.y) * k + marge);
  const motifs = m.annotations?.motifs ?? {};
  const materiaux = m.annotations?.materiaux ?? {};
  const defs: string[] = [];
  const corps: string[] = [];
  const motifsUtilises = new Set<Id>();
  for (const p of plan.poches) {
    const d = p.boucles.map((b) => `M${b.map((q) => `${X(q)} ${Y(q)}`).join(" L")} Z`).join(" ");
    const motif = p.materiau ? materiaux[p.materiau]?.motif : undefined;
    const mo = motif ? motifs[motif] : undefined;
    corps.push(`<path d="${d}" fill="${mo ? "rgb(255,255,255)" : APLAT}" fill-rule="evenodd" stroke="none"/>`);
    if (mo) {
      motifsUtilises.add(mo.id);
      mo.familles.forEach((_f, i) => corps.push(`<path d="${d}" fill="url(#${mo.id}-${i})" fill-rule="evenodd" stroke="none"/>`));
    }
  }
  for (const id of motifsUtilises) {
    const mo = motifs[id]!;
    mo.familles.forEach((f, i) => {
      const pas = Math.abs(f.dy);
      const traits = f.tirets.map((t) => Math.max(Math.abs(t), 0.05));
      const tirets = traits.length ? ` stroke-dasharray="${traits.map(n3).join(" ")}"` : "";
      // Largeur de la tuile : une période de tirets (sinon 1000 mm) ; décalage dx d'une ligne à la suivante rendu par un
      // cisaillement (skewX) de la tuile : la ligne de rang k glisse de k·dx le long de sa direction, comme dans le .pat.
      const periode = traits.length ? traits.reduce((a, b) => a + b, 0) * (traits.length % 2 ? 2 : 1) : 1000;
      const cisaillement = f.dx !== 0 ? ` skewX(${n3((Math.atan2(f.dx, f.dy) * 180) / Math.PI)})` : "";
      // Le motif est en mm papier : indépendant de l'échelle du dessin.
      defs.push(`<pattern id="${id}-${i}" patternUnits="userSpaceOnUse" width="${n3(periode)}" height="${n3(pas)}" patternTransform="rotate(${n3(-f.angle)}) translate(${n3(f.x0)} ${n3(f.y0)})${cisaillement}"><line x1="0" y1="0" x2="${n3(periode)}" y2="0" stroke="rgb(0,0,0)" stroke-width="0.13"${tirets}/></pattern>`);
    });
  }
  // (Cas 2, lot 4, n° 115) Un trait « vu » d'une balise dont l'épaisseur ou le type de trait est saisi est rangé dans un
  // sous-groupe à ses valeurs ; sinon il garde l'épaisseur de sa classe.
  const balises = m.annotations?.balises ?? {};
  const propre = (t: TraitProjete) => t.classe === "vu" && !!t.balise && (balises[t.balise]?.epaisseur !== undefined || (balises[t.balise]?.trait ?? "continu") !== "continu");
  const lignes = (ts: readonly TraitProjete[]) => ts.map((t) => `<line x1="${X(t.a)}" y1="${Y(t.a)}" x2="${X(t.b)}" y2="${Y(t.b)}"/>`).join("");
  const groupe = (cl: ClasseTrait, attrs: string) => {
    const ts = plan.traits.filter((t) => t.classe === cl && !propre(t));
    if (!ts.length || (cl === "cache" && o.cachees === "masquees")) return "";
    return `<g id="${cl}" fill="none" stroke="rgb(0,0,0)" stroke-width="${n3(o.traits[cl])}" stroke-linecap="round"${attrs}>${lignes(ts)}</g>`;
  };
  const parBalise = [...new Set(plan.traits.filter(propre).map((t) => t.balise!))].map((id) => {
    const b = balises[id]!;
    const e = b.epaisseur ?? o.traits.vu;
    const tirets = tiretsDuTrait(b.trait, e);
    return `<g id="vu-${id}" fill="none" stroke="rgb(0,0,0)" stroke-width="${n3(e)}" stroke-linecap="round"${tirets.length ? ` stroke-dasharray="${tirets.map(n3).join(" ")}"` : ""}>${lignes(plan.traits.filter((t) => propre(t) && t.balise === id))}</g>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n3(larg)}mm" height="${n3(haut)}mm" viewBox="0 0 ${n3(larg)} ${n3(haut)}">`,
    defs.length ? `<defs>${defs.join("")}</defs>` : "",
    `<g id="poche">${corps.join("")}</g>`,
    groupe("vu", ""),
    ...parBalise,
    groupe("cache", ` stroke-dasharray="${n3(Math.max(o.traits.cache * 8, 1))} ${n3(Math.max(o.traits.cache * 6, 0.8))}"`),
    groupe("coupe", ""),
    `</svg>`,
  ].join("");
}
