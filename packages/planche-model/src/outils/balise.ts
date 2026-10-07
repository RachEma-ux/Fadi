/**
 * Outil Balise (cahier-planche §4.33, relevé mesure-camera-panneaux §1.7) — machine pure.
 *
 * Sans balise choisie (`ctx.baliseCourante` absent) : « Choisissez ou prélevez une balise pour commencer. » ; avec :
 * un clic sur un objet (groupe / composant) lui applique la balise. Alt (maintenu) = prélever la balise de l'objet
 * cliqué ; Maj = remplacer : tous les objets du contexte qui portent la même balise que l'objet cliqué reçoivent la
 * nouvelle ; Ctrl = toutes les occurrences du composant cliqué (toutes les occurrences de sa définition).
 * Correspondance Fadi (P-9) : une balise est un calque de l'Atelier ; les balises vivent dans
 * `annotations.balises` et la correspondance avec les calques est faite à la persistance (lot 7).
 */
import { type Id, baliserDefinition, baliserOccurrences, contexte } from "../geometrie-libre.js";
import { contexteSaisie, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, viseeElement, vueModif } from "./commun-modif.js";
import type { MachineOutil, Transition, VueOutil } from "./machine.js";

export const ID_BALISE = "balise";

export interface EtatBalise {
  readonly maj: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly survol: Id | null;
  readonly erreur: string | null;
}

const initial = (): EtatBalise => ({ maj: false, ctrl: false, alt: false, survol: null, erreur: null });

export const machineBalise: MachineOutil<EtatBalise> = {
  id: ID_BALISE,
  initial,

  traiter(etat, ev, ctx): Transition<EtatBalise> {
    switch (ev.genre) {
      case "survol": {
        const { el, cible } = viseeElement(ctx, ev);
        return { etat: { ...etat, survol: el && cible && cible.genre === "occurrence" ? cible.id : null, erreur: null } };
      }
      case "clic": {
        const { el, cible } = viseeElement(ctx, ev);
        if (!el || !cible || cible.genre !== "occurrence") return { etat: { ...etat, erreur: "Cliquez sur un objet (groupe ou composant) à baliser." } };
        const c = contexte(ctx.modele, ctx.dans);
        const occ = c.occurrences[cible.id];
        if (!occ) return { etat };
        if (etat.alt) return { etat: { ...etat, erreur: null }, baliseCourante: occ.balise ?? null };
        const balise = ctx.baliseCourante;
        if (!balise) return { etat: { ...etat, erreur: "Choisissez d'abord une balise dans le panneau Balises (ou prélevez-en une avec Alt)." } };
        if (!ctx.modele.annotations?.balises[balise]) return { etat: { ...etat, erreur: "La balise choisie n'existe plus." } };
        const o = ctx.dans !== undefined ? { dans: ctx.dans } : {};
        try {
          let r;
          if (etat.ctrl) r = baliserDefinition(ctx.modele, occ.definition, balise);
          else if (etat.maj) {
            const memes = Object.values(c.occurrences).filter((x) => x.balise === occ.balise).map((x) => x.id);
            r = baliserOccurrences(ctx.modele, memes, balise, o);
          } else r = baliserOccurrences(ctx.modele, [cible.id], balise, o);
          return { etat: { ...etat, erreur: null }, modele: r.modele, selection: ctx.selection, operation: "Baliser" };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err) } };
        }
      }
      case "touche": {
        const bas = ev.etat === "enfoncee";
        if (ev.touche === "Maj") return { etat: { ...etat, maj: bas } };
        if (ev.touche === "Ctrl") return { etat: { ...etat, ctrl: bas } };
        if (ev.touche === "Alt") return { etat: { ...etat, alt: bas } };
        return { etat };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par l'outil Balise." } };
      case "echap":
        return { etat: { ...initial(), survol: etat.survol } };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const consigne = consigneDe(ID_BALISE, ctx.baliseCourante ? 1 : 0);
    return vueModif({ consigne, mesures: mesures(null, "", contexteSaisie("aucune", ctx)), survol: etat.survol ? [etat.survol] : [], ctx, erreur: etat.erreur });
  },
};
