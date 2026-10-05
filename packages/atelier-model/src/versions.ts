/**
 * Versions, variantes, comparaisons, collisions (lot 7, cahier §7 ; Architecture V4 §4.7) — fonctions pures.
 *
 * - `etatARevision` : l'état exact du modèle à une révision passée, en appliquant à rebours les inverses enregistrés
 *   au journal (instantanés différentiels, exacts par construction) ; une entrée d'import (archive, modèle natif) est
 *   une frontière : on ne remonte pas avant elle, et on le dit ;
 * - `differentielVers` / `commandeRestaurerVers` : la commande qui ramène l'état courant à un état cible (version
 *   nommée, publication) — une nouvelle révision, jamais une réécriture de l'historique ;
 * - `comparerModeles` : objets ajoutés, supprimés, modifiés (avec les champs), niveaux et définitions ;
 * - `comparerDessins` : primitives retirées / ajoutées entre deux dessins d'une même vue ;
 * - `analyserFusion` : objets affectés par une variante et conflits avec le tronc (objet touché des deux côtés) ;
 * - `collisions` : contrôles d'architecture (ouverture hors mur, ouvertures qui se chevauchent, escalier traversé
 *   par la dalle du niveau d'arrivée).
 */
import { compositionMur } from "./compositions.js";
import type { Commande, InstantaneDiff } from "./commandes/index.js";
import { appliquerDifferentiel, ErreurCommande, TYPE_RESTAURER } from "./commandes/index.js";
import type { Primitive } from "./documents/dessin.js";

import { serialisationStable } from "./documents/empreinte.js";
import { longueurAxeMur, pointDansPolygone } from "./geometrie.js";
import type { ModeleAtelier, OccurrenceQuelconque } from "./modele.js";

/** Un dessin quelconque (vue générée, feuille composée) : ses primitives. */
export interface Dessin {
  primitives: readonly Primitive[];
}

const egal = (a: unknown, b: unknown) => a === b || serialisationStable(a) === serialisationStable(b);
type Cle = "niveaux" | "objets" | "relations" | "definitions" | "calques" | "groupes" | "references" | "problemes";
const CLES: readonly Cle[] = ["niveaux", "objets", "relations", "definitions", "calques", "groupes", "references", "problemes"];

// --- Remonter le journal -------------------------------------------------------------------------------------------

export interface EntreeJournalLue {
  resultRevision: number;
  label: string;
  commands: Commande[];
  inverse: Commande;
}

/** Une entrée d'import remplace le modèle : son inverse n'est pas un retour exact (frontière de reconstruction). */
export const estImport = (e: Pick<EntreeJournalLue, "commands">) => e.commands.some((c) => typeof c.type === "string" && c.type.startsWith("interne.import"));

/**
 * État du modèle à `revisionCible`, depuis l'état à `revisionCourante` et les entrées du journal postérieures à la
 * cible (inverses appliqués du plus récent au plus ancien). Refus motivé si la cible est hors de l'historique ou
 * antérieure à un import.
 */
export function etatARevision(etat: ModeleAtelier, revisionCourante: number, entrees: readonly EntreeJournalLue[], revisionCible: number): ModeleAtelier {
  if (!Number.isInteger(revisionCible) || revisionCible < 0) throw new ErreurCommande("invalide", "revision", "révision entière positive attendue");
  if (revisionCible > revisionCourante) throw new ErreurCommande("precondition", "revision", `révision ${revisionCible} inexistante (courante : ${revisionCourante})`);
  const aRemonter = entrees.filter((e) => e.resultRevision > revisionCible).sort((a, b) => b.resultRevision - a.resultRevision);
  const attendues = revisionCourante - revisionCible;
  if (aRemonter.length !== attendues) throw new ErreurCommande("precondition", "revision", `journal incomplet entre les révisions ${revisionCible} et ${revisionCourante}`);
  let courant = etat;
  for (const e of aRemonter) {
    if (estImport(e)) throw new ErreurCommande("precondition", "revision", `révision ${revisionCible} antérieure à l'import « ${e.label} » (révision ${e.resultRevision}) : non reconstituable`);
    const diff = e.inverse.params["diff"] as InstantaneDiff | undefined;
    if (e.inverse.type !== TYPE_RESTAURER || !diff) throw new ErreurCommande("precondition", "revision", `inverse illisible à la révision ${e.resultRevision}`);
    courant = appliquerDifferentiel(courant, diff);
  }
  return courant;
}

// --- Restaurer un état -------------------------------------------------------------------------------------------

