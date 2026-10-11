/**
 * Outil Profilés depuis arêtes (lot L12, programme D-202 ; statut `fadi` au catalogue) — machine pure.
 *
 * Les arêtes sont présélectionnées (une ou plusieurs chaînes continues) ; la section vient de l'interface
 * (`ContexteOutil.sectionCourante`). Survoler la vue montre l'aperçu calculé par le noyau sur un modèle candidat (rien
 * n'est écrit) ; un clic, Entrée au champ Mesures vide ou le bouton « Poser » posent une pièce par arête, toutes
 * chaînes comprises, en **un seul pas d'historique**. Une longueur tapée règle le décalage des extrémités libres.
 * Options : position centre / extérieur / intérieur (Ctrl seul), rotation de 90° (Alt seul), onglets, fusion des
 * arêtes colinéaires, et (lot L13) « couper après pose » sans onglets — chaque pièce coupée par la précédente.
 */
import { type Id, type Modele, contexte, poserPiecesSurAretes } from "../geometrie-libre.js";
import { ERREUR_COUPE_VIDE, couperParProfil } from "../assemblages.js";
import { geometrieVisible } from "../inference.js";
import { type PositionBoucle, PLACEMENT_DEFAUT, POSITIONS_BOUCLE } from "../profiles.js";
import { analyserSaisie } from "../saisie-vcb.js";
import type { Vec3 } from "../vecteur.js";
import { messageErreur } from "./commun-formes.js";
import { saisieDe, selectionValide, vueModif } from "./commun-modif.js";
import { ERREUR_SANS_SECTION } from "./profile.js";
import type { ContexteOutil, MachineOutil, ModificateurSeul, OptionOutil, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_PROFILES_ARETES = "profiles-aretes";
export const ERREUR_SANS_ARETES = "Présélectionnez les arêtes qui recevront les pièces (une ou plusieurs chaînes continues).";
export const CONSIGNE_PROFILES_ARETES = "Cliquez dans la vue (ou « Poser ») pour poser une pièce sur chaque arête sélectionnée.";

export interface EtatProfilesAretes {
  readonly position: PositionBoucle;
  readonly rotation90: boolean;
  readonly onglets: boolean;
  readonly fusion: boolean;
  /** (Lot L13) Sans onglets : chaque pièce est coupée par la précédente (coupe par profil, moteur booléen). */
  readonly coupe: boolean;
  /** Décalage signé des extrémités libres (m). */
  readonly decalage: number;
  readonly erreur: string | null;
  /** Aperçu (faces monde) et la clé de ce qui l'a produit (sélection, section, options). */
  readonly apercu: { readonly cle: string; readonly faces: readonly (readonly Vec3[])[]; readonly trous: readonly (readonly (readonly Vec3[])[])[] } | null;
}

/** Chaînes : composantes connexes des arêtes sélectionnées (le noyau refuse une chaîne qui se ramifie). */
function chaines(ctx: ContexteOutil): Id[][] {
  const c = contexte(ctx.modele, ctx.dans);
  const ids = selectionValide(ctx).filter((id) => c.aretes[id]);
  const reste = new Set(ids);
  const r: Id[][] = [];
  while (reste.size) {
    const premier = reste.values().next().value as Id;
    reste.delete(premier);
    const comp = [premier];
    for (let i = 0; i < comp.length; i++) {
      const a = c.aretes[comp[i] as Id]!;
      for (const id of [...reste]) {
        const b = c.aretes[id]!;
        if (b.a === a.a || b.a === a.b || b.b === a.a || b.b === a.b) {
          reste.delete(id);
          comp.push(id);
        }
      }
    }
    r.push(comp);
  }
  return r;
}

/** Chaîne fermée : chaque sommet de ses arêtes est partagé par exactement deux d'entre elles. */
export function chaineFermee(ctx: ContexteOutil, g: readonly Id[]): boolean {
  const c = contexte(ctx.modele, ctx.dans);
  const degre = new Map<Id, number>();
  for (const id of g) {
    const a = c.aretes[id];
    if (!a) return false;
    for (const s of [a.a, a.b]) degre.set(s, (degre.get(s) ?? 0) + 1);
  }
  return [...degre.values()].every((d) => d === 2);
}

const cleDe = (e: EtatProfilesAretes, ctx: ContexteOutil): string =>
  JSON.stringify([selectionValide(ctx), ctx.sectionCourante?.designation ?? null, ctx.sectionCourante?.section ?? null, e.position, e.rotation90, e.onglets, e.fusion, e.coupe, e.decalage]);

/** Pose sur toutes les chaînes, en enchaînant les opérations du noyau : un seul modèle d'arrivée (un pas). */
function poserTout(e: EtatProfilesAretes, ctx: ContexteOutil): { modele: Modele; occurrences: Id[]; crees: Set<Id> } {
  const s = ctx.sectionCourante;
  if (!s) throw new RangeError(ERREUR_SANS_SECTION);
  const groupes = chaines(ctx);
  if (groupes.length === 0) throw new RangeError(ERREUR_SANS_ARETES);
  let m = ctx.modele;
  const occurrences: Id[] = [];
  const crees = new Set<Id>();
  for (const g of groupes) {
    const r = poserPiecesSurAretes(m, g, s.section, { ...PLACEMENT_DEFAUT, rotation90: e.rotation90, decalageDebut: e.decalage, decalageFin: e.decalage, position: e.position }, {
      designation: s.designation,
      source: s.source,
      onglets: e.onglets,
      fusionner: e.fusion,
      ...optionsDans(ctx),
    });
    m = r.modele;
    occurrences.push(...r.occurrences);
    for (const id of r.rapport.crees) crees.add(id);
    // Lot L13 : « couper après pose » (sans onglets) — chaque pièce coupée par la précédente de sa chaîne, la première
    // par la dernière seulement si la chaîne est fermée ; deux pièces qui ne se touchent pas sont laissées telles quelles.
    if (e.coupe && !e.onglets && r.occurrences.length > 1) {
      const occ = r.occurrences;
      const fermee = occ.length >= 3 && chaineFermee(ctx, g);
      for (let k = 0; k < occ.length; k++) {
        const precedente = k === 0 ? occ[occ.length - 1] : occ[k - 1];
        if (k === 0 && !fermee) continue;
        try {
          m = couperParProfil(m, occ[k] as Id, precedente as Id, ctx.booleens, optionsDans(ctx)).modele;
        } catch (err) {
          if (!(err instanceof Error) || err.message !== ERREUR_COUPE_VIDE) throw err;
        }
      }
    }
  }
  return { modele: m, occurrences, crees };
}

function valider(e: EtatProfilesAretes, ctx: ContexteOutil): Transition<EtatProfilesAretes> {
  try {
    const r = poserTout(e, ctx);
    return { etat: { ...e, erreur: null, apercu: null }, modele: r.modele, selection: r.occurrences, operation: "Profilés depuis arêtes" };
  } catch (err) {
    return { etat: { ...e, erreur: messageErreur(err), apercu: null } };
  }
}

function options(e: EtatProfilesAretes): OptionOutil[] {
  return [
    { id: "position", valeur: e.position, valeurs: POSITIONS_BOUCLE.map((id) => ({ id, disponible: true, raccourci: "Ctrl" })) },
    { id: "rotation", valeur: e.rotation90 ? "oui" : "non", valeurs: [{ id: "non", disponible: true, raccourci: "Alt" }, { id: "oui", disponible: true, raccourci: "Alt" }] },
    { id: "onglets", valeur: e.onglets ? "oui" : "non", valeurs: [{ id: "oui", disponible: true }, { id: "non", disponible: true }] },
    { id: "fusion", valeur: e.fusion ? "oui" : "non", valeurs: [{ id: "non", disponible: true }, { id: "oui", disponible: true }] },
    { id: "coupe", valeur: e.coupe ? "oui" : "non", valeurs: [{ id: "non", disponible: true }, { id: "oui", disponible: !e.onglets }] },
  ];
}

export const machineProfilesAretes: MachineOutil<EtatProfilesAretes> = {
  id: ID_PROFILES_ARETES,
  initial: () => ({ position: "centre", rotation90: false, onglets: true, fusion: false, coupe: false, decalage: 0, erreur: null, apercu: null }),

  traiter(etat, ev, ctx): Transition<EtatProfilesAretes> {
    switch (ev.genre) {
      case "survol": {
        if (!ctx.sectionCourante || chaines(ctx).length === 0) return { etat: { ...etat, apercu: null } };
        const cle = cleDe(etat, ctx);
        if (etat.apercu?.cle === cle) return { etat };
        try {
          const r = poserTout(etat, ctx);
          const vues = geometrieVisible(r.modele).faces.filter((f) => r.crees.has(f.id));
          return { etat: { ...etat, erreur: null, apercu: { cle, faces: vues.map((f) => f.exterieur), trous: vues.map((f) => f.trous) } } };
        } catch (err) {
          return { etat: { ...etat, erreur: messageErreur(err), apercu: { cle, faces: [], trous: [] } } };
        }
      }
      case "clic":
        return valider(etat, ctx);
      case "saisie": {
        if (ev.texte.trim() === "") return valider(etat, ctx);
        const res = analyserSaisie(ev.texte, saisieDe("longueur", ctx));
        if (res.genre !== "longueur") return { etat: { ...etat, erreur: res.genre === "erreur" ? res.message : "Tapez le décalage des extrémités (ex. 0,05 ou -0,05)." } };
        return { etat: { ...etat, decalage: res.valeur, erreur: null, apercu: null } };
      }
      case "echap":
        return { etat: { ...etat, erreur: null, apercu: null }, selection: [] };
      default:
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatProfilesAretes> {
    if (option === "position" && (POSITIONS_BOUCLE as readonly string[]).includes(valeur)) return { etat: { ...etat, position: valeur as PositionBoucle, apercu: null } };
    if ((option === "rotation" || option === "onglets" || option === "fusion" || option === "coupe") && (valeur === "oui" || valeur === "non")) {
      const v = valeur === "oui";
      const champ = option === "rotation" ? { rotation90: v } : option === "onglets" ? { onglets: v, ...(v ? { coupe: false } : {}) } : option === "fusion" ? { fusion: v } : { coupe: v && !etat.onglets };
      return { etat: { ...etat, ...champ, apercu: null } };
    }
    return { etat };
  },

  modificateurSeul(etat, touche: ModificateurSeul): Transition<EtatProfilesAretes> {
    if (touche === "Ctrl") return { etat: { ...etat, position: POSITIONS_BOUCLE[(POSITIONS_BOUCLE.indexOf(etat.position) + 1) % POSITIONS_BOUCLE.length] as PositionBoucle, apercu: null } };
    if (touche === "Alt") return { etat: { ...etat, rotation90: !etat.rotation90, apercu: null } };
    return { etat };
  },

  vue(etat, ctx): VueOutil {
    const s = ctx.sectionCourante;
    const n = chaines(ctx).flat().length;
    const consigne = !s ? ERREUR_SANS_SECTION : n === 0 ? ERREUR_SANS_ARETES : `${CONSIGNE_PROFILES_ARETES} Section : ${s.designation} ; ${n} arête${n > 1 ? "s" : ""}.`;
    const v = vueModif({
      consigne,
      mesures: { libelle: "Décalage des extrémités", valeur: etat.decalage ? String(etat.decalage).replace(".", ctx.separateurDecimal) : "", saisie: saisieDe("longueur", ctx) },
      ctx,
      erreur: etat.erreur,
    });
    return { ...v, options: options(etat), ...(etat.apercu ? { apercu: { ...v.apercu, faces: etat.apercu.faces, trous: etat.apercu.trous, lignes: [...etat.apercu.faces, ...etat.apercu.trous.flat()].map((f) => [...f, f[0] as Vec3]) } } : {}) };
  },
};
