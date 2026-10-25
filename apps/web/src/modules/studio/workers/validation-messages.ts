/**
 * Validation applicative des messages reçus des Workers internes de Studio (EX-063, TR-EX-063) : un message venu d'un
 * Worker « interne » n'est jamais cru sur parole. Deux niveaux, appliqués par l'hôte (`hote-worker.ts`) avant toute
 * résolution :
 *
 * 1. **Enveloppe** (`lireEnveloppe`) : objet à identifiant entier positif, portant exactement une clé parmi
 *    `progression`, `valeur`, `erreur` ; progression `{ etape: texte, fait?: entier ≥ 0, total?: entier ≥ 0 }`, erreur
 *    texte borné. Tout autre message est refusé (`illisible`).
 * 2. **Valeur par nature** (`VALIDATEURS_STUDIO`) : forme du résultat attendu de chaque traitement de
 *    `traitements.ts`. Une valeur **bien formée en surface mais forgée** (commande d'un outil hors registre, indice de
 *    triangle hors des sommets, coordonnée non finie, PDF qui n'est pas un tableau d'octets…) est refusée (`invalide`) :
 *    elle n'atteint jamais l'interface ni le document. Une nature sans validateur est refusée par défaut.
 *
 * Les tampons transférés suivent `taches/transferts.ts` (propriété affirmée avant transfert, usage interdit après).
 * Pur : ni React, ni DOM.
 */
import { STUDIO_TOOL_IDS } from "@parcours/atelier-model";

/** Taille maximale d'un message d'erreur venu d'un Worker (borne choisie par Fadi, au-delà : refusé). */
export const LONGUEUR_ERREUR_MAX = 2000;

export type EnveloppeLue =
  | { ok: true; id: number; type: "progression"; progression: { etape: string; fait?: number; total?: number } }
  | { ok: true; id: number; type: "valeur"; valeur: unknown }
  | { ok: true; id: number; type: "erreur"; erreur: string }
  | { ok: false; motif: string };

const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const entierPositif = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Lit l'enveloppe d'un message de Worker ; `ok: false` = message refusé, jamais rattaché à une demande. */
export function lireEnveloppe(d: unknown): EnveloppeLue {
  if (!objet(d)) return { ok: false, motif: "message non objet" };
  if (!entierPositif(d.id) || d.id < 1) return { ok: false, motif: "identifiant invalide" };
  const cles = ["progression", "valeur", "erreur"].filter((k) => Object.hasOwn(d, k));
  const autres = Object.keys(d).filter((k) => k !== "id" && !cles.includes(k));
  if (cles.length !== 1 || autres.length > 0) return { ok: false, motif: "enveloppe ambiguë" };
  const id = d.id;
  if (cles[0] === "erreur") {
    return typeof d.erreur === "string" && d.erreur.length <= LONGUEUR_ERREUR_MAX ? { ok: true, id, type: "erreur", erreur: d.erreur } : { ok: false, motif: "erreur invalide" };
  }
  if (cles[0] === "progression") {
    const p = d.progression;
    if (!objet(p) || typeof p.etape !== "string" || p.etape.length > 80 || Object.keys(p).some((k) => !["etape", "fait", "total"].includes(k))) return { ok: false, motif: "progression invalide" };
    if ((p.fait !== undefined && !entierPositif(p.fait)) || (p.total !== undefined && !entierPositif(p.total))) return { ok: false, motif: "progression invalide" };
    return { ok: true, id, type: "progression", progression: { etape: p.etape, ...(p.fait !== undefined ? { fait: p.fait as number } : {}), ...(p.total !== undefined ? { total: p.total as number } : {}) } };
  }
  return { ok: true, id, type: "valeur", valeur: d.valeur };
}

/** Validateur d'une valeur rendue : null = acceptée ; sinon motif du refus. */
export type ValidateurValeur = (valeur: unknown) => string | null;

const OUTILS: ReadonlySet<string> = new Set(STUDIO_TOOL_IDS as readonly string[]);
const fini = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const point3 = (p: unknown) => objet(p) && fini(p.x) && fini(p.y) && fini(p.z);

/** Commandes rendues par un lecteur (DXF, IFC) : outils du registre seulement, paramètres objets. */
function commandes(v: unknown): string | null {
  if (!Array.isArray(v)) return "commandes non listées";
  for (const [i, c] of v.entries()) {
    if (!objet(c) || typeof c.toolId !== "string" || !OUTILS.has(c.toolId)) return `commande ${i} : outil hors registre`;
    if (!objet(c.params)) return `commande ${i} : paramètres invalides`;
  }
  return null;
}

