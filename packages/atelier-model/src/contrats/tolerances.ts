/**
 * Tolérances communes (D-012, provisoires, figées avec les réducteurs en L1.2). Tolérances numériques d'outil,
 * pas des valeurs réglementaires ni constructives.
 */
export const TOLERANCES = {
  /** Deux points confondus (m). */
  tolCoincidence: 1e-6,
  /** Longueur minimale d'un segment (m). */
  longueurMin: 0.001,
  /** Parallélisme, orthogonalité (rad). */
  tolAngle: 1e-6,
  /** Aire minimale d'un polygone (m²). */
  aireMin: 1e-6,
  /** Écart de corde pour la discrétisation des arcs (m). */
  tolCorde: 0.001,
  /** Nombre maximal de copies d'une répétition. */
  copiesMax: 500,
  /** Rayon d'accrochage à l'écran (px) — état d'interface, jamais une donnée du modèle. */
  rayonAccrochageSourisPx: 8,
  rayonAccrochageTouchePx: 16,
} as const;

export type Tolerances = typeof TOLERANCES;
