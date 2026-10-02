/**
 * Mode « Atelier » du prototype : à l'étape 10 / 11 et dans le module
 * Atelier, la page est l'Atelier Architectural (bandeau, barre d'outils,
 * dessin) — l'enveloppe de Fadi (barre latérale, en-tête du projet,
 * navigation des modules) s'efface pour rendre toute la largeur au dessin ;
 * « ← » du bandeau ramène au parcours, « ⌂ » aux projets.
 */
import { useEffect } from "react";

export const IMMERSIVE_CLASS = "atelier-immersive";

export function useImmersive(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add(IMMERSIVE_CLASS);
    return () => document.body.classList.remove(IMMERSIVE_CLASS);
  }, [active]);
}
