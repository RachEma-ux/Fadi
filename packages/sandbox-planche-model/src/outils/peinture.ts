/**
 * Outils Pot de peinture (`B`) et Prélever la matière (cahier-planche §4.24, §4.25, relevé complements-modification
 * §1) — machines pures.
 *
 * Clic = cette face seule ; Ctrl (maintenu) = faces connectées de même matière ; Maj = toutes les faces de cette
 * matière dans la Planche ; Maj + Ctrl = toutes les faces de cette matière du même objet (géométrie connectée) ;
 * Alt = prélever (l'outil reste). Un objet (groupe / composant) peint de l'extérieur reçoit la matière sur
 * l'occurrence : ses faces sans matière la montrent, une face déjà peinte garde la sienne. Chaque clic = un pas.
 * La matière courante vient du panneau Matériaux (`ctx.materiauCourant`, absent = matière par défaut). Prélever :
 * un clic charge la matière de la face et bascule vers la Peinture.
 */
import { type Id, contexte, entitesConnectees, peindreFaces, peindreFacesPartout, peindreOccurrences } from "../geometrie-libre.js";
import { contexteSaisie, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, viseeElement, vueModif } from "./commun-modif.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Transition, VueOutil } from "./machine.js";
import { cibleDans } from "./selection.js";

export const ID_PEINTURE = "peinture";
export const ID_ECHANTILLON = "echantillon-matiere";

export interface EtatPeinture {
  readonly maj: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly survol: Id | null;
  readonly erreur: string | null;
}

const initial = (): EtatPeinture => ({ maj: false, ctrl: false, alt: false, survol: null, erreur: null });

/** Matière d'une face visée : la sienne, sinon celle de l'objet qui la porte (chemin d'occurrences), sinon défaut. */
export function materiauVise(ctx: ContexteOutil, ev: Extract<EvenementOutil, { genre: "clic" | "survol" }>): { materiau: string | null; face: Id | null } {
  const { el } = viseeElement(ctx, ev);
  if (!el || el.genre !== "face") return { materiau: null, face: null };
  // Face dans son contexte : dernière occurrence du chemin.
  const dans = el.chemin[el.chemin.length - 1];
  const c = contexte(ctx.modele, dans);
  const f = c.faces[el.id];
  if (f?.materiauRecto) return { materiau: f.materiauRecto, face: el.id };
  for (let k = el.chemin.length - 1; k >= 0; k--) {
    const occId = el.chemin[k] as Id;
    const parent = k === 0 ? ctx.modele.racine : contexte(ctx.modele, el.chemin[k - 1]);
    const occ = parent.occurrences[occId];
    if (occ?.materiau) return { materiau: occ.materiau, face: el.id };
  }
  return { materiau: null, face: el.id };
}

function peindre(etat: EtatPeinture, ev: Extract<EvenementOutil, { genre: "clic" }>, ctx: ContexteOutil): Transition<EtatPeinture> {
  const { el, cible } = viseeElement(ctx, ev);
  if (!el || !cible) return { etat: { ...etat, erreur: null } };
  const materiau = ctx.materiauCourant ?? null;
  const o = ctx.dans !== undefined ? { dans: ctx.dans } : {};
  try {
    if (cible.genre === "occurrence") {
      const r = peindreOccurrences(ctx.modele, [cible.id], materiau, o);
      return { etat, modele: r.modele, selection: ctx.selection, operation: "Peindre" };
    }
    if (cible.genre !== "face") return { etat: { ...etat, erreur: "Cliquez sur une face ou un objet à peindre." } };
    const c = contexte(ctx.modele, ctx.dans);
    const f = c.faces[cible.id];
    if (!f) return { etat };
    const actuel = f.materiauRecto;
    let r;
    if (etat.maj && !etat.ctrl) r = peindreFacesPartout(ctx.modele, actuel, materiau);
    else if (etat.ctrl) {
      const connexes = entitesConnectees(ctx.modele, cible.id, o).filter((id) => c.faces[id] && c.faces[id]!.materiauRecto === actuel);
      r = peindreFaces(ctx.modele, connexes.length ? connexes : [cible.id], materiau, o);
    } else r = peindreFaces(ctx.modele, [cible.id], materiau, o);
    return { etat, modele: r.modele, selection: ctx.selection, operation: "Peindre" };
  } catch (err) {
    return { etat: { ...etat, erreur: messageErreur(err) } };
  }
}

export const machinePeinture: MachineOutil<EtatPeinture> = {
  id: ID_PEINTURE,
  initial,

  traiter(etat, ev, ctx): Transition<EtatPeinture> {
    switch (ev.genre) {
      case "survol": {
        const { el, cible } = viseeElement(ctx, ev);
        return { etat: { ...etat, survol: el && cible ? cible.id : null, erreur: null } };
      }
      case "clic": {
        if (etat.alt) {
          const { materiau } = materiauVise(ctx, ev);
          return { etat: { ...etat, erreur: null }, materiauCourant: materiau };
        }
        return peindre(etat, ev, ctx);
      }
      case "touche": {
        const bas = ev.etat === "enfoncee";
        if (ev.touche === "Maj") return { etat: { ...etat, maj: bas } };
        if (ev.touche === "Ctrl") return { etat: { ...etat, ctrl: bas } };
        if (ev.touche === "Alt") return { etat: { ...etat, alt: bas } };
        return { etat };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par le Pot de peinture." } };
      case "echap":
        return { etat: { ...initial(), survol: etat.survol } };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const indice = etat.alt ? 4 : etat.maj && etat.ctrl ? 3 : etat.maj ? 2 : etat.ctrl ? 1 : 0;
    return vueModif({ consigne: consigneDe(ID_PEINTURE, indice), mesures: mesures("Mesures", "", contexteSaisie("aucune", ctx)), survol: etat.survol ? [etat.survol] : [], ctx, erreur: etat.erreur });
  },
};

export interface EtatEchantillon {
  readonly survol: Id | null;
  readonly erreur: string | null;
}

export const machineEchantillon: MachineOutil<EtatEchantillon> = {
  id: ID_ECHANTILLON,
  initial: () => ({ survol: null, erreur: null }),

  traiter(etat, ev, ctx): Transition<EtatEchantillon> {
    switch (ev.genre) {
      case "survol": {
        const { el, cible } = viseeElement(ctx, ev);
        return { etat: { ...etat, survol: el && cible && cible.genre === "face" ? cible.id : null, erreur: null } };
      }
      case "clic": {
        const { materiau, face } = materiauVise(ctx, ev);
        if (!face) return { etat: { ...etat, erreur: "Cliquez sur une face pour prélever sa matière." } };
        return { etat: { ...etat, erreur: null }, materiauCourant: materiau, outil: ID_PEINTURE };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par cet outil." } };
      default:
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    return vueModif({ consigne: consigneDe(ID_ECHANTILLON, 0), mesures: mesures("Mesures", "", contexteSaisie("aucune", ctx)), survol: etat.survol ? [etat.survol] : [], ctx, erreur: etat.erreur });
  },
};

export { cibleDans as _cibleDansPeinture };
