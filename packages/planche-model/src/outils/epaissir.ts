/**
 * Outil Épaissir (lot L21, hors V1, D-202 ; outil propre à Fadi) — machine pure.
 *
 * Étape 1 : clic sur une face. Si elle fait partie d'une présélection de faces, toute la présélection est épaissie
 * (surface ouverte faite de plusieurs faces, par exemple les parois d'une Surface ouverte) ; sinon la face seule.
 * Étape 2 : l'épaisseur suit le curseur le long de la normale de la face cliquée (du côté du curseur), ou se tape au champ
 * Mesures (« 0,1 », du côté du curseur ; négatif = de l'autre côté). L'opération ferme la surface en un volume : un pas
 * d'annulation ; une épaisseur retapée juste après corrige (même pas).
 */
import { type Id, contexte, epaissir } from "../geometrie-libre.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, EPS, TOL, add, dist, dot, normalize, scale, sub } from "../vecteur.js";
import { type Derniere, contexteSaisie, corrigeable, formaterLongueur, intersectionRayonPlan, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, distanceLocale, distancesLocales, libelleMesuresDe, selectionValide, vueModif, viseeElement } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_EPAISSIR = "epaissir";

interface ParamsEpaissir {
  readonly faces: readonly Id[];
  /** Épaisseur monde, signée du côté de la normale monde de la face cliquée. */
  readonly epaisseur: number;
  /** Normales monde et locale de la face cliquée, gardées pour la correction tapée (qui rejoue après `retour`, revue de #134). */
  readonly normale?: Vec3;
  readonly normaleLocale?: Vec3;
}

export interface EtatEpaissir {
  readonly etape: 1 | 2;
  readonly faces: readonly Id[];
  /** Face cliquée : point d'appui et normale (monde). */
  readonly origine: Vec3 | null;
  readonly normale: Vec3 | null;
  /** Normale locale de la face cliquée (contexte d'édition), pour ramener l'épaisseur monde au contexte. */
  readonly normaleLocale: Vec3 | null;
  readonly epaisseur: number;
  readonly texte: string | null;
  readonly erreur: string | null;
  readonly derniere: Derniere<ParamsEpaissir> | null;
}

const initial = (): EtatEpaissir => ({ etape: 1, faces: [], origine: null, normale: null, normaleLocale: null, epaisseur: 0, texte: null, erreur: null, derniere: null });
const retour = (e: EtatEpaissir): EtatEpaissir => ({ ...e, etape: 1, faces: [], origine: null, normale: null, normaleLocale: null, epaisseur: 0 });

/** Épaisseur signée visée : projection du point du rayon le plus proche de la droite (origine, normale). */
function epaisseurVisee(e: EtatEpaissir, r: Rayon): number {
  const o = e.origine as Vec3;
  const n = e.normale as Vec3;
  const u = normalize(r.direction);
  const w = sub(r.origine, o);
  const b = dot(u, n);
  const den = 1 - b * b;
  if (Math.abs(den) < 1e-9) {
    const p = intersectionRayonPlan(r, { origine: o, normale: n });
    return p ? dot(sub(p, o), n) : 0;
  }
  return (dot(n, w) - b * dot(u, w)) / den;
}

function appliquer(e: EtatEpaissir, ctx: ContexteOutil, p: ParamsEpaissir, texte: string | null, remplace: Derniere<ParamsEpaissir> | null): Transition<EtatEpaissir> {
  if (Math.abs(p.epaisseur) < EPS) return { etat: { ...e, texte, erreur: "Épaisseur nulle : rien n'a été épaissi." } };
  const base = remplace ? remplace.avant : ctx.modele;
  try {
    const ctxBase = { ...ctx, modele: base };
    const n = p.normale ?? e.normale ?? null;
    const nl = p.normaleLocale ?? e.normaleLocale ?? null;
    // Épaisseur de la face cliquée ramenée au contexte (sens compris), puis la même épaisseur monde pour chaque face le long
    // de sa propre normale (revue de #134 : refus nommé si une face ne garde pas sa normale).
    const cliquee = n && nl ? distanceLocale(ctxBase, n, nl, p.epaisseur) : p.epaisseur;
    const epaisseurs = distancesLocales(ctxBase, p.faces, Math.sign(cliquee) || 1, p.epaisseur);
    const r = epaissir(base, p.faces, epaisseurs, optionsDans(ctx));
    const params: ParamsEpaissir = { ...p, ...(n ? { normale: n } : {}), ...(nl ? { normaleLocale: nl } : {}) };
    return {
      etat: { ...retour(e), texte, erreur: null, derniere: { avant: base, apres: r.modele, params } },
      modele: r.modele,
      selection: [],
      operation: "Épaissir",
      ...(remplace ? { remplaceDernier: true } : {}),
    };
  } catch (err) {
    return { etat: { ...e, texte, erreur: messageErreur(err) } };
  }
}

