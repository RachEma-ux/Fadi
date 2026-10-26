import { ref, refs, studioStepReal, studioStepString, type IfcConstruit, type IfcContexte } from "../exporteurs/ifc-step.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { studioSignedArea } from "../courbes.js";
import { directionUnitaire, estDroit, type StudioSolid } from "../objets-3d/solides.js";
import type { StudioComposant, StudioOccurrence } from "./composants.js";
import type { IfcOutilsProprietes } from "../architecture/ifc.js";

/**
 * Écriture IFC des composants 3D (lot W3-B) : **type partagé** et occurrences, sans aucune géométrie recopiée.
 * - définition → `IfcBuildingElementProxyType` (`.NOTDEFINED.` : aucune catégorie n'est déduite, A.3-09) portant un
 *   `IfcRepresentationMap` : la représentation `SweptSolid` de ses solides dans le repère local du composant (boîte :
 *   `IfcRectangleProfileDef` ; prisme : `IfcArbitraryClosedProfileDef`, direction saisie comprise), chaque solide à sa
 *   position locale ;
 * - occurrence → `IfcBuildingElementProxy` placé (origine, rotation autour de z) dont le corps est un `IfcMappedItem` de
 *   la représentation partagée (opérateur identité) ; `IfcRelDefinesByType` relie la définition à ses occurrences ;
 * - jeux de propriétés : `Fadi_StudioComponent` (nom, solides) et `Fadi_StudioComponentOccurrence` (définition, placement).
 */
export interface IfcComposants {
  construits: IfcConstruit[];
  entites: Map<string, number>;
  types: number;
  occurrences: number;
}

export function studioIfcComposants(composants: readonly StudioComposant[], occurrences: readonly StudioOccurrence[], c: IfcContexte, p: IfcOutilsProprietes): IfcComposants {
  const { s } = c;
  const res: IfcComposants = { construits: [], entites: new Map(), types: 0, occurrences: 0 };
  const pt3 = (x: number, y: number, z: number) => s.add(`IFCCARTESIANPOINT((${studioStepReal(x)},${studioStepReal(y)},${studioStepReal(z)}))`);
  const dir3 = (x: number, y: number, z: number) => s.add(`IFCDIRECTION((${studioStepReal(x)},${studioStepReal(y)},${studioStepReal(z)}))`);
  /** Solide de définition, à sa position locale (origine et rotation autour de z du solide). */
  const solide = (sol: StudioSolid): number => {
    const { origin, rotation } = sol.placement;
    const position = s.add(`IFCAXIS2PLACEMENT3D(${ref(pt3(origin.x, origin.y, origin.z))},${ref(c.zAxis)},${ref(dir3(Math.cos(rotation), Math.sin(rotation), 0))})`);
    let profil: number;
    if (sol.type === "box") profil = s.add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${ref(s.add(`IFCAXIS2PLACEMENT2D(${ref(c.pt2(sol.width / 2, sol.depth / 2))},$)`))},${studioStepReal(sol.width)},${studioStepReal(sol.depth)})`);
    else {
      const r = studioSignedArea(sol.profile) < 0 ? [...sol.profile].reverse() : sol.profile;
      profil = s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ref(s.add(`IFCPOLYLINE(${refs([...r, r[0]!].map((q) => c.pt2(q.x, q.y)))})`))})`);
    }
    const u = sol.type === "prism" && sol.direction && !(estDroit(sol) && directionUnitaire(sol).z > 0) ? directionUnitaire(sol) : null;
    return s.add(`IFCEXTRUDEDAREASOLID(${ref(profil)},${ref(position)},${ref(u ? dir3(u.x, u.y, u.z) : c.zAxis)},${studioStepReal(sol.height)})`);
  };
  const cartes = new Map<string, number>();
  const types = new Map<string, number>();
  for (const d of composants) {
    const items = d.solides.map(solide);
    const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs(items)})`);
    const origine = s.add(`IFCAXIS2PLACEMENT3D(${ref(pt3(0, 0, 0))},$,$)`);
    const carte = s.add(`IFCREPRESENTATIONMAP(${ref(origine)},${ref(rep)})`);
    // Un objet type porte ses jeux de propriétés par `HasPropertySets` (jamais par `IfcRelDefinesByProperties`).
    const jeu = s.add(`IFCPROPERTYSET(${c.gid(`pset|composant|${d.id}`)},$,'Fadi_StudioComponent',$,${refs([p.prop("StudioId", p.label(d.id)), p.prop("Name", p.label(d.nom)), p.prop("Solids", `IFCINTEGER(${d.solides.length})`)])})`);
    const type = s.add(`IFCBUILDINGELEMENTPROXYTYPE(${c.gid(`composant|${d.id}`)},$,${studioStepString(d.nom)},${studioStepString("Composant Studio (définition partagée)")},$,${refs([jeu])},${refs([carte])},${studioStepString(d.id)},$,.NOTDEFINED.)`);
    cartes.set(d.id, carte);
    types.set(d.id, type);
    res.types++;
  }
  const parType = new Map<string, number[]>();
  for (const o of occurrences) {
    const carte = cartes.get(o.composantId)!;
    const operateur = s.add(`IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,${ref(pt3(0, 0, 0))},$,$)`);
    const item = s.add(`IFCMAPPEDITEM(${ref(carte)},${ref(operateur)})`);
    const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','MappedRepresentation',${refs([item])})`);
    const { origin, rotation } = o.placement;
    const element = s.add(`IFCBUILDINGELEMENTPROXY(${c.gid(o.id)},$,${studioStepString(o.id)},${studioStepString("Occurrence de composant Studio")},$,${ref(c.placed(origin.x, origin.y, origin.z, Math.cos(rotation), Math.sin(rotation)))},${ref(c.shape([rep]))},${studioStepString(o.id)},.NOTDEFINED.)`);
    p.pset(`occurrence|${o.id}`, "Fadi_StudioComponentOccurrence", element, [
      p.prop("StudioId", p.label(o.id)), p.prop("ComponentId", p.label(o.composantId)),
      p.prop("OriginX", p.length(origin.x)), p.prop("OriginY", p.length(origin.y)), p.prop("OriginZ", p.length(origin.z)),
      p.prop("RotationZ", `IFCPLANEANGLEMEASURE(${studioStepReal(rotation)})`),
    ]);
    (parType.get(o.composantId) ?? parType.set(o.composantId, []).get(o.composantId)!).push(element);
    res.construits.push({ element, item, layerId: o.layerId ?? STUDIO_DEFAULT_LAYER_ID, ...(o.niveauId !== undefined ? { niveauId: o.niveauId } : {}) });
    res.entites.set(o.id, element);
    res.occurrences++;
  }
  for (const d of composants) {
    const liees = parType.get(d.id);
    if (liees?.length) s.add(`IFCRELDEFINESBYTYPE(${c.gid(`rel-type|${d.id}`)},$,$,$,${refs(liees)},${ref(types.get(d.id)!)})`);
  }
  return res;
}
