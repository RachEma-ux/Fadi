/**
 * Dessinateur de **repli** des classes d'architecture et d'annotation, en attendant ceux de l'équipier
 * « architecture » (vague B) et « documents ». **Non enregistré par défaut** (`installer` ne l'ajoute pas) :
 * il sert aux tests de `plan2d` et, au besoin, à l'intégration. Il ne dessine que la géométrie canonique
 * (axe, contour, point), sans épaisseur ni symbole.
 */
import type { ObjetModele, PointLocal } from "@parcours/atelier-model";
import type { DessinateurPlan, DessinPlan, FormeDessin } from "../socle";
import { segmentsDe, type SegmentPlan } from "./geometrie";

export const CLASSES_REPLI = ["mur", "dalle", "toiture", "solide", "piece", "espace", "zone", "poteau", "escalier", "cotation", "texte", "etiquette"] as const;

const estPoint = (x: unknown): x is PointLocal => typeof x === "object" && x !== null && (x as PointLocal).frame === "local" && typeof (x as PointLocal).x === "number" && typeof (x as PointLocal).y === "number";

export function dessinerRepli(o: ObjetModele): DessinPlan | null {
  const p = o.params as unknown as Record<string, unknown>;
  const formes: FormeDessin[] = [];
  const segments: SegmentPlan[] = [];
  const points: PointLocal[] = [];
  let contour: PointLocal[] | null = null;
  const axe = p.axe as { a?: unknown; b?: unknown } | undefined;
  if (axe && estPoint(axe.a) && estPoint(axe.b)) {
    formes.push({ forme: "polyligne", points: [axe.a, axe.b], fermee: false, style: "trait" });
    segments.push({ a: axe.a, b: axe.b });
  } else if (estPoint(p.a) && estPoint(p.b)) {
    formes.push({ forme: "polyligne", points: [p.a, p.b], fermee: false, style: "annotation" });
    segments.push({ a: p.a, b: p.b });
  }
  if (Array.isArray(p.contour) && p.contour.every(estPoint) && p.contour.length >= 3) {
    contour = p.contour;
    formes.push({ forme: "polygone", points: contour, style: "plein" });
    segments.push(...segmentsDe(contour, true));
  }
  for (const k of ["point", "position"]) {
    const q = p[k];
    if (estPoint(q)) points.push(q);
  }
  if (estPoint(p.position) && typeof p.texte === "string") formes.push({ forme: "texte", position: p.position, texte: p.texte, hauteur: 0.25, style: "annotation" });
  if (formes.length === 0 && points.length === 0) return null;
  const couche: DessinPlan["couche"] = ["dalle", "toiture", "piece", "espace", "zone", "solide"].includes(o.classe) ? "fond" : ["cotation", "texte", "etiquette"].includes(o.classe) ? "annotation" : "objet";
  return { objetId: o.id, couche, formes, segments: segments.map((s) => ({ a: s.a as PointLocal, b: s.b as PointLocal })), points, contour };
}

export const DESSINATEUR_REPLI: DessinateurPlan = { classes: [...CLASSES_REPLI], dessiner: (o) => dessinerRepli(o) };
