/**
 * Outils de modification (famille Modification) : Déplacer au pointeur (point de base puis destination, accroché hors
 * sélection) ; aide de Décaler (saisie de la distance, sans pointeur).
 */
import { AIDE_DEFAUT, ecart, type OutilPlanche } from "./type";

export const OUTIL_DEPLACER: OutilPlanche = {
  ids: ["studio.dessin.deplacer"],
  horsSelection: true,
  clic(e, p) {
    const a = e.trace.point, b = p.point;
    return { type: "deplacer", dx: ecart(a.x, b.x), dy: ecart(a.y, b.y) };
  },
  aideTrace: () => "Point de base placé. Cliquez la destination. Échap pour annuler.",
  aideRepos: (e) => (e.moveWithPointer ? "Cliquez un point de base puis sa destination, ou saisissez le déplacement." : AIDE_DEFAUT),
};

export const AIDE_DECALER = "Sélectionnez un objet, saisissez la distance (positive : à gauche d’une ligne, vers l’extérieur d’une forme fermée, d’un cercle ou d’un arc), puis décalez.";
