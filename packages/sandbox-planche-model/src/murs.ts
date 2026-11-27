/**
 * Murs à épaisseur de la Planche (cas 4 du catalogue des extensions, étape 4 : D4-F5-003). Pur : ni React, ni DOM.
 *
 * Un mur (`annotations.murs`, préfixe « w ») est un tracé d'axe (polyligne horizontale, ouverte ou fermée), une épaisseur,
 * une hauteur et un côté de référence : l'axe, le nu intérieur (le tracé est la face gauche du mur, dans le sens du
 * tracé) ou le nu extérieur (face droite). Sa géométrie est un groupe ordinaire de la racine (`occurrence`), extrudé
 * depuis son empreinte : il reste modifiable directement (pousser-tirer…).
 *
 * Jonctions, calculées à chaque pose :
 * - angle en L dans un tracé continu, ou entre deux murs qui se rejoignent par leurs extrémités : coupe d'onglet ;
 * - jonction en T (extrémité posée sur l'axe d'un autre mur) : le mur s'arrête contre la face du mur traversant ;
 * - croisement de deux axes, angle trop aigu, mur voisin modifié à la main : **signalés**, jamais corrigés en silence.
 * Un mur modifié à la main (sa géométrie n'est plus celle qui a été posée) n'est jamais régénéré.
 */
import type { Mur } from "./annotations.js";
import { type Id, type Modele, ajouterSegment, contexte, effacerEntites, grouperVide, modifierAnnotations, pousserTirer, rattacherOccurrencesNiveau } from "./geometrie-libre.js";
import { type Vec3, dist } from "./vecteur.js";

export type ReferenceMur = Mur["reference"];
export const REFERENCES_MUR: readonly ReferenceMur[] = ["axe", "interieur", "exterieur"];
/** Tolérance de coïncidence des points d'axe (m) et d'angle (cosinus de l'angle le plus aigu admis entre deux segments). */
const EPS = 1e-6;
const COS_AIGU = Math.cos((10 * Math.PI) / 180);

export type JonctionMur = "angle" | "te" | "croisement" | "aigu" | "voisin-modifie";
export type ErreurMur = "axe" | "epaisseur" | "hauteur" | "aigu" | "absent";

export interface ParametresMur {
  readonly epaisseur: number;
  readonly hauteur: number;
  readonly reference: ReferenceMur;
}

type P2 = { readonly x: number; readonly y: number };
const sous = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const plus = (a: P2, b: P2): P2 => ({ x: a.x + b.x, y: a.y + b.y });
const fois = (a: P2, k: number): P2 => ({ x: a.x * k, y: a.y * k });
const croix = (a: P2, b: P2): number => a.x * b.y - a.y * b.x;
const scal = (a: P2, b: P2): number => a.x * b.x + a.y * b.y;
const norme = (a: P2): number => Math.hypot(a.x, a.y);
const unit = (a: P2): P2 => fois(a, 1 / norme(a));
const gauche = (d: P2): P2 => ({ x: -d.y, y: d.x });
const memePoint = (a: P2, b: P2): boolean => norme(sous(a, b)) <= 1e-4;

/** Décalages gauche / droite de l'axe selon la référence (gauche positif). */
export function decalages(p: ParametresMur): { readonly g: number; readonly d: number } {
  if (p.reference === "interieur") return { g: 0, d: -p.epaisseur };
  if (p.reference === "exterieur") return { g: p.epaisseur, d: 0 };
  return { g: p.epaisseur / 2, d: -p.epaisseur / 2 };
}

/** Intersection des droites (a + t·u) et (b + s·v) ; `null` si parallèles. */
function intersection(a: P2, u: P2, b: P2, v: P2): P2 | null {
  const k = croix(u, v);
  if (Math.abs(k) < 1e-12) return null;
  return plus(a, fois(u, croix(sous(b, a), v) / k));
}

/** Projection paramétrique d'un point sur un segment : t ∈ ]0, 1[ et distance, ou `null` hors segment. */
function surSegment(p: P2, a: P2, b: P2): number | null {
  const ab = sous(b, a);
  const L2 = scal(ab, ab);
  if (L2 < EPS) return null;
  const t = scal(sous(p, a), ab) / L2;
  if (t <= 1e-6 || t >= 1 - 1e-6) return null;
  return norme(sous(p, plus(a, fois(ab, t)))) <= 1e-4 ? t : null;
}

