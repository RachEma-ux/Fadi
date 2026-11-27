/**
 * Contrôle du volume contre l'enveloppe au point le plus défavorable (cas 4 du catalogue des extensions, étape 7c :
 * D6-F20b-004 ; maquette `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7c).
 *
 * L'enveloppe est un objet fermé (solide) du modèle désigné par l'utilisateur ; les seuils de hauteur sont saisis avec
 * leur source (article, document, date). Fadi ne fournit aucune règle ni aucun seuil (aucune donnée réglementaire dans
 * le code). Chaque règle rend un état à trois valeurs : vérifiée, écart (valeur, seuil, marge signée), non évaluée
 * (donnée manquante, motif dit). Rien n'est modifié dans le modèle.
 *
 * Méthode déclarée : le contrôle se fait aux **sommets** des faces du projet (tout objet visible sauf l'enveloppe et la
 * géométrie libre). Un sommet est dedans s'il est dans le solide (parité d'un rayon) ou sur sa surface (à 1 mm) ; le
 * point le plus défavorable est le sommet le plus éloigné de la surface de l'enveloppe (qui peut être masquée). Les faces hors enveloppe sont
 * celles qui ont au moins un sommet dehors. La hauteur se mesure depuis le zéro du modèle (z = 0).
 */
import { maillagesPlanche } from "./representation.js";
import type { Id, Modele } from "./geometrie-libre.js";
import { estSolide, modifierAnnotations } from "./geometrie-libre.js";
import { maillageDuSolide, motifNonSolide } from "./maillage.js";
import { type Vec3, add, cross, dot, len, scale, sub, v3 } from "./vecteur.js";

export interface RegleHauteur {
  readonly id: string;
  readonly libelle: string;
  /** Seuil saisi (m) ; null = non saisi (règle non évaluée). */
  readonly seuil: number | null;
  /** Source du seuil (article, document, date) ; texte libre saisi. */
  readonly source: string;
}

export interface ReglagesEnveloppe {
  /** Occurrence de la racine désignée comme enveloppe ; null = aucune. */
  readonly objet: Id | null;
  /** Contrôle actif (hachures dans la vue, recalcul après chaque opération). */
  readonly controle: boolean;
  readonly regles: readonly RegleHauteur[];
}

export const ENVELOPPE_VIDE: ReglagesEnveloppe = Object.freeze({ objet: null, controle: false, regles: [] });
export const LIBELLE_REGLE_MAX = 120;
export const SOURCE_REGLE_MAX = 200;
/** Tolérance « sur la surface » (m). */
export const TOLERANCE_ENVELOPPE = 0.001;

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const texte = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

export function estRegleHauteur(v: unknown): v is RegleHauteur {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r["id"] === "string" && /^r[0-9]+$/.test(r["id"]) && texte(r["libelle"], LIBELLE_REGLE_MAX) && (r["seuil"] === null || (fini(r["seuil"]) && (r["seuil"] as number) > 0)) && texte(r["source"], SOURCE_REGLE_MAX);
}

/** Réglages reçus (document, delta) : jamais crus sur parole. */
export function estReglagesEnveloppe(v: unknown): v is ReglagesEnveloppe {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return (e["objet"] === null || typeof e["objet"] === "string") && typeof e["controle"] === "boolean" && Array.isArray(e["regles"]) && e["regles"].length <= 32 && e["regles"].every(estRegleHauteur) && new Set((e["regles"] as RegleHauteur[]).map((r) => r.id)).size === e["regles"].length;
}

export const enveloppeDe = (m: Modele): ReglagesEnveloppe => m.annotations?.enveloppe ?? ENVELOPPE_VIDE;

export type ErreurEnveloppe = "objet" | "libelle" | "seuil" | "source" | "absent";
export type ResultatReglages = { readonly ok: true; readonly modele: Modele } | { readonly ok: false; readonly erreur: ErreurEnveloppe };

function poser(m: Modele, e: ReglagesEnveloppe): Modele {
  return modifierAnnotations(m, (a) => {
    if (e.objet === null && !e.controle && e.regles.length === 0) delete a.enveloppe;
    else a.enveloppe = e;
  }).modele;
}

/** Désigne l'enveloppe (une occurrence de la racine) ; null la retire. Un pas. */
export function definirEnveloppe(m: Modele, objet: Id | null): ResultatReglages {
  if (objet !== null && !m.racine.occurrences[objet]) return { ok: false, erreur: "objet" };
  return { ok: true, modele: poser(m, { ...enveloppeDe(m), objet }) };
}

export function basculerControle(m: Modele): ResultatReglages {
  const e = enveloppeDe(m);
  return { ok: true, modele: poser(m, { ...e, controle: !e.controle }) };
}

