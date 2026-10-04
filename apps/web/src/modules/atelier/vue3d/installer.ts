/**
 * Installation du module « vue 3D » (lot 3b) : outils Pousser / tirer (DA-04-07) et Extruder (DA-04-01). La vue
 * elle-même (`Vue3d.tsx`) est montée par `NouvelAtelier.tsx` comme seconde zone de travail.
 */
import type { InstallationModule } from "../socle";
import { outilExtruder, outilPousser } from "./outils";

export const installer: InstallationModule = (r) => {
  r.outils.enregistrer(outilPousser());
  r.outils.enregistrer(outilExtruder());
};
