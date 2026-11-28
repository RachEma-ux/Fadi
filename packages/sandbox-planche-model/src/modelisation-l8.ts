/**
 * Cas 2 du catalogue, lot 8 « Outils de modélisation » (maquettes lot8-1 à lot8-4 validées le 27 novembre 2026) —
 * fonctions pures, ni React ni DOM :
 *
 * - n° 39 hauteur d'une extrusion de face, relue sur la géométrie et modifiable tant que ses faces latérales restent
 *   perpendiculaires (sinon le motif est dit, rien n'est forcé) ;
 * - n° 71 couches d'un mur en une liste d'épaisseurs (une couche = un groupe nommé, empilé sur la face) ;
 * - n° 98 prolonger ou raccourcir une arête jusqu'à une face ou une arête limite ;
 * - n° 35 murs en couches depuis un tracé (outil Mur du cas 4, épaisseur = somme des couches saisies) ;
 * - n° 99 soustraire en gardant la partie retirée, nommée et balisée ; n° 16 écrêter par une enveloppe, part chiffrée ;
 * - n° 50 caler un objet par deux points (translation, rotation, échelle uniforme calculées) ;
 * - n° 100 objets entre deux altitudes ou dans une boîte 3D ;
 * - n° 104 miroir lisible (cotes relues dans le bon sens, composants qui ont une main laissés dans leur sens) ;
 * - n° 15 aire projetée en plan (union sans double compte, ou somme) ; n° 114 longueur vraie des courbes facettées ;
 * - n° 19 axonométrie éclatée par niveau ou par balise (un modèle d'affichage ; le modèle enregistré ne bouge pas) ;
 * - n° 29 échelle graphique d'une vue orthographique exacte.
 *
 * Aucune valeur n'est fournie par Fadi : épaisseurs, hauteurs, altitudes, écarts et noms viennent de la saisie.
 */