export function ajouterRegleHauteur(m: Modele, libelle: string): ResultatReglages & { readonly id?: string } {
  const e = enveloppeDe(m);
  if (!texte(libelle, LIBELLE_REGLE_MAX) || libelle.trim() === "") return { ok: false, erreur: "libelle" };
  let n = 1;
  while (e.regles.some((r) => r.id === `r${n}`)) n++;
  const id = `r${n}`;
  return { ok: true, modele: poser(m, { ...e, regles: [...e.regles, { id, libelle: libelle.trim(), seuil: null, source: "" }] }), id };
}

export function modifierRegleHauteur(m: Modele, id: string, v: Partial<Omit<RegleHauteur, "id">>): ResultatReglages {
  const e = enveloppeDe(m);
  const r = e.regles.find((x) => x.id === id);
  if (!r) return { ok: false, erreur: "absent" };
  const s: RegleHauteur = { ...r, ...v, ...(v.libelle !== undefined ? { libelle: v.libelle.trim() } : {}), ...(v.source !== undefined ? { source: v.source.trim() } : {}) };
  if (!texte(s.libelle, LIBELLE_REGLE_MAX) || s.libelle === "") return { ok: false, erreur: "libelle" };
  if (s.seuil !== null && !(fini(s.seuil) && s.seuil > 0)) return { ok: false, erreur: "seuil" };
  if (!texte(s.source, SOURCE_REGLE_MAX)) return { ok: false, erreur: "source" };
  return { ok: true, modele: poser(m, { ...e, regles: e.regles.map((x) => (x.id === id ? s : x)) }) };
}

export function supprimerRegleHauteur(m: Modele, id: string): ResultatReglages {
  const e = enveloppeDe(m);
  if (!e.regles.some((x) => x.id === id)) return { ok: false, erreur: "absent" };
  return { ok: true, modele: poser(m, { ...e, regles: e.regles.filter((x) => x.id !== id) }) };
}

// ————————————————————————————————————————————————————————————— Contrôle

export type EtatRegle = "verifiee" | "ecart" | "non-evaluee";
export type MotifNonEvaluee = "sans-enveloppe" | "enveloppe-absente" | "enveloppe-ouverte" | "sans-projet" | "sans-seuil";

export interface LigneControle {
  /** "contenu" ou l'identifiant de la règle de hauteur. */
  readonly id: string;
  readonly genre: "contenu" | "hauteur";
  readonly libelle: string;
  readonly source: string;
  /** Contenu : distance hors enveloppe au point le plus défavorable (m, 0 si tout est dedans) ; hauteur : point le plus haut (m). */
  readonly valeur: number | null;
  readonly seuil: number | null;
  /** Marge signée : seuil − valeur (négative = écart). */
  readonly marge: number | null;
  readonly etat: EtatRegle;
  readonly motif: MotifNonEvaluee | null;
  /** Point le plus défavorable (monde). */
  readonly point: Vec3 | null;
}

export interface ResultatControleEnveloppe {
  readonly lignes: readonly LigneControle[];
  /** Triangles hors enveloppe (9 nombres chacun, monde) : affichés en hachure et en couleur. */
  readonly hors: readonly number[];
  /** Sommets contrôlés. */
  readonly sommets: number;
}

/** Distance d'un point à un triangle. */
function distanceTriangle(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return len(sub(p, add(a, scale(ab, d1 / (d1 - d3)))));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return len(sub(p, add(a, scale(ac, d2 / (d2 - d6)))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return len(sub(p, add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))))));
  const den = 1 / (va + vb + vc);
  const n = cross(ab, ac);
  const q = add(a, add(scale(ab, vb * den), scale(ac, vc * den)));
  void n;
  return len(sub(p, q));
}

