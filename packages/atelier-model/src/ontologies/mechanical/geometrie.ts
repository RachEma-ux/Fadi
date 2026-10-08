/**
 * Géométrie des pièces et assemblages (P2-2) : pose rigide d'une pièce dans le repère de son assemblage (translation
 * + rotation vectorielle, mêmes conventions que le solveur), repère de l'assemblage dans le niveau (position en plan,
 * angle autour de z, décalage z), maillage posé, emprise en plan (enveloppe convexe). Fonctions pures.
 */
import { enveloppeConvexe } from "../../echanges/import-ifc.js";
import type { Pose3 } from "../../modele.js";
import type { Point2 } from "../../unites.js";
import { rotation, type PoseRigide, type V3 } from "./solveur.js";

export const poseVersRigide = (p: Pose3): PoseRigide => ({ t: [p.x, p.y, p.z], w: [p.rx, p.ry, p.rz] });
export const rigideVersPose = (r: PoseRigide): Pose3 => ({ x: r.t[0], y: r.t[1], z: r.t[2], rx: r.w[0], ry: r.w[1], rz: r.w[2] });
export const POSE_NULLE: Pose3 = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

export interface RepereAssemblage { position: Point2; angleDeg: number; z: number }

/** Point du repère local d'une pièce → repère du niveau (pièce posée dans l'assemblage, assemblage posé dans le niveau). */
export function pointPose(p: V3, pose: Pose3, repere: RepereAssemblage | null): V3 {
  const r = poseVersRigide(pose);
  const q = rotation(r.w, p);
  let x = q[0] + r.t[0], y = q[1] + r.t[1];
  const z = q[2] + r.t[2];
  if (!repere) return [x, y, z];
  const a = (repere.angleDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  [x, y] = [c * x - s * y + repere.position.x, s * x + c * y + repere.position.y];
  return [Math.round(x * 1e9) / 1e9, Math.round(y * 1e9) / 1e9, Math.round((z + repere.z) * 1e9) / 1e9];
}

/** Positions (x, y, z à la suite, repère du niveau) d'un maillage local posé. */
export function positionsPosees3(maillage: { positions: readonly number[] }, pose: Pose3, repere: RepereAssemblage | null): number[] {
  const out = new Array<number>(maillage.positions.length);
  for (let i = 0; i < maillage.positions.length; i += 3) {
    const q = pointPose([maillage.positions[i]!, maillage.positions[i + 1]!, maillage.positions[i + 2]!], pose, repere);
    out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2];
  }
  return out;
}

/** Emprise en plan (enveloppe convexe) et étendue en z d'un maillage posé. */
export function empriseMaillage(positions: readonly number[]): { emprise: Point2[]; z0: number; z1: number } {
  const pts: { x: number; y: number }[] = [];
  let z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    pts.push({ x: positions[i]!, y: positions[i + 1]! });
    const z = positions[i + 2]!;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const h = enveloppeConvexe(pts);
  return { emprise: h.map((p) => ({ x: p.x, y: p.y, frame: "local", unit: "m" })), z0: pts.length ? z0 : 0, z1: pts.length ? z1 : 0 };
}

/** Centre (moyenne des sommets) d'un maillage posé. */
export function centreMaillage(positions: readonly number[]): V3 {
  const n = positions.length / 3;
  if (!n) return [0, 0, 0];
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < positions.length; i += 3) { x += positions[i]!; y += positions[i + 1]!; z += positions[i + 2]!; }
  return [x / n, y / n, z / n];
}

/** Repère du niveau → repère de l'assemblage (inverse de la pose de l'assemblage), pour une translation en plan. */
export function versRepereAssemblage(p: { x: number; y: number }, repere: RepereAssemblage): { x: number; y: number } {
  const a = (-repere.angleDeg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - repere.position.x, dy = p.y - repere.position.y;
  return { x: c * dx - s * dy, y: s * dx + c * dy };
}
