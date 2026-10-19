import { ref, refs, studioStepReal, studioStepString, type IfcConstruit, type IfcContexte } from "../exporteurs/ifc-step.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { lateraux } from "./geometrie.js";
import type { StudioArchitectureItem } from "./types.js";
import { lireArchitecture } from "./validation.js";

/**
 * Écriture IFC des objets architecturaux (A.4), appelée par `exportStudioIfc` quand le document en contient :
 * - mur → `IfcWall` : corps `IfcExtrudedAreaSolid` de son emprise (`IfcArbitraryClosedProfileDef`, onglets compris) à la
 *   cote `base` sur la hauteur saisie, et axe `Curve2D` ; types prédéfinis `.NOTDEFINED.` ;
 * - ouverture → `IfcOpeningElement` (`.OPENING.`, boîte `IfcRectangleProfileDef` largeur × épaisseur du mur, extrudée
 *   sur sa hauteur à partir de l'allège) relié au mur par `IfcRelVoidsElement` ; **seulement** si l'utilisateur a
 *   déclaré son type, un `IfcDoor` (porte) ou un `IfcWindow` (fenêtre) le remplit (`IfcRelFillsElement`), sans corps
 *   propre ; une baie, ou une ouverture sans type déclaré, reste un `IfcOpeningElement` seul.
 * Jeux de propriétés : `Fadi_StudioWall` et `Fadi_StudioOpening` (valeurs saisies seulement).
 *
 * Placements : l'ouverture et son remplissage sont placés **relativement au mur** (`PlacementRelTo` = placement du mur),
 * comme le veut l'usage IFC des éléments hébergés. Le corps de l'ouverture traverse l'épaisseur du mur augmentée de
 * `STUDIO_IFC_DEBORD_OUVERTURE` de chaque côté : débord **technique** (pas une dimension du projet) qui évite les faces
 * confondues au découpage booléen des lecteurs ; les valeurs saisies (largeur, hauteur, épaisseur du mur) restent celles
 * des jeux de propriétés et du métré.
 *
 * Calques masqués : `ObjectsOnHiddenLayers` compte les **murs** d'un calque masqué (éléments à corps portés par un
 * calque) ; les ouvertures, qui suivent le calque de leur mur sans élément de calque propre, n'y sont pas ajoutées —
 * à la différence du rapport de fidélité, qui compte aussi les ouvertures. Les effectifs ne sont pas alignés à dessein.
 */

/** Débord technique du corps d'une ouverture au-delà de chaque face du mur (m), pour le découpage booléen. */
export const STUDIO_IFC_DEBORD_OUVERTURE = 0.001;

export interface IfcOutilsProprietes {
  pset(id: string, name: string, target: number, props: number[]): void;
  prop(name: string, value: string): number;
  length(v: number): string;
  label(v: string): string;
}

export interface IfcArchitecture {
  /** Murs (éléments à corps) : calques et contenance. */
  construits: IfcConstruit[];
  /** Portes et fenêtres déclarées, contenues dans le niveau (sans corps propre). */
  remplissages: number[];
  murs: number;
  ouvertures: number;
  portes: number;
  fenetres: number;
}

