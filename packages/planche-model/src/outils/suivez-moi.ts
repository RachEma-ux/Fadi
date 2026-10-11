/**
 * Outil Suivez-moi (cahier-planche §4.20, relevé outils-modification §6) — machine pure.
 *
 * Le chemin est PRÉSÉLECTIONNÉ : une face (son périmètre) ou des arêtes continues. « Cliquez sur le profil à
 * extruder » : un clic sur une face — le profil — l'extrude sur tout le chemin, coins à onglet ; l'outil reste actif.
 * Sans présélection le relevé ne décrit que la sélection du chemin « au curseur » (instr, non relevée) : la machine
 * demande alors de présélectionner le chemin (choix Fadi). Le champ Mesures est inactif.
 *
 * Lot 10c (EX-FM-01, EX-PREV-01) : survoler une face candidate calcule le balayage par le noyau sur un modèle candidat
 * (rien n'est écrit) et en montre l'aperçu, trous compris ; un profil refusé l'est dès le survol, avec son motif ; le
 * clic ne valide qu'un aperçu valide. Option « Capuchons » (EX-FM-06) : avec (défaut) ou sans, sur chemin ouvert.
 */
import { type Id, type Modele, contexte, suivezMoi } from "../geometrie-libre.js";
import type { Vec3 } from "../vecteur.js";
import { messageErreur } from "./commun-formes.js";
import { consigneDe, selectionValide, vueModif, viseeElement } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, OptionOutil, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_SUIVEZ_MOI = "suivez-moi";

/** Aperçu calculé par le noyau : faces créées (monde de la racine ou repère du contexte), avec leurs trous. */
export interface ApercuSuivezMoi {
  readonly profil: Id;
  readonly faces: readonly (readonly Vec3[])[];
  readonly trous: readonly (readonly (readonly Vec3[])[])[];
}

export interface EtatSuivezMoi {
  readonly erreur: string | null;
  /** (Lot 10c) Capuchons sur un chemin ouvert. */
  readonly bouchons: boolean;
  /** (Lot 10c) Aperçu du profil survolé, ou `null`. */
  readonly apercu: ApercuSuivezMoi | null;
}

/** Chemin déduit de la présélection : une face, sinon des arêtes. */
function cheminPresélectionné(ctx: ContexteOutil): { face: Id } | { aretes: readonly Id[] } | null {
  const c = contexte(ctx.modele, ctx.dans);
  const ids = selectionValide(ctx);
  const faces = ids.filter((id) => c.faces[id]);
  if (faces.length === 1) return { face: faces[0] as Id };
  const aretes = ids.filter((id) => c.aretes[id]);
  return aretes.length > 0 ? { aretes } : null;
}

export const ERREUR_SANS_CHEMIN = "Présélectionnez d'abord le chemin : une face (son périmètre) ou des arêtes continues.";

/** Balayage candidat : le noyau calcule sur une copie immuable ; seul le rapport sert à l'aperçu. */
function candidat(ctx: ContexteOutil, profil: Id, chemin: { face: Id } | { aretes: readonly Id[] }, bouchons: boolean): { modele: Modele; apercu: ApercuSuivezMoi } {
  const r = suivezMoi(ctx.modele, profil, chemin, { ...optionsDans(ctx), bouchons });
  const c = contexte(r.modele, ctx.dans);
  const pos = (s: Id) => (c.sommets[s] as { position: Vec3 }).position;
  const crees = r.rapport.crees.filter((id) => c.faces[id]);
  return {
    modele: r.modele,
    apercu: { profil, faces: crees.map((id) => c.faces[id]!.exterieur.map(pos)), trous: crees.map((id) => c.faces[id]!.trous.map((b) => b.map(pos))) },
  };
}

function options(e: EtatSuivezMoi): OptionOutil[] {
  return [{ id: "bouchons", valeur: e.bouchons ? "avec" : "sans", valeurs: [{ id: "avec", disponible: true }, { id: "sans", disponible: true }] }];
}

export const machineSuivezMoi: MachineOutil<EtatSuivezMoi> = {
  id: ID_SUIVEZ_MOI,
  initial: () => ({ erreur: null, bouchons: true, apercu: null }),

  traiter(etat, ev, ctx): Transition<EtatSuivezMoi> {
    switch (ev.genre) {
      case "survol": {
        const chemin = cheminPresélectionné(ctx);
        const { el, cible } = viseeElement(ctx, ev);
        if (!chemin || !el || el.genre !== "face" || cible?.genre !== "face" || ("face" in chemin && chemin.face === cible.id)) return { etat: { ...etat, erreur: null, apercu: null } };
        if (etat.apercu?.profil === cible.id) return { etat };
        try {
          return { etat: { ...etat, erreur: null, apercu: candidat(ctx, cible.id, chemin, etat.bouchons).apercu } };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err), apercu: null } };
        }
      }
      case "clic": {
        const chemin = cheminPresélectionné(ctx);
        if (!chemin) return { etat: { ...etat, erreur: ERREUR_SANS_CHEMIN } };
        const { el, cible } = viseeElement(ctx, ev);
        if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { ...etat, erreur: "Cliquez sur la face qui sert de profil." } };
        if ("face" in chemin && chemin.face === cible.id) return { etat: { ...etat, erreur: "Le profil doit être une autre face que le chemin." } };
        try {
          const r = candidat(ctx, cible.id, chemin, etat.bouchons);
          return { etat: { ...etat, erreur: null, apercu: null }, modele: r.modele, selection: [], operation: "Suivez-moi" };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err), apercu: null } };
        }
      }
      case "echap":
        return { etat: { ...etat, erreur: null, apercu: null }, selection: [] };
      default:
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatSuivezMoi> {
    if (option === "bouchons" && (valeur === "avec" || valeur === "sans")) return { etat: { ...etat, bouchons: valeur === "avec", apercu: null, erreur: null } };
    return { etat };
  },

  vue(etat, ctx): VueOutil {
    const v = vueModif({ consigne: consigneDe(ID_SUIVEZ_MOI, 0), mesures: null, ctx, erreur: etat.erreur });
    return {
      ...v,
      options: options(etat),
      ...(etat.apercu ? { apercu: { ...v.apercu, faces: etat.apercu.faces, trous: etat.apercu.trous } } : {}),
    };
  },
};