/** Parité d'un rayon de direction oblique fixe (évite les arêtes alignées sur les axes). */
function dansSolide(p: Vec3, tris: readonly (readonly [Vec3, Vec3, Vec3])[]): boolean {
  const d = v3(0.5773, 0.5774, 0.5775);
  let n = 0;
  for (const [a, b, c] of tris) {
    const e1 = sub(b, a);
    const e2 = sub(c, a);
    const h = cross(d, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    const s = sub(p, a);
    const u = f * dot(s, h);
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const w = f * dot(d, q);
    if (w < 0 || u + w > 1) continue;
    if (f * dot(e2, q) > 1e-9) n++;
  }
  return n % 2 === 1;
}

const sommetDe = (pos: readonly number[], i: number): Vec3 => v3(pos[i * 3] as number, pos[i * 3 + 1] as number, pos[i * 3 + 2] as number);

/** Contrôle complet (pur ; lancé dans un travailleur par la Planche). */
export function controlerEnveloppe(m: Modele): ResultatControleEnveloppe {
  const e = enveloppeDe(m);
  const mailles = maillagesPlanche(m);
  const projet = mailles.filter((x) => x.id !== "racine" && x.id !== e.objet);
  // L'enveloppe peut être masquée : son maillage est calculé directement.
  const occEnv = e.objet ? m.racine.occurrences[e.objet] : undefined;
  const envSolide = !!occEnv && !!m.definitions[occEnv.definition] && !motifNonSolide(m, occEnv.id) && estSolide(m, occEnv.id);
  const env = occEnv && m.definitions[occEnv.definition] ? { nom: occEnv.nom ?? m.definitions[occEnv.definition]!.nom, solide: envSolide, ...(envSolide ? maillageDuSolide(m, occEnv.id) : { positions: [] as number[], triangles: [] as number[] }) } : undefined;
  // Sommets du projet (dédoublonnés au millimètre).
  const vus = new Map<string, Vec3>();
  for (const x of projet) for (let i = 0; i < x.positions.length / 3; i++) {
    const p = sommetDe(x.positions, i);
    vus.set(`${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`, p);
  }
  const sommets = [...vus.values()];
  const lignes: LigneControle[] = [];
  const hors: number[] = [];
  // Contenu.
  const nomEnv = env?.nom ?? "";
  const contenu = (etat: EtatRegle, motif: MotifNonEvaluee | null, valeur: number | null, point: Vec3 | null): LigneControle => ({ id: "contenu", genre: "contenu", libelle: nomEnv, source: "", valeur, seuil: valeur === null ? null : 0, marge: valeur === null ? null : -valeur, etat, motif, point });
  if (!e.objet) lignes.push(contenu("non-evaluee", "sans-enveloppe", null, null));
  else if (!m.racine.occurrences[e.objet] || !env) lignes.push(contenu("non-evaluee", "enveloppe-absente", null, null));
  else if (!env.solide) lignes.push(contenu("non-evaluee", "enveloppe-ouverte", null, null));
  else if (sommets.length === 0) lignes.push(contenu("non-evaluee", "sans-projet", null, null));
  else {
    const tris: [Vec3, Vec3, Vec3][] = [];
    for (let k = 0; k < env.triangles.length; k += 3) tris.push([sommetDe(env.positions, env.triangles[k] as number), sommetDe(env.positions, env.triangles[k + 1] as number), sommetDe(env.positions, env.triangles[k + 2] as number)]);
    const dehors = new Map<string, number>();
    let pire: { p: Vec3; d: number } | null = null;
    for (const p of sommets) {
      let d = Infinity;
      for (const [a, b, c] of tris) d = Math.min(d, distanceTriangle(p, a, b, c));
      if (d <= TOLERANCE_ENVELOPPE || dansSolide(p, tris)) continue;
      dehors.set(`${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`, d);
      if (!pire || d > pire.d) pire = { p, d };
    }
    lignes.push(pire ? contenu("ecart", null, pire.d, pire.p) : contenu("verifiee", null, 0, null));
    if (dehors.size > 0)
      for (const x of projet)
        for (let k = 0; k < x.triangles.length; k += 3) {
          const t = [0, 1, 2].map((j) => sommetDe(x.positions, x.triangles[k + j] as number));
          if (t.some((p) => dehors.has(`${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`))) for (const p of t) hors.push(p.x, p.y, p.z);
        }
  }
  // Hauteurs : point le plus haut du projet au-dessus de z = 0.
  const haut = sommets.reduce<Vec3 | null>((h, p) => (!h || p.z > h.z ? p : h), null);
  for (const r of e.regles) {
    if (!haut) lignes.push({ id: r.id, genre: "hauteur", libelle: r.libelle, source: r.source, valeur: null, seuil: r.seuil, marge: null, etat: "non-evaluee", motif: "sans-projet", point: null });
    else if (r.seuil === null) lignes.push({ id: r.id, genre: "hauteur", libelle: r.libelle, source: r.source, valeur: haut.z, seuil: null, marge: null, etat: "non-evaluee", motif: "sans-seuil", point: haut });
    else {
      const marge = r.seuil - haut.z;
      lignes.push({ id: r.id, genre: "hauteur", libelle: r.libelle, source: r.source, valeur: haut.z, seuil: r.seuil, marge, etat: marge >= -TOLERANCE_ENVELOPPE ? "verifiee" : "ecart", motif: null, point: haut });
    }
  }
  return { lignes, hors, sommets: sommets.length };
}
