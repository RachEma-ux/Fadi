/**
 * Résolveur des références topologiques (L1.3, contrat `contrats/references.ts`, R12).
 *
 * `resoudreReference(etat, reference)` retrouve la géométrie (repère local du projet) de la caractéristique
 * nommée visée, ou rend l'état « à réparer » avec un motif du contrat et des propositions. Il ne rattache
 * jamais rien : les propositions sont soumises à l'utilisateur, qui choisit par `reference.reparer` (L1.2).
 *
 * Motifs :
 * - `objet-supprime` : l'objet n'existe plus (supprimé, ou identité inconnue) ;
 * - `objet-scinde` : l'objet n'existe plus et la lignée du contexte (`contexte.remplacements`, tirée de
 *   `Effets.remplacements`, D-026) le remplace par au moins deux objets ; sans lignée (l'état ne la garde pas),
 *   repli géométrique : deux murs du même niveau, contigus, colinéaires, de mêmes paramètres hors axe, portent
 *   la caractéristique à moins de `longueurMin` de la position connue ;
 * - `caracteristique-absente` : caractéristique inconnue, ou indice de contour de dalle hors du contour ;
 * - `classe-incompatible` : caractéristique nommée, mais d'une autre classe que l'objet ;
 * - `geometrie-degeneree` : géométrie inexploitable (axe trop court, épaisseur nulle, hôte introuvable…).
 *
 * Propositions (déterministes) : position connue de l'extrémité (contexte explicite, sinon la première
 * cotation ou étiquette, par identifiant, qui porte la référence), écart (m) entre cette position et la
 * géométrie proposée ; tri par écart croissant, puis identifiant, puis caractéristique ; au plus
 * `NOMBRE_MAX_PROPOSITIONS` cibles (borne d'interface, pas une donnée de projet), morceaux d'une scission en
 * tête ; « détacher » toujours en dernier. Sans position connue, aucune cible n'est classable : seuls les
 * objets de la lignée (s'il y en a, dans l'ordre de la lignée) et « détacher » sont proposés (rien n'est deviné).
 */
import type { EtatModele } from "../contrats/etat.js";
import type { Remplacement } from "../contrats/effets.js";
import type { ContexteResolution, GeometrieCaracteristique, MotifAReparer, PropositionReparation, ReferenceTopologique, ResolutionReference, ResoudreReference } from "../contrats/references.js";
import { TOLERANCES } from "../contrats/tolerances.js";
import { distance, distanceDroite, scalaire, sous } from "../commandes/geometrie.js";
import { jsonCanonique } from "../commandes/empreinte.js";
import type { CaracteristiqueNommee } from "../ontologie/caracteristiques.js";
import type { IdObjet, ObjetModele, ObjetMur } from "../ontologie/classes.js";
import type { PointLocal } from "../ontologie/reperes.js";
import { caracteristiquesDe, classesPortant, ecart, geometrieCaracteristique, type VueObjets } from "./geometrie.js";

/** Nombre maximal de cibles proposées (hors « détacher ») : borne d'affichage, pas une valeur de projet. */
export const NOMBRE_MAX_PROPOSITIONS = 5;

/** Libellé de la proposition « détacher ». */
export const LIBELLE_DETACHER = "détacher (la cote devient libre)";


const comparer = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
const memeReference = (r: { objetId: IdObjet; caracteristique?: string | undefined }, ref: ReferenceTopologique) => r.objetId === ref.objetId && r.caracteristique === ref.caracteristique;

/** Contexte déduit des porteurs de la référence (première cotation ou étiquette par identifiant). */
export function contexteDesPorteurs(vue: VueObjets, ref: ReferenceTopologique): ContexteResolution {
  for (const id of Object.keys(vue.objets).sort(comparer)) {
    const o = vue.objets[id];
    if (o?.classe === "cotation") {
      const r = o.params.references.find((x) => memeReference(x, ref));
      if (r) return { point: r.extremite === "a" ? o.params.a : o.params.b, ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}) };
    } else if (o?.classe === "etiquette" && o.params.objetId !== undefined && memeReference({ objetId: o.params.objetId, caracteristique: o.params.caracteristique }, ref)) {
      return { point: o.params.position, ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}) };
    }
  }
  return {};
}

interface Candidat {
  readonly objetId: IdObjet;
  readonly caracteristique: string;
  /** Absent quand la position connue manque (aucun classement géométrique possible). */
  readonly ecart?: number;
}

function trierCandidats(c: Candidat[]): Candidat[] {
  return c.sort((x, y) => (x.ecart ?? 0) - (y.ecart ?? 0) || comparer(x.objetId, y.objetId) || comparer(x.caracteristique, y.caracteristique));
}

