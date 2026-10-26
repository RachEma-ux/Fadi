import { metreEchelle, type MetreEchelle } from "./echelle.js";
import type { StudioArchitectureItem } from "./types.js";
import { lireArchitecture } from "./validation.js";

/**
 * Métré des objets architecturaux (A.4), dérivé des seules valeurs saisies, sans arrondi :
 * - mur : longueur de l'axe, hauteur, volume **brut** = aire exacte de l'emprise (onglets compris) × hauteur ;
 *   déduction = somme des vides des ouvertures **déclarées** sur ce mur (largeur × hauteur × épaisseur du mur, chaque
 *   ouverture tenant dans la partie courante d'un segment, sans chevauchement) ; volume **net** = brut − déduction.
 *   C'est le seul endroit où une déduction existe : elle vient d'une ouverture créée par l'utilisateur, jamais d'un
 *   recouvrement deviné ; aucune autre déduction (jonction, linteau…) n'est faite.
 * - ouverture : surface (largeur × hauteur) et volume du vide déduit de son mur.
 */
export interface QuantiteMur {
  id: string;
  type: "wall";
  layerId?: string;
  longueur: number;
  hauteur: number;
  volumeBrut: number;
  deduction: number;
  volumeNet: number;
  ouvertures: number;
}
export interface QuantiteOuverture {
  id: string;
  type: "opening";
  hostId: string;
  layerId?: string;
  surface: number;
  volumeDeduit: number;
}

/** Échelle d'accès (EX-027) : métré dérivé des saisies (`metreEchelle`), aucune déduction ni masse. */
export interface QuantiteEchelle extends MetreEchelle {
  id: string;
  type: "ladder";
  layerId?: string;
}

export function studioQuantitesArchitecture(items: readonly StudioArchitectureItem[]): (QuantiteMur | QuantiteOuverture | QuantiteEchelle)[] {
  const lue = lireArchitecture(items);
  const out: (QuantiteMur | QuantiteOuverture | QuantiteEchelle)[] = [];
  for (const it of items) {
    if (it.type === "wall") {
      const m = lue.murs.get(it.id)!;
      const brut = m.geometrie.aire * it.height;
      const deduction = m.ouvertures.reduce((s, o) => s + o.ouverture.width * o.ouverture.height * it.thickness, 0);
      out.push({
        id: it.id, type: "wall", ...(it.layerId !== undefined ? { layerId: it.layerId } : {}), longueur: m.geometrie.longueur, hauteur: it.height,
        volumeBrut: brut, deduction, volumeNet: brut - deduction, ouvertures: m.ouvertures.length,
      });
    } else if (it.type === "ladder") {
      out.push({ id: it.id, type: "ladder", ...(it.layerId !== undefined ? { layerId: it.layerId } : {}), ...metreEchelle(it) });
    } else {
      const hote = lue.murs.get(it.hostId)!.mur;
      out.push({
        id: it.id, type: "opening", hostId: it.hostId, ...(hote.layerId !== undefined ? { layerId: hote.layerId } : {}),
        surface: it.width * it.height, volumeDeduit: it.width * it.height * hote.thickness,
      });
    }
  }
  return out;
}
