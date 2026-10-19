/**
 * Bascules d'accrochage et de repérage de l'éditeur : chaque mode a sa commande (`raccourcis.ts`, règle d'or : icône,
 * barre et raccourci propres). Correspondance commande ↔ réglage et transitions, pures : ni React ni DOM.
 */
import type { IdCommandeEditeur } from "../raccourcis";
import { MODES_PAR_DEFAUT, pasPolaireSuivant, type ModeAccrochage } from "./moteur";

/** Commande de bascule de chaque mode d'objet (l'extrémité suit « Accrocher aux sommets », qui coupe aussi tous les autres). */
export const COMMANDE_MODE: Readonly<Partial<Record<ModeAccrochage, IdCommandeEditeur>>> = Object.freeze({
  milieu: "accrochage-milieu",
  centre: "accrochage-centre",
  quadrant: "accrochage-quadrant",
  intersection: "accrochage-intersection",
  perpendiculaire: "accrochage-perpendiculaire",
  tangente: "accrochage-tangente",
  proche: "accrochage-proche",
});

export interface EtatBascules {
  modes: ReadonlySet<ModeAccrochage>;
  orthogonal: boolean;
  polaire: boolean;
  pasPolaire: number;
}

export const BASCULES_INITIALES: EtatBascules = Object.freeze({ modes: MODES_PAR_DEFAUT, orthogonal: false, polaire: false, pasPolaire: 45 });

/** État après la commande `id`, ou null si la commande n'est pas une bascule d'accrochage ou de repérage. */
export function basculerAccrochage(etat: EtatBascules, id: IdCommandeEditeur): EtatBascules | null {
  if (id === "reperage-orthogonal") return { ...etat, orthogonal: !etat.orthogonal, polaire: etat.orthogonal ? etat.polaire : false };
  if (id === "reperage-polaire") return { ...etat, polaire: !etat.polaire, orthogonal: etat.polaire ? etat.orthogonal : false };
  if (id === "pas-polaire") return { ...etat, pasPolaire: pasPolaireSuivant(etat.pasPolaire) };
  const mode = (Object.keys(COMMANDE_MODE) as ModeAccrochage[]).find((m) => COMMANDE_MODE[m] === id);
  if (!mode) return null;
  const modes = new Set(etat.modes);
  if (modes.has(mode)) modes.delete(mode); else modes.add(mode);
  return { ...etat, modes };
}

/** État enfoncé des boutons de bascule (barre « Accrochage » et « Repérage »). */
export function basculesActives(etat: EtatBascules): Partial<Record<IdCommandeEditeur, boolean>> {
  const out: Partial<Record<IdCommandeEditeur, boolean>> = { "reperage-orthogonal": etat.orthogonal, "reperage-polaire": etat.polaire };
  for (const [mode, id] of Object.entries(COMMANDE_MODE) as [ModeAccrochage, IdCommandeEditeur][]) out[id] = etat.modes.has(mode);
  return out;
}
