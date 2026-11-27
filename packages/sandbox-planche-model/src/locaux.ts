/**
 * Locaux (pièces) de la Planche (cas 4 du catalogue des extensions, étape 3 : D9-F10-016). Pur : ni React, ni DOM.
 *
 * Un local (`annotations.locaux`, préfixe « l ») porte numéro, nom et usage, et s'appuie sur une face de sol
 * horizontale de la racine. Tout le reste est **calculé** à chaque lecture depuis la géométrie, donc suit les parois
 * quand elles bougent :
 * - surface nette (trous déduits), périmètre du contour extérieur, centre de l'étiquette ;
 * - niveau : celui dont l'altitude est celle de la face (au millimètre), sinon aucun ;
 * - hauteur sous plafond : déclarée si elle l'est, sinon mesurée jusqu'à la face horizontale de la racine la plus
 *   proche au-dessus du centre, sinon « non évaluée » ; volume = surface × hauteur, sinon non évalué.
 * Une face disparue (fusionnée, effacée) donne un « contour ouvert » ; une face inclinée, un contour « non horizontal » :
 * jamais une surface fausse. Création, modification et suppression : un pas d'annulation chacune.
 */
import type { Local, Niveau } from "./annotations.js";
import { type Face, type Id, type Modele, modifierAnnotations, newell, positionsFace } from "./geometrie-libre.js";
import { niveauxTries } from "./niveaux.js";
import { type Vec3, len } from "./vecteur.js";

/** Longueurs maximales (choix Fadi : tiennent dans une ligne du panneau et une étiquette). */
export const NUMERO_LOCAL_MAX = 12;
export const NOM_LOCAL_MAX = 60;
/** Tolérance d'horizontalité (|n·z| ≥ 1 − ε) et de rattachement au niveau (m). */
const EPS_HORIZONTAL = 1e-6;
const EPS_NIVEAU = 1e-3;

export type ErreurLocal = "numero" | "numero-pris" | "nom" | "usage" | "hauteur" | "face" | "face-prise" | "absent";
export type EtatLocal = "ferme" | "contour-ouvert" | "non-horizontal";

export interface MesureLocal {
  readonly local: Local;
  readonly etat: EtatLocal;
  /** m² ; `null` si le contour n'est pas fermé et horizontal. */
  readonly surface: number | null;
  readonly perimetre: number | null;
  readonly altitude: number | null;
  readonly centre: Vec3 | null;
  readonly niveau: Niveau | null;
  /** Hauteur sous plafond retenue et son origine ; `null` = non évaluée. */
  readonly hauteur: number | null;
  readonly origineHauteur: "declaree" | "mesuree" | null;
  readonly volume: number | null;
}

export interface SaisieLocal {
  readonly numero: string;
  readonly nom: string;
  readonly usage: string;
  readonly hauteur: string;
}

export interface ValeursLocal {
  readonly numero: string;
  readonly nom: string;
  readonly usage?: string;
  readonly hauteur?: number;
}

export type ResultatLocal = { readonly ok: true; readonly modele: Modele; readonly id: Id } | { readonly ok: false; readonly erreur: ErreurLocal };

const refus = (erreur: ErreurLocal): ResultatLocal => ({ ok: false, erreur });
const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const texte = (v: unknown, max: number, vide: boolean): v is string => typeof v === "string" && v.length <= max && (vide || v.trim() !== "");

/** Local reçu (document, delta) : jamais cru sur parole. */
export function estLocal(id: Id, v: unknown): v is Local {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const l = v as Record<string, unknown>;
  return l["id"] === id && texte(l["numero"], NUMERO_LOCAL_MAX, false) && texte(l["nom"], NOM_LOCAL_MAX, false) && (l["usage"] === undefined || texte(l["usage"], NOM_LOCAL_MAX, false)) && typeof l["face"] === "string" && l["face"] !== "" && (l["hauteur"] === undefined || (fini(l["hauteur"]) && l["hauteur"] > 0));
}

