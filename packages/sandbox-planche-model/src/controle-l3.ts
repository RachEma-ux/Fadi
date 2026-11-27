/**
 * Cas 2 du catalogue, lot 3 (27 novembre 2026) : contrôle du modèle. Pur : ni React, ni DOM.
 *
 * - Relevé des défauts de la racine, sans rien modifier : faces ou objets superposés en double sous un seuil (n° 20),
 *   sommets presque confondus et angles presque droits (n° 54), faces presque horizontales ou verticales (n° 58), objets
 *   sans balise et géométrie hors objet (n° 52), géométrie éloignée de l'origine (n° 89).
 * - Parcours des défauts un à un (n° 46) et correction proposée, appliquée seulement sur demande, en un geste (n° 54, 58).
 * - Préparation d'un fond DAO importé : aplatir, souder les extrémités, créer les faces (n° 23).
 * - Faces intérieures retirées et volumes adjacents fusionnés (n° 113).
 * - Complétude des pièces du permis depuis un fichier de règles sourcé (n° 26) et site avant émission (n° 75).
 *
 * Les seuils sont des tolérances de dessin saisies dans le panneau, gardées avec le modèle ; aucun seuil réglementaire.
 * La liste des éléments attendus par pièce n'est pas dans Fadi : elle vient du fichier de règles, archivé avec le modèle.
 */
