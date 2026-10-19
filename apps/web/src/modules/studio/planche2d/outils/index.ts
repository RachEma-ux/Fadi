/**
 * Table des outils de la planche 2D par identifiant (une famille par module : `trace.ts`, `courbes.ts`,
 * `modification.ts`) ; aide et aperçu du tracé en cours. Ajouter un outil au pointeur = un `OutilPlanche` dans sa
 * famille et une entrée dans `OUTILS_PLANCHE` (son identifiant doit aussi figurer dans `OUTILS_TRACE` ou être Déplacer).
 */
import type { StudioPoint, StudioShape } from "@parcours/atelier-model";
import type { StudioToolId } from "../raccourcis";
import { OUTIL_ARC, OUTIL_CERCLE, OUTIL_POLYLIGNE } from "./courbes";
import { AIDE_DECALER, OUTIL_COPIER, OUTIL_DEPLACER, OUTIL_TRANSFORMATIONS } from "./modification";
import { OUTILS_TRACE_DEUX_POINTS } from "./trace";
import { AIDE_DEFAUT, type EtatAide, type EtatTrace, type OutilPlanche } from "./type";

export const OUTILS_PLANCHE: readonly OutilPlanche[] = [OUTILS_TRACE_DEUX_POINTS, OUTIL_CERCLE, OUTIL_ARC, OUTIL_POLYLIGNE, OUTIL_DEPLACER, OUTIL_COPIER, OUTIL_TRANSFORMATIONS];

const PAR_ID: ReadonlyMap<StudioToolId, OutilPlanche> = new Map(OUTILS_PLANCHE.flatMap((o) => o.ids.map((id) => [id, o] as const)));

/** Outil au pointeur de cet identifiant, ou null (sélection, commandes sans pointeur). */
export const outilPlanche = (id: StudioToolId): OutilPlanche | null => PAR_ID.get(id) ?? null;

/** Aide des outils sans pointeur. */
const AIDES_SANS_POINTEUR: Partial<Record<StudioToolId, string>> = {
  "studio.dessin.decaler": AIDE_DECALER,
  "studio.dessin.selection": "Cliquez un objet, Maj + clic pour l’ajouter ou le retirer ; glissez vers la droite pour une fenêtre, vers la gauche pour une capture ; glissez la sélection pour la déplacer.",
};

/** Aide affichée sous la planche : lecture seule, puis l'aide de l'outil (pendant le tracé ou au repos). */
export function aidePlanche(e: EtatAide & { lectureSeule: boolean }): string {
  if (e.lectureSeule) return "Lecture seule : la planche se consulte sans modification.";
  const outil = outilPlanche(e.outil);
  if (e.trace) return outil?.aideTrace?.({ ...e, trace: e.trace }) ?? "Premier point placé. Cliquez le second point. Échap pour annuler.";
  return AIDES_SANS_POINTEUR[e.outil] ?? outil?.aideRepos?.(e) ?? AIDE_DEFAUT;
}

/** Aperçu d'une courbe en cours de tracé (jamais une donnée du document). */
export function apercuPlanche(e: EtatTrace, fin: StudioPoint | undefined): StudioShape | null {
  if (!e.trace || !fin) return null;
  return outilPlanche(e.outil)?.apercu?.({ ...e, trace: e.trace }, fin) ?? null;
}
