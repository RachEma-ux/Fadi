/**
 * Accrochages (DA-02-15, cahier §5.8) : fonction pure `accrocher(demande, candidats, reglages)`. L'accrochage
 * n'est pas une commande : il remplace le point brut du pointeur par un point géométriquement exact (jamais
 * arrondi, R7) et dit lequel a joué. Réglages = préférences d'interface (R10), jamais dans le modèle.
 *
 * Priorité (recommandation DA-02-15) : extrémité > intersection > milieu > point (centre, insertion) >
 * perpendiculaire > sur l'objet > orthogonal (Maj) > grille ; à priorité égale le plus proche, puis
 * l'identifiant d'objet (résultat déterministe).
 */
import { REPERE_LOCAL_PROJET, type IdObjet, type PointLocal } from "@parcours/atelier-model";
import type { Accrochage, DessinPlan, TypeAccrochage } from "../socle";
import { distance, distanceSegment, intersectionSegments, milieu, piedPerpendiculaire, projeterSurSegment, pt, type SegmentPlan, type Vec } from "./geometrie";

export const MODES_ACCROCHAGE = ["extremite", "milieu", "perpendiculaire", "intersection", "orthogonal", "grille", "objet"] as const;
export type ModeAccrochage = (typeof MODES_ACCROCHAGE)[number];

export const LIBELLES_MODE: Record<ModeAccrochage, string> = {
  extremite: "Extrémité",
  milieu: "Milieu",
  perpendiculaire: "Perpendiculaire",
  intersection: "Intersection",
  orthogonal: "Orthogonal",
  grille: "Grille 0,50 m",
  objet: "Objet",
};

export interface ReglagesAccrochage {
  /** Bascule globale (barre des accrochages). */
  readonly actif: boolean;
  readonly modes: Readonly<Record<ModeAccrochage, boolean>>;
  /** Pas de grille en m (cahier §5.8 : 0,50 m conservé du prototype). */
  readonly pasGrille: number;
}

export const REGLAGES_INITIAUX: ReglagesAccrochage = {
  actif: true,
  modes: { extremite: true, milieu: true, perpendiculaire: true, intersection: true, orthogonal: true, grille: true, objet: true },
  pasGrille: 0.5,
};

/** Ce qu'un objet dessiné offre à l'accrochage (extrait de `DessinPlan`). */
export type CandidatAccrochage = Pick<DessinPlan, "objetId" | "segments" | "points">;

export interface DemandeAccrochage {
  /** Point brut du pointeur, en m. */
  readonly point: Vec;
  /** Dernier point posé du geste (orthogonal, perpendiculaire) ; `null` au premier point. */
  readonly reference: Vec | null;
  /** Rayon de capture converti en m au zoom courant. */
  readonly tolerance: number;
  /** Maj maintenue : orthogonal forcé (maquette : « Maintenir Maj pour forcer l'orthogonal »). */
  readonly orthogonal: boolean;
}

export interface ResultatAccrochage {
  readonly point: PointLocal;
  readonly accrochage: Accrochage;
}

type Genre = "extremite" | "intersection" | "milieu" | "point" | "perpendiculaire" | "objet";

const RANG: Record<Genre, number> = { extremite: 0, intersection: 1, milieu: 2, point: 3, perpendiculaire: 4, objet: 5 };

interface Proposition {
  readonly genre: Genre;
  readonly point: Vec;
  readonly objetId: IdObjet;
  readonly d: number;
}

const TYPE_DU_GENRE: Record<Genre, TypeAccrochage> = {
  extremite: "extremite",
  intersection: "intersection",
  milieu: "milieu",
  point: "objet",
  perpendiculaire: "perpendiculaire",
  objet: "objet",
};

const LIBELLE_DU_GENRE: Record<Genre, string> = {
  extremite: "Extrémité",
  intersection: "Intersection",
  milieu: "Milieu",
  point: "Point",
  perpendiculaire: "Perpendiculaire",
  objet: "Sur l'objet",
};

const duProjet = (p: PointLocal): boolean => (p.repereLocal ?? REPERE_LOCAL_PROJET) === REPERE_LOCAL_PROJET;

