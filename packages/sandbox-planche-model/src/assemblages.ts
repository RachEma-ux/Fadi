/**
 * Assemblages de pièces de profilé (lot L13) — coupe par profil : une pièce est coupée par le volume d'une autre, par
 * le moteur booléen de maillages injecté (manifold-3d, lot 6, MO-4). La pièce coupée garde son occurrence, sa
 * définition (rendue unique si elle est partagée) et ses métadonnées ; la pièce outil est conservée.
 */
import { type Id, type Modele, ERREUR_PAS_UNE_PIECE, appliquer, contexte, inverserMatrice, matriceMonde, remplacerContenuPiece, type OptionsContexte } from "./geometrie-libre.js";
import { facesDuMaillage, maillageDuSolide, volumeDuMaillage } from "./maillage.js";
import type { AdaptateurBooleens } from "./outils/machine.js";

export const ERREUR_SANS_MOTEUR = "Le moteur booléen (manifold-3d) n'est pas chargé : la coupe par profil est indisponible.";
export const ERREUR_COUPE_VIDE = "Les deux pièces ne se recouvrent pas : rien à couper.";
export const ERREUR_COUPE_TOTALE = "La pièce outil englobe toute la pièce : la coupe ne laisserait rien.";

/** Coupe la pièce `cible` par le volume de la pièce `outil` (un pas) ; l'outil reste en place. */
export function couperParProfil(m: Modele, cible: Id, outil: Id, moteur: AdaptateurBooleens | undefined, o: OptionsContexte = {}): { modele: Modele } {
  if (!moteur) throw new Error(ERREUR_SANS_MOTEUR);
  if (cible === outil) throw new RangeError("Choisissez deux pièces différentes : la pièce à couper, puis la pièce qui coupe.");
  const c = contexte(m, o.dans);
  for (const id of [cible, outil]) {
    const occ = c.occurrences[id];
    if (!occ || !m.definitions[occ.definition]?.piece) throw new RangeError(ERREUR_PAS_UNE_PIECE);
  }
  const A = maillageDuSolide(m, cible);
  const B = maillageDuSolide(m, outil);
  const inter = moteur.intersection(A, B);
  if (inter.triangles.length === 0 || Math.abs(volumeDuMaillage(inter)) < 1e-12) throw new RangeError(ERREUR_COUPE_VIDE);
  const reste = moteur.difference(A, B);
  if (reste.triangles.length === 0 || Math.abs(volumeDuMaillage(reste)) < 1e-12) throw new RangeError(ERREUR_COUPE_TOTALE);
  // Faces du résultat (monde) ramenées dans le repère local de la pièce coupée.
  const M = matriceMonde(m, cible);
  const inv = M ? inverserMatrice(M) : null;
  const { faces } = facesDuMaillage(reste);
  const locales = faces.map((boucles) => boucles.map((b) => b.map((p) => (inv ? appliquer(inv, p) : p))));
  return { modele: remplacerContenuPiece(m, cible, locales, o).modele };
}
