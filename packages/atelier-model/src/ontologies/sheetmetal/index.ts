/**
 * Ontologie `sheetmetal` (P2-4, DA-11-01 à 05) : tôle pliée (face de base, plis, paramètres de pliage sourcés) et
 * développé dérivé. Réducteurs purs ; aucune autre ontologie importée ; aucune valeur de pliage dans le code (R3).
 */
import type { ModeleAtelier, Occurrence, OccurrenceQuelconque, PliTole } from "../../modele.js";
import { ErreurCommande, lire, type Reducteur } from "../../commandes/base.js";
import { creerOccurrence, modifierOccurrence, supprimerOccurrence } from "../../commandes/objets.js";
import { developpe, tablePliage, type Developpe } from "./pliage.js";

export const estTole = (o: OccurrenceQuelconque | undefined): o is Occurrence<"tole"> => !!o && o.classe === "tole";

/** Développé d'une tôle du modèle (table de pliage du projet si désignée). */
export function developpeTole(etat: ModeleAtelier, tole: Occurrence<"tole">): Developpe {
  return developpe(tole.params, tablePliage(tole.params, etat.definitions as Record<string, { classe: string; params: Record<string, unknown> }>));
}

export const reducteursTolerie: Record<string, Reducteur> = {
  "tole.creer": (etat, p, ctx) => creerOccurrence(etat, p, ctx, "tole"),
  "tole.modifier": (etat, p, ctx) => modifierOccurrence(etat, p, ctx, "tole"),
  "tole.supprimer": (etat, p, ctx) => supprimerOccurrence(etat, p, ctx, "tole"),
  /** Ajouter ou remplacer le pli d'un bord (DA-11-02) : un pli par bord de la face de base. */
  "tole.plier": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const t = etat.objets[id];
    if (!estTole(t)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une tôle`);
    const pli = p["pli"];
    if (!pli || typeof pli !== "object") throw new ErreurCommande("invalide", "pli", "« pli » : { bord, angle, longueur, rayon? } requis");
    const bord = (pli as { bord?: unknown }).bord;
    const plis = [...t.params.plis.filter((x) => x.bord !== bord), pli as PliTole];
    return modifierOccurrence(etat, { id, params: { plis } }, ctx, "tole");
  },
  "tole.deplier": (etat, p, ctx) => {
    const id = lire.objet(etat, p, "id");
    const t = etat.objets[id];
    if (!estTole(t)) throw new ErreurCommande("precondition", "id", `${id} n'est pas une tôle`);
    const bord = lire.chaine(p, "bord");
    return modifierOccurrence(etat, { id, params: { plis: t.params.plis.filter((x) => x.bord !== bord) } }, ctx, "tole");
  },
};
