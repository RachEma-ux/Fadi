/**
 * Focus visible à la bascule Planche 2D ⇄ Planche 3D (TR-EX-036, ADR-STUDIO-PILOTE-01 P-12 ; EX-036 : « le changement
 * de focus entre Planche 2D et 3D est visible »). Après une bascule demandée par l'utilisateur (Maj+D, choix de la
 * planche), le focus passe à la planche qui vient d'apparaître : la planche de dessin 2D (`svg` « Planche de dessin 2D »)
 * ou la vue 3D (`section` « Vue 3D », chargée à la demande). L'élément reçoit `tabindex="-1"` (focus programmatique sans
 * entrer dans l'ordre de tabulation) et l'attribut `data-studio-focus-bascule`, que `studio.css` souligne d'un contour
 * visible. `cibleFocusBascule` est pur ; `deplacerFocusBascule` touche le DOM seulement.
 */
import type { ModePlanche } from "../domaines/definitions";

export type CibleFocusBascule = "2d" | "3d";
/** Sélecteurs des planches focalisables (éléments déjà nommés pour les technologies d'assistance). */
export const SELECTEURS_FOCUS_BASCULE: Readonly<Record<CibleFocusBascule, string>> = Object.freeze({
  "2d": 'svg[aria-label="Planche de dessin 2D"]',
  "3d": "section[data-studio-vue3d]",
});

/** Planche qui reçoit le focus après le passage de `avant` à `apres` : celle qui vient d'apparaître ; null sans bascule. */
export function cibleFocusBascule(avant: ModePlanche, apres: ModePlanche): CibleFocusBascule | null {
  if (avant === apres) return null;
  if (apres === "2d") return "2d";
  if (apres === "3d") return "3d";
  // Double vue : la planche ajoutée.
  return avant === "2d" ? "3d" : "2d";
}

/**
 * Donne le focus à la planche `cible` sous `racine`. La vue 3D est chargée à la demande : on attend son apparition
 * (au plus `tentatives` images). Rend une fonction d'abandon (démontage, nouvelle bascule).
 */
export function deplacerFocusBascule(racine: HTMLElement, cible: CibleFocusBascule, tentatives = 180): () => void {
  let n = 0, image = 0, abandon = false;
  const essayer = () => {
    if (abandon) return;
    const el = racine.querySelector<HTMLElement | SVGElement>(SELECTEURS_FOCUS_BASCULE[cible]);
    if (el) {
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      for (const autre of racine.querySelectorAll("[data-studio-focus-bascule]")) if (autre !== el) autre.removeAttribute("data-studio-focus-bascule");
      el.setAttribute("data-studio-focus-bascule", cible);
      el.focus({ preventScroll: false });
      return;
    }
    if (++n < tentatives) image = requestAnimationFrame(essayer);
  };
  image = requestAnimationFrame(essayer);
  return () => { abandon = true; cancelAnimationFrame(image); };
}
