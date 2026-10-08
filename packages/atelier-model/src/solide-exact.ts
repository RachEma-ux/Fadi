/**
 * Solide exact (P2-1, D-177) — fonctions pures autour de la représentation B-rep : pose en plan (position, angle
 * autour de z) appliquée au maillage dérivé, emprise, volume. Le modèle ne recalcule jamais le brep ni le maillage :
 * c'est le rôle du noyau `@parcours/geometry-exact` (navigateur et serveur).
 */
type Point2 = { x: number; y: number };

/** Positions (x, y, z à la suite) du maillage après la pose : rotation d'`angleDeg` autour de z puis translation. */
export function positionsPosees(maillage: { positions: readonly number[] }, position: Point2, angleDeg: number): number[] {
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const out = new Array<number>(maillage.positions.length);
  for (let i = 0; i < maillage.positions.length; i += 3) {
    const x = maillage.positions[i]!, y = maillage.positions[i + 1]!, z = maillage.positions[i + 2]!;
    out[i] = Math.round((c * x - s * y + position.x) * 1e9) / 1e9;
    out[i + 1] = Math.round((s * x + c * y + position.y) * 1e9) / 1e9;
    out[i + 2] = z;
  }
  return out;
}

/** Points (x, y) du maillage posé, pour l'enveloppe convexe de l'emprise. */
export function emprisePosee(maillage: { positions: readonly number[] }, position: Point2, angleDeg: number): { x: number; y: number }[] {
  const p = positionsPosees(maillage, position, angleDeg);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < p.length; i += 3) pts.push({ x: p[i]!, y: p[i + 1]! });
  return pts;
}

/** Volume (m³) d'un maillage fermé par la formule du tétraèdre signé — contrôle indépendant du volume annoncé. */
export function volumeMaillage(maillage: { positions: readonly number[]; indices: readonly number[] }): number {
  const P = maillage.positions, I = maillage.indices;
  let v = 0;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k]! * 3, b = I[k + 1]! * 3, c = I[k + 2]! * 3;
    const ax = P[a]!, ay = P[a + 1]!, az = P[a + 2]!, bx = P[b]!, by = P[b + 1]!, bz = P[b + 2]!, cx = P[c]!, cy = P[c + 1]!, cz = P[c + 2]!;
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v) / 6;
}
