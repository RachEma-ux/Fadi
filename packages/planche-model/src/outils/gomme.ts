/**
 * Outil Gomme (cahier-planche §4.3, relevés outils-dessin §3 et complements-modification §4) — machine pure.
 *
 * Clic sur une arête : l'arête est effacée avec les faces qui en dépendent ; un segment de courbe efface la courbe
 * entière ; clic dans le vide : rien ; un groupe / composant visé est effacé en entier. Glisser : les arêtes survolées
 * sont marquées puis traitées au RELÂCHEMENT, en un seul pas d'annulation. La gomme n'efface jamais une face seule.
 *
 * Modificateurs MAINTENUS (malgré « Toggle », obs) :
 * - Ctrl : adoucir l'arête (attribut `adoucie`, l'arête reste, nombre d'entités inchangé) ;
 * - Maj : masquer (attribut `masquee` ; courbe entière) ;
 * - Alt : réafficher / annuler le lissage, au même endroit, sur une arête invisible (masquée ou adoucie) ;
 * - Ctrl + Maj : retirer de la liste en cours de gommage (instr, nv).
 * Masquer et réafficher sont chacun un pas d'annulation (une transition avec `modele`).
 */
import { type Id, type Modele, type Resultat, aretesDeLaCourbe, contexte, effacerEntites, modifierAretes } from "../geometrie-libre.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { type Cible, cibleDans, etapeCatalogue, mesuresVides, optionsDans, viser } from "./selection.js";

export type ModeGomme = "effacer" | "adoucir" | "masquer" | "reafficher" | "retirer";

export interface EtatGomme {
  readonly maj: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly appui: boolean;
  /** Au moins un glisser depuis l'appui. */
  readonly glisse: boolean;
  /** Entités marquées pendant le glisser (arêtes du contexte ou occurrences). */
  readonly marques: readonly Id[];
  readonly ignorerClic: boolean;
}

export function modeGomme(e: Pick<EtatGomme, "maj" | "ctrl" | "alt">): ModeGomme {
  if (e.ctrl && e.maj) return "retirer";
  if (e.ctrl) return "adoucir";
  if (e.maj) return "masquer";
  if (e.alt) return "reafficher";
  return "effacer";
}

/** Entité visée par la gomme dans le contexte d'édition (arête ou occurrence ; jamais une face). */
function cibleGomme(ctx: ContexteOutil, r: Rayon, tolerance: number, mode: ModeGomme): Cible | null {
  const filtre =
    mode === "reafficher"
      ? (a: { masquee: boolean; adoucie: boolean }) => a.masquee || a.adoucie
      : (a: { masquee: boolean; adoucie: boolean }) => !a.masquee && !a.adoucie;
  const el = viser(ctx.modele, r, tolerance, filtre);
  const c = el ? cibleDans(el, ctx.dans) : null;
  if (!c || c.genre === "face") return null;
  if (c.genre === "occurrence" && mode !== "effacer") return null;
  return c;
}

const OPERATIONS: Readonly<Record<Exclude<ModeGomme, "retirer">, string>> = {
  effacer: "Effacer",
  adoucir: "Adoucir",
  masquer: "Masquer",
  reafficher: "Réafficher",
};

/** Applique le mode aux entités ; null si rien ne change. */
function appliquer(m: Modele, ids: readonly Id[], mode: ModeGomme, ctx: ContexteOutil): { modele: Modele; operation: string } | null {
  if (mode === "retirer" || ids.length === 0) return null;
  const o = optionsDans(ctx);
  const c = contexte(m, ctx.dans);
  const aretes = ids.filter((id) => c.aretes[id]);
  const courbes = [...new Set(aretes.flatMap((a) => aretesDeLaCourbe(m, a, o)))];
  let modele = m;
  let change = false;
  const suivre = (r: Resultat): void => {
    modele = r.modele;
    change ||= r.rapport.crees.length + r.rapport.supprimes.length + r.rapport.modifies.length > 0;
  };
  switch (mode) {
    case "effacer":
      suivre(effacerEntites(m, ids, o));
      break;
    case "adoucir":
      suivre(modifierAretes(m, aretes, { adoucie: true }, o));
      break;
    case "masquer":
      suivre(modifierAretes(m, courbes, { masquee: true }, o));
      break;
    case "reafficher": {
      const masquees = courbes.filter((a) => c.aretes[a]?.masquee);
      const adoucies = aretes.filter((a) => c.aretes[a]?.adoucie);
      suivre(modifierAretes(m, masquees, { masquee: false }, o));
      suivre(modifierAretes(modele, adoucies, { adoucie: false }, o));
      break;
    }
  }
  return change ? { modele, operation: OPERATIONS[mode] } : null;
}

