/**
 * Volume libre de la vue 3D (A.3-02) : des valeurs saisies aux commandes `studio.solide.*`. Aucune dimension par défaut :
 * un champ vide (NaN) bloque la commande ; l'origine vient du clic sur la grille (repère `local-3d`, z = 0) ou de la
 * saisie, la rotation est saisie en degrés (0 = axes du plan). Le modèle reste seul juge (bornes, profil simple, calque
 * verrouillé). Pur : ni React ni DOM.
 */
import { studioPolylinePath, type StudioCommand, type StudioDocument, type StudioPolyline, type StudioSolid } from "@parcours/atelier-model";

export interface ValeursBoite { x: number; y: number; z: number; rotation: number; largeur: number; profondeur: number; hauteur: number }
export const BOITE_VIDE: ValeursBoite = Object.freeze({ x: Number.NaN, y: Number.NaN, z: Number.NaN, rotation: 0, largeur: Number.NaN, profondeur: Number.NaN, hauteur: Number.NaN });

export interface ValeursPrisme { profil: string; cote: number; hauteur: number; rotation: number }
export const PRISME_VIDE: ValeursPrisme = Object.freeze({ profil: "", cote: Number.NaN, hauteur: Number.NaN, rotation: 0 });

export interface ValeursDeplacement { dx: number; dy: number; dz: number }
export const DEPLACEMENT_VIDE: ValeursDeplacement = Object.freeze({ dx: Number.NaN, dy: Number.NaN, dz: Number.NaN });

export type ResultatVolume = { commandes: StudioCommand[] } | { erreur: string };

/** Degrés saisis → radians dans [0 ; 2π[ ; 0 reste exactement 0. */
export function radians(degres: number): number {
  const d = ((degres % 360) + 360) % 360;
  return d === 0 ? 0 : (d * Math.PI) / 180;
}

/** Point cliqué sur la grille, arrondi au centimètre (la saisie peut le corriger). */
export const auCentimetre = (v: number): number => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

const fini = (...v: number[]) => v.every(Number.isFinite);
const sansCalqueImplicite = (layerId: string | undefined) => (layerId === undefined || layerId === "default" ? {} : { layerId });

export function commandeBoite(v: ValeursBoite, id: string, layerId?: string): ResultatVolume {
  if (!fini(v.x, v.y, v.z)) return { erreur: "Cliquez sur la grille ou saisissez l’origine (x, y, z), en mètres." };
  if (!fini(v.largeur, v.profondeur, v.hauteur)) return { erreur: "Saisissez la largeur, la profondeur et la hauteur, en mètres." };
  if (v.largeur <= 0 || v.profondeur <= 0 || v.hauteur <= 0) return { erreur: "Les dimensions doivent être strictement positives." };
  if (!fini(v.rotation)) return { erreur: "Saisissez la rotation en degrés (0 : axes du plan)." };
  return { commandes: [{ toolId: "studio.solide.boite", params: { id, type: "box", ...sansCalqueImplicite(layerId), placement: { origin: { x: v.x, y: v.y, z: v.z }, rotation: radians(v.rotation) }, width: v.largeur, depth: v.profondeur, height: v.hauteur } }] };
}

/** Polylignes fermées du document : profils possibles d'un prisme. */
export const profilsFermes = (doc: StudioDocument): StudioPolyline[] => doc.objects.filter((o): o is StudioPolyline => o.type === "polyline" && o.closed);

/**
 * Prisme sur le profil d'une polyligne fermée : le contour (discrétisé pour les renflements) est copié, relatif à son
 * premier sommet, qui devient l'origine du solide, posée à la cote saisie. Le solide ne reste pas lié à la polyligne.
 */
export function commandePrisme(doc: StudioDocument, v: ValeursPrisme, id: string, layerId?: string): ResultatVolume {
  const source = profilsFermes(doc).find((p) => p.id === v.profil);
  if (!source) return { erreur: "Choisissez une polyligne fermée comme profil." };
  if (!fini(v.cote, v.hauteur)) return { erreur: "Saisissez la cote de base et la hauteur, en mètres." };
  if (v.hauteur <= 0) return { erreur: "La hauteur doit être strictement positive." };
  if (!fini(v.rotation)) return { erreur: "Saisissez la rotation en degrés (0 : axes du plan)." };
  const ring = studioPolylinePath(source);
  const o = ring[0]!;
  const profile = ring.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
  return { commandes: [{ toolId: "studio.solide.prisme", params: { id, type: "prism", ...sansCalqueImplicite(layerId), placement: { origin: { x: o.x, y: o.y, z: v.cote }, rotation: radians(v.rotation) }, profile, height: v.hauteur } }] };
}

export function commandeDeplacementSolide(id: string | null, v: ValeursDeplacement): ResultatVolume {
  if (!id) return { erreur: "Sélectionnez d’abord, dans la vue 3D, le solide à déplacer." };
  if (!fini(v.dx, v.dy, v.dz)) return { erreur: "Saisissez le déplacement dx, dy, dz, en mètres." };
  return { commandes: [{ toolId: "studio.solide.deplacer", params: { id, dx: v.dx, dy: v.dy, dz: v.dz } }] };
}

/** Description courte d'un solide (panneau de la vue 3D). */
export function descriptionSolide(s: StudioSolid, nombre: (v: number) => string): string {
  return s.type === "box"
    ? `Boîte ${nombre(s.width)} × ${nombre(s.depth)} × ${nombre(s.height)} m`
    : `Prisme sur profil de ${s.profile.length} sommets, hauteur ${nombre(s.height)} m`;
}