import { REGLAGES_DEFAUT, type ReglagesPlanche, annotationsDe } from "./annotations.js";
import {
  type Contexte,
  type Id,
  type Modele,
  type Resultat,
  aretesDeFace,
  contexte,
  deplacer,
  eclater,
  effacerAretes,
  effacerEntites,
  estSolide,
  facesDeLArete,
  grouper,
  modifierAnnotations,
  ajouterSegments,
} from "./geometrie-libre.js";
import { type Vec3, TOL, add, dist, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";

// ————————————————————————————————————————————————————————————— Réglages du contrôle

/** Tolérances du relevé (longueurs en mètres, angles en degrés), saisies par l'utilisateur. */
export interface ReglagesControle {
  /** Faces ou objets considérés en double à moins de cette distance. */
  readonly superposition: number;
  /** Sommets presque confondus à moins de cette distance. */
  readonly confondus: number;
  /** Angle presque droit : écart à 90° au plus. */
  readonly angleDroit: number;
  /** Face presque horizontale ou verticale : écart au plus. */
  readonly planeite: number;
  /** Géométrie éloignée de l'origine au-delà de cette distance. */
  readonly eloignement: number;
}

/** Tolérances d'origine du panneau (outil de dessin, pas une exigence) : 1 mm, 1 mm, 0,5°, 2°, 1 km. */
export const REGLAGES_CONTROLE_DEFAUT: ReglagesControle = Object.freeze({ superposition: 0.001, confondus: 0.001, angleDroit: 0.5, planeite: 2, eloignement: 1000 });

const reglages = (m: Modele): ReglagesPlanche => annotationsDe(m.annotations).reglages ?? REGLAGES_DEFAUT;

export function reglagesControle(m: Modele): ReglagesControle {
  return { ...REGLAGES_CONTROLE_DEFAUT, ...(reglages(m).controle ?? {}) };
}

/** Change une ou plusieurs tolérances ; une valeur négative, nulle ou non finie est refusée. */
export function changerReglagesControle(m: Modele, r: Partial<ReglagesControle>): Resultat {
  for (const [k, v] of Object.entries(r)) if (!(typeof v === "number" && Number.isFinite(v) && v > 0)) throw new RangeError(`Tolérance « ${k} » : saisissez une valeur positive.`);
  const suite = { ...reglagesControle(m), ...r };
  return modifierAnnotations(m, (a) => {
    a.reglages = { ...(a.reglages ?? REGLAGES_DEFAUT), controle: suite };
  });
}

// ————————————————————————————————————————————————————————————— Relevé des défauts

export type GenreDefaut = "face-double" | "objet-double" | "confondus" | "angle-droit" | "presque-horizontale" | "presque-verticale" | "sans-balise" | "hors-objet" | "eloignee";
/** Rubriques du relevé, dans l'ordre du panneau. */
export const RUBRIQUES_CONTROLE = ["superposition", "confondus", "angleDroit", "planeite", "sansBalise", "horsObjet", "eloignee"] as const;
export type RubriqueControle = (typeof RUBRIQUES_CONTROLE)[number];
export type CorrectionDefaut = "supprimer-double" | "souder" | "redresser-angle" | "redresser-horizontale" | "redresser-verticale" | "grouper";

export interface Defaut {
  readonly genre: GenreDefaut;
  /** Entités sélectionnables qui portent le défaut (arêtes, faces ou objets de la racine). */
  readonly ids: readonly Id[];
  /** Sommets en cause (souder, redresser). */
  readonly sommets: readonly Id[];
  /** Point où cadrer la vue. */
  readonly position: Vec3;
  /** Mesure du défaut : distance en mètres, écart en degrés, ou nombre d'entités. */
  readonly valeur: number;
  /** Objet de la racine qui le porte (nom affiché), ou aucun. */
  readonly objet?: Id;
  readonly correction?: CorrectionDefaut;
}

export const rubriqueDe = (g: GenreDefaut): RubriqueControle =>
  g === "face-double" || g === "objet-double" ? "superposition" : g === "confondus" ? "confondus" : g === "angle-droit" ? "angleDroit" : g === "presque-horizontale" || g === "presque-verticale" ? "planeite" : g === "sans-balise" ? "sansBalise" : g === "hors-objet" ? "horsObjet" : "eloignee";

const RAD = Math.PI / 180;
const EPS_ANGLE = 1e-6;
const pos = (c: Contexte, s: Id): Vec3 => c.sommets[s]?.position ?? v3(0, 0, 0);
const centre = (ps: readonly Vec3[]): Vec3 => scale(ps.reduce((s, p) => add(s, p), v3(0, 0, 0)), 1 / Math.max(1, ps.length));
const translationDe = (t: readonly number[]): Vec3 => v3(t[3] ?? 0, t[7] ?? 0, t[11] ?? 0);

/** Arêtes de la racine qui touchent l'un des sommets. */
function aretesDesSommets(c: Contexte, sommets: readonly Id[]): Id[] {
  const s = new Set(sommets);
  return Object.values(c.aretes).filter((a) => s.has(a.a) || s.has(a.b)).map((a) => a.id);
}

/** Paires de sommets à moins de `d` (grille de pas `d`), triées. */
function pairesProches(c: Contexte, d: number): [Id, Id, number][] {
  const grille = new Map<string, Id[]>();
  const cle = (p: Vec3) => `${Math.floor(p.x / d)}|${Math.floor(p.y / d)}|${Math.floor(p.z / d)}`;
  for (const s of Object.values(c.sommets)) {
    const k = cle(s.position);
    grille.set(k, [...(grille.get(k) ?? []), s.id]);
  }
  const paires: [Id, Id, number][] = [];
  for (const s of Object.values(c.sommets)) {
    const p = s.position;
    const [i, j, k] = [Math.floor(p.x / d), Math.floor(p.y / d), Math.floor(p.z / d)];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let e = -1; e <= 1; e++)
          for (const t of grille.get(`${i + a}|${j + b}|${k + e}`) ?? []) {
            if (t <= s.id) continue;
            const l = dist(p, pos(c, t));
            if (l > TOL && l <= d) paires.push([s.id, t, l]);
          }
  }
  return paires.sort((x, y) => (x[0] + x[1] < y[0] + y[1] ? -1 : 1));
}

