/** Machines des outils de mesure et d'annotation (lot 4) : Mètre, Cotes, Rapporteur, Axes, Texte, Plan de coupe. */
import { machineAxes } from "./axes.js";
import { machineCotation } from "./cotation.js";
import type { MachineOutil } from "./machine.js";
import { machineMetre } from "./metre.js";
import { machinePlanDeCoupe } from "./plan-de-coupe.js";
import { machineRapporteur } from "./rapporteur.js";
import { machineTexte } from "./texte.js";

export const MACHINES_MESURE: readonly MachineOutil<any>[] = [machineMetre, machineCotation, machineRapporteur, machineAxes, machineTexte, machinePlanDeCoupe];
