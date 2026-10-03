import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Remontée en haut de page à chaque changement de vue, comme dans le prototype
 * où `goto()`, `study()`, `overview()` et `mount()` remplacent la page et
 * repartent du bandeau : ouvrir une étape depuis une carte du bas de la grille,
 * « Suivante », « ← » vers la vue d'ensemble, changer de module ou de page.
 *
 * Une vue est identifiée par le chemin et les paramètres qui la désignent
 * (`module`, `etape`, `vue`) ; les autres paramètres (`q`, `projet`,
 * `harmonie`) et l'état de navigation (messages transmis) ne déplacent pas la
 * page. Le retour / l'avance du navigateur (POP) est laissé à sa propre
 * restauration de position.
 */
const VIEW_KEYS = ["module", "etape", "vue"] as const;

export function viewKey(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  return [pathname, ...VIEW_KEYS.map((k) => `${k}=${params.get(k) ?? ""}`)].join("&");
}

export function ScrollReset(): null {
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const key = viewKey(pathname, search);
  const previous = useRef(key);
  useLayoutEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    if (navigationType === "POP") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [key, navigationType]);
  return null;
}
