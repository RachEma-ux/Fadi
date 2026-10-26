/**
 * Surfaces libres NURBS dans la vue 3D (X.1-05) — la part pure des formulaires, sans React ni three.js :
 *
 * - `commandeSurfacePlane` : « Surface NURBS » (Ctrl+F8) — grille plane de pôles saisie (origine, largeur selon x,
 *   profondeur selon y, nombres de pôles, degrés) ; aucune valeur proposée (R3) : un champ vide refuse la création ;
 * - `commandeModifierPole` : « Modifier la surface » (Ctrl+F9) — un pôle (ligne i, colonne j) déplacé à la position
 *   saisie, et son poids ; même identité de surface, les autres pôles inchangés (édition des points de contrôle) ;
 * - descriptions pour la liste des surfaces.
 *
 * L'épaississement (Shift+F11) passe par `exact/epaississement-session.ts` (noyau exact dans son Worker).
 */
import { STUDIO_LIMITES_SURFACES, studioAireApprocheeSurface, studioAireSubdivision, studioVolumeSubdivision, type StudioCommand, type StudioSurfaceLibre, type StudioSurfaceSubdivision } from "@parcours/atelier-model";

export interface ValeursSurface {
  x: number; y: number; z: number;
  largeur: number; profondeur: number;
  lignes: number; colonnes: number;
  degreU: number; degreV: number;
}
export const SURFACE_VIDE: ValeursSurface = Object.freeze({
  x: Number.NaN, y: Number.NaN, z: Number.NaN, largeur: Number.NaN, profondeur: Number.NaN, lignes: Number.NaN, colonnes: Number.NaN, degreU: Number.NaN, degreV: Number.NaN,
});

export type ResultatSurface = { commandes: StudioCommand[] } | { erreur: string };

const fini = (v: number) => Number.isFinite(v);
const entier = (v: number) => Number.isInteger(v);

/** « Surface NURBS » : grille plane de lignes × colonnes pôles, ligne i le long de x, colonne j le long de y (normale +z). */
export function commandeSurfacePlane(v: ValeursSurface, id: string, layerId?: string): ResultatSurface {
  if (![v.x, v.y, v.z, v.largeur, v.profondeur, v.lignes, v.colonnes, v.degreU, v.degreV].every(fini)) return { erreur: "Saisissez l’origine, les dimensions, les nombres de pôles et les degrés : aucune valeur n’est proposée." };
  if (!(v.largeur > 0) || !(v.profondeur > 0)) return { erreur: "La largeur et la profondeur doivent être strictement positives." };
  const L = STUDIO_LIMITES_SURFACES;
  if (![v.lignes, v.colonnes].every((n) => entier(n) && n >= 2 && n <= L.cotes)) return { erreur: `Les nombres de pôles sont des entiers de 2 à ${L.cotes}.` };
  if (!entier(v.degreU) || !entier(v.degreV) || v.degreU < 1 || v.degreV < 1 || v.degreU > Math.min(L.degre, v.lignes - 1) || v.degreV > Math.min(L.degre, v.colonnes - 1)) {
    return { erreur: `Le degré d’un sens est un entier de 1 au nombre de pôles de ce sens moins un (${L.degre} au plus).` };
  }
  const controle = [];
  // i le long de x, j le long de y : la normale ∂S/∂u × ∂S/∂v = x × y = +z (côté « normale » de l'épaississement : dessus).
  for (let i = 0; i < v.lignes; i++) for (let j = 0; j < v.colonnes; j++) {
    controle.push({ x: v.x + (v.largeur * i) / (v.lignes - 1), y: v.y + (v.profondeur * j) / (v.colonnes - 1), z: v.z });
  }
  // Le calque implicite (« default ») est omis, comme pour les solides libres.
  const surface: StudioSurfaceLibre = { id, type: "surface-libre", ...(layerId && layerId !== "default" ? { layerId } : {}), degreU: v.degreU, degreV: v.degreV, lignes: v.lignes, colonnes: v.colonnes, controle };
  return { commandes: [{ toolId: "studio.surface.nurbs", params: surface }] };
}

export interface ValeursPole { i: number; j: number; x: number; y: number; z: number; poids: number }

/** Valeurs actuelles du pôle (i, j) d'une surface (position et poids), pour pré-remplir le formulaire d'édition. */
export function valeursPole(s: StudioSurfaceLibre, i: number, j: number): ValeursPole {
  const k = i * s.colonnes + j, p = s.controle[k]!;
  return { i, j, x: p.x, y: p.y, z: p.z, poids: s.poids?.[k] ?? 1 };
}