function versPropositions(c: readonly Candidat[]): PropositionReparation[] {
  return c.map((x) => ({
    cible: { objetId: x.objetId, caracteristique: x.caracteristique as CaracteristiqueNommee },
    libelle: `${x.caracteristique} de ${x.objetId}`,
    ...(x.ecart !== undefined ? { ecart: x.ecart } : {}),
  }));
}

const DETACHER: PropositionReparation = { cible: null, libelle: LIBELLE_DETACHER };

/** Candidats portés par un objet existant (autres caractéristiques), classés par écart à la position connue. */
function candidatsDeLObjet(vue: VueObjets, o: ObjetModele, exclue: string, ctx: ContexteResolution): Candidat[] {
  const p = ctx.point;
  const res: Candidat[] = [];
  for (const c of caracteristiquesDe(o)) {
    if (c === exclue) continue;
    const g = geometrieCaracteristique(vue, o, c);
    if (!g.ok) continue;
    res.push(p ? { objetId: o.id, caracteristique: c, ecart: ecart(g.geometrie, p) } : { objetId: o.id, caracteristique: c });
  }
  // Sans position connue, l'ordre canonique des caractéristiques est conservé.
  return p ? trierCandidats(res) : res;
}

function paramsHorsAxe(m: ObjetMur): string {
  const { axe: _a, ...reste } = m.params;
  void _a;
  return jsonCanonique({ reste, niveauId: m.niveauId, calqueId: m.calqueId, groupeId: m.groupeId });
}

/** Paires (m1 → m2) contiguës, colinéaires, de même sens et de mêmes paramètres hors axe. */
function pairesScission(murs: readonly ObjetMur[]): [ObjetMur, ObjetMur][] {
  const paires: [ObjetMur, ObjetMur][] = [];
  for (const m1 of murs) {
    for (const m2 of murs) {
      if (m1 === m2) continue;
      const A = m1.params.axe;
      const B = m2.params.axe;
      if (distance(A.b, B.a) > TOLERANCES.tolCoincidence) continue;
      if (distanceDroite(A, B.b) > TOLERANCES.tolCoincidence || scalaire(sous(A.b, A.a), sous(B.b, B.a)) <= 0) continue;
      if (paramsHorsAxe(m1) !== paramsHorsAxe(m2)) continue;
      paires.push([m1, m2]);
    }
  }
  return paires;
}

/** Objets existants qui remplacent `id` d'après la lignée (transitive, ordre de la lignée), `null` sans lignée. */
function descendants(vue: VueObjets, id: IdObjet, remplacements: readonly Remplacement[] | undefined): IdObjet[] | null {
  if (!remplacements || remplacements.length === 0) return null;
  const res: IdObjet[] = [];
  const vus = new Set<IdObjet>([id]);
  const suivre = (x: IdObjet) => {
    for (const r of remplacements) {
      if (r.ancienId !== x) continue;
      for (const n of r.nouveauxIds) {
        if (vus.has(n)) continue;
        vus.add(n);
        if (Object.prototype.hasOwnProperty.call(vue.objets, n)) res.push(n);
        else suivre(n);
      }
    }
  };
  suivre(id);
  return res.length > 0 ? res : null;
}