/** Coins de faces : (sommet, voisin précédent, voisin suivant), chacun une seule fois. */
function coins(c: Contexte): { s: Id; p: Id; q: Id; face: Id }[] {
  const vus = new Set<string>();
  const liste: { s: Id; p: Id; q: Id; face: Id }[] = [];
  for (const f of Object.values(c.faces)) {
    for (const b of [f.exterieur, ...f.trous]) {
      for (let i = 0; i < b.length; i++) {
        const s = b[i] as Id;
        const p = b[(i + b.length - 1) % b.length] as Id;
        const q = b[(i + 1) % b.length] as Id;
        const k = `${s}|${p < q ? p : q}|${p < q ? q : p}`;
        if (vus.has(k)) continue;
        vus.add(k);
        liste.push({ s, p, q, face: f.id });
      }
    }
  }
  return liste;
}

/** Relevé de la racine (le contenu des objets n'est pas parcouru) : rien n'est modifié. */
export function releverDefauts(m: Modele, r: ReglagesControle = reglagesControle(m)): Defaut[] {
  const c = m.racine;
  const defauts: Defaut[] = [];
  // Faces en double : même nombre de sommets, chacun à moins du seuil d'un sommet de l'autre face.
  const faces = Object.values(c.faces).filter((f) => !f.masquee);
  const vuesDoubles = new Set<Id>();
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i]!;
    if (vuesDoubles.has(f.id)) continue;
    const pf = f.exterieur.map((s) => pos(c, s));
    const cf = centre(pf);
    for (let j = i + 1; j < faces.length; j++) {
      const g = faces[j]!;
      if (vuesDoubles.has(g.id) || g.exterieur.length !== f.exterieur.length) continue;
      const pg = g.exterieur.map((s) => pos(c, s));
      if (dist(cf, centre(pg)) > r.superposition + TOL) continue;
      if (!pf.every((p) => pg.some((q) => dist(p, q) <= r.superposition + TOL))) continue;
      vuesDoubles.add(g.id);
      const ecart = Math.max(...pf.map((p) => Math.min(...pg.map((q) => dist(p, q)))));
      defauts.push({ genre: "face-double", ids: [f.id, g.id], sommets: [], position: cf, valeur: ecart, correction: "supprimer-double" });
    }
  }
  // Objets en double : même définition, même rotation, positions à moins du seuil.
  const occs = Object.values(c.occurrences).filter((o) => !o.masquee);
  const vusObjets = new Set<Id>();
  for (let i = 0; i < occs.length; i++) {
    const o = occs[i]!;
    for (let j = i + 1; j < occs.length; j++) {
      const p = occs[j]!;
      if (vusObjets.has(p.id) || p.definition !== o.definition) continue;
      const memeRotation = [0, 1, 2, 4, 5, 6, 8, 9, 10].every((k) => Math.abs((o.transformation[k] ?? 0) - (p.transformation[k] ?? 0)) <= 1e-9);
      const ecart = dist(translationDe(o.transformation), translationDe(p.transformation));
      if (!memeRotation || ecart > r.superposition + TOL) continue;
      vusObjets.add(p.id);
      defauts.push({ genre: "objet-double", ids: [o.id, p.id], sommets: [], position: translationDe(o.transformation), valeur: ecart, objet: p.id, correction: "supprimer-double" });
    }
  }
  // Sommets presque confondus.
  for (const [a, b, l] of pairesProches(c, r.confondus)) {
    defauts.push({ genre: "confondus", ids: aretesDesSommets(c, [a, b]), sommets: [a, b], position: pos(c, a), valeur: l, correction: "souder" });
  }
  // Angles presque droits (coins de faces).
  for (const k of coins(c)) {
    const u = sub(pos(c, k.p), pos(c, k.s));
    const w = sub(pos(c, k.q), pos(c, k.s));
    if (len(u) <= TOL || len(w) <= TOL) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(normalize(u), normalize(w))))) / RAD;
    const ecart = Math.abs(angle - 90);
    if (ecart > EPS_ANGLE && ecart <= r.angleDroit) defauts.push({ genre: "angle-droit", ids: aretesDesSommets(c, [k.s]).filter((id) => [k.p, k.q].includes(c.aretes[id]!.a) || [k.p, k.q].includes(c.aretes[id]!.b)), sommets: [k.s, k.p, k.q], position: pos(c, k.s), valeur: angle, correction: "redresser-angle" });
  }
  // Faces presque horizontales ou verticales.
  for (const f of faces) {
    const n = normalize(f.normale);
    const versHaut = Math.acos(Math.min(1, Math.abs(n.z))) / RAD; // 0 = horizontale
    const versVertical = 90 - versHaut; // 0 = verticale
    const ps = f.exterieur.map((s) => pos(c, s));
    if (versHaut > EPS_ANGLE && versHaut <= r.planeite) defauts.push({ genre: "presque-horizontale", ids: [f.id], sommets: [...f.exterieur], position: centre(ps), valeur: versHaut, correction: "redresser-horizontale" });
    else if (versVertical > EPS_ANGLE && versVertical <= r.planeite) defauts.push({ genre: "presque-verticale", ids: [f.id], sommets: [...f.exterieur], position: centre(ps), valeur: versVertical, correction: "redresser-verticale" });
  }
  // Objets sans balise.
  for (const o of occs) if (o.balise === undefined) defauts.push({ genre: "sans-balise", ids: [o.id], sommets: [], position: translationDe(o.transformation), valeur: 1, objet: o.id });
  // Géométrie hors objet (arêtes et faces de la racine), un seul défaut.
  const libres = [...Object.values(c.faces).filter((f) => !f.masquee).map((f) => f.id), ...Object.values(c.aretes).map((a) => a.id)];
  const aretesLibres = Object.keys(c.aretes).length;
  if (aretesLibres > 0) defauts.push({ genre: "hors-objet", ids: libres, sommets: [], position: centre(Object.values(c.sommets).map((s) => s.position)), valeur: aretesLibres, correction: "grouper" });
  // Géométrie éloignée de l'origine : sommets de la racine et objets.
  const loin = [...Object.values(c.aretes).filter((a) => len(pos(c, a.a)) > r.eloignement || len(pos(c, a.b)) > r.eloignement).map((a) => ({ id: a.id, p: len(pos(c, a.a)) > len(pos(c, a.b)) ? pos(c, a.a) : pos(c, a.b) })), ...occs.filter((o) => len(translationDe(o.transformation)) > r.eloignement).map((o) => ({ id: o.id, p: translationDe(o.transformation) }))];
  if (loin.length) {
    const plus = loin.reduce((x, y) => (len(y.p) > len(x.p) ? y : x));
    defauts.push({ genre: "eloignee", ids: loin.map((x) => x.id), sommets: [], position: plus.p, valeur: len(plus.p) });
  }
  return defauts;
}

