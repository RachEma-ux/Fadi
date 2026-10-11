/**
 * Outils d'assemblage des pièces de profilé (lot L13, D-216 ; statut `fadi` au catalogue) — machines pures.
 *
 * - **Onglet** : « Cliquez la première pièce. » → « Cliquez la seconde pièce. » : les deux pièces sont recoupées par le
 *   plan bissecteur de leurs axes (angles de coupe enregistrés, dérivés) ; un pas.
 * - **Coupe par profil** : « Cliquez la pièce à couper. » → « Cliquez la pièce qui coupe. » : soustraction par le moteur
 *   booléen (manifold-3d) ; la pièce outil reste ; un pas.
 * - **Allonger une pièce** : un clic près d'une extrémité la choisit ; une longueur tapée (signée) l'allonge ou la
 *   raccourcit. Option « Valeur » : saisie, demi-largeur ou demi-hauteur de la section (le clic applique alors aussitôt) ;
 *   option « Sens » + / − (pas Maj). Un pas par allongement.
 */
import { type Id, type Modele, allongerPiece, contexte, demiSectionPiece, ongletPieces } from "../geometrie-libre.js";
import { couperParProfil } from "../assemblages.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { dot, normalize, sub, v3 } from "../vecteur.js";
import { messageErreur } from "./commun-formes.js";
import { enLocal, saisieDe, viseeElement, vueModif } from "./commun-modif.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, OptionOutil, Transition, VueOutil } from "./machine.js";
import { cibleDans, optionsDans, viser } from "./selection.js";

export const ID_ONGLET = "onglet";
export const ID_COUPE_PROFIL = "coupe-profil";
export const ID_ALLONGER_PIECE = "allonger-piece";

const ERREUR_VISER_PIECE = "Cliquez sur une pièce de profilé.";

/**
 * Pièce visée (occurrence du contexte d'édition portant des métadonnées de pièce), ou `null`. L'arête source d'une
 * pièce passe au milieu de sa section, cachée mais dans la tolérance de visée : si la visée ordinaire rend une arête,
 * les faces seules sont visées à nouveau (la pièce devant l'arête l'emporte).
 */
function pieceVisee(ctx: ContexteOutil, ev: Extract<EvenementOutil, { genre: "clic" | "survol" }>): Id | null {
  const estPiece = (id: Id): boolean => {
    const occ = contexte(ctx.modele, ctx.dans).occurrences[id];
    return !!occ && !!ctx.modele.definitions[occ.definition]?.piece;
  };
  const { cible } = viseeElement(ctx, ev);
  if (cible?.genre === "occurrence" && estPiece(cible.id)) return cible.id;
  const el = viser(ctx.modele, ev.rayon, ev.tolerance, () => false);
  const c2 = el ? cibleDans(el, ctx.dans, ctx.chemin) : null;
  return c2?.genre === "occurrence" && estPiece(c2.id) ? c2.id : null;
}

// ————————————————————————————————————————————————————————————— Deux pièces : Onglet, Coupe par profil

export interface EtatDeuxPieces {
  readonly premiere: Id | null;
  readonly survol: Id | null;
  readonly erreur: string | null;
}

function machineDeuxPieces(
  id: string,
  consignes: readonly [string, string],
  operation: string,
  appliquer: (ctx: ContexteOutil, a: Id, b: Id) => Modele,
): MachineOutil<EtatDeuxPieces> {
  return {
    id,
    initial: () => ({ premiere: null, survol: null, erreur: null }),
    traiter(etat, ev, ctx): Transition<EtatDeuxPieces> {
      switch (ev.genre) {
        case "survol":
          return { etat: { ...etat, survol: pieceVisee(ctx, ev) } };
        case "clic": {
          const p = pieceVisee(ctx, ev);
          if (!p) return { etat: { ...etat, erreur: ERREUR_VISER_PIECE } };
          if (!etat.premiere) return { etat: { ...etat, premiere: p, erreur: null }, selection: [p] };
          try {
            const modele = appliquer(ctx, etat.premiere, p);
            return { etat: { premiere: null, survol: null, erreur: null }, modele, selection: [], operation };
          } catch (err) {
            return { etat: { ...etat, erreur: messageErreur(err) } };
          }
        }
        case "echap":
          return { etat: { premiere: null, survol: null, erreur: null }, selection: [] };
        default:
          return { etat };
      }
    },
    vue(etat, ctx): VueOutil {
      return { ...vueModif({ consigne: etat.premiere ? consignes[1] : consignes[0], mesures: null, ctx, erreur: etat.erreur, survol: etat.survol ? [etat.survol] : [] }) };
    },
  };
}

export const CONSIGNES_ONGLET = ["Cliquez la première pièce.", "Cliquez la seconde pièce : les deux sont recoupées en onglet."] as const;
export const CONSIGNES_COUPE_PROFIL = ["Cliquez la pièce à couper.", "Cliquez la pièce qui coupe (elle reste en place)."] as const;

export const machineOnglet = machineDeuxPieces(ID_ONGLET, CONSIGNES_ONGLET, "Onglet", (ctx, a, b) => ongletPieces(ctx.modele, a, b, optionsDans(ctx)).modele);
export const machineCoupeProfil = machineDeuxPieces(ID_COUPE_PROFIL, CONSIGNES_COUPE_PROFIL, "Coupe par profil", (ctx, a, b) => couperParProfil(ctx.modele, a, b, ctx.booleens, optionsDans(ctx)).modele);

// ————————————————————————————————————————————————————————————— Allonger une pièce

