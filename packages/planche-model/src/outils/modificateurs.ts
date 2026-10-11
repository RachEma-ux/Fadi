/**
 * Touches de modification frappées seules (lot Planche 9, EX-CMD-04), sans React ni DOM. Un appui sur Maj, Ctrl ou Alt
 * ouvre une frappe en attente ; le relâchement de cette même touche la déclenche seulement si rien ne s'en est servi
 * entre-temps : une autre touche (lettre, chiffre, Tab, autre modificateur — donc Ctrl + Z, Maj + Tab, Maj + chiffre ou
 * AltGr), un geste du pointeur, une perte de focus, un changement d'outil, Échap ou une commande. Aucun seuil de durée.
 * La répétition automatique d'une touche maintenue est ignorée.
 */
import type { ModificateurSeul } from "./machine.js";

const MODIFICATEURS: ReadonlySet<string> = new Set(["Maj", "Ctrl", "Alt"]);

/** Frappe en attente : le modificateur enfoncé, ou rien (aucun, ou déjà consommé). */
export interface EtatFrappeSeule {
  readonly attente: ModificateurSeul | null;
  /** Touches de modification encore enfoncées (pour savoir qu'un second modificateur consomme le premier). */
  readonly tenues: readonly ModificateurSeul[];
}

export const FRAPPE_SEULE_VIDE: EtatFrappeSeule = { attente: null, tenues: [] };

/**
 * Appui sur une touche. `touche` : nom de modificateur (« Maj », « Ctrl », « Alt ») ou n'importe quel autre nom (toute
 * autre touche consomme la frappe en attente). `repetition` : répétition automatique, ignorée.
 */
export function appuiFrappe(e: EtatFrappeSeule, touche: string, repetition = false): EtatFrappeSeule {
  if (repetition) return e;
  if (!MODIFICATEURS.has(touche)) return { ...e, attente: null };
  const t = touche as ModificateurSeul;
  const tenues = e.tenues.includes(t) ? e.tenues : [...e.tenues, t];
  // Un second modificateur pendant qu'un autre est tenu (Ctrl + Alt, AltGr, Maj + Ctrl) : aucune frappe seule.
  return { attente: e.tenues.length === 0 ? t : null, tenues };
}

/** Relâchement d'une touche : la frappe seule de ce modificateur, s'il était encore en attente. */
export function relacheFrappe(e: EtatFrappeSeule, touche: string): { etat: EtatFrappeSeule; seule: ModificateurSeul | null } {
  if (!MODIFICATEURS.has(touche)) return { etat: e, seule: null };
  const t = touche as ModificateurSeul;
  const tenues = e.tenues.filter((x) => x !== t);
  return { etat: { attente: null, tenues }, seule: e.attente === t ? t : null };
}

/** Geste du pointeur, commande, changement d'outil, Échap : la frappe en attente ne déclenchera rien. */
export const consommerFrappe = (e: EtatFrappeSeule): EtatFrappeSeule => (e.attente === null ? e : { ...e, attente: null });

/** Perte de focus : tout est oublié (les touches relâchées hors de la fenêtre ne reviennent pas). */
export const oublierFrappe = (): EtatFrappeSeule => FRAPPE_SEULE_VIDE;
