/**
 * Point posé par le pointeur (TR-IF-002) : le repère du moteur d'accrochage s'il y en a un — sommet nommé (lié, cote
 * associative) ou point géométrique nettoyé au nanomètre —, sinon le nœud de grille, sinon l'arrondi au centimètre.
 * C'est la valeur que le geste engage : la tolérance contractuelle (`STUDIO_TOLERANCES_GESTES`, contrat
 * `studio-commands/1`) borne son écart à la valeur visée à 1e-9 m après accrochage. Pur : ni React ni DOM.
 */
import type { StudioPoint } from "@parcours/atelier-model";
import { auCentimetre } from "../geometrie-2d";
import { surGrille } from "../vue";
import type { Repere } from "./moteur";
import type { PointRepere } from "./index";

export function pointPose(repere: Repere | null, brut: StudioPoint, pasGrille: number | null): PointRepere {
  if (repere) return { point: repere.ancre ? { ...repere.ancre.point } : { ...repere.point }, accroche: repere.ancre, repere };
  return { point: pasGrille !== null ? surGrille(brut, pasGrille) : auCentimetre(brut), accroche: null, repere: null };
}
