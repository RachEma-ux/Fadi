/** Registre des machines d'états des outils de la Planche. L'id d'une machine = id du catalogue (`catalogue-outils.ts`). */
import type { MachineOutil } from "./machine.js";
import { MACHINES_TRACE } from "./registre-trace.js";
import { MACHINES_FORMES } from "./registre-formes.js";
import { MACHINES_MODIFICATION } from "./registre-modification.js";
import { MACHINES_MESURE } from "./registre-mesure.js";
import { MACHINES_MATERIAU } from "./registre-materiau.js";
import { MACHINES_PROFILES } from "./registre-profiles.js";
import { MACHINES_INTERACTION } from "./interagir.js";
import { MACHINE_OUTIL_EXTENSION, PREFIXE_OUTIL_EXTENSION } from "./outil-extension.js";

export * from "./machine.js";
export { poignees, type Poignee } from "./echelle.js";
export { distanceAuContour } from "./decalage.js";
export { separerDiagnostic, OUTILS_PLAN_VERROUILLABLE } from "./commun-formes.js";
export { modifierPlanDeCoupe, couleurPlan } from "./plan-de-coupe.js";
export { repereDepuis, REPERE_MODELE } from "./axes.js";
export { formaterAire } from "./metre.js";
export { TEXTE_PAR_DEFAUT_ECRAN } from "./texte.js";
export { configurerTexte3D, facesDuTexte3D, planDePose, lireAlignementTexte3D, PLAN_SOL, HAUTEUR_TEXTE_3D, EXTRUSION_TEXTE_3D, type AlignementTexte3D, type PlanTexte3D, type ParametresTexte3D, type EtatTexte3D } from "./texte-3d.js";
export { opererSolides, type OperationSolide, type EtatSolide } from "./solides.js";
export { materiauVise } from "./peinture.js";
export { viser, viserAnnotation, cibleDans, cheminOccurrence, cheminContexte, etendreSelection, type Cible, type ModeSelectionEtendue } from "./selection.js";
export { formaterAire as _formaterAire } from "./metre.js";

export const MACHINES: ReadonlyMap<string, MachineOutil<any>> = new Map(
  [...MACHINES_TRACE, ...MACHINES_FORMES, ...MACHINES_MODIFICATION, ...MACHINES_MESURE, ...MACHINES_MATERIAU, ...MACHINES_PROFILES, ...MACHINES_INTERACTION].map((m) => [m.id, m] as const),
);

export function machineParId(id: string): MachineOutil<any> | undefined {
  // Outil d'une extension installée (lot 6 du protocole) : une seule machine, qui fait le lien avec l'extension.
  return id.startsWith(PREFIXE_OUTIL_EXTENSION) ? MACHINE_OUTIL_EXTENSION : MACHINES.get(id);
}
export * from "./outil-extension.js";
export { ID_INTERAGIR, ERREUR_INTERAGIR_AUCUN, type EtatInteragir } from "./interagir.js";
export { FRAPPE_SEULE_VIDE, appuiFrappe, relacheFrappe, consommerFrappe, oublierFrappe, type EtatFrappeSeule } from "./modificateurs.js";
export { actionExtrusion, type ActionExtrusion, type OperationExtrusion, type OptionExtrusion } from "./pousser-tirer.js";
export { ID_MUR, CONSIGNE_MUR_1, CONSIGNE_MUR_2, ERREUR_SANS_PARAMETRES, ERREUR_DANS_OBJET, MOTIFS_ERREUR_MUR, type EtatMur } from "./mur.js";
export { ID_RESERVE, CONSIGNE_RESERVE, type EtatReserve } from "./reserve.js";
export { ERREUR_SANS_SECTION, CONSIGNE_PROFILE_1, CONSIGNE_PROFILE_2, type EtatProfile } from "./profile.js";
export { ERREUR_SANS_ARETES, CONSIGNE_PROFILES_ARETES, type EtatProfilesAretes } from "./profiles-aretes.js";
