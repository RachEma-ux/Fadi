/**
 * Navigation au clavier d'une barre d'outils (lot Planche 9, EX-CMD-06, motif W3C APG « Toolbar ») : une seule halte de
 * tabulation par barre (tabindex itinérant), flèches pour passer d'un bouton à l'autre (avec retour au début), Origine /
 * Fin pour le premier et le dernier. Les flèches traitées ne vont jamais au dessin (aucun verrou d'axe déclenché). La
 * poignée de déplacement garde ses propres flèches (elle déplace la barre) et reste une halte à part.
 */
import { type KeyboardEvent, type RefObject, useLayoutEffect } from "react";

export type OrientationBarre = "horizontal" | "vertical";

/** Index du bouton suivant pour une touche, ou `null` si la touche n'est pas de navigation. Pur, sans DOM. */
export function indexSuivant(touche: string, index: number, nombre: number, orientation: OrientationBarre): number | null {
  if (nombre <= 0) return null;
  const avant = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const apres = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  if (touche === "Home") return 0;
  if (touche === "End") return nombre - 1;
  if (touche === apres) return (index + 1 + nombre) % nombre;
  if (touche === avant) return (index - 1 + nombre) % nombre;
  return null;
}

/** Poignées de déplacement : elles ne font pas partie de la navigation (leurs flèches déplacent la barre). */
const POIGNEE = "[data-barre-actions-poignee], [data-barre-outils-poignee]";

/** Boutons de la barre elle-même (pas ceux d'un menu ou d'une boîte ouverts dedans), poignées exclues. */
function boutons(barre: HTMLElement): HTMLButtonElement[] {
  return [...barre.querySelectorAll<HTMLButtonElement>("button")].filter(
    (b) => !b.disabled && !b.matches(POIGNEE) && b.closest('[role="toolbar"]') === barre && !b.closest('[role="menu"], [role="dialog"], [role="listbox"]') && b.offsetParent !== null,
  );
}

/**
 * Tabindex itinérant et gestionnaire de touches pour la barre `ref`. À brancher sur `onKeyDown` de l'élément
 * `role="toolbar"`. Le bouton qui garde la halte est le dernier focalisé, sinon le premier.
 */
export function useNavigationBarre(ref: RefObject<HTMLElement | null>, orientation: OrientationBarre = "horizontal"): (e: KeyboardEvent<HTMLElement>) => void {
  useLayoutEffect(() => {
    const barre = ref.current;
    if (!barre) return;
    const liste = boutons(barre);
    const actif = liste.find((b) => b === barre.ownerDocument.activeElement) ?? liste.find((b) => b.tabIndex === 0) ?? liste[0];
    for (const b of liste) b.tabIndex = b === actif ? 0 : -1;
  });
  return (e) => {
    const barre = ref.current;
    if (!barre || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const cible = e.target as HTMLElement;
    if (cible.matches(POIGNEE) || cible.closest("input, select, textarea, [role='menu'], [role='dialog']")) return;
    const liste = boutons(barre);
    const i = liste.indexOf(cible as HTMLButtonElement);
    if (i < 0) return;
    const j = indexSuivant(e.key, i, liste.length, orientation);
    if (j === null) return;
    e.preventDefault();
    e.stopPropagation();
    for (const b of liste) b.tabIndex = b === liste[j] ? 0 : -1;
    liste[j]!.focus();
  };
}
