/** Registre des outils de la chaîne des profilés (lot L12) : Profilé, Profilés depuis arêtes (L12) ; Onglet, Coupe par profil, Allonger une pièce (L13). */
import type { MachineOutil } from "./machine.js";
import { machineProfile } from "./profile.js";
import { machineProfilesAretes } from "./profiles-aretes.js";
import { machineAllongerPiece, machineCoupeProfil, machineOnglet } from "./assemblages-pieces.js";

export const MACHINES_PROFILES: readonly MachineOutil<any>[] = [machineProfile, machineProfilesAretes, machineOnglet, machineCoupeProfil, machineAllongerPiece];
