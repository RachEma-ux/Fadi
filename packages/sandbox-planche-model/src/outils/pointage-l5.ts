/**
 * Cas 2 du catalogue, lot 5 (n° 110) — Course solaire depuis un point : un clic dans la vue donne le point
 * d'observation (accroché comme pour les autres outils) ; l'interface trace alors la course solaire et les masques
 * formés par les objets de la Planche. Rien n'est modifié ; l'outil marche aussi en consultation.
 */
import { machinePointage } from "./pointage-l8.js";

export const ID_COURSE_SOLAIRE = "pointage-course-solaire";
export const CONSIGNES_COURSE_SOLAIRE = ["Course solaire : cliquez le point d'observation (une fenêtre, un jardin) ; les objets de la Planche forment les masques."] as const;

export const MACHINE_COURSE_SOLAIRE = machinePointage(ID_COURSE_SOLAIRE, {
  consignes: () => CONSIGNES_COURSE_SOLAIRE,
  fin: (pts) => ({ etat: { points: [], inference: null, erreur: null }, pointObserve: pts[0]!, outil: "selection" }),
});
