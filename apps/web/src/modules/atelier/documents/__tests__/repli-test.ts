/**
 * Dessinateur de **test** des classes d'architecture (mur, dalle, poteau…), sur le modèle de `plan2d/repli.ts` :
 * **jamais enregistré par `installer`** (les vrais viennent du module « architecture ») ; il sert à vérifier les
 * exports sur un état de test. Géométrie canonique seulement (axe, contour, cercle d'un poteau).
 */
import type { ObjetModele, PointLocal } from "@parcours/atelier-model";
import type { DessinateurPlan, DessinPlan, FormeDessin } from "../../socle";

const estPoint = (x: unknown): x is PointLocal => typeof x === "object" && x !== null && typeof (x as PointLocal).x === "number" && typeof (x as PointLocal).y === "number";

function dessiner(o: ObjetModele): DessinPlan | null {
  const p = o.params as unknown as Record<string, unknown>;
  const formes: FormeDessin[] = [];
  const axe = p.axe as { a?: unknown; b?: unknown } | undefined;
  if (axe && estPoint(axe.a) && estPoint(axe.b)) formes.push({ forme: "polyligne", points: [axe.a, axe.b], fermee: false, style: "trait" });
  if (Array.isArray(p.contour) && p.contour.every(estPoint)) formes.push({ forme: "polygone", points: p.contour, style: "plein" });
  if (estPoint(p.point)) formes.push({ forme: "cercle", centre: p.point, rayon: 0.2, style: "trait" });
  if (o.classe === "esquisse.arc" && estPoint(p.centre)) formes.push({ forme: "arc", centre: p.centre, rayon: (p.rayon as { value: number }).value, debut: (p.angleDebut as { value: number }).value, fin: (p.angleFin as { value: number }).value, style: "trait" });
  return formes.length ? { objetId: o.id, couche: o.classe === "dalle" ? "fond" : "objet", formes, segments: [], points: [], contour: null } : null;
}

export const DESSINATEUR_TEST: DessinateurPlan = { classes: ["mur", "dalle", "poteau", "esquisse.arc"], dessiner };
