/** Planche (mode de l'Atelier) — noyau pur : géométrie libre, champ Mesures, inférences, catalogue des outils. */
export { type Vec3, EPS, TOL, v3, ORIGINE, AXE_X, AXE_Y, AXE_Z, add, sub, scale, dot, cross, len, dist, normalize, lerp, egal, colineaires, tourner as tournerPoint } from "./vecteur";
export * from "./geometrie-libre";
export * from "./inference";
export * from "./saisie-vcb";
export * from "./catalogue-outils";
