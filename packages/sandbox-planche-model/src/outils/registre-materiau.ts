/** Machines du lot 5 (Peinture, Prélever la matière, Balise, Texte 3D) et du lot 6 (solides). */
import { machineBalise } from "./balise.js";
import type { MachineOutil } from "./machine.js";
import { machineEchantillon, machinePeinture } from "./peinture.js";
import { MACHINES_SOLIDES } from "./solides.js";
import { machineTexte3D } from "./texte-3d.js";

export const MACHINES_MATERIAU: readonly MachineOutil<any>[] = [machinePeinture, machineEchantillon, machineBalise, machineTexte3D, ...MACHINES_SOLIDES];
