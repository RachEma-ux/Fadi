/** Vecteurs 3D purs (mètres, repère local de la Planche : x = rouge, y = vert, z = bleu). */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const EPS = 1e-9;
/** Tolérance de fusion des sommets (m) — choix Fadi, non relevé sur SketchUp. */
export const TOL = 1e-6;

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const ORIGINE: Vec3 = v3(0, 0, 0);
export const AXE_X: Vec3 = v3(1, 0, 0);
export const AXE_Y: Vec3 = v3(0, 1, 0);
export const AXE_Z: Vec3 = v3(0, 0, 1);

export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const normalize = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < EPS ? ORIGINE : scale(a, 1 / l);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export const egal = (a: Vec3, b: Vec3, tol = TOL): boolean => dist(a, b) <= tol;
export const colineaires = (a: Vec3, b: Vec3, tol = 1e-9): boolean => len(cross(normalize(a), normalize(b))) <= tol;

/** Rotation de `p` autour de l'axe (origine `o`, direction `axe`) d'un angle en radians (Rodrigues). */
export function tourner(p: Vec3, o: Vec3, axe: Vec3, angle: number): Vec3 {
  const k = normalize(axe);
  const v = sub(p, o);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
  return add(o, r);
}
