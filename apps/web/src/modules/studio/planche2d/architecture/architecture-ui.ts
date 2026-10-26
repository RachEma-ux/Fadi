/**
 * Planche 2D — objets architecturaux (A.4) : paramètres saisis des outils Mur et Ouverture, constructeurs de commandes,
 * désignation d'un mur au pointeur, valeurs d'édition d'un mur ou d'une ouverture sélectionné(e). Pur : ni React ni DOM.
 * Aucune dimension n'est proposée : un champ vide refuse la création avec un message ; la justification et le type
 * d'ouverture sont choisis explicitement (le type peut rester « non déclaré »).
 */
import {
  geometrieEchelle, geometrieMur, lateraux, type StudioArchitectureItem, type StudioCommand, type StudioDocument, type StudioLadder, type StudioOpening, type StudioOpeningKind,
  type StudioPoint, type StudioPolyline, type StudioWall, type StudioWallJustification,
} from "@parcours/atelier-model";

export interface ParametresMur { epaisseur: number; hauteur: number; base: number; justification: StudioWallJustification | "" }
export interface ParametresOuverture { largeur: number; hauteur: number; allege: number; type: StudioOpeningKind | "" }
/** Échelle d'accès (EX-027) : entre-axe, hauteur, cote du pied, nombre d'échelons, section, orientation (degrés). */
export interface ParametresEchelle { largeur: number; hauteur: number; base: number; echelons: number; section: number; orientation: number }
export interface ParametresArchitecture { mur: ParametresMur; ouverture: ParametresOuverture; echelle: ParametresEchelle }

/** Rien n'est proposé : tous les champs sont vides tant que l'utilisateur ne les a pas saisis. */
export const PARAMETRES_ARCHITECTURE_VIDES: ParametresArchitecture = Object.freeze({
  mur: Object.freeze({ epaisseur: Number.NaN, hauteur: Number.NaN, base: Number.NaN, justification: "" as const }),
  ouverture: Object.freeze({ largeur: Number.NaN, hauteur: Number.NaN, allege: Number.NaN, type: "" as const }),
  echelle: Object.freeze({ largeur: Number.NaN, hauteur: Number.NaN, base: Number.NaN, echelons: Number.NaN, section: Number.NaN, orientation: Number.NaN }),
});

export const ERREUR_PARAMETRES_ECHELLE = "Saisissez l’entre-axe, la hauteur, la cote du pied, le nombre d’échelons, la section (m) et l’orientation (degrés) de l’échelle : aucune valeur n’est proposée.";

/** Orientation saisie (degrés) → radians dans [0 ; 2π[. */
export function radiansOrientation(degres: number): number {
  const deuxPi = 2 * Math.PI;
  let r = ((degres * Math.PI) / 180) % deuxPi;
  if (r < 0) r += deuxPi;
  return r >= deuxPi || Object.is(r, -0) ? 0 : r;
}
export const degresOrientation = (radians: number): number => Math.round(((radians * 180) / Math.PI) * 1e9) / 1e9;

/** Échelle d'accès posée au point `position` (milieu du pied) avec les paramètres saisis. */
export function commandeEchelle(c: ContexteArchitecture, position: StudioPoint, p: ParametresEchelle): ResultatArchitecture {
  if (![p.largeur, p.hauteur, p.base, p.echelons, p.section, p.orientation, position.x, position.y].every(fini)) return { erreur: ERREUR_PARAMETRES_ECHELLE };
  const params: StudioLadder = {
    id: c.nouvelId(), type: "ladder", ...(c.layerId ? { layerId: c.layerId } : {}), position: { x: micro(position.x), y: micro(position.y) },
    rotation: radiansOrientation(p.orientation), width: p.largeur, height: p.hauteur, base: p.base, rungs: p.echelons, section: p.section,
  };
  return { commandes: [{ toolId: "studio.architecture.echelle-acces", params }] };
}

export const echellesDu = (doc: StudioDocument | null): StudioLadder[] => (doc?.architecture ?? []).filter((x): x is StudioLadder => x.type === "ladder");

/** Emprises des échelles affichées, comme polylignes fermées portant l'identifiant de l'échelle (accrochage). */
export function contoursEchelles(doc: StudioDocument, visible: (layerId: string | undefined) => boolean): StudioPolyline[] {
  return echellesDu(doc).filter((e) => visible(e.layerId)).map((e) => ({ id: e.id, type: "polyline", points: geometrieEchelle(e).emprise, closed: true }));
}

