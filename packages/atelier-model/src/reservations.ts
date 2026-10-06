/**
 * Réservations fines (verrous logiques, lot 7 ; D-143, DA-21-01) : clés d'un objet (`<id>`), d'un niveau
 * (`niveau:<id>`) ou d'une zone (`zone:<id>`). Un lot touche une zone quand un objet créé, modifié ou supprimé a,
 * avant ou après, au moins un point caractéristique dans le contour de la zone (bord compris), sur le niveau de
 * la zone. Pur : le serveur compare ces clés aux verrous tenus par d'autres.
 */
import { pointDansPolygone, projectionSurSegment, type Vec } from "./geometrie.js";
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque } from "./modele.js";

/** Points caractéristiques d'un objet en plan (extrémités, sommets, centre, point d'insertion). */
export function pointsCaracteristiques(etat: ModeleAtelier, o: OccurrenceQuelconque): Vec[] {
  const p = o.params as unknown as Record<string, unknown>;
  switch (o.classe) {
    case "mur":
    case "escalier":
    case "cotation":
      return [o.params.a, o.params.b];
    case "porte":
    case "fenetre":
    case "ouverture": {
      const m = etat.objets[o.params.murHoteId];
      if (!m || m.classe !== "mur") return [];
      const { a, b } = m.params;
      return [{ x: a.x + (b.x - a.x) * o.params.position, y: a.y + (b.y - a.y) * o.params.position }];
    }
    case "poteau":
      return [o.params.point];
    case "bloc-occurrence":
      return [o.params.position];
    case "espace":
      return o.params.polygones.flatMap((g) => g.contour);
    default: {
      const pts: Vec[] = [];
      for (const k of ["contour", "points", "empreinte"]) if (Array.isArray(p[k])) pts.push(...(p[k] as Vec[]));
      for (const k of ["centre", "position", "point"]) if (p[k] && typeof p[k] === "object" && "x" in (p[k] as object)) pts.push(p[k] as Vec);
      return pts;
    }
  }
}

/** Le point est dans le contour ou sur son bord. */
function dansOuSurBord(q: Vec, z: readonly Vec[]): boolean {
  return pointDansPolygone(q, z) || z.some((a, i) => projectionSurSegment(q, a, z[(i + 1) % z.length]!).distance < 1e-6);
}

/** Zones (classe `zone`) du même niveau qui contiennent au moins un point caractéristique de l'objet. */
export function zonesTouchant(etat: ModeleAtelier, o: OccurrenceQuelconque): string[] {
  const pts = pointsCaracteristiques(etat, o);
  if (!pts.length) return [];
  const out: string[] = [];
  for (const z of Object.values(etat.objets)) {
    if (z.classe !== "zone" || z.niveauId !== o.niveauId) continue;
    const contour = (z as Occurrence<"zone">).params.contour;
    if (z.id === o.id || pts.some((q) => dansOuSurBord(q, contour))) out.push(z.id);
  }
  return out;
}

/**
 * Clés de réservation concernées par des objets touchés : l'objet, son niveau et les zones qui le contiennent,
 * avant et après le lot (un objet sorti d'une zone réservée, ou entré dedans, la concerne).
 */
export function clesReservation(avant: ModeleAtelier, apres: ModeleAtelier, touches: readonly string[]): string[] {
  const cles = new Set<string>();
  for (const id of touches) {
    cles.add(id);
    for (const etat of [avant, apres]) {
      const o = etat.objets[id];
      if (!o) continue;
      if (o.niveauId) cles.add(`niveau:${o.niveauId}`);
      for (const z of zonesTouchant(etat, o)) cles.add(`zone:${z}`);
    }
  }
  return [...cles].sort();
}

/** Clé connue du modèle : objet, `niveau:` d'un niveau, `zone:` d'une zone. */
export function cleReservationConnue(etat: ModeleAtelier, cle: string): boolean {
  if (cle.startsWith("niveau:")) return !!etat.niveaux[cle.slice(7)];
  if (cle.startsWith("zone:")) return etat.objets[cle.slice(5)]?.classe === "zone";
  return !!etat.objets[cle];
}

/** Libellé lisible d'une clé : « l'étage RDC », « la zone Nord », « l'objet w1 ». */
export function libelleCleReservation(etat: ModeleAtelier | null, cle: string): string {
  if (cle.startsWith("niveau:")) return `l'étage ${etat?.niveaux[cle.slice(7)]?.nom ?? cle.slice(7)}`;
  if (cle.startsWith("zone:")) {
    const z = etat?.objets[cle.slice(5)];
    return `la zone ${(z?.classe === "zone" ? (z as Occurrence<"zone">).params.nom : null) || cle.slice(5)}`;
  }
  return `l'objet ${cle}`;
}