function resoudreDisparu(vue: VueObjets, ref: ReferenceTopologique, ctx: ContexteResolution): ResolutionReference {
  const p = ctx.point;
  const lignee = descendants(vue, ref.objetId, ctx.remplacements);
  if (lignee) {
    // Lignée connue (D-026) : les remplaçants qui portent la caractéristique, en tête ; motif objet-scinde si ≥ 2.
    const tete: Candidat[] = [];
    for (const id of lignee) {
      const o = vue.objets[id];
      if (!o) continue;
      const g = geometrieCaracteristique(vue, o, ref.caracteristique);
      if (g.ok) tete.push(p ? { objetId: id, caracteristique: ref.caracteristique, ecart: ecart(g.geometrie, p) } : { objetId: id, caracteristique: ref.caracteristique });
    }
    const triee = p ? trierCandidats(tete) : tete;
    const motif: MotifAReparer = lignee.length >= 2 ? "objet-scinde" : "objet-supprime";
    if (!p) return { etat: "a-reparer", reference: ref, motif, propositions: [...versPropositions(triee), DETACHER] };
    const autres = candidatsDisparu(vue, ref, ctx, p).filter((c) => !triee.some((t) => t.objetId === c.objetId && t.caracteristique === c.caracteristique));
    const choisis = [...triee, ...autres].slice(0, Math.max(NOMBRE_MAX_PROPOSITIONS, triee.length));
    return { etat: "a-reparer", reference: ref, motif, propositions: [...versPropositions(choisis), DETACHER] };
  }
  if (!p) return { etat: "a-reparer", reference: ref, motif: "objet-supprime", propositions: [DETACHER] };
  const classes = classesPortant(ref.caracteristique);
  const candidats = candidatsDisparu(vue, ref, ctx, p);
  let motif: MotifAReparer = "objet-supprime";
  let tete: Candidat[] = [];
  if (classes.includes("mur")) {
    const murs = Object.keys(vue.objets)
      .sort(comparer)
      .map((id) => vue.objets[id])
      .filter((o): o is ObjetMur => o?.classe === "mur" && (ctx.niveauId === undefined || o.niveauId === ctx.niveauId));
    const parId = new Map(candidats.map((c) => [c.objetId, c]));
    const retenues = pairesScission(murs)
      .map(([m1, m2]) => [parId.get(m1.id), parId.get(m2.id)] as const)
      .filter((x): x is readonly [Candidat, Candidat] => x[0] !== undefined && x[1] !== undefined && Math.min(x[0].ecart ?? Infinity, x[1].ecart ?? Infinity) <= TOLERANCES.longueurMin)
      .sort((x, y) => Math.min(x[0].ecart ?? 0, x[1].ecart ?? 0) - Math.min(y[0].ecart ?? 0, y[1].ecart ?? 0) || comparer(x[0].objetId, y[0].objetId));
    const paire = retenues[0];
    if (paire) {
      motif = "objet-scinde";
      tete = trierCandidats([paire[0], paire[1]]);
    }
  }
  const reste = candidats.filter((c) => !tete.includes(c));
  const choisis = [...tete, ...reste].slice(0, Math.max(NOMBRE_MAX_PROPOSITIONS, tete.length));
  return { etat: "a-reparer", reference: ref, motif, propositions: [...versPropositions(choisis), DETACHER] };
}

/** Candidats pour une référence dont l'objet a disparu : même caractéristique, même niveau, par écart. */
function candidatsDisparu(vue: VueObjets, ref: ReferenceTopologique, ctx: ContexteResolution, p: PointLocal): Candidat[] {
  const classes = classesPortant(ref.caracteristique);
  const dalle = classes.includes("dalle");
  const candidats: Candidat[] = [];
  for (const id of Object.keys(vue.objets).sort(comparer)) {
    const o = vue.objets[id];
    if (!o || !classes.includes(o.classe)) continue;
    if (ctx.niveauId !== undefined && o.niveauId !== ctx.niveauId) continue;
    // Une dalle disparue : toutes les arêtes des dalles du niveau sont candidates (l'indice n'a plus de sens).
    for (const c of dalle ? caracteristiquesDe(o) : [ref.caracteristique]) {
      const g = geometrieCaracteristique(vue, o, c);
      if (g.ok) candidats.push({ objetId: o.id, caracteristique: c, ecart: ecart(g.geometrie, p) });
    }
  }
  return trierCandidats(candidats);
}

/**
 * Résolution avec contexte explicite (position connue de l'extrémité, niveau du porteur, lignée). Sans position
 * ni niveau dans le contexte, ils sont déduits des porteurs de la référence dans l'état.
 */
export function resoudreReferenceDans(vue: VueObjets, ref: ReferenceTopologique, contexte?: ContexteResolution): ResolutionReference {
  const ctx: ContexteResolution =
    contexte === undefined || (contexte.point === undefined && contexte.niveauId === undefined) ? { ...contexteDesPorteurs(vue, ref), ...(contexte?.remplacements ? { remplacements: contexte.remplacements } : {}) } : contexte;
  const o = Object.prototype.hasOwnProperty.call(vue.objets, ref.objetId) ? vue.objets[ref.objetId] : undefined;
  if (!o) return resoudreDisparu(vue, ref, ctx);
  const g = geometrieCaracteristique(vue, o, ref.caracteristique);
  if (g.ok) return { etat: "resolue", reference: ref, geometrie: g.geometrie };
  const propositions = g.motif === "geometrie-degeneree" ? [] : candidatsDeLObjet(vue, o, ref.caracteristique, ctx).slice(0, NOMBRE_MAX_PROPOSITIONS);
  return { etat: "a-reparer", reference: ref, motif: g.motif, propositions: [...versPropositions(propositions), DETACHER] };
}

/** Résolveur du contrat `ResoudreReference` (pur). */
export const resoudreReference: ResoudreReference = (etat: EtatModele, reference: ReferenceTopologique, contexte?: ContexteResolution) => resoudreReferenceDans(etat, reference, contexte);

/** Géométrie d'une résolution, ou `null` si la référence n'est pas résolue. */
export function geometrieResolue(r: ResolutionReference): GeometrieCaracteristique | null {
  return r.etat === "resolue" ? r.geometrie : null;
}