import { annotationsDe } from "./annotations.js";
import { boiteDefinition } from "./composants-dynamiques.js";
import {
  type Contexte,
  type Definition,
  type FacesPolygonales,
  type Id,
  type Matrice4,
  type Modele,
  type OptionsContexte,
  type Resultat,
  IDENTITE,
  allongerArete,
  appliquer,
  composer,
  contexte,
  creerGroupeDepuisFaces,
  effacerEntites,
  matriceMonde,
  inverserMatrice,
  miroir,
  modifierAnnotations,
  newell,
  positionsFace,
  pousserTirer,
  retourner,
  transformer,
  translation,
  transformerNormale,
} from "./geometrie-libre.js";
import { type Maillage, maillageDuSolide, motifNonSolide, translaterMaillage, volumeDuMaillage } from "./maillage.js";
import { type Vec3, add, cross, dist, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";
import type { AdaptateurBooleens } from "./outils/machine.js";
import { facesDuMaillage } from "./maillage.js";

const TOL = 1e-6;

/** Erreur du lot 8 : la clé sert à l'interface (`planche.l8.erreur.<cle>`), le message français est le repli. */
export const MESSAGES_L8 = {
  "face-inconnue": "Choisissez une face.",
  "sans-laterales": "Cette face n'est bordée d'aucune face latérale : ce n'est pas une extrusion.",
  "laterale-oblique": "Une face latérale n'est plus perpendiculaire à la face : l'extrusion a été retouchée à la main, sa hauteur est figée.",
  "sans-base": "Aucune face de départ parallèle n'est trouvée en face : la hauteur n'est pas lisible.",
  "hauteur-invalide": "Saisissez une hauteur positive.",
  "epaisseurs-invalides": "Saisissez une liste d'épaisseurs positives (séparées par « ; »).",
  "arete-inconnue": "Choisissez l'arête à prolonger puis la face ou l'arête limite.",
  "limite-inconnue": "Choisissez ensuite la face ou l'arête limite (même contexte que l'arête).",
  parallele: "L'arête est parallèle à la limite : elle ne la rencontre pas.",
  "deja-limite": "L'arête touche déjà la limite.",
  courbe: "Une arête de courbe ne se prolonge pas.",
  "deux-solides": "Choisissez deux solides : le volume à retirer, puis le volume existant.",
  "non-solide": "Cet objet n'est pas un solide : {motif}.",
  "sans-moteur": "Le moteur booléen n'est pas chargé.",
  vide: "Le résultat est vide : les solides ne se recouvrent pas.",
  "nom-vide": "Donnez un nom à la partie gardée.",
  "points-confondus": "Les deux points de départ (ou d'arrivée) sont confondus : le calage n'est pas défini.",
  "altitudes-invalides": "Saisissez deux altitudes (la plus basse et la plus haute).",
  "selection-vide": "Sélectionnez d'abord les objets.",
  "enveloppe-absente": "Choisissez les volumes à écrêter puis l'enveloppe (dernière choisie).",
  "ecart-invalide": "Saisissez un écart positif.",
  "axe-miroir": "Les deux points de l'axe du miroir sont confondus en plan : cliquez deux points distincts.",
  "hauteur-boite": "La boîte n'a pas de hauteur : cliquez ou tapez une hauteur non nulle.",
} as const;
export type CleErreurL8 = keyof typeof MESSAGES_L8;

export class ErreurL8 extends Error {
  constructor(
    readonly cle: CleErreurL8,
    readonly args: Readonly<Record<string, string>> = {},
  ) {
    super(Object.entries(args).reduce<string>((t, [k, v]) => t.replace(`{${k}}`, v), MESSAGES_L8[cle]));
  }
}

const sommetsFace = (c: Contexte, id: Id): readonly Id[] => {
  const f = c.faces[id];
  return f ? [f.exterieur, ...f.trous].flat() : [];
};
const aretesBoucle = (b: readonly Id[]): [Id, Id][] => b.map((s, i) => [s, b[(i + 1) % b.length] as Id]);
function facesDeLArete(c: Contexte, u: Id, w: Id): Id[] {
  const r: Id[] = [];
  for (const f of Object.values(c.faces)) {
    for (const b of [f.exterieur, ...f.trous]) {
      if (aretesBoucle(b).some(([x, y]) => (x === u && y === w) || (x === w && y === u))) {
        r.push(f.id);
        break;
      }
    }
  }
  return r;
}

// ————————————————————————————————————————————————————————————— n° 39 Hauteur d'une extrusion

export type LectureExtrusion =
  | { readonly ok: true; readonly hauteur: number; readonly base: Id; readonly laterales: readonly Id[] }
  | { readonly ok: false; readonly motif: "face-inconnue" | "sans-laterales" | "laterale-oblique" | "sans-base" };

/**
 * Lit la hauteur de l'extrusion dont `face` est le sommet : toutes les faces qui la bordent sont perpendiculaires, et une
 * face parallèle de sens opposé porte tous leurs sommets éloignés (la face de départ). La hauteur est la distance entre
 * les deux plans. Rien n'est mémorisé : une extrusion retouchée à la main (face latérale inclinée) se lit « figée ».
 */
export function lireExtrusion(m: Modele, face: Id, o: OptionsContexte = {}): LectureExtrusion {
  const c = contexte(m, o.dans);
  const f = c.faces[face];
  if (!f) return { ok: false, motif: "face-inconnue" };
  const n = normalize(f.normale);
  const surF = new Set(sommetsFace(c, face));
  const laterales = new Set<Id>();
  for (const [u, w] of aretesBoucle(f.exterieur)) {
    const autres = facesDeLArete(c, u, w).filter((x) => x !== face);
    if (autres.length === 0) return { ok: false, motif: "sans-laterales" };
    for (const x of autres) laterales.add(x);
  }
  const loin = new Set<Id>();
  for (const id of laterales) {
    const g = c.faces[id]!;
    if (Math.abs(dot(normalize(g.normale), n)) > 1e-6) return { ok: false, motif: "laterale-oblique" };
    for (const s of g.exterieur) if (!surF.has(s)) loin.add(s);
  }
  if (loin.size === 0) return { ok: false, motif: "sans-base" };
  const p0 = c.sommets[f.exterieur[0] as Id]!.position;
  for (const g of Object.values(c.faces)) {
    if (g.id === face || laterales.has(g.id)) continue;
    if (dot(normalize(g.normale), n) > -1 + 1e-9) continue;
    const s = new Set(sommetsFace(c, g.id));
    if (![...loin].every((x) => s.has(x))) continue;
    const q = c.sommets[g.exterieur[0] as Id]!.position;
    const h = dot(n, sub(p0, q));
    if (h <= TOL) continue;
    return { ok: true, hauteur: h, base: g.id, laterales: [...laterales] };
  }
  return { ok: false, motif: "sans-base" };
}

/** Porte la hauteur de l'extrusion à `hauteur` (Pousser/Tirer de la différence, un pas). */
export function changerHauteurExtrusion(m: Modele, face: Id, hauteur: number, o: OptionsContexte = {}): Resultat {
  if (!Number.isFinite(hauteur) || hauteur <= TOL) throw new ErreurL8("hauteur-invalide");
  const l = lireExtrusion(m, face, o);
  if (!l.ok) throw new ErreurL8(l.motif);
  const delta = hauteur - l.hauteur;
  if (Math.abs(delta) <= TOL) return { modele: m, rapport: { crees: [], supprimes: [], modifies: [] } };
  return pousserTirer(m, face, delta, o);
}

// ————————————————————————————————————————————————————————————— n° 71 Couches en une saisie

/** Une couche saisie : épaisseur en mètres, précédée d'un nom facultatif (« enduit 0,015 »). */
export interface CoucheSaisie {
  readonly nom: string | null;
  readonly epaisseur: number;
}

/**
 * Couches saisies en une ligne (« enduit 0,015 ; maçonnerie 0,175 ; isolant 0,10 » ou « 0,015 ; 0,175 ; 0,10 ») : chaque
 * morceau est un nom facultatif suivi d'une épaisseur positive en mètres ; sinon `null`. Aucun nom n'est proposé.
 */
export function lireCouches(texte: string): CoucheSaisie[] | null {
  const morceaux = texte
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter((x) => x !== "");
  if (morceaux.length === 0) return null;
  const r: CoucheSaisie[] = [];
  for (const x of morceaux) {
    const k = /^(.*?)\s*(-?\d+(?:[.,]\d+)?)\s*m?$/i.exec(x);
    if (!k) return null;
    const v = Number(k[2]!.replace(",", "."));
    if (!Number.isFinite(v) || v <= TOL) return null;
    const nom = k[1]!.trim();
    r.push({ nom: nom === "" ? null : nom, epaisseur: v });
  }
  return r;
}

/** Liste d'épaisseurs saisie (« 0,015 ; 0,175 ; 0,10 », noms facultatifs) : nombres positifs en mètres, sinon `null`. */
export function lireEpaisseurs(texte: string): number[] | null {
  return lireCouches(texte)?.map((c) => c.epaisseur) ?? null;
}

export const epaisseurTotale = (e: readonly number[]): number => e.reduce((a, b) => a + b, 0);

/** Faces d'un prisme de base `boucles` (extérieur puis trous, sens direct autour de `k`), de `d0` à `d1` selon `k`. */
function prisme(boucles: readonly (readonly Vec3[])[], k: Vec3, d0: number, d1: number): Vec3[][][] {
  const bas = boucles.map((b) => b.map((p) => add(p, scale(k, d0))));
  const haut = boucles.map((b) => b.map((p) => add(p, scale(k, d1))));
  const faces: Vec3[][][] = [haut.map((b) => [...b]), bas.map((b) => [...b].reverse())];
  boucles.forEach((b, j) => {
    for (let i = 0; i < b.length; i++) {
      const i2 = (i + 1) % b.length;
      faces.push([[bas[j]![i]!, bas[j]![i2]!, haut[j]![i2]!, haut[j]![i]!]]);
    }
  });
  return faces;
}

/**
 * Crée une couche par épaisseur, empilées sur la face (monde) vers l'extérieur (sens de sa normale) ou vers l'intérieur.
 * Chaque couche est un groupe de la racine nommé « nom · e m » quand un nom est saisi, sinon « Couche i · e m » ; la face
 * d'origine reste.
 */
export function creerCouches(m: Modele, face: Id, couches: readonly (number | CoucheSaisie)[], sens: "exterieur" | "interieur", o: OptionsContexte = {}): { readonly modele: Modele; readonly occurrences: readonly Id[] } {
  const epaisseurs = couches.map((c) => (typeof c === "number" ? c : c.epaisseur));
  const noms = couches.map((c) => (typeof c === "number" ? null : c.nom));
  if (epaisseurs.length === 0 || epaisseurs.some((e) => !Number.isFinite(e) || e <= TOL)) throw new ErreurL8("epaisseurs-invalides");
  const c = contexte(m, o.dans);
  const f = c.faces[face];
  if (!f) throw new ErreurL8("face-inconnue");
  const M = o.dans ? matriceMonde(m, o.dans) : null;
  const p = positionsFace(c, f);
  const monde = (q: Vec3): Vec3 => (M ? appliquer(M, q) : q);
  let boucles = [p.exterieur.map(monde), ...p.trous.map((b) => b.map(monde))];
  const n = normalize(M ? transformerNormale(M, f.normale) : f.normale);
  const k = sens === "exterieur" ? n : scale(n, -1);
  if (dot(newell(boucles[0]!), k) < 0) boucles = boucles.map((b) => [...b].reverse());
  let modele = m;
  const occurrences: Id[] = [];
  let d = 0;
  epaisseurs.forEach((e, i) => {
    const r = creerGroupeDepuisFaces(modele, prisme(boucles, k, d, d + e), { nom: `${noms[i] ?? `Couche ${i + 1}`} · ${String(Number(e.toFixed(4))).replace(".", ",")} m` });
    modele = r.modele;
    occurrences.push(r.occurrence);
    d += e;
  });
  return { modele, occurrences };
}

// ————————————————————————————————————————————————————————————— n° 98 Prolonger jusqu'à une limite

/** Limite visée : une face (son plan) ou une arête (point le plus proche des deux droites), dans le contexte de l'arête. */
export type LimiteArete = { readonly face: Id } | { readonly arete: Id };

/**
 * Prolonge (ou raccourcit, si l'arête est libre) l'arête jusqu'à la limite : l'extrémité la plus proche de la limite va
 * sur le plan de la face, ou au point de l'arête limite le plus proche de sa droite. Un pas.
 */
export function prolongerArete(m: Modele, arete: Id, limite: LimiteArete, o: OptionsContexte = {}): Resultat {
  const c = contexte(m, o.dans);
  const a = c.aretes[arete];
  if (!a) throw new ErreurL8("arete-inconnue");
  if (a.courbe) throw new ErreurL8("courbe");
  const A = c.sommets[a.a]!.position;
  const B = c.sommets[a.b]!.position;
  const u = sub(B, A);
  let t: number;
  if ("face" in limite) {
    const f = c.faces[limite.face];
    if (!f) throw new ErreurL8("limite-inconnue");
    const nf = normalize(f.normale);
    const p0 = c.sommets[f.exterieur[0] as Id]!.position;
    const k = dot(nf, u);
    if (Math.abs(k) < 1e-9 * len(u)) throw new ErreurL8("parallele");
    t = dot(nf, sub(p0, A)) / k;
  } else {
    const l = c.aretes[limite.arete];
    if (!l || limite.arete === arete) throw new ErreurL8("limite-inconnue");
    const C = c.sommets[l.a]!.position;
    const v = sub(c.sommets[l.b]!.position, C);
    const w = cross(u, v);
    if (len(w) < 1e-9 * len(u) * len(v)) throw new ErreurL8("parallele");
    // Droites A + t·u et C + s·v : t qui minimise la distance.
    const r = sub(C, A);
    t = dot(cross(r, v), w) / dot(w, w);
  }
  const L = len(u);
  if (Math.abs(t) * L <= TOL || Math.abs(t - 1) * L <= TOL) throw new ErreurL8("deja-limite");
  if (t > 1) return allongerArete(m, arete, a.b, (t - 1) * L, o);
  if (t < 0) return allongerArete(m, arete, a.a, -t * L, o);
  // La limite coupe l'arête : on raccourcit l'extrémité la plus proche de la limite (arête libre seulement).
  return t >= 0.5 ? allongerArete(m, arete, a.b, -(1 - t) * L, o) : allongerArete(m, arete, a.a, -t * L, o);
}

// ————————————————————————————————————————————————————————————— n° 68, 72 Booléens précis

/** Centre de la boîte englobante de maillages (origine recentrée des booléens, n° 68). */
export function centreMaillages(meshes: readonly Maillage[]): Vec3 {
  let min = v3(Infinity, Infinity, Infinity);
  let max = v3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i] as number, y = mesh.positions[i + 1] as number, z = mesh.positions[i + 2] as number;
      min = v3(Math.min(min.x, x), Math.min(min.y, y), Math.min(min.z, z));
      max = v3(Math.max(max.x, x), Math.max(max.y, y), Math.max(max.z, z));
    }
  }
  return Number.isFinite(min.x) ? scale(add(min, max), 0.5) : v3(0, 0, 0);
}

