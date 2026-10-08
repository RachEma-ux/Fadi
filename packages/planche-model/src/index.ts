/** Planche (mode de l'Atelier) — noyau pur : géométrie libre, champ Mesures, inférences, catalogue des outils. */
export { type Vec3, EPS, TOL, v3, ORIGINE, AXE_X, AXE_Y, AXE_Z, add, sub, scale, dot, cross, len, dist, normalize, lerp, egal, colineaires, tourner as tournerPoint } from "./vecteur.js";
export * from "./geometrie-libre.js";
export * from "./annotations.js";
export * from "./maillage.js";
export * from "./police-geometrique.js";
export * from "./inference.js";
export * from "./saisie-vcb.js";
export * from "./catalogue-outils.js";
export * from "./outils/index.js";
export * from "./delta.js";
export * from "./representation.js";
export * from "./echanges.js";
