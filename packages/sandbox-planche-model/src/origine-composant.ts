/**
 * Origine et axes d'un composant (chantier Axes, lot AX-4 ; concept Axes 1.0, § 7 ; décision AX-D8). Pur.
 *
 * Changer l'origine ou les axes locaux d'un composant (ou d'un groupe) est une ÉDITION D'OBJET, jamais un réglage de vue :
 * un seul pas d'historique, aucun sommet ne bouge dans le monde (le contenu reçoit F⁻¹, chaque occurrence M · F).
 * - Origine : un des 27 ancrages de la boîte LOCALE (min / centre / max sur chaque axe local — « centre de la boîte »,
 *   jamais « centre de masse ») ou un point donné (coordonnées locales, ou un point du monde ramené au local).
 * - Orientation, choix séparé : garder les axes locaux, ou les aligner sur le repère de travail.
 * - Portée : cette occurrence (rendue unique d'abord si la définition est partagée) ou toutes les occurrences (le compte
 *   inclut celles hors de la sélection).
 * - Refus explicites (rien n'est modifié) : occurrence réfléchie (miroir) ou non orthogonale (biais, échelle non
 *   uniforme), verrouillée, pièce de profilé (son lien de régénération serait rompu).
 * - Lot : aperçu des éligibles et des écartés avec motifs, définitions touchées, puis un seul pas.
 */
import type { Repere } from "./annotations.js";
import { type Contexte, type Id, type Matrice4, type Modele, type Resultat, appliquer, composer, inverserMatrice, matriceMonde, nombreOccurrences, redefinirReperesDefinitions } from "./geometrie-libre.js";
import { validerRepere } from "./reperes.js";
import { type Vec3, cross, dot, len, normalize, scale, v3 } from "./vecteur.js";

export type PositionAncrage = "min" | "centre" | "max";
export interface Ancrage {
  readonly x: PositionAncrage;
  readonly y: PositionAncrage;
  readonly z: PositionAncrage;
}
const POSITIONS: readonly PositionAncrage[] = ["min", "centre", "max"];
/** Les 27 ancrages de la boîte locale, dans l'ordre z, y, x. */
export const ANCRAGES: readonly Ancrage[] = Object.freeze(POSITIONS.flatMap((z) => POSITIONS.flatMap((y) => POSITIONS.map((x) => Object.freeze({ x, y, z })))));
/** Préréglages nommés (concept § 7.1). */
export const ANCRAGE_CENTRE_BASE: Ancrage = Object.freeze({ x: "centre", y: "centre", z: "min" });
export const ANCRAGE_CENTRE_BOITE: Ancrage = Object.freeze({ x: "centre", y: "centre", z: "centre" });
export const ANCRAGE_COIN_MIN: Ancrage = Object.freeze({ x: "min", y: "min", z: "min" });

export type OrigineDemandee =
  | { readonly genre: "ancrage"; readonly ancrage: Ancrage }
  /** Point en coordonnées locales actuelles de la définition. */
  | { readonly genre: "local"; readonly point: Vec3 }
  /** Point du monde (origine du repère de travail, point visé), ramené dans le repère local de l'occurrence. */
  | { readonly genre: "monde"; readonly point: Vec3 };

export interface OptionsOrigine {
  readonly origine: OrigineDemandee;
  /** Garder les axes locaux, ou les aligner sur un repère du monde (le repère de travail). */
  readonly orientation: { readonly genre: "garder" } | { readonly genre: "repere"; readonly repere: Repere };
  readonly portee: "occurrence" | "toutes";
}

export const MOTIFS_ORIGINE = Object.freeze({
  introuvable: "Sélectionnez un groupe ou un composant.",
  miroir: "Cette occurrence est réfléchie (miroir) : redéfinir ses axes la transformerait en un autre objet. Retournez-la d'abord ou éditez une occurrence non réfléchie.",
  biais: "Cette occurrence est déformée (biais ou échelle non uniforme) : ses axes locaux ne forment pas un repère orthonormé. Opération refusée.",
  verrou: "Une occurrence concernée est verrouillée : déverrouillez-la pour changer l'origine.",
  piece: "Pièce de profilé : sa géométrie se régénère depuis son repère de pièce ; changer son origine romprait ce lien.",
  vide: "La définition ne contient aucune géométrie : pas de boîte pour placer l'origine.",
  repere: "Le repère d'orientation demandé n'est pas valide.",
});