/** Nombre de défauts par rubrique du panneau. */
export function compterDefauts(defauts: readonly Defaut[]): Readonly<Record<RubriqueControle, number>> {
  const n = Object.fromEntries(RUBRIQUES_CONTROLE.map((r) => [r, 0])) as Record<RubriqueControle, number>;
  for (const d of defauts) n[rubriqueDe(d.genre)] += d.genre === "hors-objet" ? d.valeur : 1;
  return n;
}

/** Indice suivant (ou précédent) dans la liste des défauts, en boucle ; −1 sans défaut. */
export function indiceDefaut(n: number, courant: number, sens: 1 | -1): number {
  if (n <= 0) return -1;
  if (courant < 0 || courant >= n) return sens === 1 ? 0 : n - 1;
  return (courant + sens + n) % n;
}

/** Correction proposée d'un défaut, appliquée en une opération ; refusée si le défaut n'en a pas. */
export function corrigerDefaut(m: Modele, d: Defaut): Resultat {
  const c = m.racine;
  switch (d.correction) {
    case "supprimer-double":
      return effacerEntites(m, [d.ids[1] as Id]);
    case "souder": {
      const [a, b] = d.sommets as [Id, Id];
      return deplacer(m, [b], sub(pos(c, a), pos(c, b)));
    }
    case "redresser-angle": {
      // Le second côté est tourné dans le plan du coin pour former 90°, sa longueur gardée.
      const [s, p, q] = d.sommets as [Id, Id, Id];
      const u = normalize(sub(pos(c, p), pos(c, s)));
      const w = sub(pos(c, q), pos(c, s));
      const perp = sub(w, scale(u, dot(w, u)));
      if (len(perp) <= TOL) break;
      return deplacer(m, [q], sub(add(pos(c, s), scale(normalize(perp), len(w))), pos(c, q)));
    }
    case "redresser-horizontale": {
      const z = d.sommets.reduce((t, s) => t + pos(c, s).z, 0) / d.sommets.length;
      return enchainer(m, d.sommets.map((s) => (mm: Modele) => deplacer(mm, [s], v3(0, 0, z - pos(mm.racine, s).z))));
    }
    case "redresser-verticale": {
      const f = c.faces[d.ids[0] as Id];
      const h = f ? v3(f.normale.x, f.normale.y, 0) : v3(0, 0, 0);
      if (len(h) <= TOL) break;
      const n = normalize(h);
      return enchainer(m, d.sommets.map((s) => (mm: Modele) => deplacer(mm, [s], scale(n, -dot(sub(pos(mm.racine, s), d.position), n)))));
    }
    case "grouper":
      return grouper(m, d.ids);
    default:
      break;
  }
  throw new RangeError("Ce défaut n'a pas de correction proposée.");
}

