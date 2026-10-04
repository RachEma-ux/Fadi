/**
 * Escalier droit paramétrique (DA-07-10) : valeurs retenues calculées, jamais saisies.
 *
 * - hauteur à franchir : déclarée, sinon dérivée des altitudes des niveaux reliés (arrivée − départ) ;
 * - hauteur de contremarche = hauteur à franchir / contremarches ; giron = longueur de l'axe / marches ;
 * - 2h + g (loi de Blondel) **affiché à titre indicatif** : DA-07-10 n'active aucune règle dimensionnelle tant
 *   que le maître d'ouvrage n'en a pas fourni la source ; aucune borne n'est inventée ni imposée.
 */
import { estNonEvaluee, type EtatModele, type ObjetModele } from "@parcours/atelier-model";
import { repereAxe } from "../geometrie";

export interface IndicesEscalier {
  readonly hauteurAFranchir: number | null;
  readonly hauteur: number | null;
  readonly giron: number | null;
  readonly blondel: number | null;
}

const nombre = (x: unknown): number | null => (estNonEvaluee(x) ? null : typeof x === "number" ? x : typeof x === "object" && x !== null && typeof (x as { value?: unknown }).value === "number" ? (x as { value: number }).value : null);

/** Hauteur à franchir dérivée des niveaux reliés, ou `null`. */
export function denivele(etat: EtatModele | null, depart: string | undefined, arrivee: string | undefined): number | null {
  const d = depart ? etat?.objets[depart] : undefined;
  const a = arrivee ? etat?.objets[arrivee] : undefined;
  return d?.classe === "niveau" && a?.classe === "niveau" ? a.params.elevation.value - d.params.elevation.value : null;
}

/** Valeurs retenues à partir de grandeurs brutes (outil ou objet). */
export function indices(H: number | null, contremarches: number | null, marches: number | null, longueur: number | null): IndicesEscalier {
  const hauteur = H !== null && contremarches !== null && contremarches >= 1 ? H / contremarches : null;
  const giron = longueur !== null && marches !== null && marches > 0 ? longueur / marches : null;
  return { hauteurAFranchir: H, hauteur, giron, blondel: hauteur !== null && giron !== null ? 2 * hauteur + giron : null };
}

export function indicesEscalier(o: ObjetModele, etat: EtatModele | null): IndicesEscalier {
  if (o.classe !== "escalier") return { hauteurAFranchir: null, hauteur: null, giron: null, blondel: null };
  const p = o.params;
  const r = repereAxe(p.axe.a, p.axe.b);
  const H = nombre(p.hauteurAFranchir) ?? denivele(etat, p.niveauDepartId, p.niveauArriveeId);
  return indices(H, nombre(p.contremarches), nombre(p.marches), r ? r.L : null);
}
