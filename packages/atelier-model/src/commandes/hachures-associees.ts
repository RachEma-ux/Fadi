/**
 * Hachures associatives (D-092, fiche DA-01-11) : après chaque commande, une hachure liée à un objet source reprend
 * le contour fermé de sa source s'il a changé (même commande, même révision) ; source supprimée ou devenue ouverte :
 * la hachure garde son dernier contour et perd le lien (dit dans les effets). Une hachure verrouillée ne suit pas.
 */
import { pointsArc, pointsEllipse, pointsPolyligne, pointsSpline } from "../geometrie.js";
import type { Contour, ModeleAtelier, Occurrence, OccurrenceQuelconque } from "../modele.js";
import type { Effets } from "./base.js";
import { contourFerme } from "./changer-classe.js";

/**
 * Profil fermé d'une esquisse ou d'un contour (D-114, solide associatif) : contours fermés exacts, et courbes fermées
 * discrétisées (cercle et ellipse 48 points, courbe fermée 8 points par segment, polyligne fermée à arcs).
 */
export function profilFerme(o: OccurrenceQuelconque): Contour | null {
  const c = contourFerme(o);
  if (c) return c;
  if (o.classe !== "esquisse") return null;
  const q = o.params;
  const r6 = (v: { x: number; y: number }) => ({ x: Math.round(v.x * 1e9) / 1e9, y: Math.round(v.y * 1e9) / 1e9, frame: "local" as const, unit: "m" as const });
  if (q.forme === "cercle" && q.centre && q.rayon) return { contour: pointsArc(q.centre, q.rayon.value, 0, 360, 48).slice(0, -1).map(r6), trous: [] };
  if (q.forme === "ellipse" && q.centre && q.rayon && q.rayonB) return { contour: pointsEllipse(q.centre, q.rayon.value, q.rayonB.value, q.rotation?.value ?? 0, 48).map(r6), trous: [] };
  if (q.forme === "spline" && q.ferme && q.points.length >= 3) {
    const p = pointsSpline(q.points, 8, true, q.tangentes);
    return { contour: (p.length > 1 && p[0]!.x === p[p.length - 1]!.x && p[0]!.y === p[p.length - 1]!.y ? p.slice(0, -1) : p).map(r6), trous: [] };
  }
  if (q.forme === "polyligne" && q.ferme && q.renflements) return { contour: pointsPolyligne(q.points, true, q.renflements).map(r6), trous: [] };
  return null;
}

export function suivreHachures(etat: ModeleAtelier, effets: Effets): { etat: ModeleAtelier; effets: Effets } {
  let objets = etat.objets;
  const modifies: string[] = [];
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "esquisse" || o.params.forme !== "hachure" || !o.params.sourceId || o.verrouille) continue;
    const h = o as Occurrence<"esquisse">;
    const source = etat.objets[h.params.sourceId!];
    const c = source ? contourFerme(source) : null;
    if (!c) {
      const { sourceId: _s, ...reste } = h.params;
      void _s;
      objets = { ...objets, [h.id]: { ...h, params: reste } };
      modifies.push(h.id);
      continue;
    }
    const meme = c.contour.length === h.params.points.length && c.contour.every((q, i) => q.x === h.params.points[i]!.x && q.y === h.params.points[i]!.y);
    if (meme) continue;
    objets = { ...objets, [h.id]: { ...h, params: { ...h.params, points: c.contour.map((q) => ({ ...q })) } } };
    modifies.push(h.id);
  }
  // Solides associés (D-114) : le contour suit le profil fermé de l'esquisse source ; source supprimée ou ouverte :
  // le solide garde son dernier contour et perd le lien.
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "solide" || !o.params.sourceId || o.verrouille) continue;
    const s = o as Occurrence<"solide">;
    const source = etat.objets[s.params.sourceId!];
    const c = source ? profilFerme(source) : null;
    if (!c) {
      const { sourceId: _s, ...reste } = s.params;
      void _s;
      objets = { ...objets, [s.id]: { ...s, params: reste } };
      modifies.push(s.id);
      continue;
    }
    const meme = c.contour.length === s.params.contour.length && c.contour.every((q, i) => q.x === s.params.contour[i]!.x && q.y === s.params.contour[i]!.y) && JSON.stringify(c.trous) === JSON.stringify(s.params.trous);
    if (meme) continue;
    objets = { ...objets, [s.id]: { ...s, params: { ...s.params, contour: c.contour.map((q) => ({ ...q })), trous: c.trous.map((t) => t.map((q) => ({ ...q }))) } } };
    modifies.push(s.id);
  }
  if (!modifies.length) return { etat, effets };
  return { etat: { ...etat, objets }, effets: { ...effets, modifies: [...new Set([...effets.modifies, ...modifies])] } };
}
