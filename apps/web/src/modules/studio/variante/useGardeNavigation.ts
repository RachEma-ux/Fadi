/**
 * Garde de navigation de l'espace de travail : tant que `dirty` est vrai (brouillon non enregistré, tracé en cours,
 * sauvegarde en cours ou non confirmée), fermer l'onglet, suivre un lien ou revenir en arrière demande confirmation.
 * Un lien de téléchargement (export), d'ancre ou marqué `data-studio-sans-garde` (changement de domaine de la même
 * variante, `domaines/DomainesStudio.tsx`) ne quitte pas l'étude.
 */
import { useEffect, type MutableRefObject } from "react";
import { warning } from "./etat-variante";

/** Attribut des liens internes à la variante que la garde laisse passer (changement de domaine, I.4). */
export const ATTRIBUT_SANS_GARDE = "data-studio-sans-garde";

/** Vrai si suivre ce lien quitte la variante (et demande donc confirmation quand un brouillon est en jeu). */
export function lienQuitteLaVariante(link: Pick<Element, "hasAttribute" | "getAttribute">): boolean {
  return !link.hasAttribute("download") && !link.hasAttribute(ATTRIBUT_SANS_GARDE) && !link.getAttribute("href")?.startsWith("#");
}

export function useGardeNavigation(dirty: MutableRefObject<boolean>) {
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    // Un lien de téléchargement (export) ou un changement de domaine ne quitte pas l'étude : aucune confirmation.
    const click = (e: globalThis.MouseEvent) => { const link = (e.target as Element).closest?.("a[href]"); if (dirty.current && link && lienQuitteLaVariante(link) && !window.confirm(warning())) { e.preventDefault(); e.stopPropagation(); } };
    let currentIndex = Number(history.state?.idx ?? 0), restoring = false;
    const back = (e: PopStateEvent) => {
      const target = Number(e.state?.idx ?? currentIndex);
      if (restoring) { restoring = false; e.stopImmediatePropagation(); return; }
      if (dirty.current && !window.confirm(warning())) { e.stopImmediatePropagation(); restoring = true; history.go(currentIndex - target || 1); }
      else currentIndex = target;
    };
    window.addEventListener("popstate", back, true); window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("popstate", back, true); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); };
  }, [dirty]);
}