/**
 * Opération booléenne calculée dans une origine recentrée (n° 68) : les deux maillages sont ramenés autour de l'origine
 * avant le calcul (le moteur travaille en simple précision), le résultat est replacé ensuite.
 */
export function booleenRecentre(f: (a: Maillage, b: Maillage) => Maillage, a: Maillage, b: Maillage): Maillage {
  const o = centreMaillages([a, b]);
  const r = f(translaterMaillage(a, scale(o, -1)), translaterMaillage(b, scale(o, -1)));
  return translaterMaillage(r, o);
}

/** Plan d'une face d'origine (monde). */
export interface PlanOrigine {
  readonly n: Vec3;
  readonly d: number;
}

/** Plans (monde) des faces des solides d'origine. */
export function plansOrigine(m: Modele, occs: readonly Id[]): PlanOrigine[] {
  const r: PlanOrigine[] = [];
  for (const occ of occs) {
    const c = contexte(m, occ);
    const M = matriceMonde(m, occ);
    for (const f of Object.values(c.faces)) {
      const p = c.sommets[f.exterieur[0] as Id]!.position;
      const n = normalize(M ? transformerNormale(M, f.normale) : f.normale);
      const q = M ? appliquer(M, p) : p;
      r.push({ n, d: dot(n, q) });
    }
  }
  return r;
}

