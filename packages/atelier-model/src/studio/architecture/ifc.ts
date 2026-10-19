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
 */

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
    for (const o of ouvertures) {
      const { segment: g, s0, ouverture: x } = o;
      const ox = g.a.x + g.d.x * s0, oy = g.a.y + g.d.y * s0, oz = mur.base + x.sill;
      const corps = c.rectangleSolid(x.width / 2, (droite + gauche) / 2, x.width, mur.thickness, x.height);
      const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs([corps])})`);
      const opening = s.add(`IFCOPENINGELEMENT(${c.gid(x.id)},$,${studioStepString(x.id)},$,$,${ref(c.placed(ox, oy, oz, g.d.x, g.d.y))},${ref(c.shape([rep]))},${studioStepString(x.id)},.OPENING.)`);
      s.add(`IFCRELVOIDSELEMENT(${c.gid(`rel-voids|${x.id}`)},$,$,$,${ref(wall)},${ref(opening)})`);
      p.pset(`opening|${x.id}`, "Fadi_StudioOpening", opening, [
        p.prop("StudioId", p.label(x.id)), p.prop("HostId", p.label(mur.id)), p.prop("Position", p.length(x.position)),
        p.prop("Width", p.length(x.width)), p.prop("Height", p.length(x.height)), p.prop("Sill", p.length(x.sill)),
        ...(x.kind ? [p.prop("DeclaredKind", p.label(x.kind))] : []),
      ]);
      res.ouvertures++;
      if (x.kind === "porte" || x.kind === "fenetre") {
        const entite = x.kind === "porte" ? "IFCDOOR" : "IFCWINDOW";
        const remplissage = s.add(`${entite}(${c.gid(`${x.kind}|${x.id}`)},$,${studioStepString(x.id)},$,$,${ref(c.placed(ox, oy, oz, g.d.x, g.d.y))},$,${studioStepString(x.id)},${studioStepReal(x.height)},${studioStepReal(x.width)},.NOTDEFINED.,$,$)`);
        s.add(`IFCRELFILLSELEMENT(${c.gid(`rel-fills|${x.id}`)},$,$,$,${ref(opening)},${ref(remplissage)})`);
        res.remplissages.push(remplissage);
        if (x.kind === "porte") res.portes++;
        else res.fenetres++;
      }
    }
  }
  return res;
}
