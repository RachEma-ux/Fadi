/**
 * Position de la barre d'actions flottante (D-195) : fonctions pures, sans DOM. La barre est librement déplaçable ;
 * sa seule contrainte est de rester entière dans la zone visible — bornée au relâchement, au redimensionnement, à la
 * rotation et sous le clavier virtuel (zone visuelle). Les coordonnées sont celles du coin haut gauche de la barre,
 * en pixels, dans le repère de la fenêtre (position fixe).
 */
export interface Position {
  x: number;
  y: number;
}

export interface Taille {
  largeur: number;
  hauteur: number;
}

/** Zone visible : largeur et hauteur, et décalage de son coin haut gauche (zone visuelle décalée par le clavier ou le zoom). */
export interface Zone {
  largeur: number;
  hauteur: number;
  gauche?: number;
  haut?: number;
}

/** Marge gardée entre la barre et le bord de l'écran. */
export const MARGE = 4;

/** Ramène `pos` pour que la barre tienne entière dans `zone` ; une barre plus large que la zone se cale au bord gauche / haut. */
export function borner(pos: Position, taille: Taille, zone: Zone, marge = MARGE): Position {
  const g = zone.gauche ?? 0;
  const h = zone.haut ?? 0;
  const xMax = Math.max(g + marge, g + zone.largeur - taille.largeur - marge);
  const yMax = Math.max(h + marge, h + zone.hauteur - taille.hauteur - marge);
  return {
    x: Math.round(Math.min(Math.max(pos.x, g + marge), xMax)),
    y: Math.round(Math.min(Math.max(pos.y, h + marge), yMax)),
  };
}

/** Position par défaut : en bas à droite, au-dessus d'une réserve (barre d'état, onglets du téléphone). */
export function positionParDefaut(taille: Taille, zone: Zone, reserveBas: number, marge = 16): Position {
  const g = zone.gauche ?? 0;
  const h = zone.haut ?? 0;
  return borner({ x: g + zone.largeur - taille.largeur - marge, y: h + zone.hauteur - reserveBas - taille.hauteur - marge }, taille, zone);
}

/** Position mémorisée relue des préférences : seulement deux nombres finis, sinon null (position par défaut). */
export function lirePosition(v: unknown): Position | null {
  if (!v || typeof v !== "object") return null;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y) ? { x, y } : null;
}

/** Déplacement au clavier (flèches) : pas de 16 px, 64 px avec Maj. */
export function pasClavier(touche: string, maj: boolean): Position | null {
  const d = maj ? 64 : 16;
  switch (touche) {
    case "ArrowLeft":
      return { x: -d, y: 0 };
    case "ArrowRight":
      return { x: d, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -d };
    case "ArrowDown":
      return { x: 0, y: d };
    default:
      return null;
  }
}
