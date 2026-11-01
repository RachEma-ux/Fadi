/**
 * Moteur Canvas de la planche 2D (F.1-02) — **renderer alternatif derrière la règle F.1-01** : il n'est employé que si
 * un rapport de comparaison qualifiant (TEST-025 : gain ET non-régression) l'autorise (`studioMoteurEffectif`) ; par
 * défaut, la planche reste en SVG (DEC-08, `STUDIO_MOTEURS_PAR_DEFAUT`).
 *
 * Il trace la scène du document telle que l'export SVG la décrit (`exportStudioSvg`, lue en primitives par
 * `lirePrimitivesSvg`, la même scène que TEST-025) sur un canevas posé au-dessus de la planche SVG, au cadre de la vue
 * courante (axe y retourné : `sy = −1`). La planche SVG reste l'interface : désignation, accrochage, aperçu et
 * accessibilité (éléments et textes dans le document) ne dépendent pas du moteur ; seuls ses traits deviennent
 * transparents. Pur : ni React ni DOM (le contexte est injecté).
 */
import { exportStudioSvg, STUDIO_MOTEURS_PAR_DEFAUT, studioMoteurEffectif, type StudioDocument, type StudioRapportAcceleration, type StudioVerdictAcceleration } from "@parcours/atelier-model";
import type { Cadre } from "../geometrie-2d";
import { dessinerCanvas, lirePrimitivesSvg, type Cadre2D, type Contexte2D, type SceneSvg } from "./comparaison-moteurs";
import { motifsVerdict } from "./motifs-acceleration";

/** Scène du document pour le moteur Canvas : primitives de l'export SVG (repère SVG, y retourné). */
export const scenePlanche = (doc: StudioDocument): SceneSvg => lirePrimitivesSvg(exportStudioSvg(doc));

/**
 * Cadre Canvas de la vue de la planche : même placement que la `viewBox` SVG (proportions préservées, centrée), axe y
 * retourné (l'export écrit y SVG = −y du document ; la planche affiche y du document vers le bas).
 */
export function cadrePlanche(c: Cadre, largeur: number, hauteur: number): Cadre2D {
  const echelle = Math.min(largeur / c.w, hauteur / c.h);
  return { echelle, ox: (largeur - c.w * echelle) / 2 - c.x * echelle, oy: (hauteur - c.h * echelle) / 2 - c.y * echelle, sy: -1 };
}

/** Trace la scène dans le cadre de la vue (fond transparent : la planche SVG reste visible dessous). */
export function rendrePlancheCanvas(ctx: Contexte2D & { clearRect?(x: number, y: number, w: number, h: number): void }, scene: SceneSvg, c: Cadre, largeur: number, hauteur: number): void {
  ctx.clearRect?.(0, 0, largeur, hauteur);
  dessinerCanvas(ctx, scene, largeur, hauteur, cadrePlanche(c, largeur, hauteur));
}

export interface MoteurPlanche {
  moteur: "svg" | "canvas";
  /** Verdict de la règle quand Canvas a été demandé (null : SVG demandé). */
  verdict: StudioVerdictAcceleration | null;
}

/** Moteur de la planche : Canvas seulement si un rapport est proposé ET que la règle F.1-01 l'autorise ; sinon SVG. */
export function moteurPlanche(rapport: StudioRapportAcceleration | null): MoteurPlanche {
  const demande = rapport ? "canvas" : STUDIO_MOTEURS_PAR_DEFAUT["planche-2d"];
  return studioMoteurEffectif("planche-2d", demande, rapport);
}

/** Texte d'état du moteur de la planche (rôle `status`). */
export function texteMoteurPlanche(m: MoteurPlanche): string {
  if (m.moteur === "canvas") return "Moteur de rendu de la planche : Canvas (rapport de comparaison qualifiant, règle F.1-01)";
  if (!m.verdict) return "Moteur de rendu de la planche : SVG (référence, DEC-08)";
  return `Moteur de rendu de la planche : SVG (référence) — Canvas refusé : ${motifsVerdict(m.verdict)}`;
}