function enchainer(m: Modele, etapes: readonly ((m: Modele) => Resultat)[]): Resultat {
  let r: Resultat = { modele: m } as Resultat;
  for (const e of etapes) {
    const p = Object.keys(r.modele.racine.sommets).length;
    try {
      r = e(r.modele);
    } catch {
      // Un sommet déjà fusionné par l'étape précédente n'existe plus : rien à faire pour lui.
      if (Object.keys(r.modele.racine.sommets).length !== p) continue;
      throw new RangeError("La correction n'a pas pu être appliquée.");
    }
  }
  return r;
}

// ————————————————————————————————————————————————————————————— Fond DAO importé (n° 23)

export interface OptionsFondDao {
  readonly aplatir: boolean;
  /** Tolérance de soudure des extrémités (m) ; null = pas de soudure. */
  readonly souder: number | null;
  readonly faces: boolean;
}

export interface BilanFondDao {
  readonly aplatis: number;
  readonly soudures: number;
  readonly faces: number;
}

/**
 * Prépare la géométrie d'un contexte (un import ouvert ou désigné par `dans`) : chaque sommet ramené à z = 0, extrémités
 * proches soudées sur la première, puis les traits redessinés pour que les contours fermés deviennent des faces.
 */
export function preparerFondDao(m: Modele, o: OptionsFondDao, dans?: Id): Resultat & { bilan: BilanFondDao } {
  const opt = dans !== undefined ? { dans } : {};
  const c0 = contexte(m, dans);
  const faces0 = Object.keys(c0.faces).length;
  const aplatis = o.aplatir ? Object.values(c0.aretes).filter((a) => Math.abs(pos(c0, a.a).z) > TOL || Math.abs(pos(c0, a.b).z) > TOL).length : 0;
  // Positions cibles de chaque sommet : aplatie, puis soudée sur le représentant de sa grappe.
  const cible = new Map<Id, Vec3>(Object.values(c0.sommets).map((s) => [s.id, o.aplatir ? v3(s.position.x, s.position.y, 0) : s.position]));
  let soudures = 0;
  if (o.souder !== null) {
    if (!(o.souder > 0)) throw new RangeError("Tolérance de soudure : saisissez une valeur positive.");
    const ids = [...cible.keys()].sort();
    const rep = new Map<Id, Id>();
    for (const a of ids) {
      if (rep.has(a)) continue;
      rep.set(a, a);
      for (const b of ids) {
        if (rep.has(b)) continue;
        const l = dist(cible.get(a)!, cible.get(b)!);
        if (l <= o.souder + TOL) {
          rep.set(b, a);
          if (l > TOL) soudures++;
        }
      }
    }
    for (const [b, a] of rep) cible.set(b, cible.get(a)!);
  }
  const segments = Object.values(c0.aretes)
    .map((a) => [cible.get(a.a)!, cible.get(a.b)!] as const)
    .filter(([p, q]) => dist(p, q) > TOL);
  let suite: Resultat;
  if (o.faces || aplatis > 0 || soudures > 0) {
    // Redessiner les traits : l'insertion fusionne les extrémités communes et ferme les contours en faces.
    const ids = Object.keys(c0.aretes);
    const vide = ids.length ? effacerAretes(m, ids, opt) : { modele: m };
    suite = segments.length ? ajouterSegments(vide.modele, segments, opt) : (vide as Resultat);
    if (!o.faces) {
      // Faces non demandées : celles que le redessin a créées sont retirées, les traits restent.
      const avant = new Set(Object.keys(c0.faces));
      const nouvelles = Object.keys(contexte(suite.modele, dans).faces).filter((f) => !avant.has(f));
      if (nouvelles.length) suite = effacerEntites(suite.modele, nouvelles, opt);
    }
  } else suite = { modele: m } as Resultat;
  const faces = Math.max(0, Object.keys(contexte(suite.modele, dans).faces).length - faces0);
  return { ...suite, bilan: { aplatis, soudures, faces } };
}