/**
 * Recale les faces issues d'un booléen sur les plans des faces d'origine (n° 72) : chaque face presque coplanaire d'un
 * plan d'origine (écart de la simple précision du moteur) y est projetée ; un sommet commun à plusieurs plans va à leur
 * intersection (projections alternées). Les cotes d'origine sont ainsi gardées.
 */
export function recalerFaces(faces: FacesPolygonales, plans: readonly PlanOrigine[], tolerance = 1e-4): Vec3[][][] {
  const cle = (p: Vec3): string => `${Math.round(p.x / 1e-5)}|${Math.round(p.y / 1e-5)}|${Math.round(p.z / 1e-5)}`;
  const plansDe = new Map<string, PlanOrigine[]>();
  for (const boucles of faces) {
    const ext = boucles[0] ?? [];
    if (ext.length < 3) continue;
    const n = normalize(newell(ext));
    const pl = plans.find((P) => dot(P.n, n) > 1 - 1e-4 && ext.every((p) => Math.abs(dot(P.n, p) - P.d) <= tolerance));
    if (!pl) continue;
    for (const b of boucles) for (const p of b) {
      const k = cle(p);
      const l = plansDe.get(k) ?? [];
      if (!l.some((x) => Math.abs(dot(x.n, pl.n)) > 1 - 1e-9 && Math.abs(x.d - pl.d * dot(x.n, pl.n)) < 1e-9)) l.push(pl);
      plansDe.set(k, l);
    }
  }
  const recale = (p: Vec3): Vec3 => {
    const l = plansDe.get(cle(p));
    if (!l) return p;
    let q = p;
    for (let it = 0; it < 50; it++) {
      let ecart = 0;
      for (const P of l) {
        const e = dot(P.n, q) - P.d;
        ecart = Math.max(ecart, Math.abs(e));
        q = sub(q, scale(P.n, e));
      }
      if (ecart < 1e-12) break;
    }
    return dist(q, p) <= tolerance * 10 ? q : p;
  };
  return faces.map((boucles) => boucles.map((b) => b.map(recale)));
}

// ————————————————————————————————————————————————————————————— n° 99 Soustraire en gardant, n° 16 Écrêter

export interface OptionsGarder {
  /** Garder la partie retirée comme objet nommé (n° 99) ; `false` = soustraction ordinaire. */
  readonly garder: boolean;
  readonly nom?: string;
  readonly balise?: Id | null;
}

function groupeDeMaillage(m: Modele, mesh: Maillage, nom: string, plans: readonly PlanOrigine[]): { modele: Modele; occurrence: Id } | null {
  if (mesh.triangles.length === 0 || Math.abs(volumeDuMaillage(mesh)) < 1e-12) return null;
  const faces = recalerFaces(facesDuMaillage(mesh).faces, plans);
  if (faces.length === 0) return null;
  const r = creerGroupeDepuisFaces(m, faces, { nom });
  return { modele: r.modele, occurrence: r.occurrence };
}

function exigerSolide(m: Modele, id: Id): void {
  const motif = motifNonSolide(m, id);
  if (motif) throw new ErreurL8("non-solide", { motif });
}

const nomDe = (m: Modele, occ: Id): string => {
  const o = m.racine.occurrences[occ];
  return o?.nom ?? (o ? m.definitions[o.definition]?.nom : undefined) ?? "Groupe";
};

function poserBalise(m: Modele, occ: Id, balise: Id | null | undefined): Modele {
  if (!balise) return m;
  const o = m.racine.occurrences[occ];
  if (!o) return m;
  return { ...m, racine: { ...m.racine, occurrences: { ...m.racine.occurrences, [occ]: { ...o, balise } } } };
}

/**
 * Soustrait le volume `outil` du volume `existant` (n° 99). Avec `garder`, la partie retirée (intersection) devient un
 * groupe nommé et balisé (démolition, déblai, réservation) ; le volume outil disparaît. Booléens recentrés et recalés.
 */
export function soustraireEnGardant(moteur: AdaptateurBooleens | undefined, m: Modele, outil: Id, existant: Id, o: OptionsGarder): { readonly modele: Modele; readonly reste: Id; readonly garde: Id | null; readonly volumeRetire: number } {
  if (!moteur) throw new ErreurL8("sans-moteur");
  if (o.garder && !(o.nom ?? "").trim()) throw new ErreurL8("nom-vide");
  exigerSolide(m, outil);
  exigerSolide(m, existant);
  const A = maillageDuSolide(m, outil);
  const B = maillageDuSolide(m, existant);
  const plans = plansOrigine(m, [outil, existant]);
  const reste = booleenRecentre((x, y) => moteur.difference(x, y), B, A);
  const partie = booleenRecentre((x, y) => moteur.intersection(x, y), A, B);
  const volumeRetire = Math.abs(volumeDuMaillage(partie));
  if (volumeRetire < 1e-12) throw new ErreurL8("vide");
  const baliseExistant = m.racine.occurrences[existant]?.balise;
  let modele = m;
  const r = groupeDeMaillage(modele, reste, nomDe(m, existant), plans);
  let idReste: Id | null = null;
  if (r) {
    modele = poserBalise(r.modele, r.occurrence, baliseExistant);
    idReste = r.occurrence;
  }
  let garde: Id | null = null;
  if (o.garder) {
    const g = groupeDeMaillage(modele, partie, (o.nom ?? "").trim(), plans);
    if (g) {
      modele = poserBalise(g.modele, g.occurrence, o.balise ?? null);
      garde = g.occurrence;
    }
  }
  modele = effacerEntites(modele, [outil, existant]).modele;
  if (!idReste && !garde) throw new ErreurL8("vide");
  return { modele, reste: idReste ?? (garde as Id), garde, volumeRetire };
}

