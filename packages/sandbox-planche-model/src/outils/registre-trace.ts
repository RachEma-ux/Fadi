/** Machines des outils de sélection et de tracé linéaire (lot 2) : Sélection, Lasso, Gomme, Ligne, Main levée ; Mur (cas 4, étape 4). */
import type { MachineOutil } from "./machine.js";
import { machineGomme } from "./gomme.js";
import { machineLasso } from "./lasso.js";
import { machineLigne } from "./ligne.js";
import { machineMainLevee } from "./main-levee.js";
import { machineMur } from "./mur.js";
import { machineSelection } from "./selection.js";

export const MACHINES_TRACE: readonly MachineOutil<any>[] = [machineSelection, machineLasso, machineGomme, machineLigne, machineMainLevee, machineMur];