// ————————————————————————————————————————————————————————————— Faces intérieures, volumes fusionnés (n° 113)

/** Faces intérieures d'un contexte : chacune de leurs arêtes borde au moins trois faces. */
export function facesInterieures(m: Modele, dans?: Id): Id[] {
  const opt = dans !== undefined ? { dans } : {};
  const c = contexte(m, dans);
  const n = new Map<Id, number>();
  const nb = (a: Id) => n.get(a) ?? (n.set(a, facesDeLArete(m, a, opt).length), n.get(a)!);
  return Object.values(c.faces).filter((f) => aretesDeFace(m, f.id, opt).every((a) => nb(a) >= 3)).map((f) => f.id);
}

/** Retire les faces intérieures puis les arêtes entre deux faces coplanaires de même sens (les faces se rejoignent). */
export function supprimerFacesInterieures(m: Modele, dans?: Id): Resultat & { faces: number; aretes: number } {
  const opt = dans !== undefined ? { dans } : {};
  const interieures = facesInterieures(m, dans);
  let r: Resultat = interieures.length ? effacerEntites(m, interieures, opt) : ({ modele: m } as Resultat);
  const c = contexte(r.modele, dans);
  const plates = Object.values(c.aretes)
    .filter((a) => {
      const fs = facesDeLArete(r.modele, a.id, opt).map((id) => c.faces[id]);
      if (fs.length !== 2 || !fs[0] || !fs[1]) return false;
      const n0 = normalize(fs[0].normale);
      const n1 = normalize(fs[1].normale);
      return dot(n0, n1) > 1 - 1e-9 && Math.abs(dot(n0, sub(pos(c, fs[1].exterieur[0] as Id), pos(c, fs[0].exterieur[0] as Id)))) <= 1e-7;
    })
    .map((a) => a.id);
  if (plates.length) r = effacerAretes(r.modele, plates, opt);
  return { ...r, faces: interieures.length, aretes: plates.length };
}

