import type { StudioTransformation } from "../transformations.js";
import type { StudioOpening, StudioWall } from "./types.js";

/**
 * Images des objets architecturaux par une similitude de `transformations.ts` (Copier, Rotation, Symétrie, Échelle).
 * Le mur garde son identité de nature : axe transformé point par point (sens de parcours conservé) ; une symétrie
 * renverse l'orientation, donc la justification `left` ↔ `right` pour que le corps reste du même côté de l'image.
 * Les ouvertures suivent leur mur : leur position et leur largeur (longueurs le long de l'axe) sont multipliées par le
 * facteur ; épaisseur, hauteur, base et allège ne changent qu'avec l'échelle « volumes aussi », comme une extrusion.
 * Non revalidé : le gestionnaire de commande valide l'ensemble (une ouverture devenue incompatible refuse le lot).
 */
const pur = (v: number) => (Object.is(v, -0) ? 0 : v);

export function transformerMur(w: StudioWall, t: StudioTransformation, id: string = w.id): StudioWall {
  const k = t.volumes ? t.facteur : 1;
  const justification = t.miroir && w.justification !== "center" ? (w.justification === "left" ? "right" : "left") : w.justification;
  return {
    ...w, id, axis: w.axis.map(t.point), justification,
    thickness: w.thickness * k, height: w.height * k, base: pur(w.base * k),
  };
}

export function transformerOuverture(o: StudioOpening, t: StudioTransformation, id: string = o.id, hostId: string = o.hostId): StudioOpening {
  const k = t.volumes ? t.facteur : 1;
  return { ...o, id, hostId, position: pur(o.position * t.facteur), width: o.width * t.facteur, height: o.height * k, sill: pur(o.sill * k) };
}
