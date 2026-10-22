/**
 * Apparence des faces de la Planche (Sandbox), d'après SketchUp :
 * - recto blanc par défaut ;
 * - sans ombres, la lumière vient de la caméra (comme SketchUp quand « utiliser le soleil pour l'ombrage » est coché
 *   off) : une face tournée vers soi est blanche, une face rasante grisée ;
 * - une face sélectionnée garde sa couleur et reçoit une trame de points bleus fixée à l'écran.
 * Fonctions pures, sans three.js ni DOM, testées dans `apparence-faces.test.ts`.
 */

/** Recto par défaut : blanc (SketchUp « Front color »). */
export const COULEUR_RECTO = "#ffffff";

/** Couleur des points de la trame de sélection. */
export const COULEUR_TRAME_SELECTION = "#1a3fd6";

/** Trame de sélection, en pixels CSS : pas de la grille (rangées décalées d'un demi-pas) et rayon d'un point. */
export const TRAME_SELECTION = { pas: 4, rayon: 0.8 } as const;

/**
 * Intensité de la lumière directionnelle. Sans ombres (lumière de caméra), elle est réglée pour qu'une face vue
 * à moins d'environ 45° de face atteigne le blanc ; avec ombres, le soleil calculé garde son intensité.
 */
export function intensiteLumiere(ombres: boolean): number {
  return ombres ? 1.6 : 2.4;
}

/**
 * Vrai si le pixel (x, y) — coordonnées d'écran en pixels physiques — tombe sur un point de la trame.
 * Même calcul que le fragment shader de `vue-planche.ts` (`SHADER_TRAME`), gardé identique.
 */
export function pointDeTrame(x: number, y: number, ratioPixels: number, trame: { pas: number; rayon: number } = TRAME_SELECTION): boolean {
  const pas = trame.pas * ratioPixels;
  const rayon = trame.rayon * ratioPixels;
  const rangee = Math.floor(y / pas);
  const decalage = rangee % 2 === 0 ? 0 : pas / 2;
  const cx = modulo(x + decalage, pas) - pas / 2;
  const cy = modulo(y, pas) - pas / 2;
  return cx * cx + cy * cy <= rayon * rayon;
}

function modulo(a: number, n: number): number {
  return a - n * Math.floor(a / n);
}

/** Fragment shader de la trame : mêmes règles que `pointDeTrame` (GLSL `mod` = modulo ci-dessus). */
export const SHADER_TRAME_FRAGMENT = `
uniform vec3 couleur;
uniform float pas;
uniform float rayon;
void main() {
  vec2 p = gl_FragCoord.xy;
  float rangee = floor(p.y / pas);
  float decalage = mod(rangee, 2.0) < 0.5 ? 0.0 : pas * 0.5;
  vec2 c = vec2(mod(p.x + decalage, pas), mod(p.y, pas)) - vec2(pas * 0.5);
  if (dot(c, c) > rayon * rayon) discard;
  gl_FragColor = vec4(couleur, 1.0);
  #include <colorspace_fragment>
}
`;

export const SHADER_TRAME_VERTEX = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