/**
 * Fusionne des volumes adjacents (objets de la racine) : ils sont groupés, éclatés dans le nouveau groupe, puis faces
 * intérieures et cloisons retirées. Le résultat doit être un solide fermé, sinon l'opération est refusée.
 */
export function fusionnerVolumes(m: Modele, objets: readonly Id[]): Resultat & { occurrence: Id; faces: number; aretes: number } {
  if (objets.length < 2) throw new RangeError("Sélectionnez au moins deux volumes adjacents.");
  for (const id of objets) if (!m.racine.occurrences[id]) throw new RangeError("Sélectionnez des objets de la racine.");
  const g = grouper(m, objets);
  let mm = g.modele;
  const internes = Object.keys(contexte(mm, g.occurrence).occurrences);
  for (const id of internes) mm = eclater(mm, id, { dans: g.occurrence }).modele;
  const r = supprimerFacesInterieures(mm, g.occurrence);
  if (!estSolide(r.modele, g.occurrence)) throw new RangeError("Les volumes ne forment pas un solide fermé une fois fusionnés : opération refusée.");
  return { ...r, occurrence: g.occurrence, faces: r.faces, aretes: r.aretes };
}

// ————————————————————————————————————————————————————————————— Pièces du permis (n° 26) et site (n° 75)

/** Critères que la Planche sait constater ; tout autre critère du fichier est « non évaluable ». */
export const CRITERES_PIECES = ["emplacement", "nord", "altitude", "point-de-base", "systeme-vertical", "parcelle", "cotes", "niveaux", "textes", "geometrie"] as const;
export type CriterePiece = (typeof CRITERES_PIECES)[number];

export interface AttenduPiece {
  readonly libelle: string;
  readonly critere: string;
}
export interface PieceAttendue {
  readonly code: string;
  readonly libelle: string;
  readonly attendus: readonly AttenduPiece[];
}
/** Fichier de règles des pièces : source citée, archivé tel quel avec le modèle. */
export interface ReglesPieces {
  readonly source: string;
  readonly nomFichier: string;
  readonly texte: string;
  readonly pieces: readonly PieceAttendue[];
}

/** État du site de projet rattaché, lu par l'interface (base `sites_*`) : la Planche ne le devine pas. */
export interface EtatSite {
  readonly rattache: boolean;
  readonly parcelle: boolean;
  readonly nord: boolean;
  readonly altitude: boolean;
}

const texte = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Lit un fichier de règles JSON : `{ source, pieces: [{ code, libelle, attendus: [{ libelle, critere }] }] }`. */
export function lireReglesPieces(contenu: string, nomFichier: string): { readonly regles: ReglesPieces } | { readonly erreur: string } {
  let j: unknown;
  try {
    j = JSON.parse(contenu);
  } catch {
    return { erreur: "Le fichier n'est pas un JSON lisible." };
  }
  const o = j as { source?: unknown; pieces?: unknown };
  if (!o || typeof o !== "object") return { erreur: "Le fichier n'est pas un JSON lisible." };
  const source = texte(o.source);
  if (!source) return { erreur: "Le fichier doit citer sa source (texte et article)." };
  if (!Array.isArray(o.pieces) || o.pieces.length === 0) return { erreur: "Le fichier ne liste aucune pièce." };
  const pieces: PieceAttendue[] = [];
  for (const p of o.pieces as { code?: unknown; libelle?: unknown; attendus?: unknown }[]) {
    const code = texte(p?.code);
    if (!code || !Array.isArray(p.attendus)) return { erreur: "Chaque pièce doit avoir un code et une liste d'attendus." };
    const attendus = (p.attendus as { libelle?: unknown; critere?: unknown }[]).map((a) => ({ libelle: texte(a?.libelle), critere: texte(a?.critere) }));
    if (attendus.some((a) => !a.libelle || !a.critere)) return { erreur: `Pièce ${code} : chaque attendu doit avoir un libellé et un critère.` };
    pieces.push({ code, libelle: texte(p.libelle) || code, attendus });
  }
  return { regles: { source, nomFichier, texte: contenu, pieces } };
}

