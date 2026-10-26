/**
 * Projection en état identifié (EX-051, INV-006, EX-016) : ce que la vue 3D affiche de son propre état, calculé sans
 * React ni DOM depuis le cycle de vie de son maillage.
 *
 * - `sourceRevisionId` : identifiant de révision **serveur** du résultat affiché (celui qui était la révision de la
 *   variante quand ce résultat a été demandé), avec la mention « brouillon » si le document maillé portait des commandes
 *   non enregistrées ; jamais la révision courante si le résultat est antérieur ;
 * - état dérivé (`a-jour` / `a-recalculer` / `en-calcul` / `echec` / `non-applicable`), par la machine d'états pure de
 *   `@parcours/atelier-model/studio-cmd` : un résultat d'une autre révision n'est jamais présenté « à jour » ;
 * - domaines de données périmées : ceux que les changements entre le document du résultat affiché et le document
 *   courant invalident (mêmes règles que l'événement d'effets d'une commande, EX-010).
 */
import type { StudioDocument } from "@parcours/atelier-model";
import { studioEffetsCommande, studioEtatDeriveCoherent, studioLibelleEtatDerive, type StudioDomaineDerive, type StudioEtatDerive } from "@parcours/atelier-model/studio-cmd";

export const LIBELLES_DOMAINES: Readonly<Record<StudioDomaineDerive, string>> = Object.freeze({
  "plan-2d": "plan 2D", "maillage-3d": "maillage 3D", quantites: "métré", exports: "exports", publications: "publications",
});

/** Révision source d'un résultat : révision serveur de la variante et brouillon (commandes non enregistrées) ou non. */
export interface SourceProjection { revisionServeur: string; brouillon: boolean; revisionSession: string }

export interface EntreeEtatProjection {
  /** Vue 3D sans moteur de rendu (WebGL absent) : contrat non applicable. */
  indisponible: boolean;
  /** Message d'échec de la tâche de maillage, s'il y en a un. */
  echec: string | null;
  /** État de la tâche de maillage du document courant. */
  tache: "queued" | "running" | "done" | "failed" | "cancelled" | "timed-out" | "stale" | "inactive";
  /** Source du document courant (à mailler) et source du résultat affiché (null : aucun résultat encore). */
  courante: SourceProjection;
  affichee: SourceProjection | null;
  docCourant: StudioDocument;
  docAffiche: StudioDocument | null;
}

export interface EtatProjection {
  etat: StudioEtatDerive;
  libelle: string;
  /** Texte de la révision source du résultat affiché (« aucune » sans résultat). */
  source: string;
  sourceRevisionId: string | null;
  domainesPerimes: StudioDomaineDerive[];
  coherent: boolean;
}

const cle = (s: SourceProjection) => `${s.revisionServeur}#${s.revisionSession}`;
const court = (r: string) => r.slice(-8);

export function etatProjection3d(e: EntreeEtatProjection): EtatProjection {
  const revision = cle(e.courante);
  const image = e.affichee ? cle(e.affichee) : null;
  let etat: StudioEtatDerive;
  if (e.indisponible) etat = { etat: "non-applicable", revision, image, motif: "WebGL n’est pas pris en charge par ce navigateur" };
  else if (e.echec) etat = { etat: "echec", revision, image: image === revision ? null : image, motif: e.echec };
  else if (image === revision) etat = { etat: "a-jour", revision, image, motif: null };
  else if (e.tache === "running" || e.tache === "queued") etat = { etat: "en-calcul", revision, image, motif: null };
  else etat = { etat: "a-recalculer", revision, image, motif: null };
  const domainesPerimes = e.docAffiche && e.docAffiche !== e.docCourant && image !== revision
    ? studioEffetsCommande(e.docAffiche, e.docCourant, [], { revisionBase: null, revisionSortie: "", source: "vue-3d", auteurId: "", requestId: null }).domainesInvalides
    : [];
  const libelle = studioLibelleEtatDerive(etat, () => court(e.courante.revisionServeur));
  const source = e.affichee ? `${court(e.affichee.revisionServeur)}${e.affichee.brouillon ? " (brouillon non enregistré)" : ""}` : "aucune";
  return { etat, libelle, source, sourceRevisionId: e.affichee?.revisionServeur ?? null, domainesPerimes, coherent: studioEtatDeriveCoherent(etat, revision) };
}
