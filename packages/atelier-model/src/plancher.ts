/**
 * Propositions de plancher d'un niveau (D-069, fiche DA-07-05). Pures, jamais écrites dans le modèle : le contour
 * vient de la face extérieure des axes de murs du niveau (même graphe que la détection de pièces), porté sur la
 * ligne de rive choisie explicitement (axe de référence des murs ou face extérieure, sans valeur par défaut, R3) ;
 * les trémies viennent de l'emprise des escaliers qui arrivent à ce niveau depuis un niveau inférieur (une par
 * groupe d'escaliers, enveloppe convexe des volées du groupe, sans marge ajoutée). Murs non fermés : aucun contour
 * pour la boucle ouverte, interstices listés avec la jonction proposée. Les planchers existants qui s'écartent de
 * la proposition sont signalés, jamais corrigés seuls (R12).
 */
import { aireSignee, axesDesMurs, contoursExterieurs, longueurAxeMur, pointAxeMur, projectionSurAxeMur, cross, decalerContourCotes, dot, facesMur, memePoint, perp, normalise, pointDansPolygone, sub, type AxeMur, type Vec } from "./geometrie.js";
import type { ModeleAtelier, Occurrence } from "./modele.js";
import { empriseEscalier } from "./commandes/tremie.js";
import { pt, type Point2 } from "./unites.js";

export const RIVES_PLANCHER = ["axe", "exterieur"] as const;
export type RivePlancher = (typeof RIVES_PLANCHER)[number];

export interface PropositionTremie {
  escaliers: string[];
  groupe: string | null;
  contour: Point2[];
}

export interface PropositionContourPlancher {
  contour: Point2[];
  murs: string[];
  aire: number;
  /** Trémies dont l'emprise tient dans ce contour. */
  trous: PropositionTremie[];
}

export interface IntersticeMurs {
  murId: string;
  point: Point2;
  /** Mur libre le plus proche (extrémité libre) et la distance entre les deux extrémités, s'il existe. */
  voisinId: string | null;
  distance: number | null;
}

export interface EcartPlancher {
  dalleId: string;
  /** Le contour de la dalle ne suit plus la proposition qui la recouvre. */
  contourDifferent: boolean;
  /** Trémies proposées absentes des trous de la dalle. */
  tremiesAbsentes: PropositionTremie[];
  /** Proposition de contour qui recouvre la dalle (indice dans `contours`), ou null. */
  proposition: number | null;
}

export interface PropositionsPlancher {
  rive: RivePlancher;
  contours: PropositionContourPlancher[];
  /** Trémies hors de tout contour proposé. */
  tremiesIsolees: PropositionTremie[];
  interstices: IntersticeMurs[];
  /** Planchers (dalles d'usage « plancher ») du niveau et leurs écarts ; plus d'un : signalé par `plusieurs`. */
  planchers: EcartPlancher[];
  plusieurs: boolean;
}

const arrondi = (v: number) => Math.round(v * 1e6) / 1e6;

function enveloppeConvexe(points: readonly Vec[]): Point2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p.map((q) => pt(q.x, q.y));
  const bas: Vec[] = [];
  for (const q of p) {
    while (bas.length >= 2 && cross(sub(bas[bas.length - 1]!, bas[bas.length - 2]!), sub(q, bas[bas.length - 2]!)) <= 1e-12) bas.pop();
    bas.push(q);
  }
  const haut: Vec[] = [];
  for (const q of [...p].reverse()) {
    while (haut.length >= 2 && cross(sub(haut[haut.length - 1]!, haut[haut.length - 2]!), sub(q, haut[haut.length - 2]!)) <= 1e-12) haut.pop();
    haut.push(q);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)].map((q) => pt(arrondi(q.x), arrondi(q.y)));
}

/** Trémies proposées pour le plancher d'un niveau : escaliers arrivant à ce niveau depuis un niveau inférieur. */
export function tremiesProposees(etat: ModeleAtelier, niveauId: string): PropositionTremie[] {
  const n = etat.niveaux[niveauId];
  if (!n) return [];
  const escaliers = (Object.values(etat.objets) as Occurrence<"escalier">[])
    .filter((o) => o.classe === "escalier" && o.params.niveauArriveeId === niveauId && (etat.niveaux[o.params.niveauDepartId]?.elevation ?? Infinity) < n.elevation)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const parGroupe = new Map<string, Occurrence<"escalier">[]>();
  const seuls: PropositionTremie[] = [];
  for (const e of escaliers) {
    if (Math.hypot(e.params.b.x - e.params.a.x, e.params.b.y - e.params.a.y) < 1e-9) continue;
    if (e.params.groupe) parGroupe.set(e.params.groupe, [...(parGroupe.get(e.params.groupe) ?? []), e]);
    else seuls.push({ escaliers: [e.id], groupe: null, contour: empriseEscalier(e) });
  }
  const groupes = [...parGroupe.entries()].map(([g, liste]) => ({ escaliers: liste.map((e) => e.id), groupe: g, contour: liste.length === 1 ? empriseEscalier(liste[0]!) : enveloppeConvexe(liste.flatMap((e) => empriseEscalier(e))) }));
  return [...seuls, ...groupes];
}

const murs = (etat: ModeleAtelier, niveauId: string) => (Object.values(etat.objets) as Occurrence<"mur">[]).filter((o) => o.classe === "mur" && o.niveauId === niveauId).sort((a, b) => (a.id < b.id ? -1 : 1));