/** Archive le fichier de règles avec le modèle (un pas d'historique), ou le retire (`null`). */
export function poserReglesPieces(m: Modele, regles: ReglesPieces | null): Resultat {
  return modifierAnnotations(m, (a) => {
    const { reglesPieces: _r, ...reste } = a.reglages ?? REGLAGES_DEFAUT;
    a.reglages = regles ? { ...reste, reglesPieces: regles } : reste;
  });
}

export type EtatCritere = "present" | "absent" | "non-evaluable";

/** Constate un critère dans le modèle (et le site lu par l'interface). */
export function constaterCritere(m: Modele, critere: string, site: EtatSite | null): EtatCritere {
  const r = reglages(m);
  const a = annotationsDe(m.annotations);
  const oui = (b: boolean): EtatCritere => (b ? "present" : "absent");
  switch (critere as CriterePiece) {
    case "emplacement":
      return oui(r.emplacement !== undefined);
    case "nord":
      return oui(r.emplacement !== undefined || site?.nord === true);
    case "altitude":
      return oui(r.emplacement?.altitude !== undefined || site?.altitude === true);
    case "point-de-base":
      return oui(r.pointDeBase !== undefined);
    case "systeme-vertical":
      return oui(r.pointDeBase?.systemeVertical !== undefined);
    case "parcelle":
      return site ? oui(site.parcelle) : "non-evaluable";
    case "cotes":
      return oui(Object.keys(a.cotes).length > 0);
    case "niveaux":
      return oui(Object.keys(a.niveaux ?? {}).length > 0);
    case "textes":
      return oui(Object.keys(a.textes).length > 0);
    case "geometrie":
      return oui(Object.keys(m.racine.faces).length > 0 || Object.keys(m.racine.occurrences).length > 0);
    default:
      return "non-evaluable";
  }
}

export interface BilanPiece {
  readonly code: string;
  readonly libelle: string;
  readonly presents: number;
  readonly evaluables: number;
  readonly attendus: readonly (AttenduPiece & { readonly etat: EtatCritere })[];
}

/** Complétude des pièces : sans fichier de règles, « non évaluée » (null). */
export function evaluerPieces(m: Modele, site: EtatSite | null): readonly BilanPiece[] | null {
  const regles = reglages(m).reglesPieces;
  if (!regles) return null;
  return regles.pieces.map((p) => {
    const attendus = p.attendus.map((x) => ({ ...x, etat: constaterCritere(m, x.critere, site) }));
    return { code: p.code, libelle: p.libelle, presents: attendus.filter((x) => x.etat === "present").length, evaluables: attendus.filter((x) => x.etat !== "non-evaluable").length, attendus };
  });
}

export type LigneSite = "rattache" | "parcelle" | "nord" | "altitude" | "point-de-base";
/** Site avant émission (PC1, PC2, PC6) : chaque ligne présente, absente, ou non évaluée (aucun site lu). */
export function controlerSite(m: Modele, site: EtatSite | null): readonly { readonly ligne: LigneSite; readonly etat: EtatCritere }[] {
  const r = reglages(m);
  const s = (b: boolean | undefined): EtatCritere => (b === undefined ? "non-evaluable" : b ? "present" : "absent");
  return [
    { ligne: "rattache", etat: s(site ? site.rattache : false) },
    { ligne: "parcelle", etat: site?.rattache ? s(site.parcelle) : "non-evaluable" },
    { ligne: "nord", etat: s(r.emplacement !== undefined || site?.nord === true) },
    { ligne: "altitude", etat: s(r.emplacement?.altitude !== undefined || site?.altitude === true) },
    { ligne: "point-de-base", etat: s(r.pointDeBase !== undefined) },
  ];
}