/** Résultat d'une lecture (DXF, IFC) : `{ erreur }` ou `{ resultat: { statut, commandes, rapport } }`. */
function lecture(v: unknown): string | null {
  if (!objet(v)) return "lecture non objet";
  if (Object.hasOwn(v, "erreur")) return typeof v.erreur === "string" && Object.keys(v).length === 1 ? null : "erreur de lecture invalide";
  const r = v.resultat;
  if (!objet(r) || (r.statut !== "pret" && r.statut !== "unite-inconnue") || !objet(r.rapport)) return "résultat de lecture invalide";
  if (r.statut === "unite-inconnue" && Array.isArray(r.commandes) && r.commandes.length > 0) return "commandes sans unité";
  return commandes(r.commandes);
}

/** Géométrie (sommets, triangles, arêtes) : coordonnées finies, indices entiers dans les sommets. */
function geometrie(g: unknown, quoi: string): string | null {
  if (!objet(g) || !Array.isArray(g.vertices)) return `${quoi} : sommets absents`;
  const n = g.vertices.length;
  if (!g.vertices.every(point3)) return `${quoi} : sommet non fini`;
  const indices = (l: unknown, k: number) => Array.isArray(l) && l.every((t) => Array.isArray(t) && t.length === k && t.every((i) => Number.isInteger(i) && i >= 0 && i < n));
  if (g.triangles !== undefined && !indices(g.triangles, 3)) return `${quoi} : triangle hors des sommets`;
  if (g.edges !== undefined && !indices(g.edges, 2)) return `${quoi} : arête hors des sommets`;
  return null;
}

function emprise(b: unknown): string | null {
  return b === null || (objet(b) && point3(b.min) && point3(b.max)) ? null : "emprise invalide";
}

/** Maillage complet de la vue 3D (`StudioMesh3d`). */
function maillage(v: unknown): string | null {
  if (!objet(v) || v.units !== "m" || !Array.isArray(v.solids) || !Array.isArray(v.outlines)) return "maillage invalide";
  for (const [i, s] of v.solids.entries()) { const e = geometrie(s, `solide ${i}`); if (e) return e; }
  for (const [i, o] of v.outlines.entries()) if (!objet(o) || !Array.isArray(o.points) || !o.points.every(point3)) return `contour ${i} : point non fini`;
  for (const k of ["freeSolids", "architecture"] as const) {
    if (v[k] === undefined) continue;
    if (!Array.isArray(v[k])) return `${k} invalide`;
  }
  if (!fini(v.nonExtruded) || !fini(v.hidden)) return "compteurs invalides";
  return emprise(v.bounds);
}

/** Morceaux du maillage incrémental (`StudioMorceauMaillage[]`). */
function morceaux(v: unknown): string | null {
  if (!Array.isArray(v)) return "morceaux non listés";
  for (const [i, m] of v.entries()) {
    if (!objet(m) || typeof m.id !== "string" || typeof m.cle !== "string") return `morceau ${i} invalide`;
    if (m.solid !== undefined) { const e = geometrie(m.solid, `morceau ${i}`); if (e) return e; }
    if (m.outline !== undefined && (!objet(m.outline) || !Array.isArray(m.outline.points) || !m.outline.points.every(point3))) return `morceau ${i} : contour invalide`;
  }
  return null;
}

/** Feuille composée : erreur texte ; SVG texte ou null ; PDF tableau d'octets ou null. */
function feuille(v: unknown): string | null {
  if (!objet(v) || typeof v.erreur !== "string") return "feuille invalide";
  if (v.svg !== null && typeof v.svg !== "string") return "SVG invalide";
  if (v.pdf !== null && !(v.pdf instanceof Uint8Array)) return "PDF non binaire";
  if (v.erreur === "" && (v.feuille === null || v.svg === null || v.pdf === null)) return "feuille incomplète";
  return null;
}

/** Métré : unités et repère attendus, listes et totaux à valeurs finies. */
function quantites(v: unknown): string | null {
  if (!objet(v) || v.unites !== "m" || v.repere !== "local-2d" || typeof v.documentId !== "string") return "métré invalide";
  if (!Array.isArray(v.calques) || !Array.isArray(v.objets) || !Array.isArray(v.totaux)) return "métré invalide";
  return null;
}

/** Validateurs des traitements de `traitements.ts` (une entrée par nature : contrôlé par test). */
export const VALIDATEURS_STUDIO: Readonly<Record<string, ValidateurValeur>> = Object.freeze({
  "dxf.lire": lecture,
  "ifc.lire": lecture,
  "feuille.composer": feuille,
  "maillage.3d": maillage,
  "maillage.3d.objets": morceaux,
  "quantites.calculer": quantites,
});

/** Valide la valeur rendue pour `nature` ; une nature sans validateur est refusée (jamais acceptée par défaut). */
export function validerValeurStudio(nature: string, valeur: unknown): string | null {
  const v = Object.hasOwn(VALIDATEURS_STUDIO, nature) ? VALIDATEURS_STUDIO[nature] : undefined;
  return v ? v(valeur) : `nature sans validateur : ${nature}`;
}
