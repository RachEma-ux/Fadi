/**
 * Dessinateurs de plan des classes d'esquisse (`esquisse.*`) et de `reference-plan` (contrat `DessinateurPlan`).
 * La facettisation des arcs, cercles, splines et les traits de hachure sont **dérivés à l'affichage**, jamais
 * stockés (D1 / R15). Les courbes n'offrent pas de segments d'accrochage (leurs facettes donneraient de fausses
 * « extrémités ») : elles offrent leurs points caractéristiques (centre, extrémités, quadrants, sommets).
 */
import { CLASSES_ESQUISSE, type EtatModele, type ObjetModele, type PointLocal } from "@parcours/atelier-model";
import type { DessinateurPlan, DessinPlan, FormeDessin } from "../socle";
import {
  cosSinDeg,
  courbeSpline,
  facettesArc,
  intersectionSegments,
  normaliserAngle,
  pointDansPolygone,
  polaire,
  pt,
  segmentsDe,
  sommetsPolygone,
  sommetsRectangle,
  versPoint,
  type SegmentPlan,
  type Vec,
} from "./geometrie";

/** Demi-longueur d'affichage d'une ligne de construction illimitée (m). */
export const PORTEE_CONSTRUCTION = 1000;
/** Plafond de traits de hachure dessinés par objet (protège le rendu ; fiche DA-01-11 : 100 000 au calcul). */
export const TRAITS_HACHURE_MAX = 5000;

const pts = (v: readonly Vec[]): PointLocal[] => v.map(versPoint);

const dessin = (o: ObjetModele, couche: DessinPlan["couche"], formes: FormeDessin[], segments: SegmentPlan[], points: readonly Vec[], contour: readonly Vec[] | null): DessinPlan => ({
  objetId: o.id,
  couche,
  formes,
  segments: segments.map((s) => ({ a: versPoint(s.a), b: versPoint(s.b) })),
  points: pts(points),
  contour: contour ? pts(contour) : null,
});

/**
 * Traits d'un motif de hachure (lignes parallèles d'angle `angle`, espacées de `espacement`) découpés par le
 * contour et ses trous (règle pair-impair).
 */
export function traitsHachure(contour: readonly Vec[], trous: readonly (readonly Vec[])[], angle: number, espacement: number, max = TRAITS_HACHURE_MAX): SegmentPlan[] {
  if (contour.length < 3 || !(espacement > 0)) return [];
  const [c, s] = cosSinDeg(angle);
  const u = { x: c, y: s };
  const n = { x: -s, y: c };
  const bords = [contour, ...trous].flatMap((p) => segmentsDe(p, true));
  const proj = contour.map((p) => p.x * n.x + p.y * n.y);
  const projU = contour.map((p) => p.x * u.x + p.y * u.y);
  const dMin = Math.min(...proj);
  const dMax = Math.max(...proj);
  const uMin = Math.min(...projU) - 1;
  const uMax = Math.max(...projU) + 1;
  const r: SegmentPlan[] = [];
  for (let k = Math.ceil(dMin / espacement); k * espacement <= dMax && r.length < max; k++) {
    const d = k * espacement;
    const ligne = { a: { x: u.x * uMin + n.x * d, y: u.y * uMin + n.y * d }, b: { x: u.x * uMax + n.x * d, y: u.y * uMax + n.y * d } };
    const ts = bords
      .map((b) => intersectionSegments(ligne, b))
      .filter((x): x is Vec => x !== null)
      .map((x) => x.x * u.x + x.y * u.y)
      .sort((a, b) => a - b);
    for (let i = 0; i + 1 < ts.length && r.length < max; i += 2) {
      const t0 = ts[i] as number;
      const t1 = ts[i + 1] as number;
      if (t1 - t0 <= 1e-9) continue;
      r.push({ a: { x: u.x * t0 + n.x * d, y: u.y * t0 + n.y * d }, b: { x: u.x * t1 + n.x * d, y: u.y * t1 + n.y * d } });
    }
  }
  return r;
}

/** Angles de début et de fin d'un arc ramenés au sens trigonométrique (le contrat de forme n'a pas de sens). */
export function arcTrigo(debut: number, fin: number, sens: "trigo" | "horaire"): { debut: number; fin: number } {
  return sens === "trigo" ? { debut, fin } : { debut: fin, fin: debut };
}

