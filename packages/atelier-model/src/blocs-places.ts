/**
 * Contenu placé d'une occurrence de bloc (D-078) : les éléments de la définition, avec la transformation composée
 * (position, angle, échelle, miroir) et, pour les blocs imbriqués, celle de chaque niveau d'imbrication. Pur ; une
 * définition absente ou une profondeur excessive arrête la descente (rien n'est inventé).
 */
import { placementOccurrence, pointsArc, type Vec } from "./geometrie.js";
import type { ModeleAtelier } from "./modele.js";
import { pt, type Point2 } from "./unites.js";

export interface ElementPlace {
  classe: string;
  params: Record<string, unknown>;
  /** Point du contenu → point du modèle. */
  tr: (q: Vec) => Vec;
  /** Facteur d'échelle cumulé (rayons, hauteurs). */
  k: number;
  /** Chemin d'imbrication (identifiants de définitions). */
  chemin: string[];
}

interface Placement {
  position: Vec;
  angle: { value: number };
  echelle: number;
  miroir?: boolean;
}

export function contenuPlace(etat: ModeleAtelier, definitionId: string | null, placement: Placement, profondeurMax = 8): ElementPlace[] {
  const out: ElementPlace[] = [];
  const descendre = (defId: string | null, tr: (q: Vec) => Vec, k: number, chemin: string[]) => {
    if (!defId || chemin.length >= profondeurMax || chemin.includes(defId)) return;
    const def = etat.definitions[defId];
    const contenu = (def?.params["contenu"] as { classe: string; params: Record<string, unknown>; definitionId?: string | null }[] | undefined) ?? [];
    for (const e of contenu) {
      if (e.classe === "bloc-occurrence") {
        const p = e.params as unknown as Placement;
        const local = placementOccurrence(p);
        descendre(e.definitionId ?? null, (q) => tr(local(q)), k * (p.echelle ?? 1), [...chemin, defId]);
      } else out.push({ classe: e.classe, params: e.params, tr, k, chemin: [...chemin, defId] });
    }
  };
  descendre(definitionId, placementOccurrence(placement), placement.echelle, []);
  return out;
}


/** Définitions imbriquées dans une définition de bloc, transitivement (elle-même exclue sauf cycle). */
export function definitionsImbriquees(etat: ModeleAtelier, defId: string): Set<string> {
  const vus = new Set<string>();
  const pile = [defId];
  while (pile.length) {
    const d = etat.definitions[pile.pop()!];
    for (const e of ((d?.params["contenu"] as { classe: string; definitionId?: string | null }[] | undefined) ?? [])) {
      if (e.classe === "bloc-occurrence" && e.definitionId && !vus.has(e.definitionId)) {
        vus.add(e.definitionId);
        pile.push(e.definitionId);
      }
    }
  }
  return vus;
}


/**
 * Contours (dans le repère du bloc) d'un poteau ou d'une dalle contenus dans un bloc (D-108) : section rectangulaire
 * orientée du poteau ; contour et trous de la dalle. `null` pour les autres classes.
 */
export function contoursArchitecture(classe: string, params: Record<string, unknown>): { contour: Vec[]; trous: Vec[][] } | null {
  if (classe === "poteau") {
    const q = params as { point?: Vec; largeur?: { value: number }; profondeur?: { value: number }; angle?: { value: number }; formeId?: string; epaisseurProfil?: { value: number }; miroir?: boolean };
    if (!q.point || !q.largeur || !q.profondeur) return null;
    const a = ((q.angle?.value ?? 0) * Math.PI) / 180;
    const u = { x: Math.cos(a), y: Math.sin(a) };
    const n = { x: -u.y, y: u.x };
    const c = (s: number, o: number): Vec => ({ x: q.point!.x + u.x * s + n.x * o, y: q.point!.y + u.y * s + n.y * o });
    // Section retournée (D-146) : axe local y retourné, sens direct rétabli.
    const sec = sectionPoteau(q.formeId ?? "rectangle", q.largeur.value, q.profondeur.value, q.epaisseurProfil?.value ?? null);
    const placee = q.miroir ? sec.map(([s, o]) => [s, -o] as [number, number]).reverse() : sec;
    return { contour: placee.map(([s, o]) => c(s, o)), trous: [] };
  }
  if (classe === "dalle") {
    const q = params as { contour?: Vec[]; trous?: Vec[][] };
    return q.contour && q.contour.length >= 3 ? { contour: q.contour, trous: q.trous ?? [] } : null;
  }
  return null;
}

/**
 * Traits d'une occurrence de bloc dans le modèle (D-102) : polylignes du contenu placé (tracés, contours, axes ;
 * cercles et arcs discrétisés), pour l'accrochage et la sélection au plan.
 */
