/**
 * Noms des grandeurs du métré Studio, leurs unités et leurs natures (E.3-04 / E.3-05). Pur, sans aucun import : c'est le
 * vocabulaire du métré, que lisent à la fois le métré du document (`../quantites.ts`, qui le réexporte à l'identique) et
 * les exigences (`../exigences/exigences.ts`). Le placer ici évite que les exigences n'atteignent la composition du
 * document, même indirectement (`quantites.ts` → `document-2d.ts` → `composition/`).
 */

export type GrandeurQuantite = "longueur" | "perimetre" | "surface" | "hauteur" | "surface-laterale" | "surface-verticale" | "volume"
  /** A.4 : vides des ouvertures déclarées d'un mur, volume net du mur, surface d'une ouverture. */
  | "volume-deduit" | "volume-net" | "surface-ouverture";
export type UniteQuantite = "m" | "m2" | "m3";

export const GRANDEURS_QUANTITE: readonly GrandeurQuantite[] = Object.freeze(["longueur", "perimetre", "surface", "hauteur", "surface-laterale", "surface-verticale", "volume", "volume-deduit", "volume-net", "surface-ouverture"] as const);
export const UNITE_GRANDEUR: Readonly<Record<GrandeurQuantite, UniteQuantite>> = Object.freeze({
  longueur: "m", perimetre: "m", surface: "m2", hauteur: "m", "surface-laterale": "m2", "surface-verticale": "m2", volume: "m3",
  "volume-deduit": "m3", "volume-net": "m3", "surface-ouverture": "m2",
});
/** Une hauteur ne s'additionne pas : elle n'entre dans aucun total. */
export const GRANDEUR_CUMULABLE: Readonly<Record<GrandeurQuantite, boolean>> = Object.freeze({
  longueur: true, perimetre: true, surface: true, hauteur: false, "surface-laterale": true, "surface-verticale": true, volume: true,
  "volume-deduit": true, "volume-net": true, "surface-ouverture": true,
});

/**
 * Nature métrée d'un objet : `ligne` / `rectangle` non extrudés, `mur` (ligne + épaisseur extrudée), `ligne-extrudee`
 * (sans épaisseur : surface verticale seulement), `prisme` (rectangle extrudé), `cercle` / `cylindre` (cercle extrudé),
 * `arc` / `mur-courbe` (arc + épaisseur) / `arc-extrude` (sans épaisseur : surface verticale), `polyligne-ouverte` /
 * `polyligne-ouverte-extrudee` (surface verticale), `polyligne-fermee` / `prisme-polyligne`, `non-pris-en-charge` (type
 * inconnu).
 */
export type NatureQuantite =
  | "ligne" | "rectangle" | "mur" | "ligne-extrudee" | "prisme"
  | "cercle" | "cylindre" | "arc" | "mur-courbe" | "arc-extrude"
  | "polyligne-ouverte" | "polyligne-ouverte-extrudee" | "polyligne-fermee" | "prisme-polyligne"
  /** A.4 : mur et ouverture créés comme tels (`architecture`). */
  | "mur-architectural" | "ouverture"
  /** EX-027 (lot G2) : échelle d’accès (longueur cumulée des montants et des échelons, hauteur, volume de matière). */
  | "echelle-acces"
  | "non-pris-en-charge";