export function dessinerEsquisse(o: ObjetModele): DessinPlan | null {
  switch (o.classe) {
    case "esquisse.ligne": {
      const { a, b } = o.params;
      return dessin(o, "objet", [{ forme: "polyligne", points: [a, b], fermee: false, style: "trait" }], [{ a, b }], [], null);
    }
    case "esquisse.polyligne": {
      const { points, ferme } = o.params;
      return dessin(o, "objet", [{ forme: "polyligne", points, fermee: ferme, style: "trait" }], segmentsDe(points, ferme), [], ferme && points.length >= 3 ? points : null);
    }
    case "esquisse.arc": {
      const p = o.params;
      const r = p.rayon.value;
      const t = arcTrigo(p.angleDebut.value, p.angleFin.value, p.sens);
      const facettes = facettesArc(p.centre, r, t.debut, t.fin, "trigo");
      return dessin(o, "objet", [{ forme: "arc", centre: p.centre, rayon: r, debut: t.debut, fin: t.fin, style: "trait" }], [], [p.centre, polaire(p.centre, r, p.angleDebut.value), polaire(p.centre, r, p.angleFin.value)], [p.centre, ...facettes]);
    }
    case "esquisse.cercle": {
      const { centre, rayon } = o.params;
      const r = rayon.value;
      const quadrants = [0, 90, 180, 270].map((a) => polaire(centre, r, a));
      return dessin(o, "objet", [{ forme: "cercle", centre, rayon: r, style: "trait" }], [], [centre, ...quadrants], facettesArc(centre, r, 0, 360, "trigo").slice(0, -1));
    }
    case "esquisse.rectangle": {
      const p = o.params;
      const s = sommetsRectangle(p.origine, p.largeur.value, p.profondeur.value, p.angle.value);
      return dessin(o, "objet", [{ forme: "polygone", points: pts(s), style: "trait" }], segmentsDe(s, true), [], s);
    }
    case "esquisse.polygone": {
      const p = o.params;
      if (!(Number.isInteger(p.nombreCotes) && p.nombreCotes >= 3)) return null;
      const s = sommetsPolygone(p.centre, p.nombreCotes, p.rayon.value, p.mode, p.angle.value);
      return dessin(o, "objet", [{ forme: "polygone", points: pts(s), style: "trait" }], segmentsDe(s, true), [p.centre], s);
    }
    case "esquisse.spline": {
      const p = o.params;
      const courbe = courbeSpline(p.points, p.mode, p.degre, p.ferme);
      const formes: FormeDessin[] = [{ forme: "polyligne", points: pts(courbe), fermee: p.ferme, style: "trait" }];
      if (p.mode === "controle") formes.push({ forme: "polyligne", points: p.points, fermee: p.ferme, style: "fin" });
      return dessin(o, "objet", formes, [], p.points, p.ferme ? courbe : null);
    }
    case "esquisse.construction": {
      const p = o.params;
      if (p.nature === "axe") {
        const dep = p.depassement?.value ?? 0;
        const l = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
        const k = l > 0 ? dep / l : 0;
        const a = pt(p.a.x - (p.b.x - p.a.x) * k, p.a.y - (p.b.y - p.a.y) * k);
        const b = pt(p.b.x + (p.b.x - p.a.x) * k, p.b.y + (p.b.y - p.a.y) * k);
        return dessin(o, "annotation", [{ forme: "polyligne", points: [a, b], fermee: false, style: "fin" }], [{ a: p.a, b: p.b }], [], null);
      }
      const debut = p.etendue === "droite" ? polaire(p.point, -PORTEE_CONSTRUCTION, p.direction.value) : p.point;
      const fin = polaire(p.point, PORTEE_CONSTRUCTION, p.direction.value);
      return dessin(o, "annotation", [{ forme: "polyligne", points: [debut, fin], fermee: false, style: "fin" }], [{ a: debut, b: fin }], [p.point], null);
    }
    case "esquisse.hachure": {
      const p = o.params;
      const trous = p.trous.map((t) => t.polygone);
      const traits = traitsHachure(p.contour, trous, p.angle.value, p.espacement.value);
      const formes: FormeDessin[] = [
        { forme: "polygone", points: p.contour, style: "hachure" },
        ...trous.map((t): FormeDessin => ({ forme: "polyligne", points: t, fermee: true, style: "trait" })),
        ...traits.map((t): FormeDessin => ({ forme: "polyligne", points: [versPoint(t.a), versPoint(t.b)], fermee: false, style: "fin" })),
      ];
      return dessin(o, "fond", formes, [...segmentsDe(p.contour, true), ...trous.flatMap((t) => segmentsDe(t, true))], [], p.contour);
    }
    default:
      return null;
  }
}