export type ValeurAllongement = "saisie" | "demi-largeur" | "demi-hauteur";

export interface EtatAllongerPiece {
  readonly piece: Id | null;
  readonly bout: "debut" | "fin" | null;
  readonly valeur: ValeurAllongement;
  readonly sens: "plus" | "moins";
  readonly survol: Id | null;
  readonly erreur: string | null;
}

export const CONSIGNE_ALLONGER_1 = "Cliquez près de l'extrémité de la pièce à allonger ou raccourcir.";
export const CONSIGNE_ALLONGER_2 = "Tapez l'allongement (négatif pour raccourcir), ou choisissez une demi-section.";

/** Extrémité de la pièce la plus proche du point visé (repère du contexte d'édition). */
function boutVise(ctx: ContexteOutil, piece: Id, ev: Extract<EvenementOutil, { genre: "clic" }>): "debut" | "fin" {
  const c = contexte(ctx.modele, ctx.dans);
  const occ = c.occurrences[piece]!;
  const L = ctx.modele.definitions[occ.definition]!.piece!.longueur;
  const T = occ.transformation;
  const g = (i: number) => T[i] ?? 0;
  const O = v3(g(3), g(7), g(11));
  const x = normalize(v3(g(0), g(4), g(8)));
  // Point du rayon le plus proche de l'axe, ramené dans le contexte, projeté sur l'axe.
  const loc = enLocal(ctx);
  const r0 = loc.point(ev.rayon.origine);
  const rd = normalize(loc.vecteur(ev.rayon.origine, ev.rayon.direction));
  const w = sub(r0, O);
  const b = dot(x, rd);
  const den = 1 - b * b;
  const t = den < 1e-12 ? dot(w, x) : (dot(w, x) - b * dot(w, rd)) / den;
  return t < L / 2 ? "debut" : "fin";
}

function allonger(etat: EtatAllongerPiece, ctx: ContexteOutil, piece: Id, bout: "debut" | "fin", v: number): Transition<EtatAllongerPiece> {
  try {
    const r = allongerPiece(ctx.modele, piece, bout, v, optionsDans(ctx));
    return { etat: { ...etat, piece, bout, erreur: null }, modele: r.modele, selection: [piece], operation: "Allonger une pièce" };
  } catch (err) {
    return { etat: { ...etat, erreur: messageErreur(err) } };
  }
}

function optionsAllonger(e: EtatAllongerPiece): OptionOutil[] {
  return [
    { id: "valeur", valeur: e.valeur, valeurs: [{ id: "saisie", disponible: true }, { id: "demi-largeur", disponible: true }, { id: "demi-hauteur", disponible: true }] },
    { id: "sens", valeur: e.sens, valeurs: [{ id: "plus", disponible: true }, { id: "moins", disponible: true }] },
  ];
}

export const machineAllongerPiece: MachineOutil<EtatAllongerPiece> = {
  id: ID_ALLONGER_PIECE,
  initial: () => ({ piece: null, bout: null, valeur: "saisie", sens: "plus", survol: null, erreur: null }),
  traiter(etat, ev, ctx): Transition<EtatAllongerPiece> {
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, survol: pieceVisee(ctx, ev) } };
      case "clic": {
        const p = pieceVisee(ctx, ev);
        if (!p) return { etat: { ...etat, erreur: ERREUR_VISER_PIECE } };
        const bout = boutVise(ctx, p, ev);
        if (etat.valeur === "saisie") return { etat: { ...etat, piece: p, bout, erreur: null }, selection: [p] };
        try {
          const d = demiSectionPiece(ctx.modele, p, optionsDans(ctx));
          const v = (etat.valeur === "demi-largeur" ? d.largeur : d.hauteur) * (etat.sens === "plus" ? 1 : -1);
          return allonger(etat, ctx, p, bout, v);
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err) } };
        }
      }
      case "saisie": {
        if (!etat.piece || !etat.bout) return { etat: { ...etat, erreur: "Cliquez d'abord près de l'extrémité de la pièce." } };
        const res = analyserSaisie(ev.texte, saisieDe("longueur", ctx));
        if (res.genre !== "longueur") return { etat: { ...etat, erreur: res.genre === "erreur" ? res.message : "Tapez une longueur (ex. 0,1 ou -0,1)." } };
        return allonger(etat, ctx, etat.piece, etat.bout, res.valeur * (etat.sens === "plus" ? 1 : -1));
      }
      case "echap":
        return { etat: { ...etat, piece: null, bout: null, erreur: null }, selection: [] };
      default:
        return { etat };
    }
  },
  configurer(etat, option, valeur): Transition<EtatAllongerPiece> {
    if (option === "valeur" && (valeur === "saisie" || valeur === "demi-largeur" || valeur === "demi-hauteur")) return { etat: { ...etat, valeur } };
    if (option === "sens" && (valeur === "plus" || valeur === "moins")) return { etat: { ...etat, sens: valeur } };
    return { etat };
  },
  vue(etat, ctx): VueOutil {
    const choisie = etat.piece !== null && etat.bout !== null;
    const v = vueModif({
      consigne: choisie ? `${CONSIGNE_ALLONGER_2} (extrémité : ${etat.bout === "debut" ? "début" : "fin"})` : CONSIGNE_ALLONGER_1,
      mesures: choisie ? { libelle: "Allongement", valeur: "", saisie: saisieDe("longueur", ctx) } : null,
      ctx,
      erreur: etat.erreur,
      survol: etat.survol ? [etat.survol] : [],
    });
    return { ...v, options: optionsAllonger(etat) };
  },
};

