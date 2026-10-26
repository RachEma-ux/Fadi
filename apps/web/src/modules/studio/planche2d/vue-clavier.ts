/**
 * Panoramique de la planche 2D au clavier (TR-EX-036 : alternative au glisser du bouton du milieu, d'Espace + glisser et
 * des deux doigts). La planche ayant le focus, les flèches déplacent la vue d'un dixième de sa largeur ou de sa hauteur
 * (Maj : d'une demi-vue). La vue n'est jamais une donnée du document ni une commande. Pur : ni React ni DOM.
 */
import type { Cadre } from "./geometrie-2d";

export const TOUCHES_PANORAMIQUE = Object.freeze(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const);

/** Cadre déplacé par la touche (repère de la vue SVG : y vers le bas), ou null si la touche n'est pas une flèche. */
export function panoramiqueClavier(c: Cadre, touche: string, grand = false): Cadre | null {
  const f = grand ? 0.5 : 0.1;
  switch (touche) {
    case "ArrowLeft": return { ...c, x: c.x - c.w * f };
    case "ArrowRight": return { ...c, x: c.x + c.w * f };
    case "ArrowUp": return { ...c, y: c.y - c.h * f };
    case "ArrowDown": return { ...c, y: c.y + c.h * f };
    default: return null;
  }
}