/** « Modifier la surface » : le pôle (i, j) prend la position et le poids saisis ; les autres pôles et poids sont gardés. */
export function commandeModifierPole(s: StudioSurfaceLibre | null, v: ValeursPole): ResultatSurface {
  if (!s) return { erreur: "Sélectionnez d’abord la surface à modifier." };
  if (!entier(v.i) || !entier(v.j) || v.i < 0 || v.j < 0 || v.i >= s.lignes || v.j >= s.colonnes) return { erreur: "Choisissez le pôle à modifier (ligne et colonne)." };
  if (![v.x, v.y, v.z, v.poids].every(fini)) return { erreur: "Saisissez la position (x, y, z) et le poids du pôle." };
  if (!(v.poids > 0)) return { erreur: "Le poids d’un pôle est strictement positif." };
  const k = v.i * s.colonnes + v.j;
  const controle = s.controle.map((p, n) => (n === k ? { x: v.x, y: v.y, z: v.z } : p));
  const poids = s.poids ? s.poids.map((w, n) => (n === k ? v.poids : w)) : v.poids === 1 ? undefined : s.controle.map((_, n) => (n === k ? v.poids : 1));
  const { poids: _ancien, ...sans } = s;
  return { commandes: [{ toolId: "studio.surface.modifier", params: { ...sans, controle, ...(poids ? { poids } : {}) } }] };
}

/** Description d'une surface pour la liste et les sélecteurs. */
export function descriptionSurface(s: StudioSurfaceLibre, nombre: (v: number) => string): string {
  const rationnelle = s.poids?.some((w) => w !== 1) ? "rationnelle" : "non rationnelle";
  return `Surface NURBS ${s.lignes} × ${s.colonnes} pôles, degrés ${s.degreU} × ${s.degreV}, ${rationnelle} · aire approchée ${nombre(studioAireApprocheeSurface(s))} m²`;
}

// ——— Surfaces de subdivision (X.1-05) ———

/**
 * Lit un maillage de contrôle saisi au clavier : sommets « x y z » séparés par « ; » (mètres), faces « i j k »
 * séparées par « ; » (numéros de sommets à partir de 1, sens direct vers l'extérieur). Rien n'est complété d'office.
 */
export function lireMaillageControle(sommets: string, faces: string): { sommets: { x: number; y: number; z: number }[]; faces: [number, number, number][] } | { erreur: string } {
  const morceaux = (t: string) => t.split(";").map((m) => m.trim()).filter((m) => m.length > 0).map((m) => m.split(/\s+/).map((x) => Number(x.replace(",", "."))));
  const s = morceaux(sommets), f = morceaux(faces);
  if (s.length < 3 || s.some((p) => p.length !== 3 || !p.every(Number.isFinite))) return { erreur: "Saisissez les sommets « x y z » séparés par « ; » (trois sommets au moins), en mètres." };
  if (!f.length || f.some((t) => t.length !== 3 || !t.every((n) => Number.isInteger(n) && n >= 1 && n <= s.length))) return { erreur: "Saisissez les faces triangulaires « i j k » séparées par « ; » (numéros de sommets à partir de 1)." };
  return { sommets: s.map(([x, y, z]) => ({ x: x!, y: y!, z: z! })), faces: f.map(([a, b, c]) => [a! - 1, b! - 1, c! - 1] as [number, number, number]) };
}

/** « Surface de subdivision » : maillage de contrôle saisi et niveau de Loop (0 à 4) saisi. */
export function commandeSubdivision(sommets: string, faces: string, niveau: number, id: string, layerId?: string): ResultatSurface {
  const m = lireMaillageControle(sommets, faces);
  if ("erreur" in m) return m;
  if (!Number.isInteger(niveau) || niveau < 0 || niveau > 4) return { erreur: "Saisissez le niveau de subdivision : un entier de 0 à 4." };
  const s: StudioSurfaceSubdivision = { id, type: "surface-subdivision", ...(layerId && layerId !== "default" ? { layerId } : {}), sommets: m.sommets, faces: m.faces, niveau };
  return { commandes: [{ toolId: "studio.subdivision.creer", params: s }] };
}

export interface ValeursSommet { k: number; x: number; y: number; z: number; niveau: number }

export const valeursSommet = (s: StudioSurfaceSubdivision, k: number): ValeursSommet => ({ k, ...s.sommets[k]!, niveau: s.niveau });

/** « Modifier la surface » sur une surface de subdivision : le sommet k prend la position saisie, et le niveau saisi. */
export function commandeModifierSommet(s: StudioSurfaceSubdivision | null, v: ValeursSommet): ResultatSurface {
  if (!s) return { erreur: "Sélectionnez d’abord la surface à modifier." };
  if (!Number.isInteger(v.k) || v.k < 0 || v.k >= s.sommets.length) return { erreur: "Choisissez le sommet de contrôle à modifier." };
  if (![v.x, v.y, v.z].every(Number.isFinite)) return { erreur: "Saisissez la position (x, y, z) du sommet." };
  if (!Number.isInteger(v.niveau) || v.niveau < 0 || v.niveau > 4) return { erreur: "Saisissez le niveau de subdivision : un entier de 0 à 4." };
  return { commandes: [{ toolId: "studio.surface.modifier", params: { ...s, sommets: s.sommets.map((p, n) => (n === v.k ? { x: v.x, y: v.y, z: v.z } : p)), niveau: v.niveau } }] };
}

export function descriptionSubdivision(s: StudioSurfaceSubdivision, nombre: (v: number) => string): string {
  const fermee = studioVolumeSubdivision(s) !== null;
  return `Surface de subdivision ${s.sommets.length} sommets, ${s.faces.length} faces, niveau ${s.niveau}, ${fermee ? "fermée" : "ouverte"} · aire ${nombre(studioAireSubdivision(s))} m²`;
}