function transitionAppliquee(etat: EtatGomme, ids: readonly Id[], mode: ModeGomme, ctx: ContexteOutil): Transition<EtatGomme> {
  const r = appliquer(ctx.modele, ids, mode, ctx);
  if (!r) return { etat };
  const restants = ctx.selection.filter((id) => !ids.includes(id));
  return {
    etat,
    modele: r.modele,
    operation: r.operation,
    ...(mode === "effacer" && restants.length !== ctx.selection.length ? { selection: restants } : {}),
  };
}

const repos = (e: EtatGomme): EtatGomme => ({ ...e, appui: false, glisse: false, marques: [] });

export const machineGomme: MachineOutil<EtatGomme> = {
  id: "gomme",
  initial: () => ({ maj: false, ctrl: false, alt: false, appui: false, glisse: false, marques: [], ignorerClic: false }),

  traiter(etat, ev: EvenementOutil, ctx): Transition<EtatGomme> {
    switch (ev.genre) {
      case "touche": {
        const bas = ev.etat === "enfoncee";
        if (ev.touche === "Maj") return { etat: { ...etat, maj: bas } };
        if (ev.touche === "Ctrl") return { etat: { ...etat, ctrl: bas } };
        if (ev.touche === "Alt") return { etat: { ...etat, alt: bas } };
        return { etat };
      }
      case "survol":
        return etat.ignorerClic ? { etat: { ...etat, ignorerClic: false } } : { etat };
      case "appui": {
        const mode = modeGomme(etat);
        const c = mode === "retirer" ? null : cibleGomme(ctx, ev.rayon, ev.tolerance, mode);
        return { etat: { ...etat, appui: true, glisse: false, marques: c ? [c.id] : [], ignorerClic: false } };
      }
      case "glisser": {
        if (!etat.appui) return { etat };
        const mode = modeGomme(etat);
        const c = cibleGomme(ctx, ev.rayon, ev.tolerance, mode === "retirer" ? "effacer" : mode);
        let marques = etat.marques;
        if (c && mode === "retirer") marques = marques.filter((x) => x !== c.id);
        else if (c && !marques.includes(c.id)) marques = [...marques, c.id];
        return { etat: { ...etat, glisse: true, marques } };
      }
      case "relache": {
        if (!etat.appui || !etat.glisse) return { etat: repos(etat) };
        const t = transitionAppliquee(repos(etat), etat.marques, modeGomme(etat), ctx);
        return { ...t, etat: { ...t.etat, ignorerClic: true } };
      }
      case "clic": {
        if (etat.ignorerClic) return { etat: { ...etat, ignorerClic: false } };
        const mode = modeGomme(etat);
        const c = mode === "retirer" ? null : cibleGomme(ctx, ev.rayon, ev.tolerance, mode);
        return c ? transitionAppliquee(repos(etat), [c.id], mode, ctx) : { etat: repos(etat) };
      }
      case "echap":
        return { etat: repos(etat) };
      case "saisie":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const repos0 = etapeCatalogue("gomme", 0);
    const mode = modeGomme(etat);
    const rang = mode === "adoucir" ? 1 : mode === "masquer" ? 2 : mode === "reafficher" ? 3 : 0;
    const base = repos0.consigne ?? "";
    let consigne = base;
    if (rang > 0) {
      // Relevé : seule la première phrase change (« Click or drag to hide items. | … »).
      const premiere = etapeCatalogue("gomme", rang).consigne ?? "";
      const reste = base.split(" | ").slice(1);
      consigne = [premiere, ...reste].join(" | ");
    }
    return {
      consigne,
      mesures: mesuresVides(repos0, ctx),
      inference: null,
      apercu: { lignes: [], faces: [] },
      selection: ctx.selection,
      survol: etat.marques,
      erreur: null,
    };
  },
};