/** Boîte englobante LOCALE d'une définition (sommets et objets imbriqués, dans son repère propre). */
export function boiteLocale(m: Modele, definition: Id): { min: Vec3; max: Vec3 } | null {
  let min: Vec3 | null = null;
  let max: Vec3 | null = null;
  const ajouter = (p: Vec3) => {
    min = min ? v3(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z)) : p;
    max = max ? v3(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z)) : p;
  };
  const parcourir = (c: Contexte, M: Matrice4, prof: number) => {
    if (prof > 32) return;
    for (const s of Object.values(c.sommets)) ajouter(appliquer(M, s.position));
    for (const o of Object.values(c.occurrences)) {
      const d = m.definitions[o.definition];
      if (d) parcourir(d.contenu, composer(M, o.transformation), prof + 1);
    }
  };
  const d = m.definitions[definition];
  if (!d) return null;
  parcourir(d.contenu, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 0);
  return min && max ? { min, max } : null;
}

const val = (p: PositionAncrage, a: number, b: number): number => (p === "min" ? a : p === "max" ? b : (a + b) / 2);
/** Point d'un ancrage dans la boîte locale. */
export const pointAncrage = (b: { min: Vec3; max: Vec3 }, a: Ancrage): Vec3 => v3(val(a.x, b.min.x, b.max.x), val(a.y, b.min.y, b.max.y), val(a.z, b.min.z, b.max.z));

/** Colonnes (axes) d'une matrice 4×4 en lignes. */
const colonne = (M: Matrice4, j: number): Vec3 => v3(M[j] ?? 0, M[4 + j] ?? 0, M[8 + j] ?? 0);

/** Nature d'une transformation : rigide (à échelle uniforme près), réfléchie, ou déformée. */
export function natureTransformation(M: Matrice4): "rigide" | "miroir" | "biais" {
  const a = colonne(M, 0);
  const b = colonne(M, 1);
  const c = colonne(M, 2);
  const la = len(a);
  const lb = len(b);
  const lc = len(c);
  const t = 1e-9 * Math.max(1, la, lb, lc);
  if (Math.abs(dot(a, b)) > t * la * lb || Math.abs(dot(b, c)) > t * lb * lc || Math.abs(dot(a, c)) > t * la * lc) return "biais";
  if (Math.abs(la - lb) > 1e-9 * la || Math.abs(la - lc) > 1e-9 * la) return "biais";
  return dot(cross(a, b), c) < 0 ? "miroir" : "rigide";
}

/** Matrice F (nouveau repère local exprimé dans l'ancien) : axes en colonnes, origine en translation. */
const matriceF = (o: Vec3, x: Vec3, y: Vec3, z: Vec3): Matrice4 => [x.x, y.x, z.x, o.x, x.y, y.y, z.y, o.y, x.z, y.z, z.z, o.z, 0, 0, 0, 1];

export interface ApercuOrigine {
  readonly occurrence: Id;
  readonly definition: Id;
  readonly nom: string;
  /** Occurrences de la définition dans tout le document, et celles touchées par la portée choisie. */
  readonly occurrences: number;
  readonly touchees: number;
  readonly rendreUnique: boolean;
  /** Nouvelle origine et nouveaux axes, dans le monde (aperçu sur l'occurrence). */
  readonly origineMonde: Vec3;
  readonly axesMonde: { readonly x: Vec3; readonly y: Vec3; readonly z: Vec3 };
  /** F : nouveau repère local exprimé dans l'ancien. */
  readonly F: Matrice4;
}

export type ResultatApercu = { readonly ok: true; readonly apercu: ApercuOrigine } | { readonly ok: false; readonly motif: string };

/** Occurrences (tous contextes) d'une définition. */
function occurrencesDe(m: Modele, definition: Id): { id: Id; verrouille: boolean }[] {
  const r: { id: Id; verrouille: boolean }[] = [];
  for (const c of [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)]) for (const o of Object.values(c.occurrences)) if (o.definition === definition) r.push({ id: o.id, verrouille: !!o.verrouille });
  return r;
}