const segmentsDe = (m: Pick<Mur, "axe" | "ferme">): [P2, P2][] => {
  const s: [P2, P2][] = [];
  for (let i = 0; i + 1 < m.axe.length; i++) s.push([m.axe[i]!, m.axe[i + 1]!]);
  if (m.ferme && m.axe.length > 2) s.push([m.axe[m.axe.length - 1]!, m.axe[0]!]);
  return s;
};

export interface EmpreinteMur {
  /** Contour extérieur (et contour intérieur d'un mur fermé), à l'altitude de l'axe. */
  readonly boucles: readonly (readonly Vec3[])[];
  readonly jonctions: readonly JonctionMur[];
  readonly erreur: "aigu" | null;
}

/**
 * Empreinte d'un mur (pur) d'après son axe, ses paramètres et les murs voisins : onglets aux angles du tracé et aux
 * extrémités jointes à l'extrémité d'un autre mur, arrêt contre la face d'un mur traversé (T), croisements signalés.
 */
export function empreinteMur(mur: Pick<Mur, "axe" | "ferme" | "epaisseur" | "hauteur" | "reference">, voisins: readonly Pick<Mur, "id" | "axe" | "ferme" | "epaisseur" | "hauteur" | "reference">[] = []): EmpreinteMur {
  const z = mur.axe[0]?.z ?? 0;
  const { g, d } = decalages(mur);
  const segs = segmentsDe(mur);
  // Jonctions notées une fois par lieu (chaque côté du mur repasse par les mêmes sommets).
  const notees = new Map<string, JonctionMur>();
  const noter = (j: JonctionMur, p: P2) => notees.set(`${j}@${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`, j);
  let erreur: "aigu" | null = null;
  const dir = segs.map(([a, b]) => unit(sous(b, a)));
  /** Point du côté `off` à la jonction entre le segment i−1 (direction u) et i (direction v), au sommet s. */
  const onglet = (s: P2, u: P2, v: P2, offU: number, offV: number): P2 => {
    if (scal(u, v) < -COS_AIGU) {
      erreur = "aigu";
      noter("aigu", s);
    } else if (Math.abs(croix(u, v)) > 1e-9) noter("angle", s);
    return intersection(plus(s, fois(gauche(u), offU)), u, plus(s, fois(gauche(v), offV)), v) ?? plus(s, fois(gauche(v), offV));
  };
  const cotes = (off: number): P2[] => {
    const pts: P2[] = [];
    const n = segs.length;
    for (let i = 0; i < n; i++) {
      const [a] = segs[i]!;
      if (i === 0 && !mur.ferme) pts.push(bout(a, dir[0]!, off, "debut"));
      else {
        const u = dir[(i - 1 + n) % n]!;
        pts.push(onglet(a, u, dir[i]!, off, off));
      }
    }
    if (!mur.ferme) pts.push(bout(segs[n - 1]![1], dir[n - 1]!, off, "fin"));
    return pts;
  };
  /** Extrémité libre d'un tracé ouvert : onglet avec un mur joint par son extrémité, arrêt en T, sinon bout droit. */
  const bout = (s: P2, v: P2, off: number, quel: "debut" | "fin"): P2 => {
    const sortant = quel === "debut" ? v : fois(v, -1);
    for (const w of voisins) {
      const ws = segmentsDe(w);
      const wo = decalages(w);
      for (const [a, b] of ws) {
        // L entre deux murs : l'extrémité coïncide avec une extrémité (ouverte) du voisin.
        if (!w.ferme) {
          const debutW = memePoint(s, w.axe[0]!) && memePoint(a, w.axe[0]!);
          const finW = memePoint(s, w.axe[w.axe.length - 1]!) && memePoint(b, w.axe[w.axe.length - 1]!);
          if (debutW || finW) {
            // Direction du voisin en partant du point, et ses décalages gauche / droite dans ce sens.
            const away = debutW ? unit(sous(b, a)) : unit(sous(a, b));
            const La = debutW ? wo.g : -wo.d;
            const Ra = debutW ? wo.d : -wo.g;
            if (quel === "debut") return onglet(s, fois(away, -1), v, off === g ? -Ra : -La, off);
            return onglet(s, v, away, off, off === g ? La : Ra);
          }
        }
        // T : l'extrémité est sur l'axe du voisin, hors de ses extrémités.
        if (surSegment(s, a, b) !== null) {
          const e = unit(sous(b, a));
          const faces = [plus(s, fois(gauche(e), wo.g)), plus(s, fois(gauche(e), wo.d))];
          // Face du voisin du côté où part le mur.
          const face = faces.reduce((x, y) => (scal(sous(y, s), sortant) > scal(sous(x, s), sortant) ? y : x));
          const r = intersection(plus(s, fois(gauche(v), off)), v, face, e);
          if (r) {
            noter("te", s);
            return r;
          }
        }
      }
    }
    return plus(s, fois(gauche(v), off));
  };
  const gch = cotes(g);
  const drt = cotes(d);
  // Croisements : segments du mur qui coupent l'axe d'un voisin hors des extrémités et des T.
  for (const [a, b] of segs) {
    for (const w of voisins) {
      for (const [c, e] of segmentsDe(w)) {
        const k = croix(sous(b, a), sous(e, c));
        if (Math.abs(k) < 1e-12) continue;
        const t = croix(sous(c, a), sous(e, c)) / k;
        const s = croix(sous(c, a), sous(b, a)) / k;
        if (t > 1e-6 && t < 1 - 1e-6 && s > 1e-6 && s < 1 - 1e-6) noter("croisement", plus(a, fois(sous(b, a), t)));
      }
    }
  }
  const z3 = (p: P2): Vec3 => ({ x: p.x, y: p.y, z });
  const boucles = mur.ferme ? [gch.map(z3), drt.map(z3)] : [[...gch, ...drt.reverse()].map(z3)];
  return { boucles, jonctions: [...notees.values()], erreur };
}