/** Prochain nom libre « base n » parmi les objets de la racine (« Démolition 1 », « Démolition 2 »…). */
export function prochainNom(m: Modele, base: string): string {
  const pris = new Set(Object.values(m.racine.occurrences).map((o) => o.nom ?? m.definitions[o.definition]?.nom ?? ""));
  for (let i = 1; ; i++) if (!pris.has(`${base} ${i}`)) return `${base} ${i}`;
}

/**
 * Écrête des volumes par une enveloppe (n° 16) : chaque volume est remplacé par sa partie dans l'enveloppe ; la part
 * retirée est chiffrée (m³), par volume et au total. L'enveloppe reste (elle viendra du cas 4 ; ici, un solide choisi).
 */
export function ecreterParEnveloppe(moteur: AdaptateurBooleens | undefined, m: Modele, volumes: readonly Id[], enveloppe: Id): { readonly modele: Modele; readonly crees: readonly Id[]; readonly parts: readonly { readonly nom: string; readonly avant: number; readonly retire: number }[]; readonly retireTotal: number } {
  if (!moteur) throw new ErreurL8("sans-moteur");
  if (volumes.length === 0) throw new ErreurL8("enveloppe-absente");
  exigerSolide(m, enveloppe);
  const E = maillageDuSolide(m, enveloppe);
  let modele = m;
  const crees: Id[] = [];
  const parts: { nom: string; avant: number; retire: number }[] = [];
  for (const v of volumes) {
    exigerSolide(m, v);
    const V = maillageDuSolide(m, v);
    const avant = Math.abs(volumeDuMaillage(V));
    const dedans = booleenRecentre((x, y) => moteur.intersection(x, y), V, E);
    const apres = Math.abs(volumeDuMaillage(dedans));
    const nom = nomDe(m, v);
    parts.push({ nom, avant, retire: Math.max(0, avant - apres) });
    if (avant - apres <= 1e-9) continue;
    const g = groupeDeMaillage(modele, dedans, nom, plansOrigine(m, [v, enveloppe]));
    if (g) {
      modele = poserBalise(g.modele, g.occurrence, m.racine.occurrences[v]?.balise);
      crees.push(g.occurrence);
    }
    modele = effacerEntites(modele, [v]).modele;
  }
  return { modele, crees, parts, retireTotal: parts.reduce((s, p) => s + p.retire, 0) };
}

// ————————————————————————————————————————————————————————————— n° 50 Caler par deux points

/**
 * Transformation qui amène A sur A' et B sur B' : translation, rotation (la plus courte qui tourne AB sur A'B') et, si
 * demandé, échelle uniforme |A'B'| / |AB| autour de A'.
 */
export function matriceCalage(A: Vec3, B: Vec3, A2: Vec3, B2: Vec3, o: { readonly echelle?: boolean } = {}): { readonly matrice: Matrice4; readonly angle: number; readonly facteur: number } {
  const u = sub(B, A);
  const w = sub(B2, A2);
  if (len(u) < TOL || len(w) < TOL) throw new ErreurL8("points-confondus");
  const un = normalize(u);
  const wn = normalize(w);
  const c = Math.max(-1, Math.min(1, dot(un, wn)));
  let axe = cross(un, wn);
  const angle = Math.acos(c);
  if (len(axe) < 1e-12) {
    // Directions alignées : identité, ou demi-tour autour d'un axe perpendiculaire.
    axe = Math.abs(un.z) < 0.9 ? cross(un, v3(0, 0, 1)) : cross(un, v3(1, 0, 0));
  }
  const R = angle < 1e-12 ? IDENTITE : rotationAutour(normalize(axe), angle);
  const facteur = o.echelle ? len(w) / len(u) : 1;
  const S: Matrice4 = [facteur, 0, 0, 0, 0, facteur, 0, 0, 0, 0, facteur, 0, 0, 0, 0, 1];
  const matrice = composer(translation(A2), composer(S, composer(R, translation(scale(A, -1)))));
  return { matrice, angle, facteur };
}

function rotationAutour(k: Vec3, a: number): Matrice4 {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * k.x * k.x + c, t * k.x * k.y - s * k.z, t * k.x * k.z + s * k.y, 0, t * k.x * k.y + s * k.z, t * k.y * k.y + c, t * k.y * k.z - s * k.x, 0, t * k.x * k.z - s * k.y, t * k.y * k.z + s * k.x, t * k.z * k.z + c, 0, 0, 0, 0, 1];
}

/** Cale les entités choisies (n° 50) : un pas. */
export function calerParDeuxPoints(m: Modele, entites: readonly Id[], points: readonly [Vec3, Vec3, Vec3, Vec3], o: OptionsContexte & { readonly echelle?: boolean } = {}): Resultat & { readonly angle: number; readonly facteur: number } {
  if (entites.length === 0) throw new ErreurL8("selection-vide");
  const { matrice, angle, facteur } = matriceCalage(points[0], points[1], points[2], points[3], { echelle: o.echelle ?? true });
  // Les points sont pointés dans le monde ; dans un groupe ouvert, la matrice est ramenée dans son repère : W⁻¹·T·W.
  let locale = matrice;
  if (o.dans) {
    const W = matriceMonde(m, o.dans);
    const Wi = W ? inverserMatrice(W) : null;
    if (!W || !Wi) throw new ErreurL8("selection-vide");
    locale = composer(Wi, composer(matrice, W));
  }
  return { ...transformer(m, entites, locale, o), angle, facteur };
}

// ————————————————————————————————————————————————————————————— n° 100 Sélection par altitudes ou boîte

export interface Boite {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Boîte englobante monde d'un objet de la racine (null si vide). */
export function boiteMonde(m: Modele, occurrence: Id): Boite | null {
  const o = m.racine.occurrences[occurrence];
  if (!o) return null;
  const b = boiteDefinition(m, o.definition);
  if (!b) return null;
  let min = v3(Infinity, Infinity, Infinity);
  let max = v3(-Infinity, -Infinity, -Infinity);
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    const p = appliquer(o.transformation, v3(x, y, z));
    min = v3(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z));
    max = v3(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z));
  }
  return { min, max };
}

