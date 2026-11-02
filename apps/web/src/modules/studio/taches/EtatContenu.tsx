/**
 * Pastille de fraîcheur d'un contenu dérivé (EX-016) : l'un des cinq états (`etats-contenus.ts`), nommé en clair.
 * `nom` identifie le contenu (métré, feuille, publication) pour les recettes ; `statut` en fait une région annoncée
 * (un seul contenu par panneau ; les listes ne l'annoncent pas à chaque ligne).
 */
import type { EtatContenuAffiche } from "./etats-contenus";

export function EtatContenu({ etat, nom, statut = false }: { etat: EtatContenuAffiche; nom: string; statut?: boolean }) {
  return <span className={`studio-etat-contenu studio-etat-contenu-${etat.etat.etat}`} role={statut ? "status" : undefined}
    data-studio-etat-contenu={nom} data-etat={etat.etat.etat} data-image={etat.etat.image ?? ""} data-coherent={etat.coherent ? "oui" : "non"}>
    {etat.libelle}
  </span>;
}
