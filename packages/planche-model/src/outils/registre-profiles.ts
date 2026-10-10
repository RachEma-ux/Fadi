/** Registre des outils de la chaîne des profilés (lot L12) : Profilé, Profilés depuis arêtes. */
import type { MachineOutil } from "./machine.js";
import { machineProfile } from "./profile.js";
import { machineProfilesAretes } from "./profiles-aretes.js";

export const MACHINES_PROFILES: readonly MachineOutil<any>[] = [machineProfile, machineProfilesAretes];
