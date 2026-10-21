/**
 * Déplacement du pictogramme du menu de la Planche : appui maintenu 2 secondes, puis glisser. Fonctions pures (bornage,
 * côté d'ouverture) et mémoire locale de la position ; aucun accès au DOM autre que le stockage passé en argument.
 */
export interface PositionMenu {
  readonly x: number;
  readonly y: number;
}
export interface Taille {
  readonly largeur: number;
  readonly hauteur: number;
}

/** Durée d'appui avant que le pictogramme se laisse déplacer. */
export const DELAI_APPUI_MS = 2000;
/** Un doigt qui bouge davantage avant la fin du délai ne veut pas déplacer : l'appui est abandonné. */
export const SEUIL_MOUVEMENT_PX = 10;
/** Largeur approximative de la liste (17 rem) pour choisir le côté d'ouverture. */
export const LARGEUR_LISTE_PX = 272;
export const CLE_POSITION_MENU = "sandbox.planche.menu.position";

/** Garde le pictogramme entièrement dans la zone (0,0)–(largeur,hauteur) de la Planche. */
export function bornerPosition(p: PositionMenu, taille: Taille, zone: Taille): PositionMenu {
  const x = Math.min(Math.max(0, p.x), Math.max(0, zone.largeur - taille.largeur));
  const y = Math.min(Math.max(0, p.y), Math.max(0, zone.hauteur - taille.hauteur));
  return { x, y };
}

/** Côté où s'ouvre la liste pour rester visible : vers la droite / la gauche, vers le bas / le haut. */
export function coteOuverture(p: PositionMenu, taille: Taille, zone: Taille): { horizontal: "gauche" | "droite"; vertical: "bas" | "haut" } {
  return {
    horizontal: p.x + LARGEUR_LISTE_PX > zone.largeur && p.x + taille.largeur - LARGEUR_LISTE_PX >= 0 ? "droite" : "gauche",
    vertical: p.y + taille.hauteur / 2 > zone.hauteur / 2 ? "haut" : "bas",
  };
}

export interface StockageMenu {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

export function lirePositionMenu(stockage: StockageMenu | null): PositionMenu | null {
  try {
    const brut = stockage?.getItem(CLE_POSITION_MENU);
    if (!brut) return null;
    const v: unknown = JSON.parse(brut);
    if (typeof v !== "object" || v === null) return null;
    const { x, y } = v as { x?: unknown; y?: unknown };
    return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  } catch {
    return null;
  }
}

export function ecrirePositionMenu(stockage: StockageMenu | null, p: PositionMenu | null): void {
  try {
    if (p === null) stockage?.removeItem(CLE_POSITION_MENU);
    else stockage?.setItem(CLE_POSITION_MENU, JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y) }));
  } catch {
    /* stockage absent ou refusé : la position reste celle de la session */
  }
}

export function stockageLocal(): StockageMenu | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