export function studioIfcArchitecture(items: readonly StudioArchitectureItem[], c: IfcContexte, p: IfcOutilsProprietes): IfcArchitecture {
  const { s } = c;
  const lue = lireArchitecture(items);
  const res: IfcArchitecture = { construits: [], remplissages: [], murs: 0, ouvertures: 0, portes: 0, fenetres: 0 };
  for (const { mur, geometrie, ouvertures } of lue.murs.values()) {
    const placement = c.placed(0, 0, mur.base);
    const item = c.arbitrarySolid(geometrie.anneau, mur.height);
    const axe = s.add(`IFCPOLYLINE(${refs(mur.axis.map((q) => c.pt2(q.x, q.y)))})`);
    const reps = [
      s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([item])})`),
      s.add(`IFCSHAPEREPRESENTATION(${ref(c.axis)},'Axis','Curve2D',${refs([axe])})`),
    ];
    const wall = s.add(`IFCWALL(${c.gid(mur.id)},$,${studioStepString(mur.id)},$,$,${ref(placement)},${ref(c.shape(reps))},${studioStepString(mur.id)},.NOTDEFINED.)`);
    p.pset(`wall|${mur.id}`, "Fadi_StudioWall", wall, [
      p.prop("StudioId", p.label(mur.id)), p.prop("Thickness", p.length(mur.thickness)), p.prop("Height", p.length(mur.height)),
      p.prop("Base", p.length(mur.base)), p.prop("Justification", p.label(mur.justification)), p.prop("AxisLength", p.length(geometrie.longueur)),
    ]);
    res.construits.push({ element: wall, item, layerId: mur.layerId ?? STUDIO_DEFAULT_LAYER_ID });
    res.murs++;
    const { droite, gauche } = lateraux(mur);
    /** Placement relatif au mur (placé en (0, 0, base), axes du repère local-3d). */
    const relatif = (x: number, y: number, z: number, ux: number, uy: number) => {
      const origine = s.add(`IFCCARTESIANPOINT((${studioStepReal(x)},${studioStepReal(y)},${studioStepReal(z)}))`);
      const axe = s.add(`IFCDIRECTION((${studioStepReal(ux)},${studioStepReal(uy)},0.))`);
      return s.add(`IFCLOCALPLACEMENT(${ref(placement)},${ref(s.add(`IFCAXIS2PLACEMENT3D(${ref(origine)},${ref(c.zAxis)},${ref(axe)})`))})`);
    };
    for (const o of ouvertures) {
      const { segment: g, s0, ouverture: x } = o;
      const ox = g.a.x + g.d.x * s0, oy = g.a.y + g.d.y * s0, oz = x.sill;
      const corps = c.rectangleSolid(x.width / 2, (droite + gauche) / 2, x.width, mur.thickness + 2 * STUDIO_IFC_DEBORD_OUVERTURE, x.height);
      const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([corps])})`);
      const opening = s.add(`IFCOPENINGELEMENT(${c.gid(x.id)},$,${studioStepString(x.id)},$,$,${ref(relatif(ox, oy, oz, g.d.x, g.d.y))},${ref(c.shape([rep]))},${studioStepString(x.id)},.OPENING.)`);
      s.add(`IFCRELVOIDSELEMENT(${c.gid(`rel-voids|${x.id}`)},$,$,$,${ref(wall)},${ref(opening)})`);
      p.pset(`opening|${x.id}`, "Fadi_StudioOpening", opening, [
        p.prop("StudioId", p.label(x.id)), p.prop("HostId", p.label(mur.id)), p.prop("Position", p.length(x.position)),
        p.prop("Width", p.length(x.width)), p.prop("Height", p.length(x.height)), p.prop("Sill", p.length(x.sill)),
        ...(x.kind ? [p.prop("DeclaredKind", p.label(x.kind))] : []),
      ]);
      res.ouvertures++;
      if (x.kind === "porte" || x.kind === "fenetre") {
        const entite = x.kind === "porte" ? "IFCDOOR" : "IFCWINDOW";
        const remplissage = s.add(`${entite}(${c.gid(`${x.kind}|${x.id}`)},$,${studioStepString(x.id)},$,$,${ref(relatif(ox, oy, oz, g.d.x, g.d.y))},$,${studioStepString(x.id)},${studioStepReal(x.height)},${studioStepReal(x.width)},.NOTDEFINED.,$,$)`);
        s.add(`IFCRELFILLSELEMENT(${c.gid(`rel-fills|${x.id}`)},$,$,$,${ref(opening)},${ref(remplissage)})`);
        res.remplissages.push(remplissage);
        if (x.kind === "porte") res.portes++;
        else res.fenetres++;
      }
    }
  }
  return res;
}
