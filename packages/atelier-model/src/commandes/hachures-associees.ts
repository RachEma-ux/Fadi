/**
 * Hachures associatives (D-092, fiche DA-01-11) : après chaque commande, une hachure liée à un objet source reprend
 * le contour fermé de sa source s'il a changé (même commande, même révision) ; source supprimée ou devenue ouverte :
 * la hachure garde son dernier contour et perd le lien (dit dans les effets). Une hachure verrouillée ne suit pas.
 */
import type { ModeleAtelier, Occurrence } from "../modele.js";
import type { Effets } from "./base.js";
import { contourFerme } from "./changer-classe.js";

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
  if (!modifies.length) return { etat, effets };
  return { etat: { ...etat, objets }, effets: { ...effets, modifies: [...new Set([...effets.modifies, ...modifies])] } };
}