/** Saisie du panneau lue (virgule ou point) ; le premier champ refusé est nommé, rien n'est corrigé en silence. */
export function lireSaisieLocal(s: SaisieLocal): { readonly valeurs: ValeursLocal } | { readonly erreur: ErreurLocal } {
  const numero = s.numero.trim();
  if (numero === "" || numero.length > NUMERO_LOCAL_MAX) return { erreur: "numero" };
  const nom = s.nom.trim();
  if (nom === "" || nom.length > NOM_LOCAL_MAX) return { erreur: "nom" };
  const usage = s.usage.trim();
  if (usage.length > NOM_LOCAL_MAX) return { erreur: "usage" };
  let hauteur: number | undefined;
  if (s.hauteur.trim() !== "") {
    const h = Number(s.hauteur.trim().replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(h) || h <= 0) return { erreur: "hauteur" };
    hauteur = h;
  }
  return { valeurs: { numero, nom, ...(usage ? { usage } : {}), ...(hauteur !== undefined ? { hauteur } : {}) } };
}

/** Locaux du document, triés par numéro (ordre naturel : « 2 » avant « 10 »). */
export function locauxTries(m: Modele): Local[] {
  return Object.values(m.annotations?.locaux ?? {}).sort((a, b) => a.numero.localeCompare(b.numero, "fr", { numeric: true }) || a.id.localeCompare(b.id));
}

const horizontale = (f: Face): boolean => Math.abs(f.normale.z) >= 1 - EPS_HORIZONTAL;

/** Le point (x, y) est-il dans le polygone (projection en plan) ? Règle pair-impair. */
function dansPolygone(x: number, y: number, p: readonly Vec3[]): boolean {
  let dedans = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!;
    const b = p[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

const dansFace = (x: number, y: number, pos: { exterieur: Vec3[]; trous: Vec3[][] }): boolean => dansPolygone(x, y, pos.exterieur) && !pos.trous.some((t) => dansPolygone(x, y, t));

/** Point intérieur pour l'étiquette : centre de gravité du contour s'il est dans la face, sinon un sommet décalé. */
function centreEtiquette(pos: { exterieur: Vec3[]; trous: Vec3[][] }, z: number): Vec3 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  const p = pos.exterieur;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const k = p[j]!.x * p[i]!.y - p[i]!.x * p[j]!.y;
    a += k;
    cx += (p[j]!.x + p[i]!.x) * k;
    cy += (p[j]!.y + p[i]!.y) * k;
  }
  if (Math.abs(a) > 1e-12) {
    const c = { x: cx / (3 * a), y: cy / (3 * a), z };
    if (dansFace(c.x, c.y, pos)) return c;
  }
  // Contour concave ou percé au centre : milieu d'une corde intérieure partant du premier sommet.
  for (let i = 2; i < p.length; i++) {
    const c = { x: (p[0]!.x + p[1]!.x + p[i]!.x) / 3, y: (p[0]!.y + p[1]!.y + p[i]!.y) / 3, z };
    if (dansFace(c.x, c.y, pos)) return c;
  }
  return { x: p[0]!.x, y: p[0]!.y, z };
}

/** Hauteur mesurée : distance jusqu'à la face horizontale de la racine la plus proche au-dessus du point ; `null` sinon. */
export function hauteurMesuree(m: Modele, point: Vec3, sauf: Id): number | null {
  const c = m.racine;
  let meilleure: number | null = null;
  for (const f of Object.values(c.faces)) {
    if (f.id === sauf || f.masquee || !horizontale(f)) continue;
    const pos = positionsFace(c, f);
    const z = pos.exterieur[0]?.z;
    if (z === undefined || z <= point.z + EPS_NIVEAU) continue;
    if (dansFace(point.x, point.y, pos) && (meilleure === null || z - point.z < meilleure)) meilleure = z - point.z;
  }
  return meilleure;
}

