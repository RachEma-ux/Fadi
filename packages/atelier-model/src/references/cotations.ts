/**
 * Cotations et étiquettes rattachées (L1.3) : résolution par extrémité, recalcul des extrémités `a` / `b`
 * d'après la géométrie courante des caractéristiques visées, liste des références à réparer (R12).
 *
 * Recalcul d'une extrémité rattachée (règle L1.3) :
 * - caractéristique ponctuelle (`ouverture:centre`, `poteau:centre`, `escalier:*`) → l'extrémité devient ce point ;
 * - caractéristique segment (faces, arêtes, axe de mur, arête de dalle) → l'extrémité devient la projection
 *   de sa position actuelle sur le segment, bornée à ses extrémités (une cote entre deux faces suit leur
 *   déplacement perpendiculaire sans glisser le long de la face) ;
 * - référence à réparer → l'extrémité ne bouge pas (dernière position connue) et la cotation est « à réparer » ;
 * - si les deux extrémités recalculées sont à moins de `longueurMin` l'une de l'autre, rien ne bouge et la
 *   cotation est « à réparer » (géométrie dégénérée) — jamais une cote de longueur nulle en silence.
 *
 * Fonctions pures, appelables par les réducteurs (voir le rapport L1.3 pour le branchement proposé).
 */
import type { Probleme } from "../contrats/probleme.js";
import type { ReferenceTopologique, ResolutionReference } from "../contrats/references.js";
import { TOLERANCES } from "../contrats/tolerances.js";
import { distance, pt } from "../commandes/geometrie.js";
import { estCaracteristiqueNommee } from "../ontologie/caracteristiques.js";
import type { EtatCotation, IdObjet, ObjetCotation } from "../ontologie/classes.js";
import type { PointLocal } from "../ontologie/reperes.js";
import { projeterSurSegment, type VueObjets } from "./geometrie.js";
import { LIBELLE_DETACHER, resoudreReferenceDans } from "./resoudre.js";

export interface ResolutionCotation {
  readonly a: ResolutionReference;
  readonly b: ResolutionReference;
}

/** Résolution de chaque extrémité : `libre` sans référence, sinon résolution avec la position connue. */
export function resoudreCotation(vue: VueObjets, cotation: ObjetCotation): ResolutionCotation {
  const une = (ext: "a" | "b"): ResolutionReference => {
    const r = cotation.params.references.find((x) => x.extremite === ext);
    if (!r) return { etat: "libre" };
    const ref: ReferenceTopologique = { objetId: r.objetId, caracteristique: r.caracteristique as ReferenceTopologique["caracteristique"] };
    if (!estCaracteristiqueNommee(r.caracteristique)) return { etat: "a-reparer", reference: ref, motif: "caracteristique-absente", propositions: [{ cible: null, libelle: LIBELLE_DETACHER }] };
    return resoudreReferenceDans(vue, ref, { point: cotation.params[ext], ...(cotation.niveauId !== undefined ? { niveauId: cotation.niveauId } : {}) });
  };
  return { a: une("a"), b: une("b") };
}

/** État d'une cotation d'après la résolution de ses extrémités. */
export function etatDeResolution(r: ResolutionCotation): EtatCotation {
  if (r.a.etat === "a-reparer" || r.b.etat === "a-reparer") return "a-reparer";
  if (r.a.etat === "resolue" || r.b.etat === "resolue") return "rattachee";
  return "libre";
}

export interface RecalculCotation {
  readonly cotationId: IdObjet;
  readonly a: PointLocal;
  readonly b: PointLocal;
  readonly etat: EtatCotation;
  /** Vrai si `a`, `b` ou `etat` diffèrent des paramètres actuels. */
  readonly change: boolean;
  readonly resolution: ResolutionCotation;
  /** Problèmes `reference-a-reparer` (propositions jointes, jamais appliquées). */
  readonly problemes: readonly Probleme[];
}

function positionRecalculee(r: ResolutionReference, actuelle: PointLocal): PointLocal {
  if (r.etat !== "resolue") return actuelle;
  if (r.geometrie.nature === "point") return r.geometrie.point;
  const q = projeterSurSegment(r.geometrie.segment, actuelle);
  return pt(q.x, q.y);
}

const memePoint = (p: PointLocal, q: PointLocal) => p.x === q.x && p.y === q.y && p.repereLocal === q.repereLocal;

