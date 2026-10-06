/**
 * Profils verticaux et extrusion horizontale (D-154, DA-01-09) : une esquisse posée dans un plan vertical — défini en
 * plan par une ligne a → b (une ligne tracée, ou la face d'un mur) — est extrudée perpendiculairement à ce plan, d'une
 * profondeur saisie, du côté gauche ou droit de a → b. Le profil est en coordonnées du plan : s le long de a → b
 * (depuis a, m), z au-dessus du niveau (m) ; ce ne sont pas des points du repère local du projet (R5), d'où des
 * clés distinctes. L'emprise en plan, la hauteur et la base du solide en sont dérivées. Pur (ni React ni DOM).
 */
import { aireSignee, intersectionSegments, type Vec } from "./geometrie.js";
import { ErreurCommande } from "./commandes/base.js";
import { pt, type Longueur, type Point2 } from "./unites.js";

export interface PointProfil {
  s: number;
  z: number;
}

export interface ProfilVertical {
  a: Point2;
  b: Point2;
  /** Contour fermé du profil (sens direct en (s, z)). */
  profil: PointProfil[];
  profondeur: Longueur;
  cote: "gauche" | "droite";
}

const fini = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Lecture et contrôle : ligne non nulle, profil fermé simple d'au moins 3 points, profondeur positive. */
export function lireProfilVertical(brut: unknown): ProfilVertical {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) throw new ErreurCommande("invalide", "profilVertical", "profil vertical : { a, b, profil, profondeur, cote }");
  const q = brut as Record<string, unknown>;
  const point = (k: "a" | "b") => {
    const v = q[k] as { x?: unknown; y?: unknown } | undefined;
    if (!v || !fini(v.x) || !fini(v.y)) throw new ErreurCommande("invalide", `profilVertical.${k}`, "point en plan { x, y } attendu");
    return pt(v.x, v.y);
  };
  const a = point("a");
  const b = point("b");
  if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) throw new ErreurCommande("invalide", "profilVertical.b", "ligne du plan vertical de longueur nulle");
  const brutProfil = q["profil"];
  if (!Array.isArray(brutProfil) || brutProfil.length < 3 || brutProfil.length > 500) throw new ErreurCommande("invalide", "profilVertical.profil", "profil : de 3 à 500 points { s, z }");
  let profil = brutProfil.map((v, i) => {
    const w = v as { s?: unknown; z?: unknown };
    if (!w || !fini(w.s) || !fini(w.z)) throw new ErreurCommande("invalide", `profilVertical.profil[${i}]`, "point { s, z } en mètres attendu");
    return { s: Math.round(w.s * 1e9) / 1e9, z: Math.round(w.z * 1e9) / 1e9 };
  });
  const plan = (l: PointProfil[]): Vec[] => l.map((p) => ({ x: p.s, y: p.z }));
  const aire = aireSignee(plan(profil));
  if (Math.abs(aire) < 1e-9) throw new ErreurCommande("invalide", "profilVertical.profil", "profil d'aire nulle");
  const n = profil.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const P = plan(profil);
    if (intersectionSegments(P[i]!, P[(i + 1) % n]!, P[j]!, P[(j + 1) % n]!, 1e-12)) throw new ErreurCommande("invalide", "profilVertical.profil", `profil qui se recoupe (côtés ${i + 1} et ${j + 1})`);
  }
  if (aire < 0) profil = [...profil].reverse();
  const pr = q["profondeur"] as { value?: unknown; unit?: unknown } | undefined;
  if (!pr || !fini(pr.value) || pr.unit !== "m" || !(pr.value > 0)) throw new ErreurCommande("invalide", "profilVertical.profondeur", "profondeur d'extrusion positive { value, unit: \"m\" } requise");
  const cote = q["cote"] === "droite" ? "droite" : q["cote"] === undefined || q["cote"] === "gauche" ? "gauche" : (() => { throw new ErreurCommande("invalide", "profilVertical.cote", "côté « gauche » ou « droite »"); })();
  return { a, b, profil, profondeur: { value: pr.value, unit: "m" }, cote };
}

/** Repère du plan vertical : origine a, u le long de a → b, n la normale du côté d'extrusion, décalages [o0, o1]. */
export function reperesProfil(pv: ProfilVertical): { u: Vec; n: Vec; o0: number; o1: number } {
  const L = Math.hypot(pv.b.x - pv.a.x, pv.b.y - pv.a.y);
  const u = { x: (pv.b.x - pv.a.x) / L, y: (pv.b.y - pv.a.y) / L };
  const n = { x: -u.y, y: u.x };
  return { u, n, ...(pv.cote === "gauche" ? { o0: 0, o1: pv.profondeur.value } : { o0: -pv.profondeur.value, o1: 0 }) };
}

/** Emprise en plan (rectangle, sens direct), base et sommet du solide extrudé. */
export function derivesProfil(pv: ProfilVertical): { contour: Point2[]; zMin: number; zMax: number } {
  const { u, n, o0, o1 } = reperesProfil(pv);
  const ss = pv.profil.map((p) => p.s);
  const zs = pv.profil.map((p) => p.z);
  const [s0, s1] = [Math.min(...ss), Math.max(...ss)];
  const P = (s: number, o: number) => pt(Math.round((pv.a.x + u.x * s + n.x * o) * 1e9) / 1e9, Math.round((pv.a.y + u.y * s + n.y * o) * 1e9) / 1e9);
  return { contour: [P(s0, o0), P(s1, o0), P(s1, o1), P(s0, o1)], zMin: Math.min(...zs), zMax: Math.max(...zs) };
}
