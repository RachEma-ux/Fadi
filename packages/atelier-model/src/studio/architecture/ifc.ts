import { ref, refs, studioStepReal, studioStepString, type IfcConstruit, type IfcContexte } from "../exporteurs/ifc-step.js";
import { STUDIO_DEFAULT_LAYER_ID } from "../noyau/limites.js";
import { lateraux } from "./geometrie.js";
import type { StudioArchitectureItem, StudioLadder } from "./types.js";
import { geometrieEchelle } from "./echelle.js";
import { studioSignedArea } from "../courbes.js";
import type { StudioPoint } from "../noyau/types.js";
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
  /**
   * Entité IFC porteuse de chaque objet architectural, par identifiant Studio : `IfcWall` du mur ; `IfcDoor` /
   * `IfcWindow` de l'ouverture dont le type est déclaré, sinon son `IfcOpeningElement` (propriétés déclarées, E.1-01).
   */
  entites: Map<string, number>;
  murs: number;
  ouvertures: number;
  portes: number;
  fenetres: number;
  /** Échelles d'accès (EX-027) écrites en `IfcStair` `.LADDER.`. */
  echelles: number;
}

/**
 * Échelle d'accès (EX-027, lot G2) → `IfcStair` de type prédéfini `.LADDER.` (IFC4X3) : un corps `SweptSolid` qui réunit
 * un `IfcExtrudedAreaSolid` par montant (section carrée saisie, sur la hauteur) et par échelon (même section, placé à la
 * cote de son axe), placé à la cote du pied ; jeu de propriétés `Fadi_StudioLadder` (valeurs saisies et pas dérivé).
 * Le calque est porté par la représentation (`IfcLayeredItem`). Aucune valeur normative n'est écrite.
 */
function ladderIfc(e: StudioLadder, c: IfcContexte, p: IfcOutilsProprietes, res: IfcArchitecture): void {
  const { s } = c;
  const g = geometrieEchelle(e), demi = e.section / 2;
  const profil = (ring: readonly StudioPoint[]) => {
    const r = studioSignedArea(ring) < 0 ? [...ring].reverse() : ring;
    return s.add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${ref(s.add(`IFCPOLYLINE(${refs([...r, r[0]!].map((q) => c.pt2(q.x, q.y)))})`))})`);
  };
  const solide = (ring: readonly StudioPoint[], dz: number, profondeur: number) => {
    const position = s.add(`IFCAXIS2PLACEMENT3D(${ref(s.add(`IFCCARTESIANPOINT((0.,0.,${studioStepReal(dz)}))`))},$,$)`);
    return s.add(`IFCEXTRUDEDAREASOLID(${ref(profil(ring))},${ref(position)},${ref(c.zAxis)},${studioStepReal(profondeur)})`);
  };
  const items = [...g.montants.map((m) => solide(m, 0, e.height)), ...g.cotesEchelons.map((z) => solide(g.echelons, z - e.base - demi, e.section))];
  const rep = s.add(`IFCSHAPEREPRESENTATION(${ref(c.body)},'Body','SweptSolid',${refs(items)})`);
  const stair = s.add(`IFCSTAIR(${c.gid(e.id)},$,${studioStepString(e.id)},$,$,${ref(c.placed(0, 0, e.base))},${ref(c.shape([rep]))},${studioStepString(e.id)},.LADDER.)`);
  p.pset(`ladder|${e.id}`, "Fadi_StudioLadder", stair, [
    p.prop("StudioId", p.label(e.id)), p.prop("Width", p.length(e.width)), p.prop("Height", p.length(e.height)), p.prop("Base", p.length(e.base)),
    p.prop("RungCount", `IFCINTEGER(${e.rungs})`), p.prop("RungSpacing", p.length(g.pas)), p.prop("MemberSection", p.length(e.section)),
  ]);
  res.construits.push({ element: stair, item: rep, layerId: e.layerId ?? STUDIO_DEFAULT_LAYER_ID });
  res.entites.set(e.id, stair);
  res.echelles++;
}

export function studioIfcArchitecture(items: readonly StudioArchitectureItem[], c: IfcContexte, p: IfcOutilsProprietes): IfcArchitecture {
  const { s } = c;
  const lue = lireArchitecture(items);
  const res: IfcArchitecture = { construits: [], remplissages: [], entites: new Map(), murs: 0, ouvertures: 0, portes: 0, fenetres: 0, echelles: 0 };
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
    res.entites.set(mur.id, wall);
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
      res.entites.set(x.id, opening);
      res.ouvertures++;
      if (x.kind === "porte" || x.kind === "fenetre") {
        const entite = x.kind === "porte" ? "IFCDOOR" : "IFCWINDOW";
        const remplissage = s.add(`${entite}(${c.gid(`${x.kind}|${x.id}`)},$,${studioStepString(x.id)},$,$,${ref(relatif(ox, oy, oz, g.d.x, g.d.y))},$,${studioStepString(x.id)},${studioStepReal(x.height)},${studioStepReal(x.width)},.NOTDEFINED.,$,$)`);
        s.add(`IFCRELFILLSELEMENT(${c.gid(`rel-fills|${x.id}`)},$,$,$,${ref(opening)},${ref(remplissage)})`);
        res.remplissages.push(remplissage);
        res.entites.set(x.id, remplissage);
        if (x.kind === "porte") res.portes++;
        else res.fenetres++;
      }
    }
  }
  for (const it of items) if (it.type === "ladder") ladderIfc(it, c, p, res);
  return res;
}
