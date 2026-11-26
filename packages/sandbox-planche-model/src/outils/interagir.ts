/**
 * Outil Interagir (phase 1, lot 1, 26 novembre 2026 ; d'après Interact de SketchUp) — machine pure de l'extension
 * « Composants dynamiques ». Un clic sur un objet déclenche l'action au clic (`surClic`) du composant le plus profond
 * qui en porte une sous le pointeur : ses paramètres passent à la valeur suivante, puis il est redessiné. Un clic = un
 * pas d'historique ; une action en erreur ne change rien et son message s'affiche.
 */
import { cliquerDynamique, definitionInteractive } from "../composants-dynamiques.js";
import type { Id } from "../geometrie-libre.js";
import { contexteSaisie, mesures } from "./commun-formes.js";
import { consigneDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition, VueOutil } from "./machine.js";
import { viser } from "./selection.js";

export const ID_INTERAGIR = "interagir";
export const ERREUR_INTERAGIR_AUCUN = "Cet objet ne réagit pas au clic : aucun composant dynamique avec une action au clic.";

export interface EtatInteragir {
  /** Définition du composant qui réagirait au clic sous le pointeur, ou `null`. */
  readonly survol: Id | null;
  /** Occurrence survolée de plus haut niveau, à surligner. */
  readonly surligne: Id | null;
  readonly erreur: string | null;
}

const initial = (): EtatInteragir => ({ survol: null, surligne: null, erreur: null });

/** Composant interactif sous le pointeur, et l'occurrence à surligner. */
function vise(ctx: ContexteOutil, ev: Extract<EvenementOutil, { genre: "clic" | "survol" }>): { definition: Id | null; surligne: Id | null } {
  const el = viser(ctx.modele, ev.rayon, ev.tolerance);
  if (!el) return { definition: null, surligne: null };
  const definition = definitionInteractive(ctx.modele, el.chemin);
  return { definition, surligne: definition ? (el.chemin[0] ?? null) : null };
}

export const machineInteragir: MachineOutil<EtatInteragir> = {
  id: ID_INTERAGIR,
  initial,

  traiter(etat, ev, ctx): Transition<EtatInteragir> {
    switch (ev.genre) {
      case "survol": {
        const v = vise(ctx, ev);
        return { etat: { survol: v.definition, surligne: v.surligne, erreur: null } };
      }
      case "clic": {
        const v = vise(ctx, ev);
        if (!v.definition) return { etat: { ...etat, erreur: ERREUR_INTERAGIR_AUCUN } };
        if (ctx.lecture) return { etat: { ...etat, erreur: "Lecture seule : l'action au clic modifierait la Planche." } };
        const r = cliquerDynamique(ctx.modele, v.definition);
        if (r.modele === ctx.modele) return { etat: { ...etat, erreur: r.erreurs[0]?.message ?? ERREUR_INTERAGIR_AUCUN } };
        return { etat: { ...etat, erreur: r.erreurs[0]?.message ?? null }, modele: r.modele, selection: ctx.selection, operation: "Interagir" };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par l'outil Interagir." } };
      case "echap":
        return { etat: { ...etat, erreur: null } };
      default:
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    return vueModif({ consigne: consigneDe(ID_INTERAGIR, 0), mesures: mesures("Mesures", "", contexteSaisie("aucune", ctx)), survol: etat.surligne ? [etat.surligne] : [], ctx, erreur: etat.erreur });
  },
};

export const MACHINES_INTERACTION: readonly MachineOutil<any>[] = [machineInteragir];
