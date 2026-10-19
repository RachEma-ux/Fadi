import { ref, refs, studioStepString, type IfcConstruit, type IfcContexte } from "../exporteurs/ifc-step.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import type { StudioSolid } from "./solides.js";

/**
 * Écriture IFC d'un solide libre : `IfcBuildingElementProxy` de type prédéfini `.NOTDEFINED.` — jamais un mur, une dalle
 * ni un poteau deviné d'après la forme (A.3-09). Placement : origine du solide, axe x local tourné de la rotation autour
 * de z. Représentation `SweptSolid` : `IfcExtrudedAreaSolid` d'un `IfcRectangleProfileDef` (boîte, coin à l'origine) ou
 * d'un `IfcArbitraryClosedProfileDef` (profil local du prisme), extrudé selon z sur la hauteur saisie.
 */
export function studioIfcSolide(s: StudioSolid, c: IfcContexte): IfcConstruit {
  const { origin, rotation } = s.placement;
  const placement = c.placed(origin.x, origin.y, origin.z, Math.cos(rotation), Math.sin(rotation));
  const item = s.type === "box" ? c.rectangleSolid(s.width / 2, s.depth / 2, s.width, s.depth, s.height) : c.arbitrarySolid(s.profile, s.height);
  const rep = c.s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([item])})`);
  const description = s.type === "box" ? "Volume libre (boîte)" : "Volume libre (prisme sur profil)";
  const element = c.s.add(`IFCBUILDINGELEMENTPROXY(${c.gid(s.id)},$,${studioStepString(s.id)},${studioStepString(description)},$,${ref(placement)},${ref(c.shape([rep]))},${studioStepString(s.id)},.NOTDEFINED.)`);
  c.summary.prisms++;
  return { element, item, layerId: s.layerId ?? STUDIO_DEFAULT_LAYER_ID };
}