/** Signature de la géométrie d'un groupe (sommets arrondis au dixième de millimètre) : détecte une modification à la main. */
export function signatureGroupe(m: Modele, occurrence: Id): string | null {
  const o = m.racine.occurrences[occurrence];
  const def = o ? m.definitions[o.definition] : undefined;
  if (!def) return null;
  return Object.values(def.contenu.sommets)
    .map((s) => `${Math.round(s.position.x * 1e4)},${Math.round(s.position.y * 1e4)},${Math.round(s.position.z * 1e4)}`)
    .sort()
    .join(";");
}

/** Murs du document dont le groupe existe encore (un groupe effacé efface le mur). */
export function mursDuModele(m: Modele): Mur[] {
  return Object.values(m.annotations?.murs ?? {}).filter((w) => m.racine.occurrences[w.occurrence] !== undefined);
}

/** Mur dont le groupe est donné. */
export const murDeOccurrence = (m: Modele, occurrence: Id): Mur | null => mursDuModele(m).find((w) => w.occurrence === occurrence) ?? null;

/** Le groupe du mur est-il encore celui qui a été posé ? */
export const murIntact = (m: Modele, w: Mur): boolean => signatureGroupe(m, w.occurrence) === w.signature;

function validerParametres(p: ParametresMur): ErreurMur | null {
  if (!(Number.isFinite(p.epaisseur) && p.epaisseur > 0)) return "epaisseur";
  if (!(Number.isFinite(p.hauteur) && p.hauteur > 0)) return "hauteur";
  return null;
}

/** Axe nettoyé : points consécutifs confondus retirés, même altitude que le premier ; fermé si le dernier revient au premier. */
export function nettoyerAxe(points: readonly Vec3[]): { readonly axe: Vec3[]; readonly ferme: boolean } | null {
  const z = points[0]?.z ?? 0;
  const axe: Vec3[] = [];
  for (const p of points) if (!axe.length || dist(axe[axe.length - 1]!, { ...p, z }) > 1e-4) axe.push({ x: p.x, y: p.y, z });
  let ferme = false;
  if (axe.length > 3 && dist(axe[0]!, axe[axe.length - 1]!) <= 1e-4) {
    axe.pop();
    ferme = true;
  }
  return axe.length >= 2 ? { axe, ferme } : null;
}

