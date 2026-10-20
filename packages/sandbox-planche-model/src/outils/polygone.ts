/**
 * Machine Polygone (cahier-planche §4.9, relevé outils-dessin §8) : même fabrique que le Cercle
 * (`creerMachineCirculaire`), avec 6 côtés par défaut (catalogue) et Ctrl = bascule rayon inscrit (jusqu'à un
 * sommet, défaut) / circonscrit (jusqu'au milieu d'un côté, apothème). Le polygone est une seule courbe.
 */
import { type EtatCirculaire, creerMachineCirculaire } from "./cercle.js";
import type { MachineOutil } from "./machine.js";

export const MACHINE_POLYGONE: MachineOutil<EtatCirculaire> = creerMachineCirculaire({ id: "polygone", polygone: true });