/** Extrémités de murs libres (ni sur une autre extrémité, ni sur un autre axe), avec l'extrémité libre la plus proche. */
export function intersticesMurs(etat: ModeleAtelier, niveauId: string, tol = 1e-6): IntersticeMurs[] {
  const ms = murs(etat, niveauId);
  const libres: { murId: string; point: Point2 }[] = [];
  for (const w of ms) {
    for (const p of [w.params.a, w.params.b]) {
      const lie = ms.some((v) => v.id !== w.id && (memePoint(p, v.params.a, tol) || memePoint(p, v.params.b, tol) || projectionSurAxeMur(p, v.params).distance <= tol));
      if (!lie) libres.push({ murId: w.id, point: pt(p.x, p.y) });
    }
  }
  return libres.map((l) => {
    let voisin: { murId: string; d: number } | null = null;
    for (const autre of libres) {
      if (autre.murId === l.murId) continue;
      const d = Math.hypot(autre.point.x - l.point.x, autre.point.y - l.point.y);
      if (!voisin || d < voisin.d) voisin = { murId: autre.murId, d };
    }
    return { murId: l.murId, point: l.point, voisinId: voisin?.murId ?? null, distance: voisin ? arrondi(voisin.d) : null };
  });
}

/** Décalage vers l'extérieur de chaque côté jusqu'à la face extérieure de son mur. */
function decalagesFaceExterieure(contour: readonly Vec[], cotes: readonly string[], etat: ModeleAtelier): number[] {
  return contour.map((a, i) => {
    const w = etat.objets[cotes[i]!] as Occurrence<"mur"> | undefined;
    if (!w) return 0;
    const b = contour[(i + 1) % contour.length]!;
    const u = normalise(sub(b, a));
    const exterieur = { x: u.y, y: -u.x };
    if (w.params.renflement) {
      // Mur courbe (D-096) : côté de la face d'après la tangente locale, décalage selon l'alignement.
      const e = w.params.epaisseur.value;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const t = pointAxeMur(w.params, projectionSurAxeMur(m, w.params).t * longueurAxeMur(w.params)).u;
      const gauche = dot(perp(t), exterieur) > 0;
      const al = w.params.alignement;
      return gauche ? (al === "axe" ? e / 2 : al === "gauche" ? 0 : e) : al === "axe" ? e / 2 : al === "gauche" ? e : 0;
    }
    const f = facesMur(w.params.a, w.params.b, w.params.epaisseur.value, w.params.alignement);
    const nGauche = perp(normalise(sub(w.params.b, w.params.a)));
    const face = dot(nGauche, exterieur) > 0 ? f.gauche : f.droite;
    return dot(sub(face[0], w.params.a), exterieur);
  });
}

const memeContour = (c1: readonly Vec[], c2: readonly Vec[], tol = 1e-6) => c1.length === c2.length && c1.every((p) => c2.some((q) => memePoint(p, q, tol)));

/** Propositions de plancher du niveau, sur la ligne de rive choisie. Le modèle n'est pas modifié. */
export function proposerPlancher(etat: ModeleAtelier, niveauId: string, rive: RivePlancher): PropositionsPlancher {
  const ms = murs(etat, niveauId);
  const axes: AxeMur[] = axesDesMurs(ms);
  const tremies = tremiesProposees(etat, niveauId);
  const placees = new Set<PropositionTremie>();
  const contours: PropositionContourPlancher[] = [];
  for (const c of contoursExterieurs(axes)) {
    const contour = rive === "axe" ? c.contour.map((p) => pt(arrondi(p.x), arrondi(p.y))) : decalerContourCotes(c.contour, decalagesFaceExterieure(c.contour, c.cotes, etat))?.map((p) => pt(arrondi(p.x), arrondi(p.y)));
    if (!contour) continue;
    const trous = tremies.filter((t) => !placees.has(t) && t.contour.every((q) => pointDansPolygone(q, contour)));
    for (const t of trous) placees.add(t);
    contours.push({ contour, murs: c.murs, aire: arrondi(Math.abs(aireSignee(contour))), trous });
  }
  const dalles = (Object.values(etat.objets) as Occurrence<"dalle">[]).filter((o) => o.classe === "dalle" && o.niveauId === niveauId && o.params.usage === "plancher").sort((a, b) => (a.id < b.id ? -1 : 1));
  const planchers: EcartPlancher[] = dalles.map((d) => {
    const centre = d.params.contour.reduce((s, q) => ({ x: s.x + q.x / d.params.contour.length, y: s.y + q.y / d.params.contour.length }), { x: 0, y: 0 });
    const i = contours.findIndex((c) => pointDansPolygone(centre, c.contour) || memeContour(c.contour, d.params.contour));
    const prop = i >= 0 ? contours[i]! : null;
    return {
      dalleId: d.id,
      contourDifferent: prop ? !memeContour(prop.contour, d.params.contour) : false,
      tremiesAbsentes: prop ? prop.trous.filter((t) => !d.params.trous.some((h) => memeContour(h, t.contour))) : [],
      proposition: i >= 0 ? i : null,
    };
  });
  return { rive, contours, tremiesIsolees: tremies.filter((t) => !placees.has(t)), interstices: intersticesMurs(etat, niveauId), planchers, plusieurs: dalles.length > 1 };
}