/** Construit le groupe d'un mur depuis son empreinte : boucles tracées dans un groupe vide, face extrudée de la hauteur. */
function construire(m: Modele, emp: EmpreinteMur, hauteur: number): { modele: Modele; occurrence: Id } {
  const g = grouperVide(m, { nom: "Mur" });
  let modele = g.modele;
  const occ = g.occurrence;
  // Segments de chaque boucle, dans le groupe : la face (et son trou pour un mur fermé) naît de la fermeture.
  for (const b of emp.boucles) for (let i = 0; i < b.length; i++) modele = ajouterSegment(modele, b[i]!, b[(i + 1) % b.length]!, { dans: occ }).modele;
  // Mur fermé : la boucle intérieure a aussi créé une face pleine au centre ; elle est retirée.
  const contenu = () => contexte(modele, occ);
  const faces = Object.values(contenu().faces);
  const anneau = faces.find((f) => f.trous.length > 0) ?? faces[0];
  if (!anneau) return { modele, occurrence: occ };
  const autres = faces.filter((f) => f.id !== anneau.id).map((f) => f.id);
  if (autres.length) modele = effacerEntites(modele, autres, { dans: occ }).modele;
  const f = contenu().faces[anneau.id]!;
  const sens = f.normale.z >= 0 ? 1 : -1;
  modele = pousserTirer(modele, f.id, sens * hauteur, { dans: occ }).modele;
  return { modele, occurrence: occ };
}

export type ResultatMur = { readonly ok: true; readonly modele: Modele; readonly ids: readonly Id[]; readonly jonctions: readonly JonctionMur[] } | { readonly ok: false; readonly erreur: ErreurMur };

/**
 * Pose des murs (un pas d'historique à l'appelant : une seule opération rendue) : chaque tracé devient un mur ; les murs
 * voisins joints en L par leurs extrémités sont régénérés pour l'onglet, sauf s'ils ont été modifiés à la main
 * (jonction signalée « voisin modifié »).
 */
export function poserMurs(m: Modele, traces: readonly (readonly Vec3[])[], p: ParametresMur): ResultatMur {
  const e = validerParametres(p);
  if (e) return { ok: false, erreur: e };
  const nets = traces.map(nettoyerAxe);
  if (nets.some((n) => n === null) || nets.length === 0) return { ok: false, erreur: "axe" };
  let modele = m;
  const ids: Id[] = [];
  const toutes: JonctionMur[] = [];
  for (const n of nets as { axe: Vec3[]; ferme: boolean }[]) {
    const existants = mursDuModele(modele);
    const nouveau = { id: "", axe: n.axe, ferme: n.ferme, epaisseur: p.epaisseur, hauteur: p.hauteur, reference: p.reference };
    const emp = empreinteMur(nouveau, existants);
    if (emp.erreur) return { ok: false, erreur: "aigu" };
    const c = construire(modele, emp, p.hauteur);
    modele = c.modele;
    const signature = signatureGroupe(modele, c.occurrence) ?? "";
    let idMur = "";
    modele = modifierAnnotations(modele, (a, id) => {
      idMur = id("w");
      a.murs[idMur] = { ...nouveau, id: idMur, occurrence: c.occurrence, signature };
    }).modele;
    ids.push(idMur);
    toutes.push(...emp.jonctions);
    // Voisins joints en L par une extrémité : régénérés pour l'onglet (s'ils sont intacts).
    for (const w of existants) {
      if (w.ferme) continue;
      const touche = [n.axe[0]!, n.axe[n.axe.length - 1]!].some((q) => memePoint(q, w.axe[0]!) || memePoint(q, w.axe[w.axe.length - 1]!));
      if (!touche || n.ferme) continue;
      if (!murIntact(modele, w)) {
        toutes.push("voisin-modifie");
        continue;
      }
      modele = regenerer(modele, w.id);
    }
  }
  return { ok: true, modele, ids, jonctions: toutes };
}