function problemesDe(porteurId: IdObjet, niveauId: IdObjet | undefined, r: ResolutionReference, detail?: string): Probleme[] {
  if (r.etat !== "a-reparer") return [];
  return [
    {
      code: "reference-a-reparer",
      gravite: "avertissement",
      message: `${porteurId} : la référence à ${r.reference.objetId} (${r.reference.caracteristique}) est à réparer (${detail ?? r.motif}). Action : choisir une proposition ou détacher (reference.reparer).`,
      objetIds: [porteurId, r.reference.objetId],
      ...(niveauId !== undefined ? { niveauId } : {}),
      propositions: r.propositions,
    },
  ];
}

/** Recalcule les extrémités d'une cotation d'après ses références (pur). */
export function recalculerCotation(vue: VueObjets, cotation: ObjetCotation): RecalculCotation {
  const resolution = resoudreCotation(vue, cotation);
  const { a: a0, b: b0 } = cotation.params;
  let a = positionRecalculee(resolution.a, a0);
  let b = positionRecalculee(resolution.b, b0);
  let etat = etatDeResolution(resolution);
  const problemes = [...problemesDe(cotation.id, cotation.niveauId, resolution.a), ...problemesDe(cotation.id, cotation.niveauId, resolution.b)];
  if (etat !== "a-reparer" && distance(a, b) < TOLERANCES.longueurMin) {
    a = a0;
    b = b0;
    etat = "a-reparer";
    problemes.push({
      code: "reference-a-reparer",
      gravite: "avertissement",
      message: `${cotation.id} : ses extrémités recalculées seraient à moins de ${TOLERANCES.longueurMin} m l'une de l'autre (géométrie dégénérée) ; la cote garde sa dernière position. Action : rattacher autrement ou détacher (reference.reparer).`,
      objetIds: [cotation.id, ...cotation.params.references.map((r) => r.objetId)],
      ...(cotation.niveauId !== undefined ? { niveauId: cotation.niveauId } : {}),
    });
  }
  const change = !memePoint(a, a0) || !memePoint(b, b0) || etat !== cotation.params.etat;
  return { cotationId: cotation.id, a, b, etat, change, resolution, problemes };
}

/**
 * Cotations à mettre à jour après un changement : celles dont une référence vise un objet de `objetsTouches`
 * (toutes les cotations rattachées si `objetsTouches` est absent). Seules celles qui changent sont rendues,
 * triées par identifiant.
 */
export function recalculerCotationsRattachees(vue: VueObjets, objetsTouches?: readonly IdObjet[]): readonly RecalculCotation[] {
  const touches = objetsTouches ? new Set(objetsTouches) : null;
  const res: RecalculCotation[] = [];
  for (const id of Object.keys(vue.objets).sort()) {
    const o = vue.objets[id];
    if (o?.classe !== "cotation" || o.params.references.length === 0) continue;
    if (touches && !o.params.references.some((r) => touches.has(r.objetId))) continue;
    const r = recalculerCotation(vue, o);
    if (r.change) res.push(r);
  }
  return res;
}

/** Toutes les références à réparer du modèle (cotations et étiquettes), pour le panneau « Problèmes ». */
export function problemesReferences(vue: VueObjets): readonly Probleme[] {
  const res: Probleme[] = [];
  for (const id of Object.keys(vue.objets).sort()) {
    const o = vue.objets[id];
    if (o?.classe === "cotation") {
      if (o.params.references.length > 0) res.push(...recalculerCotation(vue, o).problemes);
    } else if (o?.classe === "etiquette" && o.params.objetId !== undefined) {
      const c = o.params.caracteristique;
      if (c === undefined) {
        if (!Object.prototype.hasOwnProperty.call(vue.objets, o.params.objetId)) {
          res.push({
            code: "reference-a-reparer",
            gravite: "avertissement",
            message: `${o.id} : l'objet étiqueté ${o.params.objetId} n'existe plus. Action : choisir un autre objet ou détacher (reference.reparer).`,
            objetIds: [o.id, o.params.objetId],
            ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}),
            propositions: [{ cible: null, libelle: LIBELLE_DETACHER }],
          });
        }
        continue;
      }
      const ref = { objetId: o.params.objetId, caracteristique: c as ReferenceTopologique["caracteristique"] };
      const r = estCaracteristiqueNommee(c)
        ? resoudreReferenceDans(vue, ref, { point: o.params.position, ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}) })
        : ({ etat: "a-reparer", reference: ref, motif: "caracteristique-absente", propositions: [{ cible: null, libelle: LIBELLE_DETACHER }] } as const);
      res.push(...problemesDe(o.id, o.niveauId, r));
    }
  }
  return res;
}