/** Différentiel qui mène de `courant` à `cible` (comparaison profonde : seules les entrées qui diffèrent). */
export function differentielVers(courant: ModeleAtelier, cible: ModeleAtelier): InstantaneDiff {
  const diff: InstantaneDiff = { avant: {}, crees: {} };
  for (const cle of CLES) {
    const a = (cible[cle] ?? {}) as Record<string, unknown>;
    const b = (courant[cle] ?? {}) as Record<string, unknown>;
    const restaurer: Record<string, unknown> = {};
    const retirer: string[] = [];
    for (const id of Object.keys(a)) if (!(id in b) || !egal(a[id], b[id])) restaurer[id] = a[id];
    for (const id of Object.keys(b)) if (!(id in a)) retirer.push(id);
    if (Object.keys(restaurer).length) diff.avant[cle] = restaurer;
    if (retirer.length) diff.crees[cle] = retirer.sort();
  }
  if (!egal(cible.site, courant.site)) diff.site = cible.site;
  if (!egal(cible.proprietes, courant.proprietes)) diff.proprietes = cible.proprietes;
  return diff;
}

/** Commande qui ramène l'état courant à la cible ; `null` si les deux états sont identiques. */
export function commandeRestaurerVers(courant: ModeleAtelier, cible: ModeleAtelier): Commande | null {
  const diff = differentielVers(courant, cible);
  const vide = !Object.keys(diff.avant).length && !Object.keys(diff.crees).length && !diff.site && !diff.proprietes;
  return vide ? null : { type: TYPE_RESTAURER, params: { diff } };
}

// --- Comparer ------------------------------------------------------------------------------------------------------

export interface ObjetCompare {
  id: string;
  classe: string;
  niveauId: string | null;
}

export interface DifferenceModeles {
  ajoutes: ObjetCompare[];
  supprimes: ObjetCompare[];
  modifies: (ObjetCompare & { champs: string[] })[];
  niveaux: { ajoutes: string[]; supprimes: string[]; modifies: string[] };
  definitions: { ajoutees: string[]; supprimees: string[]; modifiees: string[] };
  site: boolean;
  identiques: boolean;
}

const resume = (o: OccurrenceQuelconque): ObjetCompare => ({ id: o.id, classe: o.classe, niveauId: o.niveauId });

/** Différences de `a` (avant) à `b` (après). */
export function comparerModeles(a: ModeleAtelier, b: ModeleAtelier): DifferenceModeles {
  const ajoutes: ObjetCompare[] = [];
  const supprimes: ObjetCompare[] = [];
  const modifies: (ObjetCompare & { champs: string[] })[] = [];
  for (const [id, o] of Object.entries(b.objets)) {
    const avant = a.objets[id];
    if (!avant) ajoutes.push(resume(o));
    else if (!egal(avant, o)) {
      const champs = new Set<string>();
      const pa = avant.params as unknown as Record<string, unknown>;
      const pb = o.params as unknown as Record<string, unknown>;
      for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)])) if (!egal(pa[k], pb[k])) champs.add(k);
      for (const k of ["niveauId", "calqueId", "groupeId", "definitionId", "phase", "proprietes"] as const) if (!egal(avant[k], o[k])) champs.add(k);
      modifies.push({ ...resume(o), champs: [...champs].sort() });
    }
  }
  for (const [id, o] of Object.entries(a.objets)) if (!b.objets[id]) supprimes.push(resume(o));
  const tri = <T extends { id: string }>(l: T[]) => l.sort((x, y) => (x.id < y.id ? -1 : 1));
  const cles = <T>(x: Record<string, T>, y: Record<string, T>) => ({
    ajoutes: Object.keys(y).filter((k) => !(k in x)).sort(),
    supprimes: Object.keys(x).filter((k) => !(k in y)).sort(),
    modifies: Object.keys(y).filter((k) => k in x && !egal(x[k], y[k])).sort(),
  });
  const n = cles(a.niveaux, b.niveaux);
  const d = cles(a.definitions, b.definitions);
  const site = !egal(a.site, b.site);
  const r: DifferenceModeles = { ajoutes: tri(ajoutes), supprimes: tri(supprimes), modifies: tri(modifies), niveaux: n, definitions: { ajoutees: d.ajoutes, supprimees: d.supprimes, modifiees: d.modifies }, site, identiques: false };
  r.identiques = !r.ajoutes.length && !r.supprimes.length && !r.modifies.length && !n.ajoutes.length && !n.supprimes.length && !n.modifies.length && !d.ajoutes.length && !d.supprimes.length && !d.modifies.length && !site;
  return r;
}

