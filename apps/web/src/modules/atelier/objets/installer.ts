/**
 * Installation du module « architecture » (L3a.3) : outils (murs, baies, pièces, dalles, escalier, espaces,
 * zones, niveaux), dessinateurs des classes d'architecture (remplacent le repli de `plan2d/repli.ts`) et
 * descripteurs d'inspecteur. Raccourcis réservés (D-037) : M, P, F, O, S, E.
 */
import type { InstallationModule } from "../socle";
import { DESSINATEURS_OBJETS } from "./dessinateurs";
import { outilDeplacerBaie, outilFenetre, outilOuverture, outilPorte } from "./outils/baies";
import { outilDetecterPieces, outilPiece } from "./outils/pieces";
import { outilJoindreMurs, outilMur, outilScinderMur } from "./outils/murs";

export const installer: InstallationModule = (r) => {
  for (const d of DESSINATEURS_OBJETS) r.dessinateurs.enregistrer(d);
  for (const o of [outilMur(), outilPorte(), outilFenetre(), outilOuverture(), outilPiece(), outilScinderMur(), outilJoindreMurs(), outilDeplacerBaie(), outilDetecterPieces()]) r.outils.enregistrer(o);
};
