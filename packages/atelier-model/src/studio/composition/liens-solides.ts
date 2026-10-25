import { studioPolylinePath } from "../courbes.js";
import type { StudioPoint } from "../noyau/types.js";
import type { StudioShape } from "../objets/formes.js";
import { estSolideLie, validerSolide, type StudioLienSolide, type StudioProfilePrism, type StudioSolid } from "../objets-3d/solides.js";

/**
 * Liens des prismes à leur polyligne source (lot F1 : TEST-006, A.4-02, TR-EX-006). Lecture du document entier
 * (couche de composition) : l'état d'un lien n'est jamais stocké, il est relu de la source à chaque lecture, donc une
 * géométrie périmée n'est jamais présentée comme à jour. Pur : ni React, ni DOM.
 */

/** Emprise en plan dérivée d'une polyligne fermée : origine au premier sommet du contour discrétisé, profil relatif. */
export interface StudioProfilDerive {
  origin: StudioPoint;
  profile: StudioPoint[];
}

/**
 * Profil d'un prisme tiré d'une polyligne fermée (contour discrétisé pour les renflements, relatif à son premier sommet),
 * ou null si la forme n'est pas une polyligne fermée dont le contour fait un profil valide (simple, 3 à 1 024 sommets,
 * sommets consécutifs distincts). Même calcul pour la création (interface) et pour le suivi (modèle) : les deux
 * donnent les mêmes nombres, contrôlés à l'égalité exacte.
 */
export function studioProfilDepuisPolyligne(o: StudioShape | undefined): StudioProfilDerive | null {
  if (!o || o.type !== "polyline" || !o.closed) return null;
  const ring = studioPolylinePath(o);
  const origin = ring[0]!;
  const profile = ring.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));
  try {
    validerSolide({ id: "profil", type: "prism", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, profile, height: 1 }, "profil");
  } catch {
    return null;
  }
  return { origin: { x: origin.x, y: origin.y }, profile };
}

/** L'emprise en plan du prisme est-elle exactement celle dérivée (origine x, y, profil, rotation nulle) ? */
export function studioEmpriseConforme(s: StudioProfilePrism, d: StudioProfilDerive): boolean {
  const o = s.placement.origin;
  return s.placement.rotation === 0 && o.x === d.origin.x && o.y === d.origin.y && s.profile.length === d.profile.length
    && s.profile.every((p, i) => p.x === d.profile[i]!.x && p.y === d.profile[i]!.y);
}

/** État dérivé du lien d'un solide à sa source ; null pour un solide sans source (boîte, prisme saisi). */
export function studioLienSolide(doc: { objects: readonly StudioShape[] }, s: StudioSolid): StudioLienSolide | null {
  if (s.type !== "prism" || !s.source) return null;
  const { objectId, relation } = s.source;
  if (!estSolideLie(s)) return { objectId, relation, etat: "independant" };
  const source = doc.objects.find((o) => o.id === objectId);
  if (!source) return { objectId, relation, etat: "a-resoudre", motif: "source-absente" };
  const d = studioProfilDepuisPolyligne(source);
  if (!d) return { objectId, relation, etat: "a-resoudre", motif: "source-invalide" };
  return studioEmpriseConforme(s, d) ? { objectId, relation, etat: "a-jour" } : { objectId, relation, etat: "a-resoudre", motif: "source-modifiee" };
}

/** Liens de tous les solides du document (ordre du document), solides sans source exclus. */
export function studioLiensSolides(doc: { objects: readonly StudioShape[]; solides?: readonly StudioSolid[] }): { id: string; lien: StudioLienSolide }[] {
  const out: { id: string; lien: StudioLienSolide }[] = [];
  for (const s of doc.solides ?? []) {
    const lien = studioLienSolide(doc, s);
    if (lien) out.push({ id: s.id, lien });
  }
  return out;
}