export interface DifferenceDessins {
  communes: number;
  retirees: Primitive[];
  ajoutees: Primitive[];
}

/** Primitives d'un dessin retirées / ajoutées par rapport à un autre (même vue, deux révisions). */
export function comparerDessins(a: Dessin, b: Dessin): DifferenceDessins {
  const cle = (p: Primitive) => serialisationStable(p);
  const compte = (l: readonly Primitive[]) => {
    const m = new Map<string, { p: Primitive; n: number }>();
    for (const p of l) {
      const k = cle(p);
      const e = m.get(k);
      if (e) e.n++;
      else m.set(k, { p, n: 1 });
    }
    return m;
  };
  const ma = compte(a.primitives);
  const mb = compte(b.primitives);
  const retirees: Primitive[] = [];
  const ajoutees: Primitive[] = [];
  let communes = 0;
  for (const [k, { p, n }] of ma) {
    const m = mb.get(k)?.n ?? 0;
    communes += Math.min(n, m);
    for (let i = m; i < n; i++) retirees.push(p);
  }
  for (const [k, { p, n }] of mb) {
    const m = ma.get(k)?.n ?? 0;
    for (let i = m; i < n; i++) ajoutees.push(p);
  }
  return { communes, retirees, ajoutees };
}

// --- Fusion d'une variante ---------------------------------------------------------------------------------------

export interface EffetsJournal {
  label: string;
  resultRevision: number;
  crees: string[];
  modifies: string[];
  supprimes: string[];
}

export interface AnalyseFusion {
  /** Objets que la fusion créera, modifiera ou supprimera dans le tronc. */
  affectes: { crees: string[]; modifies: string[]; supprimes: string[] };
  /** Objets touchés à la fois par le tronc depuis la bifurcation et par la variante. */
  conflits: { objetId: string; tronc: { label: string; revision: number }; variante: { label: string; revision: number } }[];
}

export function analyserFusion(tronc: readonly EffetsJournal[], variante: readonly EffetsJournal[]): AnalyseFusion {
  const touchesTronc = new Map<string, EffetsJournal>();
  for (const e of [...tronc].sort((a, b) => a.resultRevision - b.resultRevision)) for (const id of [...e.crees, ...e.modifies, ...e.supprimes]) touchesTronc.set(id, e);
  const crees = new Set<string>();
  const modifies = new Set<string>();
  const supprimes = new Set<string>();
  const conflits = new Map<string, AnalyseFusion["conflits"][number]>();
  for (const e of [...variante].sort((a, b) => a.resultRevision - b.resultRevision)) {
    for (const id of e.crees) crees.add(id);
    for (const id of e.modifies) if (!crees.has(id)) modifies.add(id);
    for (const id of e.supprimes) {
      if (crees.has(id)) crees.delete(id);
      else {
        modifies.delete(id);
        supprimes.add(id);
      }
    }
    for (const id of [...e.crees, ...e.modifies, ...e.supprimes]) {
      const t = touchesTronc.get(id);
      if (t && !conflits.has(id)) conflits.set(id, { objetId: id, tronc: { label: t.label, revision: t.resultRevision }, variante: { label: e.label, revision: e.resultRevision } });
    }
  }
  const tri = (s: Set<string>) => [...s].sort();
  return { affectes: { crees: tri(crees), modifies: tri(modifies), supprimes: tri(supprimes) }, conflits: [...conflits.values()].sort((a, b) => (a.objetId < b.objetId ? -1 : 1)) };
}

// --- Collisions d'architecture -----------------------------------------------------------------------------------

export type TypeCollision = "ouverture-hors-mur" | "ouverture-trop-haute" | "ouvertures-chevauchantes" | "escalier-contre-dalle" | "composition-incoherente";

export interface Collision {
  type: TypeCollision;
  objets: string[];
  niveauId: string | null;
  message: string;
}

const TOL = 0.001;

