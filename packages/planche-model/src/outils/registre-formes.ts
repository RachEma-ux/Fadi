/**
 * Machines des outils de formes (lot 2) : Rectangle, Rectangle pivoté, Cercle, Polygone, Arcs, Secteur.
 * Texte 3D : non livré (décision P-7 en attente, licence des polices).
 */
import { MACHINE_ARC } from "./arc.js";
import { MACHINE_ARC_2_POINTS } from "./arc-2-points.js";
import { MACHINE_ARC_3_POINTS } from "./arc-3-points.js";
import { MACHINE_CERCLE } from "./cercle.js";
import type { MachineOutil } from "./machine.js";
import { MACHINE_POLYGONE } from "./polygone.js";
import { MACHINE_RECTANGLE } from "./rectangle.js";
import { MACHINE_RECTANGLE_PIVOTE } from "./rectangle-pivote.js";
import { MACHINE_SECTEUR } from "./secteur.js";

export const MACHINES_FORMES: readonly MachineOutil<any>[] = [
  MACHINE_RECTANGLE,
  MACHINE_RECTANGLE_PIVOTE,
  MACHINE_CERCLE,
  MACHINE_POLYGONE,
  MACHINE_ARC,
  MACHINE_ARC_2_POINTS,
  MACHINE_ARC_3_POINTS,
  MACHINE_SECTEUR,
];