/** Objets visibles de la racine entièrement compris dans la boîte (bornes absentes = sans limite sur cet axe). */
export function objetsDansBoite(m: Modele, boite: { readonly min: Partial<Vec3>; readonly max: Partial<Vec3> }): Id[] {
  const dedans = (v: number, lo: number | undefined, hi: number | undefined, a: number, b: number): boolean => (lo === undefined || a >= lo - TOL) && (hi === undefined || b <= hi + TOL) && Number.isFinite(v);
  return Object.values(m.racine.occurrences)
    .filter((o) => !o.masquee)
    .filter((o) => {
      const b = boiteMonde(m, o.id);
      return !!b && dedans(1, boite.min.x, boite.max.x, b.min.x, b.max.x) && dedans(1, boite.min.y, boite.max.y, b.min.y, b.max.y) && dedans(1, boite.min.z, boite.max.z, b.min.z, b.max.z);
    })
    .map((o) => o.id);
}

/** Objets compris entre deux altitudes (n° 100). */
export function objetsEntreAltitudes(m: Modele, zmin: number, zmax: number): Id[] {
  if (!Number.isFinite(zmin) || !Number.isFinite(zmax) || zmax < zmin) throw new ErreurL8("altitudes-invalides");
  return objetsDansBoite(m, { min: { z: zmin }, max: { z: zmax } });
}

/** Deux altitudes saisies (« 3,00 et 6,00 », « 3 ; 6 », « 3 à 6 ») ; `null` si illisible. */
export function lireAltitudes(texte: string): { readonly zmin: number; readonly zmax: number } | null {
  const n = texte.match(/-?\d+(?:[.,]\d+)?/g)?.map((x) => Number(x.replace(",", ".")));
  if (!n || n.length !== 2 || n.some((x) => !Number.isFinite(x))) return null;
  return { zmin: Math.min(n[0]!, n[1]!), zmax: Math.max(n[0]!, n[1]!) };
}

/** Boîte de deux coins tracés ; si les deux coins sont à la même altitude, les altitudes saisies bornent z (sinon libre). */
export function boiteDeCoins(a: Vec3, b: Vec3, altitudes: { readonly zmin: number; readonly zmax: number } | null): { readonly min: Partial<Vec3>; readonly max: Partial<Vec3> } {
  const plate = Math.abs(a.z - b.z) <= TOL;
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), ...(plate ? (altitudes ? { z: altitudes.zmin } : {}) : { z: Math.min(a.z, b.z) }) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), ...(plate ? (altitudes ? { z: altitudes.zmax } : {}) : { z: Math.max(a.z, b.z) }) },
  };
}

// ————————————————————————————————————————————————————————————— n° 104 Miroir lisible

/** Axe du miroir : plan vertical perpendiculaire à l'axe rouge (x) ou vert (y), passant par le centre de la sélection. */
export type AxeMiroir = "x" | "y";
/** Axe du miroir pointé dans la vue : deux points ; le plan est vertical et passe par eux. */
export interface AxePointe {
  readonly a: Vec3;
  readonly b: Vec3;
}

/** Plan vertical passant par deux points pointés (leur écart en plan doit être non nul). */
export function planDeMiroir(axe: AxePointe): { readonly origine: Vec3; readonly normale: Vec3 } {
  const d = v3(axe.b.x - axe.a.x, axe.b.y - axe.a.y, 0);
  if (len(d) <= TOL) throw new ErreurL8("axe-miroir");
  return { origine: axe.a, normale: normalize(cross(d, v3(0, 0, 1))) };
}

/** Une définition « a une main » quand son fichier de composant la déclare (porte, équipement) : elle garde son sens. */
export const aUneMain = (d: Definition | undefined): boolean => !!d?.composantAgence?.main;

/**
 * Miroir lisible (n° 104) : la sélection est retournée par rapport au plan ; les cotes linéaires et de pente sélectionnées
 * sont relues dans le bon sens (extrémités échangées), les textes suivent (ils restent face à la caméra), et les
 * composants qui ont une main sont replacés en miroir sans être retournés (une porte gauche reste gauche).
 */
