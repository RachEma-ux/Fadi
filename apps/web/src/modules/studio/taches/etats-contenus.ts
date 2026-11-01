/**
 * Fraîcheur des contenus dérivés affichés par les panneaux (EX-016) : métré, aperçu de la feuille, feuilles composées et
 * publications affichent, comme la vue 3D, l'un des cinq états de la machine pure de `@parcours/atelier-model/studio-cmd`
 * — à jour pour la révision R, à recalculer, en calcul, échec, non applicable — en plus de leurs statuts propres
 * (actualité d'une feuille ou d'une publication, travail, diffusion). « Dernière image produite » n'est jamais « état
 * courant » : un résultat d'une autre révision que la courante n'est jamais « à jour ».
 *
 * Contrat de chaque contenu (ce qui le rend « non applicable ») :
 * - métré : aucun objet à métrer dans le document ;
 * - feuille (aperçu ou composée) : aucun élément du dessin à mettre en page ;
 * - publication : retirée ou remplacée par une diffusion plus récente (son contenu n'est plus tenu à jour).
 * Pur : ni React, ni DOM.
 */
import type { StudioDocument } from "@parcours/atelier-model";
import { studioEtatDeriveCoherent, studioEtatDeriveContenu, studioLibelleEtatDerive, type StudioEtatDerive } from "@parcours/atelier-model/studio-cmd";
import type { EtatTache } from "./ordonnanceur";

export interface EtatContenuAffiche {
  etat: StudioEtatDerive;
  /** Libellé (français source) : « À jour pour la révision … », « À recalculer », « En calcul », « Échec du calcul : … », « Non applicable : … ». */
  libelle: string;
  coherent: boolean;
}

export const MOTIF_METRE_VIDE = "aucun objet à métrer";
export const MOTIF_FEUILLE_VIDE = "aucun élément du dessin à mettre en page";
export const MOTIF_PUBLICATION_RETIREE = "publication retirée, son contenu n’est plus tenu à jour";
export const MOTIF_PUBLICATION_REMPLACEE = "publication remplacée par une diffusion plus récente";

const court = (r: string) => r.slice(-8);
const TACHE_EN_COURS: ReadonlySet<EtatTache | "inactive"> = new Set(["queued", "loading", "running", "cancel_requested"]);

function afficher(etat: StudioEtatDerive, revisionLue: string): EtatContenuAffiche {
  return { etat, libelle: studioLibelleEtatDerive(etat, () => revisionLue), coherent: studioEtatDeriveCoherent(etat, etat.revision ?? "") };
}

/** Le document n'a aucun élément dessiné (objets, cotes, annotations, objets architecturaux). */
export const documentSansElement = (d: StudioDocument): boolean =>
  d.objects.length === 0 && (d.dimensions?.length ?? 0) === 0 && (d.annotations?.length ?? 0) === 0 && (d.architecture?.length ?? 0) === 0;

export interface EntreeEtatMetre {
  /** Révision serveur affichée et brouillon non enregistré (libellé « à jour pour la révision … »). */
  revisionId: string;
  nonEnregistre: boolean;
  /** Révision (empreinte de session) du document courant, et celle du métré affiché (null : aucun). */
  courante: string;
  affichee: string | null;
  tache: EtatTache | "inactive";
  message: string | null;
  /** Objets du métré affiché. */
  objets: number;
}

export function etatMetre(e: EntreeEtatMetre): EtatContenuAffiche {
  const aJour = e.affichee !== null && e.affichee === e.courante;
  const etat = studioEtatDeriveContenu({
    revision: e.courante, image: e.affichee, enCours: TACHE_EN_COURS.has(e.tache), echec: e.message,
    nonApplicable: aJour && e.objets === 0 ? MOTIF_METRE_VIDE : null,
  });
  return afficher(etat, `${court(e.revisionId)}${e.nonEnregistre ? " (brouillon non enregistré)" : ""}`);
}

export interface EntreeEtatApercuFeuille {
  revisionId: string;
  /** Clé (document + réglages) de la composition demandée, et celle de l'aperçu affiché (null : aucun). */
  courante: string;
  affichee: string | null;
  enCours: boolean;
  erreur: string | null;
  sansElement: boolean;
}

export function etatApercuFeuille(e: EntreeEtatApercuFeuille): EtatContenuAffiche {
  const etat = studioEtatDeriveContenu({ revision: e.courante, image: e.affichee, enCours: e.enCours, echec: e.erreur || null, nonApplicable: e.sansElement ? MOTIF_FEUILLE_VIDE : null });
  return afficher(etat, court(e.revisionId));
}

export interface EntreeEtatFeuille {
  /** Révision épinglée par la feuille et tête de sa variante. */
  revisionId: string;
  headRevisionId: string;
  /** Erreur de composition rendue par le serveur. */
  error: string | null;
  /** Éléments de la révision repris par la vue (null : provenance non calculée). */
  elements: { objets: number; cotes: number; annotations: number; architecture: number } | null;
  /** Actualisation sur la dernière révision en cours. */
  enCours: boolean;
}

export function etatFeuille(f: EntreeEtatFeuille): EtatContenuAffiche {
  const vide = f.elements !== null && f.elements.objets + f.elements.cotes + f.elements.annotations + f.elements.architecture === 0;
  const etat = studioEtatDeriveContenu({ revision: f.headRevisionId, image: f.revisionId, enCours: f.enCours, echec: f.error, nonApplicable: vide && !f.error ? MOTIF_FEUILLE_VIDE : null });
  return afficher(etat, court(f.headRevisionId));
}

export interface EntreeEtatPublication {
  revisionId: string;
  headRevisionId: string;
  freshness: "a-jour" | "perimee";
  diffusionStatus: "non-diffuse" | "diffuse" | "retire" | "remplace";
  replacedBy: string | null;
  /** Actualisation du manifeste en cours, et son dernier refus (motif), s'il y en a un. */
  enCours: boolean;
  echec: string | null;
}

export function etatPublication(p: EntreeEtatPublication): EtatContenuAffiche {
  const nonApplicable = p.diffusionStatus === "retire" ? MOTIF_PUBLICATION_RETIREE : p.diffusionStatus === "remplace" || p.replacedBy ? MOTIF_PUBLICATION_REMPLACEE : null;
  // Image : la révision figée, valable pour la tête seulement si le manifeste est à jour ; un écart sur la même révision
  // (documents régénérés, contrôles changés) laisse le contenu sans image courante.
  const image = p.freshness === "a-jour" ? p.headRevisionId : p.revisionId === p.headRevisionId ? null : p.revisionId;
  const etat = studioEtatDeriveContenu({ revision: p.headRevisionId, image, enCours: p.enCours, echec: p.echec, nonApplicable });
  return afficher(etat, court(p.headRevisionId));
}
