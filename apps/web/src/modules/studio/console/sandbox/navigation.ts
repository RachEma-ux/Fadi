/**
 * Navigation configurable (D-157, ergonomie SketchUp pour le Web) : interprétation des molettes, trackpads et gestes
 * selon les réglages de l'utilisateur (préférence locale, jamais une donnée de projet). Pur : aucun DOM, aucun React.
 */
import type { ReglagesNavigation } from "./etat-ui";

export const SENSIBILITE_MIN = 0.25;
export const SENSIBILITE_MAX = 4;

/** Sensibilité bornée (une valeur illisible vaut 1). */
export function borneSensibilite(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 1;
  return Math.min(SENSIBILITE_MAX, Math.max(SENSIBILITE_MIN, n));
}

/** Événement molette réduit à ce qui compte pour la navigation (pas de dépendance au DOM). */
export interface Molette {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lignes, 2 = pages (WheelEvent.deltaMode). */
  deltaMode?: number;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey?: boolean;
}

export type GesteMolette = { type: "zoom"; facteur: number } | { type: "pan"; dx: number; dy: number } | { type: "orbite"; dx: number; dy: number };

const enPixels = (d: number, mode = 0) => (mode === 1 ? d * 16 : mode === 2 ? d * 400 : d);

/**
 * Molette ou trackpad.
 * - Souris : molette = zoom ancré ; Maj + molette = panoramique horizontal.
 * - Trackpad : pincement (navigateurs : `ctrlKey`) = zoom ; deux doigts = panoramique en plan, orbite en 3D
 *   (`troisD`), Maj + deux doigts = panoramique en 3D.
 * Le facteur de zoom est > 1 pour rapprocher. Les déplacements sont en pixels d'écran.
 */
export function interpreterMolette(m: Molette, r: ReglagesNavigation, troisD = false): GesteMolette {
  const dx = enPixels(m.deltaX, m.deltaMode);
  const dy = enPixels(m.deltaY, m.deltaMode);
  const zoom = (d: number, k: number): GesteMolette => {
    const signe = r.inverserZoom ? -1 : 1;
    return { type: "zoom", facteur: Math.exp(-d * k * borneSensibilite(r.sensibiliteZoom) * signe) };
  };
  const pan = (x: number, y: number): GesteMolette => {
    const s = borneSensibilite(r.sensibilitePan) * (r.inverserPan ? -1 : 1);
    return { type: "pan", dx: x * s, dy: y * s };
  };
  if (r.peripherique === "trackpad") {
    if (m.ctrlKey || m.metaKey) return zoom(dy, 0.01);
    if (troisD && !m.shiftKey) {
      const s = borneSensibilite(r.sensibiliteOrbite) * (r.inverserOrbite ? -1 : 1);
      return { type: "orbite", dx: dx * s, dy: dy * s };
    }
    return pan(-dx, -dy);
  }
  if (m.shiftKey && !troisD) return pan(-(dx || dy), 0);
  return zoom(dy || dx, 0.0015);
}

/** Facteur appliqué à un glissement de panoramique (inversion et sensibilité). */
export function facteurPan(r: ReglagesNavigation): number {
  return borneSensibilite(r.sensibilitePan) * (r.inverserPan ? -1 : 1);
}

/** Réglages d'OrbitControls (three.js) dérivés des préférences ; valeurs négatives = sens inversé. */
export interface ReglagesOrbite {
  vitesseZoom: number;
  vitessePan: number;
  vitesseOrbite: number;
  /** Bouton du milieu : orbite (SketchUp) ; Maj + bouton du milieu = panoramique. */
  boutonMilieu: "orbite";
  /** Geste à deux doigts au toucher : pincement + orbite, ou pincement + panoramique. */
  deuxDoigts: "orbite" | "pan";
}

export function reglagesOrbite(r: ReglagesNavigation): ReglagesOrbite {
  return {
    vitesseZoom: borneSensibilite(r.sensibiliteZoom) * (r.inverserZoom ? -1 : 1),
    vitessePan: borneSensibilite(r.sensibilitePan) * (r.inverserPan ? -1 : 1),
    vitesseOrbite: borneSensibilite(r.sensibiliteOrbite) * (r.inverserOrbite ? -1 : 1),
    boutonMilieu: "orbite",
    deuxDoigts: r.deuxDoigts,
  };
}

/** Lecture tolérante de réglages enregistrés (clés inconnues ignorées, valeurs hors bornes ramenées). */
export function lireReglagesNavigation(brut: unknown, defaut: ReglagesNavigation): ReglagesNavigation {
  const b = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  return {
    peripherique: b.peripherique === "trackpad" ? "trackpad" : b.peripherique === "souris" ? "souris" : defaut.peripherique,
    deuxDoigts: b.deuxDoigts === "pan" ? "pan" : b.deuxDoigts === "orbite" ? "orbite" : defaut.deuxDoigts,
    inverserZoom: typeof b.inverserZoom === "boolean" ? b.inverserZoom : defaut.inverserZoom,
    inverserPan: typeof b.inverserPan === "boolean" ? b.inverserPan : defaut.inverserPan,
    inverserOrbite: typeof b.inverserOrbite === "boolean" ? b.inverserOrbite : defaut.inverserOrbite,
    sensibiliteZoom: b.sensibiliteZoom === undefined ? defaut.sensibiliteZoom : borneSensibilite(b.sensibiliteZoom),
    sensibilitePan: b.sensibilitePan === undefined ? defaut.sensibilitePan : borneSensibilite(b.sensibilitePan),
    sensibiliteOrbite: b.sensibiliteOrbite === undefined ? defaut.sensibiliteOrbite : borneSensibilite(b.sensibiliteOrbite),
  };
}