export const machineEpaissir: MachineOutil<EtatEpaissir> = {
  id: ID_EPAISSIR,
  initial,
  traiter(etat, ev, ctx): Transition<EtatEpaissir> {
    switch (ev.genre) {
      case "survol":
        if (etat.etape !== 2) return { etat: { ...etat, texte: null, erreur: null } };
        return { etat: { ...etat, epaisseur: epaisseurVisee(etat, ev.rayon), texte: null, erreur: null } };
      case "clic": {
        if (etat.etape === 2) return appliquer(etat, ctx, { faces: etat.faces, epaisseur: epaisseurVisee(etat, ev.rayon) }, null, null);
        const { el, cible } = viseeElement(ctx, ev);
        if (!el || el.genre !== "face" || cible?.genre !== "face") return { etat: { ...etat, erreur: "Cliquez une face de la surface à épaissir." } };
        const c = contexte(ctx.modele, ctx.dans);
        const pre = selectionValide(ctx).filter((id) => c.faces[id] !== undefined);
        const faces = pre.includes(cible.id) ? pre : [cible.id];
        const P = intersectionRayonPlan(ev.rayon, { origine: el.exterieur[0] as Vec3, normale: el.normale }) ?? (el.exterieur[0] as Vec3);
        return {
          etat: { ...etat, etape: 2, faces, origine: P, normale: normalize(el.normale), normaleLocale: c.faces[cible.id]?.normale ?? null, epaisseur: 0, texte: null, erreur: null, derniere: null },
          selection: faces,
        };
      }
      case "saisie": {
        const res = analyserSaisie(ev.texte, contexteSaisie("longueur", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, texte: ev.texte, erreur: res.message } };
        if (res.genre !== "longueur") return { etat: { ...etat, texte: ev.texte, erreur: `Saisie « ${ev.texte} » non reconnue.` } };
        if (etat.etape === 2) return appliquer(etat, ctx, { faces: etat.faces, epaisseur: (etat.epaisseur < 0 ? -1 : 1) * res.valeur }, ev.texte, null);
        if (corrigeable(etat.derniere, ctx)) {
          const d = etat.derniere;
          // Revue de #134 : la correction garde le côté de l'opération corrigée ; une valeur négative passe de l'autre côté.
          return appliquer({ ...etat }, ctx, { ...d.params, epaisseur: Math.sign(d.params.epaisseur || 1) * res.valeur }, ev.texte, d);
        }
        return { etat: { ...etat, texte: ev.texte, erreur: "Cliquez d'abord une face de la surface à épaissir." } };
      }
      case "echap":
        return etat.etape === 2 ? { etat: { ...retour(etat), texte: null, erreur: null }, selection: [] } : { etat };
      default:
        return { etat };
    }
  },
  vue(etat, ctx): VueOutil {
    const indice = etat.etape === 2 ? 1 : 0;
    const lignes: Vec3[][] = [];
    if (etat.etape === 2 && etat.origine && etat.normale && Math.abs(etat.epaisseur) > TOL) {
      const fin = add(etat.origine, scale(etat.normale, etat.epaisseur));
      if (dist(fin, etat.origine) > TOL) lignes.push([etat.origine, fin]);
    }
    const valeur = etat.texte ?? (etat.etape === 2 ? `~ ${formaterLongueur(Math.abs(etat.epaisseur), ctx.separateurDecimal)}` : formaterLongueur(0, ctx.separateurDecimal));
    return vueModif({
      consigne: consigneDe(ID_EPAISSIR, indice),
      mesures: mesures(libelleMesuresDe(ID_EPAISSIR, indice), valeur, contexteSaisie("longueur", ctx)),
      apercu: { lignes, faces: [] },
      ctx,
      erreur: etat.erreur,
    });
  },
};
