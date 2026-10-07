/**
 * Machine Secteur (cahier-planche §4.13, relevé outils-dessin §12) : étapes, consignes et Mesures identiques à
 * l'Arc par le centre (`creerMachineArcCentre`), 12 côtés par défaut ; résultat : secteur fermé (arc + 2 rayons)
 * avec sa face, créée automatiquement.
 */
import { type EtatArcCentre, creerMachineArcCentre } from "./arc.js";
import type { MachineOutil } from "./machine.js";

export const MACHINE_SECTEUR: MachineOutil<EtatArcCentre> = creerMachineArcCentre({ id: "secteur", secteur: true });