/** Mesures d'un local d'après la géométrie courante. */
export function mesurerLocal(m: Modele, l: Local): MesureLocal {
  const vide = { surface: null, perimetre: null, altitude: null, centre: null, niveau: null, volume: null } as const;
  const f = m.racine.faces[l.face];
  const declaree = l.hauteur ?? null;
  if (!f) return { local: l, etat: "contour-ouvert", ...vide, hauteur: declaree, origineHauteur: declaree === null ? null : "declaree" };
  if (!horizontale(f)) return { local: l, etat: "non-horizontal", ...vide, hauteur: declaree, origineHauteur: declaree === null ? null : "declaree" };
  const pos = positionsFace(m.racine, f);
  const surface = len(newell(pos.exterieur)) / 2 - pos.trous.reduce((s, t) => s + len(newell(t)) / 2, 0);
  let perimetre = 0;
  for (let i = 0; i < pos.exterieur.length; i++) {
    const a = pos.exterieur[i]!;
    const b = pos.exterieur[(i + 1) % pos.exterieur.length]!;
    perimetre += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  const altitude = pos.exterieur.reduce((s, p) => s + p.z, 0) / pos.exterieur.length;
  const centre = centreEtiquette(pos, altitude);
  const niveau = niveauxTries(m).find((n) => Math.abs(n.altitude - altitude) <= EPS_NIVEAU) ?? null;
  const mesuree = declaree === null ? hauteurMesuree(m, centre, f.id) : null;
  const hauteur = declaree ?? mesuree;
  return { local: l, etat: "ferme", surface, perimetre, altitude, centre, niveau, hauteur, origineHauteur: declaree !== null ? "declaree" : mesuree !== null ? "mesuree" : null, volume: hauteur === null ? null : surface * hauteur };
}

/** Mesures de tous les locaux, par numéro ; total des surfaces des seuls locaux fermés. */
export function tableauLocaux(m: Modele): { readonly lignes: MesureLocal[]; readonly total: number; readonly evalues: number } {
  const lignes = locauxTries(m).map((l) => mesurerLocal(m, l));
  const fermes = lignes.filter((l) => l.surface !== null);
  return { lignes, total: fermes.reduce((s, l) => s + l.surface!, 0), evalues: fermes.length };
}

function valider(m: Modele, v: ValeursLocal, sauf?: Id): ErreurLocal | null {
  if (!texte(v.numero, NUMERO_LOCAL_MAX, false)) return "numero";
  if (!texte(v.nom, NOM_LOCAL_MAX, false)) return "nom";
  if (v.usage !== undefined && !texte(v.usage, NOM_LOCAL_MAX, false)) return "usage";
  if (v.hauteur !== undefined && !(fini(v.hauteur) && v.hauteur > 0)) return "hauteur";
  const cle = v.numero.trim().toLocaleLowerCase("fr");
  if (locauxTries(m).some((l) => l.id !== sauf && l.numero.toLocaleLowerCase("fr") === cle)) return "numero-pris";
  return null;
}

/** Numéro proposé : le plus grand numéro entier + 1 (« 101 » → « 102 »), sinon « 1 ». Rien n'est supposé d'autre. */
export function numeroSuivant(m: Modele): string {
  const entiers = locauxTries(m).map((l) => (/^\d+$/.test(l.numero) ? Number(l.numero) : null)).filter((n): n is number => n !== null);
  return String(entiers.length ? Math.max(...entiers) + 1 : 1);
}

/** Crée un local sur une face horizontale de la racine (un pas). Une face ne porte qu'un local. */
export function creerLocal(m: Modele, face: Id, v: ValeursLocal): ResultatLocal {
  const f = m.racine.faces[face];
  if (!f || !horizontale(f)) return refus("face");
  if (locauxTries(m).some((l) => l.face === face)) return refus("face-prise");
  const e = valider(m, v);
  if (e) return refus(e);
  const r = modifierAnnotations(m, (a, id) => {
    const k = id("l");
    a.locaux[k] = { id: k, numero: v.numero.trim(), nom: v.nom.trim(), ...(v.usage ? { usage: v.usage.trim() } : {}), face, ...(v.hauteur !== undefined ? { hauteur: v.hauteur } : {}) };
    return k;
  });
  return { ok: true, modele: r.modele, id: r.extra };
}

/** Modifie numéro, nom, usage et hauteur déclarée d'un local (un pas). */
export function modifierLocal(m: Modele, id: Id, v: ValeursLocal): ResultatLocal {
  const l = m.annotations?.locaux?.[id];
  if (!l) return refus("absent");
  const e = valider(m, v, id);
  if (e) return refus(e);
  const modele = modifierAnnotations(m, (a) => {
    a.locaux[id] = { id, numero: v.numero.trim(), nom: v.nom.trim(), ...(v.usage ? { usage: v.usage.trim() } : {}), face: l.face, ...(v.hauteur !== undefined ? { hauteur: v.hauteur } : {}) };
  }).modele;
  return { ok: true, modele, id };
}

/** Supprime un local (un pas) ; la géométrie n'est pas touchée. */
export function supprimerLocal(m: Modele, id: Id): ResultatLocal {
  if (!m.annotations?.locaux?.[id]) return refus("absent");
  const modele = modifierAnnotations(m, (a) => {
    delete a.locaux[id];
  }).modele;
  return { ok: true, modele, id };
}

/** Local appuyé sur une face donnée, s'il y en a un. */
export const localDeLaFace = (m: Modele, face: Id): Local | null => locauxTries(m).find((l) => l.face === face) ?? null;
