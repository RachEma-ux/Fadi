/** Registre des machines d'états des outils de la Planche. L'id d'une machine = id du catalogue (`catalogue-outils.ts`). */
import type { MachineOutil } from "./machine.js";
import { MACHINES_TRACE } from "./registre-trace.js";
import { MACHINES_FORMES } from "./registre-formes.js";
import { MACHINES_MODIFICATION } from "./registre-modification.js";
import { MACHINES_MESURE } from "./registre-mesure.js";
import { MACHINES_MATERIAU } from "./registre-materiau.js";

export * from "./machine.js";
export { poignees, type Poignee } from "./echelle.js";
export { distanceAuContour } from "./decalage.js";
export { modifierPlanDeCoupe, couleurPlan } from "./plan-de-coupe.js";
export { repereDepuis, REPERE_MODELE } from "./axes.js";
export { formaterAire } from "./metre.js";
export { TEXTE_PAR_DEFAUT_ECRAN } from "./texte.js";
export { configurerTexte3D, facesDuTexte3D, HAUTEUR_TEXTE_3D, EXTRUSION_TEXTE_3D, type ParametresTexte3D, type EtatTexte3D } from "./texte-3d.js";
export { opererSolides, type OperationSolide, type EtatSolide } from "./solides.js";
export { materiauVise } from "./peinture.js";
export { viser, viserAnnotation, cibleDans, cheminOccurrence, etendreSelection, type Cible, type ModeSelectionEtendue } from "./selection.js";
export { formaterAire as _formaterAire } from "./metre.js";

export const MACHINES: ReadonlyMap<string, MachineOutil<any>> = new Map(
  [...MACHINES_TRACE, ...MACHINES_FORMES, ...MACHINES_MODIFICATION, ...MACHINES_MESURE, ...MACHINES_MATERIAU].map((m) => [m.id, m] as const),
);

export function machineParId(id: string): MachineOutil<any> | undefined {
  return MACHINES.get(id);
}