export function collisions(etat: ModeleAtelier): Collision[] {
  const out: Collision[] = [];
  const objets = Object.values(etat.objets) as OccurrenceQuelconque[];
  // Ouvertures : hors du mur hôte, plus hautes que lui, ou qui se chevauchent dans un même mur.
  const parMur = new Map<string, { id: string; s0: number; s1: number }[]>();
  for (const o of objets) {
    if (o.classe !== "porte" && o.classe !== "fenetre" && o.classe !== "ouverture") continue;
    const mur = etat.objets[o.params.murHoteId];
    if (!mur || mur.classe !== "mur") continue;
    const L = longueurAxeMur(mur.params);
    const c = o.params.position * L;
    const w = o.params.largeur.value;
    const s0 = c - w / 2;
    const s1 = c + w / 2;
    if (s0 < -TOL || s1 > L + TOL) out.push({ type: "ouverture-hors-mur", objets: [o.id, mur.id], niveauId: mur.niveauId, message: `${o.classe} ${o.id} : dépasse du mur ${mur.id} de ${Math.round(Math.max(-s0, s1 - L) * 1000) / 1000} m` });
    const haut = (o.params.allege?.value ?? 0) + o.params.hauteur.value;
    if (mur.params.hauteur && haut > mur.params.hauteur.value + TOL) out.push({ type: "ouverture-trop-haute", objets: [o.id, mur.id], niveauId: mur.niveauId, message: `${o.classe} ${o.id} : ${Math.round(haut * 1000) / 1000} m au-dessus du sol pour un mur de ${mur.params.hauteur.value} m` });
    parMur.set(mur.id, [...(parMur.get(mur.id) ?? []), { id: o.id, s0, s1 }]);
  }
  for (const [murId, l] of parMur) {
    const tri = [...l].sort((a, b) => a.s0 - b.s0 || (a.id < b.id ? -1 : 1));
    for (let i = 0; i + 1 < tri.length; i++) {
      for (let j = i + 1; j < tri.length && tri[j]!.s0 < tri[i]!.s1 - TOL; j++) {
        out.push({ type: "ouvertures-chevauchantes", objets: [tri[i]!.id, tri[j]!.id, murId], niveauId: etat.objets[murId]?.niveauId ?? null, message: `${tri[i]!.id} et ${tri[j]!.id} se chevauchent dans le mur ${murId} (${Math.round((tri[i]!.s1 - tri[j]!.s0) * 1000) / 1000} m)` });
      }
    }
  }
  // Parois : l'épaisseur d'un mur dont le type porte une composition doit égaler la somme des couches (D-026).
  for (const o of objets) {
    if (o.classe !== "mur") continue;
    const c = compositionMur(etat, o);
    if (c && !c.coherente) out.push({ type: "composition-incoherente", objets: [o.id], niveauId: o.niveauId, message: `${o.id} : épaisseur ${Math.round(o.params.epaisseur.value * 1000)} mm, composition du type « ${c.typeNom} » ${Math.round(c.total * 1000)} mm (écart ${Math.round(c.ecart * 1000)} mm)` });
  }
  // Escaliers : la dalle du niveau d'arrivée ne doit pas traverser la volée (trémie absente).
  for (const o of objets) {
    if (o.classe !== "escalier" || o.params.referencePlanSeulement) continue;
    const depart = etat.niveaux[o.params.niveauDepartId];
    if (!depart) continue;
    const zArrivee = depart.elevation + o.params.decalageBase.value + o.params.hauteurAFranchir.value;
    const arrivee = o.params.niveauArriveeId ? etat.niveaux[o.params.niveauArriveeId] : Object.values(etat.niveaux).find((n) => Math.abs(n.elevation - zArrivee) <= 0.05);
    if (!arrivee) continue;
    const { a, b } = o.params;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < TOL) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const n = { x: -u.y, y: u.x };
    const w = o.params.largeur.value;
    // Points au milieu de la volée (30 %, 50 %, 70 % de la longueur ; axe et bords intérieurs).
    const points = [0.3, 0.5, 0.7].flatMap((t) => [-0.35, 0, 0.35].map((k) => ({ x: a.x + u.x * L * t + n.x * w * k, y: a.y + u.y * L * t + n.y * w * k })));
    for (const d of objets) {
      if (d.classe !== "dalle" || d.niveauId !== arrivee.id) continue;
      const touche = points.some((p) => pointDansPolygone(p, d.params.contour) && !d.params.trous.some((t) => pointDansPolygone(p, t)));
      if (touche) out.push({ type: "escalier-contre-dalle", objets: [o.id, d.id], niveauId: arrivee.id, message: `escalier ${o.id} : la dalle ${d.id} du niveau « ${arrivee.nom} » traverse la volée (trémie absente)` });
    }
  }
  return out.sort((x, y) => (x.type < y.type ? -1 : x.type > y.type ? 1 : x.objets[0]! < y.objets[0]! ? -1 : 1));
}