export const LIBELLES_JUSTIFICATION: Readonly<Record<StudioWallJustification, string>> = { left: "À gauche de l’axe", center: "Centrée sur l’axe", right: "À droite de l’axe" };
export const LIBELLES_TYPE_OUVERTURE: Readonly<Record<StudioOpeningKind, string>> = { porte: "Porte", fenetre: "Fenêtre", baie: "Baie" };

export type ResultatArchitecture = { commandes: StudioCommand[] } | { erreur: string };

export const ERREUR_PARAMETRES_MUR = "Saisissez l’épaisseur, la hauteur et la cote de base du mur (m) et choisissez sa justification : aucune valeur n’est proposée.";
export const ERREUR_PARAMETRES_OUVERTURE = "Saisissez la largeur, la hauteur et l’allège de l’ouverture (m) : aucune valeur n’est proposée.";

const fini = (v: number) => Number.isFinite(v);
/** Arrondi au micromètre (pas de bruit flottant du pointeur dans les commandes). */
const micro = (v: number) => Math.round(v * 1e6) / 1e6;

export interface ContexteArchitecture { nouvelId: () => string; layerId: string | undefined }

/** Mur sur l'axe `axe` avec les paramètres saisis. */
export function commandeMur(c: ContexteArchitecture, axe: readonly StudioPoint[], p: ParametresMur): ResultatArchitecture {
  if (![p.epaisseur, p.hauteur, p.base].every(fini) || !p.justification) return { erreur: ERREUR_PARAMETRES_MUR };
  if (axe.length < 2) return { erreur: "Un mur a deux points d’axe au moins." };
  const params: StudioWall = {
    id: c.nouvelId(), type: "wall", ...(c.layerId ? { layerId: c.layerId } : {}), axis: axe.map((q) => ({ x: q.x, y: q.y })),
    thickness: p.epaisseur, height: p.hauteur, base: p.base, justification: p.justification,
  };
  return { commandes: [{ toolId: "studio.architecture.mur", params }] };
}

/** Ouverture dans le mur `hostId`, son bord de début à `position` le long de l'axe. */
export function commandeOuverture(c: ContexteArchitecture, hostId: string, position: number, p: ParametresOuverture): ResultatArchitecture {
  if (![p.largeur, p.hauteur, p.allege, position].every(fini)) return { erreur: ERREUR_PARAMETRES_OUVERTURE };
  const params: StudioOpening = {
    id: c.nouvelId(), type: "opening", hostId, position: micro(position), width: p.largeur, height: p.hauteur, sill: p.allege, ...(p.type ? { kind: p.type } : {}),
  };
  return { commandes: [{ toolId: "studio.architecture.ouverture", params }] };
}

/** Contours d'emprise des murs affichés, comme polylignes fermées portant l'identifiant du mur (accrochage). */
export function contoursMurs(doc: StudioDocument, visible: (layerId: string | undefined) => boolean): StudioPolyline[] {
  const out: StudioPolyline[] = [];
  for (const w of mursDu(doc)) {
    if (!visible(w.layerId)) continue;
    const g = geometrieMur(w);
    if (g.ok) out.push({ id: w.id, type: "polyline", points: g.valeur.anneau, closed: true });
  }
  return out;
}

export const mursDu = (doc: StudioDocument | null): StudioWall[] => (doc?.architecture ?? []).filter((x): x is StudioWall => x.type === "wall");
export const elementArchitectural = (doc: StudioDocument | null, id: string | null): StudioArchitectureItem | null => (id && doc?.architecture?.find((x) => x.id === id)) || null;

/**
 * Mur désigné au point `p` : un mur dont le **corps** contient le point, à la tolérance près — décalage signé du point
 * (normale à gauche) dans [côté droit ; côté gauche] de `lateraux` : un mur justifié à gauche n'est pas désigné à droite
 * de son axe. Le plus proche du milieu du corps l'emporte ; `abscisse` = distance le long de l'axe du pied de la
 * perpendiculaire. `visible` filtre les calques (affichés et modifiables pour l'outil Ouverture).
 */
