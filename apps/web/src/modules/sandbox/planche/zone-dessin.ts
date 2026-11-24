/**
 * Rectangle de la zone de dessin de la Planche (`[data-planche-cadre]`), sous le bandeau d'en-tête : les barres
 * flottantes (barre d'actions, barre d'outils, « Axes et repères ») se placent par défaut dans cette zone et jamais sur
 * le bandeau. Sans zone de dessin (référence d'un autre contexte), le rectangle de la référence elle-même.
 */
export function rectZoneDessin(reference: Element): DOMRect {
  return (reference.querySelector("[data-planche-cadre]") ?? reference).getBoundingClientRect();
}