export function miroirLisible(m: Modele, ids: readonly Id[], axe: AxeMiroir | AxePointe, o: OptionsContexte = {}): Resultat & { readonly gardes: number } {
  if (ids.length === 0) throw new ErreurL8("selection-vide");
  let pointe = typeof axe === "string" ? null : planDeMiroir(axe);
  // Points pointés dans le monde ; dans un groupe ouvert, le plan est ramené dans son repère.
  if (pointe && o.dans) {
    const W = matriceMonde(m, o.dans);
    const Wi = W ? inverserMatrice(W) : null;
    if (Wi) pointe = { origine: appliquer(Wi, pointe.origine), normale: normalize(transformerNormale(Wi, pointe.normale)) };
  }
  const a = annotationsDe(m.annotations);
  const c = contexte(m, o.dans);
  const geom = ids.filter((id) => c.occurrences[id] || c.faces[id] || c.aretes[id]);
  const cotes = ids.filter((id) => a.cotes[id]);
  const textes = ids.filter((id) => a.textes[id]);
  // Centre de la sélection (boîtes des objets, sommets des faces et arêtes, points des annotations).
  const pts: Vec3[] = [];
  for (const id of geom) {
    const occ = c.occurrences[id];
    if (occ && !o.dans) {
      const b = boiteMonde(m, id);
      if (b) pts.push(b.min, b.max);
    } else if (c.faces[id]) for (const s of [c.faces[id]!.exterieur].flat()) pts.push(c.sommets[s]!.position);
    else if (c.aretes[id]) pts.push(c.sommets[c.aretes[id]!.a]!.position, c.sommets[c.aretes[id]!.b]!.position);
  }
  for (const id of cotes) {
    const k = a.cotes[id]! as { a?: Vec3; b?: Vec3; position: Vec3 };
    pts.push(k.position, ...(k.a ? [k.a] : []), ...(k.b ? [k.b] : []));
  }
  for (const id of textes) {
    const tx = a.textes[id]!;
    if (tx.genre === "repere") pts.push(tx.position, tx.ancre);
  }
  if (pts.length === 0) throw new ErreurL8("selection-vide");
  let min = v3(Infinity, Infinity, Infinity), max = v3(-Infinity, -Infinity, -Infinity);
  for (const p of pts) {
    min = v3(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z));
    max = v3(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z));
  }
  const centre = pointe ? pointe.origine : scale(add(min, max), 0.5);
  const normale = pointe ? pointe.normale : axe === "x" ? v3(1, 0, 0) : v3(0, 1, 0);
  const R = miroir(centre, normale);
  let modele = geom.length ? retourner(m, geom, { origine: centre, normale }, o).modele : m;
  // Composants qui ont une main : position en miroir, forme non retournée (miroir local autour du centre de leur boîte).
  let gardes = 0;
  const cc = contexte(modele, o.dans);
  const occs = { ...cc.occurrences };
  for (const id of geom) {
    const occ = occs[id];
    if (!occ || !aUneMain(modele.definitions[occ.definition])) continue;
    const b = boiteDefinition(modele, occ.definition);
    const cl = b ? scale(add(b.min, b.max), 0.5) : v3(0, 0, 0);
    // Axe local le plus proche de la normale du miroir.
    const M = occ.transformation;
    const colonnes = [v3(M[0]!, M[4]!, M[8]!), v3(M[1]!, M[5]!, M[9]!), v3(M[2]!, M[6]!, M[10]!)];
    const scores = colonnes.map((x) => Math.abs(dot(normalize(x), normale)));
    const i = scores.indexOf(Math.max(...scores));
    const nl = i === 0 ? v3(1, 0, 0) : i === 1 ? v3(0, 1, 0) : v3(0, 0, 1);
    occs[id] = { ...occ, transformation: composer(M, miroir(cl, nl)) };
    gardes++;
  }
  if (gardes) {
    if (o.dans) {
      const occ = Object.values(modele.definitions).find((d) => d.contenu === cc);
      if (occ) modele = { ...modele, definitions: { ...modele.definitions, [occ.id]: { ...occ, contenu: { ...cc, occurrences: occs } } } };
    } else modele = { ...modele, racine: { ...modele.racine, occurrences: occs } };
  }
  if (cotes.length || textes.length) {
    const lin = (p: Vec3): Vec3 => sub(appliquer(R, p), appliquer(R, v3(0, 0, 0)));
    modele = modifierAnnotations(modele, (an) => {
      for (const id of cotes) {
        const k = an.cotes[id]!;
        if (k.genre === "lineaire" || k.genre === "pente") {
          // Extrémités échangées : la cote se lit toujours dans le bon sens après le miroir.
          const { sommets, ...reste } = k;
          an.cotes[id] = { ...reste, a: appliquer(R, k.b), b: appliquer(R, k.a), position: appliquer(R, k.position), ...(sommets ? { sommets: [sommets[1], sommets[0]] as const } : {}) };
        } else if (k.genre === "diametre") an.cotes[id] = { ...k, centre: appliquer(R, k.centre), normale: lin(k.normale), position: appliquer(R, k.position) };
        else if (k.genre === "niveau") an.cotes[id] = { ...k, point: appliquer(R, k.point), position: appliquer(R, k.position) };
        else an.cotes[id] = { ...k, centre: appliquer(R, k.centre), a: appliquer(R, k.b), b: appliquer(R, k.a), normale: lin(k.normale), position: appliquer(R, k.position) };
      }
      for (const id of textes) {
        const tx = an.textes[id]!;
        if (tx.genre === "repere") an.textes[id] = { ...tx, ancre: appliquer(R, tx.ancre), position: appliquer(R, tx.position) };
      }
    }).modele;
  }
  return { modele, rapport: { crees: [], supprimes: [], modifies: [...ids] }, gardes };
}

// ————————————————————————————————————————————————————————————— n° 15 Aire projetée, n° 114 Facettage

type Contour2 = readonly (readonly [number, number])[];

/** Faces monde d'un objet (récursif), avec leurs trous. */
function facesMonde(m: Modele, c: Contexte, M: Matrice4, sortie: { ext: Vec3[]; trous: Vec3[][] }[], prof = 0): void {
  if (prof > 32) return;
  for (const f of Object.values(c.faces)) {
    if (f.masquee) continue;
    const p = positionsFace(c, f);
    sortie.push({ ext: p.exterieur.map((q) => appliquer(M, q)), trous: p.trous.map((b) => b.map((q) => appliquer(M, q))) });
  }
  for (const o of Object.values(c.occurrences)) {
    if (o.masquee) continue;
    const d = m.definitions[o.definition];
    if (d) facesMonde(m, d.contenu, composer(M, o.transformation), sortie, prof + 1);
  }
}

/**
 * Empreinte en plan de chaque élément choisi (n° 15) : contours (x, y) de ses faces non verticales, extérieurs en sens
 * direct et trous en sens inverse (règle de remplissage « positive »).
 */
export function empreintesEnPlan(m: Modele, ids: readonly Id[]): Contour2[][] {
  const r: Contour2[][] = [];
  for (const id of ids) {
    const faces: { ext: Vec3[]; trous: Vec3[][] }[] = [];
    const occ = m.racine.occurrences[id];
    if (occ) {
      const d = m.definitions[occ.definition];
      if (d) facesMonde(m, d.contenu, occ.transformation, faces);
    } else if (m.racine.faces[id]) {
      const p = positionsFace(m.racine, m.racine.faces[id]!);
      faces.push({ ext: p.exterieur, trous: p.trous });
    }
    const contours: Contour2[] = [];
    for (const f of faces) {
      const aire = (b: readonly Vec3[]): number => newell(b).z;
      if (Math.abs(aire(f.ext)) < 1e-10) continue;
      const sens = aire(f.ext) > 0 ? 1 : -1;
      const plat = (b: readonly Vec3[], direct: boolean): Contour2 => {
        const q = b.map((p) => [p.x, p.y] as const);
        const ok = (aire(b) * sens > 0) === direct;
        return ok ? q : [...q].reverse();
      };
      contours.push(sens > 0 ? f.ext.map((p) => [p.x, p.y] as const) : [...f.ext].reverse().map((p) => [p.x, p.y] as const));
      for (const t of f.trous) contours.push(plat(t, false));
    }
    if (contours.length) r.push(contours);
  }
  return r;
}