export function murSousPoint(doc: StudioDocument, p: StudioPoint, tolerance: number, visible: (layerId: string | undefined) => boolean = () => true): { mur: StudioWall; abscisse: number } | null {
  let meilleur: { mur: StudioWall; abscisse: number; distance: number } | null = null;
  for (const w of mursDu(doc)) {
    if (!visible(w.layerId)) continue;
    const g = geometrieMur(w);
    if (!g.ok) continue;
    const cotes = lateraux(w);
    for (const s of g.valeur.segments) {
      const t = Math.max(0, Math.min(s.longueur, (p.x - s.a.x) * s.d.x + (p.y - s.a.y) * s.d.y));
      const q = { x: s.a.x + s.d.x * t, y: s.a.y + s.d.y * t };
      const u = (p.x - q.x) * s.n.x + (p.y - q.y) * s.n.y;
      const leLong = Math.abs((p.x - q.x) * s.d.x + (p.y - q.y) * s.d.y);
      if (leLong > tolerance || u < cotes.droite - tolerance || u > cotes.gauche + tolerance) continue;
      const distance = Math.abs(u - (cotes.droite + cotes.gauche) / 2);
      if (!meilleur || distance < meilleur.distance) meilleur = { mur: w, abscisse: s.debut + t, distance };
    }
  }
  return meilleur && { mur: meilleur.mur, abscisse: meilleur.abscisse };
}

/** Valeurs d'édition d'un objet architectural (reprises telles que saisies). */
export type EditionArchitecture =
  | { type: "wall"; axe: string; epaisseur: number; hauteur: number; base: number; justification: StudioWallJustification }
  | { type: "opening"; position: number; largeur: number; hauteur: number; allege: number; genre: StudioOpeningKind | "" }
  | { type: "ladder"; pied: string; orientation: number; largeur: number; hauteur: number; base: number; echelons: number; section: number };

export const ecrireAxe = (points: readonly StudioPoint[]): string => points.map((p) => `${p.x} ${p.y}`).join("; ");

export function editionDe(it: StudioArchitectureItem): EditionArchitecture {
  if (it.type === "ladder") {
    return { type: "ladder", pied: ecrireAxe([it.position]), orientation: degresOrientation(it.rotation), largeur: it.width, hauteur: it.height, base: it.base, echelons: it.rungs, section: it.section };
  }
  return it.type === "wall"
    ? { type: "wall", axe: ecrireAxe(it.axis), epaisseur: it.thickness, hauteur: it.height, base: it.base, justification: it.justification }
    : { type: "opening", position: it.position, largeur: it.width, hauteur: it.height, allege: it.sill, genre: it.kind ?? "" };
}

/** Commande Modifier (même identifiant) depuis les valeurs éditées ; `lireAxe` lit le texte « x y ; x y … ». */
export function commandeModifierArchitecture(it: StudioArchitectureItem, e: EditionArchitecture, lireAxe: (t: string) => StudioPoint[] | null): ResultatArchitecture {
  if (it.type === "wall" && e.type === "wall") {
    const axis = lireAxe(e.axe);
    if (!axis || axis.length < 2) return { erreur: "Axe : saisissez deux points au moins, « x y ; x y », en mètres." };
    if (![e.epaisseur, e.hauteur, e.base].every(fini)) return { erreur: ERREUR_PARAMETRES_MUR };
    return { commandes: [{ toolId: "studio.architecture.modifier", params: { ...it, axis, thickness: e.epaisseur, height: e.hauteur, base: e.base, justification: e.justification } }] };
  }
  if (it.type === "opening" && e.type === "opening") {
    if (![e.position, e.largeur, e.hauteur, e.allege].every(fini)) return { erreur: ERREUR_PARAMETRES_OUVERTURE };
    const { kind: _avant, ...reste } = it;
    return { commandes: [{ toolId: "studio.architecture.modifier", params: { ...reste, position: e.position, width: e.largeur, height: e.hauteur, sill: e.allege, ...(e.genre ? { kind: e.genre } : {}) } }] };
  }
  if (it.type === "ladder" && e.type === "ladder") {
    const pied = lireAxe(e.pied);
    if (!pied || pied.length !== 1) return { erreur: "Pied : saisissez un point « x y », en mètres." };
    if (![e.orientation, e.largeur, e.hauteur, e.base, e.echelons, e.section].every(fini)) return { erreur: ERREUR_PARAMETRES_ECHELLE };
    return { commandes: [{ toolId: "studio.architecture.modifier", params: { ...it, position: pied[0]!, rotation: radiansOrientation(e.orientation), width: e.largeur, height: e.hauteur, base: e.base, rungs: e.echelons, section: e.section } }] };
  }
  return { erreur: "Valeurs d’un autre objet." };
}
