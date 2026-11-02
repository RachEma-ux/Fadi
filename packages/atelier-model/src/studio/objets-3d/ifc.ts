import { ref, refs, studioStepString, type IfcConstruit, type IfcContexte } from "../exporteurs/ifc-step.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { directionUnitaire, estDroit, studioVecteurSolide, type StudioLienSolide, type StudioSolid } from "./solides.js";

/**
 * Écriture IFC d'un solide libre : `IfcBuildingElementProxy` de type prédéfini `.NOTDEFINED.` — jamais un mur, une dalle
 * ni un poteau deviné d'après la forme (A.3-09). Placement : origine du solide, axe x local tourné de la rotation autour
 * de z. Représentation `SweptSolid` : `IfcExtrudedAreaSolid` d'un `IfcRectangleProfileDef` (boîte, coin à l'origine) ou
 * d'un `IfcArbitraryClosedProfileDef` (profil local du prisme), extrudé selon z sur la hauteur saisie — ou selon la
 * direction saisie (lot F1), exprimée dans le repère local du solide comme dans le document. Un prisme lié « à
 * résoudre » garde sa dernière géométrie, et sa description le dit.
 */
export function studioIfcSolide(s: StudioSolid, c: IfcContexte, lien: StudioLienSolide | null = null): IfcConstruit {
  const { origin, rotation } = s.placement;
  // Solide basculé (A.3-03) : axe z et axe x locaux du placement exprimés dans le repère (orientation complète).
  const placement = s.placement.basculement
    ? c.placedAxes(origin.x, origin.y, origin.z, studioVecteurSolide(s.placement, { x: 0, y: 0, z: 1 }), studioVecteurSolide(s.placement, { x: 1, y: 0, z: 0 }))
    : c.placed(origin.x, origin.y, origin.z, Math.cos(rotation), Math.sin(rotation));
  const sens = s.type === "prism" && s.direction && !(estDroit(s) && directionUnitaire(s).z > 0) ? directionUnitaire(s) : undefined;
  const item = s.type === "box" ? c.rectangleSolid(s.width / 2, s.depth / 2, s.width, s.depth, s.height) : c.arbitrarySolid(s.profile, s.height, sens);
  const rep = c.s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([item])})`);
  const base = s.type === "box" ? "Volume libre (boîte)" : "Volume libre (prisme sur profil)";
  const description = lien?.etat === "a-resoudre" ? `${base} — lien à résoudre (${lien.motif})` : base;
  const element = c.s.add(`IFCBUILDINGELEMENTPROXY(${c.gid(s.id)},$,${studioStepString(s.id)},${studioStepString(description)},$,${ref(placement)},${ref(c.shape([rep]))},${studioStepString(s.id)},.NOTDEFINED.)`);
  c.summary.prisms++;
  return { element, item, layerId: s.layerId ?? STUDIO_DEFAULT_LAYER_ID };
}