/** Arrondi au pas de grille (origine et axes du repère local). */
export const surGrille = (v: number, pas: number): number => Math.round(v / pas) * pas;

export function accrocher(demande: DemandeAccrochage, candidats: readonly CandidatAccrochage[], reglages: ReglagesAccrochage): ResultatAccrochage {
  const p = demande.point;
  const brut: ResultatAccrochage = { point: pt(p.x, p.y), accrochage: { type: "aucun", libelle: "" } };
  if (!reglages.actif) return brut;
  const tol = demande.tolerance;
  const m = reglages.modes;
  const props: Proposition[] = [];
  const proches: { s: SegmentPlan; id: IdObjet }[] = [];
  const proposer = (genre: Genre, q: Vec, objetId: IdObjet) => {
    const d = distance(q, p);
    if (d <= tol) props.push({ genre, point: q, objetId, d });
  };

  for (const c of candidats) {
    for (const s of c.segments) {
      if (!duProjet(s.a) || !duProjet(s.b)) continue;
      // Filtre rapide : boîte du segment élargie de la tolérance.
      if (p.x < Math.min(s.a.x, s.b.x) - tol || p.x > Math.max(s.a.x, s.b.x) + tol || p.y < Math.min(s.a.y, s.b.y) - tol || p.y > Math.max(s.a.y, s.b.y) + tol) continue;
      if (m.extremite) {
        proposer("extremite", s.a, c.objetId);
        proposer("extremite", s.b, c.objetId);
      }
      if (m.milieu) proposer("milieu", milieu(s.a, s.b), c.objetId);
      if (distanceSegment(s, p) <= tol) {
        proches.push({ s, id: c.objetId });
        if (m.objet) proposer("objet", projeterSurSegment(s, p), c.objetId);
      }
      if (m.perpendiculaire && demande.reference) {
        const pied = piedPerpendiculaire(s, demande.reference);
        if (pied && distance(pied, demande.reference) > 1e-9) proposer("perpendiculaire", pied, c.objetId);
      }
    }
    if (m.extremite) for (const q of c.points) if (duProjet(q)) proposer("point", q, c.objetId);
  }

  if (m.intersection) {
    for (let i = 0; i < proches.length; i++) {
      for (let j = i + 1; j < proches.length; j++) {
        const a = proches[i] as { s: SegmentPlan; id: IdObjet };
        const b = proches[j] as { s: SegmentPlan; id: IdObjet };
        const x = intersectionSegments(a.s, b.s);
        // Deux segments consécutifs d'un même contour se coupent à leur sommet commun : c'est une extrémité.
        if (x && !(a.id === b.id && [a.s.a, a.s.b].some((e) => [b.s.a, b.s.b].some((f) => distance(e, f) < 1e-9)))) proposer("intersection", x, a.id < b.id ? a.id : b.id);
      }
    }
  }

  if (props.length > 0) {
    props.sort((a, b) => RANG[a.genre] - RANG[b.genre] || a.d - b.d || a.objetId.localeCompare(b.objetId));
    const choix = props[0] as Proposition;
    return { point: pt(choix.point.x, choix.point.y), accrochage: { type: TYPE_DU_GENRE[choix.genre], objetId: choix.objetId, libelle: LIBELLE_DU_GENRE[choix.genre] } };
  }

  const grille = m.grille && reglages.pasGrille > 0;
  if (demande.orthogonal && m.orthogonal && demande.reference) {
    const r = demande.reference;
    const horizontal = Math.abs(p.x - r.x) >= Math.abs(p.y - r.y);
    // Coordonnée libre posée sur la grille si elle est active ; l'autre égale exactement à celle de la référence.
    const q = horizontal ? pt(grille ? surGrille(p.x, reglages.pasGrille) : p.x, r.y) : pt(r.x, grille ? surGrille(p.y, reglages.pasGrille) : p.y);
    return { point: q, accrochage: { type: "orthogonal", libelle: "Orthogonal" } };
  }
  if (grille) return { point: pt(surGrille(p.x, reglages.pasGrille), surGrille(p.y, reglages.pasGrille)), accrochage: { type: "grille", libelle: "Grille" } };
  return brut;
}
