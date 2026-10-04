/**
 * Manipulateur 3D (DA-02-17, L3b.1) — module pur : un glisser de la sélection dans la vue 3D devient la commande
 * `transformer.deplacer` du contrat (même commande que l'outil 2D « Déplacer », DA-02-01), dans le plan horizontal.
 * Maj contraint le déplacement à l'axe x ou y dominant. Une baie seule est refusée par le contrat (elle se déplace
 * le long de son mur, outil 2D) : elle est retirée des cibles quand son mur est aussi sélectionné (elle le suit).
 */
import { CLASSES_BAIE, type Commande, type EtatModele, type IdObjet } from "@parcours/atelier-model";
import type { ErreurLisible } from "../socle";

/** En dessous (m), un glisser est un clic : rien n'est écrit. */
export const SEUIL_DEPLACEMENT = 0.01;

const lisible = (objet: string, cause: string, action: string): ErreurLisible => ({ objet, cause, action, message: `${objet} : ${cause} — ${action}` });
const estBaie = (classe: string | undefined) => classe !== undefined && (CLASSES_BAIE as readonly string[]).includes(classe);

/** Vecteur contraint : Maj garde l'axe dominant. */
export function contraindre(dx: number, dy: number, maj: boolean): [number, number] {
  if (!maj) return [dx, dy];
  return Math.abs(dx) >= Math.abs(dy) ? [dx, 0] : [0, dy];
}

export type ResultatManipulateur = { readonly commandes: readonly Commande[]; readonly libelle: string } | { readonly erreur: ErreurLisible } | { readonly rien: true };

export function commandesDeplacement3d(etat: EtatModele, ids: readonly IdObjet[], dx: number, dy: number): ResultatManipulateur {
  if (Math.hypot(dx, dy) < SEUIL_DEPLACEMENT) return { rien: true };
  const presents = ids.filter((id) => etat.objets[id] !== undefined);
  const cibles = presents.filter((id) => !estBaie(etat.objets[id]?.classe));
  if (cibles.length === 0) {
    return { erreur: lisible("Déplacement 3D", presents.length > 0 ? "une baie seule se déplace le long de son mur" : "aucun objet sélectionné", presents.length > 0 ? "utiliser l'outil « Déplacer une baie » dans le plan 2D, ou sélectionner aussi son mur" : "sélectionner un objet") };
  }
  const vecteur = { dx, dy, unit: "m" as const };
  return { commandes: [{ type: "transformer.deplacer", params: { vecteur }, cibles } as unknown as Commande], libelle: cibles.length === 1 ? `Déplacer ${cibles[0]} (3D)` : `Déplacer ${cibles.length} objets (3D)` };
}
