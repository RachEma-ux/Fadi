/** Machines des outils de modification (lot 3) : Pousser/Tirer, Déplacer, Faire pivoter, Échelle, Décalage, Suivez-moi, Retourner, Diviser. */
import { machineDecalage } from "./decalage.js";
import { machineDeplacer } from "./deplacer.js";
import { machineDiviser } from "./diviser.js";
import { machineEchelle } from "./echelle.js";
import { machinePivoter } from "./faire-pivoter.js";
import type { MachineOutil } from "./machine.js";
import { machinePousserTirer } from "./pousser-tirer.js";
import { machineRetourner } from "./retourner.js";
import { machineSuivezMoi } from "./suivez-moi.js";

export const MACHINES_MODIFICATION: readonly MachineOutil<any>[] = [
  machinePousserTirer,
  machineDeplacer,
  machinePivoter,
  machineEchelle,
  machineDecalage,
  machineSuivezMoi,
  machineRetourner,
  machineDiviser,
];