/** Aperçu (aucune modification) : contrôles, portée exacte, nouvelle origine et nouveaux axes. */
export function apercuOrigine(m: Modele, occurrence: Id, opts: OptionsOrigine): ResultatApercu {
  const M = matriceMonde(m, occurrence);
  const occ = M ? findOccurrence(m, occurrence) : null;
  if (!M || !occ) return { ok: false, motif: MOTIFS_ORIGINE.introuvable };
  const def = m.definitions[occ.definition];
  if (!def) return { ok: false, motif: MOTIFS_ORIGINE.introuvable };
  if (def.piece) return { ok: false, motif: MOTIFS_ORIGINE.piece };
  const nature = natureTransformation(M);
  if (nature === "miroir") return { ok: false, motif: MOTIFS_ORIGINE.miroir };
  if (nature === "biais") return { ok: false, motif: MOTIFS_ORIGINE.biais };
  const toutes = occurrencesDe(m, def.id);
  const partage = nombreOccurrences(m, def.id) > 1;
  const rendreUnique = opts.portee === "occurrence" && partage;
  const touchees = rendreUnique ? 1 : toutes.length;
  if (occ.verrouille || (!rendreUnique && toutes.some((o) => o.verrouille))) return { ok: false, motif: MOTIFS_ORIGINE.verrou };
  const Minv = inverserMatrice(M);
  if (!Minv) return { ok: false, motif: MOTIFS_ORIGINE.biais };
  // Origine en coordonnées locales actuelles.
  let o: Vec3;
  if (opts.origine.genre === "ancrage") {
    const b = boiteLocale(m, def.id);
    if (!b) return { ok: false, motif: MOTIFS_ORIGINE.vide };
    o = pointAncrage(b, opts.origine.ancrage);
  } else o = opts.origine.genre === "local" ? opts.origine.point : appliquer(Minv, opts.origine.point);
  // Axes locaux : gardés, ou ceux du repère demandé ramenés dans le repère local (rotation seule, échelle retirée).
  let x = v3(1, 0, 0);
  let y = v3(0, 1, 0);
  let z = v3(0, 0, 1);
  if (opts.orientation.genre === "repere") {
    const v = validerRepere(opts.orientation.repere);
    if (!v.ok) return { ok: false, motif: MOTIFS_ORIGINE.repere };
    const dir = (d: Vec3) => normalize(v3(dot(colonneLigne(Minv, 0), d), dot(colonneLigne(Minv, 1), d), dot(colonneLigne(Minv, 2), d)));
    x = dir(v.repere.x);
    y = normalize(cross(dir(v.repere.z), x));
    z = cross(x, y);
  }
  const F = matriceF(o, x, y, z);
  const W = composer(M, F);
  const s = len(colonne(M, 0)) || 1;
  return {
    ok: true,
    apercu: {
      occurrence,
      definition: def.id,
      nom: def.nom,
      occurrences: toutes.length,
      touchees,
      rendreUnique,
      origineMonde: appliquer(M, o),
      axesMonde: { x: scale(colonne(W, 0), 1 / s), y: scale(colonne(W, 1), 1 / s), z: scale(colonne(W, 2), 1 / s) },
      F,
    },
  };
}

/** Ligne i de la partie linéaire (3×3) d'une matrice en lignes. */
const colonneLigne = (M: Matrice4, i: number): Vec3 => v3(M[4 * i] ?? 0, M[4 * i + 1] ?? 0, M[4 * i + 2] ?? 0);

function findOccurrence(m: Modele, id: Id): { definition: Id; verrouille?: boolean } | null {
  for (const c of [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)]) {
    const o = c.occurrences[id];
    if (o) return o;
  }
  return null;
}

export type ResultatOrigine = { readonly ok: true; readonly modele: Modele; readonly apercus: readonly ApercuOrigine[] } | { readonly ok: false; readonly motif: string };

/** Applique le changement d'origine à une occurrence : un pas, ou un refus sans rien modifier. */
export function changerOrigine(m: Modele, occurrence: Id, opts: OptionsOrigine): ResultatOrigine {
  return changerOrigineLot(m, [occurrence], opts).resultat;
}

export interface ApercuLot {
  readonly eligibles: readonly ApercuOrigine[];
  readonly ecartes: readonly { readonly occurrence: Id; readonly motif: string }[];
  /** Définitions touchées (une fois chacune). */
  readonly definitions: readonly Id[];
}

/**
 * Lot (après la correction d'un objet seul, concept § 7.2) : aperçu des éligibles et des écartés avec leurs motifs ; les
 * éligibles sont appliqués en UN pas (un seul Annuler). Une définition partagée n'est traitée qu'une fois en portée
 * « toutes ». Aucun éligible : rien n'est modifié.
 */
export function changerOrigineLot(m: Modele, occurrences: readonly Id[], opts: OptionsOrigine): { apercu: ApercuLot; resultat: ResultatOrigine } {
  const eligibles: ApercuOrigine[] = [];
  const ecartes: { occurrence: Id; motif: string }[] = [];
  const definitions: Id[] = [];
  for (const id of occurrences) {
    const a = apercuOrigine(m, id, opts);
    if (!a.ok) {
      ecartes.push({ occurrence: id, motif: a.motif });
      continue;
    }
    if (!a.apercu.rendreUnique && definitions.includes(a.apercu.definition)) continue;
    eligibles.push(a.apercu);
    if (!a.apercu.rendreUnique) definitions.push(a.apercu.definition);
  }
  const apercu: ApercuLot = { eligibles, ecartes, definitions };
  if (eligibles.length === 0) return { apercu, resultat: { ok: false, motif: ecartes[0]?.motif ?? MOTIFS_ORIGINE.introuvable } };
  const r: Resultat = redefinirReperesDefinitions(
    m,
    eligibles.map((e) => ({ occurrence: e.occurrence, rendreUnique: e.rendreUnique, F: e.F })),
  );
  return { apercu, resultat: { ok: true, modele: r.modele, apercus: eligibles } };
}