/** Régénère un mur intact d'après les murs voisins (même identifiant, nouveau groupe, niveau conservé). */
export function regenerer(m: Modele, id: Id): Modele {
  const w = m.annotations?.murs?.[id];
  if (!w) return m;
  const voisins = mursDuModele(m).filter((x) => x.id !== id);
  const emp = empreinteMur(w, voisins);
  if (emp.erreur) return m;
  const niveau = m.racine.occurrences[w.occurrence]?.niveau ?? null;
  let modele = effacerEntites(m, [w.occurrence]).modele;
  const c = construire(modele, emp, w.hauteur);
  modele = c.modele;
  if (niveau) modele = rattacherOccurrencesNiveau(modele, [c.occurrence], niveau).modele;
  const signature = signatureGroupe(modele, c.occurrence) ?? "";
  return modifierAnnotations(modele, (a) => {
    a.murs[id] = { ...w, occurrence: c.occurrence, signature };
  }).modele;
}

/** Jonctions d'un mur posé, recalculées d'après ses voisins actuels (Info entité). */
export function jonctionsDuMur(m: Modele, w: Mur): { readonly angle: number; readonly te: number; readonly croisement: number } {
  const j = empreinteMur(w, mursDuModele(m).filter((x) => x.id !== w.id)).jonctions;
  const n = (k: JonctionMur) => j.filter((x) => x === k).length;
  return { angle: n("angle"), te: n("te"), croisement: n("croisement") };
}

/** Longueur de l'axe d'un mur (m). */
export function longueurAxe(w: Pick<Mur, "axe" | "ferme">): number {
  return segmentsDe(w).reduce((s, [a, b]) => s + norme(sous(b, a)), 0);
}

/** Mur reçu (document, delta) : jamais cru sur parole. */
export function estMur(id: Id, v: unknown): v is Mur {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const w = v as Record<string, unknown>;
  const fini = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const point = (p: unknown): boolean => typeof p === "object" && p !== null && fini((p as Vec3).x) && fini((p as Vec3).y) && fini((p as Vec3).z);
  return (
    w["id"] === id &&
    Array.isArray(w["axe"]) &&
    w["axe"].length >= 2 &&
    w["axe"].length <= 10000 &&
    w["axe"].every(point) &&
    typeof w["ferme"] === "boolean" &&
    fini(w["epaisseur"]) &&
    w["epaisseur"] > 0 &&
    fini(w["hauteur"]) &&
    w["hauteur"] > 0 &&
    (REFERENCES_MUR as readonly unknown[]).includes(w["reference"]) &&
    typeof w["occurrence"] === "string" &&
    typeof w["signature"] === "string"
  );
}

/**
 * Chaînes d'arêtes (Murs depuis les arêtes) : les arêtes données de la racine, ordonnées en polylignes continues
 * (une boucle revient à son premier point). Arêtes non horizontales ignorées.
 */
export function chainesDAretes(m: Modele, aretes: readonly Id[]): Vec3[][] {
  const c = m.racine;
  const pos = (s: Id) => c.sommets[s]!.position;
  const restantes = new Set(aretes.filter((a) => c.aretes[a] && Math.abs(pos(c.aretes[a]!.a).z - pos(c.aretes[a]!.b).z) < 1e-6));
  const chaines: Vec3[][] = [];
  while (restantes.size) {
    const premiere = [...restantes][0]!;
    restantes.delete(premiere);
    const ar = c.aretes[premiere]!;
    const ids: Id[] = [ar.a, ar.b];
    const prolonger = (bout: "debut" | "fin") => {
      for (;;) {
        const s = bout === "fin" ? ids[ids.length - 1]! : ids[0]!;
        const suivante = [...restantes].find((a) => c.aretes[a]!.a === s || c.aretes[a]!.b === s);
        if (!suivante) return;
        restantes.delete(suivante);
        const x = c.aretes[suivante]!;
        const autre = x.a === s ? x.b : x.a;
        if (bout === "fin") ids.push(autre);
        else ids.unshift(autre);
      }
    };
    prolonger("fin");
    prolonger("debut");
    chaines.push(ids.map(pos));
  }
  return chaines;
}

/** Supprime l'annotation d'un mur (sa géométrie reste, comme un groupe ordinaire). */
export function oublierMur(m: Modele, id: Id): Modele {
  if (!m.annotations?.murs?.[id]) return m;
  return modifierAnnotations(m, (a) => {
    delete a.murs[id];
  }).modele;
}
