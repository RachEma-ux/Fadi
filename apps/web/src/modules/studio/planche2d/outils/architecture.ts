/**
 * Outils au pointeur de la famille Architecture (A.4) :
 * - Mur (W) : deux clics posent l'axe (début, fin) d'un mur droit avec l'épaisseur, la hauteur, la base et la
 *   justification saisies dans le panneau « Architecture » (un axe en plusieurs segments se saisit au clavier) ;
 * - Ouverture (H) : un clic sur un mur crée l'ouverture centrée sur le point désigné, avec la largeur, la hauteur,
 *   l'allège et le type saisis ; si elle ne tient pas dans le mur, le modèle refuse avec son motif (rien n'est rogné).
 * Pur : ni React ni DOM.
 */
import { commandeEchelle, commandeMur, commandeOuverture, PARAMETRES_ARCHITECTURE_VIDES, murSousPoint } from "../architecture/architecture-ui";
import { estSelectionnable } from "../calques";
import { ERREUR_POINTS_CONFONDUS, memePoint, type ActionOutil, type OutilPlanche } from "./type";

const action = (r: ReturnType<typeof commandeMur>): ActionOutil => ("erreur" in r ? { type: "erreur", message: r.erreur } : { type: "commandes", commandes: r.commandes, apres: "fin-trace" });

export const OUTIL_MUR: OutilPlanche = {
  ids: ["studio.architecture.mur"],
  clic(e, p, c) {
    if (memePoint(e.trace.point, p.point)) return { type: "erreur", message: ERREUR_POINTS_CONFONDUS };
    return action(commandeMur(c, [e.trace.point, p.point], (c.architecture ?? PARAMETRES_ARCHITECTURE_VIDES).mur));
  },
  apercu: (e, fin) => (memePoint(e.trace.point, fin) ? null : { id: "apercu-mur", type: "line", start: e.trace.point, end: fin }),
  aideTrace: () => "Début de l’axe placé. Cliquez la fin de l’axe du mur. Échap pour annuler.",
  aideRepos: () => "Mur : cliquez le début puis la fin de l’axe ; épaisseur, hauteur, base et justification se saisissent dans le panneau Architecture.",
};

export const OUTIL_OUVERTURE: OutilPlanche = {
  ids: ["studio.architecture.ouverture"],
  premierClic(p, c) {
    // Seul un mur affiché et déverrouillé peut recevoir une ouverture (un mur masqué n'est jamais désigné).
    const doc = c.document;
    const cible = doc ? murSousPoint(doc, p.point, c.tolerance, (l) => estSelectionnable(doc, l)) : null;
    if (!cible) return { type: "erreur", message: "Cliquez sur un mur : une ouverture n’existe que dans un mur." };
    const o = (c.architecture ?? PARAMETRES_ARCHITECTURE_VIDES).ouverture;
    return action(commandeOuverture(c, cible.mur.id, cible.abscisse - o.largeur / 2, o));
  },
  clic: () => ({ type: "erreur", message: "Cliquez sur un mur." }),
  aideRepos: () => "Ouverture : cliquez sur un mur ; l’ouverture est centrée sur le point désigné, avec les dimensions saisies dans le panneau Architecture.",
};

/**
 * Échelle d'accès (EX-027, Ctrl+Maj+F8) : un clic pose le milieu du pied de l'échelle, avec l'entre-axe, la hauteur,
 * la cote du pied, le nombre d'échelons, la section et l'orientation saisis dans le panneau « Architecture ».
 */
export const OUTIL_ECHELLE: OutilPlanche = {
  ids: ["studio.architecture.echelle-acces"],
  premierClic: (p, c) => action(commandeEchelle(c, p.point, (c.architecture ?? PARAMETRES_ARCHITECTURE_VIDES).echelle)),
  clic: () => ({ type: "erreur", message: "Cliquez le pied de l’échelle." }),
  aideRepos: () => "Échelle d’accès : cliquez le milieu du pied ; entre-axe, hauteur, cote du pied, échelons, section et orientation se saisissent dans le panneau Architecture.",
};