export function dessinerReferencePlan(o: ObjetModele): DessinPlan | null {
  if (o.classe !== "reference-plan" || !o.params.contour) return null;
  const { contour, trous } = o.params.contour;
  const formes: FormeDessin[] = [
    { forme: "polyligne", points: contour, fermee: true, style: "fin" },
    ...trous.map((t): FormeDessin => ({ forme: "polyligne", points: t.polygone, fermee: true, style: "fin" })),
  ];
  return dessin(o, "fond", formes, [...segmentsDe(contour, true), ...trous.flatMap((t) => segmentsDe(t.polygone, true))], [], contour);
}

export const DESSINATEUR_ESQUISSES: DessinateurPlan = { classes: [...CLASSES_ESQUISSE], dessiner: (o) => dessinerEsquisse(o) };
export const DESSINATEUR_REFERENCE_PLAN: DessinateurPlan = { classes: ["reference-plan"], dessiner: (o) => dessinerReferencePlan(o) };

// ---------------------------------------------------------------------------------------------------------------
// Géométrie d'un dessin (touche, aperçu fantôme)
// ---------------------------------------------------------------------------------------------------------------

/** Points d'une forme, facettisée (arc, cercle) : pour la touche et l'emprise. */
export function pointsDeForme(f: FormeDessin): { points: Vec[]; ferme: boolean } {
  switch (f.forme) {
    case "polygone":
      return { points: [...f.points], ferme: true };
    case "polyligne":
      return { points: [...f.points], ferme: f.fermee };
    case "cercle":
      return { points: facettesArc(f.centre, f.rayon, 0, 360, "trigo", Math.max(0.001, f.rayon * 0.01)), ferme: false };
    case "arc":
      return { points: facettesArc(f.centre, f.rayon, f.debut, f.fin, "trigo", Math.max(0.001, f.rayon * 0.01)), ferme: false };
    case "texte":
      return { points: [f.position], ferme: false };
  }
}

/** Image d'un dessin par une transformation de points (aperçu fantôme d'une transformation). */
export function transformerDessin(d: DessinPlan, f: (p: Vec) => Vec, angle: (a: number) => number = (a) => a, retourne = false, facteur = 1): DessinPlan {
  const P = (p: Vec): PointLocal => versPoint(f(p));
  const formes = d.formes.map((x): FormeDessin => {
    switch (x.forme) {
      case "polygone":
        return { ...x, points: x.points.map(P) };
      case "polyligne":
        return { ...x, points: x.points.map(P) };
      case "cercle":
        return { ...x, centre: P(x.centre), rayon: x.rayon * facteur };
      case "arc": {
        const a = normaliserAngle(angle(x.debut));
        const b = normaliserAngle(angle(x.fin));
        return { ...x, centre: P(x.centre), rayon: x.rayon * facteur, debut: retourne ? b : a, fin: retourne ? a : b };
      }
      case "texte":
        return { ...x, position: P(x.position) };
    }
  });
  return { ...d, formes, segments: d.segments.map((s) => ({ a: P(s.a), b: P(s.b) })), points: d.points.map(P), contour: d.contour ? d.contour.map(P) : null };
}

/** Le point est-il à l'intérieur d'un contour fermé du dessin ? */
export const dansContour = (d: DessinPlan, p: Vec): boolean => d.contour !== null && d.contour.length >= 3 && pointDansPolygone(p, d.contour);

/** Dessins d'une liste d'objets (sans filtre de niveau) par un registre ou une fonction de dessin. */
export function dessinerObjets(ids: readonly string[], etat: EtatModele, dessiner: (o: ObjetModele, e: EtatModele) => DessinPlan | null): DessinPlan[] {
  const r: DessinPlan[] = [];
  for (const id of ids) {
    const o = etat.objets[id];
    const d = o ? dessiner(o, etat) : null;
    if (d) r.push(d);
  }
  return r;
}