/** Aire d'un contour simple (lacet), signée. */
export const aireContour = (c: Contour2): number => {
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i]!, b = c[(i + 1) % c.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

/**
 * Aire projetée (n° 15) : union de toutes les empreintes (sans double compte) et somme des empreintes de chaque élément.
 * L'union de polygones est calculée par le moteur injecté (`aireUnion`, manifold-3d chargé à la demande).
 */
export function aireProjetee(aireUnion: (contours: readonly Contour2[]) => number, empreintes: readonly Contour2[][]): { readonly union: number; readonly somme: number; readonly elements: number } {
  const somme = empreintes.reduce((s, e) => s + aireUnion(e), 0);
  return { union: aireUnion(empreintes.flat()), somme, elements: empreintes.length };
}

/**
 * Longueurs des arêtes choisies (n° 114) : sur les facettes, et sur la courbe vraie pour les arêtes d'un cercle ou d'un
 * arc (corde c de rayon r → arc 2 r asin(c / 2r)) ; l'écart corrigé est la différence.
 */
export function longueurCourbes(m: Modele, aretes: readonly Id[], o: OptionsContexte = {}): { readonly facettes: number; readonly courbe: number; readonly ecart: number; readonly aretesCourbes: number } {
  const c = contexte(m, o.dans);
  let facettes = 0, courbe = 0, n = 0;
  for (const id of aretes) {
    const a = c.aretes[id];
    if (!a) continue;
    const l = dist(c.sommets[a.a]!.position, c.sommets[a.b]!.position);
    facettes += l;
    const k = a.courbe ? c.courbes[a.courbe] : undefined;
    if (k && (k.genre === "cercle" || k.genre === "arc") && k.rayon > TOL && l <= 2 * k.rayon + TOL) {
      courbe += 2 * k.rayon * Math.asin(Math.min(1, l / (2 * k.rayon)));
      n++;
    } else courbe += l;
  }
  return { facettes, courbe, ecart: courbe - facettes, aretesCourbes: n };
}

// ————————————————————————————————————————————————————————————— n° 19 Axonométrie éclatée

export type ParEclatement = "niveau" | "balise";

/**
 * Modèle d'affichage éclaté (n° 19) : les objets de la racine sont levés par groupe (niveau d'étage, ou balise), le
 * k-ième groupe de k × écart. Le modèle enregistré n'est pas modifié ; seul l'affichage lit celui-ci.
 */
export function modeleEclate(m: Modele, par: ParEclatement, ecart: number): { readonly modele: Modele; readonly groupes: readonly { readonly id: Id | null; readonly nom: string; readonly decalage: number; readonly objets: number }[] } {
  if (!Number.isFinite(ecart) || ecart <= TOL) throw new ErreurL8("ecart-invalide");
  const a = annotationsDe(m.annotations);
  const occs = Object.values(m.racine.occurrences);
  const cleDe = (o: (typeof occs)[number]): Id | null => (par === "niveau" ? (o.niveau ?? null) : (o.balise ?? null));
  const cles = [...new Set(occs.map(cleDe))];
  const ordre = (k: Id | null): number => {
    if (k === null) return -Infinity;
    if (par === "niveau") return a.niveaux?.[k]?.altitude ?? 0;
    return 0;
  };
  const nomDeCle = (k: Id | null): string => (k === null ? "" : par === "niveau" ? (a.niveaux?.[k]?.nom ?? k) : (a.balises[k]?.nom ?? k));
  cles.sort((x, y) => ordre(x) - ordre(y) || nomDeCle(x).localeCompare(nomDeCle(y)));
  const decalageDe = new Map(cles.map((k, i) => [k, i * ecart] as const));
  const nouvelles = Object.fromEntries(occs.map((o) => [o.id, { ...o, transformation: composer(translation(v3(0, 0, decalageDe.get(cleDe(o)) ?? 0)), o.transformation) }]));
  return {
    modele: { ...m, racine: { ...m.racine, occurrences: nouvelles } },
    groupes: cles.map((k) => ({ id: k, nom: nomDeCle(k), decalage: decalageDe.get(k) ?? 0, objets: occs.filter((o) => cleDe(o) === k).length })),
  };
}

// ————————————————————————————————————————————————————————————— n° 29 Échelle graphique

/**
 * Échelle graphique d'une vue orthographique exacte (n° 29) : longueur ronde (1, 2 ou 5 × 10ⁿ m) dont le tracé fait au
 * plus `largeurMax` pixels, en quatre graduations, et l'échelle nominale 1:n à 96 ppp.
 */
export function echelleGraphique(pixelsParMetre: number, largeurMax = 200): { readonly longueur: number; readonly pixels: number; readonly graduations: readonly number[]; readonly denominateur: number } | null {
  if (!Number.isFinite(pixelsParMetre) || pixelsParMetre <= 0) return null;
  const brut = largeurMax / pixelsParMetre;
  const p = 10 ** Math.floor(Math.log10(brut));
  const longueur = [5, 2, 1].map((k) => k * p).find((x) => x <= brut) ?? p;
  const denominateur = 1000 / ((pixelsParMetre * 25.4) / 96);
  return { longueur, pixels: longueur * pixelsParMetre, graduations: [0, longueur / 4, longueur / 2, longueur], denominateur };
}

/** Objets solides parmi la sélection (aide des commandes de booléens). */
export const solidesDe = (m: Modele, ids: readonly Id[]): Id[] => ids.filter((id) => m.racine.occurrences[id] && motifNonSolide(m, id) === null);