export function traitsBloc(etat: ModeleAtelier, o: { params: object; definitionId: string | null }): { points: Point2[]; ferme: boolean; courbe?: boolean }[] {
  const out: { points: Point2[]; ferme: boolean; courbe?: boolean }[] = [];
  const P = (v: Vec) => pt(Math.round(v.x * 1e9) / 1e9, Math.round(v.y * 1e9) / 1e9);
  for (const e of contenuPlace(etat, o.definitionId, o.params as unknown as Placement)) {
    const q = e.params as { points?: Vec[]; contour?: Vec[]; a?: Vec; b?: Vec; forme?: string; ferme?: boolean; centre?: Vec | null; rayon?: { value: number } | null; angleDebut?: { value: number } | null; angleFin?: { value: number } | null };
    const archi = contoursArchitecture(e.classe, e.params);
    if (archi) {
      for (const c of [archi.contour, ...archi.trous]) out.push({ points: c.map((v) => P(e.tr(v))), ferme: true });
    } else if (q.centre && q.rayon && (q.forme === "cercle" || q.forme === "arc")) {
      out.push({ points: pointsArc(q.centre, q.rayon.value, q.forme === "arc" ? (q.angleDebut?.value ?? 0) : 0, q.forme === "arc" ? (q.angleFin?.value ?? 360) : 360).map((v) => P(e.tr(v))), ferme: false, courbe: true });
    } else if (Array.isArray(q.points) && q.points.length >= 2) {
      const pts = q.forme === "rectangle" && q.points.length === 2 ? [q.points[0]!, { x: q.points[1]!.x, y: q.points[0]!.y }, q.points[1]!, { x: q.points[0]!.x, y: q.points[1]!.y }] : q.points;
      out.push({ points: pts.map((v) => P(e.tr(v))), ferme: !!q.ferme || q.forme === "polygone" || q.forme === "rectangle" || q.forme === "hachure" });
    } else if (Array.isArray(q.contour) && q.contour.length >= 3) out.push({ points: q.contour.map((v) => P(e.tr(v))), ferme: true });
    else if (q.a && q.b) out.push({ points: [P(e.tr(q.a)), P(e.tr(q.b))], ferme: false });
  }
  return out;
}

/**
 * Sommets d'une occurrence de bloc (D-102), dans l'ordre du contenu, sans doublon : sommets des tracés et contours,
 * extrémités des axes, centres des cercles et arcs. Caractéristiques « sommet[i] » auxquelles une cote se rattache.
 */
export function sommetsBloc(etat: ModeleAtelier, o: { params: object; definitionId: string | null }): Point2[] {
  const out: Point2[] = [];
  const ajouter = (v: Vec) => {
    const p = pt(Math.round(v.x * 1e9) / 1e9, Math.round(v.y * 1e9) / 1e9);
    if (!out.some((x) => Math.abs(x.x - p.x) < 1e-9 && Math.abs(x.y - p.y) < 1e-9)) out.push(p);
  };
  for (const e of contenuPlace(etat, o.definitionId, o.params as unknown as Placement)) {
    const q = e.params as { points?: Vec[]; contour?: Vec[]; a?: Vec; b?: Vec; point?: Vec; forme?: string; centre?: Vec | null };
    const archi = contoursArchitecture(e.classe, e.params);
    if (archi) for (const v of archi.contour) ajouter(e.tr(v));
    else if (q.centre && (q.forme === "cercle" || q.forme === "arc" || q.forme === "ellipse")) ajouter(e.tr(q.centre));
    else if (Array.isArray(q.points) && q.points.length) {
      const pts = q.forme === "rectangle" && q.points.length === 2 ? [q.points[0]!, { x: q.points[1]!.x, y: q.points[0]!.y }, q.points[1]!, { x: q.points[0]!.x, y: q.points[1]!.y }] : q.points;
      for (const v of pts) ajouter(e.tr(v));
    } else if (Array.isArray(q.contour)) for (const v of q.contour) ajouter(e.tr(v));
    else if (q.a && q.b) {
      ajouter(e.tr(q.a));
      ajouter(e.tr(q.b));
    } else if (q.point) ajouter(e.tr(q.point));
  }
  return out;
}

/**
 * Section d'un poteau dans son repère propre (D-139), centrée sur la boîte largeur × profondeur, sens direct : rectangle,
 * cercle (diamètre = largeur, 32 côtés), profilés I, T, L, U d'épaisseur de paroi t (sans épaisseur : rectangle).
 */
export function sectionPoteau(forme: string, l: number, p: number, t: number | null): [number, number][] {
  const x = l / 2;
  const y = p / 2;
  if (forme === "cercle" || forme === "rond") return Array.from({ length: 32 }, (_, k) => [x * Math.cos((2 * Math.PI * k) / 32), x * Math.sin((2 * Math.PI * k) / 32)] as [number, number]);
  if (t && t > 0) {
    const h = t / 2;
    if (forme === "I") return [[-x, -y], [x, -y], [x, -y + t], [h, -y + t], [h, y - t], [x, y - t], [x, y], [-x, y], [-x, y - t], [-h, y - t], [-h, -y + t], [-x, -y + t]];
    if (forme === "T") return [[-h, -y], [h, -y], [h, y - t], [x, y - t], [x, y], [-x, y], [-x, y - t], [-h, y - t]];
    if (forme === "L") return [[-x, -y], [x, -y], [x, -y + t], [-x + t, -y + t], [-x + t, y], [-x, y]];
    if (forme === "U") return [[-x, -y], [x, -y], [x, y], [x - t, y], [x - t, -y + t], [-x + t, -y + t], [-x + t, y], [-x, y]];
  }
  return [[-x, -y], [x, -y], [x, y], [-x, y]];
}
