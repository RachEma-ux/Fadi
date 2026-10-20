/**
 * Disposition des barres d'opérations flottantes de la Planche (D-198) : fonctions pures, sans DOM. Même approche que
 * la barre d'actions (D-195, `barre-actions-position.ts`, dont `borner` est repris) : une barre est librement
 * déplaçable et reste toujours entière dans la zone visible. Au téléphone (≤ 760 px de large), une barre affichée se
 * range en bas de l'écran, au-dessus du volet, une seule à la fois (la dernière affichée).
 */
import { borner, lirePosition, type Position, type Taille, type Zone } from "../panneaux/barre-actions-position";

export type { Position, Taille, Zone };

/** Largeur (px) jusqu'à laquelle l'écran est un téléphone (même seuil que la Planche, D-192). */
export const LARGEUR_TELEPHONE = 760;
export const estTelephone = (largeur: number): boolean => largeur <= LARGEUR_TELEPHONE;

/** État mémorisé des barres : outils dont la barre est affichée (ordre d'affichage) et positions déplacées. */
export interface EtatBarresOutils {
  visibles: string[];
  positions: Record<string, Position>;
}

export const BARRES_OUTILS_DEFAUT: EtatBarresOutils = { visibles: [], positions: {} };

/** Relecture défensive des préférences : identifiants connus seulement (`connu`), positions à deux nombres finis. */
export function lireBarresOutils(v: unknown, connu: (id: string) => boolean = () => true): EtatBarresOutils {
  if (!v || typeof v !== "object") return { visibles: [], positions: {} };
  const { visibles, positions } = v as { visibles?: unknown; positions?: unknown };
  const ids = Array.isArray(visibles) ? visibles.filter((x): x is string => typeof x === "string" && connu(x)) : [];
  const pos: Record<string, Position> = {};
  if (positions && typeof positions === "object") {
    for (const [id, p] of Object.entries(positions as Record<string, unknown>)) {
      const q = lirePosition(p);
      if (q && connu(id)) pos[id] = q;
    }
  }
  return { visibles: [...new Set(ids)], positions: pos };
}

/** Affiche ou masque la barre d'un outil ; une barre affichée passe en dernier (c'est elle que le téléphone montre). */
export function basculerBarre(e: EtatBarresOutils, id: string, afficher: boolean): EtatBarresOutils {
  const reste = e.visibles.filter((x) => x !== id);
  return { ...e, visibles: afficher ? [...reste, id] : reste };
}

/** Mémorise la position d'une barre. */
export function placerBarre(e: EtatBarresOutils, id: string, p: Position): EtatBarresOutils {
  const c = e.positions[id];
  if (c && c.x === p.x && c.y === p.y) return e;
  return { ...e, positions: { ...e.positions, [id]: p } };
}

/** « Réinitialiser la disposition » : les barres restent affichées, toutes reviennent à leur position par défaut. */
export function reinitialiserDisposition(e: EtatBarresOutils): EtatBarresOutils {
  return { ...e, positions: {} };
}

/** Barres rendues : toutes au bureau ; au téléphone, la dernière affichée seulement. */
export function barresRendues(e: EtatBarresOutils, telephone: boolean): string[] {
  if (!telephone) return e.visibles;
  const derniere = e.visibles[e.visibles.length - 1];
  return derniere ? [derniere] : [];
}

/** Écart vertical entre deux barres empilées à leur position par défaut. */
export const ECART_BARRES = 8;

/**
 * Position par défaut au bureau : empilées dans l'ordre d'affichage (`rang`), sous la barre du haut (`reserveHaut`) et à
 * droite du rail d'outils (`reserveGauche`), ramenées dans la zone.
 */
export function positionDefautBarre(rang: number, taille: Taille, zone: Zone, reserves: { haut: number; gauche: number }): Position {
  const g = zone.gauche ?? 0;
  const h = zone.haut ?? 0;
  return borner({ x: g + reserves.gauche, y: h + reserves.haut + rang * (taille.hauteur + ECART_BARRES) }, taille, zone);
}

/**
 * Téléphone : barre rangée en bas, juste au-dessus du volet (`reserveBas` : hauteur occupée en bas de la zone), sur
 * toute la largeur disponible ; elle reste entière dans la zone (une barre trop large défile dans sa propre boîte).
 */
export function positionDocquee(taille: Taille, zone: Zone, reserveBas: number, marge = 4): Position {
  const g = zone.gauche ?? 0;
  const h = zone.haut ?? 0;
  return borner({ x: g + marge, y: h + zone.hauteur - reserveBas - taille.hauteur - marge }, taille, zone, marge);
}

export { borner };
